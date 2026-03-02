import streamlit as st
import sqlite3
import pandas as pd
import hashlib
import os
from datetime import datetime, timedelta
import time

# === 容错导入 OpenCV ===
try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

# === 配置 ===
DB_FILE = 'inventory_v2.db'
TEMPLATE_FILE = 'import_template.xlsx'

# === 1. 数据库与初始化 (保持 v0.6.1 完整逻辑) ===
def get_conn():
    return sqlite3.connect(DB_FILE)

def check_and_migrate_db():
    conn = get_conn()
    c = conn.cursor()
    try:
        c.execute("PRAGMA table_info(inventory)")
        inv_cols = [info[1] for info in c.fetchall()]
        if 'inbound_operator' not in inv_cols:
            c.execute("ALTER TABLE inventory ADD COLUMN inbound_operator TEXT")
            conn.commit()
        if 'condition' not in inv_cols:
            c.execute("ALTER TABLE inventory ADD COLUMN condition TEXT DEFAULT '全新'")
            conn.commit()

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
    
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT,
        roles TEXT
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS part_types (
        part_no TEXT PRIMARY KEY,
        part_name TEXT
    )''')
    
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
        project_location TEXT,
        inbound_operator TEXT,
        condition TEXT
    )''')
    
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
    
    c.execute('''CREATE TABLE IF NOT EXISTS sys_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, 
        action_type TEXT,
        operator TEXT,
        details TEXT,
        timestamp TEXT
    )''')
    
    c.execute("SELECT * FROM users WHERE username='admin'")
    if not c.fetchone():
        # Use ADMIN_PWD env variable; fall back to a random password so it's never "123456" by default
        import secrets
        default_pwd = os.environ.get("ADMIN_PWD") or secrets.token_urlsafe(16)
        if not os.environ.get("ADMIN_PWD"):
            print(f"[SECURITY] No ADMIN_PWD env variable set. Generated one-time admin password: {default_pwd}")
        pwd = hashlib.sha256(default_pwd.encode()).hexdigest()
        c.execute("INSERT INTO users VALUES (?,?,?)", ('admin', pwd, 'admin'))
        
    conn.commit()
    conn.close()
    
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

# === v0.7 新增：实时扫码核心逻辑 ===
def stream_scan_qr():
    """
    启动本地摄像头循环读取帧，直到识别到二维码或点击停止。
    返回: 识别到的字符串 OR None
    """
    if not CV2_AVAILABLE:
        st.error("缺失 OpenCV 库。")
        return None

    # UI 控件
    col1, col2 = st.columns([1, 4])
    with col1:
        stop_btn = st.button("🔴 停止扫描", key="stop_scan")
    
    # 图片占位符
    frame_placeholder = st.empty()
    
    # 打开摄像头 (0 是默认摄像头)
    cap = cv2.VideoCapture(0)
    detector = cv2.QRCodeDetector()
    
    detected_code = None

    if not cap.isOpened():
        st.error("无法打开摄像头，请检查设备。")
        return None

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                st.error("视频流中断")
                break
            
            # 1. 解码
            data, bbox, _ = detector.detectAndDecode(frame)
            
            # 2. 画框 (视觉反馈)
            if bbox is not None:
                for i in range(len(bbox)):
                    pt1 = tuple(map(int, bbox[i][0]))
                    pt2 = tuple(map(int, bbox[(i+1) % len(bbox)][0]))
                    cv2.line(frame, pt1, pt2, (0, 255, 0), 3)
                    
            # 3. 转换颜色 BGR -> RGB 用于 Streamlit 显示
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_placeholder.image(frame, channels="RGB", caption="正在扫描... 请将二维码置于框内")
            
            # 4. 成功识别
            if data:
                detected_code = data
                break
                
            # 5. 用户停止
            if stop_btn:
                break
                
            # 降低CPU占用
            time.sleep(0.05)
    finally:
        # 无论是否发生异常，确保摄像头始终释放
        cap.release()
        frame_placeholder.empty() # 清除视频画面

    return detected_code

