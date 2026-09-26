import type { Appointment, AppointmentStatus, Prisma, User, DoctorProfile } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, notFound, SLOT_TAKEN } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { enqueueAppointmentLifecycle, enqueueSimple, renderNotification } from '../../lib/notifications';
import { generateSlots, isSlotAvailable, type SlotEngineInput, type WindowInput } from './slots';
import { addMinutes, dateWeekday, utcToWall, wallToUtc } from '../../utils/time';

type Db = Prisma.TransactionClient | typeof prisma;

const ACTIVE_STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED'];

interface WindowRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
}

function toWindowInput(w: WindowRow): WindowInput {
  return {
    dayOfWeek: w.dayOfWeek,
    startTime: w.startTime,
    endTime: w.endTime,
    slotDurationMinutes: w.slotDurationMinutes,
    bufferMinutes: w.bufferMinutes,
    isActive: w.isActive,
  };
}

export async function getDoctorProfile(db: Db, doctorId: string): Promise<DoctorProfile> {
  const doctor = await db.doctorProfile.findFirst({
    where: { id: doctorId, isActive: true },
    include: { user: true },
  });
  if (!doctor) throw notFound('Doctor not found');
  return doctor;
}

export async function doctorProfileForUser(db: Db, userId: string): Promise<DoctorProfile> {
  const profile = await db.doctorProfile.findUnique({ where: { userId } });
  if (!profile) throw forbidden('No doctor profile is attached to your account');
  return profile;
}

/** Window range covering the clinic-local day that contains `dateISO`, in UTC. */
function dayRangeUtc(dateISO: string, tz: string): { from: Date; to: Date } {
  const from = wallToUtc(dateISO, '00:00', tz);
  const to = addMinutes(wallToUtc(dateISO, '23:59', tz), 1);
  return { from: addMinutes(from, -60), to: addMinutes(to, 60) }; // ±1h spill-over margin
}

/**
 * Load everything the slot engine needs for one doctor + one clinic-local date.
 * Shared by the availability endpoint and by booking-time validation, so the
 * frontend can never see a slot the backend would reject.
 */
export async function loadSlotEngineInput(
  db: Db,
  doctorId: string,
  dateISO: string,
  now: Date = new Date()
): Promise<SlotEngineInput & { windows: WindowInput[] }> {
  const [windows, timeOff] = await Promise.all([
    db.availability.findMany({ where: { doctorId } }),
    db.timeOff.findMany({
      where: { doctorId, date: { gte: new Date(`${dateISO}T00:00:00.000Z`), lte: new Date(`${dateISO}T00:00:00.000Z`) } },
    }),
  ]);

  const range = dayRangeUtc(dateISO, env.CLINIC_TZ);
  const busy = await db.appointment.findMany({
    where: {
      doctorId,
      status: { in: ACTIVE_STATUSES },
      startsAt: { gte: range.from, lt: range.to },
    },
    select: { startsAt: true, durationMinutes: true },
  });

  return {
    windows: windows.map(toWindowInput),
    busy,
    timeOff,
    dateISO,
    clinicTz: env.CLINIC_TZ,
    now,
    minLeadMinutes: env.MIN_LEAD_MINUTES,
  };
}

/** Which working window (if any) contains `startsAt`, and its slot duration. */
function resolveDuration(
  input: SlotEngineInput,
  startsAt: Date,
  dateISO: string
): number | null {
  const weekday = dateWeekday(dateISO);
  const startMs = startsAt.getTime();
  for (const w of input.windows) {
    if (!w.isActive || w.dayOfWeek !== weekday) continue;
    const windowStart = wallToUtc(dateISO, w.startTime, input.clinicTz).getTime();
    const windowEnd = wallToUtc(dateISO, w.endTime, input.clinicTz).getTime();
    if (startMs >= windowStart && startMs + w.slotDurationMinutes * 60_000 <= windowEnd) {
      return w.slotDurationMinutes;
    }
  }
  return null;
}

function appointmentContext(appt: {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  reasonForVisit: string;
  patient: Pick<User, 'name' | 'email'>;
  doctor: { user: Pick<User, 'name'>; specialty: string };
}) {
  return {
    id: appt.id,
    startsAt: appt.startsAt,
    durationMinutes: appt.durationMinutes,
    reasonForVisit: appt.reasonForVisit,
    patientName: appt.patient.name,
    patientEmail: appt.patient.email,
    doctorName: appt.doctor.user.name,
    specialty: appt.doctor.specialty,
  };
}

