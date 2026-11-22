import { submissionPage } from '../queries.js';
import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  getDb,
  WorkflowRepository,
  AssignmentRepository,
  SubmissionRepository,
} from '../repository.js';
import {
  newSubmissionSchema,
  submissionFieldPatchSchema,
  submissionSubmitCommandSchema,
  type Submission,
  type Workflow,
  type SubmissionPublic,
  type AttachmentPublic,
  type DeletionReceipt,
} from '../../shared/contracts.js';
import { recordAudit } from '../events.js';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string;
}

interface AttachmentRow {
  id: string;
  submissionId: string;
  uploadedBy: string;
  displayName: string;
  mime: string;
  bytes: number;
  sha256: string;
  privateStorageKey: string;
  status: 'draft' | 'locked' | 'removed';
  createdAt: string;
}

export function enrichSubmission(
  db: DatabaseSync,
  sub: Submission,
  workflow?: Workflow | null
): SubmissionPublic {
  let wf = workflow;
  if (!wf) {
    const wfRepo = new WorkflowRepository(db);
    wf = wfRepo.getLatestVersion(sub.workflowId);
  }

  // Student info
  const userStmt = db.prepare('SELECT id, email, name, role, departmentId FROM users WHERE id = ?');
  const student = userStmt.get(sub.studentId) as unknown as UserRow | undefined;

  // Reviewer info
  let currentReviewerId: string | null = null;
  let currentReviewerName: string | null = null;
  if (wf && wf.stages && wf.stages[sub.stageIndex]) {
    currentReviewerId = wf.stages[sub.stageIndex]?.reviewerId ?? null;
    if (currentReviewerId) {
      const rev = userStmt.get(currentReviewerId) as unknown as UserRow | undefined;
      currentReviewerName = rev ? rev.name : null;
    }
  }

  // Attachments
  const attStmt = db.prepare(
    "SELECT * FROM attachments WHERE submissionId = ? AND status != 'removed' ORDER BY createdAt ASC"
  );
  const attRows = attStmt.all(sub.id) as unknown as AttachmentRow[];
  const attachments: AttachmentPublic[] = attRows.map((a) => ({
    id: a.id,
    submissionId: a.submissionId,
    displayName: a.displayName,
    mime: a.mime,
    bytes: a.bytes,
    status: a.status,
    createdAt: a.createdAt,
  }));

  return {
    id: sub.id,
    workflowId: sub.workflowId,
    studentId: sub.studentId,
    assignmentId: sub.assignmentId,
    answers: sub.answers,
    status: sub.status,
    stageIndex: sub.stageIndex,
    revision: sub.revision,
    version: sub.version,
    history: sub.history,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    studentName: student?.name,
    studentEmail: student?.email,
    workflowTitle: wf?.title,
    workflowDeadline: wf?.deadline ?? null,
    currentReviewerId,
    currentReviewerName,
    attachments,
  };
}

// ==========================================
// EP-023: POST /api/workflows/:workflowId/submissions (Student only)
// ==========================================
export function handlePostWorkflowSubmissions(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);
  const assignRepo = new AssignmentRepository(db);
  const subRepo = new SubmissionRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.status !== 'published') {
    res.status(400).json({ code: 'WORKFLOW_NOT_PUBLISHED', message: 'Workflow is not published' });
    return;
  }

  // Initial deadline check
  if (wf.deadline) {
    const deadlineMs = new Date(wf.deadline).getTime();
    if (Date.now() > deadlineMs) {
      res.status(409).json({
        code: 'DEADLINE_PASSED',
        message: 'Initial deadline has passed; new applications are closed',
      });
      return;
    }
  }

  // Must be assigned to this workflow
  const assignment = assignRepo.getByStudentAndWorkflow(principal.id, workflowId);
  if (!assignment || assignment.status === 'revoked') {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'You are not assigned to this workflow',
    });
    return;
  }

  // One submission per student/workflow
  const existing = subRepo.getByStudentAndWorkflow(principal.id, workflowId);
  if (existing) {
    res.status(409).json({
      code: 'CONFLICT',
      message: 'A submission already exists for this workflow',
    });
    return;
  }

  const parseResult = newSubmissionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      code: 'VALIDATION_FAILED',
      message: 'Invalid submission data',
      errors: parseResult.error.issues,
    });
    return;
  }

  const initialAnswers = parseResult.data.answers || {};
  const submission = subRepo.createDraft(workflowId, principal.id, assignment.id, initialAnswers);

  recordAudit(db, {
    departmentId: wf.departmentId,
    workflowId: wf.id,
    actorId: principal.id,
    actorRole: 'student',
    event: 'submission_draft_created',
    targetEntity: 'Submission',
    targetId: submission.id,
    details: { assignmentId: assignment.id },
  });

  res.status(201).json(enrichSubmission(db, submission, wf));
}

