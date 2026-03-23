# 备件管理系统 — 开发上下文

> 本系统已完成初版并交付用户演示。基础功能稳定，后续进入**需求迭代阶段**：根据用户反馈对数据库、业务逻辑、页面展示进行变更和优化。不会再做大幅架构变动。

---

## 系统架构

```
PC 管理后台 (Vue 3 + Element Plus + Vite)   ──┐
  端口: 5173 (dev)                              │
  目录: /admin/                                 ├──▶  Express 后端 (Node 18)  ──▶  MongoDB 7
                                                │      端口: 5501
微信小程序 (原生 WXML/JS)                      ──┘      目录: /server/
  目录: /miniprogram/

部署: Docker Compose (mongo + express)
```

---

## 目录结构

```
admin/src/
├── main.ts                          # 入口
├── router/index.ts                  # 路由 + 权限守卫
├── stores/auth.ts                   # Pinia 认证状态
├── utils/http.ts                    # Axios (HttpOnly Cookie 认证)
├── utils/chart.ts                   # ECharts 封装
├── components/AppLayout.vue         # 侧栏布局 + 角色菜单 + 改密码
└── views/
    ├── Login.vue                    # 登录页
    ├── analytics/
    │   ├── Overview.vue             # KPI 卡片 + 安全库存预警 + 分布图表
    │   ├── Trend.vue                # 月度出入库趋势 + TOP10 消耗 + 项目点用量
    │   └── Age.vue                  # 库龄分布 + 呆滞物料 + 周转率
    ├── users/UserManagement.vue     # 用户 CRUD + 微信绑定状态/解绑
    ├── part-types/PartTypeManagement.vue  # 备件类型 CRUD
    ├── inventory/
    │   ├── InventoryList.vue        # 库存查询 + 筛选 + 编辑 + 导出CSV
    │   └── InboundPage.vue          # 单件入库 / 批量导入Excel / 扫码查询
    └── requests/
        ├── RequestPage.vue          # 操作员提交领用申请 + 查看我的申请
        └── ApprovalPage.vue         # 管理员/仓管审批(全量/部分) + 驳回

server/src/
├── index.js                         # Express 入口 (Helmet, CORS, Rate Limit)
├── config.js                        # 环境变量 (PORT, MONGO_URI, JWT_SECRET, WX_APPID/SECRET)
├── db.js                            # MongoDB 连接 + 索引初始化 + 默认admin账户
├── middleware/
│   ├── auth.js                      # JWT 验证 (Cookie 或 Bearer Header)
│   └── rbac.js                      # requireRole(...roles) 中间件
├── routes/                          # 路由注册 (auth, users, partTypes, inventory, requests, analytics, logs, export)
├── handlers/
│   ├── auth.js                      # login, logout, changePassword, wxLogin, wxBind, wxUnbind
│   ├── users.js                     # listUsers, createUser, updateUser, deleteUser
│   ├── partTypes.js                 # CRUD + 修改时同步 inventory.part_name
│   ├── inventory.js                 # list, scanBySN, inbound, editInventory, batchImport
│   ├── requests.js                  # create(自动预留SN), list, detail, approve(全量/部分), reject, cancel
│   ├── analytics.js                 # kpi, distribution, safetyStock, trend, consumption, age, turnover
│   ├── logs.js                      # getLogs (分类+操作人+日期筛选)
│   └── export.js                    # CSV导出: inventory, requests, analytics
└── utils/
    ├── validate.js                  # Joi 校验规则
    └── subscribe-message.js         # 微信订阅消息 (库存预警/审批结果/申请通知)

miniprogram/
├── app.js                           # silentLogin (wx.login→JWT), hasRole(), reCheckLogin()
├── app.json                         # 5个tabBar页面 (custom tab bar)
├── utils/
│   ├── api.js                       # HTTP 封装 (Bearer token), 所有 API endpoint
│   └── util.js                      # formatTime, statusText, debounce
├── custom-tab-bar/index.js          # 角色过滤: operator 隐藏首页+审批
├── pages/
│   ├── index/                       # 登录绑定 + KPI 仪表盘 (admin/manager 可见; operator 自动跳转库存页)
│   ├── scan/                        # 扫码查询备件详情
│   ├── inventory/                   # 库存列表 (关键字搜索 + 状态筛选 + 无限滚动)
│   ├── request/                     # operator提交申请 / admin,manager查看所有申请
│   └── approval/                    # admin/manager 审批 (全量/部分/驳回)
└── cloudfunctions/                  # 云函数 (auth, inventory, requests, partTypes, analytics, logs)
    └── _shared/cloud-handler.js     # 事件→req/res适配器 + openId→用户映射
```

