import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { ah, requireAuth, requireRole, clientIp } from '../../middleware/auth';
import * as service from './service';
import * as notes from '../notes/service';

const router = Router();

const createSchema = z.object({
  doctorId: z.string().min(1),
  startsAt: z.string().datetime({ message: 'startsAt must be an ISO datetime' }),
  reasonForVisit: z.string().min(3).max(500),
  symptoms: z.string().max(2000).optional(),
});

const cancelSchema = z.object({ reason: z.string().max(500).optional() });

const rescheduleSchema = z.object({
  startsAt: z.string().datetime({ message: 'startsAt must be an ISO datetime' }),
});

const statusSchema = z.object({
  status: z.enum(['CONFIRMED', 'COMPLETED', 'NO_SHOW']),
});

const listQuery = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
});

const prescriptionSchema = z.object({
  medication: z.string().min(1).max(200),
  dosage: z.string().min(1).max(200),
  instructions: z.string().max(1000).optional(),
});

const noteSchema = z.object({
  notes: z.string().min(1).max(20000),
  prescriptions: z.array(prescriptionSchema).max(50).default([]),
});

router.post(
  '/',
  requireAuth,
  requireRole('PATIENT'),
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const appointment = await service.createAppointment(req.user!, req.body, clientIp(req));
    res.status(201).json({ appointment });
  })
);

router.get(
  '/mine',
  requireAuth,
  requireRole('PATIENT', 'DOCTOR'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const scope = (req.query as { scope: 'upcoming' | 'past' | 'all' }).scope;
    res.json({ appointments: await service.listMine(req.user!, scope) });
  })
);

router.get(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    res.json({ appointment: await service.getOne(req.user!, req.params.id) });
  })
);

router.put(
  '/:id/cancel',
  requireAuth,
  validate({ body: cancelSchema }),
  ah(async (req, res) => {
    const appointment = await service.cancel(req.user!, req.params.id, req.body.reason, clientIp(req));
    res.json({ appointment });
  })
);

router.put(
  '/:id/reschedule',
  requireAuth,
  validate({ body: rescheduleSchema }),
  ah(async (req, res) => {
    const appointment = await service.reschedule(req.user!, req.params.id, req.body.startsAt, clientIp(req));
    res.json({ appointment });
  })
);

router.put(
  '/:id/status',
  requireAuth,
  requireRole('DOCTOR', 'ADMIN'),
  validate({ body: statusSchema }),
  ah(async (req, res) => {
    const appointment = await service.setStatus(req.user!, req.params.id, req.body.status, clientIp(req));
    res.json({ appointment });
  })
);

/* ------------------------------------------------------------------ notes */

router.put(
  '/:id/notes',
  requireAuth,
  requireRole('DOCTOR'),
  validate({ body: noteSchema }),
  ah(async (req, res) => {
    const note = await notes.upsertNote(req.user!, req.params.id, req.body, clientIp(req));
    res.json({ note });
  })
);

router.get(
  '/:id/notes',
  requireAuth,
  ah(async (req, res) => {
    const note = await notes.getNote(req.user!, req.params.id, clientIp(req));
    res.json({ note });
  })
);

export default router;
