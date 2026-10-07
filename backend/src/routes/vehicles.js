const express = require('express');
const { pool, refreshOverdueFines } = require('../db');
const { requireAuth, requireRole, isStaff } = require('../middleware/auth');
const v = require('../utils/validate');
const { notFound } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Loads one vehicle with owner info, offence totals and full violation history.
async function loadVehicle(where, params, user) {
  const [rows] = await pool.query(
    `SELECT vh.vehicle_id, vh.plate_number, vh.make, vh.model, vh.color, vh.registered_state,
            vh.insurance_valid_till, vh.puc_valid_till, vty.type_name AS vehicle_type,
            o.owner_id, o.full_name AS owner_name, o.phone AS owner_phone, o.license_number, o.license_valid_till
       FROM vehicles vh
       JOIN vehicle_types vty ON vty.vehicle_type_id = vh.vehicle_type_id
       LEFT JOIN owners o ON o.owner_id = vh.owner_id
      WHERE ${where}`,
    params
  );
  const vehicle = rows[0];
  if (!vehicle) return null;

  await refreshOverdueFines();
  const [[summary]] = await pool.query('SELECT * FROM v_vehicle_offence_summary WHERE vehicle_id = ?', [vehicle.vehicle_id]);
  const [violations] = await pool.query(
    `SELECT violation_id, reference_no, occurred_at, status, priority, violation_code, violation_name, category_name, category_color,
            location_name, area, fine_id, fine_amount, late_fee, total_due, fine_status, fine_due_date
       FROM v_violation_details WHERE vehicle_id = ? ORDER BY occurred_at DESC LIMIT 50`,
    [vehicle.vehicle_id]
  );

  const today = new Date();
  vehicle.insurance_valid = vehicle.insurance_valid_till ? new Date(vehicle.insurance_valid_till) >= today : null;
  vehicle.puc_valid = vehicle.puc_valid_till ? new Date(vehicle.puc_valid_till) >= today : null;
  vehicle.license_valid = vehicle.license_valid_till ? new Date(vehicle.license_valid_till) >= today : null;

  if (!isStaff(user)) { // citizens see a reduced owner profile
    vehicle.owner_phone = null;
    vehicle.license_number = vehicle.license_number ? vehicle.license_number.slice(0, 4) + '•••••••' + vehicle.license_number.slice(-3) : null;
  }
  return { vehicle, summary, violations };
}

// Look up by registration number (all roles - like the public e-challan portal).
router.get('/lookup', async (req, res) => {
  const plate = v.plate(req.query.plate);
  const data = await loadVehicle('vh.plate_number = ?', [plate], req.user);
  if (!data) throw notFound(`No vehicle found with registration ${plate}`);
  res.json(data);
});

// Search the registry (officers / admins).
router.get('/', requireRole('officer', 'admin'), async (req, res) => {
  const search = String(req.query.search || '').trim();
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const params = [];
  let where = '1=1';
  if (search) {
    where = '(s.plate_number LIKE ? OR s.owner_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.query(
    `SELECT s.*, vh.make, vh.model, vty.type_name AS vehicle_type
       FROM v_vehicle_offence_summary s
       JOIN vehicles vh ON vh.vehicle_id = s.vehicle_id
       JOIN vehicle_types vty ON vty.vehicle_type_id = vh.vehicle_type_id
      WHERE ${where} ORDER BY s.total_violations DESC, s.penalty_points DESC LIMIT ?`,
    [...params, limit]
  );
  res.json({ data: rows });
});

router.get('/:id', async (req, res) => {
  const id = v.int(req.params.id, 'Vehicle id');
  const data = await loadVehicle('vh.vehicle_id = ?', [id], req.user);
  if (!data) throw notFound('Vehicle not found');
  res.json(data);
});

module.exports = router;
