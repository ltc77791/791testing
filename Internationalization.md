# 备件管理系统 — 国际化 (i18n) 实现方案

> 支持语言：简体中文 (zh-CN)、繁体中文 (zh-TW)、英文 (en)
>
> 核心原则：只翻译界面文字（标签、按钮、提示、表头、菜单），用户输入的业务数据（备件名称、项目地点、备注等）保持原样不动。

---

## 一、PC 管理后台 (Vue 3 + Element Plus)

### 1.1 技术选型

使用 **`vue-i18n`** (v9.x)，Vue 3 生态的官方国际化方案。

```bash
npm install vue-i18n
```

### 1.2 目录结构

```
admin/src/locales/
├── index.ts       # i18n 实例创建 + 语言切换逻辑
├── zh-CN.json     # 简体中文
├── zh-TW.json     # 繁体中文
└── en.json        # 英文
```

### 1.3 语言包示例

```json
// zh-CN.json
{
  "menu": {
    "dashboard": "数据概览",
    "trend": "趋势分析",
    "age": "库龄分析",
    "users": "用户管理",
    "partTypes": "备件类型",
    "inventory": "库存管理",
    "inbound": "入库管理",
    "request": "领用申请",
    "approval": "审批管理",
    "logs": "操作日志"
  },
  "inventory": {
    "partNo": "备件编号",
    "partName": "备件名称",
    "serialNumber": "序列号",
    "subsidiary": "子公司",
    "warehouse": "仓库",
    "condition": "成色",
    "conditionNew": "全新",
    "conditionUsed": "利旧/返还",
    "contractNo": "采购合同号",
    "inboundTime": "入库时间",
    "inboundOperator": "入库人",
    "status": {
      "inStock": "在库",
      "outOfStock": "已出库"
    }
  },
  "request": {
    "applicant": "申请人",
    "projectNo": "项目号",
    "projectLocation": "项目地点",
    "outboundReason": "出库原因",
    "quantity": "申请数量",
    "approvedQuantity": "审批数量",
    "remark": "备注",
    "status": {
      "pending": "待审批",
      "approved": "已通过",
      "rejected": "已驳回",
      "cancelled": "已撤回"
    },
    "approvalType": {
      "full": "全量通过",
      "partial": "部分通过"
    }
  },
  "user": {
    "username": "用户名",
    "password": "密码",
    "role": "角色",
    "roles": {
      "admin": "管理员",
      "manager": "仓管",
      "operator": "操作员"
    },
    "status": "状态",
    "active": "启用",
    "inactive": "停用",
    "wechatBind": "微信",
    "bound": "已绑定",
    "unbound": "未绑定",
    "lastLogin": "最后登录",
    "createdAt": "创建时间",
    "neverLogin": "从未登录"
  },
  "action": {
    "search": "查询",
    "reset": "重置",
    "export": "导出",
    "submit": "提交",
    "cancel": "取消",
    "confirm": "确定",
    "close": "关闭",
    "create": "新增",
    "edit": "编辑",
    "delete": "删除",
    "detail": "详情",
    "approve": "审批",
    "reject": "驳回",
    "withdraw": "撤回",
    "download": "下载",
    "import": "导入",
    "resetPassword": "重置密码",
    "unbind": "解绑"
  },
  "message": {
    "success": "操作成功",
    "failed": "操作失败",
    "confirmDelete": "确定要删除吗？",
    "confirmWithdraw": "确定要撤回此申请吗？",
    "noData": "暂无数据",
    "loading": "加载中..."
  }
}
```

