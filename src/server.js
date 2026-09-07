const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const db = new Database(path.join(__dirname, 'crm.db'));
const SECRET = process.env.JWT_SECRET || 'estateflow-dev-secret-change-me';
const PORT = process.env.PORT || 3000;
const STAGES = ['New', 'Contacted', 'Site Visit', 'Interested', 'Negotiation', 'Booked', 'Lost'];
const UNIT_TYPES = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', 'Penthouse', 'Villa'];

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('ADMIN','SALES')),
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT,
 phone TEXT,
 stage TEXT NOT NULL DEFAULT 'New' CHECK(stage IN ('New','Contacted','Site Visit','Interested','Negotiation','Booked','Lost')),
 assigned_to INTEGER,
 notes TEXT,
 follow_up TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS projects (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 location TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS buildings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 floors INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 UNIQUE(project_id,name)
);
CREATE TABLE IF NOT EXISTS units (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 building_id INTEGER NOT NULL,
 unit_no TEXT NOT NULL,
 type TEXT NOT NULL,
 price REAL NOT NULL CHECK(price > 0),
 status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','BOOKED')),
 FOREIGN KEY(building_id) REFERENCES buildings(id) ON DELETE CASCADE,
 UNIQUE(building_id,unit_no)
);
CREATE TABLE IF NOT EXISTS bookings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 lead_id INTEGER NOT NULL,
 unit_id INTEGER NOT NULL UNIQUE,
 booked_by INTEGER NOT NULL,
 amount REAL NOT NULL CHECK(amount > 0),
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(lead_id) REFERENCES leads(id),
 FOREIGN KEY(unit_id) REFERENCES units(id),
 FOREIGN KEY(booked_by) REFERENCES users(id)
);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
    const add = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)');
    add.run('Admin User', 'admin@estateflow.com', bcrypt.hashSync('Admin@123', 10), 'ADMIN');
    add.run('Priya Sales', 'priya@estateflow.com', bcrypt.hashSync('Sales@123', 10), 'SALES');
    add.run('Arun Sales', 'arun@estateflow.com', bcrypt.hashSync('Sales@123', 10), 'SALES');
  }
  if (db.prepare('SELECT COUNT(*) c FROM projects').get().c === 0) {
    const project = db.prepare('INSERT INTO projects(name,location) VALUES(?,?)').run('Green Valley Residences', 'OMR, Chennai');
    const b1 = db.prepare('INSERT INTO buildings(project_id,name,floors) VALUES(?,?,?)').run(project.lastInsertRowid, 'Tower A', 12);
    const b2 = db.prepare('INSERT INTO buildings(project_id,name,floors) VALUES(?,?,?)').run(project.lastInsertRowid, 'Tower B', 10);
    const unit = db.prepare('INSERT INTO units(building_id,unit_no,type,price) VALUES(?,?,?,?)');
    [['A-101','2 BHK',6500000],['A-102','2 BHK',6750000],['A-201','3 BHK',9200000],['A-202','3 BHK',9800000],['A-301','Penthouse',14500000]].forEach(x => unit.run(b1.lastInsertRowid, ...x));
    [['B-101','2 BHK',6100000],['B-102','2 BHK',6300000],['B-201','3 BHK',8800000]].forEach(x => unit.run(b2.lastInsertRowid, ...x));
    const sales = db.prepare("SELECT id FROM users WHERE email='priya@estateflow.com'").get().id;
    const lead = db.prepare('INSERT INTO leads(name,email,phone,stage,assigned_to,notes,follow_up) VALUES(?,?,?,?,?,?,?)').run('Ranjana J', 'ranjana@example.com', '9876543210', 'Booked', sales, 'Interested in 2 BHK at Green Valley.', null);
    const bookedUnit = db.prepare("SELECT id,price FROM units WHERE unit_no='A-101'").get();
    db.prepare('INSERT INTO bookings(lead_id,unit_id,booked_by,amount) VALUES(?,?,?,?)').run(lead.lastInsertRowid, bookedUnit.id, sales, bookedUnit.price);
    db.prepare("UPDATE units SET status='BOOKED' WHERE id=?").run(bookedUnit.id);
    db.prepare('INSERT INTO leads(name,email,phone,stage,assigned_to,notes,follow_up) VALUES(?,?,?,?,?,?,?)').run('Rahul Kumar','rahul@example.com','9000012345','Site Visit',sales,'Wants a 3 BHK. Site visit planned.','2026-09-12');
  }
}
seed();

