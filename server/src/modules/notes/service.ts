import { prisma } from '../../lib/prisma';
import { encrypt, decrypt } from '../../lib/crypto';
import { forbidden, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { attachDoctorProfile } from '../appointments/service';

export interface PrescriptionItem {
  medication: string;
  dosage: string;
  instructions?: string;
}

async function loadAuthorizedAppointment(user: AuthUser, appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, patientId: true, doctorId: true },
  });
  if (!appt) throw notFound('Appointment not found');

  await attachDoctorProfile(user);

  if (user.role === 'PATIENT') {
    if (appt.patientId !== user.id) throw forbidden('You do not have access to this appointment');
    return { appt, canWrite: false };
  }
  if (user.role === 'DOCTOR') {
    if (appt.doctorId !== user.doctorProfileId) {
      throw forbidden('You do not have access to this appointment');
    }
    return { appt, canWrite: true };
  }
  // Admins do not get incidental access to medical notes (least privilege)
  throw forbidden('Admin accounts do not have access to consultation notes');
}

function publicNote(row: {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  notes: string;
  prescriptions: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    doctorId: row.doctorId,
    patientId: row.patientId,
    notes: decrypt(row.notes),
    prescriptions: JSON.parse(decrypt(row.prescriptions) || '[]') as PrescriptionItem[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Doctor-only write. Encrypted at rest; every write is audited. */
export async function upsertNote(
  user: AuthUser,
  appointmentId: string,
  input: { notes: string; prescriptions: PrescriptionItem[] },
  ip: string | null
) {
  const { appt, canWrite } = await loadAuthorizedAppointment(user, appointmentId);
  if (!canWrite) throw forbidden('Only the treating doctor can write consultation notes');

  const data = {
    notes: encrypt(input.notes),
    prescriptions: encrypt(JSON.stringify(input.prescriptions)),
    doctorId: appt.doctorId,
    patientId: appt.patientId,
  };

  const existing = await prisma.consultationNote.findUnique({ where: { appointmentId } });
  const row = existing
    ? await prisma.consultationNote.update({ where: { appointmentId }, data })
    : await prisma.consultationNote.create({ data: { appointmentId, ...data } });

  audit({
    actorUserId: user.id,
    action: existing ? 'note.update' : 'note.create',
    entityType: 'ConsultationNote',
    entityId: row.id,
    subjectPatientId: appt.patientId,
    ip,
    metadata: { appointmentId },
  });

  return publicNote(row);
}

/** Readable only by the treating doctor and the owning patient. Always audited. */
export async function getNote(user: AuthUser, appointmentId: string, ip: string | null) {
  const { appt } = await loadAuthorizedAppointment(user, appointmentId);
  const row = await prisma.consultationNote.findUnique({ where: { appointmentId } });
  if (!row) throw notFound('No consultation notes for this appointment');

  audit({
    actorUserId: user.id,
    action: 'note.read',
    entityType: 'ConsultationNote',
    entityId: row.id,
    subjectPatientId: appt.patientId,
    ip,
  });

  return publicNote(row);
}
