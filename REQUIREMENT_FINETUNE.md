# 需求迭代优化记录

> 本文档记录备件管理系统交付演示后，根据用户反馈进行的所有迭代优化内容及进度。

---

## 变更记录

| 序号 | 日期 | 模块 | 变更内容 | 状态 | 涉及文件 |
|------|------|------|----------|------|----------|
| 1 | 2026-03-23 | 后端 / 库存入库 | 自动生成序列号格式改为 `nucyyyymmdd****`（每日递增，如 `nuc202603230001`） | 已完成 | `server/src/handlers/inventory.js` |
| 2 | 2026-03-23 | 出库申请 (全栈) | 出库申请新增必填项「出库原因」，下拉选择：维修/调用/销售 | 已完成 | `server/src/handlers/requests.js`, `server/src/utils/validate.js`, `admin/src/views/requests/RequestPage.vue`, `admin/src/views/requests/ApprovalPage.vue`, `miniprogram/pages/request/request.wxml`, `miniprogram/pages/request/request.js`, `miniprogram/pages/approval/approval.wxml`, `miniprogram/cloudfunctions/requests/handlers.js` |
| 3 | 2026-03-23 | 出库原因选项 | 出库原因下拉选项「项目」改为「调用」 | 已完成 | `server/src/handlers/requests.js`, `server/src/utils/validate.js`, `admin/src/views/requests/RequestPage.vue`, `miniprogram/pages/request/request.js`, `miniprogram/cloudfunctions/requests/handlers.js` |
| 4 | 2026-03-23 | 字典管理 (全栈) | 新增通用字典管理模块，支持「项目号」和「采购合同号」两个分类的增删改查及启用/停用 | 已完成 | `server/src/db.js`, `server/src/index.js`, `server/src/utils/validate.js`, `server/src/handlers/dictionaries.js`, `server/src/routes/dictionaries.js`, `admin/src/views/dictionaries/DictionaryManagement.vue`, `admin/src/router/index.ts`, `admin/src/components/AppLayout.vue` |

---

## 详细说明

### 1. 自动序列号格式优化（2026-03-23）

**背景**：低价值备件入库时序列号非必填，系统自动生成。原格式为 `AUTO-时间戳-随机hex`，不够直观且无法体现入库日期和顺序。

**变更内容**：
- 序列号格式改为 `nuc` + `yyyymmdd` + 4位递增序号
- 示例：2026年3月23日第一个入库 → `nuc202603230001`，第二个 → `nuc202603230002`
- 每日序号从 `0001` 开始自动递增

**技术实现**：
- 使用 MongoDB `counters` 集合按日期键（`sn_daily_yyyymmdd`）原子递增，保证并发安全且不重复
- `generateAutoSN()` 改为 async 函数
- 单件入库（`inbound`）和批量导入（`batchImport`）两处调用均已适配

**影响范围**：
- 仅影响新入库的低价值备件自动序列号，已有数据不受影响
- 高价值备件仍需手动输入序列号，逻辑不变

---

### 2. 出库申请新增「出库原因」必填项（2026-03-23）

**背景**：用户反馈出库申请缺少出库原因分类，不便于后续统计和追溯。

**变更内容**：
- 出库申请表单新增「出库原因」必填下拉项
- 可选值：`维修`、`调用`、`销售`
- 数据库 `requests` 集合新增 `outbound_reason` 字段
- 审批页面和申请详情页面均展示出库原因

**技术实现**：
- **后端**：`createRequest` 增加 `outbound_reason` 参数提取和校验；Joi schema (`validate.js`) 增加 `outbound_reason: Joi.string().valid('维修', '调用', '销售').required()`
- **PC前端**：`RequestPage.vue` 表单增加 `el-select` 下拉选择；列表和详情弹窗增加出库原因展示
- **PC审批页**：`ApprovalPage.vue` 列表、详情弹窗、审批弹窗均展示出库原因
- **小程序**：`request.wxml/js` 增加 picker 选择器和校验；`approval.wxml` 列表和审批弹窗展示
- **云函数**：`requests/handlers.js` 的 `createRequest` 增加校验和存储

**影响范围**：
- 新提交的出库申请必须选择出库原因，否则无法提交
- 已有申请数据的 `outbound_reason` 为空，展示为 `-`

---

### 3. 出库原因选项「项目」改为「调用」（2026-03-23）

**背景**：用户反馈出库原因中的「项目」表述不够准确，改为「调用」更贴合实际业务场景。

**变更内容**：
- 出库原因下拉选项由 `维修`/`项目`/`销售` 改为 `维修`/`调用`/`销售`

**影响范围**：
- 后端 Joi 校验、handler 硬编码校验、PC 前端下拉选项、小程序 picker 选项均已同步更新
- 已有申请数据中 `outbound_reason` 为 `项目` 的记录不受影响，仅展示为历史值

---

### 4. 通用字典管理模块（2026-03-23）

**背景**：系统需要支持「项目号」和「采购合同号」等可变下拉选项的维护。这些数据随业务变化频繁增减，但不适合为每类数据建立独立的业务实体表，采用通用字典表方案以控制系统边界。

**变更内容**：
- 新增 `dictionaries` 集合，通过 `category` 字段区分不同分类
- 当前支持两个分类：`project_no`（项目号）、`contract_no`（采购合同号）
- PC 管理后台侧边栏新增「字典管理」菜单（admin/manager 可见）
- 页面使用 tab 切换分类，每个分类支持：新增、编辑、启用/停用、删除、搜索、分页
- 提供 `GET /api/dictionaries/options` 接口供其他页面下拉框获取启用中的选项

**数据模型**：
```
dictionaries {
  category: 'project_no' | 'contract_no',
  label: string,          // 选项值
  is_active: boolean,     // 启用/停用
  sort_order: number,     // 排序
  created_at, updated_at
}
索引: category+label (unique), category+is_active
```

**API 端点**：
| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| GET | /api/dictionaries | admin/manager | 分页列表（管理用） |
| GET | /api/dictionaries/options | 登录 | 获取启用选项（供下拉框） |
| POST | /api/dictionaries | admin/manager | 新增字典项 |
| PATCH | /api/dictionaries/:id | admin/manager | 编辑/启停用 |
| DELETE | /api/dictionaries/:id | admin/manager | 删除字典项 |

**设计思路**：
- 字典表只管理「有哪些选项可选」，不涉及业务属性（如合同金额、项目进度等）
- 将来新增分类（如供应商名称等）只需在 `VALID_CATEGORIES` 中添加即可，前端 tab 同步新增
- 停用的字典项不会出现在业务表单的下拉框中，但不影响已有关联数据的展示
- 所有增删改操作均记录系统日志（category: `Dictionary`）
