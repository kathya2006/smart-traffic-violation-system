/**
 * End-to-end API smoke test (needs the server running and the demo data loaded).
 *
 *   npm start            (terminal 1)
 *   npm test             (terminal 2)       BASE_URL=http://localhost:5000 by default
 *
 * It creates a few clearly-marked test records (plate KA 99 ZZ 0001 / KA 99 ZZ 0002).
 */
const BASE = process.env.BASE_URL || 'http://localhost:5000';
let passed = 0;
let failed = 0;

const ok = (cond, label, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label} ${extra}`); }
};
const section = (t) => console.log(`\n${t}`);

async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}
const login = async (email, password) => (await api('POST', '/api/auth/login', { body: { email, password } })).data;

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function reportForm(fields, withFile = true) {
  const f = new FormData();
  for (const [k, val] of Object.entries(fields)) f.append(k, val);
  if (withFile) f.append('evidence', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  return f;
}

(async () => {
  console.log(`Smoke test against ${BASE}`);

  section('Health & auth');
  const health = await api('GET', '/api/health');
  ok(health.status === 200 && health.data.db.connected, 'GET /api/health reports database connected', JSON.stringify(health.data));
  const bad = await api('POST', '/api/auth/login', { body: { email: 'admin@stvrs.in', password: 'wrong-password' } });
  ok(bad.status === 401, 'wrong password -> 401');
  const noAuth = await api('GET', '/api/violations');
  ok(noAuth.status === 401, 'violations list requires a token');

  const admin = await login('admin@stvrs.in', 'Admin@123');
  const officer = await login('officer@stvrs.in', 'Officer@123');
  const citizen = await login('citizen@stvrs.in', 'Citizen@123');
  ok(admin.token && admin.user.role === 'admin', 'admin login');
  ok(officer.token && officer.user.role === 'officer' && officer.user.officer, 'officer login (with badge details)');
  ok(citizen.token && citizen.user.role === 'citizen', 'citizen login');
  const A = admin.token; const O = officer.token; const C = citizen.token;

  section('Registration');
  const weak = await api('POST', '/api/auth/register', { body: { full_name: 'Test User', email: 'weak@example.com', password: 'short' } });
  ok(weak.status === 400, 'weak password rejected');
  const email = `smoke${Date.now()}@example.com`;
  const reg = await api('POST', '/api/auth/register', { body: { full_name: 'Smoke Tester', email, phone: '9876543210', password: 'Passw0rdOK' } });
  ok(reg.status === 201 && reg.data.user.role === 'citizen', 'new citizen registered');
  const dupReg = await api('POST', '/api/auth/register', { body: { full_name: 'Smoke Tester', email, password: 'Passw0rdOK' } });
  ok(dupReg.status === 409, 'duplicate email -> 409');

  section('Lookup data & access control');
  const metaC = await api('GET', '/api/meta', { token: C });
  ok(metaC.data.violationTypes.length >= 18 && metaC.data.locations.length >= 16, `meta: ${metaC.data.violationTypes.length} violation types, ${metaC.data.locations.length} locations`);
  ok(!metaC.data.officers, 'citizen does not receive the officer list');
  const metaO = await api('GET', '/api/meta', { token: O });
  ok(Array.isArray(metaO.data.officers) && metaO.data.officers.length === 4, 'officer receives the officer list');
  const types = Object.fromEntries(metaC.data.violationTypes.map((t) => [t.code, t]));
  const locGuindy = metaC.data.locations.find((l) => l.name.startsWith('Guindy'));

  const listC = await api('GET', '/api/violations?limit=100', { token: C });
  ok(listC.status === 200 && listC.data.data.every((r) => r.reported_by_name === citizen.user.name), `citizen list only contains own reports (${listC.data.total})`);
  const listA = await api('GET', '/api/violations?limit=5', { token: A });
  ok(listA.data.total >= 170, `admin sees all violations (${listA.data.total})`);
  const search = await api('GET', '/api/violations?search=helmet&status=Closed', { token: A });
  ok(search.status === 200 && search.data.data.every((r) => r.status === 'Closed'), 'filter + search works');

  section('Report a violation (multipart with evidence)');
  const when = new Date(Date.now() - 30 * 60000).toISOString();
  const base = { plate_number: 'ka99zz0001', vehicle_type_id: 2, make: 'Test', model: 'Car', color: 'Blue', violation_type_id: types.SIG01.id, location_id: locGuindy.id, occurred_at: when, description: 'Smoke test: vehicle jumped the red light at the junction.' };
  const created = await api('POST', '/api/violations', { token: C, form: reportForm(base) });
  ok(created.status === 201, 'citizen report accepted', JSON.stringify(created.data));
  const vid = created.data.violation?.violation_id;
  ok(/^STV-\d{4}-\d{6}$/.test(created.data.violation?.reference_no || ''), `reference number generated (${created.data.violation?.reference_no})`);
  ok(created.data.violation?.status === 'Pending' && created.data.violation?.plate_number === 'KA 99 ZZ 0001', 'plate normalised, status Pending');
  ok(created.data.evidence?.length === 1 && created.data.evidence[0].file_path.startsWith('/uploads/'), 'evidence file stored');
  ok(created.data.history?.length === 1 && created.data.history[0].new_status === 'Pending', 'trigger wrote the first audit-trail row');
  const img = await fetch(BASE + created.data.evidence[0].file_path);
  ok(img.status === 200 && (img.headers.get('content-type') || '').includes('image/png'), 'evidence is served back');

  const dup = await api('POST', '/api/violations', { token: C, form: reportForm(base, false) });
  ok(dup.status === 409 && dup.data.error.code === 'POSSIBLE_DUPLICATE', 'duplicate report detected');
  const future = await api('POST', '/api/violations', { token: C, form: reportForm({ ...base, plate_number: 'KA99ZZ0003', occurred_at: new Date(Date.now() + 6 * 3600000).toISOString() }, false) });
  ok(future.status === 400, 'future date rejected');
  const badPlate = await api('POST', '/api/violations', { token: C, body: { ...base, plate_number: '12345' } });
  ok(badPlate.status === 400, 'invalid plate rejected');
  const badFile = new FormData(); Object.entries({ ...base, plate_number: 'KA99ZZ0004' }).forEach(([k, x]) => badFile.append(k, x));
  badFile.append('evidence', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  const html = await api('POST', '/api/violations', { token: C, form: badFile });
  ok(html.status === 400, 'non-image evidence rejected');

  section('Officer workflow, fines, audit trail');
  const forbidden = await api('PATCH', `/api/violations/${vid}/status`, { token: C, body: { status: 'Under Review' } });
  ok(forbidden.status === 403, 'citizen cannot change status');
  const skip = await api('PATCH', `/api/violations/${vid}/status`, { token: O, body: { status: 'Verified' } });
  ok(skip.status === 400, 'cannot skip Pending -> Verified');
  const ur = await api('PATCH', `/api/violations/${vid}/status`, { token: O, body: { status: 'Under Review', remarks: 'Checking footage' } });
  ok(ur.status === 200 && ur.data.violation.status === 'Under Review' && ur.data.violation.officer_name === officer.user.name, 'officer moves it to Under Review and is assigned');
  const rejectNoReason = await api('PATCH', `/api/violations/${vid}/status`, { token: O, body: { status: 'Rejected' } });
  ok(rejectNoReason.status === 400, 'rejection needs a reason');
  const ver = await api('PATCH', `/api/violations/${vid}/status`, { token: O, body: { status: 'Verified', remarks: 'Clear footage' } });
  ok(ver.status === 200 && ver.data.violation.fine_id && ver.data.violation.fine_amount === 1000 && ver.data.violation.fine_status === 'Unpaid', 'verification issues the fine via stored procedure (Rs.1000)');
  ok(ver.data.history.map((h) => h.new_status).join('>') === 'Pending>Under Review>Verified', 'audit trail: Pending > Under Review > Verified');
  ok(ver.data.history[2].changed_by_name === officer.user.name, 'audit trail records who made the change');
  const notifs = await api('GET', '/api/notifications', { token: C });
  ok(notifs.data.unread >= 1, 'reporter was notified');

  section('Speeding surcharge + on-the-spot verification');
  const sp = await api('POST', '/api/violations', { token: O, form: reportForm({
    plate_number: 'KA 99 ZZ 0002', vehicle_type_id: 2, violation_type_id: types.SPD01.id, location_id: locGuindy.id,
    occurred_at: when, recorded_speed: (locGuindy.speed_limit_kmph || 50) + 35, description: 'Smoke test: radar reading 35 km/h over limit.', auto_verify: 'true',
  }, false) });
  ok(sp.status === 201 && sp.data.violation.status === 'Verified', 'officer report with auto-verify is Verified immediately', JSON.stringify(sp.data));
  ok(sp.data.violation?.fine_amount === 1600, `fine = 1000 base + 600 over-speed surcharge (got ${sp.data.violation?.fine_amount})`);
  ok(sp.data.violation?.source === 'Officer Patrol', 'source recorded as Officer Patrol');

  section('Payment (trigger closes the violation)');
  const spId = sp.data.violation.violation_id; const spFine = sp.data.violation.fine_id;
  const cash = await api('POST', `/api/fines/${spFine}/pay`, { token: C, body: { method: 'Cash' } });
  ok(cash.status === 403, 'citizens cannot record cash payments');
  const pay = await api('POST', `/api/fines/${spFine}/pay`, { token: C, body: { method: 'UPI' } });
  ok(pay.status === 201 && pay.data.payment.amount === 1600 && /^TXN/.test(pay.data.payment.transaction_ref), 'payment recorded with transaction reference');
  const after = await api('GET', `/api/violations/${spId}`, { token: C });
  ok(after.data.violation.status === 'Closed' && after.data.violation.fine_status === 'Paid', 'trigger set fine = Paid and violation = Closed');
  ok(after.data.history.at(-1).new_status === 'Closed', 'closing was written to the audit trail');
  const payAgain = await api('POST', `/api/fines/${spFine}/pay`, { token: C, body: { method: 'UPI' } });
  ok(payAgain.status === 409, 'paying twice is refused');
  const lookup = await api('GET', '/api/fines?plate=ka99zz0002', { token: C });
  ok(lookup.status === 200 && lookup.data.data[0]?.fine_status === 'Paid', 'citizen fine lookup by registration number');
  const noPlate = await api('GET', '/api/fines', { token: C });
  ok(noPlate.status === 400, 'citizen fine lookup requires a registration number');

  section('Appeals');
  const early = await api('POST', '/api/appeals', { token: C, body: { violation_id: spId, reason: 'This should not be allowed since it is already paid.' } });
  ok(early.status === 400, 'paid fine cannot be appealed');
  const ap = await api('POST', '/api/appeals', { token: C, body: { violation_id: vid, reason: 'The signal was malfunctioning at that time, I have photos.' } });
  ok(ap.status === 201 && ap.data.appeal.status === 'Submitted', 'citizen files an appeal');
  const afterAppeal = await api('GET', `/api/violations/${vid}`, { token: C });
  ok(afterAppeal.data.violation.status === 'Appealed', 'violation moved to Appealed');
  const payBlocked = await api('POST', `/api/fines/${afterAppeal.data.violation.fine_id}/pay`, { token: C, body: { method: 'UPI' } });
  ok(payBlocked.status === 409, 'fine under appeal cannot be paid');
  const citizenReview = await api('PATCH', `/api/appeals/${ap.data.appeal.appeal_id}/review`, { token: C, body: { decision: 'Accepted', notes: 'let me in' } });
  ok(citizenReview.status === 403, 'citizen cannot review appeals');
  const acc = await api('PATCH', `/api/appeals/${ap.data.appeal.appeal_id}/review`, { token: O, body: { decision: 'Accepted', notes: 'Signal fault confirmed by the department.' } });
  ok(acc.status === 200 && acc.data.appeal.status === 'Accepted', 'officer accepts the appeal');
  const overturned = await api('GET', `/api/violations/${vid}`, { token: O });
  ok(overturned.data.violation.status === 'Rejected' && overturned.data.violation.fine_status === 'Waived', 'violation overturned and fine waived');

  section('Vehicle lookup, statistics, CSV, database introspection');
  const veh = await api('GET', '/api/vehicles/lookup?plate=KA%2099%20ZZ%200001', { token: C });
  ok(veh.status === 200 && veh.data.vehicle.plate_number === 'KA 99 ZZ 0001' && veh.data.violations.length === 1, 'vehicle lookup by plate');
  ok(veh.data.vehicle.owner_phone === null, 'owner phone is hidden from citizens');
  const noVeh = await api('GET', '/api/vehicles/lookup?plate=TN%2000%20ZZ%209999', { token: C });
  ok(noVeh.status === 404, 'unknown vehicle -> 404');
  const stA = await api('GET', '/api/stats/dashboard', { token: A });
  ok(stA.status === 200 && stA.data.kpis.total >= 170 && stA.data.daily.length === 30 && stA.data.hourly.length === 24 && Array.isArray(stA.data.officers), 'admin dashboard stats (30 days, 24 hours, officer table)');
  ok(stA.data.money.collected > 0 && stA.data.money.outstanding > 0, `fine totals: collected ${stA.data.money.collected}, outstanding ${stA.data.money.outstanding}`);
  const stC = await api('GET', '/api/stats/dashboard', { token: C });
  ok(stC.data.scope === 'mine' && stC.data.kpis.total < stA.data.kpis.total && !stC.data.officers, 'citizen stats are scoped to own reports');
  const csv = await api('GET', '/api/violations/export.csv', { token: O });
  ok(csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv') && csv.data.split('\n').length > 100, 'CSV export (officer)');
  const csvC = await api('GET', '/api/violations/export.csv', { token: C });
  ok(csvC.status === 403, 'CSV export forbidden for citizens');
  const db = await api('GET', '/api/admin/database', { token: O });
  ok(db.status === 200 && db.data.totals.tables === 16, `database introspection: ${db.data.totals?.tables} tables`);
  ok(db.data.totals.foreignKeys === 22 && db.data.totals.views === 2 && db.data.totals.triggers === 4 && db.data.totals.routines >= 1,
    `${db.data.totals?.foreignKeys} foreign keys, ${db.data.totals?.views} views, ${db.data.totals?.triggers} triggers, ${db.data.totals?.routines} procedure(s)`);
  const dbC = await api('GET', '/api/admin/database', { token: C });
  ok(dbC.status === 403, 'database screen forbidden for citizens');
  const notFound = await api('GET', '/api/nope', { token: C });
  ok(notFound.status === 404 && notFound.data.error, 'unknown API route returns JSON 404');

  console.log(`\n${failed ? '✗' : '✓'} ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test run crashed:', e); process.exit(1); });
