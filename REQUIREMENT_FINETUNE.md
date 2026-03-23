# 需求迭代优化记录

> 本文档记录备件管理系统交付演示后，根据用户反馈进行的所有迭代优化内容及进度。

---

## 变更记录

| 序号 | 日期 | 模块 | 变更内容 | 状态 | 涉及文件 |
|------|------|------|----------|------|----------|
| 1 | 2026-03-23 | 后端 / 库存入库 | 自动生成序列号格式改为 `nucyyyymmdd****`（每日递增，如 `nuc202603230001`） | 已完成 | `server/src/handlers/inventory.js` |
| 2 | 2026-03-23 | 出库申请 (全栈) | 出库申请新增必填项「出库原因」，下拉选择：维修/项目/销售 | 已完成 | `server/src/handlers/requests.js`, `server/src/utils/validate.js`, `admin/src/views/requests/RequestPage.vue`, `admin/src/views/requests/ApprovalPage.vue`, `miniprogram/pages/request/request.wxml`, `miniprogram/pages/request/request.js`, `miniprogram/pages/approval/approval.wxml`, `miniprogram/cloudfunctions/requests/handlers.js` |

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
- 可选值：`维修`、`项目`、`销售`
- 数据库 `requests` 集合新增 `outbound_reason` 字段
- 审批页面和申请详情页面均展示出库原因

**技术实现**：
- **后端**：`createRequest` 增加 `outbound_reason` 参数提取和校验；Joi schema (`validate.js`) 增加 `outbound_reason: Joi.string().valid('维修', '项目', '销售').required()`
- **PC前端**：`RequestPage.vue` 表单增加 `el-select` 下拉选择；列表和详情弹窗增加出库原因展示
- **PC审批页**：`ApprovalPage.vue` 列表、详情弹窗、审批弹窗均展示出库原因
- **小程序**：`request.wxml/js` 增加 picker 选择器和校验；`approval.wxml` 列表和审批弹窗展示
- **云函数**：`requests/handlers.js` 的 `createRequest` 增加校验和存储

**影响范围**：
- 新提交的出库申请必须选择出库原因，否则无法提交
- 已有申请数据的 `outbound_reason` 为空，展示为 `-`
