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
| 5 | 2026-03-23 | 入库 (全栈) | 所有备件入库新增必选项「采购合同号」，从字典表下拉选择 | 已完成 | `server/src/utils/validate.js`, `server/src/handlers/inventory.js`, `admin/src/views/inventory/InboundPage.vue` |
| 6 | 2026-03-23 | 出库申请 (全栈) | 出库申请新增必选项「项目号」，从字典表下拉选择 | 已完成 | `server/src/utils/validate.js`, `server/src/handlers/requests.js`, `admin/src/views/requests/RequestPage.vue`, `admin/src/views/requests/ApprovalPage.vue`, `miniprogram/utils/api.js`, `miniprogram/pages/request/request.js`, `miniprogram/pages/request/request.wxml`, `miniprogram/pages/approval/approval.wxml`, `miniprogram/cloudfunctions/requests/handlers.js` |
| 7 | 2026-03-24 | 备件类型 (全栈) | 备件类型新增「型号」和「单价」字段；高价值备件型号为必填，单价为选填 | 已完成 | `server/src/utils/validate.js`, `server/src/handlers/partTypes.js`, `admin/src/views/part-types/PartTypeManagement.vue` |
| 8 | 2026-03-24 | 备件类型 (全栈) | 备件类型管理新增批量导入功能，支持 Excel/CSV 模板下载、解析预览、批量创建 | 已完成 | `server/src/utils/validate.js`, `server/src/handlers/partTypes.js`, `server/src/routes/partTypes.js`, `admin/src/views/part-types/PartTypeManagement.vue` |
| 9 | 2026-03-25 | 申请/审批显示优化 (PC端) | 重构网页端申请结果和审批管理的列表/详情展示，按备件项逐行展示12个字段，支持部分审批数量显示 | 已完成 | `server/src/handlers/requests.js`, `admin/src/views/requests/ApprovalPage.vue`, `admin/src/views/requests/RequestPage.vue` |
| 10 | 2026-03-25 | 历史数据迁移修复 | 修复历史已审批申请全部显示「全量通过」的BUG，启动时自动迁移补全 `approved_items` 和 `approval_type` | 已完成 | `server/src/db.js`, `server/src/index.js` |
| 11 | 2026-03-25 | CSV导出修复 (全部) | 重写申请记录CSV导出，修正字段映射错误和格式问题；所有导出表头改为中文 | 已完成 | `server/src/handlers/export.js` |
| 12 | 2026-03-26 | 安全加固 (全栈) | 12项安全审查修复：JWT密钥强制、token版本控制、原子库存预留、ReDoS防护、bindToken替代openId、CORS/Cookie加固、限流、CSV行数限制、会话验证等 | 已完成 | `server/src/config.js`, `server/src/db.js`, `server/src/index.js`, `server/src/middleware/auth.js`, `server/src/handlers/auth.js`, `server/src/handlers/requests.js`, `server/src/handlers/export.js`, `server/src/handlers/users.js`, `server/src/handlers/inventory.js`, `server/src/handlers/partTypes.js`, `server/src/handlers/dictionaries.js`, `server/src/routes/auth.js`, `server/src/utils/escape-regex.js`, `server/src/utils/subscribe-message.js`, `admin/src/stores/auth.ts`, `admin/src/router/index.ts`, `miniprogram/app.js`, `miniprogram/pages/index/index.js`, `miniprogram/utils/api.js` |
| 13 | 2026-03-27 | 安全/通用功能 (全栈) | 大小写不敏感输入：username转小写，part_no/serial_number/contract_no转大写 | 已完成 | `server/src/handlers/auth.js`, `server/src/handlers/users.js`, `server/src/handlers/inventory.js`, `server/src/handlers/partTypes.js`, `server/src/handlers/requests.js`, `miniprogram/pages/index/index.js` |
| 14 | 2026-03-27 | 安全/通用功能 (全栈) | 新用户默认密码123456 + 首次登录强制改密（must_change_password标记） | 已完成 | `server/src/handlers/auth.js`, `server/src/handlers/users.js`, `server/src/db.js`, `server/src/utils/validate.js`, `admin/src/views/Login.vue`, `admin/src/views/users/UserManagement.vue`, `admin/src/stores/auth.ts`, `miniprogram/app.js`, `miniprogram/pages/index/index.js` |
| 15 | 2026-03-27 | 安全/通用功能 (PC端) | 管理员重置密码改为固定重置为默认密码123456，自动设must_change_password | 已完成 | `server/src/handlers/users.js`, `server/src/routes/users.js`, `admin/src/views/users/UserManagement.vue` |
| 16 | 2026-03-27 | 安全/通用功能 (全栈) | 密码复杂度：至少8位，必须包含大写字母、小写字母和数字 | 已完成 | `server/src/utils/validate.js`, `server/src/handlers/auth.js`, `admin/src/views/Login.vue`, `admin/src/components/AppLayout.vue` |
| 17 | 2026-03-27 | 安全/通用功能 (PC端) | 15分钟软超时：前端无操作自动登出，60秒倒计时警告，时长可配置 | 已完成 | `server/src/config.js`, `server/src/handlers/auth.js`, `admin/src/stores/auth.ts`, `admin/src/components/AppLayout.vue` |
| 18 | 2026-03-27 | 安全/通用功能 (后端) | 12小时硬超时：JWT过期时间从24h改为12h，cookie maxAge同步，时长可配置 | 已完成 | `server/src/config.js`, `server/src/handlers/auth.js` |
| 19 | 2026-03-27 | 安全/通用功能 (全栈) | 账户锁定：连续5次登录失败锁定30分钟，管理员可手动解锁，用户管理页显示锁定状态 | 已完成 | `server/src/config.js`, `server/src/handlers/auth.js`, `server/src/handlers/users.js`, `server/src/routes/users.js`, `server/src/db.js`, `admin/src/views/users/UserManagement.vue`, `admin/src/utils/http.ts` |
| 20 | 2026-03-27 | 安全/通用功能 (后端) | 登录审计日志：Auth分类记录登录成功/失败/登出/微信登录事件，含IP和User-Agent | 已完成 | `server/src/handlers/auth.js` |

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

