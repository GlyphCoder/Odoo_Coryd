import pg from 'pg';
import config from './src/config.js';

async function migrate() {
  const c = new pg.Client({ connectionString: config.databaseUrl });
  await c.connect();
  try {
    console.log('Altering employees status...');
    await c.query(`
      ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_status_check;
      ALTER TABLE employees ADD CONSTRAINT employees_status_check CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED','PENDING'));
      ALTER TABLE employees ALTER COLUMN status SET DEFAULT 'PENDING';
    `);
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await c.end();
  }
}
migrate();
