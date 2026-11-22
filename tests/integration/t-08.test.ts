import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';
import { clearAllSessions, SEEDED_USERS } from '../../src/server/session.js';
import { initDatabase, WorkflowRepository, AssignmentRepository } from '../../src/server/repository.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-08 — Dynamic Submissions and Deadlines', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;
  let wfRepo: WorkflowRepository;
  let assignRepo: AssignmentRepository;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
  const studentB = SEEDED_USERS.find((u) => u.name.includes('Student B'))!;
  const mentor = SEEDED_USERS.find((u) => u.name.includes('Mentor'))!;
  const dean = SEEDED_USERS.find((u) => u.name.includes('Dean'))!;

  beforeEach(() => {
    clearAllSessions();
    db = initDatabase(':memory:');
    wfRepo = new WorkflowRepository(db);
    assignRepo = new AssignmentRepository(db);
    app = createApp();
  });

  async function getSession(user: typeof admin) {
    const loginRes = await request(app).post('/api/auth/demo-login').send({ userId: user.id });
    return {
      cookie: loginRes.headers['set-cookie'][0],
      csrfToken: loginRes.body.csrfToken,
    };
  }

  function createPublishedWorkflow(overrides?: Partial<Workflow>): Workflow {
    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Summer Research Internship 2026',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [
        { key: 'projectTitle', label: 'Project Title', type: 'text', required: true },
        { key: 'startDate', label: 'Proposed Start Date', type: 'date', required: true },
        { key: 'statement', label: 'Statement of Purpose', type: 'text', required: false },
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
      ...overrides,
    };
    wfRepo.create(wf);
    return wf;
  }

  describe('T-API-023: POST /api/workflows/:workflowId/submissions', () => {
    it('creates draft for assigned student; enforces deadline, assignment and role restrictions', async () => {
      const adminSession = await getSession(admin);
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);
      const reviewerSession = await getSession(mentor);

      const wf = createPublishedWorkflow();

      // Assign student A
      assignRepo.createAssignments(wf.id, [studentA.id]);

      // Admin or Reviewer role cannot submit (403)
      const adminRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ answers: {} });
      expect(adminRes.status).toBe(403);

      const reviewerRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', reviewerSession.cookie)
        .set('x-csrf-token', reviewerSession.csrfToken)
        .send({ answers: {} });
      expect(reviewerRes.status).toBe(403);

      // Student B (not assigned) gets 403
      const unassignedRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ answers: {} });
      expect(unassignedRes.status).toBe(403);
      expect(unassignedRes.body.code).toBe('FORBIDDEN');

      // Student A (assigned) creates draft successfully (201)
      const createRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: { projectTitle: 'Distributed Systems' } });

      expect(createRes.status).toBe(201);
      expect(createRes.body.workflowId).toBe(wf.id);
      expect(createRes.body.studentId).toBe(studentA.id);
      expect(createRes.body.status).toBe('draft');
      expect(createRes.body.version).toBe(1);
      expect(createRes.body.answers.projectTitle).toBe('Distributed Systems');
      expect(createRes.body.studentName).toBe(studentA.name);
      expect(createRes.body.workflowTitle).toBe(wf.title);

      // Assignment status updated to started
      const assignment = assignRepo.getByStudentAndWorkflow(studentA.id, wf.id);
      expect(assignment?.status).toBe('started');

      // Duplicate draft creation attempt fails with 409
      const dupRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: {} });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe('CONFLICT');

      // Workflow past initial deadline blocks creation
      const expiredWf = createPublishedWorkflow({
        id: crypto.randomUUID(),
        deadline: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      });
      assignRepo.createAssignments(expiredWf.id, [studentB.id]);

      const expiredRes = await request(app)
        .post(`/api/workflows/${expiredWf.id}/submissions`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ answers: {} });
      expect(expiredRes.status).toBe(409);
      expect(expiredRes.body.code).toBe('DEADLINE_PASSED');
    });
  });

  describe('T-API-024: GET /api/submissions', () => {
    it('scopes list by student ownership, reviewer assigned stage, and admin department', async () => {
      const adminSession = await getSession(admin);
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);
      const mentorSession = await getSession(mentor);

      const wf = createPublishedWorkflow();
      assignRepo.createAssignments(wf.id, [studentA.id, studentB.id]);

      // Student A creates draft
      const subARes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: { projectTitle: 'Aarav Research' } });

      // Student B creates draft
      await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ answers: { projectTitle: 'Bhavya Research' } });

      // Student A sees ONLY their own submission
      const listARes = await request(app).get('/api/submissions').set('Cookie', studentASession.cookie);
      expect(listARes.status).toBe(200);
      expect(listARes.body.total).toBe(1);
      expect(listARes.body.items[0].id).toBe(subARes.body.id);
      expect(listARes.body.items[0].studentId).toBe(studentA.id);

      // Student B sees ONLY their own submission
      const listBRes = await request(app).get('/api/submissions').set('Cookie', studentBSession.cookie);
      expect(listBRes.status).toBe(200);
      expect(listBRes.body.total).toBe(1);
      expect(listBRes.body.items[0].studentId).toBe(studentB.id);

      // Mentor sees 0 pending reviews because neither has submitted yet (still in draft)
      const mentorRes = await request(app).get('/api/submissions').set('Cookie', mentorSession.cookie);
      expect(mentorRes.status).toBe(200);
      expect(mentorRes.body.total).toBe(0);

      // Admin sees both submissions in department
      const adminListRes = await request(app).get('/api/submissions').set('Cookie', adminSession.cookie);
      expect(adminListRes.status).toBe(200);
      expect(adminListRes.body.total).toBe(2);

      // Filter and search checks
      const searchRes = await request(app)
        .get(`/api/submissions?q=Aarav`)
        .set('Cookie', adminSession.cookie);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.total).toBe(1);
      expect(searchRes.body.items[0].studentName).toContain('Aarav');
    });
  });

  describe('T-API-025: GET /api/submissions/:submissionId', () => {
    it('enforces object-level PII protection; student cannot inspect peer submission', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);
      const mentorSession = await getSession(mentor);
      const adminSession = await getSession(admin);

      const wf = createPublishedWorkflow();
      assignRepo.createAssignments(wf.id, [studentA.id]);

      const createRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: { projectTitle: 'Confidential Proposal' } });

      const submissionId = createRes.body.id;

      // Student A can view
      const viewARes = await request(app)
        .get(`/api/submissions/${submissionId}`)
        .set('Cookie', studentASession.cookie);
      expect(viewARes.status).toBe(200);
      expect(viewARes.body.id).toBe(submissionId);

      // Student B blocked (403 Forbidden)
      const viewBRes = await request(app)
        .get(`/api/submissions/${submissionId}`)
        .set('Cookie', studentBSession.cookie);
      expect(viewBRes.status).toBe(403);
      expect(viewBRes.body.code).toBe('FORBIDDEN');

      // Admin can view
      const viewAdminRes = await request(app)
        .get(`/api/submissions/${submissionId}`)
        .set('Cookie', adminSession.cookie);
      expect(viewAdminRes.status).toBe(200);

      // Mentor assigned to stage 0 can view
      const viewMentorRes = await request(app)
        .get(`/api/submissions/${submissionId}`)
        .set('Cookie', mentorSession.cookie);
      expect(viewMentorRes.status).toBe(200);
    });
  });

  describe('T-API-026: PATCH /api/submissions/:submissionId', () => {
    it('allows owner to update draft answers; enforces optimistic versioning and state constraints', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);

      const wf = createPublishedWorkflow();
      assignRepo.createAssignments(wf.id, [studentA.id]);

      const createRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: { projectTitle: 'Initial Title' } });

      const submissionId = createRes.body.id;

      // Non-owner student B cannot patch
      const bRes = await request(app)
        .patch(`/api/submissions/${submissionId}`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ answers: { projectTitle: 'Hacked' }, expectedVersion: 1 });
      expect(bRes.status).toBe(403);

      // Stale version fails with 409
      const staleRes = await request(app)
        .patch(`/api/submissions/${submissionId}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: { projectTitle: 'Updated Title' }, expectedVersion: 999 });
      expect(staleRes.status).toBe(409);
      expect(staleRes.body.code).toBe('VERSION_MISMATCH');

      // Valid patch succeeds and increments version
      const patchRes = await request(app)
        .patch(`/api/submissions/${submissionId}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({
          answers: { projectTitle: 'Updated ML Architecture', startDate: '2026-06-01' },
          expectedVersion: 1,
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.version).toBe(2);
      expect(patchRes.body.answers.projectTitle).toBe('Updated ML Architecture');
      expect(patchRes.body.answers.startDate).toBe('2026-06-01');
    });
  });

  describe('T-API-027: POST /api/submissions/:submissionId/submit', () => {
    it('validates VR-011 required fields, advances draft to submitted, notifies reviewer, and honors deadline policies', async () => {
      const studentASession = await getSession(studentA);
      const mentorSession = await getSession(mentor);

      const wf = createPublishedWorkflow();
      assignRepo.createAssignments(wf.id, [studentA.id]);

      const createRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: { projectTitle: 'Valid Project' } }); // Missing required startDate!

      const submissionId = createRes.body.id;

      // Submission without required startDate fails VR-011 check (422)
      const missingFieldRes = await request(app)
        .post(`/api/submissions/${submissionId}/submit`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ expectedVersion: 1 });
      expect(missingFieldRes.status).toBe(422);
      expect(missingFieldRes.body.code).toBe('VALIDATION_FAILED');
      expect(missingFieldRes.body.message).toBe('Check the highlighted form answers.');
      expect(missingFieldRes.body.errors[0].field).toBe('startDate');

      // Update answers with all required fields
      await request(app)
        .patch(`/api/submissions/${submissionId}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({
          answers: {
            projectTitle: 'Robust Quantum Key Distribution',
            startDate: '2026-07-01',
          },
          expectedVersion: 1,
        });

      // Submit with matching expectedVersion 2
      const submitRes = await request(app)
        .post(`/api/submissions/${submissionId}/submit`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ expectedVersion: 2 });

      expect(submitRes.status).toBe(201);
      expect(submitRes.body.status).toBe('submitted');
      expect(submitRes.body.version).toBe(3);
      expect(submitRes.body.revision).toBe(1);

      // Mentor now sees 1 item in reviewer list
      const mentorInboxRes = await request(app)
        .get('/api/submissions')
        .set('Cookie', mentorSession.cookie);
      expect(mentorInboxRes.status).toBe(200);
      expect(mentorInboxRes.body.total).toBe(1);
      expect(mentorInboxRes.body.items[0].id).toBe(submissionId);

      // Re-submitting an already submitted request fails with 409
      const doubleSubmit = await request(app)
        .post(`/api/submissions/${submissionId}/submit`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ expectedVersion: 3 });
      expect(doubleSubmit.status).toBe(409);
      expect(doubleSubmit.body.code).toBe('ILLEGAL_TRANSITION');
    });

    it('allows resubmission of needs_changes even after published deadline has passed', async () => {
      const studentASession = await getSession(studentA);

      const wf = createPublishedWorkflow();
      assignRepo.createAssignments(wf.id, [studentA.id]);

      const createRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({
          answers: {
            projectTitle: 'Initial Submission',
            startDate: '2026-07-01',
          },
        });
      const submissionId = createRes.body.id;

      // Submit
      await request(app)
        .post(`/api/submissions/${submissionId}/submit`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ expectedVersion: 1 });

      // Simulate reviewer requesting changes (needs_changes)
      db.prepare(`
        UPDATE submissions
        SET status = 'needs_changes', version = version + 1
        WHERE id = ?
      `).run(submissionId);

      // Expire workflow deadline
      db.prepare(`
        UPDATE workflows
        SET deadline = ?
        WHERE id = ?
      `).run(new Date(Date.now() - 3600000).toISOString(), wf.id);

      // Student updates correction
      const patchRes = await request(app)
        .patch(`/api/submissions/${submissionId}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({
          answers: {
            projectTitle: 'Revised Project after Feedback',
            startDate: '2026-07-01',
          },
          expectedVersion: 3,
        });
      expect(patchRes.status).toBe(200);

      // Resubmission succeeds even though deadline passed!
      const resubmitRes = await request(app)
        .post(`/api/submissions/${submissionId}/submit`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ expectedVersion: 4 });

      expect(resubmitRes.status).toBe(201);
      expect(resubmitRes.body.status).toBe('submitted');
      expect(resubmitRes.body.revision).toBe(2); // Revision incremented on correction resubmit
    });
  });

  describe('T-API-028: DELETE /api/submissions/:submissionId', () => {
    it('allows student to delete draft and restores assignment to invited; blocks deletion of submitted', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);

      const wf = createPublishedWorkflow();
      assignRepo.createAssignments(wf.id, [studentA.id]);

      const createRes = await request(app)
        .post(`/api/workflows/${wf.id}/submissions`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ answers: { projectTitle: 'Draft to Delete' } });
      const submissionId = createRes.body.id;

      // Student B cannot delete Student A's draft
      const bRes = await request(app)
        .delete(`/api/submissions/${submissionId}`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ expectedVersion: 1 });
      expect(bRes.status).toBe(403);

      // Student A deletes own draft
      const delRes = await request(app)
        .delete(`/api/submissions/${submissionId}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ expectedVersion: 1 });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);

      // Submission no longer exists
      const getRes = await request(app)
        .get(`/api/submissions/${submissionId}`)
        .set('Cookie', studentASession.cookie);
      expect(getRes.status).toBe(404);

      // Assignment status reset to 'invited'
      const assignment = assignRepo.getByStudentAndWorkflow(studentA.id, wf.id);
      expect(assignment?.status).toBe('invited');
    });
  });
});
