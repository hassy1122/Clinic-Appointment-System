/**
 * Runs once before the whole test suite.
 * Ensures the dedicated test database exists and is fully migrated.
 */
import path from 'path';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const devUrl = process.env.DATABASE_URL ?? '';
if (!devUrl) throw new Error('DATABASE_URL missing — copy .env.example to .env');
const testUrl = devUrl.replace(/\/clinic(\?|$)/, '/clinic_test$1');
process.env.DATABASE_URL = testUrl;

// 1. The test database is created by docker-compose's init script on a fresh
//    volume; this also covers containers that predate that change.
spawnSync(
  'docker exec clinic_postgres psql -U clinic -d postgres -c "CREATE DATABASE clinic_test"',
  { shell: true, stdio: 'ignore' }
);

// 2. Apply all migrations to the test database (idempotent).
const migrate = spawnSync('npx prisma migrate deploy', {
  shell: true,
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: testUrl },
});
if (migrate.status !== 0) {
  throw new Error('prisma migrate deploy failed for the test database');
}

export async function setup(): Promise<void> {}
export async function teardown(): Promise<void> {}
