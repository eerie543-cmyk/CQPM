const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(app.getPath('userData'), 'cqpm.db');
let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      username             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash        TEXT    NOT NULL,
      role                 TEXT    NOT NULL CHECK(role IN ('admin','staff')),
      department           TEXT    CHECK(department IN ('serology','molecularBio','microbiology') OR department IS NULL),
      display_name         TEXT    NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parameters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      department    TEXT    NOT NULL CHECK(department IN ('serology','molecularBio','microbiology')),
      name          TEXT    NOT NULL,
      description   TEXT,
      frequency     TEXT    NOT NULL CHECK(frequency IN ('daily','weekly','biweekly','monthly','quarterly','yearly')),
      days_of_week  TEXT,
      day_of_month  INTEGER,
      entry_type    TEXT    NOT NULL DEFAULT 'checkbox' CHECK(entry_type IN ('checkbox','numeric','text')),
      unit          TEXT,
      critical      INTEGER NOT NULL DEFAULT 0,
      active        INTEGER NOT NULL DEFAULT 1,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      parameter_id  INTEGER NOT NULL REFERENCES parameters(id) ON DELETE CASCADE,
      slot_date     TEXT    NOT NULL,
      status        TEXT    NOT NULL CHECK(status IN ('done','late','missed')) DEFAULT 'done',
      value         TEXT,
      notes         TEXT,
      done_by_id    INTEGER NOT NULL REFERENCES users(id),
      done_by_name  TEXT    NOT NULL,
      department    TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parameter_id, slot_date)
    );
  `);

  // Seed default admin
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (count.c === 0) {
    const hash = bcrypt.hashSync('12345', 12);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, department, display_name, must_change_password)
      VALUES ('archit', ?, 'admin', NULL, 'Archit', 0)
    `).run(hash);
  }

  // Seed sample parameters if none exist
  const pCount = db.prepare('SELECT COUNT(*) AS c FROM parameters').get();
  if (pCount.c === 0) seedParameters(db);
}

function seedParameters(db) {
  const insert = db.prepare(`
    INSERT INTO parameters (department, name, description, frequency, days_of_week, entry_type, critical, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const params = [
    ['serology',      'Daily QC Run',           'Run positive & negative controls',        'daily',     null,    'checkbox', 1, 0],
    ['serology',      'Reagent Check',           'Check reagent expiry and lot numbers',    'daily',     null,    'checkbox', 0, 1],
    ['serology',      'Water Bath Temperature',  'Log water bath temp (37°C ± 0.5)',        'daily',     null,    'numeric',  1, 2],
    ['serology',      'Centrifuge Maintenance',  'Weekly centrifuge check',                 'weekly',    '1',     'checkbox', 0, 3],
    ['serology',      'Reagent Lot Validation',  'Validate new lot before use',             'monthly',   null,    'checkbox', 0, 4],

    ['molecularBio',  'PCR Controls',            'Run positive, negative & internal ctrl',  'daily',     null,    'checkbox', 1, 0],
    ['molecularBio',  'Extraction QC',           'Check extraction efficiency',             'daily',     null,    'checkbox', 1, 1],
    ['molecularBio',  'Contamination Check',     'Environmental contamination monitoring',  'weekly',    '1,3,5', 'checkbox', 0, 2],
    ['molecularBio',  'Thermocycler Check',      'Verify thermocycler performance',         'weekly',    '1',     'checkbox', 0, 3],
    ['molecularBio',  'PT Submission',           'External proficiency testing submission', 'quarterly', null,    'checkbox', 0, 4],

    ['microbiology',  'Media QC',                'Quality check on prepared culture media', 'daily',     null,    'checkbox', 1, 0],
    ['microbiology',  'Incubator Temperature',   'Log incubator temp (35–37°C)',            'daily',     null,    'numeric',  1, 1],
    ['microbiology',  'Media Sterility Test',    'Test sterility of prepared media',        'weekly',    '1',     'checkbox', 1, 2],
    ['microbiology',  'Autoclave Validation',    'Validate autoclave cycle',                'weekly',    '1,4',   'checkbox', 0, 3],
    ['microbiology',  'Antibiotic Disc Check',   'Check antibiotic disc potency',           'monthly',   null,    'checkbox', 0, 4],
  ];
  for (const p of params) insert.run(...p);
}

// ── Users ─────────────────────────────────────────────────────────
function findByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}
function listUsers() {
  return getDb().prepare(
    'SELECT id, username, role, department, display_name, created_at FROM users ORDER BY created_at'
  ).all();
}
function insertUser({ username, passwordHash, role, department, displayName, mustChange }) {
  return getDb().prepare(`
    INSERT INTO users (username, password_hash, role, department, display_name, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(username.toLowerCase(), passwordHash, role, department || null, displayName, mustChange ? 1 : 0);
}
function setPasswordHash(userId, hash) {
  getDb().prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, userId);
}
function deleteUser(userId) {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
}

// ── Parameters ────────────────────────────────────────────────────
function listParameters(department) {
  return getDb().prepare(
    'SELECT * FROM parameters WHERE department = ? AND active = 1 ORDER BY sort_order, id'
  ).all(department);
}
function allParameters() {
  return getDb().prepare('SELECT * FROM parameters ORDER BY department, sort_order, id').all();
}
function insertParameter({ department, name, description, frequency, daysOfWeek, dayOfMonth, entryType, unit, critical, sortOrder }) {
  return getDb().prepare(`
    INSERT INTO parameters (department, name, description, frequency, days_of_week, day_of_month, entry_type, unit, critical, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(department, name, description || null, frequency, daysOfWeek || null, dayOfMonth || null, entryType || 'checkbox', unit || null, critical ? 1 : 0, sortOrder || 0);
}
function updateParameter(id, fields) {
  const cols = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  return getDb().prepare(`UPDATE parameters SET ${cols} WHERE id = ?`).run(...Object.values(fields), id);
}
function deleteParameter(id) {
  getDb().prepare('UPDATE parameters SET active = 0 WHERE id = ?').run(id);
}

// ── Entries ───────────────────────────────────────────────────────
function getEntriesForRange(department, fromDate, toDate) {
  return getDb().prepare(`
    SELECT e.* FROM entries e
    JOIN parameters p ON e.parameter_id = p.id
    WHERE p.department = ? AND e.slot_date BETWEEN ? AND ?
    ORDER BY e.slot_date
  `).all(department, fromDate, toDate);
}
function upsertEntry({ parameterId, slotDate, status, value, notes, doneById, doneByName, department }) {
  return getDb().prepare(`
    INSERT INTO entries (parameter_id, slot_date, status, value, notes, done_by_id, done_by_name, department)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(parameter_id, slot_date) DO UPDATE SET
      status = excluded.status, value = excluded.value,
      notes = excluded.notes, done_by_id = excluded.done_by_id,
      done_by_name = excluded.done_by_name, created_at = datetime('now')
  `).run(parameterId, slotDate, status || 'done', value || null, notes || null, doneById, doneByName, department);
}

module.exports = {
  findByUsername, listUsers, insertUser, setPasswordHash, deleteUser,
  listParameters, allParameters, insertParameter, updateParameter, deleteParameter,
  getEntriesForRange, upsertEntry,
};
