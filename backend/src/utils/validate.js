const { badRequest } = require('./http');

function str(value, name, { min = 0, max = 255, required = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  const s = String(value).trim();
  if (s.length < min) throw badRequest(`${name} must be at least ${min} characters`);
  if (s.length > max) throw badRequest(`${name} must be at most ${max} characters`);
  return s;
}

function int(value, name, { min = 1, max = 2147483647, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${name} is required`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${name} must be a whole number between ${min} and ${max}`);
  return n;
}

function oneOf(value, name, allowed, { required = true, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required && fallback === null) throw badRequest(`${name} is required`);
    return fallback;
  }
  if (!allowed.includes(value)) throw badRequest(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function email(value, name = 'Email') {
  const s = str(value, name, { max: 150 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw badRequest(`${name} is not a valid email address`);
  return s;
}

function phone(value, name = 'Phone', { required = false } = {}) {
  const s = str(value, name, { required, max: 20 });
  if (s === null) return null;
  if (!/^[+0-9][0-9\s-]{6,18}$/.test(s)) throw badRequest(`${name} is not a valid phone number`);
  return s;
}

function password(value) {
  const s = str(value, 'Password', { min: 8, max: 72 });
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) throw badRequest('Password must contain at least one letter and one number');
  return s;
}

function dateTime(value, name) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw badRequest(`${name} is not a valid date/time`);
  return d;
}

function bool(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

/** Indian registration number -> canonical "TN 09 AB 1234". */
function plate(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = raw.match(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{4})$/);
  if (!m) throw badRequest('Enter a valid registration number, e.g. TN 09 AB 1234');
  return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
}

module.exports = { str, int, oneOf, email, phone, password, dateTime, bool, plate };
