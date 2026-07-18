import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTenant } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

/** GET /api/admin/overview — org-wide KPIs + reports. */
router.get('/overview', asyncHandler(async (req, res) => {
  const orgId = req.auth.orgId;
  const from = req.query.from || null;
  const to = req.query.to || null;
  const dateFilter = from && to ? 'AND trip_date BETWEEN $2 AND $3' : '';
  const params = from && to ? [orgId, from, to] : [orgId];

  const totals = (await query(
    `SELECT COUNT(*)::int AS total_trips,
            COALESCE(SUM(distance_km),0) AS total_distance,
            COALESCE(SUM(fare_amount),0) AS total_revenue,
            COALESCE(SUM(fuel_cost),0) AS total_fuel_cost
     FROM ride_history WHERE organization_id=$1 ${dateFilter}`, params)).rows[0];

  const costPerKm = Number(totals.total_distance) > 0
    ? +(Number(totals.total_fuel_cost) / Number(totals.total_distance)).toFixed(2) : 0;

  const perVehicle = (await query(
    `SELECT v.vehicle_model, v.registration_number,
            COUNT(*)::int AS trips,
            COALESCE(SUM(h.distance_km),0) AS distance,
            COALESCE(SUM(h.fuel_cost),0) AS fuel_cost
     FROM ride_history h
     JOIN vehicles v ON v.vehicle_id=h.vehicle_id AND v.organization_id=h.organization_id
     WHERE h.organization_id=$1 ${dateFilter}
     GROUP BY v.vehicle_id, v.vehicle_model, v.registration_number
     ORDER BY distance DESC`, params)).rows;

  const monthly = (await query(
    `SELECT to_char(date_trunc('month', trip_date),'YYYY-MM') AS month,
            COUNT(*)::int AS trips, COALESCE(SUM(distance_km),0) AS distance,
            COALESCE(SUM(fuel_cost),0) AS fuel_cost
     FROM ride_history WHERE organization_id=$1
     GROUP BY 1 ORDER BY 1 DESC LIMIT 6`, [orgId])).rows;

  const participation = (await query(
    `SELECT
       (SELECT COUNT(*)::int FROM employees WHERE organization_id=$1 AND status='ACTIVE') AS active_employees,
       (SELECT COUNT(DISTINCT driver_employee_id)::int FROM rides WHERE organization_id=$1) AS active_drivers,
       (SELECT COUNT(*)::int FROM rides WHERE organization_id=$1 AND status='OPEN') AS open_rides,
       (SELECT COUNT(*)::int FROM vehicles WHERE organization_id=$1 AND is_active=TRUE) AS vehicles`,
    [orgId])).rows[0];

  res.json({ totals: { ...totals, cost_per_km: costPerKm }, perVehicle, monthly: monthly.reverse(), participation });
}));

/** GET /api/admin/employees */
router.get('/employees', asyncHandler(async (req, res) => {
  const rows = (await query(
    `SELECT e.employee_id, e.employee_code, e.department, e.designation, e.status, e.joined_at,
            u.full_name, u.email, u.phone_number
     FROM employees e JOIN users u ON u.user_id=e.user_id
     WHERE e.organization_id=$1 ORDER BY u.full_name`,
    [req.auth.orgId])).rows;
  res.json({ employees: rows });
}));

/** POST /api/admin/employees — add an employee (creates user + employee + wallet). */
router.post('/employees', asyncHandler(async (req, res) => {
  const { email, fullName, password, phoneNumber, employeeCode, department, designation } = req.body || {};
  if (!email || !fullName || !password) throw badRequest('email, fullName and password are required');
  const orgId = req.auth.orgId;

  const emp = await withTenant(orgId, async (client) => {
    let user = (await client.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])).rows[0];
    if (user) {
      const existing = (await client.query('SELECT 1 FROM employees WHERE user_id=$1', [user.user_id])).rows[0];
      if (existing) throw badRequest('User already belongs to an organization');
    } else {
      const hash = await bcrypt.hash(password, 10);
      user = (await client.query(
        `INSERT INTO users (email, phone_number, password_hash, full_name) VALUES ($1,$2,$3,$4) RETURNING *`,
        [email.toLowerCase(), phoneNumber || null, hash, fullName])).rows[0];
    }
    const e = (await client.query(
      `INSERT INTO employees (organization_id, user_id, employee_code, department, designation, status)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE') RETURNING *`,
      [orgId, user.user_id, employeeCode || null, department || null, designation || null])).rows[0];
    await client.query(`INSERT INTO wallets (organization_id, employee_id, balance) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`,
      [orgId, e.employee_id]);
    return { ...e, full_name: user.full_name, email: user.email };
  });

  res.status(201).json({ employee: emp });
}));

