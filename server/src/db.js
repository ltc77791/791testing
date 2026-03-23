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
  console.log('MongoDB connected:', config.mongoUri);
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
    'users', 'part_types', 'inventory', 'requests', 'sys_logs', 'counters', 'dictionaries'
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
      created_at: new Date(),
      last_login: null,
    });
    console.log('  Default admin user created (admin / admin123)');
  }

  console.log('Collections and indexes initialized');
}

module.exports = { connectDB, getDB, closeDB, initCollections };