function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    req.user = jwt.verify(token, SECRET);
    next();
  } catch { res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin permission required.' });
  next();
}
function validateEmail(email) { return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validatePhone(phone) { return !phone || /^[0-9+\-()\s]{7,20}$/.test(phone); }
function canAccessLead(req, lead) { return req.user.role === 'ADMIN' || lead.assigned_to === req.user.id; }

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(email);
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ id: u.id, name: u.name, role: u.role }, SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});
app.get('/api/me', auth, (req, res) => res.json(req.user));
app.get('/api/users', auth, (req, res) => res.json(db.prepare("SELECT id,name,email,role FROM users WHERE role='SALES' ORDER BY name").all()));

app.get('/api/leads', auth, (req, res) => {
  const sql = req.user.role === 'ADMIN'
    ? `SELECT l.*,u.name assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to ORDER BY l.id DESC`
    : `SELECT l.*,u.name assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.assigned_to=? ORDER BY l.id DESC`;
  res.json(req.user.role === 'ADMIN' ? db.prepare(sql).all() : db.prepare(sql).all(req.user.id));
});
app.post('/api/leads', auth, (req, res) => {
  const { name, email, phone, stage = 'New', assigned_to, notes, follow_up } = req.body;
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Lead name is required.' });
  if (!STAGES.includes(stage) || !validateEmail(email) || !validatePhone(phone)) return res.status(400).json({ error: 'Please enter valid lead details.' });
  const assigned = req.user.role === 'ADMIN' ? (assigned_to || null) : req.user.id;
  if (assigned && !db.prepare("SELECT id FROM users WHERE id=? AND role='SALES'").get(assigned)) return res.status(400).json({ error: 'Assigned employee is invalid.' });
  const r = db.prepare('INSERT INTO leads(name,email,phone,stage,assigned_to,notes,follow_up) VALUES(?,?,?,?,?,?,?)').run(String(name).trim(), email || '', phone || '', stage, assigned, notes || '', follow_up || null);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.put('/api/leads/:id', auth, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  if (!canAccessLead(req, lead)) return res.status(403).json({ error: 'You can only manage leads assigned to you.' });
  const { name, email, phone, stage, assigned_to, notes, follow_up } = req.body;
  if (!String(name || '').trim() || !STAGES.includes(stage) || !validateEmail(email) || !validatePhone(phone)) return res.status(400).json({ error: 'Please enter valid lead details.' });
  const assigned = req.user.role === 'ADMIN' ? (assigned_to || null) : lead.assigned_to;
  if (assigned && !db.prepare("SELECT id FROM users WHERE id=? AND role='SALES'").get(assigned)) return res.status(400).json({ error: 'Assigned employee is invalid.' });
  db.prepare('UPDATE leads SET name=?,email=?,phone=?,stage=?,assigned_to=?,notes=?,follow_up=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(name).trim(), email || '', phone || '', stage, assigned, notes || '', follow_up || null, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/leads/:id', auth, adminOnly, (req, res) => {
  const r = db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Lead not found.' });
  res.json({ ok: true });
});

app.get('/api/projects', auth, (req, res) => {
  res.json(db.prepare(`SELECT p.id,p.name,p.location,COUNT(DISTINCT b.id) building_count,COUNT(u.id) unit_count,
    SUM(CASE WHEN u.status='AVAILABLE' THEN 1 ELSE 0 END) available_count
    FROM projects p LEFT JOIN buildings b ON b.project_id=p.id LEFT JOIN units u ON u.building_id=b.id
    GROUP BY p.id ORDER BY p.id DESC`).all());
});
app.post('/api/projects', auth, adminOnly, (req, res) => {
  const { name, location } = req.body;
  if (!String(name || '').trim() || !String(location || '').trim()) return res.status(400).json({ error: 'Project name and location are required.' });
  try { const r = db.prepare('INSERT INTO projects(name,location) VALUES(?,?)').run(name.trim(), location.trim()); res.status(201).json({ id: r.lastInsertRowid }); }
  catch { res.status(400).json({ error: 'Project could not be created.' }); }
});
app.put('/api/projects/:id', auth, adminOnly, (req, res) => {
  const { name, location } = req.body;
  if (!String(name || '').trim() || !String(location || '').trim()) return res.status(400).json({ error: 'Project name and location are required.' });
  const r = db.prepare('UPDATE projects SET name=?,location=? WHERE id=?').run(name.trim(), location.trim(), req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Project not found.' });
  res.json({ ok: true });
});
app.delete('/api/projects/:id', auth, adminOnly, (req, res) => {
  const r = db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Project not found.' });
  res.json({ ok: true });
});

app.get('/api/buildings', auth, (req, res) => res.json(db.prepare(`SELECT b.*,p.name project_name,p.location FROM buildings b JOIN projects p ON p.id=b.project_id ORDER BY p.name,b.name`).all()));
app.post('/api/buildings', auth, adminOnly, (req, res) => {
  const { project_id, name, floors } = req.body;
  if (!project_id || !String(name || '').trim() || !Number.isInteger(Number(floors)) || Number(floors) < 1) return res.status(400).json({ error: 'Project, building name and valid floors are required.' });
  try { const r = db.prepare('INSERT INTO buildings(project_id,name,floors) VALUES(?,?,?)').run(project_id, name.trim(), Number(floors)); res.status(201).json({ id: r.lastInsertRowid }); }
  catch { res.status(400).json({ error: 'Building could not be created. Check the project and name.' }); }
});
app.put('/api/buildings/:id', auth, adminOnly, (req, res) => {
  const { project_id, name, floors } = req.body;
  if (!project_id || !String(name || '').trim() || Number(floors) < 1) return res.status(400).json({ error: 'Project, building name and valid floors are required.' });
  try { const r = db.prepare('UPDATE buildings SET project_id=?,name=?,floors=? WHERE id=?').run(project_id, name.trim(), Number(floors), req.params.id); if (!r.changes) return res.status(404).json({ error: 'Building not found.' }); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'Building could not be updated.' }); }
});
app.delete('/api/buildings/:id', auth, adminOnly, (req, res) => { const r = db.prepare('DELETE FROM buildings WHERE id=?').run(req.params.id); if (!r.changes) return res.status(404).json({ error: 'Building not found.' }); res.json({ ok: true }); });

app.get('/api/units', auth, (req, res) => res.json(db.prepare(`SELECT u.*,b.name building_name,b.project_id,p.name project_name,p.location FROM units u JOIN buildings b ON b.id=u.building_id JOIN projects p ON p.id=b.project_id ORDER BY p.name,b.name,u.unit_no`).all()));
app.post('/api/units', auth, adminOnly, (req, res) => {
  const { building_id, unit_no, type, price } = req.body;
  if (!building_id || !String(unit_no || '').trim() || !UNIT_TYPES.includes(type) || !Number(price) || Number(price) <= 0) return res.status(400).json({ error: 'Building, unit number, type and positive price are required.' });
  try { const r = db.prepare('INSERT INTO units(building_id,unit_no,type,price) VALUES(?,?,?,?)').run(building_id, unit_no.trim(), type, Number(price)); res.status(201).json({ id: r.lastInsertRowid }); }
  catch { res.status(400).json({ error: 'Unit could not be created. Unit number may already exist in this building.' }); }
});
app.put('/api/units/:id', auth, adminOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM units WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Unit not found.' });
  const { building_id, unit_no, type, price } = req.body;
  if (!building_id || !String(unit_no || '').trim() || !UNIT_TYPES.includes(type) || !Number(price) || Number(price) <= 0) return res.status(400).json({ error: 'Building, unit number, type and positive price are required.' });
  if (existing.status === 'BOOKED' && (String(building_id) !== String(existing.building_id) || unit_no.trim() !== existing.unit_no)) return res.status(400).json({ error: 'A booked unit cannot be moved or renamed.' });
  try { const r = db.prepare('UPDATE units SET building_id=?,unit_no=?,type=?,price=? WHERE id=?').run(building_id, unit_no.trim(), type, Number(price), req.params.id); res.json({ ok: !!r.changes }); }
  catch { res.status(400).json({ error: 'Unit could not be updated.' }); }
});
app.delete('/api/units/:id', auth, adminOnly, (req, res) => {
  const u = db.prepare('SELECT * FROM units WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Unit not found.' });
  if (u.status === 'BOOKED') return res.status(400).json({ error: 'Booked units cannot be deleted.' });
  db.prepare('DELETE FROM units WHERE id=?').run(req.params.id); res.json({ ok: true });
});

