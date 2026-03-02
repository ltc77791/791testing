import streamlit as st
import sqlite3
import pandas as pd
import hashlib
import os
from datetime import datetime, timedelta
import time
import math

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
PAGE_SIZE = 20  # C10: 每页显示条数

# === 1. 数据库与初始化 ===
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
        # B6: 库存预锁定字段
        if 'reserved_request_id' not in inv_cols:
            c.execute("ALTER TABLE inventory ADD COLUMN reserved_request_id INTEGER DEFAULT 0")
            conn.commit()

        c.execute("PRAGMA table_info(requests)")
        req_cols = [info[1] for info in c.fetchall()]
        if 'requested_sns' not in req_cols:
            c.execute("ALTER TABLE requests ADD COLUMN requested_sns TEXT")
            conn.commit()
        # B5: 驳回原因字段
        if 'reject_reason' not in req_cols:
            c.execute("ALTER TABLE requests ADD COLUMN reject_reason TEXT")
            conn.commit()
        # D14: 审批时间字段
        if 'approved_time' not in req_cols:
            c.execute("ALTER TABLE requests ADD COLUMN approved_time TEXT")
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
        condition TEXT,
        reserved_request_id INTEGER DEFAULT 0
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
        timestamp TEXT,
        reject_reason TEXT,
        approved_time TEXT
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
        pwd = hashlib.sha256("123456".encode()).hexdigest()
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

# E16: 状态高亮函数（使用 map 替代已废弃的 applymap）
def status_highlight(v):
    return f'color: {"#28a745" if v=="approved" else "#dc3545" if v in ("rejected","cancelled") else "#ffc107"}; font-weight: bold'

# C10: 分页 dataframe 显示
def paginated_dataframe(df, key_prefix, page_size=PAGE_SIZE, style_func=None, style_subset=None):
    if df.empty:
        st.info("暂无数据")
        return
    total = len(df)
    total_pages = max(1, math.ceil(total / page_size))

    if total_pages <= 1:
        if style_func and style_subset:
            valid_cols = [c for c in style_subset if c in df.columns]
            if valid_cols:
                st.dataframe(df.style.map(style_func, subset=valid_cols), use_container_width=True)
            else:
                st.dataframe(df, use_container_width=True)
        else:
            st.dataframe(df, use_container_width=True)
        st.caption(f"共 {total} 条记录")
        return

    page = st.number_input("页码", min_value=1, max_value=total_pages, value=1, step=1, key=f"page_{key_prefix}")
    start = (page - 1) * page_size
    end = min(start + page_size, total)
    page_df = df.iloc[start:end].reset_index(drop=True)

    if style_func and style_subset:
        valid_cols = [c for c in style_subset if c in page_df.columns]
        if valid_cols:
            st.dataframe(page_df.style.map(style_func, subset=valid_cols), use_container_width=True)
        else:
            st.dataframe(page_df, use_container_width=True)
    else:
        st.dataframe(page_df, use_container_width=True)
    st.caption(f"第 {start+1}-{end} 条，共 {total} 条记录")

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

    cap.release()
    frame_placeholder.empty() # 清除视频画面
    return detected_code

def render_scan_result(part_no_scanned):
    """(保持 v0.6.1 逻辑) 显示扫描结果"""
    st.success(f"🔍 扫描成功！备件号: **{part_no_scanned}**")

    conn = get_conn()
    info = pd.read_sql(f"SELECT * FROM part_types WHERE part_no='{part_no_scanned}'", conn)

    if info.empty:
        st.warning("系统内未找到该备件号的定义信息。")
    else:
        p_name = info.iloc[0]['part_name']
        st.markdown(f"### {p_name} ({part_no_scanned})")

        inv = pd.read_sql(f"SELECT serial_number, subsidiary, warehouse, condition, status FROM inventory WHERE part_no='{part_no_scanned}' AND status=0", conn)

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

# --- Admin: 用户管理 ---
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
        # C8: 删除用户需二次确认
        need_confirm = action == "删除用户"
        if need_confirm:
            confirm = st.checkbox(f"⚠️ 确认删除用户 [{target_user}]，此操作不可撤销", key="cfm_del_user")
        if st.button("执行操作"):
            if need_confirm and not confirm:
                st.warning("请先勾选确认框")
            else:
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
        conn_log.close()
        paginated_dataframe(logs, "admin_userlogs")

