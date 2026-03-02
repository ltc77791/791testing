import streamlit as st
import sqlite3
import pandas as pd
import hashlib
import os
from datetime import datetime, timedelta

# === 配置 ===
DB_FILE = 'inventory_v2.db'
TEMPLATE_FILE = 'import_template.xlsx'

# === 1. 数据库与初始化 ===
def get_conn():
    return sqlite3.connect(DB_FILE)

def check_and_migrate_db():
    """数据库自动迁移脚本 (v0.5)"""
    conn = get_conn()
    c = conn.cursor()
    try:
        # 1. 检查 inventory 表是否有 inbound_operator
        c.execute("PRAGMA table_info(inventory)")
        inv_cols = [info[1] for info in c.fetchall()]
        if 'inbound_operator' not in inv_cols:
            c.execute("ALTER TABLE inventory ADD COLUMN inbound_operator TEXT")
            conn.commit()

        # 2. 检查 inventory 表是否有 condition (v0.5 新增：新旧状态)
        if 'condition' not in inv_cols:
            print("正在升级数据库到 v0.5: 添加 condition 字段...")
            # 默认旧数据都视为 "全新"
            c.execute("ALTER TABLE inventory ADD COLUMN condition TEXT DEFAULT '全新'")
            conn.commit()

        # 3. 检查 requests 表
        c.execute("PRAGMA table_info(requests)")
        req_cols = [info[1] for info in c.fetchall()]
        if 'requested_sns' not in req_cols:
            c.execute("ALTER TABLE requests ADD COLUMN requested_sns TEXT")
            conn.commit()
            
    except Exception as e:
        print(f"数据库检查警告: {e}")
    finally:
        conn.close()

