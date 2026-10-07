/**
 * MySQL connectivity layer: one shared connection pool + helpers.
 *
 *  - pool.query()           -> normal queries (auto acquire / release)
 *  - withTransaction(fn)    -> BEGIN ... COMMIT / ROLLBACK on a dedicated connection
 *  - the session time zone is pinned on every new connection so NOW()/CURDATE()
 *    and JS Date <-> DATETIME conversion always agree (config.db.timezone).
 */
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.poolSize,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4',
  timezone: config.db.timezone,
  decimalNumbers: true,
  dateStrings: false,
  multipleStatements: false,
});

// Pin the session time zone for every connection the pool opens.
pool.pool.on('connection', (conn) => {
  conn.query('SET time_zone = ?', [config.db.timezone]);
});

/** Run fn(conn) inside a transaction. conn.actor(userId, remarks) tags audit-trail rows written by triggers. */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  conn.actor = (userId, remarks = null) => conn.query('SET @actor_user_id = ?, @status_remarks = ?', [userId, remarks]);
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* connection may already be gone */ }
    throw err;
  } finally {
    try { await conn.query('SET @actor_user_id = NULL, @status_remarks = NULL'); } catch (_) { /* ignore */ }
    conn.release();
  }
}

/** Connectivity probe used by /api/health and at start-up. */
async function ping() {
  const started = process.hrtime.bigint();
  const [rows] = await pool.query('SELECT VERSION() AS version, DATABASE() AS db, @@time_zone AS tz, NOW() AS server_time');
  const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { connected: true, latencyMs: Math.round(latencyMs * 10) / 10, version: rows[0].version, database: rows[0].db, timezone: rows[0].tz, serverTime: rows[0].server_time };
}

/** Marks unpaid fines past their due date as Overdue and applies the 10% late fee. */
async function refreshOverdueFines(conn = pool) {
  await conn.query(
    "UPDATE fines SET status = 'Overdue', late_fee = ROUND(amount * 0.10, 2) WHERE status = 'Unpaid' AND due_date < CURDATE()"
  );
}

module.exports = { pool, withTransaction, ping, refreshOverdueFines };
