// Seeds a demo organization with an admin, employees, vehicles, wallets and
// a sample open ride. Safe to run once on a fresh DB. Usage: npm run seed
import pg from 'pg';
import bcrypt from 'bcryptjs';
import config from '../src/config.js';

const DEMO = {
  orgCode: 'ACME',
  orgName: 'Acme Corp',
  domain: 'acme.com',
  adminEmail: 'admin@acme.com',
  adminPass: 'admin123',
  employees: [
    { email: 'ravi@acme.com',  name: 'Ravi Kumar',   pass: 'password123', dept: 'Engineering', desig: 'SDE II' },
    { email: 'priya@acme.com', name: 'Priya Sharma',  pass: 'password123', dept: 'Design',      desig: 'Product Designer' },
    { email: 'arjun@acme.com', name: 'Arjun Mehta',   pass: 'password123', dept: 'Sales',       desig: 'AE' },
  ],
};

async function main() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL not set');
  const c = new pg.Client({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query('BEGIN');
  try {
    const org = (await c.query(
      `INSERT INTO organizations (org_name, org_code, domain_email)
       VALUES ($1,$2,$3)
       ON CONFLICT (org_code) DO UPDATE SET org_name=EXCLUDED.org_name
       RETURNING *`,
      [DEMO.orgName, DEMO.orgCode, DEMO.domain])).rows[0];
    const orgId = org.organization_id;

    await c.query(
      `INSERT INTO organization_settings (organization_id, fuel_cost_per_litre, avg_fuel_efficiency_kmpl, cost_per_km)
       VALUES ($1, 105.00, 16.00, 6.60) ON CONFLICT (organization_id) DO NOTHING`,
      [orgId]);

    // Admin (user + organization_admins)
    const adminHash = await bcrypt.hash(DEMO.adminPass, 10);
    const adminUser = (await c.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,'Acme Admin')
       ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING *`,
      [DEMO.adminEmail, adminHash])).rows[0];
    await c.query(
      `INSERT INTO organization_admins (organization_id, user_id, is_super_admin)
       VALUES ($1,$2,TRUE) ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [orgId, adminUser.user_id]);

    // Employees + wallets
    const empIds = [];
    for (const e of DEMO.employees) {
      const hash = await bcrypt.hash(e.pass, 10);
      const user = (await c.query(
        `INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING *`,
        [e.email, hash, e.name])).rows[0];
      const emp = (await c.query(
        `INSERT INTO employees (organization_id, user_id, department, designation)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET department=EXCLUDED.department
         RETURNING *`,
        [orgId, user.user_id, e.dept, e.desig])).rows[0];
      await c.query(`INSERT INTO wallets (organization_id, employee_id, balance) VALUES ($1,$2,500)
                     ON CONFLICT (organization_id, employee_id) DO NOTHING`, [orgId, emp.employee_id]);
      empIds.push(emp.employee_id);
    }

    // Driver vehicle for the first employee
    const vehicle = (await c.query(
      `INSERT INTO vehicles (organization_id, employee_id, vehicle_model, registration_number, seating_capacity, fuel_type, is_verified)
       VALUES ($1,$2,'Maruti Swift','KA01AB1234',4,'PETROL',TRUE)
       ON CONFLICT (organization_id, registration_number) DO UPDATE SET vehicle_model=EXCLUDED.vehicle_model
       RETURNING *`,
      [orgId, empIds[0]])).rows[0];

    // A sample OPEN ride (Bengaluru: Koramangala -> Whitefield) tomorrow 9am
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    await c.query(
      `INSERT INTO rides (organization_id, driver_employee_id, vehicle_id,
         pickup_address, pickup_lat, pickup_lng,
         destination_address, destination_lat, destination_lng,
         distance_km, duration_minutes, departure_datetime, total_seats, available_seats, fare_per_seat, status)
       VALUES ($1,$2,$3,'Koramangala, Bengaluru',12.935200,77.624600,
         'Whitefield, Bengaluru',12.969800,77.749900, 18.50, 55, $4, 3, 3, 80.00, 'OPEN')`,
      [orgId, empIds[0], vehicle.vehicle_id, tomorrow.toISOString()]);

    await c.query('COMMIT');
    console.log('✅ Seeded demo org "Acme Corp".');
    console.log('   Org code : ACME');
    console.log('   Admin    : admin@acme.com / admin123');
    console.log('   Employees: ravi@acme.com, priya@acme.com, arjun@acme.com  (pw: password123)');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1); });
