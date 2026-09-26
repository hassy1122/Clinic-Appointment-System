import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { ah, requireAuth, requireRole, clientIp } from '../../middleware/auth';
import { getAvailableSlots, attachDoctorProfile, doctorProfileForUser } from '../appointments/service';
import { prisma } from '../../lib/prisma';
import * as service from './service';

const router = Router();

const listQuery = z.object({
  q: z.string().max(100).optional(),
  specialty: z.string().max(100).optional(),
});

const slotsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

const profileSchema = z.object({
  specialty: z.string().min(2).max(100).optional(),
  bio: z.string().max(2000).optional(),
  consultationFee: z.number().int().min(0).max(10_000_000).optional(),
  photoUrl: z.string().url().max(500).optional(),
});

const windowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  slotDurationMinutes: z.number().int(),
  bufferMinutes: z.number().int(),
});

const availabilitySchema = z.object({ windows: z.array(windowSchema) });

const timeOffSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().max(300).optional(),
});

/* ------------------------------------------------------------ public reads */

router.get(
  '/',
  validate({ query: listQuery }),
  ah(async (req, res) => {
    res.json({ doctors: await service.listDoctors(req.query as { q?: string; specialty?: string }) });
  })
);

router.get(
  '/specialties',
  ah(async (_req, res) => {
    res.json({ specialties: await service.listSpecialties() });
  })
);

// Real, computed availability — only genuinely open slots are ever returned
router.get(
  '/:id/slots',
  validate({ query: slotsQuery }),
  ah(async (req, res) => {
    const slots = await getAvailableSlots(req.params.id, (req.query as { date: string }).date);
    res.json({ doctorId: req.params.id, date: (req.query as { date: string }).date, slots });
  })
);

router.get(
  '/:id',
  ah(async (req, res) => {
    res.json({ doctor: await service.getDoctor(req.params.id) });
  })
);

/* --------------------------------------------------------------- doctor me */

router.put(
  '/me/profile',
  requireAuth,
  requireRole('DOCTOR', 'ADMIN'),
  validate({ body: profileSchema }),
  ah(async (req, res) => {
    const user = await attachDoctorProfile(req.user!);
    res.json({ doctor: await service.updateMyProfile(user, req.body) });
  })
);

router.get(
  '/me/availability',
  requireAuth,
  requireRole('DOCTOR'),
  ah(async (req, res) => {
    const user = await attachDoctorProfile(req.user!);
    const profile = await doctorProfileForUser(prisma, user.id);
    const [availability, timeOff] = await Promise.all([
      prisma.availability.findMany({
        where: { doctorId: profile.id },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      service.listTimeOff(profile.id),
    ]);
    res.json({ availability, timeOff });
  })
);

router.put(
  '/me/availability',
  requireAuth,
  requireRole('DOCTOR'),
  validate({ body: availabilitySchema }),
  ah(async (req, res) => {
    const user = await attachDoctorProfile(req.user!);
    res.json({
      doctor: await service.replaceAvailability(user, req.body.windows, undefined, clientIp(req)),
    });
  })
);

router.post(
  '/me/time-off',
  requireAuth,
  requireRole('DOCTOR'),
  validate({ body: timeOffSchema }),
  ah(async (req, res) => {
    const user = await attachDoctorProfile(req.user!);
    res.status(201).json({ timeOff: await service.addTimeOff(user, req.body, undefined, clientIp(req)) });
  })
);

router.delete(
  '/me/time-off/:timeOffId',
  requireAuth,
  requireRole('DOCTOR'),
  ah(async (req, res) => {
    const user = await attachDoctorProfile(req.user!);
    await service.removeTimeOff(user, req.params.timeOffId, clientIp(req));
    res.json({ ok: true });
  })
);

/* ---------------------------------------------------------------- admin */

router.put(
  '/:id/availability',
  requireAuth,
  requireRole('ADMIN'),
  validate({ body: availabilitySchema }),
  ah(async (req, res) => {
    res.json({
      doctor: await service.replaceAvailability(req.user!, req.body.windows, req.params.id, clientIp(req)),
    });
  })
);

router.get(
  '/:id/time-off',
  requireAuth,
  requireRole('ADMIN', 'DOCTOR'),
  ah(async (req, res) => {
    res.json({ timeOff: await service.listTimeOff(req.params.id) });
  })
);

export default router;
