const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const config = require('./config');

let db = null;
let client = null;

async function connectDB() {
  if (db) return db;

  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db();
  // Log sanitized connection info (hide credentials if present)
  try {
    const url = new URL(config.mongoUri);
    console.log('MongoDB connected:', `${url.host}${url.pathname}`);
  } catch {
    console.log('MongoDB connected');
  }
  return db;
}

function getDB() {
  if (!db) throw new Error('Database not connected. Call connectDB() first.');
  return db;
}

async function closeDB() {
  if (client) {
    await client.close();
    db = null;
    client = null;
  }
}

/**
 * Initialize collections and indexes.
 * Maps from the SQLite schema in app-v0.3.py init_system().
 */
async function initCollections() {
  const database = getDB();

  // Ensure collections exist
  const existing = await database.listCollections().toArray();
  const existingNames = existing.map(c => c.name);

  const collections = [
    'users', 'part_types', 'inventory', 'requests', 'sys_logs', 'counters', 'dictionaries', 'bind_tokens'
  ];

  for (const name of collections) {
    if (!existingNames.includes(name)) {
      await database.createCollection(name);
      console.log(`  Collection created: ${name}`);
    }
  }

  // --- Indexes ---

  // users: username unique
  await database.collection('users').createIndex(
    { username: 1 }, { unique: true }
  );

  // part_types: part_no unique
  await database.collection('part_types').createIndex(
    { part_no: 1 }, { unique: true }
  );

  // inventory indexes
  const inv = database.collection('inventory');
  await inv.createIndex({ serial_number: 1 }, { unique: true });
  await inv.createIndex({ part_no: 1, status: 1 });
  await inv.createIndex({ subsidiary: 1, status: 1 });
  await inv.createIndex({ inbound_time: -1 });

  // requests indexes
  const req = database.collection('requests');
  await req.createIndex({ status: 1, created_at: -1 });
  await req.createIndex({ applicant: 1 });

  // sys_logs indexes
  const logs = database.collection('sys_logs');
  await logs.createIndex({ category: 1, created_at: -1 });
  await logs.createIndex({ operator: 1 });

  // bind_tokens: TTL auto-cleanup
  await database.collection('bind_tokens').createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 }
  );

  // dictionaries: category + label unique, category index
  const dict = database.collection('dictionaries');
  await dict.createIndex({ category: 1, label: 1 }, { unique: true });
  await dict.createIndex({ category: 1, is_active: 1 });

  // counters: ensure the singleton stats document exists
  const counters = database.collection('counters');
  const statsDoc = await counters.findOne({ _id: 'stats' });
  if (!statsDoc) {
    await counters.insertOne({
      _id: 'stats',
      total_in_stock: 0,
      total_out_of_stock: 0,
      pending_requests: 0,
      month_inbound: 0,
      month_outbound: 0,
      last_month_inbound: 0,
      last_month_outbound: 0,
      updated_at: new Date(),
    });
    console.log('  Counters stats document initialized');
  }

  // --- Default admin user ---
  const users = database.collection('users');
  const adminExists = await users.findOne({ username: 'admin' });
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 10);
    await users.insertOne({
      username: 'admin',
      password: hash,
      roles: ['admin'],
      is_active: true,
      token_version: 2,
      created_at: new Date(),
      last_login: null,
    });
    console.log('  Default admin user created (admin / admin123)');
  }

  // Migrate: add token_version to existing users that don't have it
  const migratedCount = await database.collection('users').updateMany(
    { token_version: { $exists: false } },
    { $set: { token_version: 1 } }
  );
  if (migratedCount.modifiedCount > 0) {
    console.log(`  Migrated ${migratedCount.modifiedCount} users: added token_version`);
  }

  // One-time: force invalidate all existing JWTs by bumping token_version to 2
  // This ensures tokens issued with tv=1 (from previous deployment) are also rejected.
  // Safe to run repeatedly: only affects users still at version 1.
  const bumpResult = await database.collection('users').updateMany(
    { token_version: 1 },
    { $set: { token_version: 2 } }
  );
  if (bumpResult.modifiedCount > 0) {
    console.log(`  Force-invalidated sessions for ${bumpResult.modifiedCount} users (token_version 1→2)`);
  }

  console.log('Collections and indexes initialized');
}

/**
 * 数据迁移: 为已审批但缺少 approved_items 的申请补全审批明细
 * 通过交叉查询 inventory 表的实际状态来还原每项的审批数量
 */
async function migrateApprovedRequests() {
  const database = getDB();
  const requests = database.collection('requests');
  const inventory = database.collection('inventory');

  // 查找所有已审批但没有 approved_items 的申请
  const pendingMigration = await requests.find({
    status: 'approved',
    approved_items: { $exists: false },
  }).toArray();

  if (pendingMigration.length === 0) return;

  console.log(`  Migrating ${pendingMigration.length} approved requests (backfill approved_items)...`);

  for (const req of pendingMigration) {
    try {
      // 收集该申请所有预留的序列号
      const allSNs = req.items.flatMap(i => i.serial_numbers || []);
      if (allSNs.length === 0) continue;

      // 查询这些序列号在 inventory 中的实际状态
      const invRecords = await inventory.find(
        { serial_number: { $in: allSNs } }
      ).toArray();
      const statusMap = new Map(invRecords.map(r => [r.serial_number, r.status]));

      // 根据 inventory 实际状态还原每项的审批明细
      const approvedItems = req.items.map(item => {
        const sns = item.serial_numbers || [];
        const approvedSNs = sns.filter(sn => statusMap.get(sn) === 1);
        return {
          part_no: item.part_no,
          part_name: item.part_name,
          value_type: item.value_type || '高价值',
          quantity: item.quantity,
          serial_numbers: sns,
          approved_quantity: approvedSNs.length,
          approved_serial_numbers: approvedSNs,
        };
      });

      const isPartial = approvedItems.some(i => i.approved_quantity < i.quantity);

      await requests.updateOne(
        { _id: req._id },
        {
          $set: {
            approved_items: approvedItems,
            approval_type: isPartial ? 'partial' : 'full',
          },
        }
      );
    } catch (err) {
      console.warn(`  Migration failed for request ${req._id}:`, err.message);
    }
  }

  console.log(`  Migration complete: ${pendingMigration.length} requests updated`);
}

module.exports = { connectDB, getDB, closeDB, initCollections, migrateApprovedRequests };