def render_scan_result(part_no_scanned):
    """(保持 v0.6.1 逻辑) 显示扫描结果"""
    st.success(f"🔍 扫描成功！备件号: **{part_no_scanned}**")
    
    conn = get_conn()
    info = pd.read_sql("SELECT * FROM part_types WHERE part_no=?", conn, params=[part_no_scanned])
    
    if info.empty:
        st.warning("系统内未找到该备件号的定义信息。")
    else:
        p_name = info.iloc[0]['part_name']
        st.markdown(f"### {p_name} ({part_no_scanned})")
        
        inv = pd.read_sql("SELECT serial_number, subsidiary, warehouse, condition, status FROM inventory WHERE part_no=? AND status=0", conn, params=[part_no_scanned])
        
        c1, c2 = st.columns(2)
        with c1:
            st.metric("当前在库总数", len(inv))
        
        if not inv.empty:
            st.write("📋 **库存详情列表:**")
            st.dataframe(inv[['serial_number', 'subsidiary', 'warehouse', 'condition']], use_container_width=True)
            
            st.write("📊 **分布统计:**")
            grp = inv.groupby(['subsidiary', 'warehouse']).size().reset_index(name='数量')
            st.dataframe(grp, use_container_width=True)
        else:
            st.warning("⚠️ 该备件当前无库存")
            
    conn.close()

# === 3. 角色功能模块 ===

# --- Admin: 用户管理 (保持 v0.6.1) ---
def section_admin():
    st.header("🛡️ 用户权限管理 (Admin)")
    tab1, tab2, tab3 = st.tabs(["用户列表", "创建用户", "系统日志"])
    
    with tab1:
        conn = get_conn()
        df = pd.read_sql("SELECT username, roles FROM users", conn)
        st.dataframe(df, use_container_width=True)
        col1, col2 = st.columns(2)
        with col1: target_user = st.selectbox("选择用户", df['username'])
        with col2: action = st.radio("操作类型", ["重置密码(123456)", "删除用户", "修改权限"])
        if action == "修改权限": new_role_opts = st.multiselect("新权限组", ["admin", "manager"], default=[])
        if st.button("执行操作"):
            try:
                if target_user == 'admin' and action == '删除用户': st.error("不能删除初始admin")
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
            finally: conn.close()
        else: conn.close()

    with tab2:
        new_u = st.text_input("新用户名")
        role_type = st.radio("用户类型", ["Operator (操作员)", "管理层 (Admin/Manager)"])
        final_role = ""
        if role_type == "管理层 (Admin/Manager)":
            perms = st.multiselect("授予权限", ["admin", "manager"], default=["manager"])
            if perms: final_role = ",".join(perms)
        else: final_role = "operator"
        if st.button("创建"):
            conn_create = get_conn()
            try:
                exist = conn_create.execute("SELECT 1 FROM users WHERE username=?", (new_u,)).fetchone()
                if exist: st.error(f"用户 {new_u} 已存在！")
                else:
                    conn_create.execute("INSERT INTO users (username, password, roles) VALUES (?,?,?)", (new_u, hash_pwd("123456"), final_role))
                    conn_create.commit()
                    log_action("UserMgmt", "创建用户", st.session_state.user, f"创建 {new_u} 权限: {final_role}")
                    st.success(f"用户 {new_u} 创建成功！")
            except Exception as e: st.error(f"系统错误: {e}")
            finally: conn_create.close()

    with tab3:
        conn_log = get_conn()
        logs = pd.read_sql("SELECT * FROM sys_logs WHERE category='UserMgmt' ORDER BY id DESC", conn_log)
        st.dataframe(logs, use_container_width=True)
        conn_log.close()

