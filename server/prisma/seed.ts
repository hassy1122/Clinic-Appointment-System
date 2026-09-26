/**
 * Seed data — runnable demo clinic.
 * Credentials (development only):
 *   admin@clinic.test      / Admin1234!
 *   sara@example.com       / Patient1234!   (patient)
 *   omar@example.com       / Patient1234!   (patient)
 *   dr.ahmed@clinic.test   / Doctor1234!
 *   dr.mariam@clinic.test  / Doctor1234!
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';
import '../src/config/env';
import { encrypt } from '../src/lib/crypto';
import { wallToUtc, utcToWall, addMinutes } from '../src/utils/time';

const TZ = process.env.CLINIC_TZ ?? 'Asia/Karachi';

async function main() {
  console.log('Seeding clinic data...');

  await prisma.clinicSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      name: process.env.CLINIC_NAME ?? 'Riverside Family Clinic',
      address: process.env.CLINIC_ADDRESS ?? '12 Riverside Road, Karachi',
      phone: process.env.CLINIC_PHONE ?? '+92 21 1234567',
      email: 'appointments@clinic.test',
      timezone: TZ,
    },
  });

  const password = async (p: string) => bcrypt.hash(p, 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@clinic.test' },
    update: {},
    create: {
      email: 'admin@clinic.test',
      name: 'Clinic Admin',
      role: 'ADMIN',
      phone: '+92 300 0000001',
      passwordHash: await password('Admin1234!'),
      consentGivenAt: new Date(),
    },
  });

  const patientSara = await prisma.user.upsert({
    where: { email: 'sara@example.com' },
    update: {},
    create: {
      email: 'sara@example.com',
      name: 'Sara Khan',
      role: 'PATIENT',
      phone: '+92 301 1112223',
      passwordHash: await password('Patient1234!'),
      consentGivenAt: new Date(),
    },
  });

  const patientOmar = await prisma.user.upsert({
    where: { email: 'omar@example.com' },
    update: {},
    create: {
      email: 'omar@example.com',
      name: 'Omar Ali',
      role: 'PATIENT',
      phone: '+92 302 4445556',
      passwordHash: await password('Patient1234!'),
      consentGivenAt: new Date(),
    },
  });

  async function makeDoctor(
    email: string,
    name: string,
    specialty: string,
    fee: number,
    bio: string,
    windows: { dayOfWeek: number; start: string; end: string }[]
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        role: 'DOCTOR',
        passwordHash: await password('Doctor1234!'),
        consentGivenAt: new Date(),
      },
    });

    const profile = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, specialty, consultationFee: fee, bio },
    });

    const existing = await prisma.availability.count({ where: { doctorId: profile.id } });
    if (existing === 0) {
      await prisma.availability.createMany({
        data: windows.map((w) => ({
          doctorId: profile.id,
          dayOfWeek: w.dayOfWeek,
          startTime: w.start,
          endTime: w.end,
          slotDurationMinutes: 20,
          bufferMinutes: 5,
        })),
      });
    }
    return profile;
  }

  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const ahmed = await makeDoctor(
    'dr.ahmed@clinic.test',
    'Dr. Ahmed Raza',
    'Cardiology',
    3000,
    'Consultant cardiologist with 14 years of experience in interventional cardiology and preventive heart care.',
    allDays.map((d) => ({ dayOfWeek: d, start: '09:00', end: '13:00' }))
  );
  const mariam = await makeDoctor(
    'dr.mariam@clinic.test',
    'Dr. Mariam Siddiqui',
    'Dermatology',
    2500,
    'Specialist in skin, hair and nail conditions with a focus on clinical and cosmetic dermatology.',
    [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, start: '10:00', end: '16:00' }))
  );
  void mariam;
  await makeDoctor(
    'dr.bilal@clinic.test',
    'Dr. Bilal Ahmed',
    'General Physician',
    1500,
    'Family medicine physician handling everyday illnesses, check-ups and chronic-disease follow-ups.',
    allDays.map((d) => ({ dayOfWeek: d, start: '14:00', end: '20:00' }))
  );

  // Demo history: one completed past appointment with encrypted notes
  const apptCount = await prisma.appointment.count({ where: { patientId: patientSara.id } });
  if (apptCount === 0) {
    // Past (yesterday) — completed, with a consultation note
    const pastStart = addMinutes(new Date(), -26 * 60);
    const past = await prisma.appointment.create({
      data: {
        patientId: patientSara.id,
        doctorId: ahmed.id,
        startsAt: pastStart,
        durationMinutes: 20,
        status: 'COMPLETED',
        reasonForVisit: 'Follow-up after blood pressure medication change',
        symptoms: 'Occasional dizziness in the morning',
      },
    });
    await prisma.consultationNote.create({
      data: {
        appointmentId: past.id,
        doctorId: ahmed.id,
        patientId: patientSara.id,
        notes: encrypt(
          'Patient reports improved BP control. Continued current dosage. Repeat labs in 6 weeks. Lifestyle advice reinforced.'
        ),
        prescriptions: encrypt(
          JSON.stringify([
            { medication: 'Amlodipine 5mg', dosage: 'Once daily after breakfast', instructions: 'Monitor BP twice weekly' },
          ])
        ),
      },
    });

    // Future — upcoming appointment so dashboards are not empty on first run
    const slots = await nextAvailableSlot(ahmed.id);
    if (slots) {
      await prisma.appointment.create({
        data: {
          patientId: patientOmar.id,
          doctorId: ahmed.id,
          startsAt: slots,
          durationMinutes: 20,
          status: 'CONFIRMED',
          reasonForVisit: 'Chest discomfort while climbing stairs',
          symptoms: 'Mild tightness for the last week',
        },
      });
    }
  }

  console.log('Seed complete.');
  console.log(`  Admin:    admin@clinic.test / Admin1234!`);
  console.log(`  Patients: sara@example.com, omar@example.com / Patient1234!`);
  console.log(`  Doctors:  dr.ahmed@clinic.test, dr.mariam@clinic.test, dr.bilal@clinic.test / Doctor1234!`);
  console.log(`  (admin id: ${admin.id})`);
}

/** First free slot of a doctor in the next 7 days (uses the real slot engine). */
async function nextAvailableSlot(doctorId: string): Promise<Date | null> {
  const { generateSlots } = await import('../src/modules/appointments/slots');
  for (let i = 1; i <= 7; i++) {
    const date = new Date(Date.now() + i * 86_400_000);
    const dateISO = utcToWall(date, TZ).dateISO;
    const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
    const windows = await prisma.availability.findMany({ where: { doctorId, isActive: true } });
    const busy = await prisma.appointment.findMany({
      where: { doctorId, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gte: wallToUtc(dateISO, '00:00', TZ) } },
      select: { startsAt: true, durationMinutes: true },
    });
    const slots = generateSlots({
      windows: windows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        slotDurationMinutes: w.slotDurationMinutes,
        bufferMinutes: w.bufferMinutes,
        isActive: w.isActive,
      })),
      busy,
      timeOff: [],
      dateISO,
      clinicTz: TZ,
      now: new Date(),
      minLeadMinutes: Number(process.env.MIN_LEAD_MINUTES ?? 30),
    });
    if (weekday !== undefined && slots.length > 0) return slots[0];
  }
  return null;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
