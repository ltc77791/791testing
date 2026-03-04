# 备件管理系统 · 编码工作计划

## 一、系统全景

```
┌─────────────────────────────────────────────────────────────────┐
│                    备件管理系统 · 全局架构                         │
├──────────────────────────┬──────────────────────────────────────┤
│     PC 管理后台 (Web)     │          微信小程序                   │
│     ◄ 当前开发目标 ►      │         ◄ 后续开发 ►                 │
│                          │                                      │
│  · 用户权限管理           │  · 备件入库 (扫码)                    │
│  · 数据分析仪表盘         │  · 库存查询 / 编辑                    │
│  · 批量导入导出           │  · 申请出库                           │
│                          │  · 审批出库 (含部分批准)                │
│  Vue3 + Element Plus     │  · 扫码查询                           │
│  + ECharts               │  · 备件类型管理                       │
│                          │  · 系统日志浏览                       │
│                          │                                      │
│                          │  原生 WXML/JS                        │
├──────────────────────────┴──────────────────────────────────────┤
│                        共享后端                                   │
│          本地开发: Express + MongoDB                              │
│          上线部署: 微信云函数 + 云数据库 + 静态托管                  │
│          认证: 本地开发用 JWT / 上线用微信扫码                      │
└─────────────────────────────────────────────────────────────────┘
```

## 二、技术栈

| 层级 | 组件 | 版本 | 用途 |
|------|------|------|------|
| 运行时 | Node.js | 18 LTS | 后端运行环境 |
| 后端框架 | Express | ^4.18 | 本地开发路由（上线后替换为云函数入口） |
| 数据库 | MongoDB | 7.0 (Community) | 模拟云数据库 |
| ODM | mongodb (官方驱动) | ^6.0 | 贴近云数据库原生 API |
| 认证 | jsonwebtoken | ^9.0 | 临时 JWT 登录 |
| 密码 | bcryptjs | ^2.4 | 密码哈希（纯 JS，无 C++ 依赖） |
| 参数校验 | joi | ^17.0 | 请求参数校验 |
| CORS | cors | ^2.8 | 本地前后端跨域 |
| 前端框架 | Vue | ^3.4 | SPA |
| 构建工具 | Vite | ^5.0 | 开发服务器 + 构建 |
| UI 组件库 | Element Plus | ^2.7 | 表格、表单、弹窗 |
| 图表 | ECharts | ^5.5 | 数据分析可视化 |
| Vue-ECharts | vue-echarts | ^7.0 | ECharts 的 Vue 封装 |
| Excel 解析 | xlsx (SheetJS CE) | ^0.18 | 前端解析 Excel 导入文件 |
| HTTP 客户端 | axios | ^1.7 | 前端调用后端 API |

## 三、目录结构

