import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

// Supabase requires SSL. reject unauthorized off for the pooled/managed cert.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err.message);
});

/**
 * Simple query helper.
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a set of queries for a single tenant. If ENABLE_RLS is on, the
 * connection sets app.current_org_id (local to the transaction) so Postgres
 * RLS policies filter rows. Always use this for tenant-scoped work; it also
 * gives you transactional safety.
 *
 * @param {string} orgId
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTenant(orgId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (config.enableRls && orgId) {
      // `true` => setting is local to this transaction only.
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export default pool;
