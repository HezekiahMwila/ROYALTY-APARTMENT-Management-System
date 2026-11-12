// Royalty Apartments - boarding house management system
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(db.DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SESSION_DAYS = 7;
const PAY_METHODS = ['Mobile Money', 'Bank Transfer', 'Cash Deposit'];
const PROBLEM_CATEGORIES = ['Plumbing', 'Electrical', 'Furniture', 'Door / Lock', 'Cleanliness', 'Pests', 'Other'];
const PROBLEM_STATUSES = ['open', 'in_progress', 'resolved'];

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// The app's service worker must never be cached by the browser, or phones would keep running
// an old version of it. The manifest is checked for updates on every visit too.
app.get(['/sw.js', '/manifest.webmanifest'], (req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

// ---------- helpers ----------

const now = () => new Date().toISOString();
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : NaN);
// Phone numbers are the student login, so store them without spaces or dashes.
const normPhone = (v) => {
  const s = str(v, 30);
  const digits = s.replace(/\D/g, '');
  return digits ? (s.startsWith('+') ? '+' : '') + digits : '';
};
const validPhone = (p) => p.replace(/\D/g, '').length >= 7;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  }
  return out;
}

function flash(res, type, text) {
  res.cookie('flash', JSON.stringify({ type, text }), { httpOnly: true, sameSite: 'lax' });
}

// "Remember me" keeps the login for SESSION_DAYS. Without it the login ends when the browser
// is closed (the cookie has no expiry date), and after a day at the latest.
function startSession(res, userId, remember = true) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = (remember ? SESSION_DAYS : 1) * 24 * 60 * 60 * 1000;
  db.run('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)', token, userId, Date.now() + maxAge);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', ...(remember ? { maxAge } : {}) });
}

const adminExists = () => !!db.get(`SELECT 1 AS x FROM users WHERE role = 'admin'`);

// Rooms with live occupant counts. A room is "vacant" automatically
// whenever nobody is registered in it.
function roomStatus(r) {
  if (db.RESERVED_ROOMS.includes(r.id)) return 'reserved';
  return r.occupants === 0 ? 'vacant' : r.occupants < r.capacity ? 'available' : 'full';
}
// Rooms a student can still be placed in.
const isOpen = (r) => r.status === 'vacant' || r.status === 'available';
const ROOM_SQL = `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.room_id = r.id) AS occupants FROM rooms r`;
const listRooms = () => db.all(`${ROOM_SQL} ORDER BY r.id`).map((r) => ({ ...r, status: roomStatus(r) }));
function getRoom(id) {
  const r = db.get(`${ROOM_SQL} WHERE r.id = ?`, id);
  return r ? { ...r, status: roomStatus(r) } : null;
}
const roomHasSpace = (id) => { const r = getRoom(id); return !!r && isOpen(r); };

// Validates and inserts a user. Returns an error message, or null on success.
function createUser({ role, name, student_no, email, phone, password, room_id }) {
  if (!name) return 'Please enter a full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (db.get('SELECT 1 AS x FROM users WHERE email = ?', email)) return 'That email address is already registered.';
  if (role === 'student') {
    if (!validPhone(phone || '')) return 'Please enter a valid phone number.';
    if (db.get('SELECT 1 AS x FROM users WHERE phone = ?', phone)) return 'That phone number is already registered.';
  }
  if (room_id != null && !roomHasSpace(room_id)) return 'That room is full or not available. Please choose another.';
  db.run(
    `INSERT INTO users (role, name, student_no, email, phone, password_hash, room_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    role, name, student_no || '', email.toLowerCase(), phone || '', hashPassword(password), room_id ?? null, now()
  );
  return null;
}

// The address phones should open when they scan a room QR code. Set PUBLIC_URL when the site
// is hosted online. Otherwise use the address the admin is browsing on; if that is "localhost"
// (which a phone cannot reach), swap in this computer's address on the local network.
function publicOrigin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = req.get('host') || `localhost:${PORT}`;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) {
    const lan = Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal);
    const port = (host.match(/:\d+$/) || [''])[0];
    if (lan) return `http://${lan.address}${port}`;
  }
  return `${req.protocol}://${host}`;
}

