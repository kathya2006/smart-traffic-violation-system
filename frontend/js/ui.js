// UI helpers: safe HTML templating, icons, formatters, toasts, modals, drawers.

// ------------------------------------------------------------------ safe templating
// html`...` escapes every interpolated value unless it came from another html`` call / raw().
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: String(s) });
const isRaw = (v) => v && typeof v === 'object' && RAW in v;

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const part = (v) => {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  return isRaw(v) ? v[RAW] : esc(v);
};
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? part(vals[i]) : ''); });
  return raw(out);
}
export const toHtml = (tpl) => (isRaw(tpl) ? tpl[RAW] : esc(tpl));
export const mount = (el, tpl) => { el.innerHTML = toHtml(tpl); return el; };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
/** Event delegation: on(root, 'click', '[data-act]', (e, el) => ...) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ------------------------------------------------------------------ icons (24px stroke set)
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  report: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  fines: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M7 15h4"/>',
  appeals: '<path d="m14 13-8.4 8.4a2.1 2.1 0 0 1-3-3L11 10"/><path d="m16 16 6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
  vehicle: '<path d="M4 16V11l2-5h12l2 5v5"/><path d="M2.5 16h19v3h-3M5.5 19h-3v-3"/><circle cx="7.5" cy="16" r="1.4"/><circle cx="16.5" cy="16" r="1.4"/><path d="M4 11h16"/>',
  stats: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
  database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  filter: '<path d="M3 5h18l-7 8.5V20l-4-2v-4.5L3 5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9.5"/><path d="m7.8 12.4 3 3 5.6-6.4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.6"/>',
  camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9Z"/><circle cx="12" cy="13" r="3.8"/>',
  car: '<path d="M5 17V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v5"/><path d="M3.5 17h17M7 20.5v-3.5M17 20.5v-3.5"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
  download: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16"/>',
  upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 20h16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  shield: '<path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z"/><path d="m8.8 12 2.4 2.4 4.2-4.8"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
  rupee: '<path d="M6 4h12M6 9h12M9 4c5 0 6.5 2.2 6.5 5S13 14 9 14l7 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10.5v6M14 10.5v6"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 5.6 6.5L3 9m0-5v5h5M4 13a8 8 0 0 0 14.4 4.5L21 15m0 5v-5h-5"/>',
  flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M5 21h14M12 3v2M4.5 7l1.5 1.2M19.5 7 18 8.2M3 12h2M19 12h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-5.8 6.5-5.8s6.5 2.2 6.5 5.8"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.6c2.2.6 3.5 2.4 3.5 5.4"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 17.5 12 22l9-4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
  gavel: '<path d="m14 13-8.4 8.4a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8"/>',
  speed: '<path d="M12 14l4-5"/><circle cx="12" cy="14" r="1.5"/><path d="M3.5 19a9.5 9.5 0 1 1 17 0"/>',
  helmet: '<path d="M4 15a8 8 0 0 1 16 0v3H4v-3Z"/><path d="M4 15h9l3-4"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  doc: '<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  lane: '<path d="M7 21 10 3M17 21 14 3M12 5v3M12 11v3M12 17v3"/>',
  fire: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-3 2-4 4-4.5 6C9 9 8.5 8 8 7c-2 2-3 5-3 8a7 7 0 0 0 7 7Z"/>',
};
export function icon(name, cls = '') {
  return raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`);
}
export const categoryIcon = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('speed')) return 'speed';
  if (n.includes('signal')) return 'lane';
  if (n.includes('parking')) return 'parking';
  if (n.includes('safety')) return 'helmet';
  if (n.includes('document')) return 'doc';
  return 'fire';
};

// ------------------------------------------------------------------ formatters
const nf = new Intl.NumberFormat('en-IN');
export const fmtNum = (n) => nf.format(Math.round(Number(n) || 0));
export const fmtMoney = (n) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n) || 0);
export const fmtCompact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1) + ' K';
  return '₹' + Math.round(n);
};
const dtf = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const df = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (d) => (d ? dtf.format(new Date(d)) : '—');
export const fmtDate = (d) => (d ? df.format(new Date(d)) : '—');
export function timeAgo(d) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
export const slug = (s = '') => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
export const toLocalInput = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };

// ------------------------------------------------------------------ small components
export const statusBadge = (s) => html`<span class="badge st-${slug(s)}">${s}</span>`;
export const priorityBadge = (p) => html`<span class="badge plain pri-${slug(p)}">${p}</span>`;
export function plate(no, size = '') {
  const parts = String(no || '').split(' ');
  return html`<span class="plate ${size}"><span class="ind">IND</span><span class="no">${parts.join(' ')}</span></span>`;
}
export const emptyState = (title, text = '', ic = 'search') => html`<div class="empty">${icon(ic)}<b>${title}</b><span>${text}</span></div>`;
export const skeletonRows = (n = 5, h = 54) => html`${Array.from({ length: n }, () => html`<div class="skeleton" style="height:${h}px;margin-bottom:10px"></div>`)}`;

/** Animated count-up for [data-count] elements. */
export function countUp(root = document) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $$('[data-count]', root).forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const fmt = el.dataset.format === 'money' ? fmtCompact : el.dataset.format === 'raw' ? (v) => String(Math.round(v * 10) / 10) : fmtNum;
    if (reduce || target === 0) { el.textContent = fmt(target); return; }
    const t0 = performance.now(); const dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ------------------------------------------------------------------ toasts