const apptInclude = {
  patient: { select: { id: true, name: true, email: true, phone: true } },
  doctor: { include: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRelations = Appointment & {
  patient: { id: string; name: string; email: string; phone: string | null };
  doctor: DoctorProfile & { user: { id: string; name: string } };
};

/* ------------------------------------------------------------------ slots */

export async function getAvailableSlots(doctorId: string, dateISO: string): Promise<string[]> {
  await getDoctorProfile(prisma, doctorId);
  const input = await loadSlotEngineInput(prisma, doctorId, dateISO);
  return generateSlots(input).map((d) => d.toISOString());
}

/* ---------------------------------------------------------------- booking */

export async function createAppointment(
  patient: AuthUser,
  input: { doctorId: string; startsAt: string; reasonForVisit: string; symptoms?: string },
  ip: string | null
): Promise<AppointmentWithRelations> {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw badRequest('Invalid appointment time');
  const dateISO = utcToWall(startsAt, env.CLINIC_TZ).dateISO;

  return prisma.$transaction(async (tx) => {
    // Validates the doctor exists and is active (404 otherwise)
    await getDoctorProfile(tx, input.doctorId);
    const engineInput = await loadSlotEngineInput(tx, input.doctorId, dateISO);

    const duration = resolveDuration(engineInput, startsAt, dateISO);
    if (duration === null || !isSlotAvailable(engineInput, startsAt)) {
      throw SLOT_TAKEN();
    }

    const created = await tx.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: input.doctorId,
        startsAt,
        durationMinutes: duration,
        status: 'CONFIRMED',
        reasonForVisit: input.reasonForVisit.trim(),
        symptoms: input.symptoms?.trim() || null,
      },
      include: apptInclude,
    });

    await enqueueAppointmentLifecycle(tx, appointmentContext(created));

    audit({
      actorUserId: patient.id,
      action: 'appointment.create',
      entityType: 'Appointment',
      entityId: created.id,
      subjectPatientId: patient.id,
      ip,
      metadata: { doctorId: input.doctorId, startsAt: startsAt.toISOString() },
    });

    return created;
  });
}

/* ------------------------------------------------------------ ownership */

function assertAccess(user: AuthUser, appt: { patientId: string; doctorId: string }): 'owner' | 'admin' {
  if (user.role === 'ADMIN') return 'admin';
  if (user.role === 'PATIENT' && appt.patientId === user.id) return 'owner';
  if (user.role === 'DOCTOR' && appt.doctorId === user.doctorProfileId!) return 'owner';
  throw forbidden('You do not have access to this appointment');
}

// doctorProfileId is attached to AuthUser by the doctor-scoped routes below
declare module '../../middleware/auth' {
  interface AuthUser {
    doctorProfileId?: string;
  }
}

async function loadAppointment(id: string): Promise<AppointmentWithRelations> {
  const appt = await prisma.appointment.findUnique({ where: { id }, include: apptInclude });
  if (!appt) throw notFound('Appointment not found');
  return appt;
}

/** Resolve the caller's doctor profile (if any) so ownership checks work. */
export async function attachDoctorProfile(user: AuthUser): Promise<AuthUser> {
  if (user.role === 'DOCTOR' && !user.doctorProfileId) {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: user.id } });
    if (profile) user.doctorProfileId = profile.id;
  }
  return user;
}

/* ---------------------------------------------------------------- listing */

export async function listMine(
  user: AuthUser,
  scope: 'upcoming' | 'past' | 'all'
): Promise<AppointmentWithRelations[]> {
  const now = new Date();
  const timeFilter =
    scope === 'upcoming'
      ? { startsAt: { gte: now } }
      : scope === 'past'
        ? { startsAt: { lt: now } }
        : {};

  if (user.role === 'DOCTOR') {
    const profile = await doctorProfileForUser(prisma, user.id);
    return prisma.appointment.findMany({
      where: { doctorId: profile.id, ...timeFilter },
      include: apptInclude,
      orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
      take: 200,
    });
  }

  return prisma.appointment.findMany({
    where: { patientId: user.id, ...timeFilter },
    include: apptInclude,
    orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
    take: 200,
  });
}

export async function getOne(user: AuthUser, id: string): Promise<AppointmentWithRelations> {
  const appt = await loadAppointment(id);
  await attachDoctorProfile(user);
  assertAccess(user, appt);
  return appt;
}

/* ------------------------------------------------------------ transitions */