// A check-in link is remembered across the login page, so a student who scans
// the QR code before logging in still ends up checked in.
const CHECKIN_PATH = /^\/checkin\/\d{1,4}\?code=[A-Z0-9]{4,12}$/;
function afterLogin(req, res, fallback) {
  const next = parseCookies(req.headers.cookie).next;
  res.clearCookie('next');
  return next && CHECKIN_PATH.test(next) ? next : fallback;
}

function deleteUpload(file) {
  if (file) fs.rm(path.join(UPLOAD_DIR, path.basename(file)), { force: true }, () => {});
}

// Image uploads (payment screenshots, problem photos)
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + IMAGE_EXT[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    IMAGE_EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only PNG, JPG or WEBP images are allowed.')),
});
const imageUpload = (field, backTo) => (req, res, next) =>
  upload.single(field)(req, res, (err) => {
    if (!err) return next();
    flash(res, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'That image is too large (max 5 MB).' : err.message);
    res.redirect(backTo);
  });

// Slow down password guessing: 10 failed logins per 15 minutes per address.
const loginFails = new Map();
function tooManyFails(ip) {
  const f = loginFails.get(ip);
  if (f && f.until < Date.now()) loginFails.delete(ip);
  return (loginFails.get(ip)?.count || 0) >= 10;
}
function recordFail(ip) {
  const f = loginFails.get(ip) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
  f.count++;
  loginFails.set(ip, f);
}

// ---------- per-request setup ----------

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);

  req.user = null;
  if (cookies.sid) {
    req.user = db.get(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?`,
      cookies.sid, Date.now()
    ) || null;
    req.sid = cookies.sid;
  }

  let flashMsg = null;
  if (cookies.flash) {
    try { flashMsg = JSON.parse(cookies.flash); } catch { /* ignore */ }
    res.clearCookie('flash');
  }

  const settings = Object.fromEntries(db.all('SELECT key, value FROM settings').map((s) => [s.key, s.value]));
  req.settings = settings;

  Object.assign(res.locals, {
    user: req.user,
    flash: flashMsg,
    path: req.path,
    settings,
    money: (n) => `${settings.currency} ${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    fmtDate: (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''),
    fmtPeriod: (p) => new Date(p + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    stars: (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)),
    statusLabel: { vacant: 'Vacant', available: 'Space available', full: 'Full', reserved: 'Reserved', in_progress: 'In progress' },
    // Address of the n-th apartment picture, for pages that use one as a background.
    photo: (n) => { const all = sitePhotos(); return all[n % all.length].src; },
  });
  next();
});

const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  if (req.user.role !== role) {
    return res.status(403).render('message', { title: 'Not allowed', text: 'You do not have access to that page.' });
  }
  next();
};
const student = requireRole('student');
const admin = requireRole('admin');
const homeFor = (user) => (user.role === 'admin' ? '/admin' : '/student');

// ---------- public pages & accounts ----------

app.get('/', (req, res) => {
  if (!adminExists()) return res.redirect('/setup');
  // Figures for the landing page, counted from the rooms students can actually live in.
  const rooms = listRooms().filter((r) => r.status !== 'reserved');
  const stats = {
    rooms: rooms.length,
    bedspaces: rooms.reduce((n, r) => n + r.capacity, 0),
    free: rooms.reduce((n, r) => n + Math.max(0, r.capacity - r.occupants), 0),
  };
  res.render('home', { ...showcase(req), stats });
});

// One-time setup: the first visitor creates the admin account.
app.get('/setup', (req, res) => {
  if (adminExists()) return res.redirect('/login');
  res.render('setup');
});

app.post('/setup', (req, res) => {
  if (adminExists()) return res.redirect('/login');
  const email = str(req.body.email);
  const error = createUser({ role: 'admin', name: str(req.body.name), email, password: String(req.body.password || '') });
  if (error) { flash(res, 'error', error); return res.redirect('/setup'); }
  startSession(res, db.get('SELECT id FROM users WHERE email = ?', email).id);
  flash(res, 'ok', 'Admin account created.');
  res.redirect('/admin');
});

