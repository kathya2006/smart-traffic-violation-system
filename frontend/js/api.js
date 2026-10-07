// API client: detects where the backend lives, keeps the JWT, normalises errors.
const TOKEN_KEY = 'stvrs.token';
let base = '';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
};

const sleepAbort = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };

/** Finds the API: same origin when served by Express, otherwise http://localhost:5000 (Live Server / file://). */
export async function detectApi() {
  const candidates = location.protocol.startsWith('http') ? [location.origin, 'http://localhost:5000'] : ['http://localhost:5000'];
  for (const c of candidates) {
    try {
      const r = await fetch(`${c}/api/health`, { cache: 'no-store', signal: sleepAbort(3500) });
      if (r.status === 200 || r.status === 503) { base = c; return { base: c, healthy: r.status === 200 }; }
    } catch { /* try next */ }
  }
  return { base: null, healthy: false };
}

export const fileUrl = (p) => (p && /^https?:/.test(p) ? p : base + p);

async function request(method, path, { body, form, params, auth = true, blob = false } = {}) {
  let url = base + path;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val !== undefined && val !== null && val !== '') qs.set(k, val);
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const headers = {};
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is the backend running?');
  }
  if (blob && res.ok) return res.blob();
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const e = data && data.error ? data.error : {};
    if (res.status === 401 && auth && path !== '/api/auth/login') window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),
  upload: (path, form, method = 'POST') => request(method, path, { form }),
  login: (body) => request('POST', '/api/auth/login', { body, auth: false }),
  register: (body) => request('POST', '/api/auth/register', { body, auth: false }),
  health: () => request('GET', '/api/health', { auth: false }),
  blob: (path, params) => request('GET', path, { params, blob: true }),
};
