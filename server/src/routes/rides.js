import { Router } from 'express';
import { query, withTenant } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';
import { requireAuth, requireEmployee } from '../middleware/auth.js';
import { getRoute, haversineKm, sampleRouteNodes, reverseGeocode } from '../utils/geo.js';

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

const PICKUP_RADIUS_KM = 5;

/**
 * GET /api/rides/state — current ride/trip state for the logged-in employee.
 * Returns:
 *   asDriver:    active ride this employee published (OPEN/FULL), or null
 *   asPassenger: active trip this employee is in (BOOKED/STARTED/IN_PROGRESS), or null
 *
 * Used by the client to gate "Offer Ride" and "Find Ride / Book" flows.
 */
router.get('/state', asyncHandler(async (req, res) => {
  const orgId      = req.auth.orgId;
  const employeeId = req.auth.employeeId;

  // Active ride published by this driver
  const asDriver = (await query(
    `SELECT ride_id, status, pickup_address, destination_address, departure_datetime
     FROM rides
     WHERE organization_id = $1 AND driver_employee_id = $2
       AND status IN ('OPEN','FULL','DRAFT')
     ORDER BY departure_datetime DESC LIMIT 1`,
    [orgId, employeeId]
  )).rows[0] || null;

  // Active trip where this employee is the passenger
  const asPassenger = (await query(
    `SELECT t.trip_id, t.status, r.pickup_address, r.destination_address, r.departure_datetime,
            b.booking_id
     FROM trips t
     JOIN rides r ON r.ride_id = t.ride_id AND r.organization_id = t.organization_id
     LEFT JOIN ride_bookings b ON b.booking_id = t.booking_id
     WHERE t.organization_id = $1 AND t.passenger_employee_id = $2
       AND t.status IN ('BOOKED','STARTED','IN_PROGRESS')
     ORDER BY r.departure_datetime ASC LIMIT 1`,
    [orgId, employeeId]
  )).rows[0] || null;

  const rideStatus = asDriver ? 'DRIVING' : asPassenger ? 'RIDING' : 'FREE';

  res.json({ rideStatus, asDriver, asPassenger });
}));

/**
 * GET /api/rides — search open rides (org-scoped).
 * query: date (YYYY-MM-DD), seats, pickupLat, pickupLng, radiusKm
 *
 * When pickupLat/pickupLng are provided, each ride is checked against its
 * pickup nodes: only rides where the passenger is within PICKUP_RADIUS_KM of
 * at least one node are returned. The nearest node is attached as `nearest_node`.
 */