---

### 5. 入库新增必选项「采购合同号」（2026-03-23）

**背景**：用户要求每个设备入库时记录采购合同号，便于追溯采购来源。合同号选项通过字典管理模块（变更 4）维护。

**变更内容**：
- 单件入库表单新增「采购合同号」必填下拉，选项从 `GET /api/dictionaries/options?category=contract_no` 获取
- 批量导入 Excel 模板新增「采购合同号」列，解析时校验必填
- `inventory` 集合新增 `contract_no` 字段
- 扫码查询详情页面展示采购合同号
- 入库日志记录合同号信息

**技术实现**：
- **后端**：`validate.js` 的 `inventory.inbound` 和 `inventory.batchImport` schema 均新增 `contract_no: Joi.string().trim().max(100).required()`
- **后端**：`inventory.js` 的 `inbound` 和 `batchImport` handler 提取并存入 `contract_no`
- **PC前端**：`InboundPage.vue` 单件入库表单新增下拉；批量导入模板/列映射/预览表格/校验均新增；扫码详情展示

**影响范围**：
- 新入库的备件必须选择采购合同号，否则无法入库
- 已有库存数据的 `contract_no` 为空，扫码查询展示为 `-`
- admin 需先在「字典管理 > 采购合同号」中维护合同号选项

---

### 6. 出库申请新增必选项「项目号」（2026-03-23）

**背景**：用户要求出库申请时必须选择领用项目号，便于按项目追踪备件去向。项目号选项通过字典管理模块（变更 4）维护。

