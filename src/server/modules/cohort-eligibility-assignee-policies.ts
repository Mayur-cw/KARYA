import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import {
  userCreateRequestSchema,
  userSafePatchRequestSchema,
  assignmentBulkCreateSchema,
  assignmentChangeSchema,
  type UserPublic,
  type UserPage,
  type AssignmentPublic,
  type AssignmentPage,
} from '../../shared/contracts.js';
import {
  getDb,
  UserRepository,
  WorkflowRepository,
  AssignmentRepository,
} from '../repository.js';
import { recordAudit, createNotification } from '../events.js';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

// ==========================================
// EP-004: GET /api/users (Admin only)
// ==========================================
export function handleGetUsers(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const db = getDb();
  const userRepo = new UserRepository(db);

  const query = typeof req.query.query === 'string'
    ? req.query.query.toLowerCase().trim()
    : typeof req.query.q === 'string'
      ? req.query.q.toLowerCase().trim()
      : '';
  const roleFilter = typeof req.query.role === 'string' ? req.query.role : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  let users = userRepo.listByDepartment(principal.departmentId, roleFilter);

  if (query) {
    users = users.filter(
      (u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
    );
  }

  const total = users.length;
  const startIndex = (page - 1) * limit;
  const items = users.slice(startIndex, startIndex + limit);

  const responsePayload: UserPage = {
    items,
    total,
    page,
    limit,
    nextCursor: null,
  };

  res.status(200).json(responsePayload);
}

// ==========================================
// EP-005: POST /api/users (Admin only)
// ==========================================
export function handlePostUser(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const parseRes = userCreateRequestSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid user creation payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const { name, email, role, departmentId } = parseRes.data;
  const targetDept = departmentId || principal.departmentId;

  // Cross-department creation forbidden
  if (targetDept !== principal.departmentId) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Cannot create users in a different department',
    });
    return;
  }

  const db = getDb();
  const userRepo = new UserRepository(db);

  // Check unique email
  const existing = userRepo.getByEmail(email);
  if (existing) {
    res.status(409).json({
      code: 'CONFLICT',
      message: `User with email '${email}' already exists`,
    });
    return;
  }

  const newUser: UserPublic = userRepo.create({
    id: crypto.randomUUID(),
    departmentId: targetDept,
    name,
    email,
    role,
    active: true,
    createdAt: new Date().toISOString(),
  });

  recordAudit(db, {
    departmentId: principal.departmentId,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'user_created',
    targetEntity: 'User',
    targetId: newUser.id,
    details: { name: newUser.name, email: newUser.email, role: newUser.role },
  });

  res.status(201).json(newUser);
}

// ==========================================
// EP-006: GET /api/users/:userId
// ==========================================
export function handleGetUserById(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const targetUserId = getParam(req.params.userId);
  const db = getDb();
  const userRepo = new UserRepository(db);

  const user = userRepo.getById(targetUserId);
  if (!user || user.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
    return;
  }

  // Non-admin can only access own profile (protect other students' PII)
  if (principal.role !== 'admin' && principal.id !== targetUserId) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Access denied: cannot view another user profile',
    });
    return;
  }

  res.status(200).json(user);
}

// ==========================================
// EP-007: PATCH /api/users/:userId
// ==========================================
export function handlePatchUserById(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const targetUserId = getParam(req.params.userId);
  const parseRes = userSafePatchRequestSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid profile update payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const db = getDb();
  const userRepo = new UserRepository(db);
  const user = userRepo.getById(targetUserId);

  if (!user || user.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
    return;
  }

  // Non-admin can only edit self, and cannot change active state
  if (principal.role !== 'admin') {
    if (principal.id !== targetUserId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Cannot edit another user profile' });
      return;
    }
    if (parseRes.data.active !== undefined) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Only administrators may alter account active status' });
      return;
    }
  }

  const updated = userRepo.update(targetUserId, parseRes.data);
  if (!updated) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Failed to update user' });
    return;
  }

  recordAudit(db, {
    departmentId: principal.departmentId,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'profile_updated',
    targetEntity: 'User',
    targetId: targetUserId,
    details: parseRes.data,
  });

  res.status(200).json(updated);
}

