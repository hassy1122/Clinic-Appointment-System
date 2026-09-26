import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { ApiError, unauthorized, forbidden } from '../lib/errors';
import { env } from '../config/env';

export interface AuthUser {
  id: string;
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface AccessPayload extends jwt.JwtPayload {
  sub: string;
  role: AuthUser['role'];
  email: string;
  name: string;
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ role: user.role, email: user.email, name: user.name }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthUser {
  let payload: AccessPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
  if (!payload.sub || !payload.role) throw unauthorized('Invalid access token payload');
  return { id: payload.sub, role: payload.role, email: payload.email, name: payload.name };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden('Your account does not have access to this endpoint'));
      return;
    }
    next();
  };
}

/** Wrap async route handlers so thrown/rejected errors reach the error middleware. */
export function ah<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = handler(req as unknown as T, res, next);
      if (result instanceof Promise) result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}

export { ApiError };