# --- Manager: 备件管理 ---
def section_manager():
    st.header("📦 备件管理 (Manager)")
    task = st.radio("业务流", ["库存查询与日志", "📷 扫码查询", "备件入库", "审批出库", "库存编辑", "批量导入/导出"], horizontal=True)
    
    # === v0.7 改造: 自动扫码 ===
    if task == "📷 扫码查询":
        st.subheader("📷 自动扫码查询")
        if not CV2_AVAILABLE:
            st.error("⚠️ 未检测到 OpenCV 库，无法使用实时扫码。请 pip install opencv-python")
        else:
            col1, col2 = st.columns([1, 4])
            with col1:
                # 状态控制开关
                start = st.button("🟢 启动摄像头", key="mgr_scan_start")
            
            # 如果点击启动，进入循环
            if start:
                code = stream_scan_qr()
                if code:
                    st.session_state['scan_res_mgr'] = code
                    st.rerun()

            # 显示结果
            if 'scan_res_mgr' in st.session_state:
                st.divider()
                render_scan_result(st.session_state['scan_res_mgr'])
                if st.button("清除结果", key="mgr_cls"):
                    del st.session_state['scan_res_mgr']
                    st.rerun()

    # === (以下保持 v0.6.1 逻辑不变) ===
    elif task == "库存查询与日志":
        t1, t2, t3, t4 = st.tabs(["当前库存", "入库记录", "出库记录", "编辑历史"])
        conn = get_conn()
        with t1:
            df_inv = pd.read_sql("SELECT i.part_no, t.part_name, i.serial_number, i.condition as 新旧, i.subsidiary, i.warehouse, i.inbound_time FROM inventory i LEFT JOIN part_types t ON i.part_no = t.part_no WHERE i.status=0", conn)
            if not df_inv.empty:
                c1,c2,c3 = st.columns(3)
                cts = df_inv['part_no'].value_counts()
                p_opts = [f"{p} : {cts[p]}" for p in cts.index]
                p_map = {f"{p} : {cts[p]}": p for p in cts.index}
                with c1: sel_p = st.multiselect("按备件号", p_opts)
                with c2: sel_s = st.multiselect("按子公司", df_inv['subsidiary'].unique())
                with c3: sel_w = st.multiselect("按仓库", df_inv['warehouse'].unique())
                if sel_p: df_inv = df_inv[df_inv['part_no'].isin([p_map[x] for x in sel_p])]
                if sel_s: df_inv = df_inv[df_inv['subsidiary'].isin(sel_s)]
                if sel_w: df_inv = df_inv[df_inv['warehouse'].isin(sel_w)]
            st.dataframe(df_inv, use_container_width=True)
        with t2:
            st.dataframe(pd.read_sql("SELECT i.part_no, t.part_name, i.serial_number, i.condition as 新旧, i.inbound_time, i.warehouse, i.subsidiary, i.inbound_operator as 操作员 FROM inventory i LEFT JOIN part_types t ON i.part_no = t.part_no ORDER BY i.inbound_time DESC LIMIT 100", conn), use_container_width=True)
        with t3:
            df_out = pd.read_sql("SELECT r.part_no, t.part_name, r.approved_sns as 序列号, r.status as 状态, r.project_location, r.applicant, r.approver, r.timestamp FROM requests r LEFT JOIN part_types t ON r.part_no = t.part_no ORDER BY r.timestamp DESC LIMIT 100", conn).fillna('NA')
            def hl(v): return f'color: {"#28a745" if v=="approved" else "#dc3545" if v=="rejected" else "#ffc107"}; font-weight: bold'
            st.dataframe(df_out.style.applymap(hl, subset=['状态']), use_container_width=True)
        with t4:
            st.dataframe(pd.read_sql("SELECT * FROM sys_logs WHERE category='InventoryEdit' ORDER BY id DESC", conn), use_container_width=True)
        conn.close()

    elif task == "备件入库":
        st.info("💡 单品入库 (已出库的序列号可直接重新入库)")
        c1, c2 = st.columns(2)
        conn_read = get_conn()
        exts = pd.read_sql("SELECT part_no, part_name FROM part_types", conn_read)
        conn_read.close()
        with c1:
            tc = st.selectbox("选择备件类型", ["-- 新建类型 --"] + exts['part_no'].tolist())
            if tc == "-- 新建类型 --":
                p_no = st.text_input("输入新备件号")
                p_name = st.text_input("输入备件名称")
                is_new = True
            else:
                p_no = tc
                p_name = exts[exts['part_no']==p_no]['part_name'].values[0]
                st.text_input("备件名称", value=p_name, disabled=True)
                is_new = False
        with c2:
            sn = st.text_input("序列号 (唯一)")
            sub = st.text_input("所属子公司")
            wh = st.text_input("所在仓库")
            cond = st.radio("新旧状态", ["全新", "利旧/返还"], horizontal=True)
        if st.button("确认入库"):
            if not p_no or not sn: st.error("缺失关键信息")
            else:
                conn_w = get_conn()
                try:
                    ex = conn_w.execute("SELECT id, status FROM inventory WHERE serial_number=?", (sn,)).fetchone()
                    if ex:
                        if ex[1] == 0: st.error(f"序列号 {sn} 已在库中！")
                        else:
                            conn_w.execute("UPDATE inventory SET status=0, subsidiary=?, warehouse=?, condition=?, inbound_time=?, inbound_operator=?, part_no=?, outbound_time=NULL WHERE id=?", (sub, wh, cond, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, p_no, ex[0]))
                            conn_w.commit()
                            st.success(f"返还入库成功！SN:{sn}")
                            log_action("Inbound", "返还入库", st.session_state.user, f"{p_no} SN:{sn} ({cond})")
                    else:
                        if is_new: conn_w.execute("INSERT OR IGNORE INTO part_types VALUES (?,?)", (p_no, p_name))
                        conn_w.execute("INSERT INTO inventory (part_no, serial_number, subsidiary, warehouse, inbound_time, status, inbound_operator, condition) VALUES (?,?,?,?,?,0,?,?)", (p_no, sn, sub, wh, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, cond))
                        conn_w.commit()
                        st.success(f"全新入库成功 SN:{sn}")
                        log_action("Inbound", "入库", st.session_state.user, f"{p_no} SN:{sn} ({cond})")
                except Exception as e: st.error(f"失败: {e}")
                finally: conn_w.close()

    elif task == "审批出库":
        conn = get_conn()
        pending = pd.read_sql("SELECT * FROM requests WHERE status='pending'", conn)
        conn.close()
        if pending.empty: st.info("无待审批申请")
        else:
            for idx, row in pending.iterrows():
                req_sns = row.get('requested_sns', 'NA')
                with st.expander(f"申请 #{row['id']} | {row['applicant']} | {row['part_no']} x {row['qty']}"):
                    st.write(f"**申领地**: {row['project_location']}")
                    st.info(f"**预选序列号**: {req_sns}")
                    conn_c = get_conn()
                    t_sns = req_sns.split(",") if req_sns and req_sns!='NA' else []
                    if t_sns:
                        ph = ",".join(["?"]*len(t_sns))
                        valid = pd.read_sql(f"SELECT serial_number FROM inventory WHERE serial_number IN ({ph}) AND status=0", conn_c, params=t_sns)['serial_number'].tolist()
                    else: valid=[]
                    conn_c.close()
                    if len(valid)<len(t_sns): st.error("部分备件已不在库！")
                    c_a, c_r = st.columns([1,1])
                    if c_a.button("✅ 批准", key=f"ap{row['id']}"):
                        c = get_conn()
                        c.execute("UPDATE requests SET status='approved', approved_sns=?, approver=? WHERE id=?", (req_sns, st.session_state.user, row['id']))
                        for s in t_sns: c.execute("UPDATE inventory SET status=1, outbound_time=?, receiver=?, approver=?, project_location=? WHERE serial_number=?", (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), row['applicant'], st.session_state.user, row['project_location'], s))
                        c.commit()
                        c.close()
                        log_action("Outbound", "批准", st.session_state.user, f"ID:{row['id']}")
                        st.rerun()
                    if c_r.button("❌ 驳回", key=f"rj{row['id']}"):
                        c = get_conn()
                        c.execute("UPDATE requests SET status='rejected', approver=? WHERE id=?", (st.session_state.user, row['id']))
                        c.commit()
                        c.close()
                        log_action("Outbound", "驳回", st.session_state.user, f"ID:{row['id']}")
                        st.rerun()

    elif task == "库存编辑":
        st.subheader("🛠️ 修改在库备件信息")
        ssn = st.text_input("输入序列号搜索")
        if ssn:
            conn = get_conn()
            it = pd.read_sql("SELECT * FROM inventory WHERE serial_number=? AND status=0", conn, params=[ssn])
            conn.close()
            if not it.empty:
                curr = it.iloc[0]
                with st.form("ed"):
                    n_sub = st.text_input("子公司", curr['subsidiary'])
                    n_wh = st.text_input("仓库", curr['warehouse'])
                    n_cd = st.selectbox("状态", ["全新", "利旧/返还"], index=0 if curr.get('condition')=='全新' else 1)
                    if st.form_submit_button("保存"):
                        c = get_conn()
                        c.execute("UPDATE inventory SET subsidiary=?, warehouse=?, condition=? WHERE id=?", (n_sub, n_wh, n_cd, curr['id']))
                        c.commit()
                        c.close()
                        st.success("更新成功")
                        log_action("InventoryEdit", "编辑", st.session_state.user, ssn)
            else: st.warning("未找到")

    elif task == "批量导入/导出":
        st.subheader("批量处理")
        conn = get_conn()
        df_ex = pd.read_sql("SELECT i.part_no as 备件号, t.part_name as 备件名称, i.serial_number as 序列号, i.subsidiary as 所属子公司, i.warehouse as 所在仓库, i.condition as 新旧状态 FROM inventory i LEFT JOIN part_types t ON i.part_no=t.part_no WHERE i.status=0", conn)
        conn.close()
        st.download_button("导出CSV", df_ex.to_csv(index=False).encode('utf-8'), "export.csv")
        st.divider()
        with open(TEMPLATE_FILE, "rb") as f: st.download_button("下载模板", f, "template.xlsx")
        up = st.file_uploader("上传", type=['xlsx','csv'])
        if up and st.button("导入"):
            try:
                df = pd.read_csv(up) if up.name.endswith('.csv') else pd.read_excel(up)
                succ, u_cnt, fail = 0,0,0
                conn = get_conn()
                for _, r in df.iterrows():
                    try:
                        p, n, s, sub, wh = str(r['备件号']), str(r['备件名称']), str(r['序列号']), str(r['所属子公司']), str(r['所在仓库'])
                        cd = str(r['新旧状态']) if '新旧状态' in r else '全新'
                        conn.execute("INSERT OR IGNORE INTO part_types VALUES (?,?)", (p, n))
                        ex = conn.execute("SELECT id, status FROM inventory WHERE serial_number=?", (s,)).fetchone()
                        if ex:
                            if ex[1]==1:
                                conn.execute("UPDATE inventory SET status=0, subsidiary=?, warehouse=?, condition=?, inbound_time=?, inbound_operator=?, outbound_time=NULL WHERE id=?", (sub, wh, cd, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, ex[0]))
                                u_cnt+=1
                            else: fail+=1
                        else:
                            conn.execute("INSERT INTO inventory (part_no, serial_number, subsidiary, warehouse, inbound_time, status, inbound_operator, condition) VALUES (?,?,?,?,?,0,?,?)", (p, s, sub, wh, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, cd))
                            succ+=1
                    except: fail+=1
                conn.commit()
                conn.close()
                st.success(f"新增 {succ}, 返还 {u_cnt}, 失败 {fail}")
                log_action("Inbound", "批量导入", st.session_state.user, f"{succ}/{u_cnt}")
            except Exception as e: st.error(str(e))

