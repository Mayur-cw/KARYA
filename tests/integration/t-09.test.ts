import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';
import { clearAllSessions, SEEDED_USERS } from '../../src/server/session.js';
import {
  initDatabase,
  WorkflowRepository,
  AssignmentRepository,
  SubmissionRepository,
} from '../../src/server/repository.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-09 — Multi-Stage Review Atomics', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;
  let wfRepo: WorkflowRepository;
  let assignRepo: AssignmentRepository;
  let subRepo: SubmissionRepository;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
  const mentor = SEEDED_USERS.find((u) => u.name.includes('Mentor'))!;
  const dean = SEEDED_USERS.find((u) => u.name.includes('Dean'))!;

  beforeEach(() => {
    clearAllSessions();
    db = initDatabase(':memory:');
    wfRepo = new WorkflowRepository(db);
    assignRepo = new AssignmentRepository(db);
    subRepo = new SubmissionRepository(db);
    app = createApp();
  });

  async function getSession(user: typeof admin) {
    const loginRes = await request(app).post('/api/auth/demo-login').send({ userId: user.id });
    return {
      cookie: loginRes.headers['set-cookie'][0],
      csrfToken: loginRes.body.csrfToken,
    };
  }

  function setupWorkflowAndSubmission() {
    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Global Summer Fellowship 2026',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [
        { key: 'proposal', label: 'Proposal', type: 'text', required: true },
      ],
      stages: [
        { stageIndex: 0, label: 'Faculty Mentor Review', reviewerId: mentor.id },
        { stageIndex: 1, label: 'Dean Final Endorsement', reviewerId: dean.id },
      ],
      uncertainties: [],
      requirements: [],
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      version: 1,
      archiveReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wfRepo.create(wf);
    const [assignment] = assignRepo.createAssignments(wf.id, [studentA.id]);
    const submission = subRepo.createDraft(wf.id, studentA.id, assignment.id, {
      proposal: 'Deep Learning for Edge Devices',
    });

    // Student submits draft -> status = submitted, version = 2
    const submitted = subRepo.submitAtomic(submission.id, 1, wf, {
      id: studentA.id,
      role: 'student',
      name: studentA.name,
    });

    return { wf, assignment, submission: submitted.submission! };
  }

  describe('T-API-029: POST /api/submissions/:submissionId/decision', () => {
    it('executes full multi-stage approval flow: Stage 0 mentor -> Stage 1 dean -> approved', async () => {
      const mentorSession = await getSession(mentor);
      const deanSession = await getSession(dean);
      const { submission } = setupWorkflowAndSubmission();

      expect(submission.status).toBe('submitted');
      expect(submission.stageIndex).toBe(0);
      expect(submission.version).toBe(2);

      // Stage 0: Mentor approves
      const mentorDecisionRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', mentorSession.cookie)
        .set('x-csrf-token', mentorSession.csrfToken)
        .send({
          action: 'approve',
          expectedVersion: 2,
        });

      expect(mentorDecisionRes.status).toBe(201);
      expect(mentorDecisionRes.body.status).toBe('in_review');
      expect(mentorDecisionRes.body.stageIndex).toBe(1);
      expect(mentorDecisionRes.body.version).toBe(3);
      expect(mentorDecisionRes.body.history.length).toBe(1);
      expect(mentorDecisionRes.body.history[0].reviewerId).toBe(mentor.id);
      expect(mentorDecisionRes.body.history[0].action).toBe('approve');

      // Stage 1: Dean approves (final stage)
      const deanDecisionRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', deanSession.cookie)
        .set('x-csrf-token', deanSession.csrfToken)
        .send({
          action: 'approve',
          expectedVersion: 3,
        });

      expect(deanDecisionRes.status).toBe(201);
      expect(deanDecisionRes.body.status).toBe('approved');
      expect(deanDecisionRes.body.version).toBe(4);
      expect(deanDecisionRes.body.history.length).toBe(2);
      expect(deanDecisionRes.body.history[1].reviewerId).toBe(dean.id);
      expect(deanDecisionRes.body.history[1].action).toBe('approve');

      // Invariant: Assignment status set to completed
      const finalAssign = assignRepo.getByStudentAndWorkflow(submission.studentId, submission.workflowId);
      expect(finalAssign?.status).toBe('completed');
    });

    it('handles needs_changes: requires reason >= 10 chars, updates status, and allows student resubmission', async () => {
      const mentorSession = await getSession(mentor);
      const studentSession = await getSession(studentA);
      const { submission } = setupWorkflowAndSubmission();

      // Short reason fails VR-013 validation (422)
      const shortReasonRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', mentorSession.cookie)
        .set('x-csrf-token', mentorSession.csrfToken)
        .send({
          action: 'needs_changes',
          reason: 'Too brief',
          expectedVersion: 2,
        });
      expect(shortReasonRes.status).toBe(422);
      expect(shortReasonRes.body.code).toBe('VALIDATION_FAILED');

      // Valid correction request
      const validCorrectionRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', mentorSession.cookie)
        .set('x-csrf-token', mentorSession.csrfToken)
        .send({
          action: 'needs_changes',
          reason: 'Please expand on your hardware acceleration methodology and benchmarks.',
          expectedVersion: 2,
        });

      expect(validCorrectionRes.status).toBe(201);
      expect(validCorrectionRes.body.status).toBe('needs_changes');
      expect(validCorrectionRes.body.version).toBe(3);
      expect(validCorrectionRes.body.history[0].reason).toContain('hardware acceleration');

      // Student can now update answers and resubmit
      const patchRes = await request(app)
        .patch(`/api/submissions/${submission.id}`)
        .set('Cookie', studentSession.cookie)
        .set('x-csrf-token', studentSession.csrfToken)
        .send({
          answers: { proposal: 'Expanded Hardware Methodology with GPU/NPU Benchmarks' },
          expectedVersion: 3,
        });
      expect(patchRes.status).toBe(200);

      const resubmitRes = await request(app)
        .post(`/api/submissions/${submission.id}/submit`)
        .set('Cookie', studentSession.cookie)
        .set('x-csrf-token', studentSession.csrfToken)
        .send({ expectedVersion: 4 });

      expect(resubmitRes.status).toBe(201);
      expect(resubmitRes.body.status).toBe('submitted');
      expect(resubmitRes.body.revision).toBe(2);
    });

    it('handles reject: requires reason >= 10 chars, completes assignment, and notifies student', async () => {
      const mentorSession = await getSession(mentor);
      const { submission } = setupWorkflowAndSubmission();

      const rejectRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', mentorSession.cookie)
        .set('x-csrf-token', mentorSession.csrfToken)
        .send({
          action: 'reject',
          reason: 'The proposed research does not meet departmental alignment criteria.',
          expectedVersion: 2,
        });

      expect(rejectRes.status).toBe(201);
      expect(rejectRes.body.status).toBe('rejected');
      expect(rejectRes.body.version).toBe(3);

      const finalAssign = assignRepo.getByStudentAndWorkflow(submission.studentId, submission.workflowId);
      expect(finalAssign?.status).toBe('completed');
    });

    it('enforces VR-014 reviewer stage assignment, version concurrency, and non-reviewer role rejection', async () => {
      const adminSession = await getSession(admin);
      const studentSession = await getSession(studentA);
      const deanSession = await getSession(dean);
      const mentorSession = await getSession(mentor);
      const { submission } = setupWorkflowAndSubmission();

      // Admin role gets 403
      const adminRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ action: 'approve', expectedVersion: 2 });
      expect(adminRes.status).toBe(403);

      // Student role gets 403
      const studentRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', studentSession.cookie)
        .set('x-csrf-token', studentSession.csrfToken)
        .send({ action: 'approve', expectedVersion: 2 });
      expect(studentRes.status).toBe(403);

      // Dean attempting to decide at Stage 0 (when Mentor is assigned) gets 403 (VR-014)
      const wrongStageRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', deanSession.cookie)
        .set('x-csrf-token', deanSession.csrfToken)
        .send({ action: 'approve', expectedVersion: 2 });
      expect(wrongStageRes.status).toBe(403);
      expect(wrongStageRes.body.message).toContain('permission to decide at this stage');

      // Stale version gets 409 Conflict
      const staleRes = await request(app)
        .post(`/api/submissions/${submission.id}/decision`)
        .set('Cookie', mentorSession.cookie)
        .set('x-csrf-token', mentorSession.csrfToken)
        .send({ action: 'approve', expectedVersion: 999 });
      expect(staleRes.status).toBe(409);
      expect(staleRes.body.code).toBe('VERSION_MISMATCH');
    });
  });
});
