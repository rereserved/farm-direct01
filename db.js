const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const db = new DatabaseSync('farmdirect.db');
db.exec('PRAGMA journal_mode = WAL');

db.transaction = fn => (...args) => {
  db.exec('BEGIN');
  try {
    const res = fn(...args);
    db.exec('COMMIT');
    return res;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, salt TEXT NOT NULL,
  role TEXT CHECK(role IN ('farmer','buyer','admin')),
  fpo_name TEXT, location TEXT, lat REAL, lng REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS produce (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL, crop TEXT NOT NULL, grade TEXT,
  quantity_kg REAL, price_per_kg REAL, mandi_price REAL,
  location TEXT, status TEXT DEFAULT 'available',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(farmer_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL, farmer_id INTEGER NOT NULL,
  produce_id INTEGER NOT NULL, crop TEXT, qty_kg REAL, total REAL,
  delivery_type TEXT, status TEXT DEFAULT 'placed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(buyer_id) REFERENCES users(id),
  FOREIGN KEY(farmer_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS cart (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL, produce_id INTEGER NOT NULL, qty_kg REAL,
  UNIQUE(buyer_id, produce_id)
);
CREATE TABLE IF NOT EXISTS sales_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, crop TEXT, month INTEGER, qty_sold REAL
);
`);

// ---- password hashing (no plaintext, no deps) ----
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
module.exports = {
  db,
  hash,
  makeSalt: () => crypto.randomBytes(16).toString('hex'),
};