```
E:\Testing\791\
├── server\                      # 后端
│   ├── package.json
│   ├── .env
│   ├── src/
│   │   ├── index.js             # Express 入口
│   │   ├── config.js            # 读取 .env
│   │   ├── db.js                # MongoDB 连接
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT 验证
│   │   │   └── rbac.js          # requireRole('admin')
│   │   │
│   │   ├── routes/              # Express 路由壳
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── partTypes.js
│   │   │   ├── inventory.js
│   │   │   ├── requests.js
│   │   │   ├── analytics.js
│   │   │   ├── logs.js
│   │   │   └── export.js
│   │   │
│   │   ├── handlers/            # 核心业务逻辑 (可迁移到云函数)
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── partTypes.js
│   │   │   ├── inventory.js
│   │   │   ├── requests.js
│   │   │   ├── analytics.js
│   │   │   ├── logs.js
│   │   │   └── export.js
│   │   │
│   │   ├── utils/
│   │   │   ├── counterSync.js   # 计数器同步
│   │   │   └── validate.js      # Joi 参数校验
│   │   │
│   │   └── scripts/
│   │       └── seed.js          # 演示数据
│   │
│   └── tests/
│       ├── auth.test.js
│       ├── users.test.js
│       ├── inventory.test.js
│       └── requests.test.js
│
├── web-admin\                   # PC 管理后台前端
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── router/index.ts
│       ├── stores/
│       │   ├── auth.ts
│       │   └── analytics.ts
│       ├── api/
│       │   ├── client.ts        # Axios + JWT 拦截器
│       │   ├── auth.ts
│       │   ├── users.ts
│       │   ├── analytics.ts
│       │   └── importExport.ts
│       ├── views/
│       │   ├── Login.vue
│       │   ├── users/
│       │   │   └── UserManagement.vue
│       │   ├── analytics/
│       │   │   ├── Overview.vue
│       │   │   ├── Trend.vue
│       │   │   └── Age.vue
│       │   └── import-export/
│       │       └── ImportExport.vue
│       ├── components/
│       │   ├── AppLayout.vue
│       │   ├── KpiCard.vue
│       │   └── ExportButton.vue
│       └── styles/
│           └── variables.css
│
├── app-v0.3.py                  # 原型代码 (保留参考)
├── inventory_v2.db              # 原型数据 (保留参考)
└── DEVELOPMENT_PLAN.md          # 本文档
```

## 四、云数据库集合设计（6 个集合）

### 4.1 users

```javascript
{
  _id: "auto",
  username: "张伟",               // 显示名 (管理员设置)
  password: "bcrypt_hash",        // 本地开发用; 上线后改为 openid 绑定
  roles: ["operator"],            // 数组: ["admin"], ["manager"], ["operator"]
  is_active: true,
  created_at: Date,
  last_login: Date
}
// 索引: username (唯一)
```

### 4.2 part_types

```javascript
{
  _id: "auto",
  part_no: "PWR-MOD-500",
  part_name: "500W电源模块",
  min_stock: 10,
  current_stock: 15,              // 冗余: 实时在库数量
  total_outbound: 8,              // 冗余: 累计出库
  updated_at: Date
}
// 索引: part_no (唯一)
```

### 4.3 inventory

```javascript
{
  _id: "auto",
  part_no: "PWR-MOD-500",
  part_name: "500W电源模块",       // 冗余: 避免 JOIN
  serial_number: "SN001023",
  subsidiary: "华东子公司",
  warehouse: "上海主仓",
  condition: "全新",               // "全新" | "利旧/返还"
  status: 0,                      // 0=在库, 1=已出库
  inbound_time: Date,
  inbound_operator: "李娜",
  outbound_time: null,
  receiver: null,
  approver: null,
  project_location: null,
  reserved_request_id: ""
}
// 索引: serial_number (唯一)
// 索引: {part_no: 1, status: 1}
// 索引: {subsidiary: 1, status: 1}
// 索引: inbound_time
```

### 4.4 requests

```javascript
{
  _id: "auto",
  part_no: "PWR-MOD-500",
  part_name: "500W电源模块",       // 冗余
  qty: 3,
  approved_qty: 2,                // 部分批准
  project_location: "张江IDC扩容",
  applicant: "张伟",
  status: "pending",              // "pending"|"approved"|"rejected"|"cancelled"
  approved_sns: [],               // 数组
  approver: "",
  reject_reason: "",
  created_at: Date,
  approved_at: null
}
// 索引: {status: 1, created_at: -1}
// 索引: {applicant: 1}
```

### 4.5 sys_logs

```javascript
{
  _id: "auto",
  category: "Outbound",           // UserMgmt|Inbound|Outbound|PartType|InventoryEdit
  action_type: "审批出库",
  operator: "admin",
  details: "批准张伟申请PWR-MOD-500×2台,SN:SN001023,SN001024",
  created_at: Date
}
// 索引: {category: 1, created_at: -1}
// 索引: {operator: 1}
```

### 4.6 counters

