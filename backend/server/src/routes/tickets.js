const express = require('express');
const db = require('../db');

const router = express.Router();
const STATUSES = ['Open', 'In Progress', 'Waiting on Customer', 'Resolved'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

const now = () => new Date().toISOString();
const cutoff = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const bad = (res, error, details) => res.status(400).json({ error, details });

const SELECT = `SELECT t.*, a.name AS assignee_name
                FROM tickets t LEFT JOIN agents a ON a.id = t.assignee_id`;

const withOverdue = (t, c = cutoff()) => ({
  ...t,
  overdue: t.status !== 'Resolved' && t.created_at < c, // business rule: >24h old and not resolved
});

const log = (ticketId, type, detail, actor) =>
  db.prepare('INSERT INTO activity (ticket_id, type, detail, actor, created_at) VALUES (?,?,?,?,?)')
    .run(ticketId, type, detail, actor || 'System', now());

const agentName = (id) => (id ? db.prepare('SELECT name FROM agents WHERE id=?').get(id)?.name : 'Unassigned');

// validate "id" param once for every :id route
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return bad(res, 'Invalid ticket id');
  const ticket = db.prepare(`${SELECT} WHERE t.id = ?`).get(Number(id));
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  req.ticket = ticket;
  next();
});

// validate fields; `partial` = PATCH (only validate fields that are present)
function validate(body, partial) {
  const errors = {};
  const clean = {};
  for (const f of ['subject', 'customer', 'description']) {
    if (body[f] === undefined && partial) continue;
    const v = typeof body[f] === 'string' ? body[f].trim() : '';
    if (!v) errors[f] = `${f} is required`;
    else if (f === 'subject' && v.length > 200) errors[f] = 'subject must be at most 200 characters';
    else clean[f] = v;
  }
  if (body.priority !== undefined || !partial) {
    const p = body.priority ?? 'Medium';
    if (!PRIORITIES.includes(p)) errors.priority = `priority must be one of: ${PRIORITIES.join(', ')}`;
    else clean.priority = p;
  }
  if (body.status !== undefined || !partial) {
    const s = body.status ?? 'Open';
    if (!STATUSES.includes(s)) errors.status = `status must be one of: ${STATUSES.join(', ')}`;
    else clean.status = s;
  }
  if (body.assignee_id !== undefined) {
    if (body.assignee_id === null || body.assignee_id === '') clean.assignee_id = null;
    else if (!db.prepare('SELECT 1 FROM agents WHERE id=?').get(Number(body.assignee_id)))
      errors.assignee_id = 'assignee does not exist';
    else clean.assignee_id = Number(body.assignee_id);
  }
  return { errors, clean };
}

// LIST with search, filters, sorting
router.get('/', (req, res) => {
  const { q, status, priority, assignee, sort } = req.query;
  const where = [];
  const params = [];
  if (q && q.trim()) {
    where.push('(t.subject LIKE ? OR t.customer LIKE ?)');
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }
  if (status) {
    if (!STATUSES.includes(status)) return bad(res, 'Invalid status filter');
    where.push('t.status = ?'); params.push(status);
  }
  if (priority) {
    if (!PRIORITIES.includes(priority)) return bad(res, 'Invalid priority filter');
    where.push('t.priority = ?'); params.push(priority);
  }
  if (assignee === 'unassigned') where.push('t.assignee_id IS NULL');
  else if (assignee) {
    if (!/^\d+$/.test(assignee)) return bad(res, 'Invalid assignee filter');
    where.push('t.assignee_id = ?'); params.push(Number(assignee));
  }
  const order = sort === 'priority'
    ? "CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, t.updated_at DESC"
    : 't.updated_at DESC';
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`;
  const c = cutoff();
  res.json(db.prepare(sql).all(...params).map((t) => withOverdue(t, c)));
});

// CREATE
router.post('/', (req, res) => {
  const { errors, clean } = validate(req.body || {}, false);
  if (Object.keys(errors).length) return bad(res, 'Validation failed', errors);
  const actor = req.body.actor || 'System';
  const ts = now();
  const create = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO tickets (subject, customer, description, priority, status, assignee_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(clean.subject, clean.customer, clean.description, clean.priority, clean.status, clean.assignee_id ?? null, ts, ts);
    const id = info.lastInsertRowid;
    log(id, 'created', `Ticket created (${clean.priority}, ${clean.status})`, actor);
    if (clean.assignee_id) log(id, 'assignee', `Assigned to ${agentName(clean.assignee_id)}`, actor);
    return id;
  });
  const id = create();
  res.status(201).json(withOverdue(db.prepare(`${SELECT} WHERE t.id=?`).get(id)));
});

// DETAIL (ticket + replies/notes + history, chronological)
router.get('/:id', (req, res) => {
  const id = req.ticket.id;
  res.json({
    ...withOverdue(req.ticket),
    comments: db.prepare('SELECT * FROM comments WHERE ticket_id=? ORDER BY created_at, id').all(id),
    activity: db.prepare('SELECT * FROM activity WHERE ticket_id=? ORDER BY created_at, id').all(id),
  });
});

// UPDATE
router.patch('/:id', (req, res) => {
  const body = req.body || {};
  const { errors, clean } = validate(body, true);
  if (Object.keys(errors).length) return bad(res, 'Validation failed', errors);
  const old = req.ticket;
  const actor = body.actor || 'System';

  const changes = Object.keys(clean).filter((k) => clean[k] !== old[k]);
  if (!changes.length) return res.json(withOverdue(old));

  db.transaction(() => {
    const sets = changes.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE tickets SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...changes.map((k) => clean[k]), now(), old.id);
    if (changes.includes('status')) log(old.id, 'status', `Status changed from ${old.status} to ${clean.status}`, actor);
    if (changes.includes('priority')) log(old.id, 'priority', `Priority changed from ${old.priority} to ${clean.priority}`, actor);
    if (changes.includes('assignee_id'))
      log(old.id, 'assignee', `Assignee changed from ${agentName(old.assignee_id)} to ${agentName(clean.assignee_id)}`, actor);
    const fields = changes.filter((k) => ['subject', 'customer', 'description'].includes(k));
    if (fields.length) log(old.id, 'edited', `Edited ${fields.join(', ')}`, actor);
  })();

  res.json(withOverdue(db.prepare(`${SELECT} WHERE t.id=?`).get(old.id)));
});

// ADD REPLY / INTERNAL NOTE
router.post('/:id/comments', (req, res) => {
  const { type, content, author } = req.body || {};
  const errors = {};
  if (!['reply', 'note'].includes(type)) errors.type = "type must be 'reply' or 'note'";
  if (!content || !String(content).trim()) errors.content = 'content is required';
  if (!author || !String(author).trim()) errors.author = 'author is required';
  if (Object.keys(errors).length) return bad(res, 'Validation failed', errors);

  const ts = now();
  const id = req.ticket.id;
  const result = db.transaction(() => {
    const info = db.prepare('INSERT INTO comments (ticket_id,type,content,author,created_at) VALUES (?,?,?,?,?)')
      .run(id, type, String(content).trim(), String(author).trim(), ts);
    db.prepare('UPDATE tickets SET updated_at=? WHERE id=?').run(ts, id);
    log(id, type, type === 'reply' ? 'Public reply added' : 'Internal note added', author);
    return db.prepare('SELECT * FROM comments WHERE id=?').get(info.lastInsertRowid);
  })();
  res.status(201).json(result);
});

// DELETE — policy: cascade-delete comments and history (FK ON DELETE CASCADE), so nothing is orphaned
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tickets WHERE id=?').run(req.ticket.id);
  res.status(204).end();
});

module.exports = router;