// ==========================================
// EP-024: GET /api/submissions (Admin, Student, Reviewer)
// ==========================================
export function handleGetSubmissions(req: Request, res: Response): void {
  res.json(submissionPage(getDb(), res.locals.principal!, req.query));
}

// ==========================================
// EP-025: GET /api/submissions/:submissionId (Admin, Student, Reviewer)
// ==========================================
export function handleGetSubmissionById(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const submissionId = getParam(req.params.submissionId);
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);
  const subRepo = new SubmissionRepository(db);

  const sub = subRepo.getById(submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Submission not found' });
    return;
  }

  const wf = wfRepo.getLatestVersion(sub.workflowId);
  if (!wf) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Associated workflow not found' });
    return;
  }

  // Object-level authz checks:
  if (principal.role === 'student') {
    if (sub.studentId !== principal.id) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Access denied to private submission' });
      return;
    }
  } else if (principal.role === 'reviewer') {
    const isCurrentReviewer = wf.stages[sub.stageIndex]?.reviewerId === principal.id;
    const isInHistory = sub.history.some((h) => h.reviewerId === principal.id);
    if (!isCurrentReviewer && !isInHistory) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'You are not an assigned reviewer for this submission' });
      return;
    }
  } else if (principal.role === 'admin') {
    if (wf.departmentId !== principal.departmentId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Workflow belongs to another department' });
      return;
    }
  }

  res.json(enrichSubmission(db, sub, wf));
}

// ==========================================
// EP-026: PATCH /api/submissions/:submissionId (Student only)
// ==========================================
export function handlePatchSubmission(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const submissionId = getParam(req.params.submissionId);
  const db = getDb();
  const subRepo = new SubmissionRepository(db);

  const sub = subRepo.getById(submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Submission not found' });
    return;
  }

  if (sub.studentId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this submission' });
    return;
  }

  if (sub.status !== 'draft' && sub.status !== 'needs_changes') {
    res.status(409).json({
      code: 'ILLEGAL_STATE',
      message: `Cannot edit submission in status '${sub.status}'`,
    });
    return;
  }

  const parseResult = submissionFieldPatchSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      code: 'VALIDATION_FAILED',
      message: 'Invalid answers update',
      errors: parseResult.error.issues,
    });
    return;
  }

  const { answers, expectedVersion } = parseResult.data;

  if (sub.version !== expectedVersion) {
    res.status(409).json({
      code: 'VERSION_MISMATCH',
      message: 'This request has changed. Refresh and review its latest status.',
    });
    return;
  }

  const updated = subRepo.updateAnswers(submissionId, answers as Record<string, unknown>, expectedVersion);
  if (!updated) {
    res.status(409).json({
      code: 'CONFLICT',
      message: 'Concurrent update conflict or illegal state',
    });
    return;
  }

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: sub.workflowId,
    actorId: principal.id,
    actorRole: 'student',
    event: 'submission_answers_updated',
    targetEntity: 'Submission',
    targetId: sub.id,
    details: { version: updated.version },
  });

  res.json(enrichSubmission(db, updated));
}

