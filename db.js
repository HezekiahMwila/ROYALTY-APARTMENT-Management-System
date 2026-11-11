// SQLite database (built into Node, no separate install needed).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const TOTAL_ROOMS = 24;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new DatabaseSync(path.join(DATA_DIR, 'royalty.db'));

sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS rooms (
    id        INTEGER PRIMARY KEY,
    capacity  INTEGER NOT NULL DEFAULT 2,
    rent      REAL    NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    name          TEXT NOT NULL,
    student_no    TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone         TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    room_id       INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token   TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id     INTEGER,
    amount      REAL NOT NULL,
    period      TEXT NOT NULL,
    method      TEXT NOT NULL,
    reference   TEXT NOT NULL DEFAULT '',
    screenshot  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    reviewed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS problems (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id     INTEGER,
    category    TEXT NOT NULL,
    description TEXT NOT NULL,
    photo       TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    admin_note  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rater_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ratee_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (rater_id, ratee_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const get = (sql, ...params) => sqlite.prepare(sql).get(...params);
const all = (sql, ...params) => sqlite.prepare(sql).all(...params);
const run = (sql, ...params) => sqlite.prepare(sql).run(...params);

// First run: create the 24 rooms and default settings.
if (get('SELECT COUNT(*) AS n FROM rooms').n === 0) {
  for (let i = 1; i <= TOTAL_ROOMS; i++) run('INSERT INTO rooms (id) VALUES (?)', i);
}
run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'K')`);
run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('payment_instructions', '')`);

module.exports = { get, all, run, DATA_DIR, TOTAL_ROOMS };
