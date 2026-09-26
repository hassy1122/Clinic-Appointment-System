import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import * as h from './helpers';

let app: Express;
let doctor: h.TestDoctor;
let otherDoctor: h.TestDoctor;
let patientA: { userId: string; email: string; password: string };
let patientB: { userId: string; email: string; password: string };
let admin: { userId: string; email: string; password: string };
let tokenA: string;
let tokenB: string;
let tokenAdmin: string;
let tokenDoctor: string;
let appointmentId: string;
let date: string;

beforeAll(async () => {
  app = createApp();
  await h.resetDb();

  doctor = await h.createDoctor({ name: 'Dr. Notes' });
  otherDoctor = await h.createDoctor({ name: 'Dr. Other' });
  patientA = await h.createPatient();
  patientB = await h.createPatient();
  admin = await h.createAdmin();

  tokenA = await h.login(app, patientA.email, patientA.password);
  tokenB = await h.login(app, patientB.email, patientB.password);
  tokenAdmin = await h.login(app, admin.email, admin.password);
  tokenDoctor = await h.login(app, doctor.email, doctor.password);

  date = h.clinicDate(2);
  const slotsRes = await request(app).get(`/api/doctors/${doctor.doctorId}/slots?date=${date}`);
  const res = await request(app)
    .post('/api/appointments')
    .set(h.auth(tokenA))
    .send({
      doctorId: doctor.doctorId,
      startsAt: slotsRes.body.slots[0],
      reasonForVisit: 'Persistent cough',
    });
  appointmentId = res.body.appointment.id;
});

