import { verifyToken } from '../utils/jwt.js';
import { query } from '../db.js';

const roomFor = (tripId) => `trip:${tripId}`;

/**
 * Confirm the socket's employee is a participant (driver or passenger) of the
 * trip AND both belong to the same org. This is what guarantees chat messages
 * and live locations are only ever delivered to that trip's two participants.
 */
async function loadTripIfParticipant(orgId, tripId, employeeId) {
  const trip = (await query(
    `SELECT trip_id, organization_id, driver_employee_id, passenger_employee_id, status
     FROM trips WHERE trip_id=$1 AND organization_id=$2`,
    [tripId, orgId]
  )).rows[0];
  if (!trip) return null;
  if (trip.driver_employee_id !== employeeId && trip.passenger_employee_id !== employeeId) return null;
  return trip;
}

export function registerSockets(io) {
  // ── Auth handshake ──────────────────────────────────────
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Missing token'));
      const payload = verifyToken(token);
      if (!payload.orgId || !payload.employeeId) return next(new Error('Employee context required'));
      socket.data.auth = {
        userId: payload.userId,
        orgId: payload.orgId,
        employeeId: payload.employeeId,
        fullName: payload.fullName,
      };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { orgId, employeeId, fullName } = socket.data.auth;

    // Join a trip channel (verified participant only).
    socket.on('trip:join', async (tripId, cb) => {
      try {
        const trip = await loadTripIfParticipant(orgId, tripId, employeeId);
        if (!trip) return cb?.({ ok: false, error: 'Not a participant of this trip' });

        const roomName = roomFor(tripId);

        // Check how many OTHER sockets are in the room before we join.
        // This tells us if the peer is already present.
        const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
        // Exclude the current socket itself (in case it's reconnecting and still in the room).
        const othersInRoom = clientsInRoom
          ? [...clientsInRoom].filter((sid) => sid !== socket.id).length
          : 0;
        const peerOnline = othersInRoom > 0;

        socket.join(roomName);
        socket.data.tripId = tripId;
        socket.data.role = trip.driver_employee_id === employeeId ? 'driver' : 'passenger';

        // Announce our presence to anyone already in the room.
        socket.to(roomName).emit('presence:join', { employeeId, fullName, role: socket.data.role });

        cb?.({ ok: true, role: socket.data.role, status: trip.status, peerOnline });
      } catch (e) {
        cb?.({ ok: false, error: 'join failed' });
      }
    });

    socket.on('trip:leave', (tripId) => {
      socket.leave(roomFor(tripId));
      socket.to(roomFor(tripId)).emit('presence:leave', { employeeId });
    });

    // ── Live location (driver -> peers) ───────────────────
    socket.on('location:update', async (payload = {}) => {
      const { tripId, lat, lng, speed, heading, eta } = payload;
      if (!tripId || lat == null || lng == null) return;
      try {
        const trip = await loadTripIfParticipant(orgId, tripId, employeeId);
        if (!trip) return;
        if (trip.driver_employee_id !== employeeId) return; // only driver reports location
        if (!['STARTED', 'IN_PROGRESS'].includes(trip.status)) return;

        await query(
          `INSERT INTO live_location_ping
             (organization_id, trip_id, reported_by_employee_id, latitude, longitude, speed_kmph, heading_degrees, eta_minutes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [orgId, tripId, employeeId, lat, lng, speed ?? null, heading ?? null, eta ?? null]
        );
        socket.to(roomFor(tripId)).emit('location:update', {
          tripId, lat, lng, speed, heading, eta, at: new Date().toISOString(),
        });
      } catch (e) {
        // swallow — high frequency channel
      }
    });

    // ── Chat (persisted, participants only) ───────────────
    socket.on('chat:send', async (payload = {}, cb) => {
      const { tripId, text } = payload;
      if (!tripId || !text?.trim()) return cb?.({ ok: false, error: 'Empty message' });
      try {
        const trip = await loadTripIfParticipant(orgId, tripId, employeeId);
        if (!trip) return cb?.({ ok: false, error: 'Not a participant' });
        const msg = (await query(
          `INSERT INTO chat_messages (organization_id, trip_id, sender_employee_id, message_text, message_type)
           VALUES ($1,$2,$3,$4,'TEXT') RETURNING *`,
          [orgId, tripId, employeeId, text.trim()]
        )).rows[0];
        const shaped = {
          message_id: msg.message_id, trip_id: tripId, sender_employee_id: employeeId,
          sender_name: fullName, message_text: msg.message_text, message_type: 'TEXT', sent_at: msg.sent_at,
        };
        // deliver to the peer; sender gets it back via ack (avoids duplicates)
        socket.to(roomFor(tripId)).emit('chat:new', shaped);
        cb?.({ ok: true, message: shaped });
      } catch (e) {
        cb?.({ ok: false, error: 'send failed' });
      }
    });

    socket.on('chat:typing', ({ tripId } = {}) => {
      if (tripId) socket.to(roomFor(tripId)).emit('chat:typing', { employeeId, fullName });
    });

    // ── WebRTC voice-call signaling (relayed peer-to-peer) ─────────────
    // A single relay for invite/offer/answer/ice/end. Media flows P2P via WebRTC;
    // only signaling passes through the server, scoped to the trip room.
    //
    // How it works:
    //   1. Caller emits 'invite' → server relays to peer, sets socket.data.inCall
    //   2. Peer emits 'offer'   → server relays SDP offer
    //   3. Callee emits 'answer'→ server relays SDP answer
    //   4. Both sides emit 'ice'→ server relays ICE candidates
    //   5. Either side emits 'end'/'reject' → server relays + clears inCall
    socket.on('call:signal', async ({ tripId, type, data } = {}) => {
      if (!tripId || !type) return;
      const trip = await loadTripIfParticipant(orgId, tripId, employeeId);
      if (!trip) return;

      // Relay the signal directly to the other participant in the trip room.
      socket.to(roomFor(tripId)).emit('call:signal', { from: employeeId, fromName: fullName, type, data });

      // Track whether this socket is currently in a call so we can clean up on disconnect.
      if (type === 'invite') {
        socket.data.inCall = tripId;
      } else if (type === 'end' || type === 'reject') {
        socket.data.inCall = null;
      }

      // Persist call-start and call-end events into chat history as CALL_LOG entries.
      if (type === 'invite' || type === 'end') {
        try {
          await query(
            `INSERT INTO chat_messages (organization_id, trip_id, sender_employee_id, message_text, message_type)
             VALUES ($1,$2,$3,$4,'CALL_LOG')`,
            [orgId, tripId, employeeId, type === 'invite' ? 'Voice call started' : 'Voice call ended']
          );
        } catch { /* ignore — chat log is non-critical */ }
      }
    });

    socket.on('disconnect', () => {
      // Notify the trip room of the user's departure (presence tracking).
      if (socket.data.tripId) {
        socket.to(roomFor(socket.data.tripId)).emit('presence:leave', { employeeId });
      }

      // ── Mid-call disconnect cleanup ──────────────────────────────────
      // If this socket was actively in a call when it disconnected (tab closed,
      // network drop, etc.), relay a synthetic 'end' signal to the peer so their
      // call UI tears down instead of hanging indefinitely.
      if (socket.data.inCall) {
        socket.to(roomFor(socket.data.inCall)).emit('call:signal', {
          from: employeeId,
          fromName: fullName,
          type: 'end',
          data: null,
        });
      }
    });
  });
}
