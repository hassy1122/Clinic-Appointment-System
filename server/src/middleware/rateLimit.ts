import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

/** Login/signup abuse guard — strict on credential endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 100_000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' },
});

/** Global ceiling for the rest of the API. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 1_000_000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
});
