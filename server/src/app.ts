import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import authRoutes from './modules/auth/routes';
import doctorRoutes from './modules/doctors/routes';
import appointmentRoutes from './modules/appointments/routes';
import adminRoutes from './modules/admin/routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';

export function createApp() {
  const app = express();

  // Render/Vercel terminate TLS upstream — required for correct client IPs & HTTPS cookies
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'clinic-appointment-api', time: new Date().toISOString() });
  });

  // Public clinic info (name, hours contact, timezone for client-side display)
  app.get('/api/clinic', async (_req, res) => {
    const row = await prisma.clinicSetting.findUnique({ where: { id: 'singleton' } });
    res.json({
      clinic: {
        name: row?.name ?? env.CLINIC_NAME,
        address: row?.address ?? env.CLINIC_ADDRESS,
        phone: row?.phone ?? env.CLINIC_PHONE,
        email: row?.email ?? null,
        timezone: row?.timezone ?? env.CLINIC_TZ,
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
