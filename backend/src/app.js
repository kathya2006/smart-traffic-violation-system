const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { ping } = require('./db');
const { notFoundHandler, errorHandler } = require('./middleware/errors');

const app = express();
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'script-src-attr': ["'none'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'media-src': ["'self'", 'blob:'],
      'connect-src': ["'self'", 'http://localhost:*', 'http://127.0.0.1:*'],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : undefined));
app.use(compression());
app.use(express.json({ limit: '200kb' }));

// ---- health (public) : proves the API and the database are both alive
app.get('/api/health', async (_req, res) => {
  try {
    const db = await ping();
    res.json({ status: 'ok', uptime: Math.round(process.uptime()), db });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: { connected: false, error: err.code || err.message } });
  }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again in a few minutes' } } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/meta', require('./routes/meta'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/violations', require('./routes/violations'));
const { finesRouter, paymentsRouter } = require('./routes/fines');
app.use('/api/fines', finesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/appeals', require('./routes/appeals'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));

// ---- uploaded evidence (images / video only, never executed)
app.use('/uploads', express.static(config.paths.uploads, {
  index: false, maxAge: config.isProd ? '7d' : 0,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  },
}));

// ---- the front-end (static)
app.use(express.static(config.paths.frontend, { maxAge: config.isProd ? '1h' : 0 }));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