/** PATCH /api/admin/employees/:id/status — activate / deactivate / suspend. */
router.patch('/employees/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING'].includes(status)) throw badRequest('Invalid status');
  const row = (await query(
    `UPDATE employees SET status=$3, updated_at=now() WHERE employee_id=$1 AND organization_id=$2 RETURNING employee_id, status`,
    [req.params.id, req.auth.orgId, status])).rows[0];
  if (!row) throw notFound('Employee not found');
  res.json({ employee: row });
}));

/** GET /api/admin/vehicles — all org vehicles (for verification). */
router.get('/vehicles', asyncHandler(async (req, res) => {
  const rows = (await query(
    `SELECT v.*, u.full_name AS owner_name
     FROM vehicles v
     JOIN employees e ON e.employee_id=v.employee_id AND e.organization_id=v.organization_id
     JOIN users u ON u.user_id=e.user_id
     WHERE v.organization_id=$1 ORDER BY v.created_at DESC`,
    [req.auth.orgId])).rows;
  res.json({ vehicles: rows });
}));

/** PATCH /api/admin/vehicles/:id/verify — { isVerified } */
router.patch('/vehicles/:id/verify', asyncHandler(async (req, res) => {
  const isVerified = !!req.body?.isVerified;
  const row = (await query(
    `UPDATE vehicles SET is_verified=$3, updated_at=now() WHERE vehicle_id=$1 AND organization_id=$2 RETURNING vehicle_id, is_verified`,
    [req.params.id, req.auth.orgId, isVerified])).rows[0];
  if (!row) throw notFound('Vehicle not found');
  res.json({ vehicle: row });
}));

/** GET /api/admin/settings */
router.get('/settings', asyncHandler(async (req, res) => {
  let row = (await query('SELECT * FROM organization_settings WHERE organization_id=$1', [req.auth.orgId])).rows[0];
  if (!row) {
    row = (await query('INSERT INTO organization_settings (organization_id) VALUES ($1) RETURNING *', [req.auth.orgId])).rows[0];
  }
  res.json({ settings: row });
}));

/** PATCH /api/admin/settings */
router.patch('/settings', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const row = (await query(
    `INSERT INTO organization_settings (organization_id, fuel_cost_per_litre, avg_fuel_efficiency_kmpl, cost_per_km, max_ride_radius_km, allow_cash_payment, allow_recurring_rides)
     VALUES ($1, COALESCE($2,0), COALESCE($3,15), COALESCE($4,0), COALESCE($5,50), COALESCE($6,TRUE), COALESCE($7,TRUE))
     ON CONFLICT (organization_id) DO UPDATE SET
       fuel_cost_per_litre = COALESCE($2, organization_settings.fuel_cost_per_litre),
       avg_fuel_efficiency_kmpl = COALESCE($3, organization_settings.avg_fuel_efficiency_kmpl),
       cost_per_km = COALESCE($4, organization_settings.cost_per_km),
       max_ride_radius_km = COALESCE($5, organization_settings.max_ride_radius_km),
       allow_cash_payment = COALESCE($6, organization_settings.allow_cash_payment),
       allow_recurring_rides = COALESCE($7, organization_settings.allow_recurring_rides),
       updated_at = now()
     RETURNING *`,
    [req.auth.orgId, b.fuelCostPerLitre ?? null, b.avgFuelEfficiencyKmpl ?? null, b.costPerKm ?? null,
     b.maxRideRadiusKm ?? null, typeof b.allowCashPayment === 'boolean' ? b.allowCashPayment : null,
     typeof b.allowRecurringRides === 'boolean' ? b.allowRecurringRides : null])).rows[0];
  res.json({ settings: row });
}));

export default router;
