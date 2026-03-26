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
