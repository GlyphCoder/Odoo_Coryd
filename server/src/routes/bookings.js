import { Router } from 'express';
import { query, withTenant } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';
import { haversineKm } from '../utils/geo.js';

const router = Router();
router.use(requireAuth, requireEmployee);

/**
 * POST /api/bookings — book a seat on a ride.
 * body: { rideId, seats? }
 * Atomically decrements seats, creates booking + trip, notifies the driver.
 */
router.post('/', asyncHandler(async (req, res) => {
  const { rideId, pickupNodeId, passengerLat, passengerLng } = req.body || {};
  const seats = parseInt(req.body?.seats, 10) || 1;
  if (!rideId) throw badRequest('rideId is required');
  if (!pickupNodeId) throw badRequest('pickupNodeId is required — search for a ride first to get a pickup node');
  const orgId = req.auth.orgId;
  const passengerId = req.auth.employeeId;

  // Validate pickup node exists and belongs to this ride.
  const nodeRow = (await query(
    `SELECT * FROM ride_pickup_nodes WHERE node_id = $1 AND ride_id = $2`,
    [pickupNodeId, rideId]
  )).rows[0];
  if (!nodeRow) throw badRequest('Invalid pickup node for this ride');

  // If passenger provides their current location, enforce 5km radius.
  if (passengerLat && passengerLng && !isNaN(+passengerLat) && !isNaN(+passengerLng)) {
    const dist = haversineKm(
      { lat: +passengerLat, lng: +passengerLng },
      { lat: +nodeRow.lat, lng: +nodeRow.lng }
    );
    if (dist > 5) {
      throw badRequest(`You are ${dist.toFixed(1)} km from pickup node — must be within 5 km to book`);
    }
  }

  const result = await withTenant(orgId, async (client) => {
    // Lock the ride row.
    const ride = (await client.query(
      `SELECT * FROM rides WHERE ride_id = $1 AND organization_id = $2 FOR UPDATE`,
      [rideId, orgId]
    )).rows[0];
    if (!ride) throw notFound('Ride not found');
    if (ride.status !== 'OPEN') throw badRequest('This ride is not open for booking');
    if (ride.driver_employee_id === passengerId) throw badRequest('You cannot book your own ride');
    if (ride.available_seats < seats) throw badRequest(`Not enough seats available — only ${ride.available_seats} seat(s) left`);

    // ── Guard: passenger must not already be RIDING ────────────────
    const activeTrip = (await client.query(
      `SELECT t.trip_id, r.pickup_address, r.destination_address
       FROM trips t
       JOIN rides r ON r.ride_id = t.ride_id AND r.organization_id = t.organization_id
       WHERE t.organization_id = $1 AND t.passenger_employee_id = $2
         AND t.status IN ('BOOKED','STARTED','IN_PROGRESS')
       LIMIT 1`,
      [orgId, passengerId]
    )).rows[0];
    if (activeTrip) {
      throw badRequest(
        `You are already RIDING (${activeTrip.pickup_address} → ${activeTrip.destination_address}). ` +
        `Cancel that booking first.`
      );
    }

    // ── Guard: passenger must not be DRIVING another active ride ────
    const drivingRide = (await client.query(
      `SELECT ride_id, pickup_address, destination_address FROM rides
       WHERE organization_id = $1 AND driver_employee_id = $2
         AND status IN ('OPEN','FULL','DRAFT')
       LIMIT 1`,
      [orgId, passengerId]
    )).rows[0];
    if (drivingRide) {
      throw badRequest(
        `You are already DRIVING an active ride (${drivingRide.pickup_address} → ${drivingRide.destination_address}). ` +
        `Cancel your ride before booking a seat on another.`
      );
    }

    // Prevent duplicate active booking.
    const dup = (await client.query(
      `SELECT 1 FROM ride_bookings WHERE organization_id=$1 AND ride_id=$2 AND passenger_employee_id=$3 AND booking_status='CONFIRMED'`,
      [orgId, rideId, passengerId]
    )).rows[0];
    if (dup) throw badRequest('You already booked this ride');

    const fare = (Number(ride.fare_per_seat) * seats).toFixed(2);

    const booking = (await client.query(
      `INSERT INTO ride_bookings (organization_id, ride_id, passenger_employee_id, seats_booked, fare_amount, pickup_node_id)
       VALUES ($1,$2,$3,$4::smallint,$5,$6) RETURNING *`,
      [orgId, rideId, passengerId, seats, fare, pickupNodeId]
    )).rows[0];

    const newAvail = ride.available_seats - seats;
    await client.query(
      `UPDATE rides SET available_seats=$1::smallint, status = CASE WHEN $1::smallint <= 0 THEN 'FULL' ELSE status END, updated_at=now()
       WHERE ride_id=$2 AND organization_id=$3`,
      [newAvail, rideId, orgId]
    );

    const trip = (await client.query(
      `INSERT INTO trips (organization_id, ride_id, booking_id, driver_employee_id, passenger_employee_id, status)
       VALUES ($1,$2,$3,$4,$5,'BOOKED') RETURNING *`,
      [orgId, rideId, booking.booking_id, ride.driver_employee_id, passengerId]
    )).rows[0];

    await client.query(
      `INSERT INTO trip_status_history (organization_id, trip_id, status, changed_by_employee_id)
       VALUES ($1,$2,'BOOKED',$3)`,
      [orgId, trip.trip_id, passengerId]
    );

    // Notify driver.
    await client.query(
      `INSERT INTO notifications (organization_id, employee_id, title, body, notif_type)
       VALUES ($1,$2,$3,$4,'RIDE_BOOKED')`,
      [orgId, ride.driver_employee_id, 'New booking',
       `${req.auth.fullName} booked ${seats} seat(s) on your ride.`]
    );

    return { booking, trip };
  });

  res.status(201).json(result);
}));

/** PATCH /api/bookings/:id/cancel — passenger cancels; seats returned. */
router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const orgId = req.auth.orgId;
  const passengerId = req.auth.employeeId;
  const result = await withTenant(orgId, async (client) => {
    const booking = (await client.query(
      `SELECT * FROM ride_bookings WHERE booking_id=$1 AND organization_id=$2 AND passenger_employee_id=$3 FOR UPDATE`,
      [req.params.id, orgId, passengerId]
    )).rows[0];
    if (!booking) throw notFound('Booking not found');
    if (booking.booking_status !== 'CONFIRMED') throw badRequest('Booking is not active');

    await client.query(
      `UPDATE ride_bookings SET booking_status='CANCELLED', cancelled_at=now() WHERE booking_id=$1 AND organization_id=$2`,
      [booking.booking_id, orgId]);
    await client.query(
      `UPDATE rides SET available_seats = LEAST(total_seats, (available_seats + $1::smallint)::smallint),
         status = CASE WHEN status='FULL' THEN 'OPEN' ELSE status END, updated_at=now()
       WHERE ride_id=$2 AND organization_id=$3`,
      [booking.seats_booked, booking.ride_id, orgId]);
    await client.query(
      `UPDATE trips SET status='CANCELLED', updated_at=now()
       WHERE booking_id=$1 AND organization_id=$2 AND status IN ('BOOKED','STARTED','IN_PROGRESS')`,
      [booking.booking_id, orgId]);
    return { ok: true };
  });
  res.json(result);
}));

export default router;
