import type { Request, Response } from 'express';
import {
  getDb,
  WorkflowRepository,
  SubmissionRepository,
} from '../repository.js';
import {
  reviewDecisionCommandSchema,
} from '../../shared/contracts.js';
import { enrichSubmission } from './dynamic-submissions-deadlines.js';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

// ==========================================
// EP-029: POST /api/submissions/:submissionId/decision (Reviewer only)
// ==========================================
export function handlePostSubmissionDecision(req: Request, res: Response): void {
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

  // VR-014: Only reviewer assigned to the current stage can record decision
  const currentStage = wf.stages[sub.stageIndex];
  if (!currentStage || currentStage.reviewerId !== principal.id) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'You do not have permission to decide at this stage.',
    });
    return;
  }

  // VR-013 & Schema: Validate action, reason bounds, and expectedVersion
  const parseResult = reviewDecisionCommandSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      code: 'VALIDATION_FAILED',
      message: 'Explain what the student must change or why the request is denied.',
      errors: parseResult.error.issues,
    });
    return;
  }

  const { action, reason, expectedVersion } = parseResult.data;

  // Optimistic concurrency check
  if (sub.version !== expectedVersion) {
    res.status(409).json({
      code: 'VERSION_MISMATCH',
      message: 'This request has changed. Refresh and review its latest status.',
    });
    return;
  }

  // Only submitted or in_review submissions can be evaluated
  if (sub.status !== 'submitted' && sub.status !== 'in_review') {
    res.status(409).json({
      code: 'ILLEGAL_STATE',
      message: `Cannot review submission in status '${sub.status}'`,
    });
    return;
  }

  const result = subRepo.recordDecisionAtomic(
    submissionId,
    action,
    reason,
    expectedVersion,
    wf,
    {
      id: principal.id,
      role: principal.role,
      name: principal.name,
    }
  );

  if (!result.success || !result.submission) {
    res.status(409).json({
      code: 'DECISION_FAILED',
      message: result.error || 'Failed to record decision',
    });
    return;
  }

  res.status(201).json(enrichSubmission(db, result.submission, wf));
}
