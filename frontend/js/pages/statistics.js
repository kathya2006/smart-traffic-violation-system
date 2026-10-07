import { api } from '../api.js';
import { html, mount, $, icon, fmtNum, fmtMoney, emptyState, errorMessage, countUp } from '../ui.js';
import { comboBarLine, bars, doughnut, radar, lineArea, PALETTE, PRIORITY_COLORS } from '../charts.js';

const hh = (h) => `${String(h).padStart(2, '0')}:00`;

export async function render(el) {
  let s;
  try { s = await api.get('/api/stats/dashboard'); } catch (e) { mount(el, html`<div class="glass card">${emptyState('Could not load statistics', errorMessage(e), 'alert')}</div>`); return; }

  const peak = s.hourly.reduce((a, b) => (b.count > a.count ? b : a), s.hourly[0]);
  const peakDay = s.weekday.reduce((a, b) => (b.count > a.count ? b : a), s.weekday[0]);
  const topType = s.byType[0];
  const max = Math.max(1, ...s.hourly.map((h) => h.count));
  const insight = (ic, c, label, value, sub) => html`<div class="glass kpi" style="--kc:${c}" data-tilt><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon">${icon(ic)}</span></div><div class="kpi-value" style="font-size:24px">${value}</div><div class="kpi-foot">${sub}</div></div>`;

  mount(el, html`
    <div class="grid cols-4">
      ${insight('clock', '#00e5ff', 'Peak hour', `${hh(peak.hour)} – ${hh((peak.hour + 1) % 24)}`, `${peak.count} violations in this hour`)}
      ${insight('bolt', '#8b5cff', 'Busiest day', peakDay.name, `${peakDay.count} violations`)}
      ${insight('flag', '#ff3d71', 'Most common offence', topType ? topType.name : '—', topType ? `${topType.count} reports` : '')}
      ${insight('rupee', '#00e676', 'Collection rate', `${s.money.collection_rate}%`, `${fmtMoney(s.money.collected)} of ${fmtMoney(s.money.issued)}`)}
    </div>

    <div class="grid cols-2-1">
      <div class="glass card"><div class="card-head"><div><div class="card-title">${icon('stats')} Monthly violations &amp; revenue</div><div class="card-sub">Reports (bars) against fines collected (line)</div></div></div><div class="chart-box tall"><canvas id="c-month"></canvas></div></div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('layers')} Priority split</div></div><div class="chart-box tall"><canvas id="c-pri"></canvas></div></div>
    </div>

    <div class="glass card"><div class="card-head"><div><div class="card-title">${icon('clock')} When do violations happen?</div><div class="card-sub">Heat strip by hour of day (brighter = more violations)</div></div></div>
      <div class="heatmap">${s.hourly.map((h) => html`<i style="--v:${(h.count / max).toFixed(2)}" title="${hh(h.hour)}: ${h.count} violations"></i>`)}</div>
      <div class="heatmap-axis">${s.hourly.map((h) => html`<span>${h.hour}</span>`)}</div>
      <div class="chart-box short" style="margin-top:18px"><canvas id="c-hour"></canvas></div></div>

    <div class="grid cols-3">
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('flag')} Top offences</div></div><div class="chart-box tall"><canvas id="c-type"></canvas></div></div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('pin')} By zone</div></div><div class="chart-box tall"><canvas id="c-zone"></canvas></div></div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('camera')} Detection source</div></div><div class="chart-box tall"><canvas id="c-src"></canvas></div></div>
    </div>

    <div class="grid cols-2">
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('stats')} Day of week</div></div><div class="chart-box"><canvas id="c-week"></canvas></div></div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('pin')} Hotspot ranking</div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Location</th><th>Zone</th><th class="num">Violations</th></tr></thead><tbody>
        ${s.topLocations.map((l, i) => html`<tr><td><span class="rank-no" style="width:26px;height:26px">${i + 1}</span></td><td><span class="cell-main">${l.name}</span><span class="sub">${l.area}</span></td><td>${l.zone}</td><td class="num"><b>${l.count}</b></td></tr>`)}</tbody></table></div></div>
    </div>

    <div class="glass card"><div class="card-head"><div class="card-title">${icon('stats')} Last 30 days</div></div><div class="chart-box"><canvas id="c-daily"></canvas></div></div>`);

  countUp(el);
  comboBarLine($('#c-month', el), s.monthly.map((m) => m.label), s.monthly.map((m) => m.count), s.monthly.map((m) => m.collected));
  const pr = s.byPriority.filter((p) => p.count > 0);
  doughnut($('#c-pri', el), pr.map((p) => p.name), pr.map((p) => p.count), { colors: pr.map((p) => PRIORITY_COLORS[p.name]), center: fmtNum(pr.reduce((a, b) => a + b.count, 0)), sub: 'total' });
  bars($('#c-hour', el), s.hourly.map((h) => h.hour), s.hourly.map((h) => h.count), { color: '#00e5ff', label: 'Violations', radius: 5 });
  bars($('#c-type', el), s.byType.slice(0, 8).map((t) => t.name), s.byType.slice(0, 8).map((t) => t.count), { colors: s.byType.slice(0, 8).map((t) => t.color), horizontal: true });
  doughnut($('#c-zone', el), s.byZone.map((z) => z.name), s.byZone.map((z) => z.count), { colors: ['#00e5ff', '#8b5cff', '#ff3d9a', '#ffb020'], center: String(s.byZone.length), sub: 'zones' });
  doughnut($('#c-src', el), s.bySource.map((z) => z.name), s.bySource.map((z) => z.count), { colors: ['#00e676', '#4d7cff', '#ff6d00'], cutout: '58%' });
  radar($('#c-week', el), s.weekday.map((d) => d.name), s.weekday.map((d) => d.count), '#8b5cff');
  lineArea($('#c-daily', el), s.daily.map((d) => d.date.slice(5)), s.daily.map((d) => d.count), { color: '#ff3d9a' });
}
