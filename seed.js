const { db, hash, makeSalt } = require('./db');

const mk = (name, phone, role, fpo, loc, lat, lng) => {
  const salt = makeSalt();
  db.prepare(`INSERT OR IGNORE INTO users
    (name, phone, password_hash, salt, role, fpo_name, location, lat, lng)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(name, phone, hash('farm123', salt), salt, role, fpo, loc, lat, lng);
};

// All demo accounts use password: farm123
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

console.log('✅ Seeded. Demo logins (password: farm123): farmer 9876500001 · buyer 9000000000');
