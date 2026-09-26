import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { utcToWall } from '../src/utils/time';

export const TZ = process.env.CLINIC_TZ ?? 'Asia/Karachi';

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Notification", "ClinicSetting" RESTART IDENTITY CASCADE'
  );
}

/** Clinic-local calendar date `daysFromNow` days ahead. */
export function clinicDate(daysFromNow = 1): string {
  return utcToWall(new Date(Date.now() + daysFromNow * 86_400_000), TZ).dateISO;
}

export interface TestDoctor {
  userId: string;
  doctorId: string;
  email: string;
  password: string;
}

/** A doctor with an availability window covering every day 09:00–13:00 local. */
export async function createDoctor(
  overrides: { email?: string; name?: string; specialty?: string; start?: string; end?: string } = {}
): Promise<TestDoctor> {
  const email = overrides.email ?? `doctor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@clinic.test`;
  const password = 'Doctor1234!';
  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? 'Test Doctor',
      role: 'DOCTOR',
      passwordHash: await bcrypt.hash(password, 10),
      consentGivenAt: new Date(),
    },
  });
  const profile = await prisma.doctorProfile.create({
    data: { userId: user.id, specialty: overrides.specialty ?? 'General Physician', consultationFee: 1500 },
  });
  await prisma.availability.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      doctorId: profile.id,
      dayOfWeek,
      startTime: overrides.start ?? '09:00',
      endTime: overrides.end ?? '13:00',
      slotDurationMinutes: 20,
      bufferMinutes: 0,
    })),
  });
  return { userId: user.id, doctorId: profile.id, email, password };
}

export async function createPatient(email?: string): Promise<{ userId: string; email: string; password: string }> {
  const finalEmail = email ?? `patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'Patient1234!';
  const user = await prisma.user.create({
    data: {
      email: finalEmail,
      name: 'Test Patient',
      role: 'PATIENT',
      passwordHash: await bcrypt.hash(password, 10),
      consentGivenAt: new Date(),
    },
  });
  return { userId: user.id, email: finalEmail, password };
}

export async function createAdmin(): Promise<{ userId: string; email: string; password: string }> {
  const email = `admin-${Date.now()}@clinic.test`;
  const password = 'Admin1234!';
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Test Admin',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(password, 10),
      consentGivenAt: new Date(),
    },
  });
  return { userId: user.id, email, password };
}

export async function login(
  app: Express,
  email: string,
  password: string
): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
