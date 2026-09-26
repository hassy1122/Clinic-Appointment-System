import { processDueNotifications } from '../lib/notifications';

/**
 * Minimal in-process scheduler: delivers due rows from the notification
 * outbox every minute. Deliberately in-process (no queue infra) — booking
 * never blocks on a provider, and reminders still fire while the server runs.
 * If a send fails it is retried with backoff (see processDueNotifications).
 */
export function startReminderLoop(intervalMs = 60_000): () => void {
  let running = false;

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processDueNotifications()
      .then(({ sent }) => {
        if (sent > 0) console.log(`[reminders] sent ${sent} notification(s)`);
      })
      .catch((err) => console.error('[reminders] loop error:', err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  timer.unref?.();
  return () => clearInterval(timer);
}
