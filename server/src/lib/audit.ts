import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  subjectPatientId?: string | null;
  ip?: string | null;
  metadata?: unknown;
}

/**
 * Append-only audit trail. Fire-and-forget: an audit failure must never break
 * the user-facing request, but it is logged loudly.
 */
export function audit(entry: AuditEntry): void {
  void prisma.auditLog
    .create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        subjectPatientId: entry.subjectPatientId ?? null,
        ip: entry.ip ?? null,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      },
    })
    .catch((err) => console.error('[audit] failed to write audit log:', err));
}
