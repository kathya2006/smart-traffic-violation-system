/**
 * Generates database/seed.sql  (master data + realistic demo data).
 *
 *   node scripts/generate-seed.js
 *
 * - Deterministic (seeded PRNG) so the committed seed.sql is reproducible.
 * - All timestamps are written relative to CURDATE()/NOW(), so the demo data
 *   always looks "recent" no matter when the SQL is loaded.
 * - All demo people and plates are fictional.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// ---------- deterministic random helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261007);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
function wpick(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'");
const pad = (n, w) => String(n).padStart(w, '0');

// "t" = minutes relative to today's midnight (negative = past).
function ts(t) {
  t = Math.round(t);
  if (t >= 0) return `LEAST(DATE_ADD(CURDATE(), INTERVAL ${t} MINUTE), DATE_SUB(NOW(), INTERVAL 1 MINUTE))`;
  return `DATE_ADD(CURDATE(), INTERVAL ${t} MINUTE)`;
}
const dayOffset = (days) => `DATE_ADD(CURDATE(), INTERVAL ${days} DAY)`;

// ---------- master data ----------
const stations = [
  ['Guindy Traffic Police Station', 'Chennai', 'Chennai South', 'GST Road, Guindy', '044-22501001'],
  ['Adyar Traffic Police Station', 'Chennai', 'Chennai South', 'Lattice Bridge Road, Adyar', '044-24410002'],
  ['T. Nagar Traffic Police Station', 'Chennai', 'Chennai Central', 'Usman Road, T. Nagar', '044-24340003'],
  ['Anna Nagar Traffic Police Station', 'Chennai', 'Chennai West', '2nd Avenue, Anna Nagar', '044-26220004'],
  ['Velachery Traffic Police Station', 'Chennai', 'Chennai South', 'Velachery Main Road', '044-22590005'],
  ['Egmore Traffic Police Station', 'Chennai', 'Chennai Central', 'Pantheon Road, Egmore', '044-28190006'],
  ['Tambaram Traffic Police Station', 'Chennai', 'Chengalpattu', 'GST Road, Tambaram', '044-22260007'],
  ['Potheri Traffic Police Station', 'Kattankulathur', 'Chengalpattu', 'GST Road, Potheri', '044-27450008'],
];

const vehicleTypes = ['Two-Wheeler', 'Car', 'Auto Rickshaw', 'Bus', 'Truck', 'Van'];

const categories = [
  ['Speeding', '⚡', '#ff3d71'],
  ['Signal & Lane', '🚦', '#ffb020'],
  ['Parking', '🅿️', '#00e5ff'],
  ['Safety Gear', '🪖', '#7c4dff'],
  ['Documentation', '📄', '#00e676'],
  ['Dangerous Driving', '🔥', '#ff6d00'],
];

// code, category(1-based), name, description, fine, points, severity, law
const vtypes = [
  ['SPD01', 1, 'Over-speeding', 'Exceeding the posted speed limit', 1000, 2, 'High', 'MV Act s.112 / 183'],
  ['SPD02', 1, 'Racing / Reckless Speed', 'Excessive speed endangering other road users', 5000, 4, 'Critical', 'MV Act s.189'],
  ['SIG01', 2, 'Red-Light Jumping', 'Crossing the stop line while the signal is red', 1000, 3, 'High', 'MV Act s.119 / 177'],
  ['SIG02', 2, 'Wrong-Side Driving', 'Driving against the direction of traffic', 1000, 3, 'High', 'MV Act s.184'],
  ['SIG03', 2, 'Stop-Line / Zebra Crossing Violation', 'Stopping over the stop line or pedestrian crossing', 500, 1, 'Low', 'MV Act s.177'],
  ['SIG04', 2, 'Illegal U-turn / Lane Indiscipline', 'Unsafe lane change or prohibited U-turn', 500, 1, 'Low', 'MV Act s.177'],
  ['PRK01', 3, 'Illegal Parking', 'Parking in a prohibited or no-parking zone', 500, 0, 'Low', 'MV Act s.177'],
  ['PRK02', 3, 'Obstructive Parking', 'Parking that blocks traffic, a junction or a driveway', 1000, 1, 'Medium', 'MV Act s.177'],
  ['SAF01', 4, 'Riding Without Helmet', 'Rider or pillion without a protective helmet', 1000, 2, 'Medium', 'MV Act s.129 / 194D'],
  ['SAF02', 4, 'No Seat Belt', 'Driver or front passenger without a seat belt', 1000, 2, 'Medium', 'MV Act s.194B'],
  ['SAF03', 4, 'Triple Riding', 'More than two persons on a two-wheeler', 1000, 2, 'Medium', 'MV Act s.128 / 194C'],
  ['SAF04', 4, 'Mobile Phone While Driving', 'Using a handheld phone while driving', 5000, 3, 'High', 'MV Act s.184'],
  ['DOC01', 5, 'Driving Without Licence', 'No valid driving licence produced', 5000, 4, 'High', 'MV Act s.3 / 181'],
  ['DOC02', 5, 'No Valid Insurance', 'Vehicle without valid third-party insurance', 2000, 2, 'Medium', 'MV Act s.146 / 196'],
  ['DOC03', 5, 'No PUC Certificate', 'Expired or missing pollution-under-control certificate', 1000, 1, 'Low', 'MV Act s.190(2)'],
  ['DNG01', 6, 'Drunk Driving', 'Driving under the influence of alcohol', 10000, 6, 'Critical', 'MV Act s.185'],
  ['DNG02', 6, 'Overloading / Over-crowding', 'Carrying passengers or goods beyond permitted limit', 2000, 2, 'Medium', 'MV Act s.194'],
  ['DNG03', 6, 'Dangerous Driving', 'Driving in a manner dangerous to the public', 5000, 4, 'Critical', 'MV Act s.184'],
];
const typeIdx = Object.fromEntries(vtypes.map((v, i) => [v[0], i + 1]));

// name, area, zone, lat, lng, limit, camera, kind
const locations = [
  ['Anna Salai - Gemini Flyover', 'Anna Salai', 'Central', 13.0569, 80.2425, 50, 1, 'junction'],
  ['Guindy - Kathipara Junction', 'Guindy', 'South', 13.0067, 80.2206, 50, 1, 'junction'],
  ['OMR - Sholinganallur Signal', 'Sholinganallur', 'South', 12.9010, 80.2279, 60, 1, 'junction'],
  ['ECR - Thiruvanmiyur', 'Thiruvanmiyur', 'East', 12.9830, 80.2594, 60, 1, 'road'],
  ['T. Nagar - Pondy Bazaar', 'T. Nagar', 'Central', 13.0418, 80.2341, 30, 0, 'market'],
  ['Koyambedu Junction', 'Koyambedu', 'West', 13.0694, 80.1948, 40, 1, 'junction'],
  ['Adyar Signal', 'Adyar', 'South', 13.0012, 80.2565, 40, 1, 'junction'],
  ['Velachery Main Road', 'Velachery', 'South', 12.9815, 80.2180, 40, 0, 'road'],
  ['Tambaram Junction - GST Road', 'Tambaram', 'South', 12.9249, 80.1000, 50, 1, 'junction'],
  ['Anna Nagar - 2nd Avenue', 'Anna Nagar', 'West', 13.0850, 80.2101, 30, 0, 'market'],
  ['Egmore - Pantheon Road', 'Egmore', 'Central', 13.0732, 80.2609, 30, 0, 'market'],
  ['Porur Junction', 'Porur', 'West', 13.0382, 80.1565, 50, 1, 'junction'],
  ['Kamarajar Salai - Marina', 'Marina Beach', 'East', 13.0500, 80.2824, 50, 1, 'road'],
  ['SRM Gate - Potheri, GST Road', 'Potheri', 'South', 12.8231, 80.0442, 50, 1, 'road'],
  ['Perungudi - OMR Toll', 'Perungudi', 'South', 12.9650, 80.2461, 60, 1, 'road'],
  ['Chennai Central - Station Road', 'Park Town', 'Central', 13.0827, 80.2707, 30, 0, 'market'],
];

// ---------- people ----------
const PW = { admin: 'Admin@123', officer: 'Officer@123', citizen: 'Citizen@123' };
const hash = { admin: bcrypt.hashSync(PW.admin, 10), officer: bcrypt.hashSync(PW.officer, 10), citizen: bcrypt.hashSync(PW.citizen, 10) };

const users = [
  ['System Administrator', 'admin@stvrs.in', '9840000001', 'admin'],
  ['Insp. Ramesh Kumar', 'officer@stvrs.in', '9840000002', 'officer'],
  ['SI Priya Lakshmi', 'officer2@stvrs.in', '9840000003', 'officer'],
  ['Insp. Arjun Venkatesh', 'officer3@stvrs.in', '9840000004', 'officer'],
  ['SI Meena Sundaram', 'officer4@stvrs.in', '9840000005', 'officer'],
  ['Karthik Subramanian', 'citizen@stvrs.in', '9840000011', 'citizen'],
  ['Divya Narayanan', 'citizen2@stvrs.in', '9840000012', 'citizen'],
  ['Rahul Menon', 'citizen3@stvrs.in', '9840000013', 'citizen'],
  ['Sneha Iyer', 'citizen4@stvrs.in', '9840000014', 'citizen'],
  ['Mohammed Faizal', 'citizen5@stvrs.in', '9840000015', 'citizen'],
];
const ADMIN_ID = 1;
const officerUserIds = [2, 3, 4, 5];
const citizenUserIds = [6, 7, 8, 9, 10];
const officers = [ // user_id, station_id, badge, rank
  [2, 1, 'TN-TP-1042', 'Inspector'],
  [3, 2, 'TN-TP-2217', 'Sub-Inspector'],
  [4, 4, 'TN-TP-1175', 'Inspector'],
  [5, 5, 'TN-TP-3308', 'Sub-Inspector'],
];

const firstNames = ['Arun', 'Bhavani', 'Chandru', 'Deepa', 'Elango', 'Fathima', 'Gokul', 'Harini', 'Imran', 'Janani', 'Kumaran', 'Lavanya', 'Manoj', 'Nithya', 'Omkar', 'Pavithra', 'Rajesh', 'Saranya', 'Tamil', 'Uma', 'Vignesh', 'Yamuna', 'Zubair', 'Anand', 'Revathi', 'Siddharth', 'Kavya', 'Balaji', 'Swathi', 'Naveen'];
const lastNames = ['Raman', 'Pillai', 'Krishnan', 'Nair', 'Reddy', 'Sharma', 'Gupta', 'Das', 'Joseph', 'Kannan', 'Selvam', 'Rao', 'Bose', 'Thomas', 'Khan', 'Murugan', 'Devi', 'Shankar', 'Prakash', 'Mehta'];
const streets = ['Gandhi Street', 'Nehru Nagar', 'Lakshmi Colony', 'Rajaji Road', 'Periyar Salai', 'Bharathi Street', 'Kamaraj Nagar', 'Temple Road', 'Lake View Road', 'Mettu Street'];
const areas = ['Adyar', 'Velachery', 'Tambaram', 'Anna Nagar', 'Guindy', 'Porur', 'Perungudi', 'Madipakkam', 'Chromepet', 'Mylapore'];

const owners = [];
const usedLic = new Set();
for (let i = 0; i < 30; i++) {
  const name = `${firstNames[i % firstNames.length]} ${pick(lastNames)}`;
  let lic;
  do { lic = `TN${pick(['01', '07', '09', '10', '11', '14', '22'])}${int(2008, 2024)}${pad(int(0, 9999999), 7)}`; } while (usedLic.has(lic));
  usedLic.add(lic);
  // a few expired / no licence to support documentation violations
  const licDays = chance(0.12) ? -int(10, 300) : int(120, 3650);
  owners.push({
    name, phone: '98' + pad(int(0, 99999999), 8),
    email: name.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.') + int(1, 99) + '@example.com',
    license: chance(0.05) ? null : lic, licDays,
    address: `${int(1, 240)}, ${pick(streets)}, ${pick(areas)}, Chennai`,
  });
}

const makes = {
  1: [['Honda', 'Activa 6G'], ['TVS', 'Jupiter'], ['Royal Enfield', 'Classic 350'], ['Bajaj', 'Pulsar 150'], ['Hero', 'Splendor Plus'], ['Yamaha', 'FZ-S'], ['Suzuki', 'Access 125']],
  2: [['Maruti Suzuki', 'Swift'], ['Hyundai', 'i20'], ['Tata', 'Nexon'], ['Honda', 'City'], ['Mahindra', 'XUV700'], ['Toyota', 'Innova Crysta'], ['Kia', 'Seltos']],
  3: [['Bajaj', 'RE Compact'], ['Piaggio', 'Ape City']],
  4: [['Ashok Leyland', 'Viking'], ['Tata', 'Starbus']],
  5: [['Tata', '407'], ['Eicher', 'Pro 2049'], ['Ashok Leyland', 'Dost']],
  6: [['Maruti Suzuki', 'Eeco'], ['Force', 'Traveller']],
};
const colors = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Grey', 'Yellow', 'Green', 'Maroon'];
const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const usedPlates = new Set();
function plate() {
  let p;
  do {
    const state = chance(0.88) ? 'TN' : pick(['KA', 'AP', 'KL', 'PY']);
    const rto = state === 'TN' ? pick(['01', '07', '09', '10', '11', '14', '18', '22', '37']) : pick(['01', '03', '09', '05']);
    p = `${state} ${rto} ${letters[int(0, letters.length - 1)]}${letters[int(0, letters.length - 1)]} ${pad(int(1, 9999), 4)}`;
  } while (usedPlates.has(p));
  usedPlates.add(p);
  return p;
}
const vehicles = [];
for (let i = 0; i < 40; i++) {
  const vt = wpick([[1, 48], [2, 30], [3, 8], [4, 3], [5, 7], [6, 4]]);
  const [make, model] = pick(makes[vt]);
  vehicles.push({
    plate: plate(), vt, owner: i < 36 ? (i % owners.length) + 1 : null,
    make, model, color: pick(colors),
    state: undefined, insDays: chance(0.14) ? -int(5, 200) : int(30, 700),
    pucDays: chance(0.18) ? -int(5, 150) : int(20, 300),
  });
  vehicles[i].state = vehicles[i].plate.startsWith('TN') ? 'Tamil Nadu' : { KA: 'Karnataka', AP: 'Andhra Pradesh', KL: 'Kerala', PY: 'Puducherry' }[vehicles[i].plate.slice(0, 2)];
}
const byType = {};
vehicles.forEach((v, i) => { (byType[v.vt] = byType[v.vt] || []).push(i + 1); });
const vehiclePool = (codes) => {
  if (['SAF01', 'SAF03'].includes(codes)) return byType[1];
  if (codes === 'SAF02') return [...byType[2], ...(byType[6] || []), ...(byType[5] || []), ...(byType[4] || [])];
  if (codes === 'DNG02') return [...(byType[5] || []), ...(byType[4] || []), ...(byType[3] || []), ...(byType[6] || [])];
  return vehicles.map((_, i) => i + 1);
};

// ---------- violations ----------
const typeWeights = [
  ['SAF01', 18], ['SIG01', 14], ['SPD01', 14], ['PRK01', 12], ['PRK02', 6], ['SAF04', 7], ['SAF02', 7], ['SAF03', 5],
  ['SIG02', 4], ['SIG03', 4], ['SIG04', 3], ['DOC01', 3], ['DOC02', 3], ['DOC03', 3], ['DNG01', 2], ['DNG02', 2], ['DNG03', 2], ['SPD02', 2],
];
const hourWeights = [1, 1, 1, 1, 1, 2, 4, 7, 10, 9, 7, 6, 6, 6, 6, 7, 9, 11, 12, 10, 7, 5, 3, 2];
const descTemplates = {
  SPD01: ['Vehicle clocked well above the posted limit.', 'Speed camera flagged the vehicle for over-speeding.'],
  SPD02: ['Vehicle weaving through traffic at very high speed.', 'Suspected street racing, multiple vehicles involved.'],
  SIG01: ['Vehicle crossed the stop line after the signal turned red.', 'Red-light violation captured at the junction.'],
  SIG02: ['Vehicle driving against the flow of traffic.', 'Wrong-side driving to avoid the junction queue.'],
  SIG03: ['Vehicle halted over the zebra crossing, blocking pedestrians.', 'Stopped beyond the stop line at the signal.'],
  SIG04: ['Sudden lane change without indication.', 'Illegal U-turn at a no-U-turn junction.'],
  PRK01: ['Vehicle parked in a marked no-parking zone.', 'Parked on the footpath near the market entrance.'],
  PRK02: ['Vehicle double-parked, obstructing the traffic lane.', 'Parked in front of a gate, blocking access.'],
  SAF01: ['Rider and pillion without helmets.', 'Rider seen without a helmet on a busy road.'],
  SAF02: ['Driver not wearing a seat belt.', 'Front passenger without a seat belt.'],
  SAF03: ['Three people riding on a single two-wheeler.', 'Triple riding with a child in the middle.'],
  SAF04: ['Driver using a mobile phone while driving.', 'Handheld phone use at the signal and while moving.'],
  DOC01: ['Driver could not produce a valid licence.', 'No licence available during the roadside check.'],
  DOC02: ['Insurance certificate expired.', 'No valid insurance papers during the check.'],
  DOC03: ['PUC certificate expired.', 'No pollution certificate displayed or produced.'],
  DNG01: ['Driver tested positive during the breath-analyser check.', 'Suspected drunk driving, erratic movement observed.'],
  DNG02: ['Vehicle carrying passengers beyond permitted capacity.', 'Goods vehicle overloaded beyond safe limits.'],
  DNG03: ['Driver overtaking dangerously on a blind curve.', 'Reckless driving endangering pedestrians.'],
};

function pickLocation(code) {
  const idx = locations.map((l, i) => ({ l, id: i + 1 }));
  let pool = idx;
  if (code.startsWith('SPD')) pool = idx.filter((x) => x.l[6] === 1 && x.l[7] !== 'market');
  else if (['SIG01', 'SIG03'].includes(code)) pool = idx.filter((x) => x.l[7] === 'junction');
  else if (code.startsWith('PRK')) pool = idx.filter((x) => x.l[7] === 'market' || x.l[7] === 'road');
  return pick(pool);
}

const raw = [];
const TOTAL = 170;
for (let i = 0; i < TOTAL; i++) {
  // more recent days are denser
  const age = Math.min(150, Math.floor(Math.pow(rnd(), 1.6) * 151));
  const hour = wpick(hourWeights.map((w, h) => [h, w]));
  let minuteOfDay = hour * 60 + int(0, 59);
  if (age === 0) minuteOfDay = int(0, 7 * 60); // keep "today" entries safely in the past
  const t0 = -age * 1440 + minuteOfDay;
  const code = wpick(typeWeights);
  const loc = pickLocation(code);
  const vehicleId = pick(vehiclePool(code));
  const source = code.startsWith('SPD') || code === 'SIG01' ? wpick([['Camera', 60], ['Officer Patrol', 25], ['Citizen Report', 15]])
    : wpick([['Citizen Report', 50], ['Officer Patrol', 40], ['Camera', 10]]);
  const reporter = source === 'Citizen Report' ? pick(citizenUserIds) : source === 'Officer Patrol' ? pick(officerUserIds) : ADMIN_ID;
  const limit = loc.l[5];
  const speed = code.startsWith('SPD') ? limit + (code === 'SPD02' ? int(35, 70) : int(8, 45)) : null;

  // final status depends on age
  const bucket = age < 7
    ? [['Pending', 45], ['Under Review', 25], ['Verified', 20], ['Rejected', 5], ['Appealed', 5]]
    : age < 30
      ? [['Pending', 10], ['Under Review', 12], ['Verified', 35], ['Rejected', 8], ['Appealed', 7], ['Closed', 28]]
      : [['Pending', 2], ['Under Review', 3], ['Verified', 15], ['Rejected', 8], ['Appealed', 5], ['Closed', 67]];
  const status = wpick(bucket);

  const typ = vtypes[typeIdx[code] - 1];
  const sev = typ[6];
  const priority = chance(0.2) ? pick(['Low', 'Medium', 'High', 'Critical']) : sev;

  raw.push({ t0, code, typeId: typeIdx[code], locId: loc.id, locName: loc.l[0], vehicleId, source, reporter, speed, limit, status, priority, age });
}
raw.sort((a, b) => a.t0 - b.t0);

const officerPick = () => int(1, officers.length); // officer_id
const officerUser = (oid) => officers[oid - 1][0];

const vrows = [], fines = [], payments = [], appeals = [], history = [], evidence = [], notifs = [];
let txn = 0;
raw.forEach((r, i) => {
  const id = i + 1;
  r.id = id;
  const reported = r.t0 + int(2, 40);
  const toUR = reported + int(60, 1500);
  const toVer = toUR + int(120, 2880);
  const needOfficer = r.status !== 'Pending';
  const oid = needOfficer ? officerPick() : null;
  const ouser = oid ? officerUser(oid) : null;
  const typ = vtypes[r.typeId - 1];

  // refine outcome path
  let path = ['Pending'];
  let overturned = false, failedAppeal = false;
  if (r.status === 'Under Review') path = ['Pending', 'Under Review'];
  else if (r.status === 'Verified') path = ['Pending', 'Under Review', 'Verified'];
  else if (r.status === 'Rejected') {
    overturned = r.age > 14 && chance(0.35);
    path = overturned ? ['Pending', 'Under Review', 'Verified', 'Appealed', 'Rejected'] : ['Pending', 'Under Review', 'Rejected'];
  } else if (r.status === 'Appealed') path = ['Pending', 'Under Review', 'Verified', 'Appealed'];
  else if (r.status === 'Closed') {
    failedAppeal = chance(0.1);
    path = failedAppeal ? ['Pending', 'Under Review', 'Verified', 'Appealed', 'Verified', 'Closed'] : ['Pending', 'Under Review', 'Verified', 'Closed'];
  }
  const hasFine = path.includes('Verified');

  vrows.push(
    `(${r.vehicleId}, ${r.typeId}, ${r.locId}, ${r.reporter}, ${oid === null ? 'NULL' : oid}, ${ts(r.t0)}, ${r.speed === null ? 'NULL' : r.speed}, ` +
    `${q(pick(descTemplates[r.code]) + ' Location: ' + r.locName + '.')}, ${q(r.status)}, ${q(r.priority)}, ${q(r.source)}, ${ts(reported)}, ${ts(reported)})`
  );

  // ----- timeline
  const times = {};
  let cur = reported;
  history.push([id, null, 'Pending', r.reporter, 'Violation reported', reported]);
  const note = {
    'Under Review': 'Assigned to traffic officer for review',
    Verified: 'Evidence verified, fine issued',
    Rejected: overturned ? 'Appeal accepted, violation overturned' : 'Insufficient evidence',
    Appealed: 'Owner filed an appeal',
    Closed: 'Fine paid in full',
  };
  for (let k = 1; k < path.length; k++) {
    const to = path[k], from = path[k - 1];
    let delta = to === 'Under Review' ? int(60, 1500) : to === 'Verified' ? (from === 'Appealed' ? int(1440, 4320) : int(120, 2880))
      : to === 'Appealed' ? int(1440, 7200) : to === 'Rejected' ? int(120, 2880) : int(1440, 20160);
    if (to === 'Rejected' && from === 'Appealed') delta = int(2880, 8640);
    cur += delta;
    times[`${k}`] = cur;
    const actor = to === 'Appealed' ? pick(citizenUserIds) : to === 'Closed' ? pick(citizenUserIds) : ouser;
    const remark = to === 'Verified' && from === 'Appealed' ? 'Appeal rejected, violation upheld' : note[to];
    history.push([id, from, to, actor, remark, cur]);
    r['t_' + to + k] = cur;
  }

  // ----- fine / payment / appeal
  if (hasFine) {
    const verIdx = path.indexOf('Verified');
    const tIssued = times[String(verIdx)];
    let amount = typ[4];
    if (r.speed !== null && r.speed > r.limit) amount += Math.min(Math.floor((r.speed - r.limit) / 10) * 200, 2000);
    const issuedDay = Math.floor(tIssued / 1440);
    const dueOff = issuedDay + 30;
    let fstatus = 'Unpaid', lateFee = 0, paidAt = null;
    if (r.status === 'Closed') { fstatus = 'Paid'; paidAt = times[String(path.length - 1)]; }
    else if (overturned) fstatus = 'Waived';
    else if (dueOff < 0) { fstatus = 'Overdue'; lateFee = Math.round(amount * 0.1 * 100) / 100; }
    fines.push({ id, amount, lateFee, tIssued, dueOff, fstatus, paidAt });
    if (fstatus === 'Paid') {
      txn++;
      payments.push({ fineId: fines.length, amount, method: wpick([['UPI', 55], ['Card', 20], ['NetBanking', 15], ['Cash', 10]]), ref: `TXN${20260000000 + txn * 7919}`, paidAt, user: pick(citizenUserIds) });
    }
  }
  const appIdx = path.indexOf('Appealed');
  if (appIdx > -1) {
    const tFiled = times[String(appIdx)];
    const reasons = [
      'I was not driving the vehicle at the time of the incident.', 'The signal was malfunctioning at that time.',
      'The vehicle was sold before the date and ownership was not updated.', 'Evidence does not clearly show my vehicle number.',
      'Medical emergency, I was taking a patient to hospital.', 'Documents were valid; I have attached proof of renewal.',
    ];
    let astatus, reviewer = null, notes = null, resolved = null;
    if (r.status === 'Appealed') astatus = chance(0.5) ? 'Under Review' : 'Submitted';
    else if (overturned) { astatus = 'Accepted'; reviewer = ouser; notes = 'Documents verified, violation overturned and fine waived.'; resolved = times[String(path.length - 1)]; }
    else { astatus = 'Rejected'; reviewer = ouser; notes = 'Evidence is clear, violation upheld.'; resolved = times[String(path.indexOf('Verified', appIdx))]; }
    appeals.push({ id, filedBy: history.find((h) => h[0] === id && h[2] === 'Appealed')[3], reviewer, reason: pick(reasons), astatus, notes, filed: tFiled, resolved });
  }

  // ----- demo evidence (placeholder CCTV frames)
  if (r.source === 'Camera' || chance(0.45)) {
    const n = (id % 6) + 1;
    evidence.push({ id, by: r.reporter, name: `evidence-${pad(id, 4)}.svg`, path: `/uploads/demo/cctv-${n}.svg`, mime: 'image/svg+xml', size: 2400 + n * 113, t: reported + 1 });
  }

  // ----- notifications for citizen reporters
  if (citizenUserIds.includes(r.reporter) && r.status !== 'Pending') {
    const ref = null;
    const tn = cur;
    const msg = { 'Under Review': 'is now under review by a traffic officer.', Verified: 'was verified and a fine has been issued.', Rejected: 'was closed as not actionable.', Appealed: 'is under appeal.', Closed: 'was resolved and closed.' }[r.status];
    notifs.push({ user: r.reporter, id, title: 'Report ' + r.status, ref, msg, read: chance(0.6), t: tn });
  }
});

// ---------- emit SQL ----------
const out = [];
const w = (s = '') => out.push(s);

w('-- =====================================================================');
w('--  Smart Traffic Violation Reporting System  -  Seed data');
w('--  GENERATED by backend/scripts/generate-seed.js  (do not edit by hand)');
w('--  Demo logins:  admin@stvrs.in / Admin@123');
w('--                officer@stvrs.in / Officer@123   (officer2..4@stvrs.in too)');
w('--                citizen@stvrs.in / Citizen@123   (citizen2..5@stvrs.in too)');
w('--  All people, plates and incidents are fictional demo data.');
w('-- =====================================================================');
w('SET NAMES utf8mb4;');
w('USE smart_traffic_db;');
w('-- triggers must not write audit rows while seeding');
w('SET @skip_history = 1;');
w('');
w('INSERT INTO police_stations (station_name, city, district, address, phone) VALUES');
w(stations.map((s) => `  (${s.map(q).join(', ')})`).join(',\n') + ';');
w('');
w('INSERT INTO vehicle_types (type_name) VALUES');
w(vehicleTypes.map((s) => `  (${q(s)})`).join(',\n') + ';');
w('');
w('INSERT INTO violation_categories (category_name, icon, color_hex) VALUES');
w(categories.map((c) => `  (${c.map(q).join(', ')})`).join(',\n') + ';');
w('');
w('INSERT INTO violation_types (category_id, code, violation_name, description, base_fine, penalty_points, severity, law_reference) VALUES');
w(vtypes.map((v) => `  (${q(v[1])}, ${q(v[0])}, ${q(v[2])}, ${q(v[3])}, ${v[4]}.00, ${v[5]}, ${q(v[6])}, ${q(v[7])})`).join(',\n') + ';');
w('');
w('INSERT INTO locations (location_name, area, city, zone, latitude, longitude, speed_limit_kmph, has_camera) VALUES');
w(locations.map((l) => `  (${q(l[0])}, ${q(l[1])}, 'Chennai', ${q(l[2])}, ${l[3]}, ${l[4]}, ${l[5]}, ${l[6]})`).join(',\n') + ';');
w('');
w('-- Users (bcrypt hashed passwords)');
w('INSERT INTO users (full_name, email, phone, password_hash, role) VALUES');
w(users.map((u) => `  (${q(u[0])}, ${q(u[1])}, ${q(u[2])}, ${q(hash[u[3]])}, ${q(u[3])})`).join(',\n') + ';');
w('');
w('INSERT INTO officers (user_id, station_id, badge_number, rank_title, joined_on) VALUES');
w(officers.map((o, i) => `  (${o[0]}, ${o[1]}, ${q(o[2])}, ${q(o[3])}, DATE_SUB(CURDATE(), INTERVAL ${400 + i * 330} DAY))`).join(',\n') + ';');
w('');
w('INSERT INTO owners (full_name, phone, email, license_number, license_valid_till, address) VALUES');
w(owners.map((o) => `  (${q(o.name)}, ${q(o.phone)}, ${q(o.email)}, ${q(o.license)}, ${o.license ? dayOffset(o.licDays) : 'NULL'}, ${q(o.address)})`).join(',\n') + ';');
w('');
w('INSERT INTO vehicles (plate_number, vehicle_type_id, owner_id, make, model, color, registered_state, insurance_valid_till, puc_valid_till) VALUES');
w(vehicles.map((v) => `  (${q(v.plate)}, ${v.vt}, ${v.owner === null ? 'NULL' : v.owner}, ${q(v.make)}, ${q(v.model)}, ${q(v.color)}, ${q(v.state)}, ${dayOffset(v.insDays)}, ${dayOffset(v.pucDays)})`).join(',\n') + ';');
w('');
w('INSERT INTO violations (vehicle_id, violation_type_id, location_id, reported_by, assigned_officer_id, occurred_at, recorded_speed, description, status, priority, source, created_at, updated_at) VALUES');
w(vrows.map((v) => '  ' + v).join(',\n') + ';');
w('');
w("UPDATE violations SET reference_no = CONCAT('STV-', YEAR(occurred_at), '-', LPAD(violation_id, 6, '0')), updated_at = created_at;");
w('');
w('INSERT INTO fines (violation_id, amount, late_fee, issued_at, due_date, status, paid_at) VALUES');
w(fines.map((f) => `  (${f.id}, ${f.amount}.00, ${f.lateFee.toFixed(2)}, ${ts(f.tIssued)}, ${dayOffset(f.dueOff)}, ${q(f.fstatus)}, ${f.paidAt === null ? 'NULL' : ts(f.paidAt)})`).join(',\n') + ';');
w('');
w('INSERT INTO payments (fine_id, paid_by, amount, method, transaction_ref, paid_at) VALUES');
w(payments.map((p) => `  (${p.fineId}, ${p.user}, ${p.amount}.00, ${q(p.method)}, ${q(p.ref)}, ${ts(p.paidAt)})`).join(',\n') + ';');
w('');
w('INSERT INTO appeals (violation_id, filed_by, reviewed_by, reason, status, review_notes, filed_at, resolved_at) VALUES');
w(appeals.map((a) => `  (${a.id}, ${a.filedBy}, ${a.reviewer === null ? 'NULL' : a.reviewer}, ${q(a.reason)}, ${q(a.astatus)}, ${q(a.notes)}, ${ts(a.filed)}, ${a.resolved === null ? 'NULL' : ts(a.resolved)})`).join(',\n') + ';');
w('');
w('INSERT INTO violation_status_history (violation_id, old_status, new_status, changed_by, remarks, changed_at) VALUES');
w(history.map((h) => `  (${h[0]}, ${q(h[1])}, ${q(h[2])}, ${h[3] === null ? 'NULL' : h[3]}, ${q(h[4])}, ${ts(h[5])})`).join(',\n') + ';');
w('');
w('INSERT INTO violation_evidence (violation_id, uploaded_by, file_name, file_path, mime_type, file_size, uploaded_at) VALUES');
w(evidence.map((e) => `  (${e.id}, ${e.by}, ${q(e.name)}, ${q(e.path)}, ${q(e.mime)}, ${e.size}, ${ts(e.t)})`).join(',\n') + ';');
w('');
w('INSERT INTO notifications (user_id, violation_id, title, message, is_read, created_at) VALUES');
w(notifs.map((n) => `  (${n.user}, ${n.id}, ${q(n.title)}, CONCAT('Your report ', (SELECT reference_no FROM violations WHERE violation_id = ${n.id}), ${q(' ' + n.msg)}), ${n.read ? 1 : 0}, ${ts(n.t)})`).join(',\n') + ';');
w('');
w('SET @skip_history = NULL;');
w('');

const sql = out.join('\n').replace(/YEAR_PLACEHOLDER/g, '0000');
fs.writeFileSync(path.join(__dirname, '..', '..', 'database', 'seed.sql'), sql);
console.log(`seed.sql written: ${vrows.length} violations, ${fines.length} fines, ${payments.length} payments, ${appeals.length} appeals, ${history.length} history rows, ${evidence.length} evidence, ${notifs.length} notifications`);