**变更内容**：
- 出库申请表单新增「项目号」必填下拉，选项从 `GET /api/dictionaries/options?category=project_no` 获取
- `requests` 集合新增 `project_no` 字段
- PC 申请页列表、详情弹窗展示项目号
- PC 审批页列表、详情弹窗、审批弹窗展示项目号
- 小程序申请页新增 picker 选择项目号；列表展示项目号
- 小程序审批页列表和审批弹窗展示项目号

**技术实现**：
- **后端**：`validate.js` 的 `requests.create` schema 新增 `project_no: Joi.string().trim().max(100).required()`
- **后端**：`requests.js` 的 `createRequest` handler 提取并存入 `project_no`
- **PC前端**：`RequestPage.vue` 表单新增下拉、列表新增列、详情展示；`ApprovalPage.vue` 列表、详情、审批弹窗展示
- **小程序**：`api.js` 新增 `dictionaries.options()` 接口；`request.js` 新增加载/选择/校验/提交逻辑；`request.wxml` 新增 picker；`approval.wxml` 列表和弹窗展示
- **云函数**：`requests/handlers.js` 的 `createRequest` 同步接收并存储 `project_no`

**影响范围**：
- 新提交的出库申请必须选择项目号，否则无法提交
- 已有申请数据的 `project_no` 为空，展示为 `-`
- admin 需先在「字典管理 > 项目号」中维护项目号选项

---

### 7. 备件类型新增「型号」和「单价」字段（2026-03-24）

**背景**：用户反馈需要在备件类型中记录型号和单价信息，便于资产管理和成本统计。高价值备件的型号为必填项。

**变更内容**：
- `part_types` 集合新增 `model`（型号）和 `unit_price`（单价）字段
- 新增备件类型时：
  - 若价值类型为「高价值」，型号为必填项
  - 若价值类型为「低价值」，型号为选填项
  - 单价始终为选填项
- 编辑备件类型时同理：若价值类型为或改为「高价值」，则型号必须填写
- PC 管理后台备件类型列表新增「型号」和「单价」列
- 新增/编辑弹窗新增「型号」和「单价」表单项
- 切换价值类型时自动重新校验型号字段

**技术实现**：
- **后端校验**：`validate.js` 的 `partTypes.create` schema 新增 `model: Joi.string().trim().max(100).allow('').default('')` 和 `unit_price: Joi.number().min(0).allow(null, '').default(null)`，并通过 `.custom()` 实现高价值备件型号必填的交叉校验
- **后端校验**：`partTypes.update` schema 同步新增两个字段
- **后端 handler**：`partTypes.js` 的 `createPartType` 和 `updatePartType` 提取并存入新字段；`updatePartType` 额外增加编辑时的交叉校验（考虑已有数据和本次修改的组合）
- **后端日志**：新增/编辑操作日志包含型号和单价信息
- **PC前端**：`PartTypeManagement.vue` 表格新增两列；表单新增两个输入项；自定义校验器 `modelValidator` 根据 `value_type` 动态校验型号必填；`watch` 监听 `value_type` 变化时重新触发型号校验

**数据模型变更**：
```
part_types {
  ...existing fields,
  model: string,          // 型号，高价值必填
  unit_price: number|null // 单价，选填
}
```

**影响范围**：
- 新建高价值备件类型时必须填写型号，否则无法创建
- 已有备件类型数据的 `model` 为空，列表展示为 `-`；`unit_price` 为 null，展示为 `-`
- 编辑已有高价值备件类型时，如果型号为空，需要补填才能保存

---

### 8. 备件类型批量导入功能（2026-03-24）

**背景**：参考入库页面的批量导入功能，为备件类型管理也提供批量导入能力，方便初始化大量备件类型数据。

