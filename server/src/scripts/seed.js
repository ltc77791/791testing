#!/usr/bin/env node

/**
 * 演示数据生成脚本
 * 用法: npm run seed          (加载演示数据)
 *       npm run seed -- --drop (清空后重新加载)
 *
 * 生成内容:
 *   - 4 个操作员用户 (密码 123456)
 *   - 5 种备件类型
 *   - ~80-100 条库存记录 (分布在 3 个子公司 5 个仓库)
 *   - ~30 条已审批出库记录
 *   - 3 条待审批申请
 *   - 2 条已驳回申请
 *   - 对应的系统日志
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const config = require('../config');

// ============ 基础数据 ============

const PART_TYPES = [
  { part_no: 'PWR-MOD-500',  part_name: '500W电源模块',    min_stock: 10 },
  { part_no: 'SFP-10G-SR',   part_name: '10G光模块',       min_stock: 15 },
  { part_no: 'FAN-MOD-4HS',  part_name: '高速风扇模块',    min_stock: 8  },
  { part_no: 'HDD-SAS-1T',   part_name: '1TB SAS硬盘',     min_stock: 5  },
  { part_no: 'MEM-DDR4-32G', part_name: '32GB DDR4内存条',  min_stock: 12 },
];

const OPERATORS = ['张伟', '李娜', '王强', '刘洋'];

const SUBSIDIARIES = ['华东子公司', '华南子公司', '华北子公司'];

const WAREHOUSE_MAP = {
  '华东子公司': ['上海主仓', '南京分仓'],
  '华南子公司': ['深圳主仓', '广州分仓'],
  '华北子公司': ['北京主仓'],
};

const CONDITIONS = ['全新', '利旧/返还'];

const PROJECTS = [
  '张江IDC扩容',
  '南山5G基站',
  '亦庄新机房',
  '虹桥网络改造',
  '科技园设备更换',
];

// ============ 工具函数 ============

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function daysAgo(days, randomHour = true) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (randomHour) {
    d.setHours(rand(8, 18), rand(0, 59), rand(0, 59), 0);
  }
  return d;
}

// ============ 主逻辑 ============

async function seed() {
  const dropFirst = process.argv.includes('--drop');

  console.log('🔌 Connecting to MongoDB:', config.mongoUri);
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db();

  if (dropFirst) {
    console.log('🗑️  Dropping existing data...');
    await Promise.all([
      db.collection('users').deleteMany({}),
      db.collection('part_types').deleteMany({}),
      db.collection('inventory').deleteMany({}),
      db.collection('requests').deleteMany({}),
      db.collection('sys_logs').deleteMany({}),
      db.collection('counters').deleteMany({}),
    ]);
    console.log('   All collections cleared.');
  } else {
    // Check if data already exists
    const invCount = await db.collection('inventory').countDocuments();
    if (invCount > 0) {
      console.log(`⚠️  Database already has ${invCount} inventory records.`);
      console.log('   Use --drop flag to clear and re-seed: npm run seed -- --drop');
      await client.close();
      return;
    }
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash('123456', 10);
  const adminHash = await bcrypt.hash('admin123', 10);

  // -------- 1. Users --------
  console.log('\n👤 Creating users...');

  const users = [
    {
      username: 'admin',
      password: adminHash,
      roles: ['admin'],
      is_active: true,
      created_at: daysAgo(365),
      last_login: daysAgo(0),
    },
    {
      username: '仓管张',
      password: passwordHash,
      roles: ['manager'],
      is_active: true,
      created_at: daysAgo(300),
      last_login: daysAgo(1),
    },
    ...OPERATORS.map(name => ({
      username: name,
      password: passwordHash,
      roles: ['operator'],
      is_active: true,
      created_at: daysAgo(rand(100, 280)),
      last_login: daysAgo(rand(0, 14)),
    })),
  ];

  for (const user of users) {
    await db.collection('users').updateOne(
      { username: user.username },
      { $setOnInsert: user },
      { upsert: true }
    );
  }
  console.log(`   ${users.length} users ready (admin/admin123, others/123456)`);

  // -------- 2. Part Types --------
  console.log('\n📦 Creating part types...');

  for (const pt of PART_TYPES) {
    await db.collection('part_types').updateOne(
      { part_no: pt.part_no },
      {
        $setOnInsert: {
          ...pt,
          current_stock: 0,
          total_outbound: 0,
          updated_at: now,
        },
      },
      { upsert: true }
    );
  }
  console.log(`   ${PART_TYPES.length} part types created`);

  // -------- 3. Inventory (Inbound) --------
  console.log('\n📥 Generating inventory records...');

  let snCounter = 1000;
  const allInventory = []; // { doc, part_no, serial_number }

  for (const pt of PART_TYPES) {
    const count = rand(14, 24);
    for (let i = 0; i < count; i++) {
      const sn = `SN${String(snCounter++).padStart(6, '0')}`;
      const sub = pick(SUBSIDIARIES);
      const wh = pick(WAREHOUSE_MAP[sub]);
      const cond = weightedPick(CONDITIONS, [70, 30]);
      const inboundDays = rand(1, 240);

      const doc = {
        part_no: pt.part_no,
        part_name: pt.part_name,
        serial_number: sn,
        subsidiary: sub,
        warehouse: wh,
        condition: cond,
        status: 0, // in stock
        inbound_time: daysAgo(inboundDays),
        inbound_operator: pick(['admin', '仓管张']),
        outbound_time: null,
        receiver: null,
        approver: null,
        project_location: null,
        reserved_request_id: '',
      };

      allInventory.push({ doc, part_no: pt.part_no, sn });
    }
  }

  await db.collection('inventory').insertMany(allInventory.map(r => r.doc));
  console.log(`   ${allInventory.length} items created`);

  // -------- 4. Approved Requests (Outbound) --------
  console.log('\n✅ Generating approved outbound requests...');

  // Shuffle and pick some items to mark as outbound
  const shuffled = [...allInventory].sort(() => Math.random() - 0.5);
  const outboundCount = Math.min(30, Math.floor(allInventory.length / 3));

  // Group outbound items into batches of 1-3 to make multi-item requests
  let outIdx = 0;
  let approvedRequests = 0;
  let outboundItems = 0;

  while (outIdx < outboundCount) {
    const batchSize = Math.min(rand(1, 3), outboundCount - outIdx);
    const batch = shuffled.slice(outIdx, outIdx + batchSize);
    outIdx += batchSize;

    const applicant = pick(OPERATORS);
    const project = pick(PROJECTS);
    const reqDays = rand(5, 150);
    const apprDays = Math.max(0, reqDays - rand(1, 3));

    // Build request items grouped by part_no
    const itemMap = {};
    for (const inv of batch) {
      if (!itemMap[inv.part_no]) {
        const pt = PART_TYPES.find(p => p.part_no === inv.part_no);
        itemMap[inv.part_no] = {
          part_no: inv.part_no,
          part_name: pt.part_name,
          quantity: 0,
          serial_numbers: [],
        };
      }
      itemMap[inv.part_no].quantity++;
      itemMap[inv.part_no].serial_numbers.push(inv.sn);
    }

    const requestDoc = {
      applicant,
      status: 'approved',
      items: Object.values(itemMap),
      project_location: project,
      remark: '',
      created_at: daysAgo(reqDays),
      updated_at: daysAgo(apprDays),
      approved_by: pick(['admin', '仓管张']),
      approved_at: daysAgo(apprDays),
      reject_reason: null,
    };

    const result = await db.collection('requests').insertOne(requestDoc);

    // Mark inventory as outbound
    for (const inv of batch) {
      await db.collection('inventory').updateOne(
        { serial_number: inv.sn },
        {
          $set: {
            status: 1,
            outbound_time: daysAgo(apprDays),
            receiver: applicant,
            approver: requestDoc.approved_by,
            project_location: project,
            reserved_request_id: result.insertedId.toString(),
          },
        }
      );
    }

    approvedRequests++;
    outboundItems += batchSize;
  }
  console.log(`   ${approvedRequests} approved requests, ${outboundItems} items outbound`);

  // -------- 5. Pending Requests --------
  console.log('\n⏳ Generating pending requests...');

  // Find items still in stock and not reserved
  const availableItems = shuffled.slice(outIdx);
  let pendingIdx = 0;

  for (let i = 0; i < 3 && pendingIdx < availableItems.length; i++) {
    const qty = rand(1, 2);
    const batch = availableItems.slice(pendingIdx, pendingIdx + qty);
    if (batch.length === 0) break;
    pendingIdx += batch.length;

    const partNo = batch[0].part_no;
    const pt = PART_TYPES.find(p => p.part_no === partNo);

    const requestDoc = {
      applicant: pick(OPERATORS),
      status: 'pending',
      items: [{
        part_no: partNo,
        part_name: pt.part_name,
        quantity: batch.length,
        serial_numbers: batch.map(b => b.sn),
      }],
      project_location: pick(PROJECTS),
      remark: '',
      created_at: daysAgo(rand(0, 3)),
      updated_at: daysAgo(0),
      approved_by: null,
      approved_at: null,
      reject_reason: null,
    };

    const result = await db.collection('requests').insertOne(requestDoc);

    // Reserve the inventory
    for (const inv of batch) {
      await db.collection('inventory').updateOne(
        { serial_number: inv.sn },
        { $set: { reserved_request_id: result.insertedId.toString() } }
      );
    }
  }
  console.log('   3 pending requests created');

  // -------- 6. Rejected Requests --------
  console.log('\n❌ Generating rejected requests...');

  for (let i = 0; i < 2; i++) {
    const pt = pick(PART_TYPES);
    const reqDays = rand(10, 60);

    await db.collection('requests').insertOne({
      applicant: pick(OPERATORS),
      status: 'rejected',
      items: [{
        part_no: pt.part_no,
        part_name: pt.part_name,
        quantity: rand(1, 2),
        serial_numbers: [], // rejected, no SNs assigned
      }],
      project_location: pick(PROJECTS),
      remark: '',
      created_at: daysAgo(reqDays),
      updated_at: daysAgo(reqDays - 1),
      approved_by: 'admin',
      approved_at: daysAgo(reqDays - 1),
      reject_reason: '库存不足，等待采购',
    });
  }
  console.log('   2 rejected requests created');

  // -------- 7. Update Part Types Stock Counts --------
  console.log('\n📊 Updating stock counts...');

  for (const pt of PART_TYPES) {
    const inStock = await db.collection('inventory').countDocuments({
      part_no: pt.part_no,
      status: 0,
    });
    const totalOut = await db.collection('inventory').countDocuments({
      part_no: pt.part_no,
      status: 1,
    });

    await db.collection('part_types').updateOne(
      { part_no: pt.part_no },
      { $set: { current_stock: inStock, total_outbound: totalOut } }
    );

    console.log(`   ${pt.part_no}: 在库 ${inStock}, 已出库 ${totalOut}`);
  }

  // -------- 8. Update Counters --------
  console.log('\n🔢 Updating counters...');

  const totalInStock = await db.collection('inventory').countDocuments({ status: 0 });
  const totalOutOfStock = await db.collection('inventory').countDocuments({ status: 1 });
  const pendingRequests = await db.collection('requests').countDocuments({ status: 'pending' });

  // Current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthInbound = await db.collection('inventory').countDocuments({
    inbound_time: { $gte: monthStart },
  });
  const monthOutbound = await db.collection('inventory').countDocuments({
    status: 1,
    outbound_time: { $gte: monthStart },
  });

  // Last month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthInbound = await db.collection('inventory').countDocuments({
    inbound_time: { $gte: lastMonthStart, $lt: monthStart },
  });
  const lastMonthOutbound = await db.collection('inventory').countDocuments({
    status: 1,
    outbound_time: { $gte: lastMonthStart, $lt: monthStart },
  });

  await db.collection('counters').updateOne(
    { _id: 'stats' },
    {
      $set: {
        total_in_stock: totalInStock,
        total_out_of_stock: totalOutOfStock,
        pending_requests: pendingRequests,
        month_inbound: monthInbound,
        month_outbound: monthOutbound,
        last_month_inbound: lastMonthInbound,
        last_month_outbound: lastMonthOutbound,
        updated_at: now,
      },
    },
    { upsert: true }
  );

  console.log(`   在库: ${totalInStock}, 已出库: ${totalOutOfStock}, 待审批: ${pendingRequests}`);
  console.log(`   本月入库: ${monthInbound}, 本月出库: ${monthOutbound}`);

  // -------- 9. System Logs --------
  console.log('\n📋 Generating system logs...');

  const logs = [];

  // Part type creation logs
  for (const pt of PART_TYPES) {
    logs.push({
      category: 'PartType',
      action_type: '新增备件类型',
      operator: 'admin',
      details: `新增备件类型: ${pt.part_no} - ${pt.part_name}, 安全库存: ${pt.min_stock}`,
      created_at: daysAgo(rand(250, 350)),
    });
  }

  // User creation logs
  for (const op of OPERATORS) {
    logs.push({
      category: 'UserMgmt',
      action_type: '新增用户',
      operator: 'admin',
      details: `新增用户: ${op}, 角色: operator`,
      created_at: daysAgo(rand(200, 300)),
    });
  }

  logs.push({
    category: 'UserMgmt',
    action_type: '新增用户',
    operator: 'admin',
    details: '新增用户: 仓管张, 角色: manager',
    created_at: daysAgo(300),
  });

  // Some inbound logs
  for (let i = 0; i < 20; i++) {
    const inv = pick(allInventory);
    const pt = PART_TYPES.find(p => p.part_no === inv.part_no);
    logs.push({
      category: 'Inbound',
      action_type: '单件入库',
      operator: pick(['admin', '仓管张']),
      details: `入库: ${inv.part_no} / ${inv.sn}, ${pick(SUBSIDIARIES)}-${pick(WAREHOUSE_MAP[pick(SUBSIDIARIES)])}`,
      created_at: daysAgo(rand(1, 200)),
    });
  }

  // Some request logs
  for (let i = 0; i < 10; i++) {
    const op = pick(OPERATORS);
    const pt = pick(PART_TYPES);
    logs.push({
      category: 'Request',
      action_type: pick(['提交申请', '审批通过', '驳回申请']),
      operator: pick(['admin', '仓管张', op]),
      details: `${pt.part_no} - ${pt.part_name}, 项目: ${pick(PROJECTS)}`,
      created_at: daysAgo(rand(1, 150)),
    });
  }

  // Sort by created_at
  logs.sort((a, b) => a.created_at - b.created_at);

  await db.collection('sys_logs').insertMany(logs);
  console.log(`   ${logs.length} log entries created`);

  // -------- Done --------
  console.log('\n✨ Seed completed successfully!');
  console.log('────────────────────────────────');
  console.log(`   Users:      ${users.length} (admin/admin123, 仓管张/123456, 4 operators/123456)`);
  console.log(`   Part Types: ${PART_TYPES.length}`);
  console.log(`   Inventory:  ${allInventory.length} total (${totalInStock} in stock, ${totalOutOfStock} outbound)`);
  console.log(`   Requests:   ${approvedRequests} approved + 3 pending + 2 rejected`);
  console.log(`   Logs:       ${logs.length} entries`);
  console.log('────────────────────────────────');

  await client.close();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
