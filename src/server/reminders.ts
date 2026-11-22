import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { UserPublic } from '../shared/contracts.js';

/** Activity-driven in-app reminders; deterministic IDs make concurrent reads idempotent. */
export function refreshDueReminders(db: DatabaseSync, user: UserPublic, now = new Date()): void {
  if (user.role !== 'student') return;
  const until = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`SELECT w.id, w.title, w.deadline FROM workflows w
    JOIN (SELECT id, MAX(version) version FROM workflows GROUP BY id) latest ON latest.id = w.id AND latest.version = w.version
    JOIN assignments a ON a.workflowId = w.id AND a.studentId = ?
    LEFT JOIN submissions s ON s.workflowId = w.id AND s.studentId = a.studentId
    WHERE w.departmentId = ? AND w.status = 'published' AND a.status IN ('invited','started')
    AND w.deadline > ? AND w.deadline <= ? AND (s.id IS NULL OR s.status = 'draft')`).all(user.id, user.departmentId, now.toISOString(), until) as unknown as { id: string; title: string; deadline: string }[];
  const insert = db.prepare("INSERT OR IGNORE INTO notifications (id, recipientId, eventType, title, body, targetRef, readAt, dismissedAt, createdAt) VALUES (?, ?, 'deadline_reminder', ?, ?, ?, NULL, NULL, ?)");
  for (const workflow of rows) {
    const hash = crypto.createHash('sha256').update(`${user.id}:${workflow.id}:${workflow.deadline}:${now.toISOString().slice(0, 10)}`).digest('hex');
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    insert.run(id, user.id, `Due soon: ${workflow.title}`, `Your initial application is due ${workflow.deadline}. Open the process to finish and submit your draft.`, `/student/workflows/${workflow.id}`, now.toISOString());
  }
}