const TERMINAL: AppointmentStatus[] = ['CANCELLED', 'COMPLETED', 'NO_SHOW'];

export async function cancel(
  user: AuthUser,
  id: string,
  reason: string | undefined,
  ip: string | null
): Promise<AppointmentWithRelations> {
  const appt = await loadAppointment(id);
  await attachDoctorProfile(user);
  assertAccess(user, appt);
  if (TERMINAL.includes(appt.status)) {
    throw conflict('ALREADY_CLOSED', `This appointment is already ${appt.status.toLowerCase()}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        canceledAt: new Date(),
        canceledById: user.id,
        cancelReason: reason?.trim() || null,
      },
      include: apptInclude,
    });

    const ctx = appointmentContext(updated);
    const rendered = renderNotification('BOOKING_CANCELLED', ctx, { reason });
    await enqueueSimple({
      recipient: ctx.patientEmail,
      template: 'BOOKING_CANCELLED',
      subject: rendered.subject,
      text: rendered.text,
      payload: { appointmentId: id, ...rendered },
    });

    audit({
      actorUserId: user.id,
      action: 'appointment.cancel',
      entityType: 'Appointment',
      entityId: id,
      subjectPatientId: appt.patientId,
      ip,
      metadata: { reason: reason ?? null },
    });

    return updated;
  });
}

export async function reschedule(
  user: AuthUser,
  id: string,
  newStartsAt: string,
  ip: string | null
): Promise<AppointmentWithRelations> {
  const old = await loadAppointment(id);
  await attachDoctorProfile(user);
  assertAccess(user, old);
  if (TERMINAL.includes(old.status)) {
    throw conflict('ALREADY_CLOSED', `This appointment is already ${old.status.toLowerCase()}`);
  }

  const startsAt = new Date(newStartsAt);
  if (Number.isNaN(startsAt.getTime())) throw badRequest('Invalid appointment time');
  const dateISO = utcToWall(startsAt, env.CLINIC_TZ).dateISO;

  return prisma.$transaction(async (tx) => {
    const engineInput = await loadSlotEngineInput(tx, old.doctorId, dateISO);
    const duration = resolveDuration(engineInput, startsAt, dateISO);
    if (duration === null || !isSlotAvailable(engineInput, startsAt)) throw SLOT_TAKEN();

    // Reschedule = cancel + rebook: the old slot returns to the available pool
    await tx.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        canceledAt: new Date(),
        canceledById: user.id,
        cancelReason: 'rescheduled',
      },
    });

    const created = await tx.appointment.create({
      data: {
        patientId: old.patientId,
        doctorId: old.doctorId,
        startsAt,
        durationMinutes: duration,
        status: 'CONFIRMED',
        reasonForVisit: old.reasonForVisit,
        symptoms: old.symptoms,
        rescheduledFromId: id,
      },
      include: apptInclude,
    });

    const ctx = appointmentContext(created);
    const rendered = renderNotification('BOOKING_RESCHEDULED', ctx);
    await enqueueSimple({
      recipient: ctx.patientEmail,
      template: 'BOOKING_RESCHEDULED',
      subject: rendered.subject,
      text: rendered.text,
      payload: { appointmentId: created.id, previousAppointmentId: id, ...rendered },
    });

    audit({
      actorUserId: user.id,
      action: 'appointment.reschedule',
      entityType: 'Appointment',
      entityId: created.id,
      subjectPatientId: old.patientId,
      ip,
      metadata: { previousAppointmentId: id, startsAt: startsAt.toISOString() },
    });

    return created;
  });
}

const SETTABLE: AppointmentStatus[] = ['CONFIRMED', 'COMPLETED', 'NO_SHOW'];

export async function setStatus(
  user: AuthUser,
  id: string,
  status: AppointmentStatus,
  ip: string | null
): Promise<AppointmentWithRelations> {
  if (!SETTABLE.includes(status)) throw badRequest('This status cannot be set manually');
  const appt = await loadAppointment(id);
  await attachDoctorProfile(user);
  assertAccess(user, appt);
  if (appt.status === 'CANCELLED') {
    throw conflict('CANCELLED', 'A cancelled appointment cannot change status');
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status },
    include: apptInclude,
  });

  audit({
    actorUserId: user.id,
    action: `appointment.status.${status.toLowerCase()}`,
    entityType: 'Appointment',
    entityId: id,
    subjectPatientId: appt.patientId,
    ip,
  });

  return updated;
}
