import { query } from './db.js';
import { signToken } from './utils/jwt.js';
import { io } from 'socket.io-client';

async function run() {
  try {
    const trip = (await query(`
      SELECT t.trip_id, t.organization_id, t.status,
             t.driver_employee_id, t.passenger_employee_id,
             de.user_id as driver_user_id, pe.user_id as passenger_user_id,
             du.full_name as driver_name, pu.full_name as passenger_name
      FROM trips t
      JOIN employees de ON de.employee_id = t.driver_employee_id
      JOIN users du ON du.user_id = de.user_id
      JOIN employees pe ON pe.employee_id = t.passenger_employee_id
      JOIN users pu ON pu.user_id = pe.user_id
      WHERE t.status = 'BOOKED'
      ORDER BY t.created_at DESC LIMIT 1
    `)).rows[0];

    if (!trip) {
      console.log('No BOOKED trips found.');
      process.exit(0);
    }

    const driverToken = signToken({
      userId: trip.driver_user_id,
      orgId: trip.organization_id,
      employeeId: trip.driver_employee_id,
      isAdmin: false,
      fullName: trip.driver_name,
    });

    const passengerToken = signToken({
      userId: trip.passenger_user_id,
      orgId: trip.organization_id,
      employeeId: trip.passenger_employee_id,
      isAdmin: false,
      fullName: trip.passenger_name,
    });

    console.log('1. Connecting driver...');
    const driverSocket = io('http://127.0.0.1:4000', { auth: { token: driverToken }, forceNew: true });
    
    await new Promise((r) => driverSocket.on('connect', r));
    console.log('Driver connected.');

    // Join driver first
    let driverJoinRes = await new Promise((resolve) => {
      driverSocket.emit('trip:join', trip.trip_id, resolve);
    });
    console.log('Driver join res (should have peerOnline: false):', driverJoinRes);

    // Now connect passenger
    console.log('2. Connecting passenger...');
    const passengerSocket = io('http://127.0.0.1:4000', { auth: { token: passengerToken }, forceNew: true });
    
    // Set up presence listener on driver to verify passenger's join event
    const driverReceivedPresence = new Promise((resolve) => {
      driverSocket.on('presence:join', (presence) => {
        console.log('Driver received presence:join from passenger:', presence);
        resolve(presence);
      });
    });

    await new Promise((r) => passengerSocket.on('connect', r));
    console.log('Passenger connected.');

    // Join passenger (driver is already in room)
    let passengerJoinRes = await new Promise((resolve) => {
      passengerSocket.emit('trip:join', trip.trip_id, resolve);
    });
    console.log('Passenger join res (should have peerOnline: true):', passengerJoinRes);

    await driverReceivedPresence;

    console.log('All presence checks verified successfully!');
    driverSocket.close();
    passengerSocket.close();
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    process.exit(0);
  }
}

run();
