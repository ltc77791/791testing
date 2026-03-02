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

def init_system():
    conn = get_conn()
    c = conn.cursor()
    
    # 1. 用户表 (roles 存储如 "admin,manager" 或 "operator")
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT,
        roles TEXT
    )''')
    
    # 2. 备件类型定义表 (基础信息)
    c.execute('''CREATE TABLE IF NOT EXISTS part_types (
        part_no TEXT PRIMARY KEY,
        part_name TEXT
    )''')
    
    # 3. 实体库存表 (每一行是一个具体备件，Unique Serial Number)
    # status: 0=在库, 1=已出库
    c.execute('''CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_no TEXT,
        serial_number TEXT UNIQUE,
        subsidiary TEXT,
        warehouse TEXT,
        inbound_time TEXT,
        status INTEGER DEFAULT 0, 
        outbound_time TEXT,
        receiver TEXT,
        approver TEXT,
        project_location TEXT
    )''')
    
    # 4. 申请单表
    c.execute('''CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_no TEXT,
        qty INTEGER,
        project_location TEXT,
        applicant TEXT,
        status TEXT DEFAULT 'pending', -- pending, approved, rejected
        approved_sns TEXT, -- 审批通过时填入的序列号，逗号分隔
        approver TEXT,
        timestamp TEXT
    )''')
    
    # 5. 系统日志表 (Admin/Manager/Operator 操作全记录)
    c.execute('''CREATE TABLE IF NOT EXISTS sys_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, -- UserMgmt, Inbound, Outbound
        action_type TEXT,
        operator TEXT,
        details TEXT, -- 存JSON或描述
        timestamp TEXT
    )''')
    
    # 初始化默认 Admin (密码 123456)
    c.execute("SELECT * FROM users WHERE username='admin'")
    if not c.fetchone():
        pwd = hashlib.sha256("123456".encode()).hexdigest()
        c.execute("INSERT INTO users VALUES (?,?,?)", ('admin', pwd, 'admin'))
        
    conn.commit()
    conn.close()
    
    # 生成导入模板
    if not os.path.exists(TEMPLATE_FILE):
        df_template = pd.DataFrame(columns=['备件号', '备件名称', '序列号', '所属子公司', '所在仓库'])
        df_template.to_excel(TEMPLATE_FILE, index=False)

# === 2. 辅助函数 ===
def hash_pwd(p):
    return hashlib.sha256(p.encode()).hexdigest()

def log_action(category, action, operator, details):
    conn = get_conn()
    conn.execute("INSERT INTO sys_logs (category, action_type, operator, details, timestamp) VALUES (?,?,?,?,?)",
                 (category, action, operator, str(details), datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()
    conn.close()

# === 3. 角色功能模块 ===

# --- Admin: 用户管理 (修复数据库冲突版) ---
def section_admin():
    st.header("🛡️ 用户权限管理 (Admin)")
    
    tab1, tab2, tab3 = st.tabs(["用户列表", "创建用户", "系统日志"])
    
    # === Tab 1: 用户列表 ===
    with tab1:
        conn = get_conn() # 单独打开
        # 显示用户
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
            if not new_role_opts:
                st.caption("注：若需设为Operator，请勿勾选任何选项")
            
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
                    if not new_role_opts:
                        final_role = "operator"
                    else:
                        final_role = ",".join(new_role_opts)
                    conn.execute("UPDATE users SET roles=? WHERE username=?", (final_role, target_user))
                    conn.commit()
                    log_action("UserMgmt", "修改权限", st.session_state.user, f"修改 {target_user} 为 {final_role}")
                    st.success("权限已修改")
                    st.rerun()
            except Exception as e:
                st.error(f"操作失败: {e}")
            finally:
                conn.close() # 操作完关闭
        else:
            # 如果没点按钮，也要关闭连接用于显示
            conn.close()

    # === Tab 2: 创建用户 ===
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
                # 使用独立的连接变量，避免冲突
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

    # === Tab 3: 系统日志 ===
    with tab3:
        conn_log = get_conn() # 单独打开
        logs = pd.read_sql("SELECT * FROM sys_logs WHERE category='UserMgmt' ORDER BY id DESC", conn_log)
        st.dataframe(logs, use_container_width=True)
        conn_log.close()

# --- Manager: 备件管理 (修复数据库锁死版) ---
def section_manager():
    st.header("📦 备件管理 (Manager)")
    
    # 顶部导航
    task = st.radio("业务流", ["备件入库", "审批出库", "库存查询与日志", "批量导入/导出"], horizontal=True)
    
    # === 业务1：备件入库 ===
    if task == "备件入库":
        st.info("💡 提示：所有入库均为‘单品入库’，必须填写序列号。")
        
        c1, c2 = st.columns(2)
        with c1:
            # 1. 读取备件类型 (读完马上关连接)
            conn_read = get_conn()
            existing_types = pd.read_sql("SELECT part_no, part_name FROM part_types", conn_read)
            conn_read.close() # <--- 关键：立即关闭
            
            type_choice = st.selectbox("选择备件类型", ["-- 新建类型 --"] + existing_types['part_no'].tolist())
            
            p_no, p_name = "", ""
            if type_choice == "-- 新建类型 --":
                p_no = st.text_input("输入新备件号")
                p_name = st.text_input("输入备件名称")
                is_new_type = True
            else:
                p_no = type_choice
                # 获取名称
                if not existing_types.empty:
                    p_name = existing_types[existing_types['part_no']==p_no]['part_name'].values[0]
                st.text_input("备件名称", value=p_name, disabled=True)
                is_new_type = False
        
        with c2:
            sn = st.text_input("序列号 (唯一)")
            sub = st.text_input("所属子公司")
            wh = st.text_input("所在仓库")
            
        if st.button("确认入库"):
            if not p_no or not sn:
                st.error("关键信息缺失")
                return
            
            # 2. 执行写入操作
            conn_write = get_conn()
            try:
                # 如果是新类型，先存类型表
                if is_new_type:
                    conn_write.execute("INSERT OR IGNORE INTO part_types VALUES (?,?)", (p_no, p_name))
                
                # 存库存表
                conn_write.execute('''INSERT INTO inventory 
                             (part_no, serial_number, subsidiary, warehouse, inbound_time, status) 
                             VALUES (?,?,?,?,?,?)''', 
                             (p_no, sn, sub, wh, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), 0))
                
                conn_write.commit() # 提交事务
                st.success(f"备件 {p_no} (SN: {sn}) 入库成功！")
            except sqlite3.IntegrityError:
                st.error("入库失败：该序列号已存在！")
                return # 失败直接返回，不记日志
            except Exception as e:
                st.error(f"系统错误: {e}")
                return
            finally:
                conn_write.close() # <--- 关键：先关闭写入连接
            
            # 3. 写入成功后再记日志 (log_action 会打开新连接，现在安全了)
            if is_new_type:
                log_action("Inbound", "新建备件类型", st.session_state.user, f"创建类型 {p_no}-{p_name}")
            log_action("Inbound", "入库", st.session_state.user, f"入库 {p_no} SN:{sn} 仓:{wh}")

    # === 业务2：审批出库 ===
    elif task == "审批出库":
        # 读取待审批列表
        conn_read = get_conn()
        pending = pd.read_sql("SELECT * FROM requests WHERE status='pending'", conn_read)
        conn_read.close() # 关闭
        
        if pending.empty:
            st.info("没有待审批的申请。")
        else:
            for idx, row in pending.iterrows():
                with st.expander(f"申请 #{row['id']} | 申请人: {row['applicant']} | 备件: {row['part_no']} (数量: {row['qty']})"):
                    st.write(f"**申领项目/地点**: {row['project_location']}")
                    
                    # 查库存
                    conn_check = get_conn()
                    available_sns = pd.read_sql(f"SELECT serial_number FROM inventory WHERE part_no='{row['part_no']}' AND status=0", conn_check)
                    conn_check.close() # 关闭
                    
                    available_list = available_sns['serial_number'].tolist()
                    
                    if len(available_list) < row['qty']:
                        st.error(f"库存不足！当前仅剩 {len(available_list)} 个，申请需要 {row['qty']} 个。")
                        if st.button("驳回", key=f"rej_{row['id']}"):
                            conn_rej = get_conn()
                            conn_rej.execute("UPDATE requests SET status='rejected', approver=? WHERE id=?", (st.session_state.user, row['id']))
                            conn_rej.commit()
                            conn_rej.close() # 关闭
                            log_action("Outbound", "驳回", st.session_state.user, f"驳回单号{row['id']}")
                            st.rerun()
                    else:
                        selected_sns = st.multiselect(
                            f"请勾选出库的序列号 (需选 {row['qty']} 个)", 
                            available_list,
                            max_selections=row['qty'],
                            key=f"sel_{row['id']}"
                        )
                        
                        col_a, col_b = st.columns(2)
                        if col_a.button("批准出库", key=f"app_{row['id']}"):
                            if len(selected_sns) != row['qty']:
                                st.warning(f"请精确选择 {row['qty']} 个序列号，已选 {len(selected_sns)} 个。")
                            else:
                                sn_str = ",".join(selected_sns)
                                now_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                
                                conn_app = get_conn()
                                try:
                                    # 更新申请单
                                    conn_app.execute("UPDATE requests SET status='approved', approved_sns=?, approver=? WHERE id=?", 
                                                 (sn_str, st.session_state.user, row['id']))
                                    
                                    # 更新库存状态
                                    for s in selected_sns:
                                        conn_app.execute('''UPDATE inventory SET 
                                                     status=1, outbound_time=?, receiver=?, approver=?, project_location=? 
                                                     WHERE serial_number=?''',
                                                     (now_time, row['applicant'], st.session_state.user, row['project_location'], s))
                                    conn_app.commit()
                                finally:
                                    conn_app.close() # <--- 关键：关闭
                                
                                log_action("Outbound", "批准出库", st.session_state.user, f"单号{row['id']} 备件{row['part_no']} SN:{sn_str}")
                                st.success("已批准并出库")
                                st.rerun()
                        
                        if col_b.button("驳回申请", key=f"rej_btn_{row['id']}"):
                            conn_rej = get_conn()
                            conn_rej.execute("UPDATE requests SET status='rejected', approver=? WHERE id=?", (st.session_state.user, row['id']))
                            conn_rej.commit()
                            conn_rej.close()
                            log_action("Outbound", "驳回", st.session_state.user, f"驳回单号{row['id']}")
                            st.rerun()

    # === 业务3：日志查询 ===
    elif task == "库存查询与日志":
        t1, t2, t3 = st.tabs(["当前库存", "入库记录(3个月)", "出库记录(3个月)"])
        three_months_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        
        # 使用临时连接读取数据
        conn_log = get_conn()
        
        with t1:
            q = '''SELECT i.part_no, t.part_name, i.serial_number, i.subsidiary, i.warehouse, i.inbound_time 
                   FROM inventory i 
                   LEFT JOIN part_types t ON i.part_no = t.part_no
                   WHERE i.status=0'''
            st.dataframe(pd.read_sql(q, conn_log), use_container_width=True)

        with t2:
            q = f'''SELECT i.part_no, t.part_name, i.serial_number, i.inbound_time, i.warehouse, i.subsidiary 
                    FROM inventory i
                    LEFT JOIN part_types t ON i.part_no = t.part_no
                    WHERE i.inbound_time > '{three_months_ago}'
                    ORDER BY i.inbound_time DESC'''
            st.dataframe(pd.read_sql(q, conn_log), use_container_width=True)
            
        with t3:
            q = f'''SELECT r.part_no, t.part_name, r.approved_sns as 序列号, r.status, r.project_location, r.applicant, r.approver, r.timestamp
                    FROM requests r
                    LEFT JOIN part_types t ON r.part_no = t.part_no
                    WHERE r.timestamp > '{three_months_ago}'
                    ORDER BY r.timestamp DESC'''
            df_out = pd.read_sql(q, conn_log)
            df_out = df_out.fillna('NA')
            st.dataframe(df_out, use_container_width=True)
            
        conn_log.close() # 关闭

    # === 业务4：批量导入导出 ===
    elif task == "批量导入/导出":
        st.subheader("导出")
        conn_exp = get_conn()
        df_export = pd.read_sql('''SELECT i.part_no as 备件号, t.part_name as 备件名称, i.serial_number as 序列号, 
                                i.subsidiary as 所属子公司, i.warehouse as 所在仓库
                                FROM inventory i
                                LEFT JOIN part_types t ON i.part_no = t.part_no
                                ''', conn_exp)
        conn_exp.close()
        
        csv = df_export.to_csv(index=False).encode('utf-8')
        st.download_button("下载所有库存 (CSV)", csv, "inventory_export.csv", "text/csv")
        
        st.divider()
        st.subheader("导入")
        st.caption("请先下载模板，填写后上传。")
        
        with open(TEMPLATE_FILE, "rb") as f:
            st.download_button("📥 下载导入模板 (.xlsx)", f, "import_template.xlsx")
            
        up_file = st.file_uploader("上传填好的Excel文件", type=['xlsx', 'csv'])
        if up_file and st.button("开始导入"):
            try:
                if up_file.name.endswith('.csv'):
                    df_in = pd.read_csv(up_file)
                else:
                    df_in = pd.read_excel(up_file)
                
                success_count = 0
                fail_count = 0
                
                conn_imp = get_conn()
                try:
                    for _, row in df_in.iterrows():
                        try:
                            conn_imp.execute("INSERT OR IGNORE INTO part_types VALUES (?,?)", (str(row['备件号']), str(row['备件名称'])))
                            conn_imp.execute('''INSERT INTO inventory 
                                         (part_no, serial_number, subsidiary, warehouse, inbound_time, status) 
                                         VALUES (?,?,?,?,?,0)''', 
                                         (str(row['备件号']), str(row['序列号']), str(row['所属子公司']), str(row['所在仓库']), 
                                          datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
                            success_count += 1
                        except:
                            fail_count += 1
                    conn_imp.commit()
                finally:
                    conn_imp.close() # 关闭
                
                st.success(f"导入完成！成功: {success_count}, 失败: {fail_count} (可能是序列号重复)")
                log_action("Inbound", "批量导入", st.session_state.user, f"成功{success_count}条")
                
            except Exception as e:
                st.error(f"文件解析失败: {e}")

# --- Operator: 使用者 ---
def section_operator():
    st.header(f"🙋‍♂️ 备件中心 (Operator: {st.session_state.user})")
    conn = get_conn()
    
    tab1, tab2 = st.tabs(["申请出库", "历史记录(3个月)"])
    
    with tab1:
        # 1. 选类型
        types = pd.read_sql("SELECT part_no, part_name FROM part_types", conn)
        sel_t = st.selectbox("选择备件", types['part_no'] + " | " + types['part_name'])
        p_no = sel_t.split(" | ")[0]
        
        # 显示当前库存余量
        cnt = pd.read_sql(f"SELECT count(*) FROM inventory WHERE part_no='{p_no}' AND status=0", conn).iloc[0,0]
        st.info(f"当前可申请库存: {cnt} 件")
        
        with st.form("op_req"):
            qty = st.number_input("申请数量", min_value=1, max_value=int(cnt) if cnt>0 else 1)
            loc = st.text_input("领用项目/现场")
            if st.form_submit_button("提交申请"):
                if cnt == 0:
                    st.error("库存不足，无法申请")
                elif qty > cnt:
                    st.error(f"申请数量超过库存上限 ({cnt})")
                elif not loc:
                    st.error("请填写项目/现场")
                else:
                    conn.execute("INSERT INTO requests (part_no, qty, project_location, applicant, timestamp) VALUES (?,?,?,?,?)",
                                 (p_no, qty, loc, st.session_state.user, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
                    conn.commit()
                    st.success("申请已提交")
    
    with tab2:
        three_months_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        q = f'''SELECT r.timestamp, r.part_no, t.part_name, r.qty, r.project_location, r.status, r.approved_sns, r.approver
                FROM requests r
                LEFT JOIN part_types t ON r.part_no = t.part_no
                WHERE r.applicant='{st.session_state.user}' AND r.timestamp > '{three_months_ago}'
                ORDER BY r.timestamp DESC'''
        df = pd.read_sql(q, conn)
        
        # 格式化显示 NA
        df['approved_sns'] = df['approved_sns'].fillna('NA')
        
        def color_status(val):
            return f'color: {"green" if val=="approved" else "red" if val=="rejected" else "orange"}'
        
        st.dataframe(df.style.applymap(color_status, subset=['status']), use_container_width=True)
        
    conn.close()

# --- 通用: 修改密码 ---
def section_change_pwd():
    with st.sidebar.expander("🔐 修改密码"):
        old = st.text_input("旧密码", type="password")
        new = st.text_input("新密码", type="password")
        if st.button("确认修改"):
            conn = get_conn()
            real_pwd = conn.execute("SELECT password FROM users WHERE username=?", (st.session_state.user,)).fetchone()[0]
            if hash_pwd(old) != real_pwd:
                st.error("旧密码错误")
            else:
                conn.execute("UPDATE users SET password=? WHERE username=?", (hash_pwd(new), st.session_state.user))
                conn.commit()
                st.success("密码已修改，请重新登录")
                log_action("UserMgmt", "修改密码", st.session_state.user, "用户自行修改")
            conn.close()

# === 4. 主入口 ===
def main():
    st.set_page_config(page_title="备件管理系统 Pro", layout="wide")
    init_system()
    
    if 'logged_in' not in st.session_state:
        st.session_state.logged_in = False
        st.session_state.roles = []
        
    if not st.session_state.logged_in:
        # 登录页
        st.title("🏭 备件管理系统登录")
        u = st.text_input("用户名")
        p = st.text_input("密码", type="password")
        if st.button("登录"):
            conn = get_conn()
            res = conn.execute("SELECT password, roles FROM users WHERE username=?", (u,)).fetchone()
            conn.close()
            if res and res[0] == hash_pwd(p):
                st.session_state.logged_in = True
                st.session_state.user = u
                st.session_state.roles = res[1].split(",") # 解析权限 "admin,manager" -> ['admin', 'manager']
                st.rerun()
            else:
                st.error("认证失败")
        st.caption("初始Admin账号: admin / 123456")
        
    else:
        # 侧边栏
        st.sidebar.title(f"用户: {st.session_state.user}")
        st.sidebar.write(f"权限: {', '.join(st.session_state.roles)}")
        
        # 权限路由逻辑
        roles = st.session_state.roles
        page_opts = []
        
        if 'admin' in roles:
            page_opts.append("Admin面板")
        if 'manager' in roles:
            page_opts.append("Manager面板")
        if 'operator' in roles:
            page_opts.append("Operator面板")
            
        selection = st.sidebar.radio("前往", page_opts)
        
        section_change_pwd() # 所有人都可改密码
        
        if st.sidebar.button("退出登录"):
            st.session_state.logged_in = False
            st.rerun()
            
        # 页面渲染
        if selection == "Admin面板":
            section_admin()
        elif selection == "Manager面板":
            section_manager()
        elif selection == "Operator面板":
            section_operator()

if __name__ == "__main__":
    main()