/**
 * Prisma CLI runner — loads the monorepo root .env (via config/env) before
 * handing off to the prisma binary, so migrations work from a fresh clone
 * where DATABASE_URL only lives in the root .env.
 *
 * Usage: tsx scripts/prisma.ts migrate dev --name init
 */
import path from 'path';
import { spawnSync } from 'child_process';
import '../src/config/env';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: tsx scripts/prisma.ts <prisma args...>');
  process.exit(1);
}

const result = spawnSync(`npx prisma ${args.join(' ')}`, {
  stdio: 'inherit',
  shell: true,
  cwd: path.resolve(__dirname, '..'),
});

process.exit(result.status ?? 1);
