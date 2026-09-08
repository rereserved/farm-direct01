const express = require('express');
const crypto = require('crypto');
const { db, hash, makeSalt } = require('./db');
const { forecastAll } = require('./ai/forecast');
const { optimizeRoute } = require('./ai/routes');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ---------- session middleware ----------
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const session = db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?'
  ).get(token);
  if (!session) return res.status(401).json({ error: 'Session expired, login again' });
  req.user = session;
  next();
}
const requireRole = role => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: `Requires ${role} account` });

const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role,
                           fpo_name: u.fpo_name, location: u.location, lat: u.lat, lng: u.lng });

// ---------- AUTH ----------
app.post('/api/register', (req, res) => {
  const { name, phone, password, role, fpo_name, location, lat, lng } = req.body;
  if (!name || !phone || !password || !role) return res.status(400).json({ error: 'All fields required' });
  if (!['farmer', 'buyer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone))
    return res.status(409).json({ error: 'Phone already registered — please login' });

  const salt = makeSalt();
  const info = db.prepare(`
    INSERT INTO users (name, phone, password_hash, salt, role, fpo_name, location, lat, lng)
    VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(name, phone, hash(password, salt), salt, role, fpo_name || null, location || null, lat || null, lng || null);

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)').run(token, info.lastInsertRowid);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || user.password_hash !== hash(password, user.salt))
    return res.status(401).json({ error: 'Wrong phone or password' });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)').run(token, user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?')
    .run(req.headers.authorization.replace('Bearer ', ''));
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- MARKETPLACE (public, with search/sort/filter/categories/ratings) ----------
app.get('/api/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT p.crop FROM produce p
    WHERE p.status = 'available' AND p.quantity_kg > 0`).all();
  const cats = {};
  rows.forEach(r => { (cropCatSafe(r.crop)).forEach(c => cats[c] = 1); });
  res.json(Object.keys(cats));
});

function cropCatSafe(c) {
  const m = { Tomato:['Vegetables'],Onion:['Vegetables'],Potato:['Vegetables'],Carrot:['Vegetables'],
              Spinach:['Vegetables'],Wheat:['Grains'],Rice:['Grains'],Soybean:['Oilseeds'],
              Mango:['Fruits'],Banana:['Fruits'] };
  return m[c] || ['Other'];
}

app.get('/api/produce', (req, res) => {
  const { q, crop, sort, cat } = req.query;
  let sql = `
    SELECT p.*, u.name AS farmer_name, u.fpo_name, u.location AS farmer_location
    FROM produce p JOIN users u ON p.farmer_id = u.id
    WHERE p.status = 'available' AND p.quantity_kg > 0`;
  const params = [];
  if (q)    { sql += ' AND (p.crop LIKE ? OR u.name LIKE ? OR u.location LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (crop) { sql += ' AND p.crop = ?'; params.push(crop); }
  if (cat)  {
    const allCrops = ['Tomato','Onion','Potato','Carrot','Spinach','Wheat','Rice','Soybean','Mango','Banana'];
    const matching = allCrops.filter(c => cropCatSafe(c).includes(cat));
    if (matching.length > 0) {
      sql += ` AND p.crop IN (${matching.map(() => '?').join(',')})`;
      params.push(...matching);
    } else {
      sql += ` AND 1 = 0`;
    }
  }
  sql += sort === 'price_asc' ? ' ORDER BY p.price_per_kg ASC'
       : sort === 'price_desc' ? ' ORDER BY p.price_per_kg DESC'
       : sort === 'rating' ? ''
       : ' ORDER BY p.created_at DESC';
  let rows = db.prepare(sql).all(...params).map(p => ({ ...p, rating: ratingFor(p.id) }));
  if (sort === 'rating') rows.sort((a, b) => b.rating.avg - a.rating.avg);
  res.json(rows);
});

// ---------- PRODUCE (farmer) ----------
app.post('/api/produce', auth, requireRole('farmer'), (req, res) => {
  const { crop, grade, quantity_kg, price_per_kg } = req.body;
  if (!crop || !quantity_kg || !price_per_kg) return res.status(400).json({ error: 'Crop, qty and price required' });
  const prev = db.prepare('SELECT mandi_price FROM produce WHERE crop = ? AND mandi_price IS NOT NULL ORDER BY id DESC LIMIT 1').get(crop);
  const mandiPrice = prev ? prev.mandi_price : price_per_kg * 1.35;
  const info = db.prepare(`
    INSERT INTO produce (farmer_id, crop, grade, quantity_kg, price_per_kg, mandi_price, location)
    VALUES (?,?,?,?,?,?,?)`
  ).run(req.user.id, crop, grade || 'A', quantity_kg, price_per_kg, mandiPrice, req.user.location);
  res.json({ id: info.lastInsertRowid, ok: true });
});

app.delete('/api/produce/:id', auth, requireRole('farmer'), (req, res) => {
  const p = db.prepare('SELECT * FROM produce WHERE id = ?').get(req.params.id);
  if (!p || p.farmer_id !== req.user.id) return res.status(404).json({ error: 'Not your listing' });
  db.prepare("UPDATE produce SET status = 'delisted' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/my-produce', auth, requireRole('farmer'), (req, res) =>
  res.json(db.prepare("SELECT * FROM produce WHERE farmer_id = ? AND status != 'delisted' ORDER BY created_at DESC").all(req.user.id)));

// ---------- CART ----------
app.get('/api/cart', auth, requireRole('buyer'), (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.qty_kg, p.id AS produce_id, p.crop, p.grade, p.price_per_kg,
           p.mandi_price, p.quantity_kg AS stock, u.name AS farmer_name, u.location
    FROM cart c JOIN produce p ON c.produce_id = p.id
    JOIN users u ON p.farmer_id = u.id
    WHERE c.buyer_id = ?`).all(req.user.id);
  const total = rows.reduce((s, r) => s + r.qty_kg * r.price_per_kg, 0);
  const savings = rows.reduce((s, r) => s + r.qty_kg * (r.mandi_price - r.price_per_kg), 0);
  res.json({ items: rows, total: +total.toFixed(2), savings: +savings.toFixed(2) });
});

app.post('/api/cart', auth, requireRole('buyer'), (req, res) => {
  const { produce_id, qty_kg } = req.body;
  const p = db.prepare('SELECT * FROM produce WHERE id = ? AND status = ?').get(produce_id, 'available');
  if (!p) return res.status(404).json({ error: 'Produce not available' });
  if (qty_kg > p.quantity_kg) return res.status(400).json({ error: `Only ${p.quantity_kg} kg in stock` });
  db.prepare(`
    INSERT INTO cart (buyer_id, produce_id, qty_kg) VALUES (?,?,?)
    ON CONFLICT(buyer_id, produce_id) DO UPDATE SET qty_kg = excluded.qty_kg`
  ).run(req.user.id, produce_id, qty_kg);
  res.json({ ok: true });
});

app.delete('/api/cart/:produce_id', auth, requireRole('buyer'), (req, res) => {
  db.prepare('DELETE FROM cart WHERE buyer_id = ? AND produce_id = ?').run(req.user.id, req.params.produce_id);
  res.json({ ok: true });
});

// ---------- CHECKOUT ----------
app.post('/api/checkout', auth, requireRole('buyer'), (req, res) => {
  const items = db.prepare(`
    SELECT c.qty_kg, p.* FROM cart c JOIN produce p ON c.produce_id = p.id WHERE c.buyer_id = ?`
  ).all(req.user.id);
  if (!items.length) return res.status(400).json({ error: 'Cart is empty' });

  const checkout = db.transaction(() => {
    const orderIds = [];
    for (const item of items) {
      if (item.quantity_kg < item.qty_kg) throw new Error(`Only ${item.quantity_kg} kg of ${item.crop} left`);
      const info = db.prepare(`
        INSERT INTO orders (buyer_id, farmer_id, produce_id, crop, qty_kg, total, delivery_type)
        VALUES (?,?,?,?,?,?,?)`
      ).run(req.user.id, item.farmer_id, item.id, item.crop, item.qty_kg,
            item.qty_kg * item.price_per_kg, req.body.delivery_type || 'consumer');
      db.prepare('UPDATE produce SET quantity_kg = quantity_kg - ? WHERE id = ?').run(item.qty_kg, item.id);
      db.prepare("UPDATE produce SET status = 'sold_out' WHERE id = ? AND quantity_kg <= 0").run(item.id);
      orderIds.push(info.lastInsertRowid);
    }
    db.prepare('DELETE FROM cart WHERE buyer_id = ?').run(req.user.id);
    return orderIds;
  });

  try {
    const ids = checkout();
    res.json({ ok: true, order_ids: ids, message: `✅ ${ids.length} order(s) placed — payment goes directly to farmers` });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- ORDERS ----------
app.get('/api/orders/buyer', auth, requireRole('buyer'), (req, res) => {
  res.json(db.prepare(`
    SELECT o.*, u.name AS farmer_name, u.location AS farmer_location
    FROM orders o JOIN users u ON o.farmer_id = u.id
    WHERE o.buyer_id = ? ORDER BY o.created_at DESC`).all(req.user.id));
});

app.get('/api/orders/farmer', auth, requireRole('farmer'), (req, res) => {
  res.json(db.prepare(`
    SELECT o.*, u.name AS buyer_name, u.phone AS buyer_phone, u.location AS buyer_location
    FROM orders o JOIN users u ON o.buyer_id = u.id
    WHERE o.farmer_id = ? ORDER BY o.created_at DESC`).all(req.user.id));
});

app.patch('/api/orders/:id/status', auth, requireRole('farmer'), (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected', 'in_transit', 'delivered'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o || o.farmer_id !== req.user.id) return res.status(404).json({ error: 'Not your order' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (status === 'rejected') // restore stock
    db.prepare('UPDATE produce SET quantity_kg = quantity_kg + ? WHERE id = ?').run(o.qty_kg, o.produce_id);
  res.json({ ok: true, status });
});

// ---------- AI ----------
app.get('/api/ai/forecast', (req, res) => res.json(forecastAll()));

app.post('/api/ai/route', (req, res) => {
  const { depot, stops } = req.body;
  if (!depot || !Array.isArray(stops)) return res.status(400).json({ error: 'Send {depot:{lat,lng}, stops:[{id,lat,lng}]}' });
  res.json(optimizeRoute(depot, stops));
});

// ---------- IMPACT ----------
app.get('/api/impact', (req, res) => {
  res.json(db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role='farmer') AS farmers,
      (SELECT COUNT(*) FROM orders) AS orders,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status != 'rejected') AS farmer_earnings,
      (SELECT COALESCE(SUM(qty_kg*(p.mandi_price-p.price_per_kg)),0)
        FROM orders o JOIN produce p ON o.produce_id=p.id WHERE o.status != 'rejected') AS consumer_savings
  `).get());
});

// ---------- REVIEWS & RATINGS ----------
// Rating summary for a produce
function ratingFor(produceId) {
  const r = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg FROM reviews WHERE produce_id = ?
  `).get(produceId);
  return { count: r.count, avg: Math.round(r.avg * 10) / 10 };
}

// Farmer (seller) rating = avg of all reviews on their produce
function sellerRating(farmerId) {
  const r = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg
    FROM reviews rv JOIN produce p ON rv.produce_id = p.id
    WHERE p.farmer_id = ?
  `).get(farmerId);
  return { count: r.count, avg: Math.round(r.avg * 10) / 10 };
}

// Public: reviews for a product (with reviewer name + verified badge)
app.get('/api/produce/:id', (req, res) => {
  const p = db.prepare(`
    SELECT p.*, u.name AS farmer_name, u.fpo_name, u.location AS farmer_location
    FROM produce p JOIN users u ON p.farmer_id = u.id WHERE p.id = ?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });

  const reviews = db.prepare(`
    SELECT rv.*, u.name AS reviewer_name,
      EXISTS(SELECT 1 FROM orders o WHERE o.buyer_id = rv.user_id
             AND o.produce_id = rv.produce_id AND o.status = 'delivered') AS verified
    FROM reviews rv JOIN users u ON rv.user_id = u.id
    WHERE rv.produce_id = ? ORDER BY rv.created_at DESC
  `).all(req.params.id);

  // histogram: {1: n, 2: n, ...}
  const hist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach(r => hist[r.rating]++);

  res.json({
    ...p,
    rating: ratingFor(p.id),
    seller: { name: p.farmer_name, fpo: p.fpo_name, location: p.farmer_location,
              rating: sellerRating(p.farmer_id) },
    related: db.prepare(`
      SELECT p2.id, p2.crop, p2.price_per_kg, p2.grade FROM produce p2
      WHERE p2.id != ? AND p2.status = 'available' AND p2.quantity_kg > 0
        AND p2.crop != ? LIMIT 4
    `).all(p.id, p.crop),
    reviews, histogram: hist
  });
});

// Post a review (must be logged in; verified auto-detected)
app.post('/api/produce/:id/reviews', auth, (req, res) => {
  const { rating, title, body } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating 1–5 required' });
  const p = db.prepare('SELECT id FROM produce WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });

  const verified = !!db.prepare(`
    SELECT 1 FROM orders WHERE buyer_id = ? AND produce_id = ? AND status = 'delivered'
  `).get(req.user.id, p.id);

  try {
    const info = db.prepare(`
      INSERT INTO reviews (produce_id, user_id, rating, title, body) VALUES (?,?,?,?,?)
    `).run(p.id, req.user.id, rating, title || null, body || null);
    res.json({ ok: true, id: info.lastInsertRowid, verified });
  } catch (e) {
    res.status(409).json({ error: 'You already reviewed this product' });
  }
});

// Delete own review
app.delete('/api/reviews/:id', auth, (req, res) => {
  const rv = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!rv || rv.user_id !== req.user.id) return res.status(404).json({ error: 'Not your review' });
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🌾 FarmDirect on http://localhost:${PORT}`));
}