// ==========================================
// EP-019: GET /api/assignments (Admin, Student)
// ==========================================
export function handleGetAssignments(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const db = getDb();
  const assignRepo = new AssignmentRepository(db);
  const wfRepo = new WorkflowRepository(db);
  const userRepo = new UserRepository(db);

  const workflowIdFilter = typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  let assignments = principal.role === 'admin'
    ? workflowIdFilter
      ? assignRepo.listByWorkflow(workflowIdFilter)
      : listAllDepartmentAssignments(db, principal.departmentId)
    : assignRepo.listByStudent(principal.id);

  if (workflowIdFilter && principal.role !== 'admin') {
    assignments = assignments.filter((a) => a.workflowId === workflowIdFilter);
  }
  if (statusFilter) {
    assignments = assignments.filter((a) => a.status === statusFilter);
  }

  const total = assignments.length;
  const startIndex = (page - 1) * limit;
  const paginated = assignments.slice(startIndex, startIndex + limit);

  // Enrich with workflow and student info
  const items: AssignmentPublic[] = paginated.map((a) => {
    const wf = wfRepo.getLatestVersion(a.workflowId);
    const stu = userRepo.getById(a.studentId);
    return {
      id: a.id,
      workflowId: a.workflowId,
      studentId: a.studentId,
      status: a.status,
      assignedAt: a.assignedAt,
      revokeReason: a.revokeReason,
      studentName: stu?.name,
      studentEmail: stu?.email,
      workflowTitle: wf?.title,
      workflowDeadline: wf?.deadline ?? null,
    };
  });

  const responsePayload: AssignmentPage = {
    items,
    total,
    page,
    limit,
  };

  res.status(200).json(responsePayload);
}

function listAllDepartmentAssignments(db: import('node:sqlite').DatabaseSync, departmentId: string) {
  const stmt = db.prepare(`
    SELECT a.* FROM assignments a
    INNER JOIN workflows w ON a.workflowId = w.id
    WHERE w.departmentId = ?
    ORDER BY a.assignedAt DESC
  `);
  const rows = stmt.all(departmentId) as unknown as Array<{
    id: string;
    workflowId: string;
    studentId: string;
    status: 'invited' | 'started' | 'revoked' | 'completed';
    assignedAt: string;
    revokeReason: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    workflowId: r.workflowId,
    studentId: r.studentId,
    status: r.status,
    assignedAt: r.assignedAt,
    revokeReason: r.revokeReason ?? null,
  }));
}

// ==========================================
// EP-020: POST /api/workflows/:workflowId/assignments (Admin only)
// ==========================================
export function handlePostWorkflowAssignments(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const parseRes = assignmentBulkCreateSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid assignment bulk payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const { studentIds, reason } = parseRes.data;
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);
  const userRepo = new UserRepository(db);
  const assignRepo = new AssignmentRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf || wf.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.status === 'archived') {
    res.status(409).json({ code: 'CONFLICT', message: 'Cannot add recipients to archived workflow' });
    return;
  }

  const stmtAssign = db.prepare(`
    INSERT OR IGNORE INTO assignments (id, workflowId, studentId, status, assignedAt, revokeReason)
    VALUES (?, ?, ?, 'invited', ?, NULL)
  `);

  const now = new Date().toISOString();
  let addedCount = 0;

  for (const studentId of studentIds) {
    const student = userRepo.getById(studentId);
    if (!student || student.departmentId !== principal.departmentId || student.role !== 'student') {
      continue;
    }

    const assignId = crypto.randomUUID();
    const result = stmtAssign.run(assignId, workflowId, studentId, now);
    if (result.changes > 0) {
      addedCount++;
      if (wf.status === 'published') {
        createNotification(db, {
          recipientId: studentId,
          eventType: 'workflow_assigned',
          title: `Process Assignment: ${wf.title}`,
          body: `You have been added to '${wf.title}'. Deadline: ${wf.deadline || 'Pending'}.`,
          targetRef: `/student/workflows/${wf.id}`,
        });
      }
    }
  }

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: wf.id,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'assignments_added',
    targetEntity: 'Workflow',
    targetId: wf.id,
    details: { addedCount, totalRequested: studentIds.length, reason: reason ?? null },
  });

  const updatedAssignments = assignRepo.listByWorkflow(workflowId);
  const items: AssignmentPublic[] = updatedAssignments.map((a) => {
    const stu = userRepo.getById(a.studentId);
    return {
      ...a,
      studentName: stu?.name,
      studentEmail: stu?.email,
      workflowTitle: wf.title,
      workflowDeadline: wf.deadline,
    };
  });

  res.status(201).json({
    items,
    total: items.length,
    page: 1,
    limit: 50,
  });
}

