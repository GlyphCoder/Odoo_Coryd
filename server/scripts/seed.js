// Seeds a clean demo organization with bounded, consistent data.
// Re-running this script replaces only the ACME demo tenant. Usage: npm run seed
import pg from 'pg';
import bcrypt from 'bcryptjs';
import config from '../src/config.js';

const MAX_DEMO_ROWS = 200;
const envCount = (name, fallback, max = MAX_DEMO_ROWS) =>
  Math.min(Math.max(Number(process.env[name] || fallback), 0), max);

const TOTAL_EMPLOYEE_COUNT = envCount('DEMO_EMPLOYEE_COUNT', 150);
const BULK_VEHICLE_COUNT = envCount('DEMO_VEHICLE_COUNT', 80);
const BULK_OPEN_RIDE_COUNT = envCount('DEMO_OPEN_RIDE_COUNT', 40);
const BULK_HISTORY_COUNT = envCount('DEMO_HISTORY_COUNT', 100);

const DEMO = {
  orgCode: 'ACME',
  orgName: 'Acme Corp',
  domain: 'acme.com',
  adminEmail: 'admin@acme.com',
  adminPass: 'admin123',
  employees: [
    { email: 'ravi@acme.com', name: 'Ravi Kumar', pass: 'password123', dept: 'Engineering', desig: 'SDE II' },
    { email: 'priya@acme.com', name: 'Priya Sharma', pass: 'password123', dept: 'Design', desig: 'Product Designer' },
    { email: 'arjun@acme.com', name: 'Arjun Mehta', pass: 'password123', dept: 'Sales', desig: 'AE' },
  ],
};

const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Akash', 'Ananya', 'Anika', 'Arjun', 'Dev', 'Diya', 'Isha', 'Kabir',
  'Kavya', 'Krish', 'Meera', 'Neha', 'Nikhil', 'Priya', 'Rahul', 'Riya', 'Rohan', 'Sahil',
];
const LAST_NAMES = [
  'Bansal', 'Chandel', 'Gupta', 'Iyer', 'Jain', 'Kapoor', 'Khan', 'Kumar', 'Mehta', 'Nair',
  'Patel', 'Rao', 'Reddy', 'Sharma', 'Singh', 'Verma',
];
const DEPARTMENTS = ['Engineering', 'Design', 'Sales', 'Marketing', 'Finance', 'HR', 'Operations', 'Support'];
const DESIGNATIONS = ['Associate', 'Senior Associate', 'Manager', 'Lead', 'Analyst', 'Specialist', 'Engineer'];
const VEHICLE_MODELS = ['Maruti Swift', 'Hyundai i20', 'Tata Nexon', 'Honda City', 'Mahindra XUV300', 'Kia Sonet'];
const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'EV', 'HYBRID'];
const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD'];
const ROUTES = [
  ['Koramangala, Bengaluru', 12.935200, 77.624600, 'Whitefield, Bengaluru', 12.969800, 77.749900, 18.5, 55],
  ['Indiranagar, Bengaluru', 12.978400, 77.640800, 'Electronic City, Bengaluru', 12.845200, 77.660200, 21.2, 62],
  ['HSR Layout, Bengaluru', 12.911600, 77.638900, 'Manyata Tech Park, Bengaluru', 13.042700, 77.621600, 19.8, 58],
  ['JP Nagar, Bengaluru', 12.906300, 77.585700, 'MG Road, Bengaluru', 12.975600, 77.606800, 11.6, 36],
  ['Yelahanka, Bengaluru', 13.100700, 77.596300, 'Bellandur, Bengaluru', 12.929900, 77.684800, 25.4, 76],
  ['Hebbal, Bengaluru', 13.035800, 77.597000, 'Marathahalli, Bengaluru', 12.956900, 77.701100, 16.7, 50],
];

const pick = (items, index) => items[index % items.length];