describe('appointment access control', () => {
  it('lets the owning patient read their appointment', async () => {
    const res = await request(app).get(`/api/appointments/${appointmentId}`).set(h.auth(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.appointment.id).toBe(appointmentId);
  });

  it("blocks another patient from reading someone else's appointment (ID guessing)", async () => {
    const res = await request(app).get(`/api/appointments/${appointmentId}`).set(h.auth(tokenB));
    expect(res.status).toBe(403);
  });

  it("blocks another patient from cancelling someone else's appointment", async () => {
    const res = await request(app)
      .put(`/api/appointments/${appointmentId}/cancel`)
      .set(h.auth(tokenB))
      .send({ reason: 'malicious' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown appointment id', async () => {
    const res = await request(app).get('/api/appointments/nonexistent-id').set(h.auth(tokenA));
    expect(res.status).toBe(404);
  });

  it("shows each patient only their own list", async () => {
    const mineA = await request(app).get('/api/appointments/mine').set(h.auth(tokenA));
    const mineB = await request(app).get('/api/appointments/mine').set(h.auth(tokenB));
    expect(mineA.body.appointments.map((a: any) => a.id)).toContain(appointmentId);
    expect(mineB.body.appointments.map((a: any) => a.id)).not.toContain(appointmentId);
  });
});

describe('consultation notes (sensitive health data)', () => {
  const noteText = 'Patient has bronchitis. Prescribed cough syrup for 5 days.';
  const prescription = [{ medication: 'Cough syrup', dosage: '10ml twice daily' }];

  it('lets only the treating doctor write notes', async () => {
    const res = await request(app)
      .put(`/api/appointments/${appointmentId}/notes`)
      .set(h.auth(tokenDoctor))
      .send({ notes: noteText, prescriptions: prescription });
    expect(res.status).toBe(200);
    expect(res.body.note.notes).toBe(noteText);
  });

  it('stores the note encrypted at rest', async () => {
    const { prisma } = await import('../src/lib/prisma');
    const row = await prisma.consultationNote.findUnique({ where: { appointmentId } });
    expect(row).toBeTruthy();
    expect(row!.notes).not.toContain('bronchitis');
    expect(row!.notes.startsWith('v1:')).toBe(true);
  });

  it('lets the owning patient read their own notes (decrypted)', async () => {
    const res = await request(app)
      .get(`/api/appointments/${appointmentId}/notes`)
      .set(h.auth(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.note.notes).toBe(noteText);
    expect(res.body.note.prescriptions).toEqual(prescription);
  });

  it('blocks another patient from reading the notes', async () => {
    const res = await request(app)
      .get(`/api/appointments/${appointmentId}/notes`)
      .set(h.auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('blocks admin accounts from reading medical notes (least privilege)', async () => {
    const res = await request(app)
      .get(`/api/appointments/${appointmentId}/notes`)
      .set(h.auth(tokenAdmin));
    expect(res.status).toBe(403);
  });

  it("blocks a different doctor from reading or writing the notes", async () => {
    const otherToken = await h.login(app, otherDoctor.email, otherDoctor.password);
    const read = await request(app)
      .get(`/api/appointments/${appointmentId}/notes`)
      .set(h.auth(otherToken));
    expect(read.status).toBe(403);

    const write = await request(app)
      .put(`/api/appointments/${appointmentId}/notes`)
      .set(h.auth(otherToken))
      .send({ notes: 'should not work', prescriptions: [] });
    expect(write.status).toBe(403);
  });

  it("blocks a patient from writing notes on their own appointment", async () => {
    const res = await request(app)
      .put(`/api/appointments/${appointmentId}/notes`)
      .set(h.auth(tokenA))
      .send({ notes: 'self-diagnosis', prescriptions: [] });
    expect(res.status).toBe(403);
  });

  it('writes an audit trail entry when notes are read', async () => {
    const { prisma } = await import('../src/lib/prisma');
    const entries = await prisma.auditLog.findMany({
      where: { action: 'note.read', entityId: undefined, subjectPatientId: patientA.userId },
    });
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe('role-based access to admin endpoints', () => {
  it('lets an admin list clinic-wide appointments', async () => {
    const res = await request(app).get('/api/admin/appointments').set(h.auth(tokenAdmin));
    expect(res.status).toBe(200);
    expect(res.body.items.some((a: any) => a.id === appointmentId)).toBe(true);
  });

  it('blocks patients from admin endpoints', async () => {
    const res = await request(app).get('/api/admin/appointments').set(h.auth(tokenA));
    expect(res.status).toBe(403);
  });

  it('blocks doctors from admin endpoints', async () => {
    const res = await request(app).get('/api/admin/doctors').set(h.auth(tokenDoctor));
    expect(res.status).toBe(403);
  });

  it('requires auth for admin endpoints', async () => {
    const res = await request(app).get('/api/admin/appointments');
    expect(res.status).toBe(401);
  });

  it('exposes an audit log to admins only', async () => {
    const denied = await request(app).get('/api/admin/audit-logs').set(h.auth(tokenA));
    expect(denied.status).toBe(403);
    const allowed = await request(app).get('/api/admin/audit-logs').set(h.auth(tokenAdmin));
    expect(allowed.status).toBe(200);
    expect(allowed.body.items.length).toBeGreaterThan(0);
  });
});

describe('doctor account lifecycle via admin invite', () => {
  it('invites, accepts, and logs in as a new doctor', async () => {
    const inviteRes = await request(app)
      .post('/api/auth/admin/invites')
      .set(h.auth(tokenAdmin))
      .send({ email: 'newdoc@clinic.test', role: 'DOCTOR' });
    expect(inviteRes.status).toBe(201);
    const token = inviteRes.body.invite.inviteUrl.split('token=')[1];

    const acceptRes = await request(app).post('/api/auth/accept-invite').send({
      token,
      name: 'Dr. Newly Joined',
      password: 'BrandNew123!',
    });
    expect(acceptRes.status).toBe(201);
    expect(acceptRes.body.user.role).toBe('DOCTOR');

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newdoc@clinic.test', password: 'BrandNew123!' });
    expect(loginRes.status).toBe(200);

    // The new doctor has a profile and can manage availability
    const newToken = loginRes.body.accessToken;
    const avail = await request(app)
      .put('/api/doctors/me/availability')
      .set(h.auth(newToken))
      .send({
        windows: [
          { dayOfWeek: 1, startTime: '10:00', endTime: '14:00', slotDurationMinutes: 30, bufferMinutes: 0 },
        ],
      });
    expect(avail.status).toBe(200);
    expect(avail.body.doctor.availability).toHaveLength(1);
  });

  it('rejects reuse of an accepted invite', async () => {
    const inviteRes = await request(app)
      .post('/api/auth/admin/invites')
      .set(h.auth(tokenAdmin))
      .send({ email: 'used-once@clinic.test', role: 'DOCTOR' });
    const token = inviteRes.body.invite.inviteUrl.split('token=')[1];
    await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, name: 'Dr. Once', password: 'BrandNew123!' });
    const second = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, name: 'Dr. Twice', password: 'BrandNew123!' });
    expect(second.status).toBe(404);
  });
});

describe('signup consent', () => {
  it('requires explicit data-processing consent', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'No Consent',
      email: 'noconsent@example.com',
      password: 'Password123',
    });
    expect(res.status).toBe(400);
  });

  it('registers a patient who consents', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'New Patient',
      email: 'newpatient@example.com',
      password: 'Password123',
      consent: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PATIENT');
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejects duplicate emails', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Duplicate',
      email: 'newpatient@example.com',
      password: 'Password123',
      consent: true,
    });
    expect(res.status).toBe(409);
  });
});