// ==========================================
// EP-027: POST /api/submissions/:submissionId/submit (Student only)
// ==========================================
export function handleSubmitSubmission(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const submissionId = getParam(req.params.submissionId);
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);
  const subRepo = new SubmissionRepository(db);

  const sub = subRepo.getById(submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Submission not found' });
    return;
  }

  if (sub.studentId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this submission' });
    return;
  }

  const parseResult = submissionSubmitCommandSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      code: 'VALIDATION_FAILED',
      message: 'Invalid submit command',
      errors: parseResult.error.issues,
    });
    return;
  }

  const { expectedVersion } = parseResult.data;

  if (sub.version !== expectedVersion) {
    res.status(409).json({
      code: 'VERSION_MISMATCH',
      message: 'This request has changed. Refresh and review its latest status.',
    });
    return;
  }

  if (sub.status !== 'draft' && sub.status !== 'needs_changes') {
    res.status(409).json({
      code: 'ILLEGAL_TRANSITION',
      message: `Cannot submit a request in status '${sub.status}'`,
    });
    return;
  }

  const wf = wfRepo.getLatestVersion(sub.workflowId);
  if (!wf) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.status !== 'published') {
    res.status(409).json({
      code: 'WORKFLOW_NOT_PUBLISHED',
      message: 'Workflow is no longer published',
    });
    return;
  }

  // Deadline policy:
  // Initial draft requires Date.now() <= published deadline
  // Resubmission after needs_changes is permitted even if past deadline
  if (sub.status === 'draft' && wf.deadline) {
    const deadlineMs = new Date(wf.deadline).getTime();
    if (Date.now() > deadlineMs) {
      res.status(409).json({
        code: 'DEADLINE_PASSED',
        message: 'Initial deadline has passed; new applications are closed',
      });
      return;
    }
  }

  // VR-011: Validate dynamic required fields
  const validationErrors: Array<{ field: string; message: string }> = [];
  for (const field of wf.fields) {
    if (field.required) {
      const val = sub.answers?.[field.key];
      if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
        validationErrors.push({
          field: field.key,
          message: `Field "${field.label}" is required`,
        });
      }
    }
  }

  for (const field of wf.fields) {
    const value = sub.answers?.[field.key];
    if (value === undefined || value === null || value === '') continue;
    if (field.type !== 'file' && typeof value !== 'string') validationErrors.push({ field: field.key, message: `Enter a valid value for "${field.label}".` });
    if (field.type === 'select' && (!field.options || !field.options.includes(String(value)))) validationErrors.push({ field: field.key, message: `Select an available option for "${field.label}".` });
    if (field.type === 'date') {
      const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) validationErrors.push({ field: field.key, message: `Choose a valid date for "${field.label}".` });
    }
    if (field.type !== 'file') continue;
    const reference = sub.answers?.[field.key];
    if (!reference) continue;
    const attachment = typeof reference === 'string' ? db.prepare("SELECT id FROM attachments WHERE id = ? AND submissionId = ? AND status != 'removed'").get(reference, sub.id) : undefined;
    if (!attachment) validationErrors.push({ field: field.key, message: `Attach a valid document for "${field.label}".` });
  }

  if (validationErrors.length > 0) {
    res.status(422).json({
      code: 'VALIDATION_FAILED',
      message: 'Check the highlighted form answers.',
      errors: validationErrors,
    });
    return;
  }

  const result = subRepo.submitAtomic(submissionId, expectedVersion, wf, {
    id: principal.id,
    role: principal.role,
    name: principal.name,
  });

  if (!result.success || !result.submission) {
    res.status(409).json({
      code: 'SUBMISSION_FAILED',
      message: result.error || 'Failed to submit application',
    });
    return;
  }

  res.status(201).json(enrichSubmission(db, result.submission, wf));
}

// ==========================================
// EP-028: DELETE /api/submissions/:submissionId (Student only)
// ==========================================
export function handleDeleteSubmission(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const submissionId = getParam(req.params.submissionId);
  const db = getDb();
  const subRepo = new SubmissionRepository(db);

  const sub = subRepo.getById(submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Submission not found' });
    return;
  }

  if (sub.studentId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this submission' });
    return;
  }

  if (sub.status !== 'draft') {
    res.status(409).json({
      code: 'ILLEGAL_STATE',
      message: 'Only draft submissions can be deleted',
    });
    return;
  }

  const expectedVersion = Number(req.body?.expectedVersion ?? sub.version);
  const delResult = subRepo.deleteDraft(submissionId, principal.id, expectedVersion);
  if (!delResult.success) {
    res.status(409).json({
      code: 'DELETE_FAILED',
      message: delResult.error || 'Failed to delete draft',
    });
    return;
  }

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: sub.workflowId,
    actorId: principal.id,
    actorRole: 'student',
    event: 'submission_draft_deleted',
    targetEntity: 'Submission',
    targetId: sub.id,
    details: {},
  });

  const receipt: DeletionReceipt = {
    id: submissionId,
    deleted: true,
  };

  res.status(200).json(receipt);
}