**变更内容**：
- PC 管理后台「备件类型管理」页面改为 Tab 布局：「备件类型列表」和「批量导入」两个标签
- 批量导入标签页功能：
  - 下载 Excel 导入模板（含表头和示例数据行）
  - 选择 Excel/CSV 文件，前端解析并预览
  - 前端校验：必填字段（备件编号、备件名称）、高价值备件型号必填、价值类型有效性、单价和安全库存数值格式
  - 确认导入后调用后端批量创建接口
  - 导入结果展示（成功/失败条数及错误详情）
- 模板列：备件编号、备件名称、价值类型、型号、单价、安全库存

**技术实现**：
- **后端校验**：`validate.js` 新增 `partTypes.batchImport` schema，items 数组每项包含 part_no(必填)、part_name(必填)、value_type(默认高价值)、model、unit_price、min_stock，单次最多 500 条
- **后端 handler**：`partTypes.js` 新增 `batchImportPartTypes`，逐条校验（高价值型号必填、part_no 唯一性），跳过重复编号，记录成功/失败数和错误详情，写入系统日志
- **后端路由**：`routes/partTypes.js` 新增 `POST /batch-import` 路由（admin/manager）
- **PC前端**：`PartTypeManagement.vue` 改为 `el-tabs` 布局；新增批量导入标签页，使用 `xlsx` 库解析文件，列名映射支持中英文，前端预校验后提交

**API 端点**：
| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| POST | /api/part-types/batch-import | admin/manager | 批量导入备件类型（≤500条） |

---

### 9. 申请/审批显示优化 — PC端（2026-03-25）

**背景**：原有的申请列表只显示简略的申请明细（如 "MOUSE x3"），部分审批时无法看出实际批准了多少件。用户要求重构显示，按备件项逐行展示完整的 12 个字段。

**变更内容**：

**后端 (`requests.js`)**：
- 审批通过时，在 request 文档中新增 `approved_items` 数组和 `approval_type` 字段
- `approved_items` 每项包含：`part_no`, `part_name`, `value_type`, `quantity`(申请数量), `serial_numbers`(预留SN), `approved_quantity`(审批数量), `approved_serial_numbers`(审批SN)
- `approval_type`: `'full'`（全量通过）或 `'partial'`（部分通过），根据是否每项的 approved_quantity === quantity 自动判定

**PC 审批管理页 (`ApprovalPage.vue`)**：
- 列表改为按备件项逐行展示，同一申请的请求级字段通过 `span-method` 合并单元格
- 12 列：申请时间、项目号、申请人、出库原因、备件编号、备件名称、序列号、申请数量、审批时间、审批人、审批结果（全量通过/部分通过/已驳回/待审批）、审批数量
- 详情弹窗增加审批数量和审批序列号列
- 审批结果标签颜色区分：全量通过(绿)、部分通过(橙)、已驳回(红)、待审批(黄)

**PC 我的申请页 (`RequestPage.vue`)**：
- "我的申请" 列表同样改为按备件项逐行展示
- 11 列（无申请人列）：申请时间、项目号、出库原因、备件编号、备件名称、序列号、申请数量、审批时间、审批人、审批结果、审批数量
- 详情弹窗同步增加审批数量和审批序列号

**数据模型变更**：
```
requests {
  ...existing fields,
  approval_type: 'full' | 'partial',   // 审批通过时写入
  approved_items: [{                     // 审批通过时写入
    part_no, part_name, value_type,
    quantity,                            // 申请数量
    serial_numbers,                      // 预留序列号
    approved_quantity,                   // 审批数量
    approved_serial_numbers              // 审批序列号
  }]
}
```

**影响范围**：
- 新审批的申请会写入 `approved_items` 和 `approval_type`，列表直接展示审批数量
- 历史已审批的申请数据无 `approved_items` 字段，列表中审批数量显示为申请数量（等同全量通过），审批结果显示为"全量通过"
- 小程序端暂不修改，等待后续输入

---

### 10. 历史已审批申请数据迁移修复（2026-03-25）

