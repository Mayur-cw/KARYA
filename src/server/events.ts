import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AuditLog, Notification } from '../shared/contracts.js';

export interface AuditEventParams {
  departmentId: string;
  workflowId?: string | null;
  actorId: string;
  actorRole: string;
  event: string;
  targetEntity: string;
  targetId: string;
  details?: Record<string, unknown>;
}

export interface NotificationParams {
  recipientId: string;
  eventType: string;
  title: string;
  body: string;
  targetRef?: string | null;
}

/**
 * Append an immutable audit event to SQLite within an ongoing transaction.
 */
export function recordAudit(db: DatabaseSync, params: AuditEventParams): AuditLog {
  const log: AuditLog = {
    id: crypto.randomUUID(),
    departmentId: params.departmentId,
    workflowId: params.workflowId ?? null,
    actorId: params.actorId,
    actorRole: params.actorRole,
    event: params.event,
    targetEntity: params.targetEntity,
    targetId: params.targetId,
    details: params.details ?? {},
    timestamp: new Date().toISOString(),
  };

  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, departmentId, workflowId, actorId, actorRole, event, targetEntity, targetId, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    log.id,
    log.departmentId,
    log.workflowId ?? null,
    log.actorId,
    log.actorRole,
    log.event,
    log.targetEntity,
    log.targetId,
    JSON.stringify(log.details),
    log.timestamp
  );

  return log;
}

/**
 * Create a persistent in-app notification within an ongoing transaction.
 */
export function createNotification(db: DatabaseSync, params: NotificationParams): Notification {
  const notif: Notification = {
    id: crypto.randomUUID(),
    recipientId: params.recipientId,
    eventType: params.eventType,
    title: params.title,
    body: params.body,
    targetRef: params.targetRef ?? null,
    readAt: null,
    dismissedAt: null,
    createdAt: new Date().toISOString(),
  };

  const stmt = db.prepare(`
    INSERT INTO notifications (id, recipientId, eventType, title, body, targetRef, readAt, dismissedAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    notif.id,
    notif.recipientId,
    notif.eventType,
    notif.title,
    notif.body,
    notif.targetRef ?? null,
    notif.readAt ?? null,
    notif.dismissedAt ?? null,
    notif.createdAt
  );

  return notif;
}
