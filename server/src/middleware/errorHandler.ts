import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { isTest } from '../config/env';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // Unique violation — in this app that is the double-booking race guard
      res.status(409).json({
        error: 'SLOT_TAKEN',
        message: 'This slot was just taken by another booking. Please pick another time.',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Resource not found' });
      return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid data passed to the database' });
    return;
  }

  console.error('[unhandled error]', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side. Please try again.',
    ...(isTest && err instanceof Error ? { details: err.message } : {}),
  });
}
