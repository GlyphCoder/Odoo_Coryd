import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireEmployee);

/** GET /api/reports/me — employee-scoped stats (as driver and passenger). */
router.get('/me', asyncHandler(async (req, res) => {
  const orgId = req.auth.orgId;
  const emp = req.auth.employeeId;

  const asDriver = (await query(
    `SELECT COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0) AS distance, COALESCE(SUM(fare_amount),0) AS earned,
            COALESCE(SUM(fuel_cost),0) AS fuel_cost
     FROM ride_history WHERE organization_id=$1 AND driver_employee_id=$2`,
    [orgId, emp])).rows[0];

  const asPassenger = (await query(
    `SELECT COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0) AS distance, COALESCE(SUM(fare_amount),0) AS spent
     FROM ride_history WHERE organization_id=$1 AND passenger_employee_id=$2`,
    [orgId, emp])).rows[0];

  const monthly = (await query(
    `SELECT to_char(date_trunc('month', trip_date),'YYYY-MM') AS month,
            COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0) AS distance
     FROM ride_history
     WHERE organization_id=$1 AND (driver_employee_id=$2 OR passenger_employee_id=$2)
     GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
    [orgId, emp])).rows;

  res.json({ asDriver, asPassenger, monthly: monthly.reverse() });
}));

/** GET /api/reports/history — my completed ride history. ?role=driver|passenger|all */
router.get('/history', asyncHandler(async (req, res) => {
  const role = req.query.role || 'all';
  let cond = '(h.driver_employee_id=$2 OR h.passenger_employee_id=$2)';
  if (role === 'driver') cond = 'h.driver_employee_id=$2';
  if (role === 'passenger') cond = 'h.passenger_employee_id=$2';
  const rows = (await query(
    `SELECT h.*, du.full_name AS driver_name, pu.full_name AS passenger_name
     FROM ride_history h
     JOIN employees de ON de.employee_id=h.driver_employee_id AND de.organization_id=h.organization_id
     JOIN users du ON du.user_id=de.user_id
     JOIN employees pe ON pe.employee_id=h.passenger_employee_id AND pe.organization_id=h.organization_id
     JOIN users pu ON pu.user_id=pe.user_id
     WHERE h.organization_id=$1 AND ${cond}
     ORDER BY h.trip_date DESC, h.created_at DESC LIMIT 200`,
    [req.auth.orgId, req.auth.employeeId])).rows;
  res.json({ history: rows });
}));

export default router;
