import type { AppointmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { addMinutes, utcToWall, wallToUtc } from '../../utils/time';

const apptInclude = {
  patient: { select: { id: true, name: true, email: true, phone: true } },
  doctor: { include: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.AppointmentInclude;

function dayRange(dateISO: string): { gte: Date; lt: Date } {
  const gte = wallToUtc(dateISO, '00:00', env.CLINIC_TZ);
  const lt = addMinutes(wallToUtc(dateISO, '23:59', env.CLINIC_TZ), 1);
  return { gte, lt };
}

export async function listAppointments(params: {
  status?: AppointmentStatus;
  date?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

  const where: Prisma.AppointmentWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.date ? { startsAt: dayRange(params.date) } : {}),
    ...(params.q
      ? {
          OR: [
            { patient: { name: { contains: params.q, mode: 'insensitive' } } },
            { patient: { email: { contains: params.q, mode: 'insensitive' } } },
            { doctor: { user: { name: { contains: params.q, mode: 'insensitive' } } } },
            { reasonForVisit: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      include: apptInclude,
      orderBy: { startsAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function listDoctors() {
  return prisma.doctorProfile.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
      availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      _count: { select: { appointments: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateDoctor(
  admin: AuthUser,
  doctorId: string,
  data: {
    name?: string;
    phone?: string;
    isActive?: boolean;
    specialty?: string;
    bio?: string;
    consultationFee?: number;
  },
  ip: string | null
) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { user: true },
  });
  if (!doctor) throw notFound('Doctor not found');

  const updated = await prisma.$transaction(async (tx) => {
    if (data.name !== undefined || data.phone !== undefined || data.isActive !== undefined) {
      await tx.user.update({
        where: { id: doctor.userId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
    }
    return tx.doctorProfile.update({
      where: { id: doctorId },
      data: {
        ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.consultationFee !== undefined ? { consultationFee: data.consultationFee } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    });
  });

  audit({
    actorUserId: admin.id,
    action: 'admin.doctor_update',
    entityType: 'DoctorProfile',
    entityId: doctorId,
    ip,
    metadata: { changes: data as Record<string, unknown> },
  });

  return updated;
}

export async function listAuditLogs(params: { subjectPatientId?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const where: Prisma.AuditLogWhereInput = params.subjectPatientId
    ? { subjectPatientId: params.subjectPatientId }
    : {};
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getClinic() {
  const row = await prisma.clinicSetting.findUnique({ where: { id: 'singleton' } });
  return (
    row ?? {
      id: 'singleton',
      name: env.CLINIC_NAME,
      address: env.CLINIC_ADDRESS,
      phone: env.CLINIC_PHONE,
      email: null as string | null,
      timezone: env.CLINIC_TZ,
      updatedAt: new Date(),
    }
  );
}

export async function updateClinic(
  admin: AuthUser,
  data: { name?: string; address?: string; phone?: string; email?: string; timezone?: string },
  ip: string | null
) {
  const row = await prisma.clinicSetting.upsert({
    where: { id: 'singleton' },
    create: {
      name: data.name ?? env.CLINIC_NAME,
      address: data.address ?? env.CLINIC_ADDRESS,
      phone: data.phone ?? env.CLINIC_PHONE,
      email: data.email ?? null,
      timezone: data.timezone ?? env.CLINIC_TZ,
    },
    update: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
    },
  });
  audit({
    actorUserId: admin.id,
    action: 'admin.clinic_update',
    entityType: 'ClinicSetting',
    entityId: 'singleton',
    ip,
    metadata: { changes: data as Record<string, unknown> },
  });
  return row;
}

export async function stats() {
  const todayISO = utcToWall(new Date(), env.CLINIC_TZ).dateISO;
  const today = dayRange(todayISO);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const [todayTotal, todayCompleted, upcoming, doctors, byStatus, recent] = await Promise.all([
    prisma.appointment.count({
      where: { startsAt: { gte: today.gte, lt: today.lt }, status: { not: 'CANCELLED' } },
    }),
    prisma.appointment.count({
      where: { startsAt: { gte: today.gte, lt: today.lt }, status: 'COMPLETED' },
    }),
    prisma.appointment.count({
      where: { startsAt: { gte: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } },
    }),
    prisma.doctorProfile.count({ where: { isActive: true } }),
    prisma.appointment.groupBy({
      by: ['status'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: today.gte, lt: today.lt }, status: { not: 'CANCELLED' } },
      include: apptInclude,
      orderBy: { startsAt: 'asc' },
    }),
  ]);

  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count])) as Record<
    string,
    number
  >;
  const completed = counts.COMPLETED ?? 0;
  const noShow = counts.NO_SHOW ?? 0;
  const finished = completed + noShow;

  return {
    todayTotal,
    todayCompleted,
    upcoming,
    doctors,
    last30Days: {
      byStatus: counts,
      noShowRate: finished > 0 ? Math.round((noShow / finished) * 100) : 0,
    },
    todaysAppointments: recent,
  };
}
