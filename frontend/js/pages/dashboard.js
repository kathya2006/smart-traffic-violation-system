import { api } from '../api.js';
import { html, mount, $, on, icon, plate, statusBadge, fmtNum, fmtCompact, fmtMoney, timeAgo, countUp, categoryIcon, emptyState, errorMessage } from '../ui.js';
import { lineArea, sparkline, doughnut, bars, gauge, STATUS_COLORS, PALETTE } from '../charts.js';
import { openViolation } from '../violation-drawer.js';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export async function render(el, { user }) {
  const staff = user.role !== 'citizen';
  let s; let recent;
  try {
    [s, recent] = await Promise.all([api.get('/api/stats/dashboard'), api.get('/api/violations', { limit: 7, sort: 'created_at', order: 'desc' })]);
  } catch (e) { mount(el, html`<div class="glass card">${emptyState('Could not load the dashboard', errorMessage(e), 'alert')}</div>`); return; }

  const k = s.kpis; const m = s.money;
  const weekDelta = k.prev7 ? Math.round(((k.last7 - k.prev7) / k.prev7) * 100) : (k.last7 ? 100 : 0);
  const dCls = weekDelta > 0 ? 'up' : weekDelta < 0 ? 'down' : 'flat';
  const spark = s.daily.map((d) => d.count);
  const awaiting = k.pending + k.under_review;
  const kpi = (label, value, ic, color, foot, fmt = '') => html`
    <div class="glass kpi" style="--kc:${color}" data-tilt>
      <div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon">${icon(ic)}</span></div>
      <div class="kpi-value" data-count="${value}" ${fmt ? html`data-format="${fmt}"` : ''}>0</div>
      <div class="kpi-foot">${foot}</div>
    </div>`;

  mount(el, html`
    <div class="hero-strip">
      <div class="glass electric welcome">
        <span class="badge plain" style="--c:var(--cyan);width:max-content">${icon('bolt')} ${staff ? user.role === 'admin' ? 'Administrator' : 'Traffic officer' : 'Citizen'}</span>
        <h2>${greeting()}, <span class="grad-text">${user.role === 'admin' ? 'Admin' : user.name.split(' ')[0]}</span></h2>
        <p>${staff
    ? `${fmtNum(awaiting)} violations are waiting for action and ${fmtNum(m.overdue_count)} fines are overdue. Average verification time is ${k.avg_verify_hours ?? '—'} hours.`
    : `You have reported ${fmtNum(k.total)} violation${k.total === 1 ? '' : 's'} so far. Every report helps make roads safer.`}</p>
        <div class="actions">
          <a class="btn primary" href="#/report">${icon('report')} Report a violation</a>
          <a class="btn ghost" href="#/violations">${icon('list')} ${staff ? 'Review queue' : 'My reports'}</a>
        </div>
      </div>
      <div class="glass card">
        <div class="card-head"><div><div class="card-title">${icon('fines')} Fine collection</div><div class="card-sub">${fmtMoney(m.collected)} of ${fmtMoney(m.issued)} collected</div></div></div>
        <div class="gauge-box"><canvas id="c-gauge"></canvas></div>
        <div class="legend-list">
          <div class="legend-item"><span class="cat-dot" style="--c:#00e676"></span><span class="grow">Outstanding</span><b>${fmtMoney(m.outstanding)}</b></div>
          <div class="legend-item"><span class="cat-dot" style="--c:#ff3d71"></span><span class="grow">Overdue fines</span><b>${fmtNum(m.overdue_count)}</b></div>
        </div>
      </div>
    </div>

    <div class="grid cols-4">
      ${kpi('Total violations', k.total, 'list', '#00e5ff', html`<canvas id="c-spark"></canvas>`)}
      ${kpi('Last 7 days', k.last7, 'bolt', '#8b5cff', html`<span class="delta ${dCls}">${weekDelta > 0 ? '▲' : weekDelta < 0 ? '▼' : '•'} ${Math.abs(weekDelta)}%</span> vs previous week`)}
      ${kpi(staff ? 'Awaiting action' : 'In progress', awaiting, 'clock', '#ffb020', html`${fmtNum(k.pending)} pending · ${fmtNum(k.under_review)} in review`)}
      ${kpi('Outstanding fines', m.outstanding, 'rupee', '#ff3d71', html`${fmtNum(m.fines_count)} fines issued`, 'money')}
    </div>

    <div class="grid cols-2-1">
      <div class="glass card"><div class="card-head"><div><div class="card-title">${icon('stats')} Violations, last 30 days</div><div class="card-sub">Daily reports</div></div></div><div class="chart-box"><canvas id="c-daily"></canvas></div></div>
      <div class="glass card"><div class="card-head"><div><div class="card-title">${icon('layers')} Status mix</div><div class="card-sub">Where every report stands</div></div></div><div class="chart-box"><canvas id="c-status"></canvas></div></div>
    </div>

    <div class="grid cols-3">
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('flag')} By category</div></div><div class="chart-box short"><canvas id="c-cat"></canvas></div></div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('pin')} Hotspots</div></div>
        ${s.topLocations.length ? html`<div class="rank-list">${s.topLocations.slice(0, 5).map((l, i) => html`<div class="rank-item"><span class="rank-no">${i + 1}</span><div><b>${l.name}</b><div class="progress" style="--w:${Math.round((l.count / s.topLocations[0].count) * 100)}%;--c:#00e5ff"><i></i></div></div><b>${l.count}</b></div>`)}</div>` : emptyState('No data yet', '', 'pin')}</div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('bolt')} Latest activity</div><a class="btn ghost sm" href="#/violations">View all</a></div>
        <div class="activity" id="activity">${recent.data.length ? recent.data.map((v) => html`
          <div class="activity-item" data-id="${v.violation_id}"><span class="cat-ico" style="--c:${v.category_color}">${icon(categoryIcon(v.category_name))}</span>
            <div><b>${v.violation_name}</b><small>${v.plate_number} · ${timeAgo(v.created_at || v.occurred_at)}</small></div>${statusBadge(v.status)}</div>`) : emptyState('Nothing reported yet', 'Be the first to report a violation.', 'report')}</div></div>
    </div>

    ${staff && s.topOffenders ? html`
    <div class="grid cols-2">
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('vehicle')} Repeat offenders</div><a class="btn ghost sm" href="#/vehicles">Registry</a></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Vehicle</th><th>Owner</th><th class="num">Violations</th><th class="num">Due</th></tr></thead><tbody>
        ${s.topOffenders.slice(0, 5).map((o) => html`<tr class="clickable" data-plate="${o.plate_number}"><td>${plate(o.plate_number, 'sm')}</td><td>${o.owner_name || '—'}</td><td class="num"><b>${o.total_violations}</b></td><td class="num">${fmtMoney(o.outstanding)}</td></tr>`)}</tbody></table></div></div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('siren')} Officer workload</div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Officer</th><th class="num">Handled</th><th class="num">Verified</th><th class="num">Open</th></tr></thead><tbody>
        ${(s.officers || []).map((o) => html`<tr><td><span class="cell-main">${o.name}</span><span class="sub">${o.badge}</span></td><td class="num">${o.handled}</td><td class="num">${o.verified}</td><td class="num">${o.in_review}</td></tr>`)}</tbody></table></div></div>
    </div>` : ''}
  `);

  // animations / charts
  countUp(el);
  gauge($('#c-gauge'), Math.round(m.collection_rate || 0), '#00e676');
  sparkline($('#c-spark'), spark, '#00e5ff');
  lineArea($('#c-daily'), s.daily.map((d) => d.date.slice(5)), spark, { color: '#00e5ff' });
  const st = s.byStatus.filter((x) => x.count > 0);
  doughnut($('#c-status'), st.map((x) => x.name), st.map((x) => x.count), { colors: st.map((x) => STATUS_COLORS[x.name] || '#888'), center: fmtNum(k.total), sub: 'violations' });
  bars($('#c-cat'), s.byCategory.map((c) => c.name), s.byCategory.map((c) => c.count), { colors: s.byCategory.map((c) => c.color || PALETTE[0]), horizontal: true });

  on(el, 'click', '.activity-item', (_e, it) => openViolation(Number(it.dataset.id)));
  on(el, 'click', '[data-plate]', (_e, r) => { location.hash = `#/vehicles?plate=${encodeURIComponent(r.dataset.plate)}`; });
}
