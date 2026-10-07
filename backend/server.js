const config = require('./src/config');
const app = require('./src/app');
const { ping, pool } = require('./src/db');

async function start() {
  console.log('\nSmart Traffic Violation Reporting System');
  console.log(`  connecting to MySQL ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database} ...`);

  try {
    const db = await ping();
    console.log(`  database connected  (${db.version}, ${db.latencyMs} ms, time zone ${db.timezone})`);
  } catch (err) {
    console.error(`\n  Could not connect to the database: ${err.code || ''} ${err.message}`);
    console.error('  - Is MySQL running?   - Did you run  npm run db:setup ?   - Check DB_* values in backend/.env\n');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`  server running on  http://localhost:${config.port}\n`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received - shutting down`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
