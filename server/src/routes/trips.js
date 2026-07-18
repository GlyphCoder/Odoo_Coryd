import { Router } from 'express';
import { query, withTenant } from '../db.js';
import { asyncHandler, badRequest, notFound, forbidden } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireEmployee);

const TRIP_JOIN = `
  SELECT t.*,
         r.pickup_address, r.pickup_lat, r.pickup_lng,
         r.destination_address, r.destination_lat, r.destination_lng,
         r.route_polyline, r.distance_km, r.departure_datetime, r.fare_per_seat,
         du.full_name AS driver_name, du.phone_number AS driver_phone,
         pu.full_name AS passenger_name, pu.phone_number AS passenger_phone,
         v.vehicle_model, v.registration_number,
         bk.seats_booked, bk.fare_amount
  FROM trips t
  JOIN rides r      ON r.ride_id = t.ride_id AND r.organization_id = t.organization_id
  JOIN vehicles v   ON v.vehicle_id = r.vehicle_id AND v.organization_id = r.organization_id
  JOIN employees de ON de.employee_id = t.driver_employee_id AND de.organization_id = t.organization_id
  JOIN users du     ON du.user_id = de.user_id
  JOIN employees pe ON pe.employee_id = t.passenger_employee_id AND pe.organization_id = t.organization_id
  JOIN users pu     ON pu.user_id = pe.user_id
  LEFT JOIN ride_bookings bk ON bk.booking_id = t.booking_id AND bk.organization_id = t.organization_id
`;

function isParticipant(trip, employeeId) {
  return trip.driver_employee_id === employeeId || trip.passenger_employee_id === employeeId;
}

/** GET /api/trips — my trips (as driver or passenger). ?role=driver|passenger|all */
router.get('/', asyncHandler(async (req, res) => {
  const role = req.query.role || 'all';
  const params = [req.auth.orgId, req.auth.employeeId];
  let cond = '(t.driver_employee_id = $2 OR t.passenger_employee_id = $2)';
  if (role === 'driver') cond = 't.driver_employee_id = $2';
  if (role === 'passenger') cond = 't.passenger_employee_id = $2';
  const rows = (await query(
    `${TRIP_JOIN} WHERE t.organization_id = $1 AND ${cond} ORDER BY r.departure_datetime DESC`,
    params
  )).rows;
  res.json({ trips: rows });
}));

/** GET /api/trips/:id */
router.get('/:id', asyncHandler(async (req, res) => {
  const trip = (await query(`${TRIP_JOIN} WHERE t.organization_id=$1 AND t.trip_id=$2`,
    [req.auth.orgId, req.params.id])).rows[0];
  if (!trip) throw notFound('Trip not found');
  if (!isParticipant(trip, req.auth.employeeId)) throw forbidden('Not a participant of this trip');

  const payment = (await query(
    `SELECT * FROM payments WHERE organization_id=$1 AND trip_id=$2 ORDER BY created_at DESC LIMIT 1`,
    [req.auth.orgId, req.params.id])).rows[0] || null;
  const lastPing = (await query(
    `SELECT latitude, longitude, speed_kmph, heading_degrees, eta_minutes, recorded_at
     FROM live_location_ping WHERE organization_id=$1 AND trip_id=$2 ORDER BY recorded_at DESC LIMIT 1`,
    [req.auth.orgId, req.params.id])).rows[0] || null;

  res.json({ trip, payment, lastPing });
}));

const ALLOWED = {
  STARTED: ['BOOKED'],
  IN_PROGRESS: ['STARTED'],
  COMPLETED: ['IN_PROGRESS', 'STARTED'],
  CANCELLED: ['BOOKED', 'STARTED', 'IN_PROGRESS'],
};

/**
 * PATCH /api/trips/:id/status — advance the trip lifecycle.
 * body: { status: 'STARTED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED', actualDistanceKm?, actualDurationMinutes? }
 * Only the driver may START / progress / COMPLETE. Either party may CANCEL a not-yet-started trip.
 */
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!ALLOWED[status]) throw badRequest('Invalid target status');
  const orgId = req.auth.orgId;
  const me = req.auth.employeeId;

  const out = await withTenant(orgId, async (client) => {
    const trip = (await client.query(
      `SELECT * FROM trips WHERE trip_id=$1 AND organization_id=$2 FOR UPDATE`,
      [req.params.id, orgId])).rows[0];
    if (!trip) throw notFound('Trip not found');
    if (!isParticipant(trip, me)) throw forbidden('Not a participant of this trip');
    if (!ALLOWED[status].includes(trip.status)) throw badRequest(`Cannot move from ${trip.status} to ${status}`);

    const driverOnly = ['STARTED', 'IN_PROGRESS', 'COMPLETED'];
    if (driverOnly.includes(status) && trip.driver_employee_id !== me) {
      throw forbidden('Only the driver can perform this action');
    }
    if (status === 'CANCELLED' && trip.status !== 'BOOKED') {
      throw badRequest('Only trips that have not started can be cancelled here');
    }

    const sets = ['status=$3', 'updated_at=now()'];
    const params = [req.params.id, orgId, status];
    if (status === 'STARTED') sets.push('started_at=now()');
    if (status === 'COMPLETED') {
      sets.push('completed_at=now()');
      if (req.body.actualDistanceKm != null) { params.push(req.body.actualDistanceKm); sets.push(`actual_distance_km=$${params.length}`); }
      if (req.body.actualDurationMinutes != null) { params.push(req.body.actualDurationMinutes); sets.push(`actual_duration_minutes=$${params.length}`); }
    }
    const updated = (await client.query(
      `UPDATE trips SET ${sets.join(', ')} WHERE trip_id=$1 AND organization_id=$2 RETURNING *`, params)).rows[0];

    await client.query(
      `INSERT INTO trip_status_history (organization_id, trip_id, status, changed_by_employee_id) VALUES ($1,$2,$3,$4)`,
      [orgId, updated.trip_id, status, me]);

    if (status === 'COMPLETED') {
      await finalizeCompletedTrip(client, orgId, updated);
    }
    return updated;
  });

  res.json({ trip: out });
}));

