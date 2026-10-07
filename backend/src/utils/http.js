class HttpError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, 'BAD_REQUEST', details);
const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg, 'UNAUTHORIZED');
const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg, 'FORBIDDEN');
const notFound = (msg = 'Not found') => new HttpError(404, msg, 'NOT_FOUND');
const conflict = (msg, code = 'CONFLICT', details) => new HttpError(409, msg, code, details);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