app.get('/api/properties', auth, (req, res) => res.json(db.prepare(`SELECT u.id,u.unit_no,u.type,u.price,u.status,b.id building_id,b.name building,p.id project_id,p.name project,p.location FROM units u JOIN buildings b ON b.id=u.building_id JOIN projects p ON p.id=b.project_id ORDER BY p.name,b.name,u.unit_no`).all()));

app.get('/api/bookings', auth, (req, res) => {
  const sql = req.user.role === 'ADMIN'
    ? `SELECT bo.*,l.name lead_name,l.phone lead_phone,u.unit_no,u.type,p.name project,b.name building,us.name booked_by_name FROM bookings bo JOIN leads l ON l.id=bo.lead_id JOIN units u ON u.id=bo.unit_id JOIN buildings b ON b.id=u.building_id JOIN projects p ON p.id=b.project_id JOIN users us ON us.id=bo.booked_by ORDER BY bo.id DESC`
    : `SELECT bo.*,l.name lead_name,l.phone lead_phone,u.unit_no,u.type,p.name project,b.name building,us.name booked_by_name FROM bookings bo JOIN leads l ON l.id=bo.lead_id JOIN units u ON u.id=bo.unit_id JOIN buildings b ON b.id=u.building_id JOIN projects p ON p.id=b.project_id JOIN users us ON us.id=bo.booked_by WHERE bo.booked_by=? OR l.assigned_to=? ORDER BY bo.id DESC`;
  res.json(req.user.role === 'ADMIN' ? db.prepare(sql).all() : db.prepare(sql).all(req.user.id, req.user.id));
});
app.post('/api/bookings', auth, (req, res) => {
  const { lead_id, unit_id, amount } = req.body;
  const tx = db.transaction(() => {
    const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(lead_id);
    if (!lead) throw new Error('LEAD_NOT_FOUND');
    if (!canAccessLead(req, lead)) throw new Error('LEAD_FORBIDDEN');
    const unit = db.prepare('SELECT * FROM units WHERE id=?').get(unit_id);
    if (!unit || unit.status !== 'AVAILABLE') throw new Error('UNIT_BOOKED');
    const bookingAmount = Number(amount || unit.price);
    if (!Number.isFinite(bookingAmount) || bookingAmount <= 0) throw new Error('INVALID_AMOUNT');
    db.prepare('INSERT INTO bookings(lead_id,unit_id,booked_by,amount) VALUES(?,?,?,?)').run(lead_id, unit_id, req.user.id, bookingAmount);
    const changed = db.prepare("UPDATE units SET status='BOOKED' WHERE id=? AND status='AVAILABLE'").run(unit_id);
    if (!changed.changes) throw new Error('UNIT_BOOKED');
    db.prepare("UPDATE leads SET stage='Booked',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(lead_id);
  });
  try { tx(); res.status(201).json({ ok: true }); }
  catch (e) {
    const map = { UNIT_BOOKED: [409,'Unit is already booked or no longer available.'], LEAD_NOT_FOUND:[404,'Lead not found.'], LEAD_FORBIDDEN:[403,'You cannot book against this lead.'], INVALID_AMOUNT:[400,'Booking amount must be greater than zero.'] };
    const [status, error] = map[e.message] || [400,'Booking could not be completed.']; res.status(status).json({ error });
  }
});

app.get('/api/dashboard', auth, (req, res) => {
  const where = req.user.role === 'ADMIN' ? '' : ` WHERE assigned_to=${Number(req.user.id)}`;
  const leads = db.prepare(`SELECT COUNT(*) c FROM leads${where}`).get().c;
  const followups = db.prepare(`SELECT COUNT(*) c FROM leads${where}${where ? ' AND' : ' WHERE'} follow_up IS NOT NULL AND date(follow_up)>=date('now') AND stage NOT IN ('Booked','Lost')`).get().c;
  const bookings = req.user.role === 'ADMIN' ? db.prepare('SELECT COUNT(*) c FROM bookings').get().c : db.prepare('SELECT COUNT(*) c FROM bookings bo JOIN leads l ON l.id=bo.lead_id WHERE bo.booked_by=? OR l.assigned_to=?').get(req.user.id, req.user.id).c;
  const available = db.prepare("SELECT COUNT(*) c FROM units WHERE status='AVAILABLE'").get().c;
  const pipeline = req.user.role === 'ADMIN'
    ? db.prepare('SELECT stage,COUNT(*) count FROM leads GROUP BY stage').all()
    : db.prepare('SELECT stage,COUNT(*) count FROM leads WHERE assigned_to=? GROUP BY stage').all(req.user.id);
  const upcoming = req.user.role === 'ADMIN'
    ? db.prepare(`SELECT l.id,l.name,l.stage,l.follow_up,u.name assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.follow_up IS NOT NULL AND date(l.follow_up)>=date('now') AND l.stage NOT IN ('Booked','Lost') ORDER BY date(l.follow_up) LIMIT 5`).all()
    : db.prepare(`SELECT l.id,l.name,l.stage,l.follow_up,u.name assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.assigned_to=? AND l.follow_up IS NOT NULL AND date(l.follow_up)>=date('now') AND l.stage NOT IN ('Booked','Lost') ORDER BY date(l.follow_up) LIMIT 5`).all(req.user.id);
  res.json({ leads, followups, bookings, available, pipeline, upcoming });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found.' });
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.listen(PORT, () => console.log(`EstateFlow CRM running on http://localhost:${PORT}`));
