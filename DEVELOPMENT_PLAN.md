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
├── admin\                   # PC 管理后台前端
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
│       ├── utils/
│       │   └── http.ts          # Axios 封装 + JWT 拦截器
│       ├── types/
│       │   └── index.ts         # 接口类型定义
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
│       └── assets/
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
| 1-5 | 入库 + 库存查询 + 编辑 + 扫码查询 (5个接口) | 入库 + 查询 + 编辑 tab | 新品入库、利旧回流、分页、编辑、批量导入 | ✅ 完成 |
| 1-6 | 申请/审批/驳回/撤回/列表 (6个接口) | 申请出库 + 审批出库 | 完整工作流含部分批准 | ✅ 完成 |
| 1-7 | 数据分析 (7个接口) | `ana_tab1/2/3` | KPI/分布/趋势/消耗/库龄/周转 | ✅ 完成 |
| 1-8 | 系统日志 + 导出 (4个接口) | 系统日志 + 批量导出 | 日志分页，CSV 生成 | ✅ 完成 |
| 1-9 | 演示数据脚本 | `load_demo_data()` | `npm run seed` 生成完整数据 | ✅ 完成 |
| 1-10 | 参数校验 + 错误处理完善 | — | 非法参数返回 400 | ✅ 完成 |

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
- 测试: Postman 验证 4 个接口均正常

**步骤 1-5 (入库 + 库存管理)**
- 文件: `server/src/handlers/inventory.js`, `routes/inventory.js`
- 完成: GET 分页查询（多条件筛选）、POST 入库（原子更新 part_types.current_stock + counters）、PATCH 编辑（part_no 变更时同步调整库存计数）、GET 扫码查询（精确匹配 SN）、POST 批量导入（预校验+bulkInsert）
- 权限: 查询/扫码所有登录用户可用；入库/编辑/批量导入需 admin 或 manager
- 编辑接口支持 ObjectId 和序列号双模式定位
- 测试: Postman 验证 5 个接口均正常通过

**步骤 1-6 (申请/审批工作流)**
- 文件: `server/src/handlers/requests.js`, `routes/requests.js`
- 完成: POST 提交申请（自动预留库存）、GET 列表（分页+按状态/申请人筛选，普通用户只看自己的）、GET 详情、POST 审批通过（支持部分批准，原子出库+扣减库存+更新计数器）、POST 驳回（释放预留）、POST 撤回（仅申请人本人可操作）
- 权限: 创建/列表/详情/撤回对所有登录用户开放；审批/驳回需 admin 或 manager
- 测试: Postman 验证 6 个接口均正常通过（提交→列表→详情→审批/驳回/撤回完整工作流）

**步骤 1-7 (数据分析)**
- 文件: `server/src/handlers/analytics.js`, `routes/analytics.js`
- 完成 7 个接口:
  - `/kpi` — KPI 卡片（在库/出库/待审批/本月入库/本月出库+环比，实时聚合）
  - `/distribution` — 库存分布（按子公司仓库、备件类型、新旧状态三维度聚合）
  - `/safety-stock` — 安全库存预警（$lookup 关联 inventory 实时计算，返回缺口量）
  - `/trend` — 月度出入库趋势（双聚合管道合并时间线）
  - `/consumption?months=N` — 备件消耗排行 Top10 + 项目用量统计（unwind items 聚合）
  - `/age?stale_days=N` — 库龄分布（4 档分桶 + 呆滞预警明细，$dateDiff 计算）
  - `/turnover?months=N` — 备件周转率（出库量/在库量，支持自定义周期）
- 权限: 所有分析接口需 admin 或 manager 角色
- 测试: Postman 验证 7 个接口均正常通过（KPI/分布/安全库存/趋势/消耗/库龄/周转）

**步骤 1-8 (系统日志 + 导出)**
- 文件: `server/src/handlers/logs.js`, `handlers/export.js`, `routes/logs.js`, `routes/export.js`
- 完成 4 个接口:
  - `GET /api/logs` — 系统日志分页查询（支持 category/operator/时间范围筛选，逗号分隔多选）
  - `GET /api/export/inventory` — 导出在库库存明细 CSV（含 UTF-8 BOM 兼容 Excel）
  - `GET /api/export/requests` — 导出申请/出库记录 CSV（approved_sns 用分号连接）
  - `GET /api/export/analytics` — 导出分析报告 CSV（月度趋势 + 库龄明细两段合并）