**背景**：变更 9 新增了 `approved_items` 和 `approval_type` 字段，但仅在新审批操作时写入。历史已审批的申请文档缺少这两个字段，前端回退显示原始 `items`（全部SN），导致所有历史审批结果均显示「全量通过」，且部分实际已出库的序列号在库存页面仍显示在库。

**问题现象**：
- 所有已审批申请的「审批结果」列均显示「全量通过」，包括实际为部分审批的记录
- 部分审批中被批准出库的序列号在库存列表中仍显示「在库」状态

**根因分析**：
- 前端逻辑：优先读取 `approved_items`，不存在时回退到 `items`，将所有预留SN视为已审批
- 历史数据：审批代码在变更 9 之前未写入 `approved_items`/`approval_type` 字段

**修复方案**：
- 新增 `migrateApprovedRequests()` 启动迁移函数，在服务启动时自动运行
- 查找所有 `status='approved'` 且缺少 `approved_items` 字段的历史申请
- 对每条申请的每个 item，查询 `inventory` 集合中对应序列号的实际状态（`status=1` 即已出库）
- 据此重建 `approved_items`（含实际审批数量和审批序列号）和 `approval_type`
- 迁移为幂等操作（通过 `approved_items: { $exists: false }` 过滤），重复运行不会重复处理

**技术实现**：
- **`server/src/db.js`**：新增 `migrateApprovedRequests()` 函数并导出
- **`server/src/index.js`**：启动流程中 `initCollections()` 之后调用 `await migrateApprovedRequests()`

**影响范围**：
- 仅影响历史已审批但缺少 `approved_items` 的申请数据
- 迁移后这些申请在列表中正确显示「全量通过」或「部分通过」
- 新的审批操作不受影响

---

### 11. CSV导出修复（2026-03-25）

**背景**：审批管理页面的CSV导出功能存在严重的内容和格式问题，导出数据为空或错误。

**问题分析**：
- `exportRequests` 函数引用了 `requests` 文档上不存在的顶层字段（`part_no`, `qty`, `approved_qty`, `approved_sns`），实际数据模型中这些信息在 `items[]` / `approved_items[]` 数组内
- 每条申请仅输出一行，未按物料项展开，与页面显示格式不一致
- 所有CSV表头为英文字段名（如 `part_no`, `status`），中文用户无法直接使用

**修复内容**：

1. **重写 `exportRequests`**：
   - 正确读取 `approved_items`（优先）或 `items` 数组
   - 按物料项逐行展开，与审批管理页面 12 列完全一致
   - 审批结果显示中文：全量通过 / 部分通过 / 已驳回 / 已撤回 / 待审批
   - 审批数量使用 `approved_quantity`（有 `approved_items` 时），否则按状态推断

2. **CSV 12列**：
   申请时间、项目号、申请人、出库原因、备件编号、备件名称、序列号、申请数量、审批时间、审批人、审批结果、审批数量

3. **所有导出表头统一改为中文**：
   - 库存导出：备件编号、备件名称、序列号、状况、子公司、仓库、入库时间、入库操作人
   - 分析导出：月份/入库数量/出库数量（趋势），备件编号/备件名称/序列号/子公司/仓库/入库时间/库龄(天)/库龄分组（库龄）

4. **重构 `toCsv` 工具函数**：
   - 支持 `{ key, label }` 列定义对象，分离内部字段名和显示标签
   - 向后兼容纯字符串列名（同时作为 key 和 label）
   - 提取 `escapeCsvField` 为独立函数

**影响范围**：
- 审批管理页导出的CSV内容与页面表格展示一致，数据正确完整
- 库存导出和分析导出的表头从英文改为中文，内容不变
- 所有CSV均保留 UTF-8 BOM 以确保 Excel 正确识别中文编码

---

### 12. 安全审查修复 — 12项漏洞修复（2026-03-26）

**背景**：对系统进行全面安全审查，发现16个潜在漏洞，实施其中12项修复（排除WeChat AppSecret泄露、缺少HTTPS、缺少输入长度限制、缺少Content-Security-Policy等4项暂不处理的问题）。

