# 备件管理系统 — API 接口文档

> 基础路径: `http://localhost:5501/api`
> 版本: v1.0 (阶段 1 完成)
> 接口总数: **32 个**

---

## 目录

1. [通用约定](#1-通用约定)
2. [认证模块 (2)](#2-认证模块-auth)
3. [用户管理模块 (4)](#3-用户管理模块-users)
4. [备件类型模块 (4)](#4-备件类型模块-part-types)
5. [库存管理模块 (5)](#5-库存管理模块-inventory)
6. [出库申请模块 (6)](#6-出库申请模块-requests)
7. [数据分析模块 (7)](#7-数据分析模块-analytics)
8. [系统日志模块 (1)](#8-系统日志模块-logs)
9. [数据导出模块 (3)](#9-数据导出模块-export)

---

## 1. 通用约定

### 1.1 响应格式

```json
{
  "code": 0,       // 0=成功, 1=失败
  "message": "",   // 错误时的提示信息
  "data": {}       // 成功时的返回数据
}
```

### 1.2 认证方式

除 `POST /api/auth/login` 外，所有接口均需携带 JWT Token:

```
Authorization: Bearer <token>
```

Token 有效期 **6 小时**，过期需重新登录。

### 1.3 角色权限

| 角色 | 说明 |
|------|------|
| `admin` | 系统管理员 — 全部权限 |
| `manager` | 仓库管理员 — 除用户管理外的全部权限 |
| `operator` | 操作员 — 查看库存、提交/撤回申请、扫码查询 |

### 1.4 HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 (GET / PATCH / action) |
| 201 | 创建成功 (POST) |
| 400 | 参数校验失败 |
| 401 | 未认证 / Token 无效或过期 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 数据冲突 (重复) |
| 500 | 服务器内部错误 |

### 1.5 分页参数 (通用)

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | number | 1 | 页码 |
| `pageSize` / `page_size` | number | 20 | 每页条数 (上限 100) |

分页响应:
```json
{
  "items": [],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

---

## 2. 认证模块 (Auth)

### 2.1 POST /api/auth/login

用户登录，获取 JWT Token。

| 属性 | 值 |
|------|-----|
| 权限 | 公开 (无需 Token) |

**请求体:**
```json
{
  "username": "admin",
  "password": "123456"
}
```

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "username": "admin",
      "roles": ["admin"]
    }
  }
}
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 用户名和密码不能为空 |
| 401 | 用户名或密码错误 |

---

### 2.2 POST /api/auth/change-password

修改当前用户密码。

| 属性 | 值 |
|------|-----|
| 权限 | 任意已登录用户 |

**请求体:**
```json
{
  "oldPassword": "123456",
  "newPassword": "newpass123"
}
```

**成功响应 (200):**
```json
{ "code": 0, "message": "密码修改成功" }
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 旧密码错误 |
| 400 | 新密码长度不能少于6位 |
| 404 | 用户不存在 |

---

## 3. 用户管理模块 (Users)

> 所有接口需要 **admin** 角色

### 3.1 GET /api/users

获取用户列表。

**成功响应 (200):**
```json
{
  "code": 0,
  "data": [
    {
      "_id": "665a...",
      "username": "admin",
      "roles": ["admin"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00.000Z",
      "last_login": "2025-06-01T08:00:00.000Z"
    }
  ]
}
```

> 按 `created_at` 降序排列，不返回 password 字段。

---

### 3.2 POST /api/users

创建新用户。

**请求体:**
```json
{
  "username": "wang",
  "password": "pass123",
  "roles": ["operator"]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| username | 是 | 唯一用户名 |
| password | 是 | 最少 6 位 |
| roles | 否 | 默认 `["operator"]`，可选: admin / manager / operator |

**成功响应 (201):**
```json
{ "code": 0, "message": "用户创建成功" }
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 用户名和密码不能为空 |
| 400 | 密码长度不能少于6位 |
| 400 | 无效角色 |
| 409 | 用户名已存在 |

---

### 3.3 PATCH /api/users/:username

更新用户信息 (角色 / 状态 / 密码)。

**路径参数:** `username`

**请求体 (均为可选):**
```json
{
  "roles": ["manager"],
  "is_active": false,
  "password": "newpass"
}
```

**成功响应 (200):**
```json
{ "code": 0, "message": "用户更新成功" }
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 没有需要更新的字段 / 无效角色 / 密码长度不能少于6位 |
| 404 | 用户不存在 |

---

### 3.4 DELETE /api/users/:username

删除用户。

**路径参数:** `username`

**成功响应 (200):**
```json
{ "code": 0, "message": "用户删除成功" }
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 不能删除自己的账户 |
| 404 | 用户不存在 |

---

## 4. 备件类型模块 (Part Types)

> 所有接口需要 **admin** 或 **manager** 角色

### 4.1 GET /api/part-types

分页查询备件类型列表。

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 模糊搜索 (匹配 part_no 或 part_name，不区分大小写) |
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 20 |

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "_id": "665a...",
        "part_no": "FAN-001",
        "part_name": "工业风扇",
        "min_stock": 5,
        "current_stock": 12,
        "total_outbound": 3,
        "updated_at": "2025-06-01T00:00:00.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 4.2 POST /api/part-types

创建新备件类型。

**请求体:**
```json
{
  "part_no": "FAN-002",
  "part_name": "散热风扇",
  "min_stock": 3
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| part_no | 是 | 备件编号，唯一 |
| part_name | 是 | 备件名称 |
| min_stock | 否 | 安全库存阈值，默认 0 |

**成功响应 (201):**
```json
{
  "code": 0,
  "message": "备件类型创建成功",
  "data": {
    "part_no": "FAN-002",
    "part_name": "散热风扇",
    "min_stock": 3,
    "current_stock": 0,
    "total_outbound": 0,
    "updated_at": "2025-06-01T00:00:00.000Z"
  }
}
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 备件编号和名称不能为空 |
| 409 | 备件编号 FAN-002 已存在 |

---

### 4.3 PATCH /api/part-types/:part_no

更新备件类型。

**路径参数:** `part_no`

**请求体 (均为可选):**
```json
{
  "part_name": "散热风扇 v2",
  "min_stock": 10
}
```

**成功响应 (200):**
```json
{ "code": 0, "message": "备件类型更新成功" }
```

> 如果修改 `part_name`，会同步更新所有关联 inventory 记录的 part_name (反规范化)。

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 没有需要更新的字段 |
| 404 | 备件类型不存在 |

---

### 4.4 DELETE /api/part-types/:part_no

删除备件类型。

**路径参数:** `part_no`

**成功响应 (200):**
```json
{ "code": 0, "message": "备件类型删除成功" }
```

> 存在库存记录或待审批申请时，无法删除。

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 该备件类型下有 X 条库存记录，无法删除 |
| 400 | 该备件类型有 X 条待审批申请，无法删除 |
| 404 | 备件类型不存在 |

---

## 5. 库存管理模块 (Inventory)

### 5.1 GET /api/inventory

分页查询库存列表。

| 属性 | 值 |
|------|-----|
| 权限 | 任意已登录用户 |

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| part_no | string | 按备件编号筛选 |
| subsidiary | string | 按子公司筛选 |
| status | number | 0=在库, 1=已出库 |
| keyword | string | 模糊搜索 (serial_number / part_no / part_name / warehouse) |
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 20 |

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "_id": "665a...",
        "part_no": "FAN-001",
        "part_name": "工业风扇",
        "serial_number": "SN20250601001",
        "subsidiary": "上海分公司",
        "warehouse": "A仓库",
        "condition": "全新",
        "status": 0,
        "inbound_time": "2025-06-01T00:00:00.000Z",
        "inbound_operator": "admin",
        "outbound_time": null,
        "receiver": null,
        "approver": null,
        "project_location": null,
        "reserved_request_id": ""
      }
    ],
    "total": 200,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 5.2 POST /api/inventory/inbound

单件入库。

| 属性 | 值 |
|------|-----|
| 权限 | admin / manager |

**请求体:**
```json
{
  "part_no": "FAN-001",
  "serial_number": "SN20250601001",
  "subsidiary": "上海分公司",
  "warehouse": "A仓库",
  "condition": "全新"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| part_no | 是 | 必须是已存在的备件编号 |
| serial_number | 是 | 序列号，全局唯一 |
| subsidiary | 是 | 所属子公司 |
| warehouse | 是 | 所在仓库 |
| condition | 否 | `全新` (默认) 或 `利旧/返还` |

**成功响应 (201):**
```json
{
  "code": 0,
  "message": "入库成功",
  "data": {
    "_id": "665a...",
    "part_no": "FAN-001",
    "part_name": "工业风扇",
    "serial_number": "SN20250601001",
    "status": 0,
    "inbound_time": "2025-06-01T08:00:00.000Z",
    "inbound_operator": "admin",
    "..."
  }
}
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 备件编号、序列号、子公司、仓库不能为空 |
| 400 | 成色必须为: 全新, 利旧/返还 |
| 404 | 备件类型 FAN-999 不存在 |
| 409 | 序列号 SN... 已存在 |

> 入库成功后自动递增 `part_types.current_stock`。

---

### 5.3 GET /api/inventory/scan/:sn

扫码查询 — 根据序列号精确查找。

| 属性 | 值 |
|------|-----|
| 权限 | 任意已登录用户 |

**路径参数:** `sn` — 序列号

**成功响应 (200):**
```json
{
  "code": 0,
  "data": { "...完整库存记录..." }
}
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 404 | 未找到序列号: SN... |

---

### 5.4 PATCH /api/inventory/:id

编辑库存记录。

| 属性 | 值 |
|------|-----|
| 权限 | admin / manager |

**路径参数:** `id` — MongoDB ObjectId 或 serial_number 均可

**请求体 (均为可选):**
```json
{
  "subsidiary": "北京分公司",
  "warehouse": "B仓库",
  "condition": "利旧/返还",
  "part_no": "FAN-002"
}
```

**成功响应 (200):**
```json
{ "code": 0, "message": "库存记录更新成功" }
```

> 若修改 `part_no` (在库状态下)，会联动调整新旧 part_type 的 current_stock 计数。

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 没有需要更新的字段 / 成色必须为: 全新, 利旧/返还 |
| 404 | 库存记录不存在 / 备件类型 xxx 不存在 |

---

### 5.5 POST /api/inventory/batch-import

批量入库 (Excel 导入)。

| 属性 | 值 |
|------|-----|
| 权限 | admin / manager |

**请求体:**
```json
{
  "items": [
    {
      "part_no": "FAN-001",
      "serial_number": "SN001",
      "subsidiary": "上海分公司",
      "warehouse": "A仓库",
      "condition": "全新"
    },
    {
      "part_no": "FAN-001",
      "serial_number": "SN002",
      "subsidiary": "上海分公司",
      "warehouse": "A仓库"
    }
  ]
}
```

> 单次上限 **500 条**，condition 可省略 (默认 `全新`)。

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "success": 48,
    "failed": 2,
    "errors": [
      { "row": 3, "message": "序列号 SN003 已存在" },
      { "row": 7, "message": "备件类型 XXX 不存在" }
    ]
  }
}
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 导入数据不能为空 |
| 400 | 单次导入不能超过500条 |

> 逐行校验，有效数据正常入库，失败行在 errors 中返回原因。

---

## 6. 出库申请模块 (Requests)

### 6.1 POST /api/requests

提交出库申请。

| 属性 | 值 |
|------|-----|
| 权限 | 任意已登录用户 |

**请求体:**
```json
{
  "items": [
    { "part_no": "FAN-001", "quantity": 2 },
    { "part_no": "MOTOR-001", "quantity": 1 }
  ],
  "project_location": "杭州数据中心",
  "remark": "紧急维修"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| items | 是 | 申请明细数组，每项含 part_no + quantity |
| items[].part_no | 是 | 备件编号 |
| items[].quantity | 是 | 申请数量 (≥1) |
| project_location | 是 | 项目/用途 |
| remark | 否 | 备注 |

**成功响应 (201):**
```json
{
  "code": 0,
  "message": "申请提交成功",
  "data": {
    "_id": "665a...",
    "applicant": "wang",
    "status": "pending",
    "items": [
      {
        "part_no": "FAN-001",
        "part_name": "工业风扇",
        "quantity": 2,
        "serial_numbers": ["SN001", "SN002"]
      }
    ],
    "project_location": "杭州数据中心",
    "remark": "紧急维修",
    "created_at": "2025-06-01T08:00:00.000Z",
    "approved_by": null,
    "approved_at": null,
    "reject_reason": null
  }
}
```

> 提交时自动预留库存 (设置 `reserved_request_id`)，库存不足则整单失败并回滚。

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 申请明细不能为空 |
| 400 | 项目地点不能为空 |
| 400 | 无效的申请项 |
| 400 | 备件类型 xxx 不存在 |
| 400 | xxx 库存不足，需要 X，可用 Y |

---

### 6.2 GET /api/requests

查询申请列表。

| 属性 | 值 |
|------|-----|
| 权限 | 任意已登录用户 (operator 只能看到自己的) |

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | `pending` / `approved` / `rejected` / `cancelled` |
| applicant | string | 按申请人筛选 |
| page | number | 页码 |
| pageSize | number | 每页条数 |

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "items": [ "...申请记录数组..." ],
    "total": 50,
    "page": 1,
    "pageSize": 20
  }
}
```

> operator 角色自动按 `applicant = 当前用户` 过滤。

---

### 6.3 GET /api/requests/:id

查询单个申请详情。

| 属性 | 值 |
|------|-----|
| 权限 | 任意已登录用户 (operator 只能看自己的) |

**路径参数:** `id` — MongoDB ObjectId

**成功响应 (200):**
```json
{
  "code": 0,
  "data": { "...完整申请记录..." }
}
```

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 无效的申请ID |
| 403 | 无权查看此申请 |
| 404 | 申请不存在 |

---

### 6.4 POST /api/requests/:id/approve

审批通过 (支持部分批准)。

| 属性 | 值 |
|------|-----|
| 权限 | admin / manager |

**路径参数:** `id`

**请求体 (可选 — 部分批准时使用):**
```json
{
  "partial_items": [
    { "part_no": "FAN-001", "quantity": 1 }
  ]
}
```

> 省略 `partial_items` = 全部批准。
> 填写 `partial_items` 可指定每个 part_no 的批准数量，未列出的项目将被释放。

**成功响应 (200):**
```json
{ "code": 0, "message": "审批通过，出库 3 件" }
```

**处理逻辑:**
- 批准的库存: `status` → 1, 设置 `outbound_time` / `receiver` / `approver` / `project_location`
- 未批准的库存: 释放预留 (`reserved_request_id` 清空)
- 联动更新 `part_types.current_stock`

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 无效的申请ID |
| 400 | 申请当前状态为 X，无法审批 |
| 404 | 申请不存在 |

---

### 6.5 POST /api/requests/:id/reject

驳回申请。

| 属性 | 值 |
|------|-----|
| 权限 | admin / manager |

**路径参数:** `id`

**请求体:**
```json
{ "reason": "库存需留给优先项目" }
```

| 字段 | 必填 | 说明 |
|------|------|------|
| reason | 是 | 驳回原因 |

**成功响应 (200):**
```json
{ "code": 0, "message": "申请已驳回" }
```

> 驳回后释放所有预留库存。

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 驳回原因不能为空 / 申请当前状态为 X，无法驳回 |
| 404 | 申请不存在 |

---

### 6.6 POST /api/requests/:id/cancel

撤回申请 (仅申请人自己可操作)。

| 属性 | 值 |
|------|-----|
| 权限 | 任意已登录用户 (仅限本人) |

**路径参数:** `id`

**成功响应 (200):**
```json
{ "code": 0, "message": "申请已撤回" }
```

> 仅 `pending` 状态可撤回，撤回后释放所有预留库存。

**错误响应:**
| 状态码 | message |
|--------|---------|
| 400 | 申请当前状态为 X，无法撤回 |
| 403 | 只能撤回自己的申请 |
| 404 | 申请不存在 |

---

## 7. 数据分析模块 (Analytics)

> 所有接口需要 **admin** 或 **manager** 角色

### 7.1 GET /api/analytics/kpi

获取仪表盘 KPI 指标。

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "in_stock": 150,
    "out_of_stock": 45,
    "pending_requests": 3,
    "month_inbound": 20,
    "month_outbound": 8,
    "last_month_inbound": 15,
    "last_month_outbound": 12,
    "net_change": 12,
    "in_delta": 5,
    "out_delta": -4
  }
}
```

| 字段 | 说明 |
|------|------|
| in_stock | 当前在库数量 |
| out_of_stock | 累计已出库数量 |
| pending_requests | 待审批申请数 |
| month_inbound | 本月入库数 |
| month_outbound | 本月出库数 |
| last_month_inbound | 上月入库数 |
| last_month_outbound | 上月出库数 |
| net_change | 本月净变化 (入-出) |
| in_delta | 入库环比变化 (本月-上月) |
| out_delta | 出库环比变化 (本月-上月) |

---

### 7.2 GET /api/analytics/distribution

获取库存分布统计。

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "by_location": [
      { "subsidiary": "上海分公司", "warehouse": "A仓库", "count": 50 }
    ],
    "by_part_type": [
      { "part_no": "FAN-001", "part_name": "工业风扇", "count": 30 }
    ],
    "by_condition": [
      { "condition": "全新", "count": 120 },
      { "condition": "利旧/返还", "count": 30 }
    ]
  }
}
```

> 仅统计在库 (status=0) 库存。

---

### 7.3 GET /api/analytics/safety-stock

获取安全库存预警。

**成功响应 (200):**
```json
{
  "code": 0,
  "data": [
    {
      "part_no": "MOTOR-001",
      "part_name": "电机",
      "min_stock": 10,
      "actual_stock": 3,
      "shortage": 7
    }
  ]
}
```

> 仅返回 `actual_stock < min_stock` 的备件类型，按缺口降序排列。

---

### 7.4 GET /api/analytics/trend

获取月度出入库趋势。

**成功响应 (200):**
```json
{
  "code": 0,
  "data": [
    { "month": "2025-01", "inbound": 20, "outbound": 8 },
    { "month": "2025-02", "inbound": 15, "outbound": 12 },
    { "month": "2025-03", "inbound": 25, "outbound": 10 }
  ]
}
```

> 按月份升序排列，可用于折线图展示。

---

### 7.5 GET /api/analytics/consumption

获取备件消耗排行。

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| months | number | 统计月数 (默认 6，传 0 则统计全部) |

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "top_parts": [
      { "part_no": "FAN-001", "part_name": "工业风扇", "total_qty": 25 }
    ],
    "by_project": [
      { "project_location": "杭州数据中心", "total_qty": 15, "request_count": 5 }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| top_parts | 消耗量 Top 10 备件 |
| by_project | 按项目地统计 |

---

### 7.6 GET /api/analytics/age

获取库龄分析。

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| stale_days | number | 呆滞阈值天数 (默认 90) |

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "distribution": [
      { "bucket": "0-30天", "count": 50 },
      { "bucket": "31-90天", "count": 30 },
      { "bucket": "91-180天", "count": 15 },
      { "bucket": "180天以上", "count": 5 }
    ],
    "stale_count": 20,
    "stale_days": 90,
    "stale_items": [
      {
        "part_no": "FAN-001",
        "part_name": "工业风扇",
        "serial_number": "SN001",
        "subsidiary": "上海分公司",
        "warehouse": "A仓库",
        "age_days": 200
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| distribution | 库龄分布 (4 个时间桶) |
| stale_count | 超过阈值的呆滞件数量 |
| stale_items | 呆滞件明细 (最多 100 条，按库龄降序) |

---

### 7.7 GET /api/analytics/turnover

获取备件周转率。

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| months | number | 统计周期月数 (默认 6) |

**成功响应 (200):**
```json
{
  "code": 0,
  "data": [
    {
      "part_no": "FAN-001",
      "part_name": "工业风扇",
      "out_qty": 20,
      "in_qty": 30,
      "turnover_rate": 0.67
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| out_qty | 周期内出库数量 |
| in_qty | 当前在库数量 |
| turnover_rate | 周转率 = out_qty / in_qty (in_qty=0 时为 null) |

> 按 turnover_rate 降序排列。

---

## 8. 系统日志模块 (Logs)

> 需要 **admin** 或 **manager** 角色

### 8.1 GET /api/logs

分页查询系统操作日志。

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| category | string | 按类别筛选，逗号分隔多选: `UserMgmt,PartType,Inbound,InventoryEdit,Request` |
| operator | string | 按操作人筛选，逗号分隔多选 |
| start_date | string | 起始日期 (YYYY-MM-DD) |
| end_date | string | 结束日期 (YYYY-MM-DD，包含当天) |
| page | number | 页码，默认 1 |
| page_size | number | 每页条数，默认 20，上限 100 |

**成功响应 (200):**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "_id": "665a...",
        "category": "Inbound",
        "action_type": "单件入库",
        "operator": "admin",
        "details": "入库: FAN-001 / SN20250601001, 上海分公司-A仓库",
        "created_at": "2025-06-01T08:00:00.000Z"
      }
    ],
    "total": 500,
    "page": 1,
    "page_size": 20,
    "total_pages": 25
  }
}
```

**日志类别 (category) 枚举:**
| category | 说明 | 典型 action_type |
|----------|------|-----------------|
| UserMgmt | 用户管理 | 新增用户 / 编辑用户 / 删除用户 |
| PartType | 备件类型管理 | 新增备件类型 / 编辑备件类型 / 删除备件类型 |
| Inbound | 入库操作 | 单件入库 / 批量入库 |
| InventoryEdit | 库存编辑 | 编辑库存记录 |
| Request | 出库申请 | 提交申请 / 审批通过 / 驳回申请 / 撤回申请 |

---

## 9. 数据导出模块 (Export)

> 所有接口需要 **admin** 或 **manager** 角色
> 返回 CSV 文件 (UTF-8 with BOM，Excel 可直接打开中文不乱码)

### 9.1 GET /api/export/inventory

导出在库库存明细。

**响应头:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="inventory_export.csv"
```

**CSV 列:**
| 列名 | 说明 |
|------|------|
| part_no | 备件编号 |
| part_name | 备件名称 |
| serial_number | 序列号 |
| condition | 新旧状态 |
| subsidiary | 所属子公司 |
| warehouse | 所在仓库 |
| inbound_time | 入库时间 |
| inbound_operator | 入库操作人 |

> 仅导出在库 (status=0) 的记录。

---

### 9.2 GET /api/export/requests

导出出库申请/记录。

**响应头:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="requests_export.csv"
```

**CSV 列:**
| 列名 | 说明 |
|------|------|
| id | 申请 ID |
| part_no | 备件编号 |
| part_name | 备件名称 |
| qty | 申请数量 |
| approved_qty | 批准数量 |
| approved_sns | 批准序列号 (分号分隔) |
| status | 状态 |
| project_location | 项目地 |
| applicant | 申请人 |
| approver | 审批人 |
| reject_reason | 驳回原因 |
| created_at | 申请时间 |
| approved_at | 审批时间 |

> 导出全部申请记录 (所有状态)。

---

### 9.3 GET /api/export/analytics

导出分析报告。

**响应头:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="analytics_export.csv"
```

**CSV 内容 (两段合并):**

**段 1: 月度出入库趋势**
| 列名 | 说明 |
|------|------|
| month | 月份 (YYYY-MM) |
| inbound | 入库数 |
| outbound | 出库数 |

**段 2: 库龄明细**
| 列名 | 说明 |
|------|------|
| part_no | 备件编号 |
| part_name | 备件名称 |
| serial_number | 序列号 |
| subsidiary | 所属子公司 |
| warehouse | 所在仓库 |
| inbound_time | 入库时间 |
| age_days | 库龄天数 |
| age_bucket | 库龄区间 (0-30天 / 31-90天 / 91-180天 / 180天以上) |

---

## 接口总览

| # | 方法 | 路径 | 权限 | 说明 |
|---|------|------|------|------|
| 1 | POST | /api/auth/login | 公开 | 登录 |
| 2 | POST | /api/auth/change-password | 已登录 | 改密 |
| 3 | GET | /api/users | admin | 用户列表 |
| 4 | POST | /api/users | admin | 创建用户 |
| 5 | PATCH | /api/users/:username | admin | 编辑用户 |
| 6 | DELETE | /api/users/:username | admin | 删除用户 |
| 7 | GET | /api/part-types | admin/manager | 备件类型列表 |
| 8 | POST | /api/part-types | admin/manager | 创建备件类型 |
| 9 | PATCH | /api/part-types/:part_no | admin/manager | 编辑备件类型 |
| 10 | DELETE | /api/part-types/:part_no | admin/manager | 删除备件类型 |
| 11 | GET | /api/inventory | 已登录 | 库存列表 |
| 12 | POST | /api/inventory/inbound | admin/manager | 单件入库 |
| 13 | GET | /api/inventory/scan/:sn | 已登录 | 扫码查询 |
| 14 | PATCH | /api/inventory/:id | admin/manager | 编辑库存 |
| 15 | POST | /api/inventory/batch-import | admin/manager | 批量入库 |
| 16 | POST | /api/requests | 已登录 | 提交出库申请 |
| 17 | GET | /api/requests | 已登录 | 申请列表 |
| 18 | GET | /api/requests/:id | 已登录 | 申请详情 |
| 19 | POST | /api/requests/:id/approve | admin/manager | 审批通过 |
| 20 | POST | /api/requests/:id/reject | admin/manager | 驳回申请 |
| 21 | POST | /api/requests/:id/cancel | 已登录(本人) | 撤回申请 |
| 22 | GET | /api/analytics/kpi | admin/manager | KPI 指标 |
| 23 | GET | /api/analytics/distribution | admin/manager | 库存分布 |
| 24 | GET | /api/analytics/safety-stock | admin/manager | 安全库存预警 |
| 25 | GET | /api/analytics/trend | admin/manager | 出入库趋势 |
| 26 | GET | /api/analytics/consumption | admin/manager | 消耗排行 |
| 27 | GET | /api/analytics/age | admin/manager | 库龄分析 |
| 28 | GET | /api/analytics/turnover | admin/manager | 周转率 |
| 29 | GET | /api/logs | admin/manager | 系统日志 |
| 30 | GET | /api/export/inventory | admin/manager | 导出库存 |
| 31 | GET | /api/export/requests | admin/manager | 导出申请记录 |
| 32 | GET | /api/export/analytics | admin/manager | 导出分析报告 |
