/**
 * 云数据库索引创建脚本
 *
 * 微信云数据库不支持通过 API 创建索引，必须通过以下方式之一：
 *   1. 微信云开发控制台 → 数据库 → 选集合 → 索引管理 → 手动添加
 *   2. 使用 tcb CLI 工具: npx @cloudbase/cli
 *
 * 本脚本为操作指引文档 + tcb CLI 可用的 JSON 配置，
 * 供验证人员逐项核对索引是否已正确创建。
 *
 * 参照 DEVELOPMENT_PLAN.md 第四节 数据库设计
 */

// ═══════════════════════════════════════════════════════════
//  索引清单（共 10 个索引，覆盖 5 个集合）
// ═══════════════════════════════════════════════════════════

const INDEX_DEFINITIONS = [
  // ── 1. users ──────────────────────────────────────────
  {
    collection: 'users',
    indexes: [
      {
        name: 'username_unique',
        fields: [{ name: 'username', direction: 'asc' }],
        unique: true,
        description: '用户名唯一索引 — 登录查找 & 防止重复用户名',
      },
    ],
  },

  // ── 2. part_types ─────────────────────────────────────
  {
    collection: 'part_types',
    indexes: [
      {
        name: 'part_no_unique',
        fields: [{ name: 'part_no', direction: 'asc' }],
        unique: true,
        description: '备件编号唯一索引 — 备件查找 & 防止重复编号',
      },
    ],
  },

  // ── 3. inventory ──────────────────────────────────────
  {
    collection: 'inventory',
    indexes: [
      {
        name: 'serial_number_unique',
        fields: [{ name: 'serial_number', direction: 'asc' }],
        unique: true,
        description: '序列号唯一索引 — 扫码查询 & 防止重复序列号',
      },
      {
        name: 'part_no_status',
        fields: [
          { name: 'part_no', direction: 'asc' },
          { name: 'status', direction: 'asc' },
        ],
        unique: false,
        description: '复合索引 — 按备件类型 + 状态筛选库存',
      },
      {
        name: 'subsidiary_status',
        fields: [
          { name: 'subsidiary', direction: 'asc' },
          { name: 'status', direction: 'asc' },
        ],
        unique: false,
        description: '复合索引 — 按子公司 + 状态筛选库存',
      },
      {
        name: 'inbound_time',
        fields: [{ name: 'inbound_time', direction: 'desc' }],
        unique: false,
        description: '入库时间索引 — 按时间排序 / 范围查询',
      },
    ],
  },

  // ── 4. requests ───────────────────────────────────────
  {
    collection: 'requests',
    indexes: [
      {
        name: 'status_created_at',
        fields: [
          { name: 'status', direction: 'asc' },
          { name: 'created_at', direction: 'desc' },
        ],
        unique: false,
        description: '复合索引 — 待审批列表按创建时间倒序',
      },
      {
        name: 'applicant',
        fields: [{ name: 'applicant', direction: 'asc' }],
        unique: false,
        description: '申请人索引 — 查询"我的申请"',
      },
    ],
  },

  // ── 5. sys_logs ───────────────────────────────────────
  {
    collection: 'sys_logs',
    indexes: [
      {
        name: 'category_created_at',
        fields: [
          { name: 'category', direction: 'asc' },
          { name: 'created_at', direction: 'desc' },
        ],
        unique: false,
        description: '复合索引 — 日志按类型 + 时间筛选',
      },
      {
        name: 'operator',
        fields: [{ name: 'operator', direction: 'asc' }],
        unique: false,
        description: '操作员索引 — 按操作员筛选日志',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════
//  打印验证清单
// ═══════════════════════════════════════════════════════════

function printChecklist() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     微信云数据库 — 索引创建验证清单                    ║');
  console.log('║     参照: DEVELOPMENT_PLAN.md 第四节                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  let total = 0;

  for (const col of INDEX_DEFINITIONS) {
    console.log(`┌─ 集合: ${col.collection}`);
    console.log('│');

    for (const idx of col.indexes) {
      total++;
      const fieldsStr = idx.fields
        .map(f => `${f.name}: ${f.direction === 'asc' ? '1 (升序)' : '-1 (降序)'}`)
        .join(', ');
      const uniqueStr = idx.unique ? ' [唯一]' : '';

      console.log(`│  [ ] 索引 ${total}: ${idx.name}${uniqueStr}`);
      console.log(`│      字段: { ${fieldsStr} }`);
      console.log(`│      用途: ${idx.description}`);
      console.log('│');
    }

    console.log('└──────────────────────────────────────');
    console.log('');
  }

  console.log(`共 ${total} 个索引需要创建/验证`);
  console.log('');
  console.log('操作步骤:');
  console.log('  1. 打开微信开发者工具 → 云开发控制台 → 数据库');
  console.log('  2. 逐个点击集合名称 → 索引管理 → 添加索引');
  console.log('  3. 按上述清单填写字段名、排序方向、是否唯一');
  console.log('  4. 创建完成后，对照清单勾选确认');
  console.log('');
  console.log('注意:');
  console.log('  - 唯一索引创建前确保集合中无重复数据，否则会失败');
  console.log('  - 云数据库默认已有 _id 索引，无需手动创建');
  console.log('  - 复合索引的字段顺序很重要，请严格按照上面的顺序');
}

// ═══════════════════════════════════════════════════════════
//  导出 tcb CLI 格式的 JSON（可选，供自动化使用）
// ═══════════════════════════════════════════════════════════

function exportTcbConfig() {
  const config = {};

  for (const col of INDEX_DEFINITIONS) {
    config[col.collection] = {
      indexes: col.indexes.map(idx => ({
        name: idx.name,
        unique: idx.unique,
        keys: idx.fields.reduce((acc, f) => {
          acc[f.name] = f.direction === 'asc' ? 1 : -1;
          return acc;
        }, {}),
      })),
    };
  }

  return config;
}

// ═══════════════════════════════════════════════════════════
//  主执行
// ═══════════════════════════════════════════════════════════

if (require.main === module) {
  const arg = process.argv[2];

  if (arg === '--json') {
    // 输出 JSON 格式，可供 tcb CLI 或其他工具消费
    console.log(JSON.stringify(exportTcbConfig(), null, 2));
  } else {
    // 默认打印可读清单
    printChecklist();
  }
}

module.exports = { INDEX_DEFINITIONS, exportTcbConfig };
