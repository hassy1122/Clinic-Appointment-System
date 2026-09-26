import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { randomToken, sha256 } from '../../lib/crypto';
import { env } from '../../config/env';
import { ApiError, badRequest, unauthorized, notFound, conflict } from '../../lib/errors';
import { signAccessToken, type AuthUser } from '../../middleware/auth';
import { enqueueSimple } from '../../lib/notifications';

const BCRYPT_ROUNDS = 12;
export const REFRESH_COOKIE = 'cas_refresh';

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, role: user.role, email: user.email, name: user.name };
}

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

async function issueSession(user: User) {
  const raw = randomToken(48);
  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(raw),
      userId: user.id,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000),
    },
  });
  return {
    accessToken: signAccessToken(toAuthUser(user)),
    refreshToken: raw,
    user: publicUser(user),
  };
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  consent: boolean;
}) {
  if (!input.consent) {
    throw badRequest('You must consent to the storage and processing of your data to sign up.');
  }
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      phone: input.phone?.trim() || null,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      role: 'PATIENT',
      consentGivenAt: new Date(),
    },
  });
  return issueSession(user);
}

export async function login(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Same error for unknown email and wrong password (no account enumeration)
  const genericError = unauthorized('Incorrect email or password');
  if (!user || !user.isActive) throw genericError;

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw genericError;

  return issueSession(user);
}

export async function refresh(rawToken: string | undefined) {
  if (!rawToken) throw unauthorized('No refresh token provided');
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Refresh token is invalid or expired');
  }
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) throw unauthorized('Account is no longer active');

  // Rotation: revoke the used token, issue a fresh pair
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  return issueSession(user);
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  await prisma.refreshToken
    .updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw unauthorized('Account is no longer active');
  return publicUser(user);
}

export async function createInvite(input: { email: string; role: 'DOCTOR' | 'ADMIN' }, invitedBy: AuthUser) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('EMAIL_TAKEN', 'A user with this email already exists.');

  const token = randomToken(32);
  const invite = await prisma.invite.create({
    data: {
      email,
      role: input.role,
      tokenHash: sha256(token),
      invitedById: invitedBy.id,
      expiresAt: new Date(Date.now() + 72 * 3_600_000),
    },
  });

  const link = `${env.CLIENT_ORIGIN}/accept-invite?token=${token}`;
  await enqueueSimple({
    recipient: email,
    template: 'INVITE',
    subject: `You're invited to join ${env.CLINIC_NAME}`,
    text: `Hello,\n\n${invitedBy.name} invited you to join ${env.CLINIC_NAME} as ${input.role.toLowerCase()}.\n\nAccept here: ${link}\n\nThis link expires in 72 hours.`,
    payload: { inviteId: invite.id, role: input.role, link },
  });

  return { id: invite.id, email, role: invite.role, expiresAt: invite.expiresAt, inviteUrl: link };
}

export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
  phone?: string;
}) {
  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw notFound('This invitation is invalid or has expired.');
  }
  const email = invite.email;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        phone: input.phone?.trim() || null,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        role: invite.role,
        mustChangePassword: false,
        consentGivenAt: new Date(),
        ...(invite.role === 'DOCTOR'
          ? { doctorProfile: { create: { specialty: 'General Physician' } } }
          : {}),
      },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return created;
  });

  return issueSession(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(400, 'BAD_REQUEST', 'Current password is incorrect');
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), mustChangePassword: false },
  });
}
