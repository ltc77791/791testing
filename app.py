import streamlit as st
import sqlite3
import pandas as pd
import hashlib
from datetime import datetime

# === 配置与常量 ===
DB_FILE = 'inventory.db'
ROLES = {
    'admin': '高级管理员 (账户管理)',
    'manager': '备件管理员 (出入库审核)',
    'user': '普通用户 (查询申领)'
}

# === 1. 数据库初始化 ===
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 用户表
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT,
        role TEXT
    )''')
    
    # 备件表
    c.execute('''CREATE TABLE IF NOT EXISTS parts (
        part_no TEXT PRIMARY KEY,
        name TEXT,
        spec TEXT,
        location TEXT,
        stock INTEGER DEFAULT 0
    )''')
    
    # 申请单表
    c.execute('''CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_no TEXT,
        qty INTEGER,
        applicant TEXT,
        status TEXT DEFAULT 'pending',
        serial_numbers TEXT,
        timestamp TEXT
    )''')
    
    # 日志表
    c.execute('''CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_no TEXT,
        action TEXT,
        qty INTEGER,
        serial_numbers TEXT,
        operator TEXT,
        timestamp TEXT
    )''')
    
    # 初始化默认超级管理员
    c.execute("SELECT * FROM users WHERE username='admin'")
    if not c.fetchone():
        pwd_hash = hashlib.sha256("123456".encode()).hexdigest()
        c.execute("INSERT INTO users VALUES (?, ?, ?)", ('admin', pwd_hash, 'admin'))
        c.execute("INSERT INTO users VALUES (?, ?, ?)", ('manager', pwd_hash, 'manager'))
        c.execute("INSERT INTO users VALUES (?, ?, ?)", ('user', pwd_hash, 'user'))
        c.execute("INSERT OR IGNORE INTO parts (part_no, name, spec, location, stock) VALUES ('BJ001', '5号轴承', '50mm', 'A-01', 10)")
        c.execute("INSERT OR IGNORE INTO parts (part_no, name, spec, location, stock) VALUES ('BJ002', '控制器', 'X200', 'B-05', 2)")
        conn.commit()
    
    conn.close()

# === 2. 通用工具函数 ===
def get_conn():
    return sqlite3.connect(DB_FILE)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def check_login(username, password):
    conn = get_conn()
    c = conn.cursor()
    pwd_hash = hash_password(password)
    c.execute("SELECT role FROM users WHERE username=? AND password=?", (username, pwd_hash))
    result = c.fetchone()
    conn.close()
    return result[0] if result else None

# === 3. 核心模块 ===

# --- 登录模块 ---
def login_page():
    st.title("🔐 企业备件管理系统")
    col1, col2 = st.columns([1, 2])
    with col1:
        st.info("**默认测试账号**\n\nadmin / 123456\n\nmanager / 123456\n\nuser / 123456")
    with col2:
        username = st.text_input("用户名")
        password = st.text_input("密码", type="password")
        if st.button("登录", type="primary"):
            role = check_login(username, password)
            if role:
                st.session_state['logged_in'] = True
                st.session_state['user'] = username
                st.session_state['role'] = role
                st.rerun()
            else:
                st.error("用户名或密码错误")

# --- 共用模块：申请管理（admin/manager 查看所有申请） ---
def render_application_management(conn):
    st.subheader("📋 申请管理（所有申请记录）")

    status_filter = st.selectbox("按状态筛选", ["全部", "pending", "approved", "rejected"])
    if status_filter == "全部":
        all_reqs = pd.read_sql("SELECT id, timestamp, applicant, part_no, qty, status, serial_numbers FROM requests ORDER BY id DESC", conn)
    else:
        all_reqs = pd.read_sql("SELECT id, timestamp, applicant, part_no, qty, status, serial_numbers FROM requests WHERE status=? ORDER BY id DESC", conn, params=(status_filter,))

    if all_reqs.empty:
        st.info("暂无申请记录")
    else:
        def color_status(val):
            return f'color: {"green" if val=="approved" else "orange" if val=="pending" else "red"}'
        st.dataframe(all_reqs.style.applymap(color_status, subset=['status']), use_container_width=True)

# --- 模块：高级管理员 (修复版) ---
def admin_dashboard():
    st.header(f"👤 用户与权限管理 (当前: {st.session_state['user']})")
    menu = st.sidebar.radio("管理菜单", ["用户管理", "申请管理"])

    conn = get_conn()

    if menu == "申请管理":
        render_application_management(conn)
        conn.close()
        return

    tab1, tab2 = st.tabs(["📋 用户列表与删除", "➕ 新增用户"])
    
    with tab1:
        # 显示所有用户
        users_df = pd.read_sql("SELECT username, role FROM users", conn)
        
        # 简单美化表格
        st.dataframe(users_df, use_container_width=True)
        
        st.divider()
        st.subheader("🗑️ 删除用户")
        
        col_del, col_btn = st.columns([3, 1])
        with col_del:
            user_to_del = st.selectbox("选择要删除的用户", users_df['username'])
        with col_btn:
            st.write("") # 占位
            st.write("")
            if st.button("确认删除", type="primary"):
                if user_to_del == 'admin':
                    st.error("无法删除超级管理员！")
                elif user_to_del == st.session_state['user']:
                    st.error("不能删除自己！")
                else:
                    try:
                        conn.execute("DELETE FROM users WHERE username=?", (user_to_del,))
                        conn.commit()
                        st.success(f"用户 {user_to_del} 已被移除")
                        st.rerun() # 刷新页面
                    except Exception as e:
                        st.error(f"删除失败: {e}")

    with tab2:
        st.subheader("创建新账户")
        with st.form("new_user_form"):
            new_user = st.text_input("新用户名")
            new_pwd = st.text_input("初始密码", type="password")
            new_role_key = st.selectbox("分配角色", list(ROLES.keys()), format_func=lambda x: ROLES[x])
            
            submitted = st.form_submit_button("创建用户")
            if submitted:
                if not new_user or not new_pwd:
                    st.warning("用户名和密码不能为空")
                else:
                    try:
                        pwd_hash = hash_password(new_pwd)
                        conn.execute("INSERT INTO users (username, password, role) VALUES (?,?,?)", 
                                     (new_user, pwd_hash, new_role_key))
                        conn.commit()
                        st.success(f"用户 {new_user} 创建成功！角色: {ROLES[new_role_key]}")
                    except sqlite3.IntegrityError:
                        st.error("该用户名已存在，请更换")
                    except Exception as e:
                        st.error(f"系统错误: {e}")
    
    conn.close()

# --- 模块：备件管理员 (带序列号审批) ---
def manager_dashboard():
    st.header(f"📦 库存与审批中心 (当前: {st.session_state['user']})")
    menu = st.sidebar.radio("管理菜单", ["待审批申请", "申请管理", "备件入库/建档", "全局流水日志", "库存查询"])
    conn = get_conn()
    
    # 1. 审批流
    if menu == "待审批申请":
        st.subheader("🔔 待处理申请")
        pending = pd.read_sql("SELECT * FROM requests WHERE status='pending'", conn)
        
        if pending.empty:
            st.info("暂无待审批申请")
        else:
            for index, row in pending.iterrows():
                with st.expander(f"申请单 #{row['id']} | 申请人: {row['applicant']} | {row['part_no']} x {row['qty']}"):
                    col_input, col_act = st.columns([3, 1])
                    
                    with col_input:
                        sn_val = st.text_input(f"录入序列号 (逗号分隔)", key=f"sn_{row['id']}", placeholder="例如: SN001, SN002")
                    
                    with col_act:
                        st.write("")
                        if st.button("✅ 批准出库", key=f"app_{row['id']}"):
                            if not sn_val:
                                st.error("必须填写序列号！")
                            else:
                                # 检查库存
                                cur = conn.cursor()
                                cur.execute("SELECT stock FROM parts WHERE part_no=?", (row['part_no'],))
                                stock = cur.fetchone()[0]
                                if stock < row['qty']:
                                    st.error("库存不足！")
                                else:
                                    # 扣库存 + 更新申请 + 记日志
                                    cur.execute("UPDATE parts SET stock = stock - ? WHERE part_no=?", (row['qty'], row['part_no']))
                                    cur.execute("UPDATE requests SET status='approved', serial_numbers=? WHERE id=?", (sn_val, row['id']))
                                    cur.execute("INSERT INTO logs (part_no, action, qty, serial_numbers, operator, timestamp) VALUES (?,?,?,?,?,?)",
                                                (row['part_no'], '审批出库', row['qty'], sn_val, st.session_state['user'], datetime.now()))
                                    conn.commit()
                                    st.success("操作成功")
                                    st.rerun()

                        if st.button("❌ 驳回", key=f"rej_{row['id']}"):
                            conn.execute("UPDATE requests SET status='rejected' WHERE id=?", (row['id'],))
                            conn.commit()
                            st.rerun()

    # 2. 申请管理
    elif menu == "申请管理":
        render_application_management(conn)

    # 3. 入库/建档
    elif menu == "备件入库/建档":
        tab_in, tab_new = st.tabs(["现有备件入库", "新建备件档案"])
        with tab_in:
            df_parts = pd.read_sql("SELECT part_no, name, stock FROM parts", conn)
            if df_parts.empty:
                st.warning("暂无备件档案，请先新建")
            else:
                sel_part = st.selectbox("选择备件", df_parts['part_no'] + " - " + df_parts['name'])
                sel_no = sel_part.split(" - ")[0]
                add_qty = st.number_input("入库数量", min_value=1)
                
                # 入库也可以选填序列号（可选需求，这里仅做数量增加）
                if st.button("确认入库"):
                    conn.execute("UPDATE parts SET stock = stock + ? WHERE part_no=?", (add_qty, sel_no))
                    conn.execute("INSERT INTO logs (part_no, action, qty, operator, timestamp) VALUES (?,?,?,?,?)",
                                 (sel_no, '入库', add_qty, st.session_state['user'], datetime.now()))
                    conn.commit()
                    st.success("入库成功")
        
        with tab_new:
            n_no = st.text_input("新编号 (唯一)")
            n_name = st.text_input("名称")
            n_spec = st.text_input("规格")
            n_loc = st.text_input("位置")
            if st.button("创建档案"):
                try:
                    conn.execute("INSERT INTO parts (part_no, name, spec, location, stock) VALUES (?,?,?,?,0)", 
                                 (n_no, n_name, n_spec, n_loc))
                    conn.commit()
                    st.success("建档成功")
                except:
                    st.error("编号重复")

    # 3. 日志与查询
    elif menu == "全局流水日志":
        st.subheader("📜 全局日志 (含序列号)")
        logs = pd.read_sql("SELECT timestamp, operator, action, part_no, qty, serial_numbers FROM logs ORDER BY id DESC", conn)
        st.dataframe(logs, use_container_width=True)

    elif menu == "库存查询":
        df = pd.read_sql("SELECT * FROM parts", conn)
        st.dataframe(df, use_container_width=True)

    conn.close()

# --- 模块：普通用户 ---
def user_dashboard():
    # 权限隔离：仅 user 角色可以访问申请功能
    if st.session_state['role'] != 'user':
        st.error("管理员和审批员无权提交申请，权限隔离！")
        return

    st.header(f"🙋‍♂️ 备件中心 (当前: {st.session_state['user']})")
    menu = st.sidebar.radio("功能", ["查询与申领", "我的申请记录"])
    conn = get_conn()

    if menu == "查询与申领":
        search = st.text_input("🔍 搜索备件")
        query = "SELECT part_no, name, spec, location, stock FROM parts"
        if search:
            query += f" WHERE name LIKE '%{search}%' OR part_no LIKE '%{search}%'"
        
        df = pd.read_sql(query, conn)
        st.dataframe(df, use_container_width=True)
        
        st.divider()
        st.subheader("📝 提交申请")
        with st.form("req_form"):
            if df.empty:
                st.warning("暂无备件可申请")
            else:
                p_no = st.selectbox("选择备件", df['part_no'].unique())
                qty = st.number_input("数量", min_value=1, value=1)
                if st.form_submit_button("提交申请"):
                    conn.execute("INSERT INTO requests (part_no, qty, applicant, status, timestamp) VALUES (?,?,?,?,?)",
                                 (p_no, qty, st.session_state['user'], 'pending', datetime.now()))
                    conn.commit()
                    st.success("已提交，待审核")

    elif menu == "我的申请记录":
        st.subheader("📋 我的领用历史")
        my_reqs = pd.read_sql(f"SELECT timestamp, part_no, qty, status, serial_numbers FROM requests WHERE applicant='{st.session_state['user']}' ORDER BY id DESC", conn)
        
        def color_status(val):
            return f'color: {"green" if val=="approved" else "orange" if val=="pending" else "red"}'
        
        st.dataframe(my_reqs.style.applymap(color_status, subset=['status']), use_container_width=True)

    conn.close()

# === 4. 主程序入口 ===
def main():
    st.set_page_config(page_title="备件管理系统", layout="wide")
    init_db()
    
    if 'logged_in' not in st.session_state:
        st.session_state['logged_in'] = False
        st.session_state['role'] = None

    if not st.session_state['logged_in']:
        login_page()
    else:
        # 侧边栏登出
        with st.sidebar:
            st.info(f"当前用户: **{st.session_state['user']}**")
            st.caption(f"角色: {ROLES.get(st.session_state['role'], '未知')}")
            
            if st.button("退出登录"):
                st.session_state['logged_in'] = False
                st.rerun()
            st.divider()

        # 路由分发
        role = st.session_state['role']
        if role == 'admin':
            admin_dashboard()
        elif role == 'manager':
            manager_dashboard()
        elif role == 'user':
            user_dashboard()

if __name__ == "__main__":
    main()