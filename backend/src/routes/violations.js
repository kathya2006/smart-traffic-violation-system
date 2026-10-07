const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const { pool, withTransaction, refreshOverdueFines } = require('../db');
const { requireAuth, requireRole, isStaff } = require('../middleware/auth');
const { upload, discardFiles } = require('../middleware/upload');
const v = require('../utils/validate');
const { badRequest, forbidden, notFound, conflict } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['Pending', 'Under Review', 'Verified', 'Rejected', 'Appealed', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const SOURCES = ['Citizen Report', 'Officer Patrol', 'Camera'];

// Moves an officer / admin may make from the violation screen.
// (Appealed / Closed are reached through the appeals and payments workflows.)
const TRANSITIONS = {
  Pending: { to: ['Under Review', 'Rejected'], roles: ['officer', 'admin'] },
  'Under Review': { to: ['Verified', 'Rejected'], roles: ['officer', 'admin'] },
  Verified: { to: ['Rejected'], roles: ['admin'] },
};

// ---------------------------------------------------------------- helpers
async function notify(conn, userIds, violationId, title, message) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  await conn.query(
    'INSERT INTO notifications (user_id, violation_id, title, message) VALUES ?',
    [ids.map((id) => [id, violationId, title, message.slice(0, 400)])]
  );
}