# --- Operator: 使用者 ---
def section_operator():
    st.header(f"🙋‍♂️ 备件中心 (Operator: {st.session_state.user})")
    tab1, tab2, tab3 = st.tabs(["申请出库", "历史记录", "📷 扫码查询"])
    
    with tab1:
        conn = get_conn()
        types = pd.read_sql("SELECT part_no, part_name FROM part_types", conn)
        conn.close()
        sel = st.selectbox("1. 选择备件", ["--"] + [f"{r['part_no']} | {r['part_name']}" for _, r in types.iterrows()])
        if sel != "--":
            p = sel.split(" | ")[0]
            conn = get_conn()
            subs = pd.read_sql("SELECT DISTINCT subsidiary FROM inventory WHERE part_no=? AND status=0", conn, params=[p])
            conn.close()
            if not subs.empty:
                ss = st.selectbox("2. 子公司", subs['subsidiary'])
                conn = get_conn()
                whs = pd.read_sql("SELECT DISTINCT warehouse FROM inventory WHERE part_no=? AND subsidiary=? AND status=0", conn, params=[p, ss])
                conn.close()
                sw = st.selectbox("3. 仓库", whs['warehouse'])
                conn = get_conn()
                sns = pd.read_sql("SELECT serial_number, condition FROM inventory WHERE part_no=? AND subsidiary=? AND warehouse=? AND status=0", conn, params=[p, ss, sw])
                conn.close()
                opts = [f"{r['serial_number']} ({r['condition']})" for _, r in sns.iterrows()]
                with st.form("req"):
                    sls = st.multiselect("4. 勾选序列号", opts)
                    loc = st.text_input("项目")
                    if st.form_submit_button("提交"):
                        if sls and loc:
                            rs = [x.split(" (")[0] for x in sls]
                            c = get_conn()
                            c.execute("INSERT INTO requests (part_no, qty, project_location, applicant, timestamp, requested_sns) VALUES (?,?,?,?,?,?)", (p, len(rs), loc, st.session_state.user, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), ",".join(rs)))
                            c.commit()
                            c.close()
                            st.success("提交成功")
            else: st.warning("无库存")

    with tab2:
        conn = get_conn()
        df = pd.read_sql("SELECT timestamp, part_no, qty, status, approved_sns FROM requests WHERE applicant=? ORDER BY timestamp DESC LIMIT 50", conn, params=[st.session_state.user])
        conn.close()
        def hl(v): return f'color: {"#28a745" if v=="approved" else "#dc3545" if v=="rejected" else "#ffc107"}; font-weight: bold'
        st.dataframe(df.style.applymap(hl, subset=['status']), use_container_width=True)

    # === v0.7 改造: 自动扫码 ===
    with tab3:
        st.subheader("📷 自动扫码查询")
        if not CV2_AVAILABLE:
            st.error("⚠️ 未检测到 OpenCV 库。")
        else:
            if st.button("🟢 启动摄像头", key="op_scan_start"):
                code = stream_scan_qr()
                if code:
                    st.session_state['scan_res_op'] = code
                    st.rerun()
            
            if 'scan_res_op' in st.session_state:
                st.divider()
                render_scan_result(st.session_state['scan_res_op'])
                if st.button("清除", key="op_cls"):
                    del st.session_state['scan_res_op']
                    st.rerun()