- 权限: 所有接口需 admin 或 manager 角色
- 待测试: 重启服务后用 Postman 验证

**步骤 1-9 (演示数据脚本)**
- 文件: `server/src/scripts/seed.js`
- 用法: `npm run seed` (首次加载) / `npm run seed -- --drop` (清空重建)
- 生成数据:
  - 6 个用户: admin(管理员), 仓管张(仓管), 4 个操作员 (张伟/李娜/王强/刘洋)
  - 5 种备件类型 (电源/光模块/风扇/硬盘/内存)
  - ~80-100 条库存记录 (分布 3 子公司 5 仓库，70%全新 30%利旧)
  - ~15 条已审批出库申请 (含多品类批量)
  - 3 条待审批申请 (已预留库存)
  - 2 条已驳回申请
  - ~40 条系统日志
  - counters 统计自动校准
- 默认密码: admin → admin123, 其余 → 123456

**步骤 1-10 (参数校验 + 错误处理完善)**
- 新增文件: `server/src/utils/validate.js`
- 完成内容:
  - 基于 Joi ^17 的统一参数校验框架，覆盖全部 32 个接口
  - `validate(schema, source)` 中间件工厂，支持 body/query/params 三种校验目标
  - 自动类型转换（query string → number）、多错误合并返回、未知字段自动剔除
  - 全局错误处理增强: Joi 错误 → 400、JSON 解析错误 → 400、请求体过大 → 413
  - 所有路由文件挂载校验中间件，在 handler 前拦截非法参数
  - 清理 handlers 中与 Joi schema 重复的手动校验，保留业务逻辑校验（重复检查、存在性检查等）
- 校验规则覆盖:
  - 认证: username/password 必填、newPassword ≥ 6 位
  - 用户管理: roles 枚举校验、password 长度、update 至少一个字段
  - 备件类型: part_no/part_name 必填+长度限制、min_stock ≥ 0
  - 库存: 入库 5 必填字段、condition 枚举、批量导入 1-500 条限制
  - 申请审批: items 数组+quantity ≥ 1、project_location 必填、status 枚举、reason 必填
  - 分析接口: months/stale_days 范围校验+默认值
  - 日志: 日期 ISO 格式校验、分页参数范围

### 阶段 2：PC 前端 — 基础框架 + 登录

> 目标: 搭建前端工程骨架，跑通登录流程，确立整体布局

| 步骤 | 任务 | 涉及文件 | 验证方式 | 状态 |
|:----:|------|---------|---------|:----:|
| 2-1 | Vite 脚手架 + 代理 `/api → :3000` | `vite.config.ts`, `package.json` | 5 项验证全部通过（见下方小结） | ✅ 完成 |
| 2-2 | Axios 封装 + JWT 拦截器 | `utils/http.ts` | 手动测试请求自动带 token | ✅ 完成 |
| 2-3 | Pinia auth store + Login.vue | `stores/auth.ts`, `views/Login.vue` | admin/admin123 登录成功 | ✅ 完成 |
| 2-4 | AppLayout 侧边栏 + 路由守卫 | `components/AppLayout.vue`, `router/index.ts` | 未登录跳转登录页，菜单按角色显示 | ✅ 完成 |

**步骤 2-1 验证记录 (已通过)**
1. `npm run dev` 启动无报错，Vite 开发服务器运行于 localhost:5173 ✅
2. 浏览器访问 localhost:5173 正常显示欢迎页面 ✅
3. 浏览器控制台 `fetch('/api/files').then(r=>r.json()).then(console.log)` 代理转发至后端成功 ✅
4. Vue Router 路由切换正常 ✅
5. TypeScript 编译无错误 ✅

**步骤 2-2 完成内容**
- 文件: `admin/src/utils/http.ts`
- Axios 实例: baseURL `/api`, timeout 15s
- 请求拦截器: 自动从 localStorage 读取 token 附加到 Authorization 头
- 响应拦截器: 401→清token跳登录, 403→无权限提示, 400/404/500→统一错误提示

