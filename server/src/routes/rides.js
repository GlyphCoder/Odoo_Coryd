import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';
import { getRoute, haversineKm } from '../utils/geo.js';

const router = Router();
router.use(requireAuth, requireEmployee);

const RIDE_JOIN = `
  SELECT r.*,
         u.full_name  AS driver_name,
         u.phone_number AS driver_phone,
         v.vehicle_model, v.registration_number, v.seating_capacity, v.fuel_type
  FROM rides r
  JOIN employees e ON e.employee_id = r.driver_employee_id AND e.organization_id = r.organization_id
  JOIN users u     ON u.user_id = e.user_id
  JOIN vehicles v  ON v.vehicle_id = r.vehicle_id AND v.organization_id = r.organization_id
`;

/**
 * GET /api/rides — search open rides (org-scoped).
 * query: date (YYYY-MM-DD), seats, pickupLat, pickupLng, destLat, destLng, radiusKm
 */
router.get('/', asyncHandler(async (req, res) => {
  const { date, seats, pickupLat, pickupLng, destLat, destLng } = req.query;
  const radiusKm = parseFloat(req.query.radiusKm) || 15;
  const seatsNeeded = parseInt(seats, 10) || 1;

  const params = [req.auth.orgId, seatsNeeded];
  let sql = `${RIDE_JOIN}
    WHERE r.organization_id = $1
      AND r.status = 'OPEN'
      AND r.available_seats >= $2::smallint
      AND r.departure_datetime >= now() - interval '1 hour'`;
  sql += ' ORDER BY r.departure_datetime ASC LIMIT 200';

  let rows = (await query(sql, params)).rows;

  if (date) {
    const requestedDate = new Date(`${date}T12:00:00`);
    const targetDay = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][requestedDate.getDay()];
    rows = rows.filter((r) => {
      const depDate = new Date(r.departure_datetime);
      const rideDate = depDate.toISOString().slice(0, 10);
      const recurrence = typeof r.recurrence_pattern === 'string'
        ? JSON.parse(r.recurrence_pattern)
        : (r.recurrence_pattern || {});
      const allowedDays = Array.isArray(recurrence.days) ? recurrence.days : [];
      return rideDate === date || (r.is_recurring && allowedDays.includes(targetDay));
    });
  }

  // Optional proximity filter — ONLY applied when pickup coords are provided.
  // If no coords given, return all org rides so users can browse without GPS.
  if (pickupLat && pickupLng && !isNaN(+pickupLat) && !isNaN(+pickupLng)) {
    const p = { lat: +pickupLat, lng: +pickupLng };
    const d = destLat && destLng && !isNaN(+destLat) ? { lat: +destLat, lng: +destLng } : null;
    rows = rows
      .map((r) => {
        const pickupDist = haversineKm(p, { lat: +r.pickup_lat, lng: +r.pickup_lng });
        const destDist = d ? haversineKm(d, { lat: +r.destination_lat, lng: +r.destination_lng }) : 0;
        return { ...r, pickup_distance_km: pickupDist, dest_distance_km: destDist };
      })
      .filter((r) => r.pickup_distance_km <= radiusKm && (!d || r.dest_distance_km <= radiusKm))
      .sort((a, b) => (a.pickup_distance_km + a.dest_distance_km) - (b.pickup_distance_km + b.dest_distance_km));
  }

  res.json({ rides: rows });
}));

/** GET /api/rides/mine — rides I published. */
router.get('/mine', asyncHandler(async (req, res) => {
  const rows = (await query(
    `${RIDE_JOIN} WHERE r.organization_id = $1 AND r.driver_employee_id = $2 ORDER BY r.departure_datetime DESC`,
    [req.auth.orgId, req.auth.employeeId]
  )).rows;
  res.json({ rides: rows });
}));

/** GET /api/rides/:id */
router.get('/:id', asyncHandler(async (req, res) => {
  const ride = (await query(`${RIDE_JOIN} WHERE r.organization_id = $1 AND r.ride_id = $2`,
    [req.auth.orgId, req.params.id])).rows[0];
  if (!ride) throw notFound('Ride not found');
  const bookings = (await query(
    `SELECT b.*, u.full_name AS passenger_name, u.phone_number AS passenger_phone
     FROM ride_bookings b
     JOIN employees e ON e.employee_id = b.passenger_employee_id AND e.organization_id = b.organization_id
     JOIN users u ON u.user_id = e.user_id
     WHERE b.organization_id = $1 AND b.ride_id = $2 AND b.booking_status = 'CONFIRMED'`,
    [req.auth.orgId, req.params.id]
  )).rows;
  res.json({ ride, bookings });
}));

