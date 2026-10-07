const crypto = require('crypto');
const express = require('express');
const { pool, withTransaction, refreshOverdueFines } = require('../db');
const { requireAuth, requireRole, isStaff } = require('../middleware/auth');
const v = require('../utils/validate');
const { badRequest, forbidden, notFound, conflict } = require('../utils/http');

const finesRouter = express.Router();
const paymentsRouter = express.Router();
finesRouter.use(requireAuth);
paymentsRouter.use(requireAuth);

const FINE_STATUSES = ['Unpaid', 'Paid', 'Overdue', 'Waived'];

// ------------------------------------------------------------------ list fines
// Staff: every fine, filterable.  Citizens: the e-challan style lookup - they must supply a registration number.
finesRouter.get('/', async (req, res) => {
  await refreshOverdueFines();
  const where = ['v.fine_id IS NOT NULL'];
  const params = [];

  if (!isStaff(req.user)) {
    where.push('v.plate_number = ?');
    params.push(v.plate(req.query.plate));
  } else if (req.query.plate) {
    where.push('v.plate_number = ?');
    params.push(v.plate(req.query.plate));
  }
  if (req.query.status && FINE_STATUSES.includes(req.query.status)) { where.push('v.fine_status = ?'); params.push(req.query.status); }
  if (req.query.search) {
    const s = String(req.query.search).trim();
    where.push("(REPLACE(v.plate_number,' ','') LIKE ? OR v.reference_no LIKE ? OR v.owner_name LIKE ?)");
    params.push(`%${s.toUpperCase().replace(/[^A-Z0-9]/g, '') || '\u0000'}%`, `%${s}%`, `%${s}%`);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
  const whereSql = 'WHERE ' + where.join(' AND ');

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(CASE WHEN v.fine_status IN ('Unpaid','Overdue') THEN v.total_due END), 0) AS outstanding,
            COALESCE(SUM(CASE WHEN v.fine_status = 'Paid' THEN v.total_due END), 0) AS paid,
            COALESCE(SUM(CASE WHEN v.fine_status = 'Overdue' THEN 1 ELSE 0 END), 0) AS overdue_count
       FROM v_violation_details v ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT v.fine_id, v.violation_id, v.reference_no, v.plate_number, v.owner_name, v.violation_name, v.category_name, v.category_color,
            v.location_name, v.occurred_at, v.status AS violation_status, v.fine_amount, v.late_fee, v.total_due,
            v.fine_status, v.fine_due_date, v.fine_paid_at
       FROM v_violation_details v ${whereSql}
      ORDER BY FIELD(v.fine_status, 'Overdue', 'Unpaid', 'Paid', 'Waived'), v.fine_due_date ASC, v.fine_id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]);

  res.json({ data: rows, totals, page, limit, total: totals.count, pages: Math.max(1, Math.ceil(totals.count / limit)) });
});

// ------------------------------------------------------------------ pay a fine (simulated gateway)
finesRouter.post('/:id/pay', async (req, res) => {
  const id = v.int(req.params.id, 'Fine id');
  const method = v.oneOf(req.body.method, 'Payment method', ['UPI', 'Card', 'NetBanking', 'Cash']);
  if (method === 'Cash' && !isStaff(req.user)) throw forbidden('Cash payments are recorded by traffic officers only');

  const payment = await withTransaction(async (conn) => {
    const [[fine]] = await conn.query(
      `SELECT f.fine_id, f.status, f.total_due, f.violation_id, vi.status AS violation_status, vi.reference_no
         FROM fines f JOIN violations vi ON vi.violation_id = f.violation_id WHERE f.fine_id = ? FOR UPDATE`, [id]);
    if (!fine) throw notFound('Fine not found');
    if (fine.status === 'Paid') throw conflict('This fine has already been paid');
    if (fine.status === 'Waived') throw conflict('This fine was waived');
    if (fine.violation_status === 'Appealed') throw conflict('This fine is under appeal and cannot be paid until the appeal is decided');
    if (fine.violation_status !== 'Verified') throw conflict('Only verified violations can be paid');

    // keep the amount in sync with the late fee for overdue fines
    await refreshOverdueFines(conn);
    const [[fresh]] = await conn.query('SELECT total_due FROM fines WHERE fine_id = ?', [id]);

    const ref = `TXN${Date.now()}${crypto.randomInt(1000, 9999)}`;
    await conn.actor(req.user.id, `Fine paid via ${method} (${ref})`);
    // trg_payments_ai marks the fine Paid and closes the violation
    const [ins] = await conn.query(
      'INSERT INTO payments (fine_id, paid_by, amount, method, transaction_ref) VALUES (?, ?, ?, ?, ?)',
      [id, req.user.id, fresh.total_due, method, ref]);

    const [[row]] = await conn.query('SELECT payment_id, fine_id, amount, method, transaction_ref, paid_at FROM payments WHERE payment_id = ?', [ins.insertId]);
    return { ...row, reference_no: fine.reference_no, violation_id: fine.violation_id };
  });

  res.status(201).json({ payment });
});

// ------------------------------------------------------------------ waive a fine (admin)
finesRouter.post('/:id/waive', requireRole('admin'), async (req, res) => {
  const id = v.int(req.params.id, 'Fine id');
  const reason = v.str(req.body.reason, 'Reason', { min: 5, max: 200 });
  await withTransaction(async (conn) => {
    const [[fine]] = await conn.query('SELECT fine_id, status, violation_id FROM fines WHERE fine_id = ? FOR UPDATE', [id]);
    if (!fine) throw notFound('Fine not found');
    if (!['Unpaid', 'Overdue'].includes(fine.status)) throw badRequest(`A fine that is ${fine.status} cannot be waived`);
    await conn.query("UPDATE fines SET status = 'Waived' WHERE fine_id = ?", [id]);
    await conn.actor(req.user.id, `Fine waived: ${reason}`);
    await conn.query("UPDATE violations SET status = 'Closed' WHERE violation_id = ? AND status IN ('Verified','Appealed')", [fine.violation_id]);
  });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ payment history
paymentsRouter.get('/', async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 25);
  const where = isStaff(req.user) ? '' : 'WHERE p.paid_by = ?';
  const [rows] = await pool.query(
    `SELECT p.payment_id, p.amount, p.method, p.transaction_ref, p.paid_at, f.fine_id, vi.violation_id, vi.reference_no,
            vh.plate_number, t.violation_name, u.full_name AS paid_by_name
       FROM payments p
       JOIN fines f ON f.fine_id = p.fine_id
       JOIN violations vi ON vi.violation_id = f.violation_id
       JOIN vehicles vh ON vh.vehicle_id = vi.vehicle_id
       JOIN violation_types t ON t.violation_type_id = vi.violation_type_id
       LEFT JOIN users u ON u.user_id = p.paid_by
       ${where} ORDER BY p.paid_at DESC, p.payment_id DESC LIMIT ?`,
    isStaff(req.user) ? [limit] : [req.user.id, limit]);
  res.json({ data: rows });
});

module.exports = { finesRouter, paymentsRouter };