```javascript
{
  _id: "stats",
  total_in_stock: 156,
  total_out_of_stock: 48,
  pending_requests: 3,
  month_inbound: 12,
  month_outbound: 8,
  last_month_inbound: 15,
  last_month_outbound: 10,
  updated_at: Date
}
// 入库/出库时原子更新: $inc
```

## 五、开发阶段

### 阶段 1：后端骨架 + 全部 API

| 步骤 | 任务 | 对应原型代码 | 验证方式 | 状态 |
|:----:|------|-------------|---------|:----:|
| 1-1 | Express 启动 + MongoDB 连接 + 集合初始化 + 索引 | `get_conn()` `init_system()` | `npm run dev` 启动，6 个集合已创建 | ✅ 完成 |
| 1-2 | JWT 登录 + RBAC 中间件 | `hash_pwd()` + 角色检查 | POST `/api/auth/login` 返回 token | ✅ 完成 |
| 1-3 | 用户管理 CRUD (4个接口) | `section_admin()` | 增删改查用户，非 admin 返回 403 | ✅ 完成 |
| 1-4 | 备件类型管理 CRUD (4个接口) | 备件类型管理 tab | 增删改查，含 min_stock | ✅ 完成 |
| 1-5 | 入库 + 库存查询 + 编辑 + 扫码查询 (4个接口) | 入库 + 查询 + 编辑 tab | 新品入库、利旧回流、分页、编辑 | ⬜ 待开发 |
| 1-6 | 申请/审批/驳回/撤回/列表 (6个接口) | 申请出库 + 审批出库 | 完整工作流含部分批准 | ⬜ 待开发 |
| 1-7 | 数据分析 (7个接口) | `ana_tab1/2/3` | KPI/分布/趋势/消耗/库龄/周转 | ⬜ 待开发 |
| 1-8 | 系统日志 + 导出 (4个接口) | 系统日志 + 批量导出 | 日志分页，CSV 生成 | ⬜ 待开发 |
| 1-9 | 演示数据脚本 | `load_demo_data()` | `npm run seed` 生成完整数据 | ⬜ 待开发 |
| 1-10 | 参数校验 + 错误处理完善 | — | 非法参数返回 400 | ⬜ 待开发 |

### 已完成工作小结

**步骤 1-1 (Express + MongoDB)**
- 文件: `server/src/index.js`, `config.js`, `db.js`
- 完成: Express 服务启动、MongoDB 连接、6 个集合自动创建与索引、CORS 配置

**步骤 1-2 (JWT 登录 + RBAC)**
- 文件: `server/src/handlers/auth.js`, `middleware/auth.js`, `middleware/rbac.js`, `routes/auth.js`
- 完成: 登录返回 JWT token、修改密码、token 验证中间件、角色权限中间件
- 测试: Postman 验证登录、token 解析、权限拦截均正常

**步骤 1-3 (用户管理 CRUD)**
- 文件: `server/src/handlers/users.js`, `routes/users.js`
- 完成: GET 用户列表、POST 创建用户、PATCH 修改用户角色/状态、DELETE 删除用户
- 测试: Postman 验证 4 个接口均正常，非 admin 角色返回 403

**步骤 1-4 (备件类型管理 CRUD)**
- 文件: `server/src/handlers/partTypes.js`, `routes/partTypes.js`
- 完成: GET 分页查询（支持关键词搜索）、POST 新增、PATCH 编辑（同步更新 inventory 冗余字段）、DELETE 删除（检查库存和待审批引用）
- 权限: admin 或 manager 角色
- 待测试: 重启服务后用 Postman 验证 4 个接口

### 阶段 2：PC 前端 — 登录 + 用户管理

| 步骤 | 任务 | 验证方式 |
|:----:|------|---------|
| 2-1 | Vite 代理 + Axios 封装 + Pinia 登录态 | 前端请求到达后端 |
| 2-2 | Login.vue 登录页 | admin/admin123 登录成功跳转 |
| 2-3 | AppLayout 侧边栏布局 | 左侧菜单 + 顶部用户信息 |
| 2-4 | UserManagement.vue | 查看/新增/改角色/删除全部可用 |

