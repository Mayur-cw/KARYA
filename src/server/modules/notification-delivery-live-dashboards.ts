import type { Request, Response } from 'express';
import {
  getDb,
  WorkflowRepository,
} from '../repository.js';
import {
  notificationMarkSchema,
  type NotificationPublic,
  type NotificationPage,
  type WorkflowAnalytics,
  type StageBreakdown,
  type DeletionReceipt,
} from '../../shared/contracts.js';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

interface NotificationRow {
  id: string;
  recipientId: string;
  eventType: string;
  title: string;
  body: string;
  targetRef: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  name: string;
}

function mapRowToPublic(row: NotificationRow): NotificationPublic {
  return {
    id: row.id,
    recipientId: row.recipientId,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    targetRef: row.targetRef ?? null,
    readAt: row.readAt ?? null,
    dismissedAt: row.dismissedAt ?? null,
    createdAt: row.createdAt,
  };
}

// ==========================================
// EP-030: GET /api/notifications (Admin, Student, Reviewer)
// ==========================================
export function handleGetNotifications(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const db = getDb();

  const isUnreadFilter =
    req.query.unread === 'true' || req.query.unread === '1';
  const page = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(typeof req.query.limit === 'string' ? req.query.limit : '20', 10) || 20));

  // Compute unreadCount for recipient
  const unreadStmt = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE recipientId = ? AND readAt IS NULL AND dismissedAt IS NULL
  `);
  const unreadRow = unreadStmt.get(principal.id) as { count: number } | undefined;
  const unreadCount = unreadRow ? unreadRow.count : 0;

  // Query notifications
  let query = 'SELECT * FROM notifications WHERE recipientId = ? AND dismissedAt IS NULL';
  const params: Array<string | number> = [principal.id];

  if (isUnreadFilter) {
    query += ' AND readAt IS NULL';
  }

  query += ' ORDER BY createdAt DESC, id ASC';

  const stmt = db.prepare(query);
  const allRows = stmt.all(...params) as unknown as NotificationRow[];

  const total = allRows.length;
  const startIndex = (page - 1) * limit;
  const pagedRows = allRows.slice(startIndex, startIndex + limit);

  const responsePayload: NotificationPage = {
    items: pagedRows.map(mapRowToPublic),
    unreadCount,
    total,
    page,
    limit,
  };

  res.json(responsePayload);
}

// ==========================================
// EP-031: PATCH /api/notifications/:notificationId (Admin, Student, Reviewer)
// ==========================================
export function handlePatchNotification(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const notificationId = getParam(req.params.notificationId);
  const db = getDb();

  const stmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const notif = stmt.get(notificationId) as unknown as NotificationRow | undefined;
  if (!notif) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Notification not found' });
    return;
  }

  if (notif.recipientId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this notification' });
    return;
  }

  const parseResult = notificationMarkSchema.safeParse(req.body);
  const action = parseResult.success ? parseResult.data.action : 'read';

  const now = new Date().toISOString();
  if (action === 'read') {
    if (!notif.readAt) {
      db.prepare('UPDATE notifications SET readAt = ? WHERE id = ?').run(now, notificationId);
      notif.readAt = now;
    }
  } else if (action === 'dismiss') {
    if (!notif.dismissedAt) {
      db.prepare('UPDATE notifications SET dismissedAt = ? WHERE id = ?').run(now, notificationId);
      notif.dismissedAt = now;
    }
  }

  res.json(mapRowToPublic(notif));
}

// ==========================================
// EP-032: DELETE /api/notifications/:notificationId (Admin, Student, Reviewer)
// ==========================================
export function handleDeleteNotification(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const notificationId = getParam(req.params.notificationId);
  const db = getDb();

  const stmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const notif = stmt.get(notificationId) as unknown as NotificationRow | undefined;
  if (!notif) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Notification not found' });
    return;
  }

  if (notif.recipientId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this notification' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE notifications SET dismissedAt = ? WHERE id = ?').run(now, notificationId);

  const receipt: DeletionReceipt = {
    id: notificationId,
    deleted: true,
  };

  res.json(receipt);
}

// ==========================================
// EP-034: GET /api/workflows/:workflowId/analytics (Admin only)
// ==========================================
export function handleGetWorkflowAnalytics(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.departmentId !== principal.departmentId) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'Workflow belongs to another department' });
    return;
  }

  // Derive all metrics directly from live SQLite database
  const getCount = (sql: string, ...params: Array<string | number>): number => {
    const row = db.prepare(sql).get(...params) as { count: number } | undefined;
    return row ? row.count : 0;
  };

  const totalAssigned = getCount(
    "SELECT COUNT(*) as count FROM assignments WHERE workflowId = ? AND status != 'revoked'",
    workflowId
  );
  const invited = getCount(
    "SELECT COUNT(*) as count FROM assignments WHERE workflowId = ? AND status = 'invited'",
    workflowId
  );
  const started = getCount(
    "SELECT COUNT(*) as count FROM assignments WHERE workflowId = ? AND status = 'started'",
    workflowId
  );
  const draft = getCount(
    "SELECT COUNT(*) as count FROM submissions WHERE workflowId = ? AND status = 'draft'",
    workflowId
  );
  const submitted = getCount(
    "SELECT COUNT(*) as count FROM submissions WHERE workflowId = ? AND status = 'submitted'",
    workflowId
  );
  const inReview = getCount(
    "SELECT COUNT(*) as count FROM submissions WHERE workflowId = ? AND status = 'in_review'",
    workflowId
  );
  const needsChanges = getCount(
    "SELECT COUNT(*) as count FROM submissions WHERE workflowId = ? AND status = 'needs_changes'",
    workflowId
  );
  const approved = getCount(
    "SELECT COUNT(*) as count FROM submissions WHERE workflowId = ? AND status = 'approved'",
    workflowId
  );
  const rejected = getCount(
    "SELECT COUNT(*) as count FROM submissions WHERE workflowId = ? AND status = 'rejected'",
    workflowId
  );

  // Stage breakdown
  const userStmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
  const stageBreakdown: StageBreakdown[] = (wf.stages || []).map((stage) => {
    let reviewerName = 'Unassigned';
    if (stage.reviewerId) {
      const u = userStmt.get(stage.reviewerId) as unknown as UserRow | undefined;
      if (u) reviewerName = u.name;
    }

    const pendingCount = getCount(
      "SELECT COUNT(*) as count FROM submissions WHERE workflowId = ? AND status IN ('submitted', 'in_review') AND stageIndex = ?",
      workflowId,
      stage.stageIndex
    );

    return {
      stageIndex: stage.stageIndex,
      reviewerId: stage.reviewerId || '',
      reviewerName,
      pendingCount,
    };
  });

  const analytics: WorkflowAnalytics = {
    workflowId,
    totalAssigned,
    invited,
    started,
    draft,
    submitted,
    inReview,
    needsChanges,
    approved,
    rejected,
    stageBreakdown,
  };

  res.json(analytics);
}