app.get('/login', (req, res) => {
  if (!adminExists()) return res.redirect('/setup');
  if (req.user) return res.redirect(homeFor(req.user));
  res.render('login');
});

app.post('/login', (req, res) => {
  if (tooManyFails(req.ip)) {
    flash(res, 'error', 'Too many failed attempts. Please try again in 15 minutes.');
    return res.redirect('/login');
  }
  // Students log in with their phone number; an email address also works (admin).
  const login = str(req.body.login);
  const user = login.includes('@')
    ? db.get('SELECT * FROM users WHERE email = ?', login)
    : db.get(`SELECT * FROM users WHERE phone <> '' AND phone = ?`, normPhone(login));
  if (!user || !checkPassword(String(req.body.password || ''), user.password_hash)) {
    recordFail(req.ip);
    flash(res, 'error', 'Incorrect phone number or password.');
    return res.redirect('/login');
  }
  startSession(res, user.id, req.body.remember === '1');
  res.redirect(afterLogin(req, res, homeFor(user)));
});

app.post('/logout', (req, res) => {
  if (req.sid) db.run('DELETE FROM sessions WHERE token = ?', req.sid);
  res.clearCookie('sid');
  res.redirect('/');
});

app.get('/register', (req, res) => {
  if (!adminExists()) return res.redirect('/setup');
  if (req.user) return res.redirect(homeFor(req.user));
  res.render('register', { ...showcase(req) });   // pictures and services beside the form
});

// Students register with name, phone and email only. The caretaker assigns the room.
app.post('/register', (req, res) => {
  const email = str(req.body.email);
  const error = createUser({
    role: 'student',
    name: str(req.body.name),
    email,
    phone: normPhone(req.body.phone),
    password: String(req.body.password || ''),
  });
  if (error) { flash(res, 'error', error); return res.redirect('/register'); }
  startSession(res, db.get('SELECT id FROM users WHERE email = ?', email).id);
  flash(res, 'ok', 'Your account is ready. The caretaker will assign you a room.');
  res.redirect(afterLogin(req, res, '/student'));
});

// Room QR codes. The caretaker opens a room in the admin account and shows its QR code, which
// holds the room number and that room's secret code. A student who scans it is assigned to the
// room (if they have no room yet) and checked in. Returns [flash type, message].
function scanRoomCode(user, roomId, code) {
  const room = getRoom(roomId);
  if (!room || room.status === 'reserved') return ['error', 'That room QR code is not valid.'];
  if (!code || String(code).toUpperCase() !== room.qr_code) {
    return ['error', 'That QR code is out of date, or the code was typed wrongly. Ask the caretaker to show you the current one.'];
  }
  if (user.room_id && user.room_id !== room.id) {
    return ['error', `This QR code is for Room ${room.id}, but you are already in Room ${user.room_id}. Ask the caretaker to move you.`];
  }
  if (user.room_id === room.id) {
    if (user.checked_in_at) return ['ok', `You are already checked in to Room ${room.id}.`];
    db.run('UPDATE users SET checked_in_at = ? WHERE id = ?', now(), user.id);
    return ['ok', `Welcome! You are checked in to Room ${room.id}.`];
  }
  if (!isOpen(room)) return ['error', `Room ${room.id} is full. Please speak to the caretaker.`];
  db.run('UPDATE users SET room_id = ?, checked_in_at = ? WHERE id = ?', room.id, now(), user.id);
  return ['ok', `Welcome! You have been assigned to Room ${room.id}.`];
}

