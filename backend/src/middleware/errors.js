const multer = require('multer');
const config = require('../config');
const { HttpError } = require('../utils/http');

function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No such endpoint: ${req.method} ${req.path}` } });
  }
  next();
}

// Translates MySQL / multer / app errors into clean JSON responses.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'SERVER_ERROR';
  let message = 'Something went wrong on the server';
  let details;

  if (err instanceof HttpError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof multer.MulterError) {
    status = 400; code = 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Each evidence file must be 8 MB or smaller'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'You can attach up to 4 evidence files' : err.message;
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400; code = 'BAD_JSON'; message = 'Request body is not valid JSON';
  } else if (err && err.code === 'ER_DUP_ENTRY') {
    status = 409; code = 'DUPLICATE'; message = 'That record already exists';
  } else if (err && (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2')) {
    status = 409; code = 'REFERENCE_ERROR'; message = 'This record is linked to other data and cannot be changed that way';
  } else if (err && err.sqlState === '45000') {
    status = 400; code = 'RULE_VIOLATION'; message = err.sqlMessage || err.message; // raised by DB triggers (SIGNAL)
  } else if (err && ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ENOTFOUND'].includes(err.code)) {
    status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'The database is not reachable right now';
  }

  if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  if (status >= 500 && !config.isProd && err && err.message) body.error.debug = err.message;
  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
