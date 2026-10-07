const express = require('express');
const { pool, refreshOverdueFines } = require('../db');
const { requireAuth, isStaff } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// One call returns everything the dashboard and statistics screens draw.
// Citizens get the same shape, scoped to the violations they reported.
router.get('/dashboard', async (req, res) => {
  await refreshOverdueFines();
  const staff = isStaff(req.user);
  const scope = staff ? '1=1' : 'v.reported_by = ?';
  const sp = staff ? [] : [req.user.id];
  const q = async (sql, extra = []) => (await pool.query(sql, [...sp, ...extra]))[0];

  const [kpiRows, moneyRows, trendRows, monthRows, revenueRows, catRows, typeRows, prioRows, zoneRows, hourRows, dowRows,
    locRows, srcRows, statusRows, avgRows] = await Promise.all([
    q(`SELECT COUNT(*) AS total,
          COALESCE(SUM(v.status = 'Pending'), 0) AS pending, COALESCE(SUM(v.status = 'Under Review'), 0) AS under_review,
          COALESCE(SUM(v.status = 'Verified'), 0) AS verified, COALESCE(SUM(v.status = 'Rejected'), 0) AS rejected,
          COALESCE(SUM(v.status = 'Appealed'), 0) AS appealed, COALESCE(SUM(v.status = 'Closed'), 0) AS closed,
          COALESCE(SUM(DATE(v.occurred_at) = CURDATE()), 0) AS today,
          COALESCE(SUM(v.occurred_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS last7,
          COALESCE(SUM(v.occurred_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) AND v.occurred_at < DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS prev7,
          COALESCE(SUM(v.occurred_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS this_month,
          COALESCE(SUM(v.occurred_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                       AND v.occurred_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS last_month
        FROM violations v WHERE ${scope}`),
    q(`SELECT COALESCE(SUM(CASE WHEN f.status <> 'Waived' THEN f.amount END), 0) AS issued,
          COALESCE(SUM(CASE WHEN f.status = 'Paid' THEN f.total_due END), 0) AS collected,
          COALESCE(SUM(CASE WHEN f.status IN ('Unpaid','Overdue') THEN f.total_due END), 0) AS outstanding,
          COALESCE(SUM(f.status = 'Overdue'), 0) AS overdue_count, COALESCE(SUM(f.status = 'Waived'), 0) AS waived_count,
          COUNT(*) AS fines_count
        FROM fines f JOIN violations v ON v.violation_id = f.violation_id WHERE ${scope}`),
    q(`SELECT DATE_FORMAT(v.occurred_at, '%Y-%m-%d') AS d, COUNT(*) AS c FROM violations v
        WHERE v.occurred_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND ${scope} GROUP BY d`),
    q(`SELECT DATE_FORMAT(v.occurred_at, '%Y-%m') AS ym, COUNT(*) AS c FROM violations v
        WHERE v.occurred_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH) AND ${scope} GROUP BY ym`),
    q(`SELECT DATE_FORMAT(f.paid_at, '%Y-%m') AS ym, SUM(f.total_due) AS amount FROM fines f JOIN violations v ON v.violation_id = f.violation_id
        WHERE f.status = 'Paid' AND f.paid_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH) AND ${scope} GROUP BY ym`),
    q(`SELECT c.category_name AS name, c.color_hex AS color, c.icon, COUNT(*) AS count
        FROM violations v JOIN violation_types t ON t.violation_type_id = v.violation_type_id
        JOIN violation_categories c ON c.category_id = t.category_id WHERE ${scope} GROUP BY c.category_id ORDER BY count DESC`),
    q(`SELECT t.violation_name AS name, t.code, c.color_hex AS color, COUNT(*) AS count
        FROM violations v JOIN violation_types t ON t.violation_type_id = v.violation_type_id
        JOIN violation_categories c ON c.category_id = t.category_id WHERE ${scope} GROUP BY t.violation_type_id ORDER BY count DESC LIMIT 8`),
    q(`SELECT v.priority AS name, COUNT(*) AS count FROM violations v WHERE ${scope} GROUP BY v.priority`),
    q(`SELECT l.zone AS name, COUNT(*) AS count FROM violations v JOIN locations l ON l.location_id = v.location_id WHERE ${scope} GROUP BY l.zone ORDER BY count DESC`),
    q(`SELECT HOUR(v.occurred_at) AS h, COUNT(*) AS c FROM violations v WHERE ${scope} GROUP BY h`),
    q(`SELECT DAYOFWEEK(v.occurred_at) AS d, COUNT(*) AS c FROM violations v WHERE ${scope} GROUP BY d`),
    q(`SELECT l.location_id, l.location_name AS name, l.area, l.zone, l.latitude, l.longitude, COUNT(*) AS count
        FROM violations v JOIN locations l ON l.location_id = v.location_id WHERE ${scope} GROUP BY l.location_id ORDER BY count DESC LIMIT 8`),
    q(`SELECT v.source AS name, COUNT(*) AS count FROM violations v WHERE ${scope} GROUP BY v.source`),
    q(`SELECT v.status AS name, COUNT(*) AS count FROM violations v WHERE ${scope} GROUP BY v.status`),
    q(`SELECT AVG(x.hrs) AS avg_hours FROM (
          SELECT h1.violation_id, MIN(TIMESTAMPDIFF(HOUR, h1.changed_at, h2.changed_at)) AS hrs
            FROM violation_status_history h1
            JOIN violation_status_history h2 ON h2.violation_id = h1.violation_id AND h2.new_status = 'Verified'
            JOIN violations v ON v.violation_id = h1.violation_id
           WHERE h1.old_status IS NULL AND ${scope} GROUP BY h1.violation_id) x`),
  ]);

  // fill gaps so charts get continuous series
  const trendMap = Object.fromEntries(trendRows.map((r) => [r.d, r.c]));
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = ymd(d);
    daily.push({ date: key, count: trendMap[key] || 0 });
  }
  const monthMap = Object.fromEntries(monthRows.map((r) => [r.ym, r.c]));
  const revMap = Object.fromEntries(revenueRows.map((r) => [r.ym, r.amount]));
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    monthly.push({ month: key, label: d.toLocaleString('en-US', { month: 'short' }), count: monthMap[key] || 0, collected: revMap[key] || 0 });
  }
  const hourMap = Object.fromEntries(hourRows.map((r) => [r.h, r.c]));
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] || 0 }));
  const dowMap = Object.fromEntries(dowRows.map((r) => [r.d, r.c]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, i) => ({ name, count: dowMap[i + 1] || 0 }));

  const money = moneyRows[0];
  const out = {
    scope: staff ? 'all' : 'mine',
    kpis: { ...kpiRows[0], avg_verify_hours: avgRows[0].avg_hours === null ? null : Math.round(avgRows[0].avg_hours * 10) / 10 },
    money: { ...money, collection_rate: money.issued ? Math.round((money.collected / (money.collected + money.outstanding || 1)) * 1000) / 10 : 0 },
    daily, monthly, hourly, weekday,
    byCategory: catRows, byType: typeRows, byPriority: prioRows, byZone: zoneRows, byStatus: statusRows, bySource: srcRows, topLocations: locRows,
  };

  if (staff) {
    const [offenders] = await pool.query(
      `SELECT plate_number, owner_name, total_violations, penalty_points, outstanding, last_violation_at
         FROM v_vehicle_offence_summary WHERE total_violations > 0 ORDER BY total_violations DESC, penalty_points DESC LIMIT 6`);
    const [officers] = await pool.query(
      `SELECT o.officer_id, u.full_name AS name, o.badge_number AS badge, ps.station_name AS station,
              COUNT(v.violation_id) AS handled,
              COALESCE(SUM(v.status IN ('Verified','Appealed','Closed')), 0) AS verified,
              COALESCE(SUM(v.status = 'Rejected'), 0) AS rejected,
              COALESCE(SUM(v.status = 'Under Review'), 0) AS in_review
         FROM officers o JOIN users u ON u.user_id = o.user_id JOIN police_stations ps ON ps.station_id = o.station_id
         LEFT JOIN violations v ON v.assigned_officer_id = o.officer_id
        GROUP BY o.officer_id, u.full_name, o.badge_number, ps.station_name ORDER BY handled DESC`);
    out.topOffenders = offenders;
    out.officers = officers;
  }
  res.json(out);
});

module.exports = router;