**修复内容**：

1. **JWT密钥硬编码 (#2)**：`config.js` 移除默认 fallback，`JWT_SECRET` 环境变量缺失时进程直接退出
2. **Cookie SameSite (#4)**：登录设置的 HttpOnly Cookie 增加 `sameSite: 'strict'`
3. **token_version 会话吊销 (#7)**：
   - `auth.js` 中间件改为 async，每次请求查询 DB 验证 `token_version` 和 `is_active`
   - 修改密码、停用账户时自动 `$inc: { token_version: 1 }`
   - 一次性迁移：将所有 `token_version: 1` 的用户升至 `2`，强制失效旧 JWT
4. **CORS 验证 (#5)**：`index.js` 启动时检查 `corsOrigin`，若为 `*` 或空则拒绝启动
5. **库存预留竞态条件 (#6)**：`requests.js` 的 `createRequest` 改用逐条 `findOneAndUpdate` 原子预留，使用 `__pending__` 占位符
6. **ReDoS 防护 (#8)**：新增 `escape-regex.js` 工具函数，所有 `$regex` 搜索前对用户输入转义
7. **openId 泄露 (#9)**：小程序 `wxLogin` 返回临时 `bindToken` 替代 `openId`，后端新增 `bind_tokens` 集合（TTL 5分钟自动清理）
8. **CSV导出 OOM (#11)**：所有导出查询增加 `MAX_EXPORT_ROWS = 50000` 限制，超出时CSV末尾追加截断提示
9. **限流 (#12)**：`/api/auth/wx-bind` 与登录共享 loginLimiter（15分钟20次）
10. **会话验证 (#13)**：新增 `GET /api/auth/me` 端点，PC端路由守卫首次导航时异步校验会话有效性
11. **微信订阅消息模板ID (#14)**：从硬编码改为读取 `config.wxTemplateIds`，支持环境变量覆盖
12. **登录请求校验 (#16)**：登录和改密接口增加 Joi schema 校验

**影响范围**：
- 所有现有用户的 JWT 会在部署后立即失效，需重新登录
- WeChat 小程序绑定流程改为 bindToken 机制，用户体验无变化
- 环境变量 `JWT_SECRET` 变为必填项，缺失时服务无法启动

---

### 13. 大小写不敏感输入（2026-03-27）

**背景**：用户反馈系统中同一编号因大小写不同被视为不同记录（如 `ABC123` 和 `abc123`），造成数据混乱。

**变更内容**：
- **用户名**：写入时统一转换为小写（`toLowerCase()`）
  - 影响位置：PC登录、创建用户、微信绑定
- **业务字段**：写入时统一转换为大写（`toUpperCase()`）
  - `part_no`（备件编号）：创建备件类型、批量导入备件类型、入库、批量导入库存、创建申请
  - `serial_number`（序列号）：入库、批量导入、扫码查询
  - `contract_no`（合同号）：入库、批量导入

**技术实现**：
- 在各 handler 的写入路径开头添加 `.toUpperCase().trim()` 或 `.toLowerCase().trim()`
- 查询路径（搜索/扫码）同步标准化输入，确保大小写不影响查找
- 小程序端绑定时也对用户名做 lowercase 处理

**影响范围**：
- 部署后新写入的数据自动标准化
- 已有数据不会自动转换，如需统一需手动执行数据库脚本

---

### 14. 新用户默认密码 + 首次登录强制改密（2026-03-27）

**背景**：用户要求新创建的用户统一使用默认密码 `123456`，首次登录时强制修改密码，避免弱密码长期使用。

**变更内容**：
- 创建用户时不再由管理员输入密码，统一使用默认密码 `123456`
- 用户文档新增 `must_change_password: boolean` 字段
- 新用户创建时自动设置 `must_change_password: true`
- PC端登录后如检测到该标记，弹出不可关闭的改密弹窗，输入新密码后清除标记
- 小程序端绑定/登录后如检测到该标记，弹窗提示需去PC端修改密码

**数据模型变更**：
```
users {
  ...existing fields,
  must_change_password: boolean  // true=首次登录需改密
}
```

**技术实现**：
- **后端**：`createUser` 不再接受 password 参数，固定使用 `DEFAULT_PASSWORD = '123456'`；`login`/`wxLogin`/`wxBind` 响应中包含 `must_change_password` 标记；`changePassword` 成功后将标记设为 `false`
- **Joi schema**：`users.create` 移除 password 字段
- **PC前端**：`Login.vue` 新增不可关闭的改密弹窗；`UserManagement.vue` 创建用户表单移除密码输入，显示提示信息
- **数据库迁移**：`db.js` 启动时为已有用户补充 `must_change_password: false`

**影响范围**：
- 已有用户不受影响（`must_change_password` 设为 `false`）
- 新创建的用户首次登录时必须修改密码
- 管理员创建用户的界面简化，无需输入密码

---

### 15. 管理员重置密码为默认值（2026-03-27）

**背景**：原有的「重置密码」功能允许管理员为用户设置自定义密码，改为统一重置为默认密码 `123456`，降低操作复杂度并配合强制改密机制。

**变更内容**：
- 重置密码从弹窗输入自定义密码改为确认弹窗（Popconfirm）
- 确认后直接重置为 `123456`，设置 `must_change_password: true`，递增 `token_version` 强制登出
- 同时清除账户锁定状态（`failed_login_attempts` 和 `locked_until`）

**技术实现**：
- **后端**：新增 `POST /api/users/:username/reset-password` 端点
- **PC前端**：`UserManagement.vue` 将原有的重置密码弹窗替换为 `el-popconfirm` 确认框

---

### 16. 密码复杂度要求（2026-03-27）

**背景**：用户要求增加密码强度校验，防止使用过于简单的密码。

**变更内容**：
- 新密码必须满足：至少8位，包含至少一个大写字母、一个小写字母和一个数字
- 正则表达式：`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/`
- 应用于：修改密码（后端 Joi + handler 双重校验）、首次改密弹窗、AppLayout 改密弹窗

**技术实现**：
- **后端**：`validate.js` 中 `changePassword.newPassword` 增加 `min(8).pattern(...)` 校验；`auth.js` 的 `changePassword` handler 增加额外正则校验
- **PC前端**：`Login.vue` 和 `AppLayout.vue` 的密码表单规则均更新为 8 位 + 复杂度校验

**注意**：默认密码 `123456` 不符合复杂度要求，这是设计预期——用户首次登录时必须设置符合要求的新密码。

---

### 17. 前端软超时 — 无操作自动登出（2026-03-27）

**背景**：用户要求系统在长时间无操作后自动登出，防止离席后他人操作。

**变更内容**：
- PC管理后台增加前端活动检测机制
- 默认15分钟无操作后弹出警告弹窗，倒计时60秒后自动登出
- 用户点击"继续使用"可重置计时器
- 监听的用户活动事件：`mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart`, `click`

**配置项**（便于测试验证）：

| 配置方式 | 位置 | 默认值 | 说明 |
|----------|------|--------|------|
| 环境变量 | `server/.env` → `SOFT_TIMEOUT_MINUTES=2` | 15 | 设为2可快速验证 |
| 代码配置 | `server/src/config.js` → `softTimeoutMinutes` | 15 | 直接修改代码 |

**技术实现**：
- **后端**：`config.js` 新增 `softTimeoutMinutes` 配置项；`/auth/login` 和 `/auth/me` 响应中返回该值
- **PC前端**：`auth.ts` store 存储 `softTimeoutMinutes`；`AppLayout.vue` 使用 `setTimeout` + `setInterval` 实现活动追踪和倒计时

---

### 18. JWT硬超时 — 12小时过期（2026-03-27）

**背景**：原 JWT 过期时间为 24 小时，用户要求缩短至 12 小时以加强安全性。

**变更内容**：
- JWT 签发时 `expiresIn` 从 `'24h'` 改为 `'12h'`
- Cookie `maxAge` 从固定 24 小时改为动态解析 `jwtExpiresIn` 配置值
- 支持通过环境变量 `JWT_EXPIRES_IN` 自定义

**配置项**（便于测试验证）：

| 配置方式 | 位置 | 默认值 | 说明 |
|----------|------|--------|------|
| 环境变量 | `server/.env` → `JWT_EXPIRES_IN=2m` | 12h | 设为2m可快速验证 |
| 代码配置 | `server/src/config.js` → `jwtExpiresIn` | '12h' | 直接修改代码 |

**技术实现**：
- **后端**：`config.js` 的 `jwtExpiresIn` 支持环境变量覆盖；`auth.js` 新增 `parseExpiryToMs()` 将字符串格式（如 `'12h'`, `'2m'`）转为毫秒，用于 cookie maxAge

---

### 19. 账户锁定机制（2026-03-27）

**背景**：用户要求在连续多次登录失败后锁定账户，防止暴力破解。

**变更内容**：
- 用户文档新增 `failed_login_attempts`（失败次数）和 `locked_until`（锁定截止时间）字段
- 连续 5 次密码错误后账户锁定 30 分钟
- 锁定期间所有登录尝试返回 HTTP 423 和剩余锁定时间
- 登录成功后自动重置失败计数
- 管理员可在用户管理页面手动解锁
- 重置密码时自动清除锁定状态
- 用户管理列表新增「锁定」状态列和「解锁」按钮

**数据模型变更**：
```
users {
  ...existing fields,
  failed_login_attempts: number,  // 连续失败次数
  locked_until: Date | null       // 锁定截止时间
}
```

**配置项**：
```
# server/src/config.js
maxLoginAttempts: 5    // 或环境变量 MAX_LOGIN_ATTEMPTS
lockoutMinutes: 30     // 或环境变量 LOCKOUT_MINUTES
```

**技术实现**：
- **后端**：`auth.js` 的 `login`/`wxBind` 登录失败时递增计数，达阈值写入 `locked_until`；登录前检查锁定状态；成功后重置
- **后端**：新增 `POST /api/users/:username/unlock` 端点（admin权限）
- **PC前端**：`UserManagement.vue` 列表新增锁定状态列；条件显示"解锁"按钮；`http.ts` 增加 423 状态码处理
- **数据库迁移**：`db.js` 启动时为已有用户补充 `failed_login_attempts: 0, locked_until: null`

**API 端点**：
| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| POST | /api/users/:username/reset-password | admin | 重置为默认密码 |
| POST | /api/users/:username/unlock | admin | 手动解锁被锁定的用户 |

---

### 20. 登录审计日志（2026-03-27）

**背景**：用户要求记录所有认证相关事件，便于安全审计和问题追溯。

**变更内容**：
- 所有认证事件写入 `sys_logs` 集合，分类为 `Auth`
- 记录的事件类型：
  - `登录成功`：PC端登录成功
  - `登录失败`：密码错误、用户不存在、账户停用、账户锁定
  - `登出`：PC端登出
  - `微信登录`：小程序静默登录成功
  - `微信绑定登录`：小程序绑定账号并登录成功
  - `修改密码`：用户修改密码
- 每条日志包含：`ip`（请求IP）、`user_agent`（浏览器/客户端标识）、`details`（事件描述）

**技术实现**：
- `auth.js` 新增 `auditLog()` 内部函数，封装日志写入逻辑（异常不阻塞主流程）
- 所有认证 handler 在关键节点调用 `auditLog()`
- 日志可通过现有的「系统日志」页面查看（category 筛选 `Auth`）