// ==========================================
// EP-021: PATCH /api/assignments/:assignmentId (Admin only)
// ==========================================
export function handlePatchAssignment(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const assignmentId = getParam(req.params.assignmentId);
  const parseRes = assignmentChangeSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid assignment modification payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const { reason } = parseRes.data;
  const db = getDb();
  const assignRepo = new AssignmentRepository(db);
  const userRepo = new UserRepository(db);
  const wfRepo = new WorkflowRepository(db);

  const assign = assignRepo.getById(assignmentId);
  if (!assign) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Assignment not found' });
    return;
  }

  const wf = wfRepo.getLatestVersion(assign.workflowId);
  if (!wf || wf.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Assignment not found' });
    return;
  }

  // VR-010: cannot revoke started or completed
  if (assign.status === 'started' || assign.status === 'completed') {
    res.status(409).json({
      code: 'CONFLICT',
      message: 'Cannot revoke assignment: student has already started or completed their submission',
    });
    return;
  }

  const revoked = assignRepo.revoke(assignmentId, reason);
  if (!revoked) {
    res.status(409).json({ code: 'CONFLICT', message: 'Failed to revoke assignment' });
    return;
  }

  createNotification(db, {
    recipientId: assign.studentId,
    eventType: 'assignment_revoked',
    title: `Assignment Revoked: ${wf.title}`,
    body: `Your assignment to '${wf.title}' was revoked by administration. Reason: "${reason}".`,
    targetRef: null,
  });

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: wf.id,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'assignment_revoked',
    targetEntity: 'Assignment',
    targetId: assignmentId,
    details: { studentId: assign.studentId, reason },
  });

  const updated = assignRepo.getById(assignmentId)!;
  const stu = userRepo.getById(updated.studentId);
  const responsePayload: AssignmentPublic = {
    ...updated,
    studentName: stu?.name,
    studentEmail: stu?.email,
    workflowTitle: wf.title,
    workflowDeadline: wf.deadline,
  };

  res.status(200).json(responsePayload);
}

// ==========================================
// EP-022: DELETE /api/assignments/:assignmentId (Admin only)
// ==========================================
export function handleDeleteAssignment(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const assignmentId = getParam(req.params.assignmentId);
  const db = getDb();
  const assignRepo = new AssignmentRepository(db);
  const wfRepo = new WorkflowRepository(db);

  const assign = assignRepo.getById(assignmentId);
  if (!assign) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Assignment not found' });
    return;
  }

  const wf = wfRepo.getLatestVersion(assign.workflowId);
  if (!wf || wf.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Assignment not found' });
    return;
  }

  if (assign.status === 'started' || assign.status === 'completed') {
    res.status(409).json({
      code: 'CONFLICT',
      message: 'Cannot revoke assignment: student has already started or completed their submission',
    });
    return;
  }

  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
    ? req.body.reason.trim()
    : 'Administrative revocation';

  assignRepo.revoke(assignmentId, reason);

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: wf.id,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'assignment_revoked',
    targetEntity: 'Assignment',
    targetId: assignmentId,
    details: { studentId: assign.studentId, reason },
  });

  res.status(200).json({ id: assignmentId, deleted: true, reason });
}