---

## 数据库 (MongoDB: spare_parts)

### Collections & 关键字段

**users**
```
{ username (unique), password (bcrypt), roles: ['admin'|'manager'|'operator'],
  is_active, openid?, created_at, last_login }
```

**part_types**
```
{ part_no (unique), part_name, min_stock, current_stock, total_outbound, updated_at }
```

**inventory**
```
{ serial_number (unique), part_no, part_name (冗余),
  subsidiary, warehouse, condition ('全新'|'利旧/返还'),
  status (0=在库, 1=已出库),
  inbound_time, inbound_operator,
  outbound_time, receiver, approver, project_location,
  reserved_request_id? }
索引: serial_number(unique), part_no+status, subsidiary+status, inbound_time(desc)
```

**requests**
```
{ applicant, status ('pending'|'approved'|'rejected'|'cancelled'),
  items: [{ part_no, part_name, quantity, serial_numbers }],
  project_location, remark?,
  created_at, updated_at,
  approved_by?, approved_at?, reject_reason?,
  partial_items? }
索引: status+created_at, applicant
```

**counters**
```
{ _id: 'stats', total_in_stock, total_out_of_stock,
  month_inbound, month_outbound, pending_requests, updated_at }
```

**sys_logs**
```
{ category ('UserMgmt'|'PartType'|'Inbound'|'InventoryEdit'|'Request'|'Notification'),
  action_type, operator, details, created_at }
```

---

## API 端点汇总 (全部 /api 前缀)

| 模块 | Method | Path | 权限 | 说明 |
|------|--------|------|------|------|
| **认证** | POST | /auth/login | 公开 | PC 登录，设 HttpOnly Cookie |
| | POST | /auth/logout | 公开 | 清除 Cookie |
| | POST | /auth/change-password | 登录 | 修改密码 |
| | POST | /auth/wx-login | 公开 | 小程序静默登录 (code→openId→JWT) |
| | POST | /auth/wx-bind | 公开 | 小程序绑定账号 |
| | POST | /auth/wx-unbind | 登录 | 解绑微信 (admin可解绑他人) |
| **用户** | GET | /users | admin | 列表 (排除password) |
| | POST | /users | admin | 创建 |
| | PATCH | /users/:username | admin | 更新角色/状态/密码 |
| | DELETE | /users/:username | admin | 删除 (不可删自己) |
| **备件类型** | GET | /part-types | 登录 | 分页+关键字搜索 |
| | POST | /part-types | admin/manager | 创建 (part_no唯一) |
| | PATCH | /part-types/:part_no | admin/manager | 更新 (同步inventory.part_name) |
| | DELETE | /part-types/:part_no | admin/manager | 删除 (需无库存和待审批) |
| **库存** | GET | /inventory | 登录 | 筛选: part_no, subsidiary, status, keyword |
| | GET | /inventory/scan/:sn | 登录 | 精确查询序列号 |
| | POST | /inventory/inbound | admin/manager | 入库 |
| | PATCH | /inventory/:id | admin/manager | 编辑 (支持ObjectId或SN) |
| | POST | /inventory/batch-import | admin/manager | 批量导入 (≤500条) |
| **领用申请** | POST | /requests | operator | 提交申请 (自动预留SN) |
| | GET | /requests | 登录 | 列表 (operator仅看自己的) |
| | GET | /requests/:id | 登录 | 详情 |
| | POST | /requests/:id/approve | admin/manager | 审批 (支持部分审批 partial_items) |
| | POST | /requests/:id/reject | admin/manager | 驳回 (需reason) |
| | POST | /requests/:id/cancel | 登录 | 申请人撤回 |
| **数据分析** | GET | /analytics/kpi | admin/manager | KPI卡片 |
| | GET | /analytics/distribution | admin/manager | 库存分布 (按类型/子公司/状况) |
| | GET | /analytics/safety-stock | admin/manager | 安全库存预警列表 |
| | GET | /analytics/trend | admin/manager | 月度出入库趋势 |
| | GET | /analytics/consumption | admin/manager | TOP10消耗 + 项目点用量 |
| | GET | /analytics/age | admin/manager | 库龄分布 + 呆滞物料 |
| | GET | /analytics/turnover | admin/manager | 周转率排名 |
| **日志** | GET | /logs | admin/manager | 操作日志 (分类+操作人+日期) |
| **导出** | GET | /export/inventory | admin/manager | CSV导出在库库存 |
| | GET | /export/requests | admin/manager | CSV导出申请记录 |
| | GET | /export/analytics | admin/manager | CSV导出月度趋势+库龄 |

