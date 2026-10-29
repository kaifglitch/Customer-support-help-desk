const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/agents', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM agents ORDER BY name').all());
});

// Dashboard numbers are computed from saved data on every request
router.get('/dashboard', (req, res) => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = db.prepare(`
    SELECT
      COUNT(*)                                                            AS total,
      COALESCE(SUM(status = 'Open'), 0)                                   AS open,
      COALESCE(SUM(status = 'In Progress'), 0)                            AS inProgress,
      COALESCE(SUM(status = 'Resolved'), 0)                               AS resolved,
      COALESCE(SUM(priority = 'Urgent' AND status != 'Resolved'), 0)      AS urgent,
      COALESCE(SUM(status != 'Resolved' AND created_at < ?), 0)           AS overdue
    FROM tickets`).get(cutoff);
  res.json(row);
});

module.exports = router;
