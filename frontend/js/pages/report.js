import { api } from '../api.js';
import { html, mount, $, $$, on, icon, plate, statusBadge, fmtMoney, toLocalInput, toast, withBusy, errorMessage, categoryIcon, confirmDialog, openModal, esc } from '../ui.js';
import { openViolation } from '../violation-drawer.js';
import { strike } from '../fx.js';
import { state } from '../state.js';

const isSpeed = (t) => t && (/^SPD/i.test(t.code) || /speed/i.test(t.name));

export async function render(el, { user, meta }) {
  const staff = user.role !== 'citizen';
  const types = meta.violationTypes; const locs = meta.locations;
  const f = { plate: '', vtype: '', make: '', model: '', color: '', typeId: null, locId: null, files: [], catId: 0 };
  let knownVehicle = null; let lookupSeq = 0;

  const lats = locs.map((l) => Number(l.latitude)); const lngs = locs.map((l) => Number(l.longitude));
  const [minLa, maxLa, minLn, maxLn] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const px = (l) => ({ x: 8 + ((Number(l.longitude) - minLn) / (maxLn - minLn || 1)) * 84, y: 10 + (1 - (Number(l.latitude) - minLa) / (maxLa - minLa || 1)) * 80 });

  mount(el, html`
  <form id="rf" novalidate>
   <div class="report-grid">
    <div class="glass card">
      <div class="form-section">
        <h3><span class="step">1</span> Vehicle</h3>
        <div class="form-row">
          <div class="field"><label class="label" for="f-plate">Registration number <span class="req">*</span></label>
            <input class="input mono" id="f-plate" placeholder="TN 09 AB 1234" maxlength="14" autocomplete="off" style="text-transform:uppercase;letter-spacing:.08em">
            <span class="hint" id="plate-hint">Format: two letters, two digits, 1-3 letters, four digits.</span><span class="error-text" hidden data-err="plate"></span></div>
          <div class="field" id="vt-field"><label class="label" for="f-vt">Vehicle type <span class="req">*</span></label>
            <select class="select" id="f-vt"><option value="">Select type</option>${meta.vehicleTypes.map((t) => html`<option value="${t.id}">${t.name}</option>`)}</select><span class="error-text" hidden data-err="vt"></span></div>
        </div>
        <div class="form-row" id="vehicle-extra">
          <div class="field"><label class="label" for="f-make">Make <span class="dim">(optional)</span></label><input class="input" id="f-make" placeholder="e.g. Honda" maxlength="60"></div>
          <div class="field"><label class="label" for="f-model">Model / colour <span class="dim">(optional)</span></label><div class="row"><input class="input" id="f-model" placeholder="Model" maxlength="60"><input class="input" id="f-color" placeholder="Colour" maxlength="30"></div></div>
        </div>
        <div id="known" class="hide"></div>
      </div>

      <div class="form-section">
        <h3><span class="step">2</span> Offence</h3>
        <div class="chips" id="cat-chips"><button type="button" class="chip active" data-cat="0">All</button>${meta.categories.map((c) => html`<button type="button" class="chip" data-cat="${c.id}">${c.name}</button>`)}</div>
        <div class="type-grid" id="types"></div>
        <span class="error-text" hidden data-err="type"></span>
        <div class="field hide" id="speed-field"><label class="label" for="f-speed">Recorded speed (km/h) <span class="req">*</span></label><input class="input" id="f-speed" type="number" min="1" max="300" placeholder="e.g. 78"><span class="hint" id="speed-hint"></span><span class="error-text" hidden data-err="speed"></span></div>
      </div>

      <div class="form-section">
        <h3><span class="step">3</span> Place &amp; time</h3>
        <div class="form-row">
          <div class="field"><label class="label" for="f-loc">Location <span class="req">*</span></label>
            <select class="select" id="f-loc"><option value="">Select location</option>${locs.map((l) => html`<option value="${l.id}">${l.name} — ${l.area}</option>`)}</select><span class="error-text" hidden data-err="loc"></span></div>
          <div class="field"><label class="label" for="f-time">Date &amp; time <span class="req">*</span></label><input class="input" id="f-time" type="datetime-local" value="${toLocalInput()}" max="${toLocalInput()}"><span class="error-text" hidden data-err="time"></span></div>
        </div>
        <div class="field"><label class="label" for="f-desc">What happened? <span class="req">*</span></label><textarea class="textarea" id="f-desc" rows="4" maxlength="1000" placeholder="Describe the offence: direction of travel, signal state, anything that helps the officer verify it."></textarea>
          <div class="row between"><span class="error-text" hidden data-err="desc"></span><span class="hint" id="desc-count">0 / 1000</span></div></div>
      </div>

      <div class="form-section">
        <h3><span class="step">4</span> Evidence</h3>
        <div class="dropzone" id="drop" tabindex="0" role="button" aria-label="Add photo or video evidence">${icon('upload')}<b style="color:var(--ink)">Drop photos or a short video here, or click to browse</b><span>JPG, PNG, WebP, GIF, MP4 or WebM · up to 4 files · 8 MB each</span></div>
        <input type="file" id="f-files" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden>
        <div class="thumbs" id="thumbs"></div>
      </div>

      ${staff ? html`<div class="form-section"><h3><span class="step">5</span> Officer options</h3>
        <div class="form-row">
          <div class="field"><label class="label" for="f-source">Source</label><select class="select" id="f-source"><option>Officer Patrol</option><option>Camera</option></select></div>
          <div class="field"><label class="label" for="f-pri">Priority</label><select class="select" id="f-pri"><option value="">Match offence severity</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
        </div>
        <label class="check"><input type="checkbox" id="f-auto"> Verify on the spot and issue the fine immediately</label></div>` : ''}

      <div class="row end" style="margin-top:26px"><button type="reset" class="btn ghost" id="rf-reset">Reset</button><button type="submit" class="btn primary lg" id="rf-submit">${icon('bolt')} Submit report</button></div>
    </div>

    <div class="stack" style="position:sticky;top:96px">
      <div class="glass card estimate" id="estimate"></div>
      <div class="glass card"><div class="card-head"><div class="card-title">${icon('pin')} Location radar</div></div>
        <div class="radar-map" id="map"><div class="sweep"></div>
          ${locs.map((l) => { const p = px(l); return html`<button type="button" class="map-pin ${l.has_camera ? 'cam' : ''}" data-loc="${l.id}" style="left:${p.x}%;top:${p.y}%" title="${l.name}" aria-label="${l.name}"></button>`; })}
          <div class="map-label" id="map-label">Select a location</div></div>
        <p class="hint" style="margin-top:10px">Pins with a ring have speed / red-light cameras.</p></div>
    </div>
   </div>
  </form>`);

  // ---- offence cards
  const renderTypes = () => {
    const list = types.filter((t) => !f.catId || t.category_id === f.catId);
    mount($('#types', el), html`${list.map((t) => html`<button type="button" class="type-card ${t.id === f.typeId ? 'active' : ''}" data-type="${t.id}" style="--c:${t.color || '#00e5ff'}">
      <span class="tc-top">${icon(categoryIcon(t.category_name))}${t.category_name}</span><b>${t.name}</b><small>${fmtMoney(t.base_fine)} · ${t.penalty_points} pts</small></button>`)}`);
  };
  renderTypes();

  const typeOf = () => types.find((t) => t.id === f.typeId);
  const locOf = () => locs.find((l) => l.id === f.locId);

  const updateEstimate = () => {
    const t = typeOf(); const l = locOf();
    const speed = Number($('#f-speed', el).value) || 0;
    let sur = 0;
    if (isSpeed(t) && l && speed > l.speed_limit_kmph) sur = Math.min(Math.floor((speed - l.speed_limit_kmph) / 10) * 200, 2000);
    mount($('#estimate', el), t ? html`
      <div class="card-head" style="margin:0"><div class="card-title">${icon('receipt')} Fine estimate</div><span class="badge plain pri-${t.severity.toLowerCase()}">${t.severity}</span></div>
      <div><div class="dim" style="font-size:12px;letter-spacing:.1em;text-transform:uppercase">If verified</div><div class="big">${fmtMoney(Number(t.base_fine) + sur)}</div></div>
      <div><div class="row-kv"><span>Base fine</span><b>${fmtMoney(t.base_fine)}</b></div>
        ${sur ? html`<div class="row-kv"><span>Over-speed surcharge</span><b style="color:var(--red)">+ ${fmtMoney(sur)}</b></div>` : ''}
        <div class="row-kv"><span>Penalty points</span><b>${t.penalty_points}</b></div><div class="row-kv"><span>Due</span><b>30 days after issue</b></div></div>
      <div class="law">${icon('info')}<span>${t.law_reference || 'Motor Vehicles Act, 1988'}. Illustrative amounts for this demo; the officer's verification decides whether a fine is issued.</span></div>`
      : html`<div class="card-head" style="margin:0"><div class="card-title">${icon('receipt')} Fine estimate</div></div><div class="muted">Choose an offence to see the fine, penalty points and the legal section it falls under.</div>`);
    const hint = $('#speed-hint', el);
    if (l && isSpeed(t)) hint.textContent = `Speed limit at this location: ${l.speed_limit_kmph} km/h. Every full 10 km/h above adds ₹200.`;
    else hint.textContent = '';
  };

  const syncMap = () => {
    $$('.map-pin', el).forEach((p) => p.classList.toggle('active', Number(p.dataset.loc) === f.locId));
    const l = locOf();
    $('#map-label', el).textContent = l ? `${l.name} · ${l.zone} zone · limit ${l.speed_limit_kmph} km/h` : 'Select a location';
  };
  updateEstimate();

  on(el, 'click', '[data-cat]', (_e, b) => { f.catId = Number(b.dataset.cat); $$('[data-cat]', el).forEach((x) => x.classList.toggle('active', x === b)); renderTypes(); });
  on(el, 'click', '[data-type]', (_e, b) => {
    f.typeId = Number(b.dataset.type); $$('.type-card', el).forEach((x) => x.classList.toggle('active', x === b));
    $('#speed-field', el).classList.toggle('hide', !isSpeed(typeOf()));
    err('type'); updateEstimate();
  });
  on(el, 'click', '[data-loc]', (_e, b) => { $('#f-loc', el).value = b.dataset.loc; $('#f-loc', el).dispatchEvent(new Event('change')); });
  $('#f-loc', el).addEventListener('change', (e) => { f.locId = Number(e.target.value) || null; err('loc'); syncMap(); updateEstimate(); });
  $('#f-speed', el).addEventListener('input', updateEstimate);
  $('#f-desc', el).addEventListener('input', (e) => { $('#desc-count', el).textContent = `${e.target.value.length} / 1000`; err('desc'); });

  // ---- plate lookup (is the vehicle already registered?)
  const err = (k, msg) => { const n = $(`[data-err="${k}"]`, el); if (!n) return; n.hidden = !msg; n.textContent = msg || ''; };
  const plateInput = $('#f-plate', el);
  const normPlate = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prettyPlate = (raw) => { const m = raw.match(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{4})$/); return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : null; };
  plateInput.addEventListener('input', async () => {
    err('plate');
    const pretty = prettyPlate(normPlate(plateInput.value));
    const seq = ++lookupSeq; knownVehicle = null;
    $('#known', el).classList.add('hide'); $('#vt-field', el).classList.remove('hide'); $('#vehicle-extra', el).classList.remove('hide');
    if (!pretty) return;
    try {
      const r = await api.get('/api/vehicles/lookup', { plate: pretty });
      if (seq !== lookupSeq) return;
      knownVehicle = r.vehicle;
      $('#vt-field', el).classList.add('hide'); $('#vehicle-extra', el).classList.add('hide');
      const k = $('#known', el); k.classList.remove('hide');
      mount(k, html`<div class="panel"><h4>${icon('checkCircle')} Vehicle found in the registry</h4><div class="row wrap">${plate(r.vehicle.plate_number)}<span>${[r.vehicle.make, r.vehicle.model, r.vehicle.color].filter(Boolean).join(' · ')} <span class="dim">(${r.vehicle.vehicle_type})</span></span></div><div class="hint" style="margin-top:8px">${r.summary.total_violations} previous violation${r.summary.total_violations === 1 ? '' : 's'} on record.</div></div>`);
    } catch { if (seq === lookupSeq) $('#plate-hint', el).textContent = 'New vehicle: it will be added to the registry. Please choose its type.'; }
  });

  // ---- evidence
  const drop = $('#drop', el); const fileInput = $('#f-files', el);
  const drawThumbs = () => {
    mount($('#thumbs', el), html`${f.files.map((file, i) => html`<div class="thumb">${file.type.startsWith('video') ? html`<video src="${URL.createObjectURL(file)}" muted></video>` : html`<img src="${URL.createObjectURL(file)}" alt="Selected evidence ${i + 1}">`}<button type="button" data-rm="${i}" aria-label="Remove">${icon('x')}</button></div>`)}`);
  };
  const addFiles = (list) => {
    for (const file of list) {
      if (f.files.length >= 4) { toast('You can attach up to 4 files.', 'warn'); break; }
      if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm))$/.test(file.type)) { toast(`${file.name}: unsupported file type.`, 'warn'); continue; }
      if (file.size > 8 * 1024 * 1024) { toast(`${file.name} is larger than 8 MB.`, 'warn'); continue; }
      f.files.push(file);
    }
    drawThumbs();
  };
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
  on(el, 'click', '[data-rm]', (_e, b) => { f.files.splice(Number(b.dataset.rm), 1); drawThumbs(); });

  $('#rf', el).addEventListener('reset', () => setTimeout(() => { Object.assign(f, { typeId: null, locId: null, files: [], catId: 0 }); knownVehicle = null; renderTypes(); drawThumbs(); syncMap(); updateEstimate(); $('#known', el).classList.add('hide'); $('#vt-field', el).classList.remove('hide'); $('#vehicle-extra', el).classList.remove('hide'); $('#speed-field', el).classList.add('hide'); }, 0));

  // ---- submit
  const validate = () => {
    let ok = true;
    const bad = (k, m) => { err(k, m); ok = false; };
    ['plate', 'vt', 'type', 'speed', 'loc', 'time', 'desc'].forEach((k) => err(k));
    const pretty = prettyPlate(normPlate(plateInput.value));
    if (!pretty) bad('plate', 'Enter a valid registration number, e.g. TN 09 AB 1234.');
    if (!knownVehicle && !$('#f-vt', el).value) bad('vt', 'Select the vehicle type.');
    if (!f.typeId) bad('type', 'Choose the offence that was committed.');
    if (isSpeed(typeOf()) && !Number($('#f-speed', el).value)) bad('speed', 'Enter the recorded speed.');
    if (!f.locId) bad('loc', 'Select where it happened.');
    const t = $('#f-time', el).value;
    if (!t) bad('time', 'Choose when it happened.'); else if (new Date(t) > new Date(Date.now() + 5 * 60000)) bad('time', 'The time cannot be in the future.');
    if ($('#f-desc', el).value.trim().length < 10) bad('desc', 'Please describe the offence in at least 10 characters.');
    return ok ? pretty : null;
  };

  const submit = async (force) => {
    const pretty = validate();
    if (!pretty) { toast('Please fix the highlighted fields.', 'warn', 'Check the form'); el.querySelector('.error-text:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const fd = new FormData();
    fd.set('plate_number', pretty);
    if (!knownVehicle) { fd.set('vehicle_type_id', $('#f-vt', el).value); ['make', 'model', 'color'].forEach((k) => { const v = $(`#f-${k}`, el).value.trim(); if (v) fd.set(k, v); }); }
    fd.set('violation_type_id', f.typeId); fd.set('location_id', f.locId);
    fd.set('occurred_at', new Date($('#f-time', el).value).toISOString());
    const sp = $('#f-speed', el).value; if (isSpeed(typeOf()) && sp) fd.set('recorded_speed', sp);
    fd.set('description', $('#f-desc', el).value.trim());
    if (staff) { fd.set('source', $('#f-source', el).value); if ($('#f-pri', el).value) fd.set('priority', $('#f-pri', el).value); if ($('#f-auto', el).checked) fd.set('auto_verify', 'true'); }
    if (force) fd.set('force', 'true');
    f.files.forEach((file) => fd.append('evidence', file));

    const btn = $('#rf-submit', el);
    await withBusy(btn, async () => {
      try {
        const res = await api.upload('/api/violations', fd);
        strike();
        showSuccess(res.violation);
        state.refreshBadges();
      } catch (e) {
        if (e.code === 'POSSIBLE_DUPLICATE') {
          if (await confirmDialog({ title: 'Possible duplicate', icon: 'alert', lead: `${e.message} Submit anyway?`, confirm: 'Submit anyway', cls: 'warn' })) await submit(true);
        } else toast(errorMessage(e), 'error', 'Could not submit');
      }
    });
  };
  $('#rf', el).addEventListener('submit', (e) => { e.preventDefault(); submit(false); });

  function showSuccess(v) {
    mount(el, html`<div class="glass electric card success-card" style="max-width:640px;margin:20px auto">
      <div class="tick">${icon('check')}</div><h2>Report submitted</h2>
      <div class="vd-ref" style="font-size:18px">${v.reference_no}</div>
      <p class="muted">${v.violation_name} at ${v.location_name}. ${staff ? 'It is in the review queue.' : 'An officer will review your evidence and you will be notified of the outcome.'}</p>
      <div class="row wrap">${plate(v.plate_number, 'lg')}${statusBadge(v.status)}</div>
      <div class="row wrap" style="margin-top:10px"><button class="btn primary" id="s-view">${icon('eye')} View report</button><button class="btn ghost" id="s-new">${icon('plus')} Report another</button><a class="btn ghost" href="#/violations">${icon('list')} ${staff ? 'All violations' : 'My reports'}</a></div></div>`);
    $('#s-view', el).addEventListener('click', () => openViolation(v.violation_id));
    $('#s-new', el).addEventListener('click', () => render(el, { user, meta }));
  }
}