**步骤 2-3 完成内容**
- 文件: `admin/src/stores/auth.ts`, `admin/src/views/Login.vue`
- Pinia auth store: login/logout/restoreFromToken, isAdmin/isManager 计算属性
- Login.vue: Element Plus 表单 + 校验, 渐变背景, 回车/按钮登录

**步骤 2-4 完成内容**
- 文件: `admin/src/components/AppLayout.vue`, `admin/src/router/index.ts`
- AppLayout: 可折叠侧边栏 (10 个菜单项按角色显隐), 顶部用户下拉菜单 (修改密码/退出)
- 路由守卫: 未登录→跳转 /login, 已登录访问 /login→跳转首页, 角色权限不足→跳转 /requests
- 页面刷新自动从 JWT token 恢复用户信息
- TypeScript 编译零错误

### 阶段 3：PC 前端 — 核心业务页面

> 目标: 实现日常操作全流程 (备件类型 → 入库 → 库存查询 → 申请 → 审批)

| 步骤 | 任务 | 对应后端 API | 验证方式 | 状态 |
|:----:|------|-------------|---------|:----:|
| 3-1 | 用户管理 CRUD 页面 | `users` 4 个接口 | 表格增删改查，非 admin 不可见 | ✅ 完成 |
| 3-2 | 备件类型管理页面 | `part-types` 4 个接口 | 表格增删改查 + 搜索 | ✅ 完成 |
| 3-3 | 库存列表 + 多条件筛选 + 编辑 | `inventory` GET + PATCH | 分页表格 + 筛选器 + 编辑弹窗 | ✅ 完成 |
| 3-4 | 入库表单 + 批量导入 + 扫码查询 | `inbound` + `batch-import` + `scan` | 单件入库 + Excel 解析预览 + SN 扫码 | ⬜ 待开发 |
| 3-5 | 申请出库 + 我的申请列表 | `requests` POST + GET | 多品类申请 + 状态筛选 + 撤回 | ⬜ 待开发 |
| 3-6 | 审批管理 (审批/驳回/部分批准) | `approve` + `reject` | 待审批列表 + 审批弹窗 + 部分批准 | ⬜ 待开发 |

### 阶段 4：PC 前端 — 数据分析仪表盘

> 目标: ECharts 可视化，对应原型 ana_tab1/2/3

| 步骤 | 任务 | 对应后端 API | 验证方式 | 状态 |
|:----:|------|-------------|---------|:----:|
| 4-1 | Overview: KPI 卡片 + 安全库存预警 + 库存分布 | `kpi` + `safety-stock` + `distribution` | 4 张 KPI 卡 + 预警表格 + 饼图/柱图 | ⬜ 待开发 |
| 4-2 | Trend: 月度出入库趋势 + 消耗排行 | `trend` + `consumption` | 折线图 + Top10 横向柱图 | ⬜ 待开发 |
| 4-3 | Age: 库龄分布 + 呆滞预警 + 周转率 | `age` + `turnover` | 分桶柱图 + 呆滞表格 + 周转率表格 | ⬜ 待开发 |

### 阶段 5：PC 前端 — 辅助功能

> 目标: 系统日志 + 数据导出 + 修改密码

| 步骤 | 任务 | 对应后端 API | 验证方式 | 状态 |
|:----:|------|-------------|---------|:----:|
| 5-1 | 系统日志查看器 | `logs` GET | 分页 + 分类/操作员/日期范围筛选 | ⬜ 待开发 |
| 5-2 | CSV 导出 (库存/申请/分析报告) | `export` 3 个接口 | 点击按钮下载 CSV 文件 | ⬜ 待开发 |
| 5-3 | 修改密码弹窗 | `change-password` | 顶部用户菜单 → 修改密码 | ⬜ 待开发 |

### 阶段 6（后续）：微信小程序

> 目标: 将后端迁移到云函数，开发移动端操作界面

| 步骤 | 任务 | 备注 |
|:----:|------|------|
| 6-1 | 云函数壳封装 | 将 handlers/ 套入云函数入口 |
| 6-2 | 微信登录替代 JWT | openid 绑定用户 |
| 6-3 | 小程序首页 + 扫码入库 | wx.scanCode 替代 OpenCV |
| 6-4 | 库存查询 + 申请出库 | 移动端表单 |
| 6-5 | 审批 + 消息通知 | 订阅消息推送 |

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
