import { createApp } from './app';
import { env, isProd } from './config/env';
import { prisma } from './lib/prisma';
import { startReminderLoop } from './jobs/reminders';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🏥 ${env.CLINIC_NAME} API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

const stopReminders = startReminderLoop(isProd ? 60_000 : 30_000);

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  stopReminders();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Failsafe
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
