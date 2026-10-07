import { api } from '../api.js';
import { html, mount, $, on, icon, fmtNum, emptyState, errorMessage, countUp, openLightbox, toast, withBusy } from '../ui.js';

export async function render(el) {
  let d; let h;
  try { [d, h] = await Promise.all([api.get('/api/admin/database'), api.health()]); } catch (e) { mount(el, html`<div class="glass card">${emptyState('Could not read the database', errorMessage(e), 'alert')}</div>`); return; }

  const engine = d.server.version.toLowerCase().includes('maria') ? 'MariaDB' : 'MySQL';
  const kpi = (l, v, ic, c) => html`<div class="glass kpi" style="--kc:${c}" data-tilt><div class="kpi-top"><span class="kpi-label">${l}</span><span class="kpi-icon">${icon(ic)}</span></div><div class="kpi-value" data-count="${v}">0</div></div>`;
  const maxRows = Math.max(1, ...d.tables.map((t) => t.rows));

  mount(el, html`
    <div class="glass electric card conn-card">
      <div class="card-head" style="margin:0"><div class="card-title">${icon('database')} Live connection</div><button class="btn ghost sm" id="ping">${icon('refresh')} Test connection</button></div>
      <div class="conn-line"><span class="pulse-dot"></span><b>${engine} ${d.server.version.split('-')[0]}</b><span class="dim">·</span><span class="mono">${d.server.user}@${d.server.host}:${d.server.port}/${d.server.name}</span></div>
      <div class="grid cols-4" style="gap:14px">
        <div class="mini-stat"><small>Latency</small><b id="lat">${h.db.latencyMs} ms</b></div>
        <div class="mini-stat"><small>Pool (open / limit)</small><b>${d.pool.open} / ${d.pool.limit}</b></div>
        <div class="mini-stat"><small>Charset · time zone</small><b style="font-size:17px">${d.server.charset} · ${d.server.timezone}</b></div>
        <div class="mini-stat"><small>Server uptime</small><b style="font-size:20px">${Math.floor(d.server.uptime_seconds / 3600)}h ${Math.floor((d.server.uptime_seconds % 3600) / 60)}m</b></div>
      </div>
      <p class="hint">Connection pooling via <span class="mono">mysql2/promise</span>; every statement is parameterised. Triggers record the audit trail and close violations when a fine is paid.</p>
    </div>

    <div class="grid cols-6" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      ${kpi('Tables', d.totals.tables, 'layers', '#00e5ff')}${kpi('Rows', d.totals.rows, 'list', '#8b5cff')}${kpi('Foreign keys', d.totals.foreignKeys, 'link', '#ff3d9a')}
      ${kpi('Views', d.totals.views, 'eye', '#4d7cff')}${kpi('Triggers', d.totals.triggers, 'bolt', '#ffb020')}${kpi('Procedures', d.totals.routines, 'gavel', '#00e676')}
    </div>

    <div class="glass card"><div class="card-head"><div><div class="card-title">${icon('layers')} Entity-relationship diagram</div><div class="card-sub">Generated from <span class="mono">database/schema.sql</span> · click to enlarge</div></div>
      <div class="row"><a class="btn ghost sm" href="assets/er-diagram.svg" download="er-diagram.svg">${icon('download')} SVG</a></div></div>
      <div class="er-frame" id="er"><img src="assets/er-diagram.svg" alt="Entity-relationship diagram of the 16 tables and their foreign keys"></div></div>

    <div class="glass card"><div class="card-head"><div class="card-title">${icon('database')} Tables</div><span class="muted">${d.tables.length} tables · InnoDB</span></div>
      <div class="table-list">${d.tables.map((t) => html`<div class="tbl-card"><b>${t.name}</b><div class="meta"><span>${fmtNum(t.rows)} rows</span><span>${t.columns} cols</span><span>${t.size_kb} KB</span></div><div class="progress" style="--w:${Math.max(4, Math.round((t.rows / maxRows) * 100))}%;--c:#8b5cff"><i></i></div></div>`)}</div></div>

    <div class="grid cols-2">
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('link')} Foreign keys</div><span class="muted">${d.foreignKeys.length}</span></div>
        <div class="fk-list">${d.foreignKeys.map((f) => html`<div class="fk"><span>${f.child_table}.<em>${f.child_column}</em></span><i>→</i><span>${f.parent_table}.<em>${f.parent_column}</em></span></div>`)}</div></div>
      <div class="glass card stack" style="align-content:start">
        <div><div class="card-title" style="margin-bottom:12px">${icon('eye')} Views</div><div class="chip-list">${d.views.map((v) => html`<span class="tag v">${v.name}</span>`)}</div></div>
        <div><div class="card-title" style="margin-bottom:12px">${icon('bolt')} Triggers</div><div class="chip-list">${d.triggers.map((t) => html`<span class="tag t" title="${t.timing} ${t.event} on ${t.on_table}">${t.name} <span class="dim">${t.timing} ${t.event}</span></span>`)}</div></div>
        <div><div class="card-title" style="margin-bottom:12px">${icon('gavel')} Stored routines</div><div class="chip-list">${d.routines.map((r) => html`<span class="tag">${r.name} <span class="dim">${r.type}</span></span>`)}</div></div>
        <p class="hint">Normalised to 3NF: lookup tables for vehicle types, violation categories and types; fines, payments, appeals, evidence and status history reference violations by foreign key.</p>
      </div>
    </div>`);

  countUp(el);
  $('#er', el).addEventListener('click', () => openLightbox('assets/er-diagram.svg'));
  $('#ping', el).addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    try { const r = await api.health(); $('#lat', el).textContent = `${r.db.latencyMs} ms`; toast(`${engine} responded in ${r.db.latencyMs} ms.`, 'success', 'Database reachable'); } catch (err) { toast(errorMessage(err), 'error'); }
  }));
}