```json
// en.json
{
  "menu": {
    "dashboard": "Dashboard",
    "trend": "Trend Analysis",
    "age": "Age Analysis",
    "users": "User Management",
    "partTypes": "Part Types",
    "inventory": "Inventory",
    "inbound": "Inbound",
    "request": "Requests",
    "approval": "Approval",
    "logs": "System Logs"
  },
  "inventory": {
    "partNo": "Part No.",
    "partName": "Part Name",
    "serialNumber": "Serial Number",
    "subsidiary": "Subsidiary",
    "warehouse": "Warehouse",
    "condition": "Condition",
    "conditionNew": "New",
    "conditionUsed": "Refurbished",
    "contractNo": "Contract No.",
    "inboundTime": "Inbound Time",
    "inboundOperator": "Inbound Operator",
    "status": {
      "inStock": "In Stock",
      "outOfStock": "Out of Stock"
    }
  },
  "request": {
    "applicant": "Applicant",
    "projectNo": "Project No.",
    "projectLocation": "Project Location",
    "outboundReason": "Outbound Reason",
    "quantity": "Quantity",
    "approvedQuantity": "Approved Qty",
    "remark": "Remark",
    "status": {
      "pending": "Pending",
      "approved": "Approved",
      "rejected": "Rejected",
      "cancelled": "Cancelled"
    },
    "approvalType": {
      "full": "Fully Approved",
      "partial": "Partially Approved"
    }
  },
  "user": {
    "username": "Username",
    "password": "Password",
    "role": "Role",
    "roles": {
      "admin": "Admin",
      "manager": "Manager",
      "operator": "Operator"
    },
    "status": "Status",
    "active": "Active",
    "inactive": "Inactive",
    "wechatBind": "WeChat",
    "bound": "Bound",
    "unbound": "Unbound",
    "lastLogin": "Last Login",
    "createdAt": "Created At",
    "neverLogin": "Never"
  },
  "action": {
    "search": "Search",
    "reset": "Reset",
    "export": "Export",
    "submit": "Submit",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "close": "Close",
    "create": "Create",
    "edit": "Edit",
    "delete": "Delete",
    "detail": "Detail",
    "approve": "Approve",
    "reject": "Reject",
    "withdraw": "Withdraw",
    "download": "Download",
    "import": "Import",
    "resetPassword": "Reset Password",
    "unbind": "Unbind"
  },
  "message": {
    "success": "Operation successful",
    "failed": "Operation failed",
    "confirmDelete": "Are you sure to delete?",
    "confirmWithdraw": "Are you sure to withdraw this request?",
    "noData": "No data",
    "loading": "Loading..."
  }
}
```

繁体中文 (zh-TW.json) 参照 zh-CN.json 做繁简转换即可。

### 1.4 i18n 初始化

```ts
// admin/src/locales/index.ts
import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import en from './en.json'

const savedLang = localStorage.getItem('lang') || 'zh-CN'

const i18n = createI18n({
  legacy: false,          // 使用 Composition API 模式
  locale: savedLang,
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'zh-TW': zhTW, en },
})

export function setLanguage(lang: string) {
  i18n.global.locale.value = lang
  localStorage.setItem('lang', lang)
  document.documentElement.setAttribute('lang', lang)
}

export default i18n
```

```ts
// admin/src/main.ts
import i18n from './locales'

const app = createApp(App)
app.use(i18n)
// ...
```

### 1.5 Element Plus 组件内置文字切换

Element Plus 自身组件（分页器、日期选择器、空状态等）有内置文字，需通过 `ElConfigProvider` 同步切换：

```vue
<!-- AppLayout.vue -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import zhCnLocale from 'element-plus/es/locale/lang/zh-cn'
import zhTwLocale from 'element-plus/es/locale/lang/zh-tw'
import enLocale from 'element-plus/es/locale/lang/en'

const { locale } = useI18n()

const elementLocale = computed(() => {
  const map = { 'zh-CN': zhCnLocale, 'zh-TW': zhTwLocale, en: enLocale }
  return map[locale.value] || zhCnLocale
})
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <!-- 现有布局内容 -->
  </el-config-provider>
</template>
```

### 1.6 页面改造方式

将所有硬编码的中文替换为 `$t()` 调用：

```vue
<!-- 改造前 -->
<el-button type="primary">查询</el-button>
<el-table-column label="备件编号" />
<el-tag>在库</el-tag>

<!-- 改造后 -->
<el-button type="primary">{{ $t('action.search') }}</el-button>
<el-table-column :label="$t('inventory.partNo')" />
<el-tag>{{ $t('inventory.status.inStock') }}</el-tag>
```

在 `<script setup>` 中使用：

```ts
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

ElMessage.success(t('message.success'))
```

### 1.7 语言切换器

在 AppLayout.vue 顶栏添加下拉切换：

```vue
<el-dropdown @command="switchLang">
  <span>{{ langLabel }}</span>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item command="zh-CN">简体中文</el-dropdown-item>
      <el-dropdown-item command="zh-TW">繁體中文</el-dropdown-item>
      <el-dropdown-item command="en">English</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```

---

## 二、微信小程序

### 2.1 技术方案

小程序没有官方 i18n 库，采用**自定义轻量 t() 函数 + 语言包 JS 文件**。

### 2.2 目录结构

```
miniprogram/locales/
├── zh-CN.js
├── zh-TW.js
├── en.js
└── index.js    # t() 函数 + 语言管理
```

### 2.3 实现

