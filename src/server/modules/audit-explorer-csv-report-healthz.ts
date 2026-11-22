import type { Request, Response } from 'express';
import {
  getDb,
  WorkflowRepository,
  SubmissionRepository,
} from '../repository.js';
import {
  type AuditLog,
  type AuditPage,
  sanitizeCsvField,
} from '../../shared/contracts.js';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

interface AuditLogRow {
  id: string;
  departmentId: string;
  workflowId: string | null;
  actorId: string;
  actorRole: string;
  event: string;
  targetEntity: string;
  targetId: string;
  details: string | null;
  timestamp: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
}

function mapRowToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    departmentId: row.departmentId,
    workflowId: row.workflowId ?? null,
    actorId: row.actorId,
    actorRole: row.actorRole,
    event: row.event,
    targetEntity: row.targetEntity,
    targetId: row.targetId,
    details: row.details ? JSON.parse(row.details) : undefined,
    timestamp: row.timestamp,
  };
}

// ==========================================
// EP-033: GET /api/audit (Admin only)
// ==========================================
export function handleGetAuditLogs(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const db = getDb();

  const workflowIdQuery = typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
  const actorIdQuery = typeof req.query.actorId === 'string' ? req.query.actorId : undefined;
  const eventQuery = typeof req.query.event === 'string' ? req.query.event : undefined;
  const page = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(typeof req.query.limit === 'string' ? req.query.limit : '20', 10) || 20));

  let query = 'SELECT * FROM audit_logs WHERE departmentId = ?';
  const params: Array<string | number> = [principal.departmentId];

  if (workflowIdQuery) {
    query += ' AND workflowId = ?';
    params.push(workflowIdQuery);
  }
  if (actorIdQuery) {
    query += ' AND actorId = ?';
    params.push(actorIdQuery);
  }
  if (eventQuery) {
    query += ' AND event = ?';
    params.push(eventQuery);
  }

  query += ' ORDER BY timestamp DESC, id DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as unknown as AuditLogRow[];

  const total = rows.length;
  const startIndex = (page - 1) * limit;
  const pagedRows = rows.slice(startIndex, startIndex + limit);

  const responsePayload: AuditPage = {
    items: pagedRows.map(mapRowToAuditLog),
    total,
    page,
    limit,
  };

  res.json(responsePayload);
}

// ==========================================
// EP-035: GET /api/workflows/:workflowId/report.csv (Admin only)
// ==========================================
export function handleGetWorkflowReportCsv(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);
  const subRepo = new SubmissionRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.departmentId !== principal.departmentId) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'Workflow belongs to another department' });
    return;
  }

  const fromQuery = typeof req.query.from === 'string' ? req.query.from : undefined;
  const toQuery = typeof req.query.to === 'string' ? req.query.to : undefined;

  let submissions = subRepo.listByWorkflow(workflowId);

  if (fromQuery) {
    const fromTime = new Date(fromQuery).getTime();
    if (!isNaN(fromTime)) {
      submissions = submissions.filter((s) => new Date(s.createdAt).getTime() >= fromTime);
    }
  }
  if (toQuery) {
    const toTime = new Date(toQuery).getTime();
    if (!isNaN(toTime)) {
      submissions = submissions.filter((s) => new Date(s.createdAt).getTime() <= toTime);
    }
  }

  // Pre-fetch all user names/emails
  const userStmt = db.prepare('SELECT id, name, email FROM users');
  const userRows = userStmt.all() as unknown as UserRow[];
  const userMap = new Map<string, { name: string; email: string }>();
  for (const u of userRows) {
    userMap.set(u.id, { name: u.name, email: u.email });
  }

  // Build CSV headers: standard headers + dynamic workflow fields
  const dynamicFields = wf.fields || [];
  const headerCols = [
    'Submission ID',
    'Student Name',
    'Student Email',
    'Status',
    'Stage Index',
    'Revision',
    'Created At',
    'Updated At',
    ...dynamicFields.map((f) => f.label || f.key),
  ];

  const csvRows: string[] = [];
  csvRows.push(headerCols.map(sanitizeCsvField).join(','));

  for (const sub of submissions) {
    const student = userMap.get(sub.studentId) || { name: 'Unknown', email: 'unknown' };
    const answers = sub.answers || {};

    const rowCols = [
      sub.id,
      student.name,
      student.email,
      sub.status,
      sub.stageIndex,
      sub.revision,
      sub.createdAt,
      sub.updatedAt,
      ...dynamicFields.map((f) => {
        const val = answers[f.key];
        if (val === undefined || val === null) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      }),
    ];

    csvRows.push(rowCols.map(sanitizeCsvField).join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const safeFilename = wf.title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'workflow';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_report.csv"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.status(200).send(csvContent);
}

// ==========================================
// EP-040: GET /api/healthz (Public)
// ==========================================
export function handleGetHealthz(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
  });
}