/** On completion: create PENDING payment + denormalized ride_history + notify passenger. */
async function finalizeCompletedTrip(client, orgId, trip) {
  const detail = (await client.query(
    `SELECT r.pickup_address, r.destination_address, r.distance_km, r.vehicle_id,
            bk.fare_amount
     FROM rides r
     LEFT JOIN ride_bookings bk ON bk.booking_id=$3 AND bk.organization_id=$2
     WHERE r.ride_id=$1 AND r.organization_id=$2`,
    [trip.ride_id, orgId, trip.booking_id])).rows[0];

  const settings = (await client.query(
    `SELECT fuel_cost_per_litre, avg_fuel_efficiency_kmpl FROM organization_settings WHERE organization_id=$1`,
    [orgId])).rows[0] || {};
  const distance = trip.actual_distance_km || detail?.distance_km || 0;
  const kmpl = Number(settings.avg_fuel_efficiency_kmpl) || 15;
  const fuelCost = +(((distance / kmpl) * (Number(settings.fuel_cost_per_litre) || 0)).toFixed(2));
  const fare = detail?.fare_amount || 0;

  // Mark booking completed.
  await client.query(
    `UPDATE ride_bookings SET booking_status='COMPLETED' WHERE booking_id=$1 AND organization_id=$2`,
    [trip.booking_id, orgId]);

  // Idempotent-ish: only create a payment if none pending/completed yet.
  const existing = (await client.query(
    `SELECT 1 FROM payments WHERE trip_id=$1 AND organization_id=$2 AND status IN ('PENDING','COMPLETED')`,
    [trip.trip_id, orgId])).rows[0];
  if (!existing) {
    await client.query(
      `INSERT INTO payments (organization_id, trip_id, payer_employee_id, payee_employee_id, amount, payment_method, status)
       VALUES ($1,$2,$3,$4,$5,'CASH','PENDING')`,
      [orgId, trip.trip_id, trip.passenger_employee_id, trip.driver_employee_id, fare]);
  }

  await client.query(
    `INSERT INTO ride_history
       (organization_id, trip_id, driver_employee_id, passenger_employee_id, vehicle_id,
        pickup_address, destination_address, trip_date, distance_km, fare_amount, fuel_cost, final_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_DATE, $8,$9,$10,'COMPLETED')`,
    [orgId, trip.trip_id, trip.driver_employee_id, trip.passenger_employee_id, detail?.vehicle_id || null,
     detail?.pickup_address || '', detail?.destination_address || '', distance, fare, fuelCost]);

  await client.query(
    `INSERT INTO notifications (organization_id, employee_id, title, body, notif_type)
     VALUES ($1,$2,'Payment due',$3,'PAYMENT_DUE')`,
    [orgId, trip.passenger_employee_id, `Your trip is complete. Amount due: ${fare}.`]);
}

/** GET /api/trips/:id/messages — chat history (participants only). */
router.get('/:id/messages', asyncHandler(async (req, res) => {
  const trip = (await query('SELECT * FROM trips WHERE trip_id=$1 AND organization_id=$2', [req.params.id, req.auth.orgId])).rows[0];
  if (!trip) throw notFound('Trip not found');
  if (!isParticipant(trip, req.auth.employeeId)) throw forbidden('Not a participant of this trip');
  const rows = (await query(
    `SELECT m.*, u.full_name AS sender_name
     FROM chat_messages m
     JOIN employees e ON e.employee_id=m.sender_employee_id AND e.organization_id=m.organization_id
     JOIN users u ON u.user_id=e.user_id
     WHERE m.organization_id=$1 AND m.trip_id=$2 ORDER BY m.sent_at ASC`,
    [req.auth.orgId, req.params.id])).rows;
  res.json({ messages: rows });
}));

/** GET /api/trips/:id/pings — recent location trail (participants only). */
router.get('/:id/pings', asyncHandler(async (req, res) => {
  const trip = (await query('SELECT * FROM trips WHERE trip_id=$1 AND organization_id=$2', [req.params.id, req.auth.orgId])).rows[0];
  if (!trip) throw notFound('Trip not found');
  if (!isParticipant(trip, req.auth.employeeId)) throw forbidden('Not a participant of this trip');
  const rows = (await query(
    `SELECT latitude, longitude, speed_kmph, heading_degrees, eta_minutes, recorded_at
     FROM live_location_ping WHERE organization_id=$1 AND trip_id=$2 ORDER BY recorded_at DESC LIMIT 100`,
    [req.auth.orgId, req.params.id])).rows;
  res.json({ pings: rows.reverse() });
}));

export default router;
export { isParticipant };
