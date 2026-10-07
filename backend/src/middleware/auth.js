const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');
const { unauthorized, forbidden } = require('../utils/http');

function signToken(user) {
  return jwt.sign({ sub: user.user_id, role: user.role }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

/** Verifies the bearer token and loads the *current* user row (so deactivation / role changes apply immediately). */
async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw unauthorized('Session expired, please sign in again');
  }

  const [rows] = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at, u.last_login_at,
            o.officer_id, o.badge_number, o.rank_title, ps.station_name
       FROM users u
       LEFT JOIN officers o ON o.user_id = u.user_id
       LEFT JOIN police_stations ps ON ps.station_id = o.station_id
      WHERE u.user_id = ?`,
    [payload.sub]
  );
  const u = rows[0];
  if (!u || !u.is_active) throw unauthorized('Account not available');

  req.user = {
    id: u.user_id, name: u.full_name, email: u.email, phone: u.phone, role: u.role,
    officerId: u.officer_id || null, badge: u.badge_number || null, rank: u.rank_title || null, station: u.station_name || null,
    createdAt: u.created_at, lastLoginAt: u.last_login_at,
  };
  next();
}

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw forbidden();
  next();
};

const isStaff = (user) => user.role === 'officer' || user.role === 'admin';

module.exports = { signToken, requireAuth, requireRole, isStaff };
