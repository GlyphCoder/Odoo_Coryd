// Runs db/schema.sql against DATABASE_URL. Usage: npm run migrate
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import config from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../../db/schema.sql');

async function main() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL not set (copy server/.env.example -> server/.env)');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = new pg.Client({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Applying schema from', schemaPath);
  await client.query(sql);
  console.log('✅ Schema applied.');
  await client.end();
}

main().catch((e) => { console.error('❌ Migration failed:', e.message); process.exit(1); });