export function toast(message, type = 'info', title) {
  const stack = $('#toasts');
  const ic = type === 'success' ? 'checkCircle' : type === 'error' ? 'alert' : type === 'warn' ? 'alert' : 'info';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = toHtml(html`${icon(ic)}<div><b>${title || ({ success: 'Done', error: 'Something went wrong', warn: 'Heads up', info: 'Notice' }[type])}</b><span>${message}</span></div>`);
  stack.appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  setTimeout(kill, type === 'error' ? 6500 : 4200);
  el.addEventListener('click', kill);
}

// ------------------------------------------------------------------ modal / drawer / lightbox
const overlay = () => $('#overlay-root');

/** openModal({ title, icon, body, actions:[{label, cls, onClick(close, btn)}], size }) -> { el, close } */
export function openModal({ title, icon: ic, lead, body, actions = [], size = '', onOpen, onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  const box = document.createElement('div');
  box.className = `modal glass electric ${size}`;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = toHtml(html`
    ${title ? html`<h3>${ic ? icon(ic) : ''}${title}</h3>` : ''}
    ${lead ? html`<p class="lead">${lead}</p>` : ''}
    <div class="modal-body">${body}</div>
    ${actions.length ? html`<div class="modal-actions">${actions.map((a, i) => html`<button type="button" class="btn ${a.cls || 'ghost'}" data-i="${i}">${a.label}</button>`)}</div>` : ''}`);
  wrap.appendChild(box);
  overlay().append(backdrop, wrap);
  requestAnimationFrame(() => { backdrop.classList.add('show'); box.classList.add('show'); });

  let closed = false;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('show'); box.classList.remove('show');
    setTimeout(() => { backdrop.remove(); wrap.remove(); }, 300);
    if (onClose) onClose();
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  on(box, 'click', '.modal-actions [data-i]', (_e, btn) => {
    const a = actions[Number(btn.dataset.i)];
    if (a && a.onClick) a.onClick(close, btn, box);
    else close();
  });
  const first = $('input:not([type=hidden]), textarea, select', box);
  if (first) setTimeout(() => first.focus(), 120);
  if (onOpen) onOpen(box, close);
  return { el: box, close };
}

/** Prompt for a piece of text (reason / remarks). Resolves with the text or null when cancelled. */
export function promptText({ title, icon: ic = 'info', lead, label, placeholder = '', required = true, min = 0, confirm = 'Confirm', cls = 'primary', multiline = true, extra = '' }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    openModal({
      title, icon: ic, lead,
      body: html`<div class="field"><label class="label">${label}${required ? html` <span class="req">*</span>` : ''}</label>
        ${multiline ? html`<textarea class="textarea" rows="4" placeholder="${placeholder}"></textarea>` : html`<input class="input" placeholder="${placeholder}">`}
        <span class="error-text" hidden></span></div>${extra ? raw(extra) : ''}`,
      onClose: () => settle(null),
      actions: [
        { label: 'Cancel', cls: 'ghost', onClick: (close) => close() },
        { label: confirm, cls, onClick: (close, _b, box) => {
          const field = $('.textarea, .input', box);
          const v = field.value.trim();
          const err = $('.error-text', box);
          if ((required && !v) || v.length < min) {
            err.hidden = false; err.textContent = min ? `Please enter at least ${min} characters.` : 'This field is required.'; field.classList.add('invalid'); return;
          }
          settle(v); close();
        } },
      ],
    });
  });
}

export function confirmDialog({ title, lead, confirm = 'Confirm', cls = 'primary', icon: ic = 'alert' }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    openModal({
      title, icon: ic, lead, body: '',
      onClose: () => settle(false),
      actions: [
        { label: 'Cancel', cls: 'ghost', onClick: (close) => close() },
        { label: confirm, cls, onClick: (close) => { settle(true); close(); } },
      ],
    });
  });
}

/** Slide-in drawer from the right. Returns { el, body, close, setFoot }. */
export function openDrawer({ onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.innerHTML = '<div class="drawer-head"></div><div class="drawer-body"></div><div class="drawer-foot hide"></div>';
  overlay().append(backdrop, drawer);
  requestAnimationFrame(() => { backdrop.classList.add('show'); drawer.classList.add('show'); });
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-wrap') && !document.querySelector('.lightbox')) close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('show'); drawer.classList.remove('show');
    setTimeout(() => { backdrop.remove(); drawer.remove(); }, 420);
    if (onClose) onClose();
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);
  return {
    el: drawer, close,
    head: $('.drawer-head', drawer), body: $('.drawer-body', drawer),
    foot: $('.drawer-foot', drawer),
  };
}

export function openLightbox(src, mime = '') {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = mime.startsWith('video') ? `<video src="${esc(src)}" controls autoplay></video>` : `<img src="${esc(src)}" alt="Evidence">`;
  const close = () => { lb.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  lb.addEventListener('click', close);
  overlay().appendChild(lb);
}

/** Button helper: shows a spinner while the async fn runs. */
export async function withBusy(btn, fn) {
  btn.classList.add('is-loading');
  try { return await fn(); } finally { btn.classList.remove('is-loading'); }
}

export function errorMessage(e) { return e && e.message ? e.message : 'Unexpected error'; }