# --- Manager: 备件管理 ---
def section_manager():
    st.header("📦 备件管理 (Manager)")
    task = st.radio("业务流", ["库存查询与日志", "📷 扫码查询", "备件入库", "审批出库", "库存编辑", "备件类型管理", "批量导入/导出", "数据分析", "系统日志"], horizontal=True)

    # === v0.7 改造: 自动扫码 ===
    if task == "📷 扫码查询":
        st.subheader("📷 自动扫码查询")
        if not CV2_AVAILABLE:
            st.error("⚠️ 未检测到 OpenCV 库，无法使用实时扫码。请 pip install opencv-python")
        else:
            col1, col2 = st.columns([1, 4])
            with col1:
                start = st.button("🟢 启动摄像头", key="mgr_scan_start")

            if start:
                code = stream_scan_qr()
                if code:
                    st.session_state['scan_res_mgr'] = code
                    st.rerun()

            if 'scan_res_mgr' in st.session_state:
                st.divider()
                render_scan_result(st.session_state['scan_res_mgr'])
                if st.button("清除结果", key="mgr_cls"):
                    del st.session_state['scan_res_mgr']
                    st.rerun()

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
            paginated_dataframe(df_inv, "mgr_inv")
        with t2:
            df_in = pd.read_sql("SELECT i.part_no, t.part_name, i.serial_number, i.condition as 新旧, i.inbound_time, i.warehouse, i.subsidiary, i.inbound_operator as 操作员 FROM inventory i LEFT JOIN part_types t ON i.part_no = t.part_no ORDER BY i.inbound_time DESC", conn)
            paginated_dataframe(df_in, "mgr_inbound")
        with t3:
            df_out = pd.read_sql("SELECT r.part_no, t.part_name, r.approved_sns as 序列号, r.status as 状态, r.project_location, r.applicant, r.approver, r.timestamp, r.approved_time as 审批时间 FROM requests r LEFT JOIN part_types t ON r.part_no = t.part_no ORDER BY r.timestamp DESC", conn).fillna('NA')
            paginated_dataframe(df_out, "mgr_outbound", style_func=status_highlight, style_subset=['状态'])
        with t4:
            df_edit = pd.read_sql("SELECT * FROM sys_logs WHERE category='InventoryEdit' ORDER BY id DESC", conn)
            paginated_dataframe(df_edit, "mgr_editlog")
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
                            conn_w.execute("UPDATE inventory SET status=0, subsidiary=?, warehouse=?, condition=?, inbound_time=?, inbound_operator=?, part_no=?, outbound_time=NULL, reserved_request_id=0 WHERE id=?", (sub, wh, cond, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, p_no, ex[0]))
                            conn_w.commit()
                            st.success(f"返还入库成功！SN:{sn}")
                            log_action("Inbound", "返还入库", st.session_state.user, f"{p_no} SN:{sn} ({cond})")
                    else:
                        if is_new: conn_w.execute("INSERT OR IGNORE INTO part_types VALUES (?,?)", (p_no, p_name))
                        conn_w.execute("INSERT INTO inventory (part_no, serial_number, subsidiary, warehouse, inbound_time, status, inbound_operator, condition, reserved_request_id) VALUES (?,?,?,?,?,0,?,?,0)", (p_no, sn, sub, wh, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, cond))
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
                with st.expander(f"申请 #{row['id']} | {row['applicant']} | {row['part_no']} x {row['qty']}"):
                    st.write(f"**申请人**: {row['applicant']}　|　**项目/用途**: {row['project_location']}　|　**申请时间**: {row['timestamp']}")
                    st.write(f"**备件号**: {row['part_no']}　|　**申请数量**: {row['qty']}")

                    # 查询该备件号的可用库存供 Manager 选择
                    conn_c = get_conn()
                    avail_sns = pd.read_sql(f"SELECT serial_number, subsidiary, warehouse, condition FROM inventory WHERE part_no='{row['part_no']}' AND status=0 AND (reserved_request_id IS NULL OR reserved_request_id=0)", conn_c)
                    conn_c.close()

                    if avail_sns.empty:
                        st.error(f"⚠️ 备件号 {row['part_no']} 当前无可用库存")
                    else:
                        st.write(f"📦 **可用库存** (共 {len(avail_sns)} 件):")
                        st.dataframe(avail_sns, use_container_width=True)

                    # Manager 选择要下发的具体 SN
                    sn_options = [f"{r['serial_number']} | {r['subsidiary']} | {r['warehouse']} ({r['condition']})" for _, r in avail_sns.iterrows()] if not avail_sns.empty else []
                    selected = st.multiselect(f"选择下发的序列号（需 {row['qty']} 件）", sn_options, key=f"sel_sns_{row['id']}")
                    selected_sns = [s.split(" | ")[0] for s in selected]

                    # C8: 审批确认
                    confirm_approve = st.checkbox("确认批准此申请", key=f"cfm_ap{row['id']}")
                    c_a, c_r = st.columns([1,1])
                    if c_a.button("✅ 批准", key=f"ap{row['id']}"):
                        if not selected_sns:
                            st.warning("请先选择要下发的序列号")
                        elif len(selected_sns) != row['qty']:
                            st.warning(f"已选 {len(selected_sns)} 件，申请数量为 {row['qty']} 件，请调整")
                        elif not confirm_approve:
                            st.warning("请先勾选确认框")
                        else:
                            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            c = get_conn()
                            approved_sns_str = ",".join(selected_sns)
                            c.execute("UPDATE requests SET status='approved', approved_sns=?, approver=?, approved_time=? WHERE id=?",
                                      (approved_sns_str, st.session_state.user, now_str, row['id']))
                            for s in selected_sns:
                                c.execute("UPDATE inventory SET status=1, outbound_time=?, receiver=?, approver=?, project_location=? WHERE serial_number=?",
                                          (now_str, row['applicant'], st.session_state.user, row['project_location'], s))
                            c.commit()
                            c.close()
                            log_action("Outbound", "批准", st.session_state.user, f"ID:{row['id']} SN:{approved_sns_str}")
                            st.rerun()

                    # B5: 驳回原因
                    reject_reason = st.text_input("驳回原因（驳回时必填）", key=f"rr{row['id']}")
                    if c_r.button("❌ 驳回", key=f"rj{row['id']}"):
                        if not reject_reason.strip():
                            st.warning("请填写驳回原因")
                        else:
                            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            c = get_conn()
                            c.execute("UPDATE requests SET status='rejected', approver=?, reject_reason=?, approved_time=? WHERE id=?",
                                      (st.session_state.user, reject_reason.strip(), now_str, row['id']))
                            c.commit()
                            c.close()
                            log_action("Outbound", "驳回", st.session_state.user, f"ID:{row['id']} 原因:{reject_reason.strip()}")
                            st.rerun()

    # C9: 库存编辑增强
    elif task == "库存编辑":
        st.subheader("🛠️ 修改在库备件信息")
        conn = get_conn()
        # C9: 多维筛选
        c1, c2, c3 = st.columns(3)
        with c1:
            ssn = st.text_input("序列号（支持模糊搜索）")
        with c2:
            all_parts = pd.read_sql("SELECT DISTINCT part_no FROM inventory WHERE status=0", conn)
            filter_part = st.selectbox("按备件号筛选", ["全部"] + all_parts['part_no'].tolist())
        with c3:
            all_subs = pd.read_sql("SELECT DISTINCT subsidiary FROM inventory WHERE status=0", conn)
            filter_sub = st.selectbox("按子公司筛选", ["全部"] + all_subs['subsidiary'].tolist())

        # 构建查询
        query = "SELECT i.*, t.part_name FROM inventory i LEFT JOIN part_types t ON i.part_no=t.part_no WHERE i.status=0"
        if ssn:
            query += f" AND i.serial_number LIKE '%{ssn}%'"
        if filter_part != "全部":
            query += f" AND i.part_no='{filter_part}'"
        if filter_sub != "全部":
            query += f" AND i.subsidiary='{filter_sub}'"

        results = pd.read_sql(query, conn)
        conn.close()

        if results.empty:
            st.warning("未找到匹配的库存记录")
        else:
            st.dataframe(results[['part_no', 'part_name', 'serial_number', 'condition', 'subsidiary', 'warehouse']], use_container_width=True)
            st.divider()
            # 选择要编辑的记录
            edit_sn = st.selectbox("选择要编辑的序列号", results['serial_number'].tolist())
            if edit_sn:
                curr = results[results['serial_number']==edit_sn].iloc[0]
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
                        log_action("InventoryEdit", "编辑", st.session_state.user, f"SN:{edit_sn} 子公司:{n_sub} 仓库:{n_wh} 状态:{n_cd}")

    # B7: 备件类型管理
    elif task == "备件类型管理":
        st.subheader("🏷️ 备件类型管理")
        conn = get_conn()
        types_df = pd.read_sql("SELECT t.part_no, t.part_name, COUNT(CASE WHEN i.status=0 THEN 1 END) as 在库数量, COUNT(i.id) as 历史总数 FROM part_types t LEFT JOIN inventory i ON t.part_no=i.part_no GROUP BY t.part_no, t.part_name", conn)
        conn.close()

        st.dataframe(types_df, use_container_width=True)

        t_add, t_edit, t_del = st.tabs(["新增类型", "修改名称", "删除类型"])

        with t_add:
            with st.form("add_type"):
                new_pno = st.text_input("新备件号")
                new_pname = st.text_input("新备件名称")
                if st.form_submit_button("新增"):
                    if not new_pno or not new_pname:
                        st.error("备件号和名称不能为空")
                    else:
                        conn = get_conn()
                        ex = conn.execute("SELECT 1 FROM part_types WHERE part_no=?", (new_pno,)).fetchone()
                        if ex:
                            st.error(f"备件号 {new_pno} 已存在")
                        else:
                            conn.execute("INSERT INTO part_types VALUES (?,?)", (new_pno, new_pname))
                            conn.commit()
                            log_action("PartType", "新增类型", st.session_state.user, f"{new_pno}: {new_pname}")
                            st.success(f"备件类型 {new_pno} 创建成功")
                            st.rerun()
                        conn.close()

        with t_edit:
            if not types_df.empty:
                edit_pno = st.selectbox("选择备件号", types_df['part_no'].tolist(), key="edit_type_sel")
                old_name = types_df[types_df['part_no']==edit_pno]['part_name'].values[0]
                with st.form("edit_type"):
                    new_name = st.text_input("新名称", value=old_name)
                    if st.form_submit_button("保存修改"):
                        if new_name and new_name != old_name:
                            conn = get_conn()
                            conn.execute("UPDATE part_types SET part_name=? WHERE part_no=?", (new_name, edit_pno))
                            conn.commit()
                            conn.close()
                            log_action("PartType", "修改名称", st.session_state.user, f"{edit_pno}: {old_name} -> {new_name}")
                            st.success("修改成功")
                            st.rerun()
            else:
                st.info("暂无备件类型")

        with t_del:
            if not types_df.empty:
                del_pno = st.selectbox("选择要删除的备件号", types_df['part_no'].tolist(), key="del_type_sel")
                inv_count = types_df[types_df['part_no']==del_pno]['历史总数'].values[0]
                if inv_count > 0:
                    st.warning(f"⚠️ 该备件号下有 {inv_count} 条库存记录，删除类型不会影响已有库存数据")
                # C8: 删除确认
                confirm_del = st.checkbox(f"确认删除备件类型 [{del_pno}]", key="cfm_del_type")
                if st.button("删除类型"):
                    if not confirm_del:
                        st.warning("请先勾选确认框")
                    else:
                        conn = get_conn()
                        conn.execute("DELETE FROM part_types WHERE part_no=?", (del_pno,))
                        conn.commit()
                        conn.close()
                        log_action("PartType", "删除类型", st.session_state.user, f"删除 {del_pno}")
                        st.success("类型已删除")
                        st.rerun()
            else:
                st.info("暂无备件类型")

    # D13: 批量导入/导出增强
    elif task == "批量导入/导出":
        st.subheader("批量处理")

        exp_tab, imp_tab = st.tabs(["数据导出", "数据导入"])

        with exp_tab:
            conn = get_conn()
            st.write("**在库库存导出**")
            df_ex = pd.read_sql("SELECT i.part_no as 备件号, t.part_name as 备件名称, i.serial_number as 序列号, i.subsidiary as 所属子公司, i.warehouse as 所在仓库, i.condition as 新旧状态 FROM inventory i LEFT JOIN part_types t ON i.part_no=t.part_no WHERE i.status=0", conn)
            st.download_button("📥 导出在库库存 CSV", df_ex.to_csv(index=False).encode('utf-8'), "inventory_export.csv", key="exp_inv")

            st.divider()
            # D13: 出库记录导出
            st.write("**出库记录导出**")
            df_out_exp = pd.read_sql("SELECT r.id as 申请ID, r.part_no as 备件号, t.part_name as 备件名称, r.requested_sns as 预选序列号, r.approved_sns as 批准序列号, r.status as 状态, r.project_location as 项目地, r.applicant as 申请人, r.approver as 审批人, r.timestamp as 申请时间, r.approved_time as 审批时间, r.reject_reason as 驳回原因 FROM requests r LEFT JOIN part_types t ON r.part_no=t.part_no ORDER BY r.timestamp DESC", conn).fillna('')
            st.download_button("📥 导出出库记录 CSV", df_out_exp.to_csv(index=False).encode('utf-8'), "outbound_export.csv", key="exp_out")

            st.divider()
            # D13: 系统日志导出
            st.write("**系统日志导出**")
            df_log_exp = pd.read_sql("SELECT * FROM sys_logs ORDER BY id DESC", conn)
            st.download_button("📥 导出系统日志 CSV", df_log_exp.to_csv(index=False).encode('utf-8'), "syslog_export.csv", key="exp_log")
            conn.close()

        with imp_tab:
            with open(TEMPLATE_FILE, "rb") as f: st.download_button("下载导入模板", f, "template.xlsx")
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
                                    conn.execute("UPDATE inventory SET status=0, subsidiary=?, warehouse=?, condition=?, inbound_time=?, inbound_operator=?, outbound_time=NULL, reserved_request_id=0 WHERE id=?", (sub, wh, cd, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, ex[0]))
                                    u_cnt+=1
                                else: fail+=1
                            else:
                                conn.execute("INSERT INTO inventory (part_no, serial_number, subsidiary, warehouse, inbound_time, status, inbound_operator, condition, reserved_request_id) VALUES (?,?,?,?,?,0,?,?,0)", (p, s, sub, wh, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), st.session_state.user, cd))
                                succ+=1
                        except: fail+=1
                    conn.commit()
                    conn.close()
                    st.success(f"新增 {succ}, 返还 {u_cnt}, 失败 {fail}")
                    log_action("Inbound", "批量导入", st.session_state.user, f"{succ}/{u_cnt}")
                except Exception as e: st.error(str(e))

    # === 数据分析模块 (Manager 专用) ===
    elif task == "数据分析":
        st.subheader("📊 数据分析")
        ana_tab1, ana_tab2, ana_tab3 = st.tabs(["库存总览", "出入库趋势", "库龄与周转"])
        conn = get_conn()
        now = datetime.now()

        # ---- 一、库存总览仪表盘 ----
        with ana_tab1:
            in_stock = conn.execute("SELECT COUNT(*) FROM inventory WHERE status=0").fetchone()[0]
            out_stock = conn.execute("SELECT COUNT(*) FROM inventory WHERE status=1").fetchone()[0]
            pending_cnt = conn.execute("SELECT COUNT(*) FROM requests WHERE status='pending'").fetchone()[0]
            month_start = now.strftime("%Y-%m-01")
            month_in = conn.execute("SELECT COUNT(*) FROM inventory WHERE inbound_time >= ?", (month_start,)).fetchone()[0]
            month_out = conn.execute("SELECT COUNT(*) FROM requests WHERE status='approved' AND approved_time >= ?", (month_start,)).fetchone()[0]

            k1, k2, k3, k4, k5 = st.columns(5)
            k1.metric("在库总数", in_stock)
            k2.metric("累计出库", out_stock)
            k3.metric("待审批", pending_cnt)
            k4.metric("本月入库", month_in)
            k5.metric("本月出库", month_out)

            st.divider()
            col_a, col_b = st.columns(2)

            with col_a:
                st.write("**按子公司 / 仓库分布**")
                df_dist = pd.read_sql("SELECT subsidiary as 子公司, warehouse as 仓库, COUNT(*) as 数量 FROM inventory WHERE status=0 GROUP BY subsidiary, warehouse ORDER BY 数量 DESC", conn)
                if not df_dist.empty:
                    st.dataframe(df_dist, use_container_width=True)
                    chart_dist = df_dist.copy()
                    chart_dist['位置'] = chart_dist['子公司'] + ' / ' + chart_dist['仓库']
                    st.bar_chart(chart_dist.set_index('位置')['数量'])
                else:
                    st.info("暂无库存数据")

            with col_b:
                st.write("**按备件类型分布**")
                df_type = pd.read_sql("SELECT i.part_no as 备件号, t.part_name as 备件名称, COUNT(*) as 在库数量 FROM inventory i LEFT JOIN part_types t ON i.part_no=t.part_no WHERE i.status=0 GROUP BY i.part_no ORDER BY 在库数量 DESC", conn)
                if not df_type.empty:
                    st.dataframe(df_type, use_container_width=True)
                    st.bar_chart(df_type.set_index('备件号')['在库数量'])
                else:
                    st.info("暂无库存数据")

        # ---- 二、出入库趋势分析 ----
        with ana_tab2:
            st.write("**月度出入库趋势**")
            # 入库按月统计
            df_in_monthly = pd.read_sql("SELECT strftime('%%Y-%%m', inbound_time) as 月份, COUNT(*) as 入库量 FROM inventory WHERE inbound_time IS NOT NULL GROUP BY 月份 ORDER BY 月份", conn)
            # 出库按月统计（以审批时间为准）
            df_out_monthly = pd.read_sql("SELECT strftime('%%Y-%%m', approved_time) as 月份, SUM(qty) as 出库量 FROM requests WHERE status='approved' AND approved_time IS NOT NULL GROUP BY 月份 ORDER BY 月份", conn)

            if not df_in_monthly.empty or not df_out_monthly.empty:
                df_trend = pd.merge(df_in_monthly, df_out_monthly, on='月份', how='outer').fillna(0).sort_values('月份')
                df_trend['入库量'] = df_trend['入库量'].astype(int)
                df_trend['出库量'] = df_trend['出库量'].astype(int)
                st.dataframe(df_trend, use_container_width=True)
                st.line_chart(df_trend.set_index('月份'))
            else:
                st.info("暂无出入库记录")

            st.divider()
            col_c, col_d = st.columns(2)

            with col_c:
                st.write("**备件消耗排行 Top 10**")
                months_back = st.selectbox("统计周期", ["近 3 个月", "近 6 个月", "近 12 个月", "全部"], key="consume_period")
                period_map = {"近 3 个月": 3, "近 6 个月": 6, "近 12 个月": 12, "全部": 0}
                m = period_map[months_back]
                if m > 0:
                    cutoff = (now - timedelta(days=m * 30)).strftime("%Y-%m-%d")
                    df_consume = pd.read_sql(f"SELECT r.part_no as 备件号, t.part_name as 备件名称, SUM(r.qty) as 出库总量 FROM requests r LEFT JOIN part_types t ON r.part_no=t.part_no WHERE r.status='approved' AND r.approved_time >= '{cutoff}' GROUP BY r.part_no ORDER BY 出库总量 DESC LIMIT 10", conn)
                else:
                    df_consume = pd.read_sql("SELECT r.part_no as 备件号, t.part_name as 备件名称, SUM(r.qty) as 出库总量 FROM requests r LEFT JOIN part_types t ON r.part_no=t.part_no WHERE r.status='approved' GROUP BY r.part_no ORDER BY 出库总量 DESC LIMIT 10", conn)
                if not df_consume.empty:
                    st.dataframe(df_consume, use_container_width=True)
                    st.bar_chart(df_consume.set_index('备件号')['出库总量'])
                else:
                    st.info("暂无出库记录")

            with col_d:
                st.write("**项目用量统计**")
                df_proj = pd.read_sql("SELECT project_location as 项目地, SUM(qty) as 出库总量, COUNT(*) as 申请次数 FROM requests WHERE status='approved' GROUP BY project_location ORDER BY 出库总量 DESC", conn)
                if not df_proj.empty:
                    st.dataframe(df_proj, use_container_width=True)
                    st.bar_chart(df_proj.set_index('项目地')['出库总量'])
                else:
                    st.info("暂无出库记录")

        # ---- 四、库龄与周转分析 ----
        with ana_tab3:
            st.write("**库龄分布**")
            df_age = pd.read_sql("SELECT i.part_no, t.part_name, i.serial_number, i.subsidiary, i.warehouse, i.inbound_time FROM inventory i LEFT JOIN part_types t ON i.part_no=t.part_no WHERE i.status=0 AND i.inbound_time IS NOT NULL", conn)
            if not df_age.empty:
                df_age['入库时间'] = pd.to_datetime(df_age['inbound_time'])
                df_age['库龄(天)'] = (now - df_age['入库时间']).dt.days

                def age_bucket(d):
                    if d <= 30: return '0-30天'
                    elif d <= 90: return '31-90天'
                    elif d <= 180: return '91-180天'
                    else: return '180天以上'
                df_age['库龄段'] = df_age['库龄(天)'].apply(age_bucket)

                bucket_order = ['0-30天', '31-90天', '91-180天', '180天以上']
                age_summary = df_age['库龄段'].value_counts().reindex(bucket_order, fill_value=0)
                col_e, col_f = st.columns(2)
                with col_e:
                    st.dataframe(age_summary.reset_index().rename(columns={'index': '库龄段', '库龄段': '库龄段', 'count': '数量'}), use_container_width=True)
                with col_f:
                    st.bar_chart(age_summary)

                # 呆滞预警
                st.divider()
                stale_days = st.slider("呆滞预警天数阈值", 30, 365, 90, step=30, key="stale_thresh")
                df_stale = df_age[df_age['库龄(天)'] >= stale_days][['part_no', 'part_name', 'serial_number', 'subsidiary', 'warehouse', '库龄(天)']].sort_values('库龄(天)', ascending=False)
                df_stale.columns = ['备件号', '备件名称', '序列号', '子公司', '仓库', '库龄(天)']
                if not df_stale.empty:
                    st.warning(f"共 {len(df_stale)} 件备件超过 {stale_days} 天未出库")
                    paginated_dataframe(df_stale.reset_index(drop=True), "stale_list")
                else:
                    st.success(f"无超过 {stale_days} 天的呆滞库存")
            else:
                st.info("暂无在库备件或缺少入库时间数据")

            # 周转率
            st.divider()
            st.write("**备件周转率**（近 6 个月）")
            cutoff_6m = (now - timedelta(days=180)).strftime("%Y-%m-%d")
            df_turnover_out = pd.read_sql(f"SELECT r.part_no, SUM(r.qty) as 出库量 FROM requests r WHERE r.status='approved' AND r.approved_time >= '{cutoff_6m}' GROUP BY r.part_no", conn)
            df_turnover_inv = pd.read_sql("SELECT part_no, COUNT(*) as 在库量 FROM inventory WHERE status=0 GROUP BY part_no", conn)
            if not df_turnover_out.empty:
                df_turnover = pd.merge(df_turnover_out, df_turnover_inv, on='part_no', how='left').fillna(0)
                df_turnover['在库量'] = df_turnover['在库量'].astype(int)
                names = pd.read_sql("SELECT part_no, part_name FROM part_types", conn)
                df_turnover = pd.merge(df_turnover, names, on='part_no', how='left')
                df_turnover['周转率'] = df_turnover.apply(lambda r: round(r['出库量'] / r['在库量'], 2) if r['在库量'] > 0 else float('inf'), axis=1)
                df_turnover = df_turnover[['part_no', 'part_name', '出库量', '在库量', '周转率']].sort_values('周转率', ascending=False)
                df_turnover.columns = ['备件号', '备件名称', '6个月出库量', '当前在库', '周转率']
                st.dataframe(df_turnover, use_container_width=True)
                st.caption("周转率 = 出库量 / 当前在库量 | inf 表示已无库存但有出库记录（高周转）")
            else:
                st.info("近 6 个月暂无出库记录")

        conn.close()

    # D12: 统一系统日志查询面板
    elif task == "系统日志":
        st.subheader("📋 系统日志查询")
        conn = get_conn()

        # 筛选控件
        c1, c2, c3 = st.columns(3)
        with c1:
            categories = pd.read_sql("SELECT DISTINCT category FROM sys_logs", conn)['category'].tolist()
            sel_cat = st.multiselect("按类别筛选", categories, default=[])
        with c2:
            operators = pd.read_sql("SELECT DISTINCT operator FROM sys_logs", conn)['operator'].tolist()
            sel_op = st.multiselect("按操作人筛选", operators, default=[])
        with c3:
            date_range = st.date_input("时间范围", value=(datetime.now() - timedelta(days=30), datetime.now()), key="log_date_range")

        # 构建查询
        query = "SELECT * FROM sys_logs WHERE 1=1"
        if sel_cat:
            cats = ",".join([f"'{c}'" for c in sel_cat])
            query += f" AND category IN ({cats})"
        if sel_op:
            ops = ",".join([f"'{o}'" for o in sel_op])
            query += f" AND operator IN ({ops})"
        if len(date_range) == 2:
            query += f" AND timestamp >= '{date_range[0].strftime('%Y-%m-%d')}' AND timestamp <= '{date_range[1].strftime('%Y-%m-%d')} 23:59:59'"
        query += " ORDER BY id DESC"

        df_logs = pd.read_sql(query, conn)
        conn.close()
        paginated_dataframe(df_logs, "mgr_syslogs")

