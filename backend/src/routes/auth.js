const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const v = require('../utils/validate');
const { badRequest, unauthorized, forbidden, conflict } = require('../utils/http');

const router = express.Router();

const publicUser = (u) => ({
  id: u.user_id ?? u.id,
  name: u.full_name ?? u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  officer: (u.officer_id ?? u.officerId) ? {
    officerId: u.officer_id ?? u.officerId, badge: u.badge_number ?? u.badge, rank: u.rank_title ?? u.rank, station: u.station_name ?? u.station,
  } : null,
  createdAt: u.created_at ?? u.createdAt,
  lastLoginAt: u.last_login_at ?? u.lastLoginAt,
});

router.post('/register', async (req, res) => {
  const full_name = v.str(req.body.full_name, 'Full name', { min: 2, max: 120 });
  const email = v.email(req.body.email);
  const phone = v.phone(req.body.phone);
  const pass = v.password(req.body.password);

  const [exists] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
  if (exists.length) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const hash = await bcrypt.hash(pass, 10);
  const [r] = await pool.query(
    "INSERT INTO users (full_name, email, phone, password_hash, role, last_login_at) VALUES (?, ?, ?, ?, 'citizen', NOW())",
    [full_name, email, phone, hash]
  );
  const [rows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
});

router.post('/login', async (req, res) => {
  const email = v.email(req.body.email);
  const pass = v.str(req.body.password, 'Password', { max: 72 });

  const [rows] = await pool.query(
    `SELECT u.*, o.officer_id, o.badge_number, o.rank_title, ps.station_name
       FROM users u
       LEFT JOIN officers o ON o.user_id = u.user_id
       LEFT JOIN police_stations ps ON ps.station_id = o.station_id
      WHERE u.email = ?`,
    [email]
  );
  const u = rows[0];
  const ok = u && (await bcrypt.compare(pass, u.password_hash));
  if (!ok) throw unauthorized('Incorrect email or password');
  if (!u.is_active) throw forbidden('This account has been deactivated');

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE user_id = ?', [u.user_id]);
  res.json({ token: signToken(u), user: publicUser(u) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/me', requireAuth, async (req, res) => {
  const full_name = v.str(req.body.full_name, 'Full name', { min: 2, max: 120 });
  const phone = v.phone(req.body.phone);
  await pool.query('UPDATE users SET full_name = ?, phone = ? WHERE user_id = ?', [full_name, phone, req.user.id]);
  res.json({ user: publicUser({ ...req.user, name: full_name, phone }) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const current = v.str(req.body.current_password, 'Current password', { max: 72 });
  const next = v.password(req.body.new_password);
  if (current === next) throw badRequest('New password must be different from the current one');
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) throw unauthorized('Current password is incorrect');
  await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [await bcrypt.hash(next, 10), req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