// The link inside the QR code. Phone cameras open it directly; the in-site scanner sends students here too.
app.get('/checkin/:room', (req, res) => {
  const roomId = int(req.params.room);
  const code = str(req.query.code, 12).toUpperCase();
  const u = req.user;
  if (!u) {
    const next = `/checkin/${roomId}?code=${code}`;
    if (CHECKIN_PATH.test(next)) res.cookie('next', next, { httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    flash(res, 'ok', 'Log in to finish scanning your room QR code.');
    return res.redirect('/login');
  }
  if (u.role === 'admin') return res.redirect(getRoom(roomId) ? `/admin/rooms/${roomId}` : '/admin');
  flash(res, ...scanRoomCode(u, roomId, code));
  res.redirect('/student/room');
});

app.get('/account', (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.render('account');
});

app.post('/account/password', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const next = String(req.body.new_password || '');
  if (!checkPassword(String(req.body.current_password || ''), req.user.password_hash)) {
    flash(res, 'error', 'Your current password is incorrect.');
  } else if (next.length < 6) {
    flash(res, 'error', 'New password must be at least 6 characters.');
  } else {
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), req.user.id);
    db.run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', req.user.id, req.sid);
    flash(res, 'ok', 'Password changed.');
  }
  res.redirect('/account');
});

