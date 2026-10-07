import { api, session, detectApi } from './api.js';
import { $, $$, html, mount, icon, on, toast, initials, timeAgo, errorMessage, withBusy, raw } from './ui.js';
import { startFx, strike } from './fx.js';
import { initCharts, destroyCharts } from './charts.js';
import { state, isStaff } from './state.js';

// ------------------------------------------------------------------ navigation model
const NAV = [
  { id: 'dashboard', icon: 'dashboard', label: () => 'Dashboard', title: 'Command Center', sub: () => (isStaff() ? 'Live overview of violations, fines and enforcement' : 'Your reports and a quick view of road-safety activity'), load: () => import('./pages/dashboard.js') },
  { id: 'report', icon: 'report', label: () => 'Report Violation', title: 'Report a Violation', sub: () => 'Capture the offence, add evidence and submit it for verification', load: () => import('./pages/report.js') },
  { id: 'violations', icon: 'list', label: () => (isStaff() ? 'Violations' : 'My Reports'), title: () => (isStaff() ? 'Violations' : 'My Reports'), sub: () => (isStaff() ? 'Search, review, verify and manage every reported violation' : 'Track the violations you have reported'), load: () => import('./pages/violations.js') },
  { id: 'fines', icon: 'fines', label: () => (isStaff() ? 'Fines & Payments' : 'Pay Fines'), title: () => (isStaff() ? 'Fines & Payments' : 'Pay a Fine'), sub: () => (isStaff() ? 'Outstanding, overdue and settled fines' : 'Look up a vehicle by registration number and pay its challans'), load: () => import('./pages/fines.js') },
  { id: 'appeals', icon: 'appeals', label: () => 'Appeals', title: 'Appeals', sub: () => (isStaff() ? 'Review owner disputes and decide the outcome' : 'Contest a violation you believe was issued in error'), load: () => import('./pages/appeals.js') },
  { id: 'vehicles', icon: 'vehicle', label: () => (isStaff() ? 'Vehicle Registry' : 'Vehicle Lookup'), title: () => (isStaff() ? 'Vehicle Registry' : 'Vehicle Lookup'), sub: () => 'Registration, document validity and complete offence history', load: () => import('./pages/vehicles.js') },
  { id: 'statistics', icon: 'stats', label: () => 'Statistics', title: 'Statistics & Insights', sub: () => 'Trends, hotspots, peak hours and revenue', roles: ['officer', 'admin'], load: () => import('./pages/statistics.js') },
  { id: 'database', icon: 'database', label: () => 'Database', title: 'Database & ER Diagram', sub: () => 'Live MySQL connection, relational schema and entity-relationship diagram', roles: ['officer', 'admin'], load: () => import('./pages/database.js') },
  { id: 'profile', icon: 'user', label: () => 'My Profile', title: 'My Profile', sub: () => 'Account details and security', load: () => import('./pages/profile.js') },
];
const val = (v) => (typeof v === 'function' ? v() : v);
const navFor = () => NAV.filter((n) => !n.roles || n.roles.includes(state.user.role));

let currentDestroy = null;
let healthTimer = null;
let badgeTimer = null;

// ------------------------------------------------------------------ boot
async function boot() {
  startFx();
  initCharts();
  const found = await detectApi();
  const bootEl = $('#boot');
  const hideBoot = () => setTimeout(() => bootEl.classList.add('done'), 350);

  if (!found.base) { renderOffline('The web server is not reachable.', 'Start it with:  cd backend && npm start'); hideBoot(); return; }
  if (!found.healthy) {
    let msg = 'The server is running, but it cannot reach the MySQL database.';
    try { const h = await api.health(); msg += ` (${h.db && h.db.error ? h.db.error : 'connection failed'})`; } catch (e) { msg += ` (${errorMessage(e)})`; }
    renderOffline(msg, 'Check DB_* in backend/.env and run:  npm run db:setup');
    hideBoot(); return;
  }

  window.addEventListener('auth:expired', () => { if (state.user) { toast('Your session expired. Please sign in again.', 'warn'); logout(); } });

  if (session.token) {
    try {
      const { user } = await api.get('/api/auth/me');
      state.user = user;
      await enterApp();
      hideBoot();
      return;
    } catch { session.token = null; }
  }
  renderLogin();
  hideBoot();
}

