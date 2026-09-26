import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { ah, requireAuth, requireRole, clientIp } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { isProd } from '../../config/env';
import { audit } from '../../lib/audit';
import * as service from './service';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  phone: z.string().max(30).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(2).max(120),
  password: z.string().min(8).max(200),
  phone: z.string().max(30).optional(),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['DOCTOR', 'ADMIN']),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(service.REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post(
  '/signup',
  authLimiter,
  validate({ body: signupSchema }),
  ah(async (req, res) => {
    const result = await service.signup(req.body);
    setRefreshCookie(res, result.refreshToken);
    audit({
      actorUserId: result.user.id,
      action: 'auth.signup',
      entityType: 'User',
      entityId: result.user.id,
      ip: clientIp(req),
    });
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  })
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  ah(async (req, res) => {
    const result = await service.login(req.body);
    setRefreshCookie(res, result.refreshToken);
    audit({
      actorUserId: result.user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: result.user.id,
      ip: clientIp(req),
    });
    res.json({ accessToken: result.accessToken, user: result.user });
  })
);

router.post(
  '/refresh',
  authLimiter,
  ah(async (req, res) => {
    const result = await service.refresh(req.cookies?.[service.REFRESH_COOKIE]);
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, user: result.user });
  })
);

router.post(
  '/logout',
  ah(async (req, res) => {
    await service.logout(req.cookies?.[service.REFRESH_COOKIE]);
    res.clearCookie(service.REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: await service.me(req.user!.id) });
  })
);

router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  ah(async (req, res) => {
    await service.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    audit({
      actorUserId: req.user!.id,
      action: 'auth.change_password',
      entityType: 'User',
      entityId: req.user!.id,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  })
);

router.post(
  '/accept-invite',
  authLimiter,
  validate({ body: acceptInviteSchema }),
  ah(async (req, res) => {
    const result = await service.acceptInvite(req.body);
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  })
);

// Admin: invite a doctor or another admin
router.post(
  '/admin/invites',
  requireAuth,
  requireRole('ADMIN'),
  authLimiter,
  validate({ body: inviteSchema }),
  ah(async (req, res) => {
    const invite = await service.createInvite(req.body, req.user!);
    audit({
      actorUserId: req.user!.id,
      action: 'admin.invite_created',
      entityType: 'Invite',
      entityId: invite.id,
      ip: clientIp(req),
      metadata: { email: invite.email, role: invite.role },
    });
    res.status(201).json({ invite });
  })
);

export default router;
