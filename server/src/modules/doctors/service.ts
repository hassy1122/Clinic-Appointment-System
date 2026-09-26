import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import type { WindowInput } from '../appointments/slots';
import { doctorProfileForUser } from '../appointments/service';
import { isHHMM } from '../../utils/time';

const doctorInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
  availability: { orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }] },
} satisfies Prisma.DoctorProfileInclude;

export type DoctorWithRelations = Prisma.DoctorProfileGetPayload<{ include: typeof doctorInclude }>;

export async function listDoctors(params: { q?: string; specialty?: string }) {
  const where: Prisma.DoctorProfileWhereInput = {
    isActive: true,
    user: { isActive: true },
    ...(params.specialty ? { specialty: params.specialty } : {}),
    ...(params.q
      ? {
          OR: [
            { user: { name: { contains: params.q, mode: 'insensitive' } } },
            { specialty: { contains: params.q, mode: 'insensitive' } },
            { bio: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  return prisma.doctorProfile.findMany({
    where,
    include: doctorInclude,
    orderBy: [{ specialty: 'asc' }, { user: { name: 'asc' } }],
  });
}

export async function getDoctor(id: string): Promise<DoctorWithRelations> {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { id, isActive: true, user: { isActive: true } },
    include: doctorInclude,
  });
  if (!doctor) throw notFound('Doctor not found');
  return doctor;
}

export async function listSpecialties(): Promise<string[]> {
  const rows = await prisma.doctorProfile.findMany({
    where: { isActive: true },
    select: { specialty: true },
    distinct: ['specialty'],
    orderBy: { specialty: 'asc' },
  });
  return rows.map((r) => r.specialty);
}

/** Resolve which doctor the caller may manage (self, or any if admin). */
async function resolveTargetDoctor(user: AuthUser, doctorId?: string): Promise<string> {
  if (user.role === 'ADMIN' && doctorId) return doctorId;
  const profile = await doctorProfileForUser(prisma, user.id);
  if (doctorId && doctorId !== profile.id) throw forbidden('You can only manage your own schedule');
  return profile.id;
}

export async function updateMyProfile(
  user: AuthUser,
  data: { specialty?: string; bio?: string; consultationFee?: number; photoUrl?: string }
): Promise<DoctorWithRelations> {
  const existing = await prisma.doctorProfile.findUnique({ where: { userId: user.id } });
  const doctorId =
    existing?.id ??
    (
      await prisma.doctorProfile.create({
        data: { userId: user.id, specialty: data.specialty ?? 'General Physician' },
      })
    ).id;

  await prisma.doctorProfile.update({
    where: { id: doctorId },
    data: {
      ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.consultationFee !== undefined ? { consultationFee: data.consultationFee } : {}),
      ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl } : {}),
    },
  });

  return getDoctor(doctorId);
}

export interface AvailabilityWindowInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
}

function validateWindows(windows: AvailabilityWindowInput[]): WindowInput[] {
  if (!Array.isArray(windows)) throw badRequest('windows must be an array');
  if (windows.length > 21) throw badRequest('Too many availability windows');

  return windows.map((w, i) => {
    if (!Number.isInteger(w.dayOfWeek) || w.dayOfWeek < 0 || w.dayOfWeek > 6) {
      throw badRequest(`Window ${i + 1}: dayOfWeek must be 0-6`);
    }
    if (!isHHMM(w.startTime) || !isHHMM(w.endTime)) {
      throw badRequest(`Window ${i + 1}: times must be HH:mm`);
    }
    if (w.endTime <= w.startTime) throw badRequest(`Window ${i + 1}: endTime must be after startTime`);
    if (!Number.isInteger(w.slotDurationMinutes) || w.slotDurationMinutes < 5 || w.slotDurationMinutes > 240) {
      throw badRequest(`Window ${i + 1}: slotDurationMinutes must be 5-240`);
    }
    if (!Number.isInteger(w.bufferMinutes) || w.bufferMinutes < 0 || w.bufferMinutes > 120) {
      throw badRequest(`Window ${i + 1}: bufferMinutes must be 0-120`);
    }
    return {
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      slotDurationMinutes: w.slotDurationMinutes,
      bufferMinutes: w.bufferMinutes,
      isActive: true,
    };
  });
}

/** Replace the doctor's full weekly schedule in one transaction. */
export async function replaceAvailability(
  user: AuthUser,
  windows: AvailabilityWindowInput[],
  doctorId?: string,
  ip?: string | null
): Promise<DoctorWithRelations> {
  const targetId = await resolveTargetDoctor(user, doctorId);
  const valid = validateWindows(windows);

  await prisma.$transaction(async (tx) => {
    await tx.availability.deleteMany({ where: { doctorId: targetId } });
    if (valid.length > 0) {
      await tx.availability.createMany({
        data: valid.map((w) => ({ doctorId: targetId, ...w })),
      });
    }
    audit({
      actorUserId: user.id,
      action: 'doctor.availability_update',
      entityType: 'DoctorProfile',
      entityId: targetId,
      ip,
      metadata: { windows: valid.length },
    });
  });

  return getDoctor(targetId);
}

export async function listTimeOff(doctorId: string) {
  return prisma.timeOff.findMany({
    where: { doctorId, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    orderBy: { date: 'asc' },
  });
}

export async function addTimeOff(
  user: AuthUser,
  input: { date: string; startTime?: string; endTime?: string; reason?: string },
  doctorId?: string,
  ip?: string | null
) {
  const targetId = await resolveTargetDoctor(user, doctorId);
  if (input.startTime && !input.endTime) throw badRequest('endTime is required when startTime is set');
  if (!input.startTime && input.endTime) throw badRequest('startTime is required when endTime is set');
  if (input.startTime && input.endTime && input.endTime <= input.startTime) {
    throw badRequest('endTime must be after startTime');
  }

  const created = await prisma.timeOff.create({
    data: {
      doctorId: targetId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      reason: input.reason?.trim() || null,
    },
  });

  audit({
    actorUserId: user.id,
    action: 'doctor.time_off_add',
    entityType: 'TimeOff',
    entityId: created.id,
    ip,
    metadata: { date: input.date },
  });
  return created;
}

export async function removeTimeOff(user: AuthUser, timeOffId: string, ip?: string | null) {
  const row = await prisma.timeOff.findUnique({ where: { id: timeOffId } });
  if (!row) throw notFound('Time-off entry not found');
  await resolveTargetDoctor(user, row.doctorId);
  await prisma.timeOff.delete({ where: { id: timeOffId } });
  audit({
    actorUserId: user.id,
    action: 'doctor.time_off_remove',
    entityType: 'TimeOff',
    entityId: timeOffId,
    ip,
  });
}
