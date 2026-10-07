const express = require('express');
const { pool } = require('../db');
const config = require('../config');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('officer', 'admin'));

// Live introspection of the connected MySQL schema - powers the "Database" screen.
router.get('/database', async (_req, res) => {
  const [[info]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS name, @@time_zone AS timezone, NOW() AS server_time, @@character_set_database AS charset');
  const [status] = await pool.query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Questions')");
  const st = Object.fromEntries(status.map((r) => [r.Variable_name, Number(r.Value)]));

  const [tableMeta] = await pool.query(
    `SELECT table_name AS name, engine, data_length AS data_bytes, index_length AS index_bytes
       FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const [colCounts] = await pool.query(
    'SELECT table_name AS name, COUNT(*) AS columns_count FROM information_schema.columns WHERE table_schema = DATABASE() GROUP BY table_name');
  const colMap = Object.fromEntries(colCounts.map((c) => [c.name, c.columns_count]));
  const tables = [];
  for (const t of tableMeta) { // exact row counts (table_rows is only an estimate for InnoDB)
    const [[c]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${t.name.replace(/`/g, '')}\``);
    tables.push({ name: t.name, engine: t.engine, rows: c.n, columns: colMap[t.name] || 0, size_kb: Math.round(((Number(t.data_bytes) + Number(t.index_bytes)) / 1024) * 10) / 10 });
  }

  const [foreignKeys] = await pool.query(
    `SELECT table_name AS child_table, column_name AS child_column, referenced_table_name AS parent_table,
            referenced_column_name AS parent_column, constraint_name
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL ORDER BY table_name, constraint_name`);
  const [views] = await pool.query('SELECT table_name AS name FROM information_schema.views WHERE table_schema = DATABASE() ORDER BY table_name');
  const [triggers] = await pool.query(
    `SELECT trigger_name AS name, action_timing AS timing, event_manipulation AS event, event_object_table AS on_table
       FROM information_schema.triggers WHERE trigger_schema = DATABASE() ORDER BY event_object_table, trigger_name`);
  const [routines] = await pool.query(
    'SELECT routine_name AS name, routine_type AS type FROM information_schema.routines WHERE routine_schema = DATABASE() ORDER BY routine_name');

  let poolInfo = { limit: config.db.poolSize };
  try {
    const p = pool.pool;
    poolInfo = { limit: config.db.poolSize, open: p._allConnections.length, idle: p._freeConnections.length, queued: p._connectionQueue.length };
  } catch (_) { /* internal fields differ between driver versions */ }

  res.json({
    server: { host: config.db.host, port: config.db.port, user: config.db.user, ...info, uptime_seconds: st.Uptime, threads_connected: st.Threads_connected, queries: st.Questions },
    pool: poolInfo,
    tables, foreignKeys, views, triggers, routines,
    totals: { tables: tables.length, rows: tables.reduce((s, t) => s + t.rows, 0), foreignKeys: foreignKeys.length, views: views.length, triggers: triggers.length, routines: routines.length },
  });
});

module.exports = router;
