import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import * as h from './helpers';

let app: Express;
let doctor: h.TestDoctor;
let patientA: { userId: string; email: string; password: string };
let patientB: { userId: string; email: string; password: string };
let tokenA: string;
let tokenB: string;
let date: string;
let slots: string[];

beforeAll(async () => {
  app = createApp();
  await h.resetDb();
  doctor = await h.createDoctor({ name: 'Dr. Slot Test' });
  patientA = await h.createPatient();
  patientB = await h.createPatient();
  tokenA = await h.login(app, patientA.email, patientA.password);
  tokenB = await h.login(app, patientB.email, patientB.password);
  date = h.clinicDate(1);
});

describe('slot availability', () => {
  it('returns only genuinely open slots for a doctor', async () => {
    const res = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThan(0);
    slots = res.body.slots;
    // Window is 09:00–13:00 local in 20-minute steps → up to 12 slots
    expect(res.body.slots.length).toBeLessThanOrEqual(12);
  });

  it('returns an empty list for a doctor with no availability that day', async () => {
    const other = await h.createDoctor({ start: '09:00', end: '13:00' });
    // force availability onto a single fixed weekday far from `date`
    const { prisma } = await import('../src/lib/prisma');
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    await prisma.availability.updateMany({
      where: { doctorId: other.doctorId },
      data: { dayOfWeek: (weekday + 3) % 7 },
    });
    const res = await request(app).get(`/api/doctors/${other.doctorId}/slots?date=${date}`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('rejects a malformed date', async () => {
    const res = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=not-a-date`);
    expect(res.status).toBe(400);
  });
});

describe('booking flow', () => {
  let bookedSlot: string;
  let appointmentId: string;

  it('books an available slot', async () => {
    bookedSlot = slots[0];
    const res = await request(app)
      .post('/api/appointments')
      .set(h.auth(tokenA))
      .send({
        doctorId: doctor.doctorId,
        startsAt: bookedSlot,
        reasonForVisit: 'Annual check-up',
        symptoms: 'None currently',
      });
    expect(res.status).toBe(201);
    expect(res.body.appointment.status).toBe('CONFIRMED');
    expect(res.body.appointment.startsAt).toBe(bookedSlot);
    appointmentId = res.body.appointment.id;
  });

  it('rejects a second booking of the same slot (double-booking guard)', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set(h.auth(tokenB))
      .send({ doctorId: doctor.doctorId, startsAt: bookedSlot, reasonForVisit: 'Second patient' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SLOT_TAKEN');
  });

  it('removes the booked slot from the availability list', async () => {
    const res = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
    expect(res.body.slots).not.toContain(bookedSlot);
  });

  it('rejects a booking outside working hours', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set(h.auth(tokenB))
      .send({ doctorId: doctor.doctorId, startsAt: `${date}T04:00:00.000Z`, reasonForVisit: 'Too early' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SLOT_TAKEN');
  });

  it('reschedules: frees the old slot and occupies the new one', async () => {
    const fresh = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
    const target = fresh.body.slots.find((s: string) => s !== bookedSlot);
    expect(target).toBeTruthy();

    const res = await request(app)
      .put(`/api/appointments/${appointmentId}/reschedule`)
      .set(h.auth(tokenA))
      .send({ startsAt: target });
    expect(res.status).toBe(200);
    expect(res.body.appointment.id).not.toBe(appointmentId);
    expect(res.body.appointment.rescheduledFromId).toBe(appointmentId);

    const after = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
    expect(after.body.slots).toContain(bookedSlot); // old slot released
    expect(after.body.slots).not.toContain(target); // new slot taken

    // The superseded appointment is CANCELLED
    const mine = await request(app)
      .get('/api/appointments/mine?scope=all')
      .set(h.auth(tokenA));
    const old = mine.body.appointments.find((a: any) => a.id === appointmentId);
    expect(old.status).toBe('CANCELLED');
    appointmentId = res.body.appointment.id;
  });

  it('cancels and returns the slot to the pool', async () => {
    const res = await request(app)
      .put(`/api/appointments/${appointmentId}/cancel`)
      .set(h.auth(tokenA))
      .send({ reason: 'Plans changed' });
    expect(res.status).toBe(200);
    expect(res.body.appointment.status).toBe('CANCELLED');

    const after = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
    expect(after.body.slots).toContain(bookedSlot);
  });

  it('rebooks the freed slot (cancelled slots are reusable)', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set(h.auth(tokenB))
      .send({ doctorId: doctor.doctorId, startsAt: bookedSlot, reasonForVisit: 'Rebooked after cancel' });
    expect(res.status).toBe(201);
    expect(res.body.appointment.status).toBe('CONFIRMED');
  });

  it('marks an appointment completed / no-show from the doctor account', async () => {
    const doctorToken = await h.login(app, doctor.email, doctor.password);
    const mine = await request(app).get('/api/appointments/mine?scope=all').set(h.auth(doctorToken));
    const appt = mine.body.appointments.find((a: any) => a.status === 'CONFIRMED');
    expect(appt).toBeTruthy();

    const res = await request(app)
      .put(`/api/appointments/${appt.id}/status`)
      .set(h.auth(doctorToken))
      .send({ status: 'NO_SHOW' });
    expect(res.status).toBe(200);
    expect(res.body.appointment.status).toBe('NO_SHOW');
  });

  it('requires authentication to book', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .send({ doctorId: doctor.doctorId, startsAt: bookedSlot, reasonForVisit: 'Anonymous' });
    expect(res.status).toBe(401);
  });

  it('does not allow a doctor account to book appointments', async () => {
    const doctorToken = await h.login(app, doctor.email, doctor.password);
    const res = await request(app)
      .post('/api/appointments')
      .set(h.auth(doctorToken))
      .send({ doctorId: doctor.doctorId, startsAt: slots[1], reasonForVisit: 'Self-booking' });
    expect(res.status).toBe(403);
  });
});