function buildFilters(q, user) {
  const where = [];
  const params = [];

  if (!isStaff(user)) { // citizens only ever see what they reported
    where.push('v.reported_by = ?');
    params.push(user.id);
  } else if (q.assigned === 'me' && user.officerId) {
    where.push('v.assigned_officer_id = ?');
    params.push(user.officerId);
  }

  if (q.status) {
    const list = String(q.status).split(',').filter((s) => STATUSES.includes(s));
    if (list.length) { where.push('v.status IN (?)'); params.push(list); }
  }
  if (q.priority && PRIORITIES.includes(q.priority)) { where.push('v.priority = ?'); params.push(q.priority); }
  if (q.source && SOURCES.includes(q.source)) { where.push('v.source = ?'); params.push(q.source); }
  if (q.category_id) { where.push('v.category_id = ?'); params.push(Number(q.category_id)); }
  if (q.violation_type_id) { where.push('v.violation_type_id = ?'); params.push(Number(q.violation_type_id)); }
  if (q.location_id) { where.push('v.location_id = ?'); params.push(Number(q.location_id)); }
  if (q.zone) { where.push('v.zone = ?'); params.push(String(q.zone)); }
  if (q.fine_status) { where.push('v.fine_status = ?'); params.push(String(q.fine_status)); }
  if (q.from && !Number.isNaN(Date.parse(q.from))) { where.push('v.occurred_at >= ?'); params.push(new Date(q.from)); }
  if (q.to && !Number.isNaN(Date.parse(q.to))) { where.push('v.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(new Date(q.to)); }
  if (q.search) {
    const s = String(q.search).trim();
    const compact = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    where.push(`(REPLACE(v.plate_number, ' ', '') LIKE ? OR v.reference_no LIKE ? OR v.owner_name LIKE ?
                 OR v.location_name LIKE ? OR v.violation_name LIKE ? OR v.area LIKE ?)`);
    params.push(`%${compact || '\u0000'}%`, `%${s}%`, `%${s}%`, `%${s}%`, `%${s}%`, `%${s}%`);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

const SORTS = {
  occurred_at: 'v.occurred_at',
  created_at: 'v.created_at',
  priority: "FIELD(v.priority, 'Critical', 'High', 'Medium', 'Low')",
  status: "FIELD(v.status, 'Pending', 'Under Review', 'Verified', 'Appealed', 'Rejected', 'Closed')",
  fine: 'v.total_due',
  plate: 'v.plate_number',
};

const LIST_COLUMNS = `
  v.violation_id, v.reference_no, v.occurred_at, v.status, v.priority, v.source, v.recorded_speed, v.speed_limit_kmph,
  v.plate_number, v.vehicle_type, v.owner_name, v.violation_code, v.violation_name, v.category_name, v.category_color,
  v.location_name, v.area, v.zone, v.fine_id, v.fine_amount, v.late_fee, v.total_due, v.fine_status, v.fine_due_date,
  v.officer_name, v.reported_by_name,
  (SELECT COUNT(*) FROM violation_evidence e WHERE e.violation_id = v.violation_id) AS evidence_count`;

// ---------------------------------------------------------------- list
router.get('/', async (req, res) => {
  await refreshOverdueFines();
  const { sql, params } = buildFilters(req.query, req.user);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
  const sortCol = SORTS[req.query.sort] || SORTS.occurred_at;
  const dir = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM v_violation_details v ${sql}`, params);
  const [rows] = await pool.query(
    `SELECT ${LIST_COLUMNS} FROM v_violation_details v ${sql} ORDER BY ${sortCol} ${dir}, v.violation_id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  res.json({ data: rows, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

// ---------------------------------------------------------------- CSV export (staff)
router.get('/export.csv', requireRole('officer', 'admin'), async (req, res) => {
  await refreshOverdueFines();
  const { sql, params } = buildFilters(req.query, req.user);
  const [rows] = await pool.query(
    `SELECT v.reference_no, v.occurred_at, v.plate_number, v.vehicle_type, v.owner_name, v.violation_code, v.violation_name,
            v.category_name, v.location_name, v.zone, v.recorded_speed, v.speed_limit_kmph, v.status, v.priority, v.source,
            v.fine_amount, v.late_fee, v.fine_status, v.fine_due_date, v.officer_name, v.reported_by_name
       FROM v_violation_details v ${sql} ORDER BY v.occurred_at DESC LIMIT 5000`,
    params
  );
  const cols = rows.length ? Object.keys(rows[0]) : ['reference_no'];
  const cell = (x) => {
    if (x === null || x === undefined) return '';
    const s = x instanceof Date ? x.toISOString() : String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="violations-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
});

// ---------------------------------------------------------------- detail
async function loadDetail(id, user) {
  await refreshOverdueFines();
  const [rows] = await pool.query('SELECT * FROM v_violation_details WHERE violation_id = ?', [id]);
  const violation = rows[0];
  if (!violation) return null;

  const [evidence] = await pool.query(
    `SELECT e.evidence_id, e.file_name, e.file_path, e.mime_type, e.file_size, e.uploaded_at, u.full_name AS uploaded_by_name
       FROM violation_evidence e JOIN users u ON u.user_id = e.uploaded_by WHERE e.violation_id = ? ORDER BY e.evidence_id`, [id]);
  const [history] = await pool.query(
    `SELECT h.history_id, h.old_status, h.new_status, h.remarks, h.changed_at, u.full_name AS changed_by_name, u.role AS changed_by_role
       FROM violation_status_history h LEFT JOIN users u ON u.user_id = h.changed_by
      WHERE h.violation_id = ? ORDER BY h.changed_at, h.history_id`, [id]);
  const [payments] = violation.fine_id
    ? await pool.query(
      `SELECT p.payment_id, p.amount, p.method, p.transaction_ref, p.paid_at, u.full_name AS paid_by_name
         FROM payments p LEFT JOIN users u ON u.user_id = p.paid_by WHERE p.fine_id = ? ORDER BY p.paid_at`, [violation.fine_id])
    : [[]];
  const [appeals] = await pool.query(
    `SELECT a.appeal_id, a.reason, a.status, a.review_notes, a.filed_at, a.resolved_at,
            fu.full_name AS filed_by_name, ru.full_name AS reviewed_by_name
       FROM appeals a JOIN users fu ON fu.user_id = a.filed_by LEFT JOIN users ru ON ru.user_id = a.reviewed_by
      WHERE a.violation_id = ? ORDER BY a.filed_at`, [id]);
  const [[vehicleSummary]] = await pool.query('SELECT * FROM v_vehicle_offence_summary WHERE vehicle_id = ?', [violation.vehicle_id]);

  if (!isStaff(user)) violation.owner_phone = null;

  const rule = TRANSITIONS[violation.status];
  const nextStatuses = rule && rule.roles.includes(user.role) ? rule.to : [];
  const openAppeal = appeals.some((a) => a.status === 'Submitted' || a.status === 'Under Review');
  const actions = {
    nextStatuses,
    canAssign: isStaff(user) && violation.status !== 'Closed' && violation.status !== 'Rejected',
    canPay: ['Unpaid', 'Overdue'].includes(violation.fine_status) && violation.status === 'Verified',
    canAppeal: user.role === 'citizen' && violation.status === 'Verified' && ['Unpaid', 'Overdue'].includes(violation.fine_status) && !openAppeal,
    canReviewAppeal: isStaff(user) && openAppeal,
    canUploadEvidence: isStaff(user) || violation.reported_by === user.id,
    canDelete: user.role === 'admin',
  };
  return { violation, evidence, history, payments, appeals, vehicleSummary, actions };
}

router.get('/:id', async (req, res) => {
  const id = v.int(req.params.id, 'Violation id');
  const detail = await loadDetail(id, req.user);
  if (!detail) throw notFound('Violation not found');
  res.json(detail);
});

// ---------------------------------------------------------------- create (JSON or multipart with evidence files)
router.post('/', upload.array('evidence', 4), async (req, res) => {
  const files = req.files || [];
  try {
    const b = req.body || {};
    const plateNo = v.plate(b.plate_number);
    const typeId = v.int(b.violation_type_id, 'Violation type');
    const locationId = v.int(b.location_id, 'Location');
    const occurredAt = v.dateTime(b.occurred_at, 'Date and time of violation');
    const now = Date.now();
    if (occurredAt.getTime() > now + 5 * 60 * 1000) throw badRequest('The violation time cannot be in the future');
    if (occurredAt.getTime() < now - 365 * 86400000) throw badRequest('Violations older than one year cannot be reported');
    const speed = v.int(b.recorded_speed, 'Recorded speed', { min: 1, max: 300, required: false });
    const description = v.str(b.description, 'Description', { min: 10, max: 1000 });
    const staff = isStaff(req.user);

    const result = await withTransaction(async (conn) => {
      const [[type]] = await conn.query('SELECT * FROM violation_types WHERE violation_type_id = ? AND is_active = 1', [typeId]);
      if (!type) throw badRequest('Unknown violation type');
      const [[loc]] = await conn.query('SELECT location_id, location_name FROM locations WHERE location_id = ?', [locationId]);
      if (!loc) throw badRequest('Unknown location');

      // vehicle: reuse by plate, or register a new one
      let vehicleId;
      const [existing] = await conn.query('SELECT vehicle_id FROM vehicles WHERE plate_number = ? FOR UPDATE', [plateNo]);
      if (existing.length) {
        vehicleId = existing[0].vehicle_id;
      } else {
        const vtId = v.int(b.vehicle_type_id, 'Vehicle type');
        const [[vt]] = await conn.query('SELECT vehicle_type_id FROM vehicle_types WHERE vehicle_type_id = ?', [vtId]);
        if (!vt) throw badRequest('Unknown vehicle type');
        const [ins] = await conn.query(
          'INSERT INTO vehicles (plate_number, vehicle_type_id, make, model, color, registered_state) VALUES (?, ?, ?, ?, ?, ?)',
          [plateNo, vtId, v.str(b.make, 'Make', { required: false, max: 60 }), v.str(b.model, 'Model', { required: false, max: 60 }),
            v.str(b.color, 'Colour', { required: false, max: 30 }), plateNo.startsWith('TN') ? 'Tamil Nadu' : null]
        );
        vehicleId = ins.insertId;
      }

      // possible duplicate (same vehicle + offence + place within 30 minutes)
      if (!v.bool(b.force)) {
        const [dups] = await conn.query(
          `SELECT reference_no FROM violations WHERE vehicle_id = ? AND violation_type_id = ? AND location_id = ?
              AND occurred_at BETWEEN DATE_SUB(?, INTERVAL 30 MINUTE) AND DATE_ADD(?, INTERVAL 30 MINUTE) LIMIT 1`,
          [vehicleId, typeId, locationId, occurredAt, occurredAt]
        );
        if (dups.length) throw conflict(`A similar report (${dups[0].reference_no}) already exists for this vehicle, place and time.`, 'POSSIBLE_DUPLICATE', { reference_no: dups[0].reference_no });
      }

      let source = 'Citizen Report';
      let priority = type.severity;
      let officerId = null;
      if (staff) {
        source = v.oneOf(b.source, 'Source', ['Officer Patrol', 'Camera'], { required: false, fallback: req.user.role === 'admin' ? 'Camera' : 'Officer Patrol' });
        priority = v.oneOf(b.priority, 'Priority', PRIORITIES, { required: false, fallback: type.severity });
        officerId = req.user.officerId;
      }

      await conn.actor(req.user.id, 'Violation reported');
      const [ins] = await conn.query(
        `INSERT INTO violations (vehicle_id, violation_type_id, location_id, reported_by, assigned_officer_id, occurred_at,
                                 recorded_speed, description, status, priority, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
        [vehicleId, typeId, locationId, req.user.id, officerId, occurredAt, speed, description, priority, source]
      );
      const violationId = ins.insertId;
      await conn.query(
        "UPDATE violations SET reference_no = CONCAT('STV-', YEAR(occurred_at), '-', LPAD(violation_id, 6, '0')) WHERE violation_id = ?",
        [violationId]
      );

      for (const f of files) {
        await conn.query(
          'INSERT INTO violation_evidence (violation_id, uploaded_by, file_name, file_path, mime_type, file_size) VALUES (?, ?, ?, ?, ?, ?)',
          [violationId, req.user.id, String(f.originalname).slice(0, 200), `/uploads/${f.filename}`, f.mimetype, f.size]
        );
      }

      // patrol officers can verify on the spot -> fine is issued by the stored procedure
      if (staff && v.bool(b.auto_verify)) {
        await conn.actor(req.user.id, 'Verified on the spot by reporting officer');
        await conn.query("UPDATE violations SET status = 'Verified' WHERE violation_id = ?", [violationId]);
        await conn.query('CALL sp_issue_fine(?)', [violationId]);
      }

      const [[row]] = await conn.query('SELECT reference_no FROM violations WHERE violation_id = ?', [violationId]);
      const [staffUsers] = await conn.query("SELECT user_id FROM users WHERE role IN ('officer','admin') AND is_active = 1 AND user_id <> ?", [req.user.id]);
      await notify(conn, staffUsers.map((u) => u.user_id), violationId, 'New violation report',
        `${row.reference_no}: ${type.violation_name} at ${loc.location_name} (${plateNo}) is awaiting review.`);
      return { violationId, referenceNo: row.reference_no };
    });

    const detail = await loadDetail(result.violationId, req.user);
    res.status(201).json(detail);
  } catch (err) {
    discardFiles(files);
    throw err;
  }
});

// ---------------------------------------------------------------- status workflow (staff)
router.patch('/:id/status', requireRole('officer', 'admin'), async (req, res) => {
  const id = v.int(req.params.id, 'Violation id');
  const target = v.oneOf(req.body.status, 'Status', STATUSES);
  const remarks = v.str(req.body.remarks, 'Remarks', { required: target === 'Rejected', min: target === 'Rejected' ? 5 : 0, max: 255 });
  const requestedOfficer = v.int(req.body.officer_id, 'Officer', { required: false });

  await withTransaction(async (conn) => {
    const [[cur]] = await conn.query(
      `SELECT v.*, t.violation_name FROM violations v JOIN violation_types t ON t.violation_type_id = v.violation_type_id
        WHERE v.violation_id = ? FOR UPDATE`, [id]);
    if (!cur) throw notFound('Violation not found');

    const rule = TRANSITIONS[cur.status];
    if (!rule || !rule.to.includes(target)) throw badRequest(`A violation that is "${cur.status}" cannot be moved to "${target}"`);
    if (!rule.roles.includes(req.user.role)) throw forbidden('Only an administrator can do that');

    let officerId = cur.assigned_officer_id;
    if (requestedOfficer && req.user.role === 'admin') officerId = requestedOfficer;
    else if (!officerId && req.user.officerId) officerId = req.user.officerId;

    if (cur.status === 'Verified' && target === 'Rejected') {
      const [[fine]] = await conn.query('SELECT status FROM fines WHERE violation_id = ?', [id]);
      if (fine && fine.status === 'Paid') throw conflict('The fine has already been paid, so this violation can no longer be rejected');
      await conn.query("UPDATE fines SET status = 'Waived' WHERE violation_id = ? AND status IN ('Unpaid','Overdue')", [id]);
    }

    await conn.actor(req.user.id, remarks);
    await conn.query('UPDATE violations SET status = ?, assigned_officer_id = ? WHERE violation_id = ?', [target, officerId, id]);
    if (target === 'Verified') await conn.query('CALL sp_issue_fine(?)', [id]);

    if (cur.reported_by !== req.user.id) {
      const phrase = { 'Under Review': 'is now under review by a traffic officer.', Verified: 'was verified and a fine has been issued.', Rejected: 'was closed as not actionable.' }[target];
      await notify(conn, [cur.reported_by], id, `Report ${target}`, `Your report ${cur.reference_no} ${phrase}`);
    }
  });

  res.json(await loadDetail(id, req.user));
});

// ---------------------------------------------------------------- assignment (staff)
router.patch('/:id/assign', requireRole('officer', 'admin'), async (req, res) => {
  const id = v.int(req.params.id, 'Violation id');
  let officerId = v.int(req.body.officer_id, 'Officer', { required: false });
  if (req.user.role === 'officer') officerId = req.user.officerId; // officers can only take a case themselves
  if (!officerId) throw badRequest('Officer is required');

  const [[officer]] = await pool.query('SELECT officer_id FROM officers WHERE officer_id = ?', [officerId]);
  if (!officer) throw badRequest('Unknown officer');
  const [r] = await pool.query("UPDATE violations SET assigned_officer_id = ? WHERE violation_id = ? AND status NOT IN ('Closed','Rejected')", [officerId, id]);
  if (!r.affectedRows) throw notFound('Violation not found or already finalised');
  res.json(await loadDetail(id, req.user));
});

// ---------------------------------------------------------------- extra evidence
router.post('/:id/evidence', upload.array('evidence', 4), async (req, res) => {
  const files = req.files || [];
  try {
    const id = v.int(req.params.id, 'Violation id');
    if (!files.length) throw badRequest('Attach at least one file');
    const [[row]] = await pool.query('SELECT reported_by FROM violations WHERE violation_id = ?', [id]);
    if (!row) throw notFound('Violation not found');
    if (!isStaff(req.user) && row.reported_by !== req.user.id) throw forbidden('Only the reporter or a traffic officer can add evidence');
    await pool.query('INSERT INTO violation_evidence (violation_id, uploaded_by, file_name, file_path, mime_type, file_size) VALUES ?',
      [files.map((f) => [id, req.user.id, String(f.originalname).slice(0, 200), `/uploads/${f.filename}`, f.mimetype, f.size])]);
    res.status(201).json(await loadDetail(id, req.user));
  } catch (err) {
    discardFiles(files);
    throw err;
  }
});

// ---------------------------------------------------------------- delete (admin)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = v.int(req.params.id, 'Violation id');
  const [files] = await pool.query('SELECT file_path FROM violation_evidence WHERE violation_id = ?', [id]);
  const [[pay]] = await pool.query(
    'SELECT COUNT(*) AS n FROM payments p JOIN fines f ON f.fine_id = p.fine_id WHERE f.violation_id = ?', [id]);
  if (pay.n > 0) throw conflict('This violation has recorded payments and cannot be deleted');
  const [r] = await pool.query('DELETE FROM violations WHERE violation_id = ?', [id]);
  if (!r.affectedRows) throw notFound('Violation not found');
  for (const f of files) {
    if (f.file_path.startsWith('/uploads/') && !f.file_path.startsWith('/uploads/demo/')) {
      fs.unlink(path.join(config.paths.uploads, path.basename(f.file_path)), () => {});
    }
  }
  res.json({ ok: true });
});

module.exports = router;
