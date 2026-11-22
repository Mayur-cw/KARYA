import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import {
  workflowDraftCreateSchema,
  workflowEditablePatchSchema,
  workflowPublishCommandSchema,
  workflowArchiveCommandSchema,
  type Workflow,
  type WorkflowScoped,
  type WorkflowPage,
  type WorkflowStage,
} from '../../shared/contracts.js';
import {
  getDb,
  WorkflowRepository,
  SourceDocumentRepository,
  AssignmentRepository,
  UserRepository,
} from '../repository.js';
import { recordAudit } from '../events.js';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

// ==========================================
// EP-012: POST /api/workflows
// ==========================================
export function handlePostWorkflow(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const parseRes = workflowDraftCreateSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid workflow draft payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const { title, sourceId } = parseRes.data;
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);

  // If sourceId provided, verify it exists and belongs to same department
  if (sourceId) {
    const docRepo = new SourceDocumentRepository(db);
    const doc = docRepo.getById(sourceId);
    if (!doc || doc.departmentId !== principal.departmentId || doc.status === 'deleted') {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Referenced source document not found' });
      return;
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const wf: Workflow = {
    id,
    departmentId: principal.departmentId,
    createdBy: principal.id,
    title,
    sourceId: sourceId ?? null,
    status: 'draft',
    origin: 'not_proposed',
    fields: [],
    stages: [],
    uncertainties: [],
    requirements: [],
    deadline: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  wfRepo.create(wf);

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: wf.id,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'workflow_created',
    targetEntity: 'Workflow',
    targetId: wf.id,
    details: { title: wf.title, sourceId: wf.sourceId },
  });

  res.status(201).json(wf);
}

// ==========================================
// EP-013: GET /api/workflows
// ==========================================
export function handleGetWorkflows(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);
  const docRepo = new SourceDocumentRepository(db);
  const userRepo = new UserRepository(db);

  const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase().trim() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  let candidateWorkflows: Workflow[] = [];

  if (principal.role === 'admin') {
    candidateWorkflows = wfRepo.listByDepartment(principal.departmentId);
  } else if (principal.role === 'student') {
    const assignRepo = new AssignmentRepository(db);
    const myAssignments = assignRepo.listByStudent(principal.id);
    const assignedWfIds = new Set(myAssignments.map((a) => a.workflowId));

    const allWfs = wfRepo.listByDepartment(principal.departmentId);
    candidateWorkflows = allWfs.filter(
      (w) => assignedWfIds.has(w.id) && (w.status === 'published' || w.status === 'archived')
    );
  } else if (principal.role === 'reviewer') {
    const allWfs = wfRepo.listByDepartment(principal.departmentId);
    candidateWorkflows = allWfs.filter((w) => {
      if (w.status !== 'published' && w.status !== 'archived') return false;
      return (w.stages || []).some((s: WorkflowStage) => s.reviewerId === principal.id);
    });
  }

  // Apply filters
  if (q) {
    candidateWorkflows = candidateWorkflows.filter((w) => w.title.toLowerCase().includes(q));
  }
  if (statusFilter) {
    candidateWorkflows = candidateWorkflows.filter((w) => w.status === statusFilter);
  }

  const total = candidateWorkflows.length;
  const startIndex = (page - 1) * limit;
  const paginated = candidateWorkflows.slice(startIndex, startIndex + limit);

  // Attach metadata
  const items: WorkflowScoped[] = paginated.map((w) => {
    let sourceDoc = null;
    if (w.sourceId) {
      const doc = docRepo.getById(w.sourceId);
      if (doc) {
        sourceDoc = {
          id: doc.id,
          departmentId: doc.departmentId,
          ownerId: doc.ownerId,
          title: doc.title,
          mime: doc.mime,
          sha256: doc.sha256,
          extractedLength: doc.extractedText.length,
          status: doc.status,
          createdAt: doc.createdAt,
        };
      }
    }
    const creator = userRepo.getById(w.createdBy);
    return {
      ...w,
      sourceDocument: sourceDoc,
      createdByName: creator?.name || 'Administrator',
    };
  });

  const responsePayload: WorkflowPage = {
    items,
    total,
    page,
    limit,
  };

  res.status(200).json(responsePayload);
}

