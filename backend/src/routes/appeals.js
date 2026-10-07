const express = require('express');
const { pool, withTransaction } = require('../db');
const { requireAuth, requireRole, isStaff } = require('../middleware/auth');
const v = require('../utils/validate');
const { badRequest, forbidden, notFound, conflict } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const APPEAL_COLUMNS = `
  a.appeal_id, a.violation_id, a.reason, a.status, a.review_notes, a.filed_at, a.resolved_at,
  vi.reference_no, vi.status AS violation_status, vh.plate_number, t.violation_name, l.location_name,
  fu.full_name AS filed_by_name, ru.full_name AS reviewed_by_name, f.total_due AS fine_total, f.status AS fine_status`;
const APPEAL_JOINS = `
  FROM appeals a
  JOIN violations vi ON vi.violation_id = a.violation_id
  JOIN vehicles vh ON vh.vehicle_id = vi.vehicle_id
  JOIN violation_types t ON t.violation_type_id = vi.violation_type_id
  JOIN locations l ON l.location_id = vi.location_id
  JOIN users fu ON fu.user_id = a.filed_by
  LEFT JOIN users ru ON ru.user_id = a.reviewed_by
  LEFT JOIN fines f ON f.violation_id = vi.violation_id`;

async function loadAppeal(id) {
  const [rows] = await pool.query(`SELECT ${APPEAL_COLUMNS} ${APPEAL_JOINS} WHERE a.appeal_id = ?`, [id]);
  return rows[0] || null;
}

router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  if (!isStaff(req.user)) { where.push('a.filed_by = ?'); params.push(req.user.id); }
  if (req.query.status) { where.push('a.status = ?'); params.push(String(req.query.status)); }
  const [rows] = await pool.query(
    `SELECT ${APPEAL_COLUMNS} ${APPEAL_JOINS} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY FIELD(a.status, 'Submitted', 'Under Review', 'Accepted', 'Rejected'), a.filed_at DESC LIMIT 200`, params);
  res.json({ data: rows });
});

// File an appeal against a verified, unpaid violation.
router.post('/', requireRole('citizen'), async (req, res) => {
  const violationId = v.int(req.body.violation_id, 'Violation');
  const reason = v.str(req.body.reason, 'Reason', { min: 15, max: 1000 });

  const appealId = await withTransaction(async (conn) => {
    const [[vi]] = await conn.query(
      `SELECT vi.violation_id, vi.status, vi.reference_no, f.status AS fine_status
         FROM violations vi LEFT JOIN fines f ON f.violation_id = vi.violation_id
        WHERE vi.violation_id = ? FOR UPDATE`, [violationId]);
    if (!vi) throw notFound('Violation not found');
    if (vi.status !== 'Verified') throw badRequest('Only verified violations can be appealed');
    if (!['Unpaid', 'Overdue'].includes(vi.fine_status)) throw badRequest('A paid or waived fine cannot be appealed');
    const [open] = await conn.query("SELECT appeal_id FROM appeals WHERE violation_id = ? AND status IN ('Submitted','Under Review')", [violationId]);
    if (open.length) throw conflict('An appeal for this violation is already open');

    const [ins] = await conn.query('INSERT INTO appeals (violation_id, filed_by, reason) VALUES (?, ?, ?)', [violationId, req.user.id, reason]);
    await conn.actor(req.user.id, 'Owner filed an appeal');
    await conn.query("UPDATE violations SET status = 'Appealed' WHERE violation_id = ?", [violationId]);

    const [staff] = await conn.query("SELECT user_id FROM users WHERE role IN ('officer','admin') AND is_active = 1");
    await conn.query('INSERT INTO notifications (user_id, violation_id, title, message) VALUES ?',
      [staff.map((u) => [u.user_id, violationId, 'New appeal filed', `An appeal was filed against ${vi.reference_no}.`])]);
    return ins.insertId;
  });
  res.status(201).json({ appeal: await loadAppeal(appealId) });
});

// Officer / admin decision.
router.patch('/:id/review', requireRole('officer', 'admin'), async (req, res) => {
  const id = v.int(req.params.id, 'Appeal id');
  const decision = v.oneOf(req.body.decision, 'Decision', ['Under Review', 'Accepted', 'Rejected']);
  const notes = v.str(req.body.notes, 'Review notes', { required: decision !== 'Under Review', min: 5, max: 500 });

  await withTransaction(async (conn) => {
    const [[ap]] = await conn.query(
      `SELECT a.*, vi.reference_no FROM appeals a JOIN violations vi ON vi.violation_id = a.violation_id WHERE a.appeal_id = ? FOR UPDATE`, [id]);
    if (!ap) throw notFound('Appeal not found');
    if (!['Submitted', 'Under Review'].includes(ap.status)) throw conflict('This appeal has already been decided');
    if (decision === 'Under Review' && ap.status === 'Under Review') throw conflict('This appeal is already under review');

    if (decision === 'Under Review') {
      await conn.query("UPDATE appeals SET status = 'Under Review', reviewed_by = ? WHERE appeal_id = ?", [req.user.id, id]);
      return;
    }

    await conn.query('UPDATE appeals SET status = ?, reviewed_by = ?, review_notes = ?, resolved_at = NOW() WHERE appeal_id = ?',
      [decision, req.user.id, notes, id]);

    if (decision === 'Accepted') { // overturn: waive the fine, violation no longer stands
      await conn.query("UPDATE fines SET status = 'Waived' WHERE violation_id = ? AND status IN ('Unpaid','Overdue')", [ap.violation_id]);
      await conn.actor(req.user.id, `Appeal accepted: ${notes}`);
      await conn.query("UPDATE violations SET status = 'Rejected' WHERE violation_id = ?", [ap.violation_id]);
    } else { // upheld
      await conn.actor(req.user.id, `Appeal rejected, violation upheld: ${notes}`);
      await conn.query("UPDATE violations SET status = 'Verified' WHERE violation_id = ?", [ap.violation_id]);
    }

    await conn.query('INSERT INTO notifications (user_id, violation_id, title, message) VALUES (?, ?, ?, ?)',
      [ap.filed_by, ap.violation_id, `Appeal ${decision}`,
        decision === 'Accepted' ? `Your appeal for ${ap.reference_no} was accepted. The fine has been waived.`
          : `Your appeal for ${ap.reference_no} was rejected. The violation stands.`]);
  });

  res.json({ appeal: await loadAppeal(id) });
});

module.exports = router;
