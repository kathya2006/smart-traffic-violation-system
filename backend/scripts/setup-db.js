/**
 * Creates the database, tables, views, triggers and loads the demo data.
 *
 *   npm run db:setup           -> create + seed (refuses if the DB already holds violations)
 *   npm run db:reset           -> drop everything and rebuild (same as --force)
 *   node scripts/setup-db.js --no-seed   -> schema only
 *
 * Reads connection details from backend/.env  (see .env.example).
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const NO_SEED = args.has('--no-seed');

/** Splits a SQL script into statements, honouring `DELIMITER` lines used for triggers / procedures. */
function splitStatements(script) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!buffer && (trimmed === '' || trimmed.startsWith('--'))) continue;
    const dm = trimmed.match(/^DELIMITER\s+(\S+)$/i);
    if (dm && !buffer) { delimiter = dm[1]; continue; }
    buffer += (buffer ? '\n' : '') + line;
    if (line.endsWith(delimiter)) {
      statements.push(buffer.slice(0, buffer.length - delimiter.length).trim());
      buffer = '';
    }
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

async function runScript(conn, file, label) {
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql).filter((s) => !/^(CREATE DATABASE|USE)\b/i.test(s));
  let done = 0;
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      console.error(`\n  x ${label}: statement #${done + 1} failed\n    ${err.code || ''} ${err.message}\n    ${stmt.slice(0, 160).replace(/\s+/g, ' ')}...`);
      throw err;
    }
    done++;
  }
  console.log(`  ok ${label}: ${done} statements`);
}

(async () => {
  const { host, port, user, password, database, timezone } = config.db;
  console.log(`\nSmart Traffic - database setup\n  server   : ${user}@${host}:${port}\n  database : ${database}\n`);

  let conn;
  try {
    conn = await mysql.createConnection({ host, port, user, password, timezone, multipleStatements: false, charset: 'utf8mb4' });
  } catch (err) {
    console.error(`Could not connect to MySQL: ${err.code || ''} ${err.message}`);
    console.error('Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD in backend/.env and make sure the MySQL server is running.');
    process.exit(1);
  }

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${database}\``);
    await conn.query('SET time_zone = ?', [timezone]);

    // Safety: never wipe a database that already contains data unless --force.
    const [t] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'violations'", [database]);
    if (t[0].n > 0 && !FORCE) {
      const [c] = await conn.query('SELECT COUNT(*) AS n FROM violations');
      if (c[0].n > 0) {
        console.error(`Database "${database}" already contains ${c[0].n} violations.\nRe-run with  npm run db:reset  (or --force) if you really want to wipe and rebuild it.`);
        process.exit(2);
      }
    }

    await runScript(conn, path.join(config.paths.database, 'schema.sql'), 'schema.sql');
    if (!NO_SEED) await runScript(conn, path.join(config.paths.database, 'seed.sql'), 'seed.sql');

    const [tables] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'", [database]);
    console.log(`\nDone. ${tables[0].n} tables created${NO_SEED ? '' : ' and demo data loaded'}.`);
    if (!NO_SEED) {
      console.log('\nDemo logins');
      console.log('  admin    admin@stvrs.in    / Admin@123');
      console.log('  officer  officer@stvrs.in  / Officer@123');
      console.log('  citizen  citizen@stvrs.in  / Citizen@123');
    }
    console.log('\nStart the app with:  npm start   ->  http://localhost:' + config.port + '\n');
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