// ==========================================
// EP-014: GET /api/workflows/:workflowId
// ==========================================
export function handleGetWorkflowById(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);
  const docRepo = new SourceDocumentRepository(db);
  const userRepo = new UserRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf || wf.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  // Scoping checks for non-admin roles
  if (principal.role === 'student') {
    if (wf.status !== 'published' && wf.status !== 'archived') {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
      return;
    }
    const assignRepo = new AssignmentRepository(db);
    const assign = assignRepo.getByStudentAndWorkflow(principal.id, wf.id);
    if (!assign) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'You are not assigned to this workflow' });
      return;
    }
  } else if (principal.role === 'reviewer') {
    if (wf.status !== 'published' && wf.status !== 'archived') {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
      return;
    }
    const isAssigned = (wf.stages || []).some((s: WorkflowStage) => s.reviewerId === principal.id);
    if (!isAssigned) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'You are not assigned as a reviewer on this workflow' });
      return;
    }
  }

  let sourceDoc = null;
  if (wf.sourceId) {
    const doc = docRepo.getById(wf.sourceId);
    if (doc) {
      sourceDoc = {
        id: doc.id,
        departmentId: doc.departmentId,
        ownerId: doc.ownerId,
        title: doc.title,
        mime: doc.mime,
        sha256: doc.sha256,
        extractedLength: doc.extractedText.length,
        status: doc.status,
        createdAt: doc.createdAt,
        extractedText: doc.extractedText,
        pageOffsets: doc.pageOffsets,
      };
    }
  }

  const creator = userRepo.getById(wf.createdBy);
  const responsePayload: WorkflowScoped = {
    ...wf,
    sourceDocument: sourceDoc,
    createdByName: creator?.name || 'Administrator',
  };

  res.status(200).json(responsePayload);
}

// ==========================================
// EP-015: PATCH /api/workflows/:workflowId
// ==========================================
export function handlePatchWorkflow(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const parseRes = workflowEditablePatchSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid workflow patch payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const { title, fields, stages, uncertainties, requirements, deadline, expectedVersion } = parseRes.data;
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf || wf.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.status === 'published' || wf.status === 'archived') {
    res.status(409).json({
      code: 'CONFLICT',
      message: 'Published or archived workflows cannot be directly edited. Please create a new version.',
    });
    return;
  }

  if (wf.version !== expectedVersion) {
    res.status(409).json({
      code: 'CONFLICT',
      message: 'Version conflict: workflow has been modified by another action',
    });
    return;
  }

  if (title !== undefined) wf.title = title;
  if (fields !== undefined) wf.fields = fields;
  if (stages !== undefined) wf.stages = stages;
  if (uncertainties !== undefined) wf.uncertainties = uncertainties;
  if (requirements !== undefined) wf.requirements = requirements;
  if (deadline !== undefined) wf.deadline = deadline;

  // Status remains proposed if fields or stages are present
  if (wf.fields.length > 0 && wf.status === 'draft') {
    wf.status = 'proposed';
    if (wf.origin === 'not_proposed') wf.origin = 'manual';
  }

  const updated = wfRepo.updateVersioned(wf, expectedVersion);
  if (!updated) {
    res.status(409).json({ code: 'CONFLICT', message: 'Failed to update workflow version' });
    return;
  }

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: wf.id,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'workflow_edited',
    targetEntity: 'Workflow',
    targetId: wf.id,
    details: { version: wf.version, fieldsCount: wf.fields.length },
  });

  const latest = wfRepo.getLatestVersion(workflowId)!;
  res.status(200).json(latest);
}

// ==========================================
// EP-017: POST /api/workflows/:workflowId/publish
// ==========================================
export function handlePublishWorkflow(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const parseRes = workflowPublishCommandSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid publish command payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const { expectedVersion, studentIds } = parseRes.data;
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf || wf.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.status === 'published') {
    res.status(409).json({ code: 'CONFLICT', message: 'Workflow is already published' });
    return;
  }

  const pubResult = wfRepo.publishAtomic(workflowId, expectedVersion, studentIds, {
    id: principal.id,
    role: principal.role,
    departmentId: principal.departmentId,
  });

  if (!pubResult.success) {
    res.status(422).json({
      code: 'INVALID_INPUT',
      message: pubResult.error || 'Publication gate failed',
    });
    return;
  }

  res.status(200).json(pubResult.workflow);
}

// ==========================================
// EP-018: POST /api/workflows/:workflowId/archive
// ==========================================
export function handleArchiveWorkflow(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const workflowId = getParam(req.params.workflowId);
  const parseRes = workflowArchiveCommandSchema.safeParse(req.body);
  if (!parseRes.success) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid archive command payload',
      details: parseRes.error.issues,
    });
    return;
  }

  const { reason, expectedVersion } = parseRes.data;
  const db = getDb();
  const wfRepo = new WorkflowRepository(db);

  const wf = wfRepo.getLatestVersion(workflowId);
  if (!wf || wf.departmentId !== principal.departmentId) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return;
  }

  if (wf.status === 'archived') {
    res.status(409).json({ code: 'CONFLICT', message: 'Workflow is already archived' });
    return;
  }

  const archived = wfRepo.archive(workflowId, reason, expectedVersion, {
    id: principal.id,
    role: principal.role,
  });

  if (!archived) {
    res.status(409).json({ code: 'CONFLICT', message: 'Version conflict or archive failure' });
    return;
  }

  const latest = wfRepo.getLatestVersion(workflowId)!;
  res.status(200).json(latest);
}
