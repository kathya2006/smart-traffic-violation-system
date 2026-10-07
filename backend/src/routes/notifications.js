const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const v = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT notification_id, violation_id, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 30',
    [req.user.id]);
  const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ data: rows, unread });
});

router.post('/read-all', async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  const id = v.int(req.params.id, 'Notification id');
  await pool.query('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?', [id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
