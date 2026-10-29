const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const Database = require('better-sqlite3');

describe('Support Desk API', () => {
  let server;
  let tempDir;
  let dbPath;
  let baseUrl;
  let db;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'support-desk-test-'));
    dbPath = path.join(tempDir, 'test.db');
    const portServer = net.createServer();
    await new Promise((resolve, reject) => {
      portServer.once('error', reject);
      portServer.listen(0, '127.0.0.1', resolve);
    });
    const { port } = portServer.address();
    await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));

    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['src/index.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DB_PATH: dbPath, PORT: String(port) },
      stdio: 'ignore',
    });

    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`API server exited with code ${server.exitCode}`);
      try {
        const response = await fetch(`${baseUrl}/api/dashboard`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assert.equal(ready, true, 'API server did not become ready');
    db = new Database(dbPath);
  });

  after(async () => {
    if (db) db.close();
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates required fields and creates tickets', async () => {
    const invalid = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer: 'Example Customer', description: 'Help needed' }),
    });
    assert.equal(invalid.status, 400);
    const invalidBody = await invalid.json();
    assert.equal(invalidBody.error, 'Validation failed');
    assert.ok(invalidBody.details.subject);

    const created = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test ticket',
        customer: 'Example Customer',
        description: 'Help needed',
      }),
    });
    assert.equal(created.status, 201);
    const ticket = await created.json();
    assert.ok(ticket.id);
    return ticket.id;
  });

  it('logs status, priority, and assignee changes', async () => {
    const ticket = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json())
      .then((tickets) => tickets[0]);
    const agents = await fetch(`${baseUrl}/api/agents`).then((response) => response.json());
    const response = await fetch(`${baseUrl}/api/tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'In Progress',
        priority: 'Urgent',
        assignee_id: agents[0].id,
      }),
    });
    assert.equal(response.status, 200);
    const history = await fetch(`${baseUrl}/api/tickets/${ticket.id}`)
      .then((result) => result.json());
    assert.deepEqual(
      history.activity.map((entry) => entry.type).filter((type) => type !== 'created'),
      ['status', 'priority', 'assignee'],
    );
    assert.equal(history.status, 'In Progress');
    assert.equal(history.priority, 'Urgent');
    assert.equal(history.assignee_id, agents[0].id);
  });

  it('accepts replies and notes and rejects other comment types', async () => {
    const ticket = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json())
      .then((tickets) => tickets[0]);
    for (const type of ['reply', 'note']) {
      const response = await fetch(`${baseUrl}/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, content: `Test ${type}`, author: 'Test Agent' }),
      });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).type, type);
    }
    const invalid = await fetch(`${baseUrl}/api/tickets/${ticket.id}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'other', content: 'Invalid', author: 'Test Agent' }),
    });
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.json()).details.type);
  });

  it('calculates overdue and dashboard counts, excluding resolved tickets', async () => {
    const ticket = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json())
      .then((tickets) => tickets[0]);
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`
      INSERT INTO tickets (subject, customer, description, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Urgent', 'Open', ?, ?)
    `).run('Old ticket', 'Example Customer', 'Overdue test', old, old);
    const overdueId = Number(result.lastInsertRowid);

    let oldTicket = await fetch(`${baseUrl}/api/tickets/${overdueId}`).then((response) => response.json());
    assert.equal(oldTicket.overdue, true);

    let dashboard = await fetch(`${baseUrl}/api/dashboard`).then((response) => response.json());
    assert.deepEqual(dashboard, {
      total: 2,
      open: 1,
      inProgress: 1,
      resolved: 0,
      urgent: 2,
      overdue: 1,
    });

    const resolved = await fetch(`${baseUrl}/api/tickets/${overdueId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Resolved' }),
    });
    assert.equal(resolved.status, 200);
    oldTicket = await fetch(`${baseUrl}/api/tickets/${overdueId}`).then((response) => response.json());
    assert.equal(oldTicket.overdue, false);

    dashboard = await fetch(`${baseUrl}/api/dashboard`).then((response) => response.json());
    const savedCounts = db.prepare(`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(status = 'Open'), 0) AS open,
        COALESCE(SUM(status = 'In Progress'), 0) AS inProgress,
        COALESCE(SUM(status = 'Resolved'), 0) AS resolved,
        COALESCE(SUM(priority = 'Urgent' AND status != 'Resolved'), 0) AS urgent,
        COALESCE(SUM(status != 'Resolved' AND created_at < ?), 0) AS overdue
      FROM tickets
    `).get(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    assert.deepEqual(dashboard, savedCounts);
    assert.deepEqual(dashboard, {
      total: 2,
      open: 0,
      inProgress: 1,
      resolved: 1,
      urgent: 1,
      overdue: 0,
    });

    const resolvedDelete = await fetch(`${baseUrl}/api/tickets/${overdueId}`, { method: 'DELETE' });
    assert.equal(resolvedDelete.status, 204);
    assert.ok(ticket.id);
  });

  it('returns 404 for missing tickets and cascades ticket deletion', async () => {
    const missing = await fetch(`${baseUrl}/api/tickets/9999`);
    assert.equal(missing.status, 404);
    const ticket = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json())
      .then((tickets) => tickets[0]);

    const deleted = await fetch(`${baseUrl}/api/tickets/${ticket.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM comments WHERE ticket_id=?').get(ticket.id).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM activity WHERE ticket_id=?').get(ticket.id).count, 0);
  });
});