router.get('/', asyncHandler(async (req, res) => {
  const { date, seats, pickupLat, pickupLng } = req.query;
  const seatsNeeded = parseInt(seats, 10) || 1;

  const params = [req.auth.orgId, seatsNeeded];
  let sql = `${RIDE_JOIN}
    WHERE r.organization_id = $1
      AND r.status = 'OPEN'
      AND r.available_seats >= $2::smallint
      AND r.departure_datetime >= now() - interval '1 hour'`;
  sql += ' ORDER BY r.departure_datetime ASC LIMIT 200';

  let rows = (await query(sql, params)).rows;

  // Date / recurrence filter
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

  // ── Node-based proximity filter ─────────────────────────────────
  if (pickupLat && pickupLng && !isNaN(+pickupLat) && !isNaN(+pickupLng)) {
    const passengerLoc = { lat: +pickupLat, lng: +pickupLng };

    if (rows.length > 0) {
      const rideIds = rows.map((r) => r.ride_id);
      const nodeRows = (await query(
        `SELECT node_id, ride_id, node_index, lat, lng, address
         FROM ride_pickup_nodes
         WHERE ride_id = ANY($1::uuid[])`,
        [rideIds]
      )).rows;

      const nodesByRide = {};
      for (const node of nodeRows) {
        if (!nodesByRide[node.ride_id]) nodesByRide[node.ride_id] = [];
        nodesByRide[node.ride_id].push(node);
      }

      const eligible = [];
      for (const ride of rows) {
        const nodes = nodesByRide[ride.ride_id] || [];
        if (nodes.length === 0) continue;

        let nearest = null;
        let nearestDist = Infinity;
        for (const node of nodes) {
          const dist = haversineKm(passengerLoc, { lat: +node.lat, lng: +node.lng });
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { ...node, distance_km: dist };
          }
        }

        if (nearest && nearestDist <= PICKUP_RADIUS_KM) {
          eligible.push({ ...ride, nearest_node: nearest });
        }
      }

      return res.json({ rides: eligible });
    }
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

/** GET /api/rides/:id/nodes — pickup nodes for a ride. */
router.get('/:id/nodes', asyncHandler(async (req, res) => {
  const nodes = (await query(
    `SELECT node_id, node_index, lat, lng, address
     FROM ride_pickup_nodes
     WHERE organization_id = $1 AND ride_id = $2
     ORDER BY node_index`,
    [req.auth.orgId, req.params.id]
  )).rows;
  res.json({ nodes });
}));

/** GET /api/rides/:id */
router.get('/:id', asyncHandler(async (req, res) => {
  const ride = (await query(`${RIDE_JOIN} WHERE r.organization_id = $1 AND r.ride_id = $2`,
    [req.auth.orgId, req.params.id])).rows[0];
  if (!ride) throw notFound('Ride not found');
  const bookings = (await query(
    `SELECT b.*, u.full_name AS passenger_name, u.phone_number AS passenger_phone,
            n.lat AS node_lat, n.lng AS node_lng, n.address AS node_address, n.node_index
     FROM ride_bookings b
     JOIN employees e ON e.employee_id = b.passenger_employee_id AND e.organization_id = b.organization_id
     JOIN users u ON u.user_id = e.user_id
     LEFT JOIN ride_pickup_nodes n ON n.node_id = b.pickup_node_id
     WHERE b.organization_id = $1 AND b.ride_id = $2 AND b.booking_status = 'CONFIRMED'`,
    [req.auth.orgId, req.params.id]
  )).rows;
  const nodes = (await query(
    `SELECT node_id, node_index, lat, lng, address FROM ride_pickup_nodes
     WHERE organization_id = $1 AND ride_id = $2 ORDER BY node_index`,
    [req.auth.orgId, req.params.id]
  )).rows;
  res.json({ ride, bookings, nodes });
}));

/** POST /api/rides — publish a ride (driver). */
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const required = ['vehicleId', 'pickupAddress', 'pickupLat', 'pickupLng',
    'destinationAddress', 'destinationLat', 'destinationLng', 'departureDatetime', 'totalSeats'];
  for (const k of required) if (b[k] == null || b[k] === '') throw badRequest(`${k} is required`);

  const orgId = req.auth.orgId;
  const driverId = req.auth.employeeId;

  // ── Guard: driver must not already have an active open/full ride ──
  const existingRide = (await query(
    `SELECT ride_id FROM rides
     WHERE organization_id = $1 AND driver_employee_id = $2
       AND status IN ('OPEN','FULL','DRAFT')
     LIMIT 1`,
    [orgId, driverId]
  )).rows[0];
  if (existingRide) {
    throw badRequest('You already have an active ride published. Cancel it before offering a new one.');
  }

  // ── Guard: driver must not be an active passenger on another ride ──
  const existingTrip = (await query(
    `SELECT trip_id FROM trips
     WHERE organization_id = $1 AND passenger_employee_id = $2
       AND status IN ('BOOKED','STARTED','IN_PROGRESS')
     LIMIT 1`,
    [orgId, driverId]
  )).rows[0];
  if (existingTrip) {
    throw badRequest('You are currently booked as a passenger on another ride. Cancel that booking first.');
  }

  // Vehicle must belong to this driver in this org.
  const vehicle = (await query(
    'SELECT * FROM vehicles WHERE vehicle_id = $1 AND organization_id = $2 AND employee_id = $3 AND is_active = TRUE',
    [b.vehicleId, orgId, driverId]
  )).rows[0];
  if (!vehicle) throw badRequest('Select a registered vehicle you own before offering a ride');
  if (parseInt(b.totalSeats, 10) > vehicle.seating_capacity) {
    throw badRequest(`Seats offered (${b.totalSeats}) cannot exceed vehicle capacity (${vehicle.seating_capacity})`);
  }

  // Compute route from OSRM.
  let distanceKm = null, durationMinutes = null, polyline = null, routeGeometry = null;
  try {
    const route = await getRoute(
      { lat: +b.pickupLat, lng: +b.pickupLng },
      { lat: +b.destinationLat, lng: +b.destinationLng }
    );
    distanceKm    = route.distanceKm;
    durationMinutes = route.durationMinutes;
    routeGeometry = route.geometry;
    polyline      = JSON.stringify(route.geometry);
  } catch {
    distanceKm = haversineKm(
      { lat: +b.pickupLat, lng: +b.pickupLng },
      { lat: +b.destinationLat, lng: +b.destinationLng }
    );
  }

  const settings = (await query(
    'SELECT cost_per_km FROM organization_settings WHERE organization_id = $1',
    [orgId]
  )).rows[0];
  const costPerKm  = Number(settings?.cost_per_km ?? 0);
  const autoCostPerSeat = costPerKm > 0 && distanceKm
    ? Math.max(1, +(costPerKm * distanceKm).toFixed(2))
    : 0;

  // Driver can set their own fare; if provided and positive, use it. Otherwise fall back to auto.
  const driverFare = b.farePerSeat != null ? parseFloat(b.farePerSeat) : NaN;
  const farePerSeat = !isNaN(driverFare) && driverFare >= 0 ? driverFare : autoCostPerSeat;

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
    [orgId, driverId, b.vehicleId,
     b.pickupAddress, b.pickupLat, b.pickupLng,
     b.destinationAddress, b.destinationLat, b.destinationLng,
     polyline, distanceKm, durationMinutes,
     b.departureDatetime, parseInt(b.totalSeats, 10), farePerSeat,
     !!b.isRecurring, b.recurrencePattern ? JSON.stringify(b.recurrencePattern) : null]
  )).rows[0];

  // ── Generate pickup nodes from the OSRM route ──────────────────────
  let nodes = [];
  if (routeGeometry) {
    const sampledPoints = sampleRouteNodes(routeGeometry, distanceKm);
    for (const pt of sampledPoints) {
      const nodeRow = (await query(
        `INSERT INTO ride_pickup_nodes (organization_id, ride_id, node_index, lat, lng)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [orgId, row.ride_id, pt.nodeIndex, pt.lat, pt.lng]
      )).rows[0];
      nodes.push(nodeRow);
      reverseGeocode(pt.lat, pt.lng).then((addr) => {
        if (addr) query('UPDATE ride_pickup_nodes SET address=$1 WHERE node_id=$2', [addr, nodeRow.node_id]).catch(() => {});
      }).catch(() => {});
    }
  }

  res.status(201).json({ ride: row, nodes });
}));

/**
 * PATCH /api/rides/:id/cancel — driver cancels an open ride.
 *
 * Blocked if ANY trip on this ride is already STARTED or IN_PROGRESS —
 * once the driver has started the ride, it cannot be cancelled.
 */
router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const orgId    = req.auth.orgId;
  const driverId = req.auth.employeeId;

  // Fetch the ride first (without updating) so we can check trip statuses.
  const rideCheck = (await query(
    `SELECT ride_id, status FROM rides
     WHERE ride_id = $1 AND organization_id = $2 AND driver_employee_id = $3`,
    [req.params.id, orgId, driverId]
  )).rows[0];
  if (!rideCheck) throw notFound('Ride not found or you are not the driver');
  if (!['OPEN','DRAFT','FULL'].includes(rideCheck.status)) {
    throw badRequest(`Cannot cancel a ride with status '${rideCheck.status}'`);
  }

  // Block cancellation if any trip is in progress / already started.
  const activeTrip = (await query(
    `SELECT trip_id FROM trips
     WHERE ride_id = $1 AND organization_id = $2
       AND status IN ('STARTED','IN_PROGRESS')
     LIMIT 1`,
    [req.params.id, orgId]
  )).rows[0];
  if (activeTrip) {
    throw badRequest('The ride has already started — you cannot cancel it now.');
  }

  const ride = (await query(
    `UPDATE rides SET status = 'CANCELLED', updated_at = now()
     WHERE ride_id = $1 AND organization_id = $2 AND driver_employee_id = $3
       AND status IN ('OPEN','DRAFT','FULL') RETURNING *`,
    [req.params.id, orgId, driverId]
  )).rows[0];
  if (!ride) throw notFound('Ride not found or cannot be cancelled');

  await query(
    `UPDATE ride_bookings SET booking_status='CANCELLED', cancelled_at=now()
     WHERE ride_id=$1 AND organization_id=$2 AND booking_status='CONFIRMED'`,
    [req.params.id, orgId]);
  await query(
    `UPDATE trips SET status='CANCELLED', updated_at=now()
     WHERE ride_id=$1 AND organization_id=$2 AND status IN ('BOOKED','STARTED','IN_PROGRESS')`,
    [req.params.id, orgId]);

  res.json({ ride });
}));

export default router;
