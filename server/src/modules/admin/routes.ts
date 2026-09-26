import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { ah, requireAuth, requireRole, clientIp } from '../../middleware/auth';
import * as service from './service';

const router = Router();

// Every route in this router is admin-only
router.use(requireAuth, requireRole('ADMIN'));

const listQuery = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

router.get(
  '/appointments',
  validate({ query: listQuery }),
  ah(async (req, res) => {
    res.json(await service.listAppointments(req.query as any));
  })
);

router.get(
  '/doctors',
  ah(async (_req, res) => {
    res.json({ doctors: await service.listDoctors() });
  })
);

const doctorUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
  isActive: z.boolean().optional(),
  specialty: z.string().min(2).max(100).optional(),
  bio: z.string().max(2000).optional(),
  consultationFee: z.number().int().min(0).max(10_000_000).optional(),
});

router.put(
  '/doctors/:id',
  validate({ body: doctorUpdateSchema }),
  ah(async (req, res) => {
    res.json({ doctor: await service.updateDoctor(req.user!, req.params.id, req.body, clientIp(req)) });
  })
);

const auditQuery = z.object({
  subjectPatientId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

router.get(
  '/audit-logs',
  validate({ query: auditQuery }),
  ah(async (req, res) => {
    res.json(await service.listAuditLogs(req.query as any));
  })
);

const clinicSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  timezone: z.string().max(60).optional(),
});

router.get(
  '/clinic',
  ah(async (_req, res) => {
    res.json({ clinic: await service.getClinic() });
  })
);

router.put(
  '/clinic',
  validate({ body: clinicSchema }),
  ah(async (req, res) => {
    res.json({ clinic: await service.updateClinic(req.user!, req.body, clientIp(req)) });
  })
);

router.get(
  '/stats',
  ah(async (_req, res) => {
    res.json({ stats: await service.stats() });
  })
);

export default router;
