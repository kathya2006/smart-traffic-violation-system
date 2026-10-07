const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me'))) {
  console.error('FATAL: set a strong JWT_SECRET in .env before running in production.');
  process.exit(1);
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_traffic_db',
    poolSize: Number(process.env.DB_POOL_SIZE) || 10,
    timezone: process.env.DB_TIMEZONE || '+05:30',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  paths: {
    frontend: path.join(__dirname, '..', '..', 'frontend'),
    uploads: path.join(__dirname, '..', 'uploads'),
    database: path.join(__dirname, '..', '..', 'database'),
  },
};
