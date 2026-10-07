import { api } from '../api.js';
import { html, mount, $, $$, on, icon, plate, statusBadge, priorityBadge, fmtNum, fmtMoney, fmtDateTime, debounce, emptyState, skeletonRows, toast, errorMessage, withBusy } from '../ui.js';
import { openViolation } from '../violation-drawer.js';

const STATUSES = ['Pending', 'Under Review', 'Verified', 'Rejected', 'Appealed', 'Closed'];
const SORTS = { occurred_at: 'Occurred', priority: 'Priority', status: 'Status', fine: 'Fine', plate: 'Vehicle' };

export async function render(el, { user, meta, params }) {
  const staff = user.role !== 'citizen';
  const q = { status: params.status || '', search: '', priority: '', category_id: '', zone: '', fine_status: '', from: '', to: '', assigned: '', sort: 'occurred_at', order: 'desc', page: 1, limit: 10 };
  const zones = [...new Set(meta.locations.map((l) => l.zone))].sort();
  let alive = true; let seq = 0;

  mount(el, html`
    <div class="glass card">
      <div class="chips" id="st-chips">
        <button class="chip ${q.status ? '' : 'active'}" data-st="">All</button>
        ${STATUSES.map((s) => html`<button class="chip ${q.status === s ? 'active' : ''}" data-st="${s}">${s}</button>`)}
      </div>
      <div class="toolbar">
        <div class="input-icon">${icon('search')}<input class="input" id="q-search" placeholder="${staff ? 'Search reference, plate, owner, location...' : 'Search by reference or plate...'}" aria-label="Search"></div>
        <select class="select sm" id="q-priority" aria-label="Priority"><option value="">Any priority</option>${['Critical', 'High', 'Medium', 'Low'].map((p) => html`<option>${p}</option>`)}</select>
        <select class="select sm" id="q-category" aria-label="Category"><option value="">All categories</option>${meta.categories.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select>
        ${staff ? html`<select class="select sm" id="q-zone" aria-label="Zone"><option value="">All zones</option>${zones.map((z) => html`<option>${z}</option>`)}</select>
        <select class="select sm" id="q-fine" aria-label="Fine status"><option value="">Any fine status</option>${['Unpaid', 'Overdue', 'Paid', 'Waived'].map((s) => html`<option>${s}</option>`)}</select>` : ''}
        <input class="input sm" type="date" id="q-from" aria-label="From date" style="width:auto"><input class="input sm" type="date" id="q-to" aria-label="To date" style="width:auto">
        ${staff ? html`<label class="check"><input type="checkbox" id="q-mine"> Assigned to me</label>` : ''}
        <span class="result-count" id="count"></span>
        ${staff ? html`<button class="btn ghost sm" id="export">${icon('download')} CSV</button>` : ''}
        <button class="btn ghost sm" id="clear">${icon('x')} Clear</button>
      </div>
      <div id="list">${skeletonRows(6)}</div>
      <div class="pagination" id="pager"></div>
    </div>`);

  async function load() {
    const my = ++seq;
    const params = { ...q, assigned: q.assigned || undefined };
    try {
      const r = await api.get('/api/violations', params);
      if (!alive || my !== seq) return;
      $('#count', el).textContent = `${fmtNum(r.total)} result${r.total === 1 ? '' : 's'}`;
      const arrow = (k) => (q.sort === k ? html`<span class="arrow">${q.order === 'asc' ? '▲' : '▼'}</span>` : '');
      const th = (k, label, cls = '') => html`<th class="sortable ${cls}" data-sort="${k}">${label}${arrow(k)}</th>`;
      mount($('#list', el), r.data.length ? html`
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Reference</th>${th('plate', 'Vehicle')}<th>Offence</th><th>Location</th>${th('occurred_at', 'When')}${th('priority', 'Priority')}${th('status', 'Status')}${th('fine', 'Fine', 'num')}</tr></thead>
          <tbody>${r.data.map((v) => html`<tr class="clickable" data-id="${v.violation_id}">
            <td class="ref">${v.reference_no}</td>
            <td>${plate(v.plate_number, 'sm')}${staff && v.owner_name ? html`<span class="sub">${v.owner_name}</span>` : ''}</td>
            <td><span class="cell-main"><span class="cat-dot" style="--c:${v.category_color}"></span>${v.violation_name}</span><span class="sub">${v.category_name}${v.recorded_speed ? ` · ${v.recorded_speed}/${v.speed_limit_kmph} km/h` : ''}</span></td>
            <td>${v.location_name}<span class="sub">${v.zone} zone</span></td>
            <td>${fmtDateTime(v.occurred_at)}<span class="sub">${v.source}</span></td>
            <td>${priorityBadge(v.priority)}</td><td>${statusBadge(v.status)}</td>
            <td class="num">${v.total_due != null ? html`<b>${fmtMoney(v.total_due)}</b><span class="sub"><span class="badge st-${(v.fine_status || '').toLowerCase()}" style="padding:1px 8px;font-size:11px">${v.fine_status}</span></span>` : html`<span class="dim">—</span>`}</td></tr>`)}</tbody></table></div>`
        : emptyState('No violations match', staff ? 'Try clearing a filter or searching for something else.' : 'Reports you submit will show up here.', 'search'));

      const p = r.pages; const cur = r.page;
      const nums = []; for (let i = 1; i <= p; i++) if (i === 1 || i === p || Math.abs(i - cur) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
      mount($('#pager', el), r.total ? html`<span>Showing ${(cur - 1) * r.limit + 1}–${Math.min(cur * r.limit, r.total)} of ${fmtNum(r.total)}</span>
        <div class="pager"><button data-p="${cur - 1}" ${cur <= 1 ? 'disabled' : ''} aria-label="Previous">‹</button>${nums.map((n) => (n === '…' ? html`<button disabled>…</button>` : html`<button data-p="${n}" class="${n === cur ? 'active' : ''}">${n}</button>`))}<button data-p="${cur + 1}" ${cur >= p ? 'disabled' : ''} aria-label="Next">›</button></div>` : '');
    } catch (e) { if (alive) mount($('#list', el), emptyState('Could not load violations', errorMessage(e), 'alert')); }
  }

  const reset = () => { q.page = 1; load(); };
  on(el, 'click', '[data-st]', (_e, b) => { q.status = b.dataset.st; $$('[data-st]', el).forEach((x) => x.classList.toggle('active', x === b)); reset(); });
  on(el, 'click', '[data-p]', (_e, b) => { q.page = Number(b.dataset.p); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  on(el, 'click', '[data-sort]', (_e, th) => { const k = th.dataset.sort; q.order = q.sort === k && q.order === 'desc' ? 'asc' : 'desc'; q.sort = k; q.page = 1; load(); });
  on(el, 'click', 'tr[data-id]', (_e, r) => openViolation(Number(r.dataset.id), { onChange: load }));
  $('#q-search', el).addEventListener('input', debounce((e) => { q.search = e.target.value.trim(); reset(); }, 300));
  const bindSel = (id, key) => { const n = $(id, el); if (n) n.addEventListener('change', () => { q[key] = n.value; reset(); }); };
  bindSel('#q-priority', 'priority'); bindSel('#q-category', 'category_id'); bindSel('#q-zone', 'zone'); bindSel('#q-fine', 'fine_status'); bindSel('#q-from', 'from'); bindSel('#q-to', 'to');
  const mine = $('#q-mine', el); if (mine) mine.addEventListener('change', () => { q.assigned = mine.checked ? 'me' : ''; reset(); });
  $('#clear', el).addEventListener('click', () => {
    Object.assign(q, { status: '', search: '', priority: '', category_id: '', zone: '', fine_status: '', from: '', to: '', assigned: '', page: 1 });
    $$('input:not([type=checkbox]), select', el).forEach((n) => { n.value = ''; }); if (mine) mine.checked = false;
    $$('[data-st]', el).forEach((x) => x.classList.toggle('active', x.dataset.st === ''));
    load();
  });
  const exp = $('#export', el);
  if (exp) exp.addEventListener('click', () => withBusy(exp, async () => {
    try {
      const blob = await api.blob('/api/violations/export.csv', { ...q, assigned: q.assigned || undefined, page: undefined, limit: undefined });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `violations-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
      toast('CSV exported with the current filters.', 'success');
    } catch (e) { toast(errorMessage(e), 'error'); }
  }));

  await load();
  return () => { alive = false; };
}
