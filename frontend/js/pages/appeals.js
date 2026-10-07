import { api } from '../api.js';
import { html, mount, $, $$, on, icon, plate, fmtMoney, fmtDateTime, timeAgo, emptyState, skeletonRows, errorMessage } from '../ui.js';
import { openViolation, reviewAppealModal } from '../violation-drawer.js';
import { state } from '../state.js';

const STATES = ['Submitted', 'Under Review', 'Accepted', 'Rejected'];
const slug = (s) => s.toLowerCase().replace(/ /g, '-');

export async function render(el, { user }) {
  const staff = user.role !== 'citizen';
  let status = ''; let alive = true; let all = [];

  mount(el, html`
    <div class="glass card">
      <div class="chips" id="chips"></div>
      <div id="list">${skeletonRows(4, 110)}</div>
    </div>
    ${staff ? '' : html`<div class="glass card"><div class="row"><span class="cat-ico">${icon('info')}</span><div><b>How appeals work</b><p class="muted" style="margin-top:4px">Open one of your fined violations from <a href="#/violations">My Reports</a> or look up a plate on <a href="#/fines">Pay Fines</a>, then choose <b>Appeal</b>. If accepted, the violation is rejected and the fine waived; otherwise it returns to Verified and the fine stays payable.</p></div></div></div>`}`);

  const draw = () => {
    const counts = Object.fromEntries(STATES.map((s) => [s, all.filter((a) => a.status === s).length]));
    mount($('#chips', el), html`<button class="chip ${status ? '' : 'active'}" data-s="">All <span class="n">${all.length}</span></button>${STATES.map((s) => html`<button class="chip ${status === s ? 'active' : ''}" data-s="${s}">${s} <span class="n">${counts[s]}</span></button>`)}`);
    const rows = status ? all.filter((a) => a.status === status) : all;
    mount($('#list', el), rows.length ? html`<div class="stack">${rows.map((a) => html`
      <div class="panel" data-v="${a.violation_id}" style="cursor:pointer">
        <div class="row between wrap"><div class="row wrap"><span class="vd-ref">${a.reference_no}</span>${plate(a.plate_number, 'sm')}<span class="dim">${a.violation_name} · ${a.location_name}</span></div>
          <span class="badge st-${slug(a.status)}">${a.status}</span></div>
        <div class="appeal-box" style="margin-top:12px"><b>${a.filed_by_name} · ${timeAgo(a.filed_at)}</b><span>${a.reason}</span></div>
        ${a.review_notes ? html`<div class="tl-note" style="--c:var(--green)"><b>${a.reviewed_by_name || 'Officer'}:</b> ${a.review_notes}</div>` : ''}
        <div class="row between wrap" style="margin-top:12px"><span class="dim">Fine ${fmtMoney(a.fine_total)} · ${a.fine_status}${a.resolved_at ? ` · resolved ${fmtDateTime(a.resolved_at)}` : ''}</span>
          ${staff && (a.status === 'Submitted' || a.status === 'Under Review') ? html`<button class="btn primary sm" data-review="${a.appeal_id}">${icon('gavel')} Review</button>` : ''}</div>
      </div>`)}</div>` : emptyState(all.length ? 'Nothing in this state' : 'No appeals yet', staff ? 'Owner disputes will appear here for review.' : 'You have not appealed any violation.', 'appeals'));
  };

  async function load() {
    try { const r = await api.get('/api/appeals'); if (!alive) return; all = r.data; draw(); state.refreshBadges(); }
    catch (e) { mount($('#list', el), emptyState('Could not load appeals', errorMessage(e), 'alert')); }
  }

  on(el, 'click', '[data-s]', (_e, b) => { status = b.dataset.s; draw(); });
  on(el, 'click', '[data-review]', async (e, b) => {
    e.stopPropagation();
    const a = all.find((x) => x.appeal_id === Number(b.dataset.review));
    if (a && (await reviewAppealModal(a))) load();
  });
  on(el, 'click', '[data-v]', (e, p) => { if (e.target.closest('[data-review]')) return; openViolation(Number(p.dataset.v), { onChange: load }); });

  await load();
  return () => { alive = false; };
}