# --- Operator: 使用者 ---
def section_operator():
    st.header(f"🙋‍♂️ 备件中心 (Operator: {st.session_state.user})")
    tab1, tab2, tab3 = st.tabs(["申请出库", "历史记录", "📷 扫码查询"])

    with tab1:
        conn = get_conn()
        types = pd.read_sql("SELECT part_no, part_name FROM part_types", conn)
        conn.close()
        sel = st.selectbox("1. 选择备件类型", ["--"] + [f"{r['part_no']} | {r['part_name']}" for _, r in types.iterrows()])
        if sel != "--":
            p = sel.split(" | ")[0]
            conn = get_conn()
            avail = conn.execute("SELECT COUNT(*) FROM inventory WHERE part_no=? AND status=0", (p,)).fetchone()[0]
            conn.close()
            st.info(f"当前可用库存: **{avail}** 件（具体备件由审批人在批准时分配）")
            with st.form("req"):
                qty = st.number_input("2. 申请数量", min_value=1, max_value=max(avail, 1), value=1)
                loc = st.text_input("3. 项目/用途")
                if st.form_submit_button("提交申请"):
                    if not loc:
                        st.error("请填写项目/用途")
                    elif qty > avail:
                        st.error(f"申请数量 ({qty}) 超过可用库存 ({avail})")
                    else:
                        c = get_conn()
                        c.execute("INSERT INTO requests (part_no, qty, project_location, applicant, timestamp) VALUES (?,?,?,?,?)",
                                  (p, qty, loc, st.session_state.user, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
                        c.commit()
                        c.close()
                        st.success(f"申请已提交！备件号: {p}，数量: {qty}，等待审批人分配具体备件")
                        log_action("Outbound", "申请出库", st.session_state.user, f"{p} x{qty} 项目:{loc}")

    with tab2:
        conn = get_conn()
        # C11: 增强历史记录展示字段（新流程：SN 由审批人分配，显示批准序列号）
        df = pd.read_sql(f"SELECT r.id as 申请ID, r.timestamp as 申请时间, r.part_no as 备件号, t.part_name as 备件名称, r.qty as 数量, r.status as 状态, r.project_location as 项目地, r.approved_sns as 批准序列号, r.approver as 审批人, r.approved_time as 审批时间, r.reject_reason as 驳回原因 FROM requests r LEFT JOIN part_types t ON r.part_no=t.part_no WHERE r.applicant='{st.session_state.user}' ORDER BY r.timestamp DESC", conn).fillna('')
        conn.close()
        paginated_dataframe(df, "op_history", style_func=status_highlight, style_subset=['状态'])

        # B4: 撤回 pending 申请
        if not df.empty:
            pending_df = df[df['状态'] == 'pending']
            if not pending_df.empty:
                st.divider()
                st.subheader("📝 可撤回的申请")
                for _, row in pending_df.iterrows():
                    rid = row['申请ID']
                    with st.expander(f"申请 #{rid} | {row['备件号']} x {row['数量']} | {row['项目地']}"):
                        st.write(f"**申请时间**: {row['申请时间']}")
                        # C8: 撤回确认
                        confirm_cancel = st.checkbox(f"确认撤回申请 #{rid}", key=f"cfm_cancel_{rid}")
                        if st.button(f"🔙 撤回申请 #{rid}", key=f"cancel_{rid}"):
                            if not confirm_cancel:
                                st.warning("请先勾选确认框")
                            else:
                                conn = get_conn()
                                now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                conn.execute("UPDATE requests SET status='cancelled', approved_time=? WHERE id=?", (now_str, rid))
                                conn.commit()
                                conn.close()
                                log_action("Outbound", "撤回申请", st.session_state.user, f"ID:{rid}")
                                st.success("申请已撤回")
                                st.rerun()

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
    st.set_page_config(page_title="备件管理系统 v0.8", layout="wide")
    check_and_migrate_db()
    init_system()

    if 'logged_in' not in st.session_state: st.session_state.logged_in = False

    if not st.session_state.logged_in:
        st.title("🏭 备件管理系统 v0.8")
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
