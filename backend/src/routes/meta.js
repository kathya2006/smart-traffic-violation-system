const express = require('express');
const { pool } = require('../db');
const { requireAuth, isStaff } = require('../middleware/auth');

const router = express.Router();

// Everything the forms need in one round-trip (dropdown data).
router.get('/', requireAuth, async (req, res) => {
  const [violationTypes] = await pool.query(
    `SELECT t.violation_type_id AS id, t.code, t.violation_name AS name, t.description, t.base_fine, t.penalty_points,
            t.severity, t.law_reference, c.category_id, c.category_name, c.icon, c.color_hex AS color
       FROM violation_types t JOIN violation_categories c ON c.category_id = t.category_id
      WHERE t.is_active = 1 ORDER BY c.category_id, t.code`
  );
  const [categories] = await pool.query('SELECT category_id AS id, category_name AS name, icon, color_hex AS color FROM violation_categories ORDER BY category_id');
  const [locations] = await pool.query(
    'SELECT location_id AS id, location_name AS name, area, city, zone, latitude, longitude, speed_limit_kmph, has_camera FROM locations ORDER BY location_name'
  );
  const [vehicleTypes] = await pool.query('SELECT vehicle_type_id AS id, type_name AS name FROM vehicle_types ORDER BY vehicle_type_id');

  const meta = { violationTypes, categories, locations, vehicleTypes };

  if (isStaff(req.user)) {
    const [officers] = await pool.query(
      `SELECT o.officer_id AS id, u.full_name AS name, o.badge_number AS badge, o.rank_title AS rank_title, ps.station_name AS station
         FROM officers o JOIN users u ON u.user_id = o.user_id JOIN police_stations ps ON ps.station_id = o.station_id
        WHERE u.is_active = 1 ORDER BY u.full_name`
    );
    meta.officers = officers;
  }
  res.json(meta);
});

module.exports = router;
