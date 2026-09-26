/**
 * Runs in each worker BEFORE any test file (and before src/ is imported),
 * so the app under test always talks to the test database.
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

process.env.NODE_ENV = 'test';

const devUrl = process.env.DATABASE_URL ?? '';
if (devUrl) {
  process.env.DATABASE_URL = devUrl.replace(/\/clinic(\?|$)/, '/clinic_test$1');
}