def init_system():
    conn = get_conn()
    c = conn.cursor()
    
    # 用户表
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT,
        roles TEXT
    )''')
    
    # 备件类型表
    c.execute('''CREATE TABLE IF NOT EXISTS part_types (
        part_no TEXT PRIMARY KEY,
        part_name TEXT
    )''')
    
    # 实体库存表 (v0.5 新增 condition)
    c.execute('''CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_no TEXT,
        serial_number TEXT UNIQUE,
        subsidiary TEXT,
        warehouse TEXT,
        inbound_time TEXT,
        status INTEGER DEFAULT 0,  -- 0=在库, 1=已出库
        outbound_time TEXT,
        receiver TEXT,
        approver TEXT,
        project_location TEXT,
        inbound_operator TEXT,
        condition TEXT
    )''')
    
    # 申请单表
    c.execute('''CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_no TEXT,
        qty INTEGER,
        project_location TEXT,
        applicant TEXT,
        status TEXT DEFAULT 'pending',
        approved_sns TEXT,
        requested_sns TEXT,
        approver TEXT,
        timestamp TEXT
    )''')
    
    # 系统日志表
    c.execute('''CREATE TABLE IF NOT EXISTS sys_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, 
        action_type TEXT,
        operator TEXT,
        details TEXT,
        timestamp TEXT
    )''')
    
    # 初始化默认 Admin
    c.execute("SELECT * FROM users WHERE username='admin'")
    if not c.fetchone():
        pwd = hashlib.sha256("123456".encode()).hexdigest()
        c.execute("INSERT INTO users VALUES (?,?,?)", ('admin', pwd, 'admin'))
        
    conn.commit()
    conn.close()
    
    # 生成模板 (v0.5 更新模板结构，删除旧模板以重新生成)
    if os.path.exists(TEMPLATE_FILE):
        # 简单检查模板是否过时，如果列不够，删除重置
        try:
            df_check = pd.read_excel(TEMPLATE_FILE)
            if '新旧状态' not in df_check.columns:
                os.remove(TEMPLATE_FILE)
        except: pass

    if not os.path.exists(TEMPLATE_FILE):
        df_template = pd.DataFrame(columns=['备件号', '备件名称', '序列号', '所属子公司', '所在仓库', '新旧状态'])
        df_template.to_excel(TEMPLATE_FILE, index=False)

# === 2. 辅助函数 ===
def hash_pwd(p):
    return hashlib.sha256(p.encode()).hexdigest()

def log_action(category, action, operator, details):
    conn = get_conn()
    try:
        conn.execute("INSERT INTO sys_logs (category, action_type, operator, details, timestamp) VALUES (?,?,?,?,?)",
                     (category, action, operator, str(details), datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
    finally:
        conn.close()

# === 3. 角色功能模块 ===

# --- Admin: 用户管理 ---
def section_admin():
    st.header("🛡️ 用户权限管理 (Admin)")
    
    tab1, tab2, tab3 = st.tabs(["用户列表", "创建用户", "系统日志"])
    
    with tab1:
        conn = get_conn()
        df = pd.read_sql("SELECT username, roles FROM users", conn)
        st.dataframe(df, use_container_width=True)
        
        st.subheader("账号操作")
        col1, col2 = st.columns(2)
        with col1:
            target_user = st.selectbox("选择用户", df['username'])
        with col2:
            action = st.radio("操作类型", ["重置密码(123456)", "删除用户", "修改权限"])
            
        if action == "修改权限":
            new_role_opts = st.multiselect("新权限组", ["admin", "manager"], default=[])
            
        if st.button("执行操作"):
            try:
                if target_user == 'admin' and action == '删除用户':
                    st.error("不能删除初始admin")
                elif action == "重置密码(123456)":
                    conn.execute("UPDATE users SET password=? WHERE username=?", (hash_pwd("123456"), target_user))
                    conn.commit()
                    log_action("UserMgmt", "重置密码", st.session_state.user, f"重置了 {target_user}")
                    st.success("密码已重置")
                elif action == "删除用户":
                    conn.execute("DELETE FROM users WHERE username=?", (target_user,))
                    conn.commit()
                    log_action("UserMgmt", "删除用户", st.session_state.user, f"删除了 {target_user}")
                    st.success("用户已删除")
                    st.rerun()
                elif action == "修改权限":
                    final_role = ",".join(new_role_opts) if new_role_opts else "operator"
                    conn.execute("UPDATE users SET roles=? WHERE username=?", (final_role, target_user))
                    conn.commit()
                    log_action("UserMgmt", "修改权限", st.session_state.user, f"修改 {target_user} 为 {final_role}")
                    st.success("权限已修改")
                    st.rerun()
            finally:
                conn.close()
        else:
            conn.close()

    with tab2:
        new_u = st.text_input("新用户名")
        role_type = st.radio("用户类型", ["Operator (操作员)", "管理层 (Admin/Manager)"])
        
        final_role = ""
        if role_type == "管理层 (Admin/Manager)":
            perms = st.multiselect("授予权限", ["admin", "manager"], default=["manager"])
            if perms:
                final_role = ",".join(perms)
        else:
            final_role = "operator"
            
        if st.button("创建"):
            if not new_u:
                st.error("用户名不能为空")
            elif role_type == "管理层 (Admin/Manager)" and not final_role:
                st.error("管理层必须选择至少一个权限")
            else:
                conn_create = get_conn()
                try:
                    exist = conn_create.execute("SELECT 1 FROM users WHERE username=?", (new_u,)).fetchone()
                    if exist:
                        st.error(f"用户 {new_u} 已存在！")
                    else:
                        conn_create.execute("INSERT INTO users (username, password, roles) VALUES (?,?,?)", 
                                     (new_u, hash_pwd("123456"), final_role))
                        conn_create.commit()
                        log_action("UserMgmt", "创建用户", st.session_state.user, f"创建 {new_u} 权限: {final_role}")
                        st.success(f"用户 {new_u} 创建成功！")
                except Exception as e:
                    st.error(f"系统错误: {e}")
                finally:
                    conn_create.close()

    with tab3:
        conn_log = get_conn()
        logs = pd.read_sql("SELECT * FROM sys_logs WHERE category='UserMgmt' ORDER BY id DESC", conn_log)
        st.dataframe(logs, use_container_width=True)
        conn_log.close()

# --- Manager: 备件管理 ---
def section_manager():
    st.header("📦 备件管理 (Manager)")
    
    # 顶部导航
    task = st.radio("业务流", ["库存查询与日志", "备件入库", "审批出库", "库存编辑", "批量导入/导出"], horizontal=True)
    
    # === 业务1：库存查询与日志 ===
    if task == "库存查询与日志":
        t1, t2, t3, t4 = st.tabs(["当前库存", "入库记录", "出库记录", "编辑历史"])
        
        with t1:
            conn = get_conn()
            # v0.5 显示 condition
            base_query = '''SELECT i.part_no, t.part_name, i.serial_number, i.condition as 新旧, i.subsidiary, i.warehouse, i.inbound_time 
                            FROM inventory i 
                            LEFT JOIN part_types t ON i.part_no = t.part_no
                            WHERE i.status=0'''
            df_inv = pd.read_sql(base_query, conn)
            conn.close()

            if df_inv.empty:
                st.info("当前无库存")
            else:
                c1, c2, c3 = st.columns(3)
                counts = df_inv['part_no'].value_counts()
                part_options = [f"{p} : {counts[p]}" for p in counts.index]
                part_map = {f"{p} : {counts[p]}": p for p in counts.index}
                
                with c1:
                    sel_parts_fmt = st.multiselect("按备件号筛选", part_options)
                    sel_parts = [part_map[x] for x in sel_parts_fmt]
                with c2:
                    sel_subs = st.multiselect("按子公司筛选", df_inv['subsidiary'].dropna().unique())
                with c3:
                    sel_whs = st.multiselect("按仓库筛选", df_inv['warehouse'].dropna().unique())
                
                if sel_parts: df_inv = df_inv[df_inv['part_no'].isin(sel_parts)]
                if sel_subs: df_inv = df_inv[df_inv['subsidiary'].isin(sel_subs)]
                if sel_whs: df_inv = df_inv[df_inv['warehouse'].isin(sel_whs)]
                    
                st.dataframe(df_inv, use_container_width=True)

        with t2:
            three_months_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
            conn = get_conn()
            q = f'''SELECT i.part_no, t.part_name, i.serial_number, i.condition as 新旧, i.inbound_time, i.warehouse, i.subsidiary, i.inbound_operator as 操作员
                    FROM inventory i
                    LEFT JOIN part_types t ON i.part_no = t.part_no
                    WHERE i.inbound_time > '{three_months_ago}'
                    ORDER BY i.inbound_time DESC'''
            df_in = pd.read_sql(q, conn)
            conn.close()
            st.dataframe(df_in, use_container_width=True)

        with t3:
            conn = get_conn()
            q = f'''SELECT r.part_no, t.part_name, r.approved_sns as 序列号, r.status as 状态, r.project_location, r.applicant, r.approver, r.timestamp
                    FROM requests r
                    LEFT JOIN part_types t ON r.part_no = t.part_no
                    WHERE r.timestamp > '{three_months_ago}'
                    ORDER BY r.timestamp DESC'''
            df_out = pd.read_sql(q, conn)
            conn.close()
            
            df_out = df_out.fillna('NA')
            def highlight_status(val):
                color = '#28a745' if val == 'approved' else '#dc3545' if val == 'rejected' else '#ffc107'
                return f'color: {color}; font-weight: bold'
            st.dataframe(df_out.style.applymap(highlight_status, subset=['状态']), use_container_width=True)
            
        with t4:
            conn = get_conn()
            logs = pd.read_sql("SELECT * FROM sys_logs WHERE category='InventoryEdit' ORDER BY id DESC", conn)
            conn.close()
            st.dataframe(logs, use_container_width=True)

    # === 业务2：备件入库 (v0.5 优化：返还逻辑 + 新旧) ===
    elif task == "备件入库":
        st.info("💡 单品入库 (已出库的序列号可直接重新入库)")
        c1, c2 = st.columns(2)
        
        conn_read = get_conn()
        existing_types = pd.read_sql("SELECT part_no, part_name FROM part_types", conn_read)
        conn_read.close()
        
        with c1:
            type_choice = st.selectbox("选择备件类型", ["-- 新建类型 --"] + existing_types['part_no'].tolist())
            p_no, p_name = "", ""
            is_new_type = False
            if type_choice == "-- 新建类型 --":
                p_no = st.text_input("输入新备件号")
                p_name = st.text_input("输入备件名称")
                is_new_type = True
            else:
                p_no = type_choice
                if not existing_types.empty:
                    p_name = existing_types[existing_types['part_no']==p_no]['part_name'].values[0]
                st.text_input("备件名称", value=p_name, disabled=True)
        
        with c2:
            sn = st.text_input("序列号 (唯一)")
            sub = st.text_input("所属子公司")
            wh = st.text_input("所在仓库")
            cond = st.radio("新旧状态", ["全新", "利旧/返还"], horizontal=True)
            
        if st.button("确认入库"):
            if not p_no or not sn:
                st.error("缺失关键信息")
                return
            
            conn_write = get_conn()
            try:
                # 1. 检查序列号是否存在
                exist_rec = conn_write.execute("SELECT id, status FROM inventory WHERE serial_number=?", (sn,)).fetchone()
                
                if exist_rec:
                    # 如果存在
                    if exist_rec[1] == 0: # status=0 在库
                        st.error(f"序列号 {sn} 已在库中，无法重复入库！")
                        conn_write.close()
                        return
                    else:
                        # status=1 已出库 -> 执行返还逻辑 (UPDATE)
                        if is_new_type: 
                            st.warning("序列号已存在，忽略新建类型操作")
                        
                        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        conn_write.execute('''UPDATE inventory SET 
                                           status=0, subsidiary=?, warehouse=?, condition=?, 
                                           inbound_time=?, inbound_operator=?, part_no=?,
                                           outbound_time=NULL, receiver=NULL, approver=NULL, project_location=NULL
                                           WHERE id=?''',
                                           (sub, wh, cond, now_str, st.session_state.user, p_no, exist_rec[0]))
                        conn_write.commit()
                        st.success(f"返还入库成功！SN:{sn} (状态已更新为在库)")
                        log_action("Inbound", "返还入库", st.session_state.user, f"{p_no} SN:{sn} ({cond})")
                else:
                    # 不存在 -> 执行全新入库 (INSERT)
                    if is_new_type:
                        conn_write.execute("INSERT OR IGNORE INTO part_types VALUES (?,?)", (p_no, p_name))
                    
                    conn_write.execute('''INSERT INTO inventory 
                                 (part_no, serial_number, subsidiary, warehouse, inbound_time, status, inbound_operator, condition) 
                                 VALUES (?,?,?,?,?,0,?,?)''', 
                                 (p_no, sn, sub, wh, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, cond))
                    conn_write.commit()
                    st.success(f"全新入库成功 SN:{sn}")
                    if is_new_type:
                        log_action("Inbound", "新建类型", st.session_state.user, f"{p_no}-{p_name}")
                    log_action("Inbound", "入库", st.session_state.user, f"{p_no} SN:{sn} ({cond})")
                    
            except Exception as e:
                st.error(f"操作失败: {e}")
            finally:
                conn_write.close()

    # === 业务3：审批出库 ===
    elif task == "审批出库":
        conn_read = get_conn()
        pending = pd.read_sql("SELECT * FROM requests WHERE status='pending'", conn_read)
        conn_read.close()
        
        if pending.empty:
            st.info("无待审批申请")
        else:
            for idx, row in pending.iterrows():
                req_sn_str = row.get('requested_sns', 'NA')
                
                with st.expander(f"申请 #{row['id']} | {row['applicant']} | {row['part_no']} x {row['qty']}"):
                    st.write(f"**申领地**: {row['project_location']}")
                    st.info(f"**用户预选序列号**: {req_sn_str}")
                    
                    conn_check = get_conn()
                    target_sns = req_sn_str.split(",") if req_sn_str and req_sn_str != 'NA' else []
                    
                    valid_sns = []
                    if target_sns:
                        placeholders = ",".join(["?"] * len(target_sns))
                        q_check = f"SELECT serial_number FROM inventory WHERE serial_number IN ({placeholders}) AND status=0"
                        res = pd.read_sql(q_check, conn_check, params=target_sns)
                        valid_sns = res['serial_number'].tolist()
                    conn_check.close()
                    
                    if len(valid_sns) < len(target_sns):
                        st.error(f"注意：申请的序列号中，部分已不在库！(申请:{len(target_sns)}, 在库:{len(valid_sns)})")
                        st.caption("建议驳回，让用户重新申请可用备件。")
                    
                    col_app, col_rej = st.columns([1, 1])
                    
                    if col_app.button("✅ 批准出库", key=f"app_{row['id']}"):
                        if len(valid_sns) < len(target_sns):
                            st.error("无法批准：部分备件已出库或不可用")
                        else:
                            c = get_conn()
                            c.execute("UPDATE requests SET status='approved', approved_sns=?, approver=? WHERE id=?", 
                                      (req_sn_str, st.session_state.user, row['id']))
                            for s in target_sns:
                                c.execute('''UPDATE inventory SET status=1, outbound_time=?, receiver=?, approver=?, project_location=? 
                                             WHERE serial_number=?''',
                                          (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), row['applicant'], st.session_state.user, row['project_location'], s))
                            c.commit()
                            c.close()
                            log_action("Outbound", "批准", st.session_state.user, f"ID:{row['id']} SN:{req_sn_str}")
                            st.success("已批准")
                            st.rerun()

                    if col_rej.button("❌ 驳回申请", key=f"rej_{row['id']}"):
                        c = get_conn()
                        c.execute("UPDATE requests SET status='rejected', approver=? WHERE id=?", (st.session_state.user, row['id']))
                        c.commit()
                        c.close()
                        log_action("Outbound", "驳回", st.session_state.user, f"驳回单号{row['id']}")
                        st.success("已驳回")
                        st.rerun()

    # === 业务4：库存编辑 ===
    elif task == "库存编辑":
        st.subheader("🛠️ 修改在库备件信息")
        search_sn = st.text_input("输入要修改的序列号 (SN) 进行搜索")
        if search_sn:
            conn = get_conn()
            item = pd.read_sql(f"SELECT * FROM inventory WHERE serial_number='{search_sn}' AND status=0", conn)
            conn.close()
            
            if item.empty:
                st.warning("未找到该在库备件")
            else:
                curr = item.iloc[0]
                st.write(f"**当前**: {curr['part_no']} | {curr['warehouse']} | {curr['subsidiary']} | {curr.get('condition', 'N/A')}")
                with st.form("edit_inv_form"):
                    new_sub = st.text_input("修改所属子公司", value=curr['subsidiary'])
                    new_wh = st.text_input("修改所在仓库", value=curr['warehouse'])
                    new_cond = st.selectbox("修改新旧状态", ["全新", "利旧/返还"], index=0 if curr.get('condition')=='全新' else 1)
                    new_sn = st.text_input("修正序列号 (慎用)", value=curr['serial_number'])
                    
                    if st.form_submit_button("保存"):
                        conn_upd = get_conn()
                        try:
                            conn_upd.execute('''UPDATE inventory SET subsidiary=?, warehouse=?, condition=?, serial_number=? WHERE id=?''',
                                             (new_sub, new_wh, new_cond, new_sn, int(curr['id'])))
                            conn_upd.commit()
                            st.success("更新成功")
                            log_action("InventoryEdit", "编辑库存", st.session_state.user, f"Mod SN:{curr['serial_number']}")
                        except: st.error("序列号冲突")
                        finally: conn_upd.close()

    # === 业务5：批量导入/导出 ===
    elif task == "批量导入/导出":
        st.subheader("批量处理")
        conn = get_conn()
        # v0.5 导出包含 新旧状态
        df_ex = pd.read_sql('''
            SELECT 
                i.part_no as "备件号", 
                t.part_name as "备件名称", 
                i.serial_number as "序列号", 
                i.subsidiary as "所属子公司", 
                i.warehouse as "所在仓库",
                i.condition as "新旧状态"
            FROM inventory i
            LEFT JOIN part_types t ON i.part_no = t.part_no
            WHERE i.status = 0
        ''', conn)
        conn.close()
        
        st.download_button("导出所有库存 (可用于重新导入)", df_ex.to_csv(index=False).encode('utf-8'), "export_inventory.csv", "text/csv")
        
        st.divider()
        with open(TEMPLATE_FILE, "rb") as f:
            st.download_button("下载标准模板", f, "template.xlsx")
        
        up = st.file_uploader("上传Excel/CSV", type=['xlsx', 'csv'])
        if up and st.button("导入"):
            try:
                df = pd.read_csv(up) if up.name.endswith('.csv') else pd.read_excel(up)
                succ, fail, update_cnt = 0, 0, 0
                conn = get_conn()
                try:
                    for _, r in df.iterrows():
                        try:
                            p_no = str(r['备件号'])
                            p_name = str(r['备件名称'])
                            sn = str(r['序列号'])
                            sub = str(r['所属子公司'])
                            wh = str(r['所在仓库'])
                            # v0.5 读取新旧状态，默认为全新
                            cond = str(r['新旧状态']) if '新旧状态' in r else '全新'
                            
                            # 类型表
                            conn.execute("INSERT OR IGNORE INTO part_types VALUES (?,?)", (p_no, p_name))
                            
                            # 逻辑：检查是否存在
                            exist_rec = conn.execute("SELECT id, status FROM inventory WHERE serial_number=?", (sn,)).fetchone()
                            
                            if exist_rec:
                                if exist_rec[1] == 1: # 已出库 -> 允许更新(返还)
                                    conn.execute('''UPDATE inventory SET 
                                                 status=0, subsidiary=?, warehouse=?, condition=?, 
                                                 inbound_time=?, inbound_operator=?,
                                                 outbound_time=NULL, receiver=NULL, approver=NULL, project_location=NULL
                                                 WHERE id=?''',
                                                 (sub, wh, cond, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, exist_rec[0]))
                                    update_cnt += 1
                                else:
                                    # 已在库 -> 忽略或报错，这里算失败
                                    fail += 1
                            else:
                                # 不存在 -> 插入
                                conn.execute("INSERT INTO inventory (part_no, serial_number, subsidiary, warehouse, inbound_time, status, inbound_operator, condition) VALUES (?,?,?,?,?,0,?,?)",
                                             (p_no, sn, sub, wh, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, cond))
                                succ += 1
                        except: fail += 1
                    conn.commit()
                finally: conn.close()
                st.success(f"导入完成: 新增 {succ}, 返还更新 {update_cnt}, 失败/跳过 {fail}")
                log_action("Inbound", "批量导入", st.session_state.user, f"新增{succ}/返还{update_cnt}")
            except Exception as e: st.error(f"文件解析错误: {e}")

# --- Operator: 使用者 ---
def section_operator():
    st.header(f"🙋‍♂️ 备件中心 (Operator: {st.session_state.user})")
    
    tab1, tab2 = st.tabs(["申请出库", "历史记录"])
    
    with tab1:
        conn = get_conn()
        types = pd.read_sql("SELECT part_no, part_name FROM part_types", conn)
        conn.close()
        
        type_opts = [f"{r['part_no']} | {r['part_name']}" for _, r in types.iterrows()]
        sel_type_str = st.selectbox("1. 选择备件", ["--请选择--"] + type_opts)
        
        if sel_type_str != "--请选择--":
            p_no = sel_type_str.split(" | ")[0]
            
            conn = get_conn()
            subs = pd.read_sql(f"SELECT DISTINCT subsidiary FROM inventory WHERE part_no='{p_no}' AND status=0", conn)
            conn.close()
            
            if subs.empty:
                st.warning("该备件当前无库存")
            else:
                sel_sub = st.selectbox("2. 选择所属子公司", ["--请选择--"] + subs['subsidiary'].tolist())
                
                if sel_sub != "--请选择--":
                    conn = get_conn()
                    whs = pd.read_sql(f"SELECT DISTINCT warehouse FROM inventory WHERE part_no='{p_no}' AND subsidiary='{sel_sub}' AND status=0", conn)
                    conn.close()
                    
                    sel_wh = st.selectbox("3. 选择所在仓库", ["--请选择--"] + whs['warehouse'].tolist())
                    
                    if sel_wh != "--请选择--":
                        conn = get_conn()
                        # v0.5 显示 condition
                        sns_df = pd.read_sql(f"SELECT serial_number, condition FROM inventory WHERE part_no='{p_no}' AND subsidiary='{sel_sub}' AND warehouse='{sel_wh}' AND status=0", conn)
                        conn.close()
                        
                        # 在下拉列表中展示新旧状态
                        available_opts = [f"{r['serial_number']} ({r['condition']})" for _, r in sns_df.iterrows()]
                        
                        st.info(f"该仓库可用库存: {len(available_opts)} 件")
                        
                        with st.form("op_req_form"):
                            selected_opts = st.multiselect("4. 请勾选您要领用的具体备件 (可多选)", available_opts)
                            loc = st.text_input("领用项目/现场")
                            
                            if st.form_submit_button("提交申请"):
                                if not selected_opts:
                                    st.error("请至少选择一个备件")
                                elif not loc:
                                    st.error("请填写领用项目")
                                else:
                                    # 解析出纯SN
                                    selected_sns = [x.split(" (")[0] for x in selected_opts]
                                    qty = len(selected_sns)
                                    sn_str = ",".join(selected_sns)
                                    
                                    c = get_conn()
                                    c.execute("INSERT INTO requests (part_no, qty, project_location, applicant, timestamp, requested_sns) VALUES (?,?,?,?,?,?)",
                                              (p_no, qty, loc, st.session_state.user, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), sn_str))
                                    c.commit()
                                    c.close()
                                    st.success(f"申请已提交！(申请序列号: {sn_str})")
    
    with tab2:
        three_months_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        conn = get_conn()
        q = f'''SELECT r.timestamp, r.part_no, t.part_name, r.qty, r.project_location, r.status, r.approved_sns, r.approver
                FROM requests r
                LEFT JOIN part_types t ON r.part_no = t.part_no
                WHERE r.applicant='{st.session_state.user}' AND r.timestamp > '{three_months_ago}'
                ORDER BY r.timestamp DESC'''
        df = pd.read_sql(q, conn)
        conn.close()
        
        df['approved_sns'] = df['approved_sns'].fillna('NA')
        def color_status(val):
            c = 'green' if val=='approved' else 'red' if val=='rejected' else 'orange'
            return f'color: {c}; font-weight: bold'
        st.dataframe(df.style.applymap(color_status, subset=['status']), use_container_width=True)

# --- 通用: 改密 ---
def section_change_pwd():
    with st.sidebar.expander("🔐 修改密码"):
        old = st.text_input("旧密码", type="password")
        new = st.text_input("新密码", type="password")
        if st.button("修改"):
            conn = get_conn()
            real = conn.execute("SELECT password FROM users WHERE username=?", (st.session_state.user,)).fetchone()[0]
            if hash_pwd(old) != real:
                st.error("旧密码错误")
            else:
                conn.execute("UPDATE users SET password=? WHERE username=?", (hash_pwd(new), st.session_state.user))
                conn.commit()
                st.success("成功，请重登")
            conn.close()

# === 4. 主入口 ===
def main():
    st.set_page_config(page_title="备件管理系统 v0.5", layout="wide")
    check_and_migrate_db()
    init_system()
    
    if 'logged_in' not in st.session_state:
        st.session_state.logged_in = False
        st.session_state.roles = []
        
    if not st.session_state.logged_in:
        st.title("🏭 备件管理系统 v0.5")
        c1, c2 = st.columns([1,2])
        with c1: st.info("初始: admin / 123456")
        with c2:
            u = st.text_input("用户名")
            p = st.text_input("密码", type="password")
            if st.button("登录"):
                conn = get_conn()
                res = conn.execute("SELECT password, roles FROM users WHERE username=?", (u,)).fetchone()
                conn.close()
                if res and res[0] == hash_pwd(p):
                    st.session_state.logged_in = True
                    st.session_state.user = u
                    st.session_state.roles = res[1].split(",")
                    st.rerun()
                else:
                    st.error("失败")
    else:
        st.sidebar.title(f"用户: {st.session_state.user}")
        roles = st.session_state.roles
        page_opts = []
        if 'admin' in roles: page_opts.append("Admin面板")
        if 'manager' in roles: page_opts.append("Manager面板")
        if 'operator' in roles: page_opts.append("Operator面板")
        
        sel = st.sidebar.radio("导航", page_opts)
        section_change_pwd()
        if st.sidebar.button("退出"):
            st.session_state.logged_in = False
            st.rerun()
            
        if sel == "Admin面板": section_admin()
        elif sel == "Manager面板": section_manager()
        elif sel == "Operator面板": section_operator()

if __name__ == "__main__":
    main()