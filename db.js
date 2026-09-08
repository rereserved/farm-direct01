const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dbPath = isVercel ? path.join('/tmp', 'farmdirect.db') : path.join(__dirname, 'farmdirect.db');

const db = new DatabaseSync(dbPath);
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
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produce_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  order_id INTEGER,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title TEXT, body TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, produce_id),
  FOREIGN KEY(produce_id) REFERENCES produce(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

// ---- password hashing (no plaintext, no deps) ----
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

// Auto-seed if database has no users (e.g. fresh serverless /tmp environment)
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const mk = (name, phone, role, fpo, loc, lat, lng) => {
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare(`INSERT OR IGNORE INTO users
      (name, phone, password_hash, salt, role, fpo_name, location, lat, lng)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(name, phone, hash('farm123', salt), salt, role, fpo, loc, lat, lng);
  };
  mk('Ramesh Patil', '9876500001', 'farmer', 'Shetkari FPO', 'Nashik, MH', 19.9975, 73.7898);
  mk('Sunita Devi',  '9876500002', 'farmer', null,           'Agra, UP',   27.1767, 78.0081);
  mk('Vijay Kumar',  '9876500003', 'farmer', 'MP Kisan FPO', 'Indore, MP', 22.7196, 75.8577);
  mk('Demo Buyer',   '9000000000', 'buyer',  null,           'Nashik, MH', 19.9975, 73.7898);

  const fid = phone => db.prepare('SELECT id FROM users WHERE phone = ?').get(phone).id;
  const insP = db.prepare(`INSERT INTO produce
    (farmer_id, crop, grade, quantity_kg, price_per_kg, mandi_price, location)
    VALUES (?,?,?,?,?,?,?)`);
  [
    [fid('9876500001'), 'Tomato',  'A', 500,  18, 'Nashik, MH'],
    [fid('9876500001'), 'Onion',   'A', 800,  14, 'Nashik, MH'],
    [fid('9876500002'), 'Potato',  'B', 1200, 12, 'Agra, UP'],
    [fid('9876500003'), 'Wheat',   'A', 2000, 26, 'Indore, MP'],
    [fid('9876500003'), 'Soybean', 'A', 900,  48, 'Indore, MP'],
  ].forEach(p => insP.run(p[0], p[1], p[2], p[3], p[4], p[4] * 1.35, p[5]));

  const history = {
    Tomato:  [320,300,340,380,400,390,420,450,430,460,480,500],
    Onion:   [500,480,510,530,520,560,580,600,590,610,630,650],
    Potato:  [700,680,720,750,730,770,800,820,810,840,860,880],
    Wheat:   [900,880,920,950,930,970,1000,1020,1010,1040,1060,1080],
    Soybean: [200,190,220,240,230,260,280,300,290,310,330,350],
  };
  const insS = db.prepare('INSERT INTO sales_history (crop, month, qty_sold) VALUES (?,?,?)');
  Object.entries(history).forEach(([crop, arr]) => arr.forEach((q, i) => insS.run(crop, i + 1, q)));

  const insR = db.prepare(`INSERT OR IGNORE INTO reviews (produce_id, user_id, rating, title, body) VALUES (?,?,?,?,?)`);
  insR.run(1, fid('9000000000'), 5, 'Super fresh & organic!', 'Received fresh tomatoes directly harvested from Nashik farm. Great packaging and quality.');
  insR.run(2, fid('9000000000'), 4, 'Very good onions', 'Good size and dry skin, saved ₹6/kg vs local market.');
}

module.exports = {
  db,
  hash,
  makeSalt: () => crypto.randomBytes(16).toString('hex'),
};