# --- 通用: 改密 ---
def section_change_pwd():
    with st.sidebar.expander("🔐 修改密码"):
        old = st.text_input("旧密码", type="password")
        new = st.text_input("新密码", type="password")
        if st.button("修改"):
            conn = get_conn()
            real = conn.execute("SELECT password FROM users WHERE username=?", (st.session_state.user,)).fetchone()[0]
            if hash_pwd(old) != real: st.error("错误")
            else:
                conn.execute("UPDATE users SET password=? WHERE username=?", (hash_pwd(new), st.session_state.user))
                conn.commit()
                st.success("成功")
            conn.close()

# === 4. 主入口 ===
def main():
    st.set_page_config(page_title="备件管理系统 v0.7", layout="wide")
    check_and_migrate_db()
    init_system()
    
    if 'logged_in' not in st.session_state: st.session_state.logged_in = False
    
    if not st.session_state.logged_in:
        st.title("🏭 备件管理系统 v0.7")
        c1, c2 = st.columns([1,2])
        with c1: st.info("请联系管理员获取初始密码。如需自定义，请配置 ADMIN_PWD 环境变量后重启应用。")
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
                else: st.error("失败")
    else:
        st.sidebar.title(f"用户: {st.session_state.user}")
        section_change_pwd()
        if st.sidebar.button("退出"):
            st.session_state.logged_in = False
            st.rerun()
            
        role = st.sidebar.radio("导航", [r for r in ["Admin面板", "Manager面板", "Operator面板"] if r.split("面板")[0].lower() in st.session_state.roles])
        
        if role == "Admin面板": section_admin()
        elif role == "Manager面板": section_manager()
        elif role == "Operator面板": section_operator()

if __name__ == "__main__":
    main()