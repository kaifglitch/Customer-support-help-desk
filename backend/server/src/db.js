const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'supportdesk.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON'); // required so ON DELETE CASCADE works

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,
  customer    TEXT NOT NULL,
  description TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Urgent')),
  status      TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Waiting on Customer','Resolved')),
  assignee_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('reply','note')),
  content    TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  detail     TEXT NOT NULL,
  actor      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_activity_ticket ON activity(ticket_id);
`);

if (db.prepare('SELECT COUNT(*) AS c FROM agents').get().c === 0) {
  const ins = db.prepare('INSERT INTO agents (name) VALUES (?)');
  ['Asha Verma', 'Rohan Mehta', 'Sara Khan'].forEach((n) => ins.run(n));
}

module.exports = db;