/** POST /api/rides — publish a ride (driver). */
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  // farePerSeat is no longer accepted from the driver — calculated server-side.
  const required = ['vehicleId', 'pickupAddress', 'pickupLat', 'pickupLng',
    'destinationAddress', 'destinationLat', 'destinationLng', 'departureDatetime', 'totalSeats'];
  for (const k of required) if (b[k] == null || b[k] === '') throw badRequest(`${k} is required`);

  // Vehicle must belong to this driver in this org.
  const vehicle = (await query(
    'SELECT * FROM vehicles WHERE vehicle_id = $1 AND organization_id = $2 AND employee_id = $3 AND is_active = TRUE',
    [b.vehicleId, req.auth.orgId, req.auth.employeeId]
  )).rows[0];
  if (!vehicle) throw badRequest('Select a registered vehicle you own before offering a ride');
  if (b.totalSeats > vehicle.seating_capacity) {
    throw badRequest(`Seats offered cannot exceed vehicle capacity (${vehicle.seating_capacity})`);
  }

  // Compute route (distance/duration/polyline) from driver's full pickup→destination.
  // Free OSRM, fallback to haversine.
  let distanceKm = null;
  let durationMinutes = null;
  let polyline = null;
  try {
    const route = await getRoute(
      { lat: +b.pickupLat, lng: +b.pickupLng },
      { lat: +b.destinationLat, lng: +b.destinationLng }
    );
    distanceKm = route.distanceKm;
    durationMinutes = route.durationMinutes;
    polyline = JSON.stringify(route.geometry);
  } catch {
    distanceKm = haversineKm(
      { lat: +b.pickupLat, lng: +b.pickupLng },
      { lat: +b.destinationLat, lng: +b.destinationLng }
    );
  }

  // Fetch admin-configured cost_per_km for this organisation, then auto-calculate fare.
  const settings = (await query(
    'SELECT cost_per_km FROM organization_settings WHERE organization_id = $1',
    [req.auth.orgId]
  )).rows[0];
  const costPerKm = Number(settings?.cost_per_km ?? 0);
  // fare_per_seat = cost_per_km × driver's full route distance (min ₹1 when rate is set).
  const farePerSeat = costPerKm > 0 && distanceKm
    ? Math.max(1, +(costPerKm * distanceKm).toFixed(2))
    : 0;

  const row = (await query(
    `INSERT INTO rides (
       organization_id, driver_employee_id, vehicle_id,
       pickup_address, pickup_lat, pickup_lng,
       destination_address, destination_lat, destination_lng,
       route_polyline, distance_km, duration_minutes,
       departure_datetime, total_seats, available_seats, fare_per_seat,
       is_recurring, recurrence_pattern, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::smallint,$14::smallint,$15,$16,$17,'OPEN')
     RETURNING *`,
    [req.auth.orgId, req.auth.employeeId, b.vehicleId,
     b.pickupAddress, b.pickupLat, b.pickupLng,
     b.destinationAddress, b.destinationLat, b.destinationLng,
     polyline, distanceKm, durationMinutes,
     b.departureDatetime, parseInt(b.totalSeats, 10), farePerSeat,
     !!b.isRecurring, b.recurrencePattern ? JSON.stringify(b.recurrencePattern) : null]
  )).rows[0];

  res.status(201).json({ ride: row });
}));

/** PATCH /api/rides/:id/cancel — driver cancels an open ride. */
router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const ride = (await query(
    `UPDATE rides SET status = 'CANCELLED', updated_at = now()
     WHERE ride_id = $1 AND organization_id = $2 AND driver_employee_id = $3
       AND status IN ('OPEN','DRAFT','FULL') RETURNING *`,
    [req.params.id, req.auth.orgId, req.auth.employeeId]
  )).rows[0];
  if (!ride) throw notFound('Ride not found or cannot be cancelled');
  // Cancel outstanding bookings + trips.
  await query(
    `UPDATE ride_bookings SET booking_status='CANCELLED', cancelled_at=now()
     WHERE ride_id=$1 AND organization_id=$2 AND booking_status='CONFIRMED'`,
    [req.params.id, req.auth.orgId]);
  await query(
    `UPDATE trips SET status='CANCELLED', updated_at=now()
     WHERE ride_id=$1 AND organization_id=$2 AND status IN ('BOOKED','STARTED','IN_PROGRESS')`,
    [req.params.id, req.auth.orgId]);
  res.json({ ride });
}));

export default router;