function generatedEmployees(count) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      email: `employee${String(n).padStart(3, '0')}@acme.com`,
      name: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i * 3)}`,
      pass: 'password123',
      dept: pick(DEPARTMENTS, i),
      desig: pick(DESIGNATIONS, i * 2),
      employeeCode: `ACME${String(n).padStart(4, '0')}`,
    };
  });
}

function dateFromToday(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function resetDemoTenant(c) {
  await c.query('DELETE FROM organizations WHERE org_code=$1', [DEMO.orgCode]);
  await c.query(
    `DELETE FROM users
     WHERE email IN ($1,$2,$3,$4)
        OR email LIKE 'employee%@acme.com'`,
    [DEMO.adminEmail, 'ravi@acme.com', 'priya@acme.com', 'arjun@acme.com']
  );
}

async function main() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL not set');
  const connectionString = config.databaseUrl.replace(/\?sslmode=require$/, '');
  const c = new pg.Client({
    connectionString,
    ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  await c.connect();
  await c.query('BEGIN');
  try {
    await resetDemoTenant(c);

    const org = (await c.query(
      `INSERT INTO organizations (org_name, org_code, domain_email)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [DEMO.orgName, DEMO.orgCode, DEMO.domain]
    )).rows[0];
    const orgId = org.organization_id;

    await c.query(
      `INSERT INTO organization_settings (organization_id, fuel_cost_per_litre, avg_fuel_efficiency_kmpl, cost_per_km)
       VALUES ($1, 105.00, 16.00, 6.60)`,
      [orgId]
    );

    const adminHash = await bcrypt.hash(DEMO.adminPass, 10);
    const adminUser = (await c.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1,$2,'Acme Admin')
       RETURNING *`,
      [DEMO.adminEmail, adminHash]
    )).rows[0];
    await c.query(
      `INSERT INTO organization_admins (organization_id, user_id, is_super_admin)
       VALUES ($1,$2,TRUE)`,
      [orgId, adminUser.user_id]
    );

    const empIds = [];
    const generatedEmployeeCount = Math.max(0, TOTAL_EMPLOYEE_COUNT - DEMO.employees.length);
    const allEmployees = [...DEMO.employees, ...generatedEmployees(generatedEmployeeCount)];
    const employeeHash = await bcrypt.hash('password123', 10);
    for (const e of allEmployees) {
      const hash = e.pass === 'password123' ? employeeHash : await bcrypt.hash(e.pass, 10);
      const user = (await c.query(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1,$2,$3)
         RETURNING *`,
        [e.email, hash, e.name]
      )).rows[0];
      const emp = (await c.query(
        `INSERT INTO employees (organization_id, user_id, employee_code, department, designation, status)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE')
         RETURNING *`,
        [orgId, user.user_id, e.employeeCode || null, e.dept, e.desig]
      )).rows[0];
      await c.query(
        `INSERT INTO wallets (organization_id, employee_id, balance)
         VALUES ($1,$2,500)`,
        [orgId, emp.employee_id]
      );
      empIds.push(emp.employee_id);
    }

    const primaryVehicle = (await c.query(
      `INSERT INTO vehicles (organization_id, employee_id, vehicle_model, registration_number, seating_capacity, fuel_type, is_verified)
       VALUES ($1,$2,'Maruti Swift','KA01AB1234',4,'PETROL',TRUE)
       RETURNING *`,
      [orgId, empIds[0]]
    )).rows[0];

    const tomorrow = dateFromToday(1, 9);
    await c.query(
      `INSERT INTO rides (organization_id, driver_employee_id, vehicle_id,
         pickup_address, pickup_lat, pickup_lng,
         destination_address, destination_lat, destination_lng,
         distance_km, duration_minutes, departure_datetime, total_seats, available_seats, fare_per_seat, status)
       VALUES ($1,$2,$3,'Koramangala, Bengaluru',12.935200,77.624600,
         'Whitefield, Bengaluru',12.969800,77.749900,18.50,55,$4,3,3,80.00,'OPEN')`,
      [orgId, empIds[0], primaryVehicle.vehicle_id, tomorrow.toISOString()]
    );

    const bulkVehicles = [];
    const vehicleLimit = Math.min(BULK_VEHICLE_COUNT, Math.max(0, empIds.length - 1));
    for (let i = 1; i <= vehicleLimit; i += 1) {
      const reg = `KA${String(10 + (i % 80)).padStart(2, '0')}DEMO${String(i).padStart(3, '0')}`;
      const v = (await c.query(
        `INSERT INTO vehicles (organization_id, employee_id, vehicle_model, registration_number, seating_capacity, fuel_type, is_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [orgId, empIds[i], pick(VEHICLE_MODELS, i), reg, 4 + (i % 3), pick(FUEL_TYPES, i), i % 5 !== 0]
      )).rows[0];
      bulkVehicles.push(v);
    }

    const openRideTarget = Math.min(BULK_OPEN_RIDE_COUNT, bulkVehicles.length);
    for (let i = 0; i < openRideTarget; i += 1) {
      const v = bulkVehicles[i];
      const route = pick(ROUTES, i);
      await c.query(
        `INSERT INTO rides (organization_id, driver_employee_id, vehicle_id,
           pickup_address, pickup_lat, pickup_lng,
           destination_address, destination_lat, destination_lng,
           distance_km, duration_minutes, departure_datetime, total_seats, available_seats, fare_per_seat, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,4,$13,$14,'OPEN')`,
        [
          orgId, v.employee_id, v.vehicle_id,
          `Demo Pickup ${i + 1} - ${route[0]}`, route[1], route[2],
          route[3], route[4], route[5], route[6], route[7],
          dateFromToday((i % 14) + 1, 8 + (i % 4)).toISOString(),
          1 + (i % 4), 50 + ((i % 8) * 10),
        ]
      );
    }

    const historyTarget = Math.min(BULK_HISTORY_COUNT, bulkVehicles.length * 5);
    for (let i = 0; i < historyTarget; i += 1) {
      const v = bulkVehicles[i % bulkVehicles.length];
      const passengerId = empIds[(i + 17) % empIds.length];
      if (passengerId === v.employee_id) continue;

      const route = pick(ROUTES, i);
      const tripStart = dateFromToday(-((i % 150) + 1), 9 + (i % 5));
      const tripEnd = new Date(tripStart.getTime() + route[7] * 60000);
      const fare = 70 + ((i % 7) * 15);
      const fuelCost = +(Number(route[6]) * 6.6).toFixed(2);

      const ride = (await c.query(
        `INSERT INTO rides (organization_id, driver_employee_id, vehicle_id,
           pickup_address, pickup_lat, pickup_lng,
           destination_address, destination_lat, destination_lng,
           distance_km, duration_minutes, departure_datetime, total_seats, available_seats, fare_per_seat, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,4,3,$13,'COMPLETED')
         RETURNING *`,
        [
          orgId, v.employee_id, v.vehicle_id,
          `Demo History Pickup ${i + 1} - ${route[0]}`, route[1], route[2],
          route[3], route[4], route[5], route[6], route[7], tripStart.toISOString(), fare,
        ]
      )).rows[0];
      const booking = (await c.query(
        `INSERT INTO ride_bookings (organization_id, ride_id, passenger_employee_id, seats_booked, fare_amount, booking_status)
         VALUES ($1,$2,$3,1,$4,'COMPLETED')
         RETURNING *`,
        [orgId, ride.ride_id, passengerId, fare]
      )).rows[0];
      const trip = (await c.query(
        `INSERT INTO trips (organization_id, ride_id, booking_id, driver_employee_id, passenger_employee_id,
           status, started_at, completed_at, actual_distance_km, actual_duration_minutes)
         VALUES ($1,$2,$3,$4,$5,'COMPLETED',$6,$7,$8,$9)
         RETURNING *`,
        [orgId, ride.ride_id, booking.booking_id, v.employee_id, passengerId, tripStart.toISOString(), tripEnd.toISOString(), route[6], route[7]]
      )).rows[0];
      await c.query(
        `INSERT INTO trip_status_history (organization_id, trip_id, status, changed_by_employee_id, changed_at)
         VALUES ($1,$2,'BOOKED',$3,$4), ($1,$2,'STARTED',$5,$4), ($1,$2,'COMPLETED',$5,$6)`,
        [orgId, trip.trip_id, passengerId, tripStart.toISOString(), v.employee_id, tripEnd.toISOString()]
      );
      await c.query(
        `INSERT INTO payments (organization_id, trip_id, payer_employee_id, payee_employee_id, amount, payment_method, status, paid_at)
         VALUES ($1,$2,$3,$4,$5,$6,'COMPLETED',$7)`,
        [orgId, trip.trip_id, passengerId, v.employee_id, fare, pick(PAYMENT_METHODS, i), tripEnd.toISOString()]
      );
      await c.query(
        `INSERT INTO ride_history (organization_id, trip_id, driver_employee_id, passenger_employee_id, vehicle_id,
           pickup_address, destination_address, trip_date, distance_km, fare_amount, fuel_cost, final_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'COMPLETED')`,
        [
          orgId, trip.trip_id, v.employee_id, passengerId, v.vehicle_id,
          ride.pickup_address, ride.destination_address, tripStart.toISOString().slice(0, 10), route[6], fare, fuelCost,
        ]
      );
    }

    await c.query('COMMIT');
    console.log('Seeded clean demo org "Acme Corp".');
    console.log('   Org code : ACME');
    console.log('   Admin    : admin@acme.com / admin123');
    console.log('   Employees: ravi@acme.com, priya@acme.com, arjun@acme.com  (pw: password123)');
    console.log(`   Demo rows : ${allEmployees.length} employees, ${vehicleLimit + 1} vehicles, ${openRideTarget + 1} open rides, ${historyTarget} completed ride histories`);
    console.log('   Bulk login sample: employee001@acme.com / password123');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