```js
// miniprogram/locales/index.js
const zhCN = require('./zh-CN');
const zhTW = require('./zh-TW');
const en   = require('./en');

const langs = { 'zh-CN': zhCN, 'zh-TW': zhTW, 'en': en };
let current = wx.getStorageSync('lang') || 'zh-CN';

function setLang(lang) {
  current = lang;
  wx.setStorageSync('lang', lang);
}

function getLang() {
  return current;
}

function t(key) {
  return key.split('.').reduce((obj, k) => obj?.[k], langs[current]) || key;
}

// 批量生成页面所需的翻译对象，用于 setData
function getPageTexts(keys) {
  const texts = {};
  for (const [name, key] of Object.entries(keys)) {
    texts[name] = t(key);
  }
  return texts;
}

module.exports = { t, setLang, getLang, getPageTexts };
```

### 2.4 页面使用方式

```js
// pages/inventory/inventory.js
const { t, getPageTexts } = require('../../locales/index');

Page({
  data: {
    t: {},  // 界面翻译文字
  },

  onShow() {
    // 将翻译注入 data，供 WXML 使用
    this.setData({
      t: getPageTexts({
        title: 'inventory.title',
        partNo: 'inventory.partNo',
        search: 'action.search',
        inStock: 'inventory.status.inStock',
        // ...
      })
    });
  },
});
```

```xml
<!-- WXML 中使用 -->
<view class="search-bar">
  <input placeholder="{{t.search}}" />
</view>
<view class="label">{{t.partNo}}</view>
```

### 2.5 语言切换

在小程序"我的"页面或设置中添加语言切换入口，切换后调用 `setLang()` 并重新进入页面。

---

## 三、后端 (Express)

### 3.1 需要国际化的内容

后端只需国际化**返回给前端的提示消息**，如：

- `"入库成功"` → `"Inbound successful"`
- `"序列号已存在"` → `"Serial number already exists"`
- `"请填写驳回原因"` → `"Please provide reject reason"`

数据库中用户录入的业务数据（备件名称、项目地点等）**不翻译**，原样返回。

### 3.2 实现方式

```
server/src/locales/
├── zh-CN.js
├── zh-TW.js
├── en.js
└── index.js
```

```js
// server/src/locales/index.js
const zhCN = require('./zh-CN');
const zhTW = require('./zh-TW');
const en   = require('./en');

const langs = { 'zh-CN': zhCN, 'zh-TW': zhTW, 'en': en };

function t(key, lang = 'zh-CN') {
  return key.split('.').reduce((obj, k) => obj?.[k], langs[lang]) || key;
}

module.exports = { t };
```

### 3.3 语言检测中间件

```js
// server/src/middleware/lang.js
function langMiddleware(req, res, next) {
  // 优先读取 query 参数，其次 Accept-Language 头
  const lang = req.query.lang
    || req.headers['accept-language']?.split(',')[0]?.trim()
    || 'zh-CN';

  // 标准化
  const supported = ['zh-CN', 'zh-TW', 'en'];
  req.lang = supported.includes(lang) ? lang : 'zh-CN';

  // 挂载翻译函数
  const { t } = require('../locales');
  req.t = (key) => t(key, req.lang);

  next();
}

module.exports = langMiddleware;
```

### 3.4 Handler 中使用

```js
// 改造前
res.status(409).json({ code: 1, message: '序列号已存在' });

// 改造后
res.status(409).json({ code: 1, message: req.t('inventory.snDuplicate') });
```

---

## 四、工作量评估

| 部分 | 工作内容 | 量级 |
|------|---------|------|
| **语言包编写** | 提取所有 UI 文字，翻译为 3 种语言 | 中等（约 200-300 个 key） |
| **PC 端改造** | ~15 个 .vue 文件中硬编码文字替换为 `$t()` | 中等 |
| **小程序改造** | ~5 个页面 .wxml/.js 中替换为 `t()` | 中等 |
| **后端消息** | handler 中 ~50 条提示文字替换 | 较小 |
| **语言切换 UI** | PC 顶栏 + 小程序设置页添加切换器 | 较小 |
| **Element Plus** | `ElConfigProvider` 切换内置 locale | 较小 |
| **测试验证** | 三种语言切换后页面显示正确性 | 中等 |

---

## 五、实施建议

1. **先做 PC 端**，因为页面多、文字密集，vue-i18n 方案成熟
2. **按模块推进**，每次改造一个页面，提取文字 → 加入语言包 → 替换 → 验证
3. **繁体中文**可用工具从简体自动转换后人工校对，减少工作量
4. **后端消息最后做**，影响面小，且前端可以选择忽略后端消息直接用本地翻译
