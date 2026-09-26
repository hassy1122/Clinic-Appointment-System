import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import * as h from './helpers';

/**
 * The double-booking test from the pre-launch checklist:
 * N patients race for the same slot at the same moment — exactly one wins,
 * everyone else gets SLOT_TAKEN. The partial unique index on
 * (doctorId, startsAt) WHERE status <> 'CANCELLED' guarantees this at the
 * database level, regardless of application timing.
 */
describe('concurrent booking race', () => {
  let app: Express;
  let doctor: h.TestDoctor;
  let slot: string;

  beforeAll(async () => {
    app = createApp();
    await h.resetDb();
    doctor = await h.createDoctor({ name: 'Dr. Race' });
    const date = h.clinicDate(1);
    const res = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
    slot = res.body.slots[0];
    expect(slot).toBeTruthy();
  });

  it('allows exactly one of 8 simultaneous bookings to win', async () => {
    const patients = await Promise.all(Array.from({ length: 8 }, () => h.createPatient()));
    const tokens = [];
    for (const p of patients) {
      tokens.push(await h.login(app, p.email, p.password));
    }

    const attempts = tokens.map((token) =>
      request(app)
        .post('/api/appointments')
        .set(h.auth(token))
        .send({ doctorId: doctor.doctorId, startsAt: slot, reasonForVisit: 'Race entry' })
    );

    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r.status === 201);
    const losers = results.filter((r) => r.status === 409);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(7);
    for (const loser of losers) {
      expect(loser.body.error).toBe('SLOT_TAKEN');
    }

    // The database holds exactly one active appointment for that slot
    const { prisma } = await import('../src/lib/prisma');
    const active = await prisma.appointment.count({
      where: { doctorId: doctor.doctorId, startsAt: new Date(slot), status: { not: 'CANCELLED' } },
    });
    expect(active).toBe(1);
  });

  it('allows rescheduling the same appointment only once under a race', async () => {
    const date = h.clinicDate(2);
    const res = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
    const [s1, s2] = res.body.slots;
    expect(s1).toBeTruthy();
    expect(s2).toBeTruthy();

    // Book s1 first
    const patient = await h.createPatient();
    const token = await h.login(app, patient.email, patient.password);
    const booked = await request(app)
      .post('/api/appointments')
      .set(h.auth(token))
      .send({ doctorId: doctor.doctorId, startsAt: s1, reasonForVisit: 'Original' });
    const apptId = booked.body.appointment.id;

    // Two simultaneous reschedule attempts from the same appointment
    const [r1, r2] = await Promise.all([
      request(app)
        .put(`/api/appointments/${apptId}/reschedule`)
        .set(h.auth(token))
        .send({ startsAt: s2 }),
      request(app)
        .put(`/api/appointments/${apptId}/reschedule`)
        .set(h.auth(token))
        .send({ startsAt: s2 }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // Exactly one reschedule lands; the other fails on the unique
    // rescheduledFromId constraint or the closed-status guard.
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s >= 400)).toHaveLength(1);

    const { prisma } = await import('../src/lib/prisma');
    const children = await prisma.appointment.count({ where: { rescheduledFromId: apptId } });
    expect(children).toBe(1);
  });
});