### 阶段 3：PC 前端 — 数据分析仪表盘

| 步骤 | 任务 | 对应原型 |
|:----:|------|---------|
| 3-1 | Overview.vue (KPI + 预警 + 分布) | `ana_tab1` |
| 3-2 | Trend.vue (趋势 + 排行) | `ana_tab2` |
| 3-3 | Age.vue (库龄 + 呆滞 + 周转) | `ana_tab3` |

### 阶段 4：PC 前端 — 批量导入导出

| 步骤 | 任务 | 验证方式 |
|:----:|------|---------|
| 4-1 | Excel 导入 | 拖拽上传 → 解析 → 显示结果 |
| 4-2 | 模板下载 | 下载标准 6 列模板 |
| 4-3 | 导出 (4种) | 各类 CSV 可下载 |

### 阶段 5（后续）：微信小程序

- 将 server/handlers/ 套入云函数壳
- 小程序前端: 入库/库存/申请/审批/扫码/类型管理/日志
- wx.scanCode 替代 OpenCV
- 微信扫码登录替代 JWT
- 订阅消息通知

## 六、API 全表

### 认证 (2)

```
POST   /api/auth/login              # 步骤 1-2
POST   /api/auth/change-password    # 步骤 1-2
```

### 用户管理 (4) [admin]

```
GET    /api/users                   # 步骤 1-3
POST   /api/users                   # 步骤 1-3
PATCH  /api/users/:username         # 步骤 1-3
DELETE /api/users/:username         # 步骤 1-3
```

### 备件类型 (4) [manager]

```
GET    /api/part-types              # 步骤 1-4
POST   /api/part-types              # 步骤 1-4
PATCH  /api/part-types/:part_no     # 步骤 1-4
DELETE /api/part-types/:part_no     # 步骤 1-4
```

### 库存 (5) [manager]

```
GET    /api/inventory               # 步骤 1-5
POST   /api/inventory/inbound       # 步骤 1-5
PATCH  /api/inventory/:id           # 步骤 1-5
GET    /api/inventory/scan/:partNo  # 步骤 1-5
POST   /api/inventory/batch-import  # 步骤 1-5
```

### 申请审批 (6)

```
POST   /api/requests                # 步骤 1-6  [operator]
GET    /api/requests/mine           # 步骤 1-6  [operator]
PATCH  /api/requests/:id/cancel     # 步骤 1-6  [operator]
GET    /api/requests/pending        # 步骤 1-6  [manager]
PATCH  /api/requests/:id/approve    # 步骤 1-6  [manager]
PATCH  /api/requests/:id/reject     # 步骤 1-6  [manager]
```

### 数据分析 (7) [manager]

```
GET    /api/analytics/kpi           # 步骤 1-7
GET    /api/analytics/distribution  # 步骤 1-7
GET    /api/analytics/safety-stock  # 步骤 1-7
GET    /api/analytics/trend         # 步骤 1-7
GET    /api/analytics/consumption   # 步骤 1-7
GET    /api/analytics/age           # 步骤 1-7
GET    /api/analytics/turnover      # 步骤 1-7
```

### 日志 (1) [manager]

```
GET    /api/logs                    # 步骤 1-8
```

### 导出 (3) [manager]

```
GET    /api/export/inventory        # 步骤 1-8
GET    /api/export/requests         # 步骤 1-8
GET    /api/export/analytics        # 步骤 1-8
```

**合计 32 个接口**

## 七、开发环境

- 操作系统: Windows
- Node.js: 18 LTS
- MongoDB: 7.0 (Docker Desktop 或 MSI 直装)
- 编辑器: VS Code
- 后端端口: localhost:3000
- 前端端口: localhost:5173 (Vite 代理 /api → :3000)