function renderOffline(message, hint) {
  mount($('#root'), html`
    <div class="auth" style="grid-template-columns:1fr;justify-items:center">
      <div class="glass electric auth-card" style="text-align:center">
        <div class="boot-signal" style="margin:0 auto 18px;width:max-content"><i class="r"></i><i class="a"></i><i class="g"></i></div>
        <h2>Can't connect</h2>
        <p class="muted" style="margin:10px 0 16px">${message}</p>
        <pre class="mono" style="background:rgba(0,0,0,.35);border:1px solid var(--stroke);border-radius:12px;padding:12px;font-size:13px;color:var(--cyan);white-space:pre-wrap;text-align:left">${hint}</pre>
        <button class="btn primary block" id="retry" style="margin-top:18px">${icon('refresh')} Try again</button>
      </div>
    </div>`);
  $('#retry').addEventListener('click', () => location.reload());
}

// ------------------------------------------------------------------ login / register
function renderLogin() {
  state.user = null;
  clearInterval(healthTimer); clearInterval(badgeTimer);
  document.title = 'Sign in - Smart Traffic Violation Reporting System';
  mount($('#root'), html`
    <div class="auth">
      <section class="auth-hero">
        <span class="auth-badge">${icon('bolt')} Smart city &middot; Road safety</span>
        <div class="row gap-l" style="align-items:center">
          <div class="signal-art" aria-hidden="true">
            <svg viewBox="0 0 120 250">
              <defs>
                <linearGradient id="sbody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171f66"/><stop offset="1" stop-color="#0a0f33"/></linearGradient>
                <filter id="lg"><feGaussianBlur stdDeviation="5"/></filter>
              </defs>
              <rect x="30" y="8" width="60" height="176" rx="30" fill="url(#sbody)" stroke="#4d7cff" stroke-width="2"/>
              <rect x="55" y="184" width="10" height="62" rx="3" fill="#0f1650" stroke="#35449a"/>
              <g>
                <circle class="lamp lr" cx="60" cy="52" r="17" fill="#ff3d71"/><circle class="lamp lr" cx="60" cy="52" r="26" fill="#ff3d71" filter="url(#lg)" opacity=".5"/>
                <circle class="lamp la" cx="60" cy="96" r="17" fill="#ffb020"/><circle class="lamp la" cx="60" cy="96" r="26" fill="#ffb020" filter="url(#lg)" opacity=".5"/>
                <circle class="lamp lg2" cx="60" cy="140" r="17" fill="#00e676"/><circle class="lamp lg2" cx="60" cy="140" r="26" fill="#00e676" filter="url(#lg)" opacity=".5"/>
              </g>
              <g class="arcs" fill="none" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 30 L26 44 L16 58 L28 74"/><path d="M106 40 L94 56 L104 72 L92 90"/><path d="M12 120 L24 132 L14 146 L26 160"/><path d="M108 124 L96 138 L106 152 L94 168"/>
              </g>
              <path d="M70 -4 L50 40 H64 L54 84 L84 28 H68 Z" fill="#fff" opacity=".0" class="bolt"/>
            </svg>
          </div>
          <h1>Smarter roads,<br><span class="grad-text">simpler</span><br>enforcement.</h1>
        </div>
        <p class="lead">Citizens report violations with photo evidence, officers verify them, fines are issued automatically and every step is stored in a relational MySQL database with a full audit trail.</p>
        <div class="auth-points">
          <div class="glass auth-point">${html`<span class="ico">${icon('camera')}</span>`}<div><strong>Report in seconds</strong><span>Geo-tagged locations with image or video proof.</span></div></div>
          <div class="glass auth-point"><span class="ico">${icon('shield')}</span><div><strong>Officer verification</strong><span>Review workflow with a tamper-evident history.</span></div></div>
          <div class="glass auth-point"><span class="ico">${icon('fines')}</span><div><strong>Automatic fines</strong><span>Stored procedure calculates fines and surcharges.</span></div></div>
          <div class="glass auth-point"><span class="ico">${icon('stats')}</span><div><strong>Live analytics</strong><span>Hotspots, peak hours and revenue straight from SQL.</span></div></div>
        </div>
      </section>

      <section class="glass electric auth-card">
        <h2 id="auth-title">Welcome back</h2>
        <p class="muted" id="auth-sub">Sign in to the control centre.</p>
        <div class="auth-tabs"><button type="button" class="active" data-mode="login">Sign in</button><button type="button" data-mode="register">Create account</button></div>

        <form id="auth-form" novalidate>
          <div class="field reg hide"><label class="label" for="a-name">Full name</label><input class="input" id="a-name" autocomplete="name" placeholder="Your full name"></div>
          <div class="field"><label class="label" for="a-email">Email</label><div class="input-icon">${icon('mail')}<input class="input" id="a-email" type="email" autocomplete="email" placeholder="you@example.com"></div></div>
          <div class="field reg hide"><label class="label" for="a-phone">Phone <span class="dim">(optional)</span></label><div class="input-icon">${icon('phone')}<input class="input" id="a-phone" autocomplete="tel" placeholder="98xxxxxxxx"></div></div>
          <div class="field"><label class="label" for="a-pass">Password</label><div class="input-icon">${icon('key')}<input class="input" id="a-pass" type="password" autocomplete="current-password" placeholder="Enter your password"></div><span class="hint reg hide">At least 8 characters with a letter and a number.</span></div>
          <div class="error-text" id="auth-error" hidden></div>
          <button class="btn primary lg block" id="auth-submit" type="submit">${icon('bolt')} <span>Sign in</span></button>
        </form>

        <div class="demo-box">
          <p>One-click demo accounts</p>
          <div class="demo-row">
            <button type="button" class="demo-btn" data-demo="admin"><span class="ico" style="color:var(--pink)">${icon('shield')}</span><b>Admin</b><small>Full control</small></button>
            <button type="button" class="demo-btn" data-demo="officer"><span class="ico" style="color:var(--cyan)">${icon('siren')}</span><b>Officer</b><small>Verify &amp; fine</small></button>
            <button type="button" class="demo-btn" data-demo="citizen"><span class="ico" style="color:var(--green)">${icon('user')}</span><b>Citizen</b><small>Report &amp; pay</small></button>
          </div>
        </div>
        <p class="auth-foot">Demo data is fictional &middot; Passwords are stored as bcrypt hashes</p>
      </section>
    </div>`);

  let mode = 'login';
  const form = $('#auth-form');
  const err = $('#auth-error');
  const setMode = (m) => {
    mode = m;
    $$('.auth-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $$('.reg').forEach((el) => el.classList.toggle('hide', m !== 'register'));
    $('#auth-title').textContent = m === 'login' ? 'Welcome back' : 'Create your account';
    $('#auth-sub').textContent = m === 'login' ? 'Sign in to the control centre.' : 'Citizen accounts can report violations and pay fines.';
    $('#auth-submit span').textContent = m === 'login' ? 'Sign in' : 'Create account';
    $('#a-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    err.hidden = true;
  };
  on(document, 'click', '.auth-tabs button', (_e, b) => setMode(b.dataset.mode));

  const submit = async (creds) => {
    err.hidden = true;
    const btn = $('#auth-submit');
    await withBusy(btn, async () => {
      try {
        const res = mode === 'login' || creds
          ? await api.login(creds || { email: $('#a-email').value.trim(), password: $('#a-pass').value })
          : await api.register({ full_name: $('#a-name').value.trim(), email: $('#a-email').value.trim(), phone: $('#a-phone').value.trim(), password: $('#a-pass').value });
        session.token = res.token;
        state.user = res.user;
        strike();
        await enterApp();
        toast(`Signed in as ${res.user.name}`, 'success', `Welcome, ${res.user.name.split(' ')[0]}`);
      } catch (e) {
        err.hidden = false; err.textContent = errorMessage(e);
      }
    });
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  const DEMO = { admin: ['admin@stvrs.in', 'Admin@123'], officer: ['officer@stvrs.in', 'Officer@123'], citizen: ['citizen@stvrs.in', 'Citizen@123'] };
  on(document.getElementById('root'), 'click', '[data-demo]', (_e, b) => {
    const [email, password] = DEMO[b.dataset.demo];
    $('#a-email').value = email; $('#a-pass').value = password;
    submit({ email, password });
  });
}

function logout() {
  session.token = null;
  state.user = null; state.meta = null;
  destroyCharts();
  if (currentDestroy) { currentDestroy(); currentDestroy = null; }
  $('#overlay-root').innerHTML = '';
  history.replaceState(null, '', location.pathname);
  renderLogin();
}

// ------------------------------------------------------------------ app shell
async function enterApp() {
  state.meta = await api.get('/api/meta');
  state.refreshBadges = refreshBadges;
  renderShell();
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
  else route();
  pollHealth();
  clearInterval(healthTimer); healthTimer = setInterval(pollHealth, 20000);
  refreshBadges(); pollNotifications();
  clearInterval(badgeTimer); badgeTimer = setInterval(() => { refreshBadges(); pollNotifications(); }, 45000);
}

function renderShell() {
  const u = state.user;
  mount($('#root'), html`
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-logo"><svg viewBox="0 0 64 64"><rect x="21" y="6" width="22" height="46" rx="11" fill="#070b24" stroke="#4d7cff" stroke-width="2.5"/><circle cx="32" cy="18" r="5" fill="#ff3d71"/><circle cx="32" cy="30" r="5" fill="#ffb020"/><circle cx="32" cy="42" r="5" fill="#00e676"/><path d="M40 4 28 33h7l-4 25 15-33h-8z" fill="#00e5ff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg></div>
          <div><h2>Smart Traffic</h2><small>Violation Reporting</small></div>
        </div>
        <nav class="nav" id="nav">
          <div class="nav-label">Navigation</div>
          ${navFor().map((n) => html`<a class="nav-item" href="#/${n.id}" data-nav="${n.id}">${icon(n.icon)}<span>${val(n.label)}</span><span class="count hide" data-badge="${n.id}"></span></a>`)}
        </nav>
        <div class="sidebar-foot">
          <div class="live-card"><div class="row"><span class="pulse-dot" id="side-dot"></span><b id="side-db">MySQL</b></div><div class="dim" id="side-db-sub" style="margin-top:4px">checking connection...</div></div>
          <button class="nav-item" id="logout">${icon('logout')}<span>Sign out</span></button>
          <small>&copy; ${new Date().getFullYear()} Smart Traffic &middot; v1.0</small>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menu" aria-label="Menu">${icon('menu')}</button>
          <div class="page-title">
            <h1 id="page-h1">Dashboard</h1>
            <svg class="electric-underline" viewBox="0 0 150 12" aria-hidden="true"><path d="M2 6 L24 6 L30 2 L38 10 L46 3 L54 8 L62 6 L148 6"/><path class="b" d="M2 6 L24 6 L30 2 L38 10 L46 3 L54 8 L62 6 L148 6"/></svg>
            <p id="page-sub"></p>
          </div>
          <div class="top-actions">
            <span class="db-pill" id="db-pill" title="Live database connection"><span class="pulse-dot" id="db-dot"></span><span id="db-text">MySQL</span><small id="db-lat"></small></span>
            <button class="icon-btn" id="bell" aria-label="Notifications">${icon('bell')}<span class="dot hide" id="bell-dot">0</span></button>
            <a class="user-chip" href="#/profile"><span class="avatar">${initials(u.name)}</span><span class="who"><b>${u.name}</b><small>${u.role}</small></span></a>
          </div>
        </header>
        <main class="page" id="page"></main>
      </div>
    </div>
    <div class="dropdown glass electric" id="notif-dd"><div class="dropdown-head"><span>Notifications</span><button class="btn ghost sm" id="read-all">Mark all read</button></div><div class="dropdown-list" id="notif-list"></div></div>`);

  $('#logout').addEventListener('click', logout);
  $('#menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#bell').addEventListener('click', (e) => { e.stopPropagation(); toggleNotifications(); });
  document.addEventListener('click', (e) => { const dd = $('#notif-dd'); if (dd && !dd.contains(e.target) && !e.target.closest('#bell')) dd.classList.remove('show'); });
  on($('#nav'), 'click', '[data-nav]', () => $('#sidebar').classList.remove('open'));
}

// ------------------------------------------------------------------ router
async function route() {
  if (!state.user) return;
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const id = path || 'dashboard';
  const entry = navFor().find((n) => n.id === id) || navFor()[0];
  if (!entry) return;
  if (entry.id !== id) { location.hash = `#/${entry.id}`; return; }

  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === entry.id));
  const title = val(entry.title);
  $('#page-h1').textContent = title;
  $('#page-sub').textContent = val(entry.sub);
  document.title = `${title} - Smart Traffic`;

  destroyCharts();
  $('#overlay-root').innerHTML = '';
  if (currentDestroy) { try { currentDestroy(); } catch (_) { /* page cleanup */ } currentDestroy = null; }
  const page = $('#page');
  mount(page, html`<div class="grid cols-4 kpis">${[1, 2, 3, 4].map(() => html`<div class="glass card"><div class="skeleton" style="height:112px"></div></div>`)}</div><div class="glass card"><div class="skeleton" style="height:280px"></div></div>`);

  const token = Symbol('route');
  route.token = token;
  try {
    const mod = await entry.load();
    if (route.token !== token) return;
    const params = Object.fromEntries(new URLSearchParams(query));
    page.innerHTML = '';
    const destroy = await mod.render(page, { user: state.user, meta: state.meta, params });
    if (route.token !== token) { if (destroy) destroy(); return; }
    currentDestroy = typeof destroy === 'function' ? destroy : null;
    [...page.children].forEach((c, i) => { c.style.setProperty('--i', i); c.classList.add('rise'); });
    window.scrollTo({ top: 0 });
  } catch (e) {
    console.error(e);
    mount(page, html`<div class="glass card empty">${icon('alert')}<b>Could not load this page</b><span>${errorMessage(e)}</span><button class="btn primary" id="reload-page">${icon('refresh')} Retry</button></div>`);
    $('#reload-page').addEventListener('click', route);
  }
}

// ------------------------------------------------------------------ live status, badges, notifications
async function pollHealth() {
  try {
    const h = await api.health();
    const ok = h.status === 'ok';
    $('#db-dot')?.classList.toggle('bad', !ok);
    $('#side-dot')?.classList.toggle('bad', !ok);
    const name = (h.db.version || '').toLowerCase().includes('maria') ? 'MariaDB' : 'MySQL';
    if ($('#db-text')) { $('#db-text').textContent = ok ? `${name} connected` : 'Database offline'; $('#db-lat').textContent = ok ? `${h.db.latencyMs} ms` : ''; }
    if ($('#side-db')) { $('#side-db').textContent = ok ? `${name} online` : 'Database offline'; $('#side-db-sub').textContent = ok ? `${h.db.database} · ${h.db.latencyMs} ms` : 'Check the server'; }
  } catch {
    $('#db-dot')?.classList.add('bad'); $('#side-dot')?.classList.add('bad');
    if ($('#db-text')) { $('#db-text').textContent = 'Server unreachable'; $('#db-lat').textContent = ''; }
    if ($('#side-db')) { $('#side-db').textContent = 'Server unreachable'; $('#side-db-sub').textContent = 'Retrying...'; }
  }
}

async function refreshBadges() {
  if (!state.user) return;
  const set = (id, n) => { const el = document.querySelector(`[data-badge="${id}"]`); if (el) { el.textContent = n; el.classList.toggle('hide', !n); } };
  try {
    if (isStaff()) {
      const [p, a] = await Promise.all([api.get('/api/violations', { status: 'Pending', limit: 1 }), api.get('/api/appeals', { status: 'Submitted' })]);
      set('violations', p.total); set('appeals', a.data.length);
    } else {
      const a = await api.get('/api/appeals');
      set('appeals', a.data.filter((x) => x.status === 'Submitted' || x.status === 'Under Review').length);
    }
  } catch { /* badges are best-effort */ }
}

async function pollNotifications() {
  if (!state.user) return;
  try {
    const { unread } = await api.get('/api/notifications');
    const dot = $('#bell-dot');
    if (dot) { dot.textContent = unread > 9 ? '9+' : unread; dot.classList.toggle('hide', !unread); }
  } catch { /* ignore */ }
}

async function toggleNotifications() {
  const dd = $('#notif-dd');
  if (dd.classList.contains('show')) { dd.classList.remove('show'); return; }
  const r = $('#bell').getBoundingClientRect();
  dd.style.top = `${r.bottom + 10}px`;
  dd.style.right = `${Math.max(12, window.innerWidth - r.right)}px`;
  dd.classList.add('show');
  const list = $('#notif-list');
  mount(list, html`<div style="padding:18px"><div class="skeleton" style="height:54px;margin-bottom:8px"></div><div class="skeleton" style="height:54px"></div></div>`);
  try {
    const { data, unread } = await api.get('/api/notifications');
    mount(list, data.length ? html`${data.map((n) => html`<div class="notif ${n.is_read ? '' : 'unread'}" data-id="${n.notification_id}" data-v="${n.violation_id || ''}"><span class="nd"></span><div><b>${n.title}</b><span>${n.message}</span><small>${timeAgo(n.created_at)}</small></div></div>`)}`
      : html`<div class="empty">${icon('bell')}<b>All caught up</b><span>No notifications yet.</span></div>`);
    const dot = $('#bell-dot'); dot.textContent = unread > 9 ? '9+' : unread; dot.classList.toggle('hide', !unread);
  } catch (e) { mount(list, html`<div class="empty">${icon('alert')}<span>${errorMessage(e)}</span></div>`); }
}

document.addEventListener('click', async (e) => {
  const item = e.target.closest('.notif');
  if (item) {
    $('#notif-dd').classList.remove('show');
    await api.post(`/api/notifications/${item.dataset.id}/read`).catch(() => {});
    pollNotifications();
    if (item.dataset.v) { const { openViolation } = await import('./violation-drawer.js'); openViolation(Number(item.dataset.v)); }
  }
  if (e.target.closest('#read-all')) { await api.post('/api/notifications/read-all').catch(() => {}); pollNotifications(); toggleNotifications(); setTimeout(toggleNotifications, 0); }
});

window.stvrs = { logout, route }; // handy for the profile page
document.addEventListener('stvrs:logout', logout);
boot();