---

## 角色权限矩阵

| 功能 | admin | manager | operator |
|------|-------|---------|----------|
| 数据概览/分析 | ✓ | ✓ | ✗ |
| 用户管理 | ✓ | ✗ | ✗ |
| 备件类型管理 | ✓ | ✓ | ✗ |
| 库存查询 | ✓ | ✓ | ✓ (小程序) |
| 入库操作 | ✓ | ✓ | ✗ |
| 提交领用申请 | ✗ | ✗ | ✓ |
| 审批领用申请 | ✓ | ✓ | ✗ |
| 系统日志 | ✓ | ✓ | ✗ |
| 导出CSV | ✓ | ✓ | ✗ |
| 修改自己密码 | ✓ | ✓ | ✓ |

小程序特殊逻辑:
- operator 登录后直接跳转库存页，隐藏首页(仪表盘)和审批tab
- operator 只能查看自己的申请记录
- admin/manager 在小程序不能提交申请，只能查看和审批

---

## 核心业务流程

### 出库领用流程
```
operator提交申请 → 系统自动按part_no+subsidiary预留SN(reserved_request_id)
  → admin/manager 审批:
     全量通过 → 所有预留SN标记status=1(已出库), 记录receiver/project_location
     部分通过 → 选中的SN出库, 未选中的释放预留
     驳回 → 所有预留SN释放, 记录reject_reason
     申请人撤回 → 释放预留SN
```

### 入库流程
```
admin/manager 单件入库或批量导入
  → 创建inventory记录(status=0)
  → 更新part_types.current_stock (+1)
  → 更新counters.stats
  → 检查安全库存 → 低于min_stock时发微信订阅消息给manager/admin
```

### 微信认证流程
```
小程序启动 → wx.login()获取code → POST /auth/wx-login
  → 后端用code换openId → 查users.openid
  → 已绑定: 返回JWT+用户信息 → 静默登录成功
  → 未绑定: 返回needBind → 展示绑定表单 → 用户输入账号密码
     → POST /auth/wx-bind → 验证密码+写入openId → 返回JWT
PC端: POST /auth/login → 设HttpOnly Cookie (JWT)
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| PC前端 | Vue 3.5 + TypeScript + Vite 7 + Element Plus 2.13 + ECharts 6 + Pinia + Axios |
| 小程序 | 微信原生 (WXML/JS/WXSS) + 自定义tabBar |
| 后端 | Express 4.18 + MongoDB native driver 6.3 + JWT + bcryptjs |
| 数据库 | MongoDB 7 |
| 部署 | Docker Compose (mongo:7 + node:18-alpine) |
| 测试 | Jest + Supertest + MongoDB Memory Server |

---

## 环境变量 (server/.env)

```
PORT=5501
MONGO_URI=mongodb://localhost:27017/spare_parts
JWT_SECRET=dev-secret-key-change-in-production
WX_APPID=wxa5d538f2c997e7fc
WX_APP_SECRET=408be546d1fc6e9fb4a6e2860f9b90fe
```

---

## 开发阶段说明

当前状态: **初版已交付演示，进入迭代优化阶段**

已完成的功能:
- 完整的 RBAC 权限体系 (admin/manager/operator)
- PC端全功能管理后台 (数据分析、用户管理、备件类型、库存、入库、申请、审批、日志、导出)
- 微信小程序 (登录绑定、扫码查询、库存浏览、申请提交、审批)
- 微信订阅消息通知 (库存预警、审批结果、新申请提醒)
- Docker 容器化部署
- 批量Excel导入
- 部分审批功能

后续迭代方向:
- 根据用户反馈调整数据库字段和业务逻辑
- 优化页面展示和交互体验
- 新增用户要求的功能模块
