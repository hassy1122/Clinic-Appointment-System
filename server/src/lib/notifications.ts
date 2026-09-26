import type { NotificationTemplate, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { sendMail } from './mailer';
import { env, reminderHoursBefore } from '../config/env';
import { addMinutes, utcToWall } from '../utils/time';

interface AppointmentContext {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  reasonForVisit: string;
  patientName: string;
  patientEmail: string;
  doctorName: string;
  specialty: string;
}

function formatWhen(startsAt: Date): string {
  const wall = utcToWall(startsAt, env.CLINIC_TZ);
  const [h, m] = wall.time.split(':');
  const hour12 = Number(h) % 12 || 12;
  const ampm = Number(h) >= 12 ? 'PM' : 'AM';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const [y, mo, d] = wall.dateISO.split('-').map(Number);
  const dayName = dayNames[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${dayName}, ${wall.dateISO} at ${hour12}:${m} ${ampm} (${env.CLINIC_TZ})`;
}

export function renderNotification(
  template: NotificationTemplate,
  ctx: AppointmentContext,
  extra?: { reason?: string; hoursUntil?: number; token?: string }
): { subject: string; text: string; html: string } {
  const when = formatWhen(ctx.startsAt);
  const footer = `\n\n${env.CLINIC_NAME}\n${env.CLINIC_ADDRESS}\n${env.CLINIC_PHONE}`;
  const link = env.CLIENT_ORIGIN;

  switch (template) {
    case 'BOOKING_CONFIRMED':
      return {
        subject: `Appointment confirmed — ${when}`,
        text: `Hi ${ctx.patientName},\n\nYour appointment is confirmed.\n\nDoctor: ${ctx.doctorName} (${ctx.specialty})\nWhen: ${when}\nReason: ${ctx.reasonForVisit}\n\nYou can view or cancel it here: ${link}/patient/appointments${footer}`,
        html: '',
      };
    case 'BOOKING_CANCELLED':
      return {
        subject: `Appointment cancelled — ${when}`,
        text: `Hi ${ctx.patientName},\n\nYour appointment with ${ctx.doctorName} on ${when} has been cancelled.${extra?.reason ? `\nReason: ${extra.reason}` : ''}\n\nBook a new time: ${link}/doctors${footer}`,
        html: '',
      };
    case 'BOOKING_RESCHEDULED':
      return {
        subject: `Appointment rescheduled — ${when}`,
        text: `Hi ${ctx.patientName},\n\nYour appointment with ${ctx.doctorName} has been rescheduled to ${when}.\n\nView it here: ${link}/patient/appointments${footer}`,
        html: '',
      };
    case 'REMINDER':
      return {
        subject: `Reminder: appointment in ${extra?.hoursUntil ?? ''} hour(s) — ${when}`,
        text: `Hi ${ctx.patientName},\n\nThis is a reminder for your appointment with ${ctx.doctorName} (${ctx.specialty}).\n\nWhen: ${when}\nReason: ${ctx.reasonForVisit}\n\nNeed to change it? ${link}/patient/appointments${footer}`,
        html: '',
      };
    case 'INVITE':
      return {
        subject: `You're invited to join ${env.CLINIC_NAME}`,
        text: `Hello,\n\nYou have been invited to join ${env.CLINIC_NAME} as ${extra?.reason ?? 'staff'}.\n\nAccept your invitation here: ${link}/accept-invite?token=${extra?.token ?? ''}\n\nThis link expires in 72 hours.${footer}`,
        html: '',
      };
    default:
      return { subject: 'Notification', text: '', html: '' };
  }
}

/**
 * Enqueue a notification inside the caller's transaction — booking must never
 * be blocked on an external mail/SMS provider. The reminder loop delivers them.
 */
export async function enqueue(
  tx: Prisma.TransactionClient,
  data: {
    recipient: string;
    template: NotificationTemplate;
    subject: string;
    payload: Prisma.InputJsonValue;
    scheduledFor?: Date;
  }
): Promise<void> {
  await tx.notification.create({
    data: {
      channel: 'EMAIL',
      recipient: data.recipient,
      template: data.template,
      subject: data.subject,
      payload: data.payload,
      scheduledFor: data.scheduledFor ?? new Date(),
    },
  });
}

/** Queue booking confirmation + the 24h/2h reminders (only when still in the future). */
export async function enqueueAppointmentLifecycle(
  tx: Prisma.TransactionClient,
  ctx: AppointmentContext
): Promise<void> {
  const base = {
    appointmentId: ctx.id,
    patientName: ctx.patientName,
    doctorName: ctx.doctorName,
    specialty: ctx.specialty,
    startsAt: ctx.startsAt.toISOString(),
    reasonForVisit: ctx.reasonForVisit,
  };

  const confirmed = renderNotification('BOOKING_CONFIRMED', ctx);
  await enqueue(tx, {
    recipient: ctx.patientEmail,
    template: 'BOOKING_CONFIRMED',
    subject: confirmed.subject,
    payload: { ...base, text: confirmed.text, html: confirmed.html },
  });

  const now = Date.now();
  for (const hours of reminderHoursBefore) {
    const fireAt = ctx.startsAt.getTime() - hours * 3_600_000;
    if (fireAt <= now) continue;
    const rendered = renderNotification('REMINDER', ctx, { hoursUntil: hours });
    await enqueue(tx, {
      recipient: ctx.patientEmail,
      template: 'REMINDER',
      subject: rendered.subject,
      payload: { ...base, hoursUntil: hours, text: rendered.text, html: rendered.html },
      scheduledFor: new Date(fireAt),
    });
  }
}

export async function enqueueSimple(params: {
  recipient: string;
  template: NotificationTemplate;
  subject: string;
  text: string;
  payload?: Record<string, unknown>;
  scheduledFor?: Date;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      channel: 'EMAIL',
      recipient: params.recipient,
      template: params.template,
      subject: params.subject,
      payload: { text: params.text, ...(params.payload ?? {}) } as Prisma.InputJsonValue,
      scheduledFor: params.scheduledFor ?? new Date(),
    },
  });
}

/**
 * Background delivery loop (called from index.ts). Claim due PENDING rows,
 * send them, retry with backoff up to 3 attempts.
 */
export async function processDueNotifications(): Promise<{ sent: number; failed: number }> {
  const due = await prisma.notification.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: new Date() }, attempts: { lt: 3 } },
    orderBy: { scheduledFor: 'asc' },
    take: 25,
  });

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const payload = row.payload as { text?: string; html?: string };
    const nextAttempt = row.attempts + 1;
    try {
      await sendMail({
        to: row.recipient,
        subject: row.subject,
        text: payload.text ?? '',
        html: payload.html,
      });
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: nextAttempt, lastError: null },
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = nextAttempt >= 3;
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          attempts: nextAttempt,
          lastError: message,
          // simple exponential backoff: 1min, 5min
          scheduledFor: addMinutes(new Date(), nextAttempt === 1 ? 1 : 5),
        },
      });
      failed++;
      console.error(`[notifications] send failed for ${row.id}: ${message}`);
    }
  }

  return { sent, failed };
}