// Uploaded images are private: only the admin or the student who uploaded them.
app.get('/uploads/:file', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const file = path.basename(req.params.file);
  if (req.user.role !== 'admin') {
    const own = db.get(
      `SELECT 1 AS x FROM payments WHERE screenshot = ? AND user_id = ?
       UNION SELECT 1 FROM problems WHERE photo = ? AND user_id = ?
       UNION SELECT 1 FROM users WHERE photo = ? AND id = ?`,
      file, req.user.id, file, req.user.id, file, req.user.id
    );
    if (!own) return res.status(403).end();
  }
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(UPLOAD_DIR, file), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// Apartment photos on the homepage are public.
app.get('/photos/:file', (req, res) => {
  const file = path.basename(req.params.file);
  if (!db.get('SELECT 1 AS x FROM photos WHERE file = ?', file)) return res.status(404).end();
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(UPLOAD_DIR, file), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// The apartment pictures used across the site: the ones the caretaker uploaded in Settings,
// or, until there are any, the built-in pictures in public/slides.
const BUILT_IN_SLIDES = ['Upper-floor balcony', 'Upper-floor rooms', 'Stairs to the courtyard', 'Ground-floor rooms'];
function sitePhotos() {
  const uploaded = db.all('SELECT file, caption FROM photos ORDER BY id');
  return uploaded.length
    ? uploaded.map((p) => ({ src: `/photos/${p.file}`, caption: p.caption }))
    : BUILT_IN_SLIDES.map((caption, i) => ({ src: `/slides/slide-${i + 1}.jpg`, caption }));
}

// Photos and services shown on the public and student homepages.
const showcase = (req) => ({
  slides: sitePhotos(),
  services: (req.settings.services || '').split('\n').map((s) => s.trim()).filter(Boolean),
});

// ---------- student ----------

const roommatesOf = (user) =>
  user.room_id
    ? db.all(`SELECT id, name, phone FROM users WHERE room_id = ? AND id <> ? ORDER BY name`, user.room_id, user.id)
    : [];

app.get('/student', student, (req, res) => {
  res.render('student/home', { ...showcase(req) });
});

app.get('/student/room', student, (req, res) => {
  const u = req.user;
  res.render('student/dashboard', {
    room: u.room_id ? getRoom(u.room_id) : null,
    roommates: roommatesOf(u),
    openProblems: db.get(`SELECT COUNT(*) AS n FROM problems WHERE user_id = ? AND status <> 'resolved'`, u.id).n,
  });
});

// Scan page: camera scanner, photo fallback, and typing the code by hand.
app.get('/student/scan', student, (req, res) => {
  res.render('student/scan', { room: req.user.room_id ? getRoom(req.user.room_id) : null });
});

app.post('/student/scan', student, (req, res) => {
  const [type, text] = scanRoomCode(req.user, int(req.body.room), str(req.body.code, 12));
  flash(res, type, text);
  res.redirect(type === 'ok' ? '/student/room' : '/student/scan');
});

// The QR reader used by the scan page (from the jsqr package).
app.get('/vendor/jsqr.js', (req, res) => res.sendFile(require.resolve('jsqr')));

app.post('/student/photo', student, imageUpload('photo', '/student/room'), (req, res) => {
  if (!req.file) flash(res, 'error', 'Please choose a picture to upload.');
  else {
    db.run('UPDATE users SET photo = ? WHERE id = ?', req.file.filename, req.user.id);
    deleteUpload(req.user.photo);
    flash(res, 'ok', 'Profile picture updated.');
  }
  res.redirect('/student/room');
});

app.get('/student/payments', student, (req, res) => {
  res.render('student/payments', {
    room: req.user.room_id ? getRoom(req.user.room_id) : null,
    payments: db.all('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC', req.user.id),
    methods: PAY_METHODS,
    thisMonth: now().slice(0, 7),
  });
});

app.post('/student/payments', student, imageUpload('screenshot', '/student/payments'), (req, res) => {
  const amount = Number(req.body.amount);
  const period = str(req.body.period, 7);
  const method = str(req.body.method);
  let error = null;
  if (!req.user.room_id) error = 'You need to be assigned to a room before making a payment.';
  else if (!req.file) error = 'Please attach a screenshot of your payment.';
  else if (!(amount > 0) || amount > 1e9) error = 'Please enter a valid amount.';
  else if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) error = 'Please choose the month you are paying for.';
  else if (!PAY_METHODS.includes(method)) error = 'Please choose a payment method.';

  if (error) {
    deleteUpload(req.file?.filename);
    flash(res, 'error', error);
  } else {
    db.run(
      `INSERT INTO payments (user_id, room_id, amount, period, method, reference, screenshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      req.user.id, req.user.room_id, amount, period, method, str(req.body.reference, 100), req.file.filename, now()
    );
    flash(res, 'ok', 'Payment submitted. The admin will review your screenshot and approve it.');
  }
  res.redirect('/student/payments');
});

app.get('/student/problems', student, (req, res) => {
  res.render('student/problems', {
    problems: db.all('SELECT * FROM problems WHERE user_id = ? ORDER BY id DESC', req.user.id),
    categories: PROBLEM_CATEGORIES,
  });
});

app.post('/student/problems', student, imageUpload('photo', '/student/problems'), (req, res) => {
  const category = str(req.body.category);
  const description = str(req.body.description, 2000);
  let error = null;
  if (!req.user.room_id) error = 'You need to be assigned to a room before reporting a problem.';
  else if (!PROBLEM_CATEGORIES.includes(category)) error = 'Please choose a category.';
  else if (description.length < 5) error = 'Please describe the problem.';

  if (error) {
    deleteUpload(req.file?.filename);
    flash(res, 'error', error);
  } else {
    db.run(
      `INSERT INTO problems (user_id, room_id, category, description, photo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      req.user.id, req.user.room_id, category, description, req.file?.filename ?? null, now(), now()
    );
    flash(res, 'ok', 'Problem reported. The admin has been notified.');
  }
  res.redirect('/student/problems');
});

app.get('/student/roommates', student, (req, res) => {
  const mine = db.all('SELECT * FROM ratings WHERE rater_id = ?', req.user.id);
  res.render('student/roommates', {
    roommates: roommatesOf(req.user).map((m) => ({ ...m, rating: mine.find((r) => r.ratee_id === m.id) })),
  });
});

app.post('/student/ratings', student, (req, res) => {
  const rateeId = int(req.body.ratee_id);
  const stars = int(req.body.stars);
  const isRoommate = roommatesOf(req.user).some((m) => m.id === rateeId);
  if (!isRoommate) flash(res, 'error', 'You can only rate your current roommates.');
  else if (!(stars >= 1 && stars <= 5)) flash(res, 'error', 'Please choose between 1 and 5 stars.');
  else {
    db.run(
      `INSERT INTO ratings (rater_id, ratee_id, stars, comment, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (rater_id, ratee_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, created_at = excluded.created_at`,
      req.user.id, rateeId, stars, str(req.body.comment, 500), now()
    );
    flash(res, 'ok', 'Rating saved.');
  }
  res.redirect('/student/roommates');
});

// ---------- admin ----------

app.get('/admin', admin, (req, res) => {
  const rooms = listRooms();
  res.render('admin/dashboard', {
    rooms,
    stats: {
      vacant: rooms.filter((r) => r.status === 'vacant').length,
      students: rooms.reduce((n, r) => n + r.occupants, 0),
      beds: rooms.reduce((n, r) => n + (r.status === 'reserved' ? 0 : r.capacity), 0),
      pendingPayments: db.get(`SELECT COUNT(*) AS n FROM payments WHERE status = 'pending'`).n,
      openProblems: db.get(`SELECT COUNT(*) AS n FROM problems WHERE status <> 'resolved'`).n,
      collected: db.get(`SELECT COALESCE(SUM(amount), 0) AS t FROM payments WHERE status = 'approved' AND period = ?`, now().slice(0, 7)).t,
    },
  });
});

app.get('/admin/rooms/:id', admin, async (req, res) => {
  const room = getRoom(int(req.params.id));
  if (!room) return res.status(404).render('message', { title: 'Not found', text: 'That room does not exist.' });
  const checkinUrl = `${publicOrigin(req)}/checkin/${room.id}?code=${room.qr_code}`;
  res.render('admin/room', {
    room,
    checkinUrl,
    qr: room.status === 'reserved' ? null : await QRCode.toString(checkinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
    occupants: db.all(`SELECT id, name, student_no, phone, email, checked_in_at FROM users WHERE room_id = ? ORDER BY name`, room.id),
    unassigned: db.all(`SELECT id, name, student_no FROM users WHERE role = 'student' AND room_id IS NULL ORDER BY name`),
  });
});

app.post('/admin/rooms/:id', admin, (req, res) => {
  const room = getRoom(int(req.params.id));
  if (!room) return res.redirect('/admin');
  const rent = Number(req.body.rent);
  if (req.body.rent === '' || !(rent >= 0)) flash(res, 'error', 'Please enter a valid rent amount.');
  else {
    db.run('UPDATE rooms SET rent = ? WHERE id = ?', rent, room.id);
    flash(res, 'ok', `Room ${room.id} updated.`);
  }
  res.redirect(`/admin/rooms/${room.id}`);
});

// Replace a room's QR code, so copies of the old one stop working.
app.post('/admin/rooms/:id/qr', admin, (req, res) => {
  const room = getRoom(int(req.params.id));
  if (!room) return res.redirect('/admin');
  db.newRoomCode(room.id);
  flash(res, 'ok', `Room ${room.id} has a new QR code. The old one no longer works.`);
  res.redirect(`/admin/rooms/${room.id}`);
});

app.post('/admin/rooms/:id/vacate', admin, (req, res) => {
  const id = int(req.params.id);
  const { changes } = db.run('UPDATE users SET room_id = NULL, checked_in_at = NULL WHERE room_id = ?', id);
  flash(res, 'ok', `Room ${id} marked vacant (${changes} occupant${changes === 1 ? '' : 's'} removed).`);
  res.redirect(`/admin/rooms/${id}`);
});

app.post('/admin/rooms/:id/assign', admin, (req, res) => {
  const id = int(req.params.id);
  const userId = int(req.body.user_id);
  if (!roomHasSpace(id)) flash(res, 'error', 'That room is full or reserved.');
  else {
    const { changes } = db.run(`UPDATE users SET room_id = ?, checked_in_at = NULL WHERE id = ? AND role = 'student'`, id, userId);
    flash(res, changes ? 'ok' : 'error', changes ? 'Student added to the room. They can scan the room QR code to check in.' : 'Please choose a student.');
  }
  res.redirect(`/admin/rooms/${id}`);
});

app.post('/admin/rooms/:id/remove', admin, (req, res) => {
  const id = int(req.params.id);
  db.run('UPDATE users SET room_id = NULL, checked_in_at = NULL WHERE id = ? AND room_id = ?', int(req.body.user_id), id);
  flash(res, 'ok', 'Occupant removed from the room.');
  res.redirect(`/admin/rooms/${id}`);
});

app.get('/admin/students', admin, (req, res) => {
  res.render('admin/students', {
    students: db.all(
      `SELECT u.*, (SELECT AVG(stars) FROM ratings r WHERE r.ratee_id = u.id) AS avg_rating
       FROM users u WHERE u.role = 'student' ORDER BY u.room_id IS NULL, u.room_id, u.name`
    ),
    rooms: listRooms().filter(isOpen),
  });
});

app.post('/admin/students', admin, (req, res) => {
  const room_id = req.body.room_id ? int(req.body.room_id) : null;
  const error = createUser({
    role: 'student',
    name: str(req.body.name),
    student_no: str(req.body.student_no, 50),
    email: str(req.body.email),
    phone: normPhone(req.body.phone),
    password: String(req.body.password || ''),
    room_id,
  });
  flash(res, error ? 'error' : 'ok', error || 'Student added.');
  res.redirect('/admin/students');
});

const getStudent = (id) => db.get(`SELECT * FROM users WHERE id = ? AND role = 'student'`, id);

app.get('/admin/students/:id', admin, (req, res) => {
  const s = getStudent(int(req.params.id));
  if (!s) return res.status(404).render('message', { title: 'Not found', text: 'That student does not exist.' });
  res.render('admin/student_edit', {
    s,
    rooms: listRooms().filter((r) => isOpen(r) || r.id === s.room_id),
  });
});

app.post('/admin/students/:id', admin, (req, res) => {
  const s = getStudent(int(req.params.id));
  if (!s) return res.redirect('/admin/students');
  const name = str(req.body.name);
  const email = str(req.body.email);
  const room_id = req.body.room_id ? int(req.body.room_id) : null;
  const password = String(req.body.password || '');
  const phone = normPhone(req.body.phone);
  let error = null;
  if (!name) error = 'Please enter a full name.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Please enter a valid email address.';
  else if (db.get('SELECT 1 AS x FROM users WHERE email = ? AND id <> ?', email, s.id)) error = 'That email address is used by another account.';
  else if (!validPhone(phone)) error = 'Please enter a valid phone number (students log in with it).';
  else if (db.get('SELECT 1 AS x FROM users WHERE phone = ? AND id <> ?', phone, s.id)) error = 'That phone number is used by another account.';
  else if (room_id !== null && room_id !== s.room_id && !roomHasSpace(room_id)) error = 'That room is full or not available.';
  else if (password && password.length < 6) error = 'Password must be at least 6 characters.';

  if (error) { flash(res, 'error', error); return res.redirect(`/admin/students/${s.id}`); }
  db.run(
    'UPDATE users SET name = ?, student_no = ?, email = ?, phone = ?, room_id = ? WHERE id = ?',
    name, str(req.body.student_no, 50), email.toLowerCase(), phone, room_id, s.id
  );
  // A student who is moved to another room has to check in to the new one.
  if (room_id !== s.room_id) db.run('UPDATE users SET checked_in_at = NULL WHERE id = ?', s.id);
  if (password) {
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), s.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', s.id);
  }
  flash(res, 'ok', 'Student updated.');
  res.redirect('/admin/students');
});

app.post('/admin/students/:id/delete', admin, (req, res) => {
  const s = getStudent(int(req.params.id));
  if (s) {
    const files = db.all(
      `SELECT screenshot AS f FROM payments WHERE user_id = ? UNION ALL SELECT photo FROM problems WHERE user_id = ?`,
      s.id, s.id
    );
    db.run('DELETE FROM users WHERE id = ?', s.id);
    files.forEach((row) => deleteUpload(row.f));
    deleteUpload(s.photo);
    flash(res, 'ok', `${s.name}'s account was deleted.`);
  }
  res.redirect('/admin/students');
});

app.get('/admin/payments', admin, (req, res) => {
  const filter = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'all';
  res.render('admin/payments', {
    filter,
    payments: db.all(
      `SELECT p.*, u.name, u.student_no FROM payments p JOIN users u ON u.id = p.user_id
       ${filter === 'all' ? '' : 'WHERE p.status = ?'}
       ORDER BY p.status = 'pending' DESC, p.id DESC`,
      ...(filter === 'all' ? [] : [filter])
    ),
  });
});

app.post('/admin/payments/:id/review', admin, (req, res) => {
  const status = req.body.action === 'approve' ? 'approved' : req.body.action === 'reject' ? 'rejected' : null;
  if (status) {
    const { changes } = db.run(
      `UPDATE payments SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'`,
      status, str(req.body.note, 300), now(), int(req.params.id)
    );
    flash(res, changes ? 'ok' : 'error', changes ? `Payment ${status}.` : 'That payment was already reviewed.');
  }
  res.redirect(req.body.back === 'pending' ? '/admin/payments?status=pending' : '/admin/payments');
});

app.get('/admin/problems', admin, (req, res) => {
  res.render('admin/problems', {
    statuses: PROBLEM_STATUSES,
    problems: db.all(
      `SELECT p.*, u.name FROM problems p JOIN users u ON u.id = p.user_id
       ORDER BY p.status = 'resolved', p.id DESC`
    ),
  });
});

app.post('/admin/problems/:id', admin, (req, res) => {
  const status = str(req.body.status);
  if (PROBLEM_STATUSES.includes(status)) {
    db.run('UPDATE problems SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?',
      status, str(req.body.note, 500), now(), int(req.params.id));
    flash(res, 'ok', 'Problem updated.');
  }
  res.redirect('/admin/problems');
});

app.get('/admin/ratings', admin, (req, res) => {
  res.render('admin/ratings', {
    summary: db.all(
      `SELECT u.id, u.name, u.room_id, AVG(r.stars) AS avg, COUNT(r.id) AS n
       FROM users u JOIN ratings r ON r.ratee_id = u.id
       GROUP BY u.id ORDER BY avg DESC, n DESC`
    ),
    ratings: db.all(
      `SELECT r.*, a.name AS rater, b.name AS ratee FROM ratings r
       JOIN users a ON a.id = r.rater_id JOIN users b ON b.id = r.ratee_id
       ORDER BY r.created_at DESC`
    ),
  });
});

app.get('/admin/settings', admin, (req, res) => {
  res.render('admin/settings', { photos: db.all('SELECT * FROM photos ORDER BY id') });
});

app.post('/admin/photos', admin, imageUpload('photo', '/admin/settings'), (req, res) => {
  if (!req.file) flash(res, 'error', 'Please choose a photo to upload.');
  else {
    db.run('INSERT INTO photos (file, caption, created_at) VALUES (?, ?, ?)', req.file.filename, str(req.body.caption, 80), now());
    flash(res, 'ok', 'Photo added to the homepage.');
  }
  res.redirect('/admin/settings');
});

app.post('/admin/photos/:id/delete', admin, (req, res) => {
  const photo = db.get('SELECT * FROM photos WHERE id = ?', int(req.params.id));
  if (photo) {
    db.run('DELETE FROM photos WHERE id = ?', photo.id);
    deleteUpload(photo.file);
    flash(res, 'ok', 'Photo removed.');
  }
  res.redirect('/admin/settings');
});

app.post('/admin/settings', admin, (req, res) => {
  const currency = str(req.body.currency, 5);
  if (!currency) flash(res, 'error', 'Please enter a currency symbol.');
  else {
    db.run(`UPDATE settings SET value = ? WHERE key = 'currency'`, currency);
    db.run(`UPDATE settings SET value = ? WHERE key = 'payment_instructions'`, str(req.body.payment_instructions, 1000));
    db.run(`UPDATE settings SET value = ? WHERE key = 'welcome_message'`, str(req.body.welcome_message, 300));
    db.run(`UPDATE settings SET value = ? WHERE key = 'services'`, str(req.body.services, 2000).replace(/\r/g, ''));
    flash(res, 'ok', 'Settings saved.');
  }
  res.redirect('/admin/settings');
});

// ---------- fallbacks ----------

app.use((req, res) => {
  res.status(404).render('message', { title: 'Page not found', text: 'We could not find that page.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('message', { title: 'Something went wrong', text: 'Please try again in a moment.' });
});

app.listen(PORT, () => console.log(`Royalty Apartments running at http://localhost:${PORT}`));
