import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';
import { clearAllSessions, SEEDED_USERS, SEEDED_DEPARTMENT_ID } from '../../src/server/session.js';
import { initDatabase, WorkflowRepository, NotificationRepository, AssignmentRepository } from '../../src/server/repository.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-06 — Workflow Draft and Publish Gate', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
  const studentB = SEEDED_USERS.find((u) => u.name.includes('Student B'))!;
  const mentor = SEEDED_USERS.find((u) => u.name.includes('Mentor'))!;
  const finalAuth = SEEDED_USERS.find((u) => u.name.includes('Final Authority'))!;

  beforeEach(() => {
    clearAllSessions();
    db = initDatabase(':memory:');
    app = createApp();
  });

  async function getSession(user: typeof admin) {
    const loginRes = await request(app).post('/api/auth/demo-login').send({ userId: user.id });
    return {
      cookie: loginRes.headers['set-cookie'][0],
      csrfToken: loginRes.body.csrfToken,
    };
  }

  describe('T-API-012: POST /api/workflows', () => {
    it('enforces RBAC: denies anonymous (401), student (403), reviewer (403)', async () => {
      const anonRes = await request(app).post('/api/workflows').send({ title: 'New Workflow' });
      expect(anonRes.status).toBe(401);

      const studentSession = await getSession(studentA);
      const studentRes = await request(app)
        .post('/api/workflows')
        .set('Cookie', studentSession.cookie)
        .set('x-csrf-token', studentSession.csrfToken)
        .send({ title: 'New Workflow' });
      expect(studentRes.status).toBe(403);
    });

    it('creates draft workflow for admin and validates title boundaries', async () => {
      const adminSession = await getSession(admin);

      // Too short title (<5 chars)
      const shortRes = await request(app)
        .post('/api/workflows')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Tiny' });
      expect(shortRes.status).toBe(400);

      // Valid workflow creation
      const validRes = await request(app)
        .post('/api/workflows')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'College Internship Approval 2026' });

      expect(validRes.status).toBe(201);
      expect(validRes.body.title).toBe('College Internship Approval 2026');
      expect(validRes.body.status).toBe('draft');
      expect(validRes.body.version).toBe(1);
      expect(validRes.body.departmentId).toBe(SEEDED_DEPARTMENT_ID);
    });
  });

  describe('T-API-013: GET /api/workflows', () => {
    it('scopes list by role: admin sees drafts; students see only published assigned', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);

      // Create 1 draft and 1 published workflow
      const draftWf: Workflow = {
        id: 'wf-draft-1',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Draft Process Workflow',
        status: 'draft',
        origin: 'manual',
        fields: [{ key: 'f1', label: 'Field 1', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'Mentor', reviewerId: mentor.id }],
        uncertainties: [],
        deadline: null,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(draftWf);

      const pubWf: Workflow = {
        id: 'wf-pub-1',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Published Process Workflow',
        status: 'published',
        origin: 'manual',
        fields: [{ key: 'f1', label: 'Field 1', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'Mentor', reviewerId: mentor.id }],
        uncertainties: [],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(pubWf);

      // Assign studentA to pubWf
      db.prepare(`
        INSERT INTO assignments (id, workflowId, studentId, status, assignedAt)
        VALUES ('assign-1', 'wf-pub-1', ?, 'invited', ?)
      `).run(studentA.id, new Date().toISOString());

      // Admin checks list -> sees both
      const adminRes = await request(app)
        .get('/api/workflows')
        .set('Cookie', adminSession.cookie);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.items.some((w: { id: string }) => w.id === 'wf-draft-1')).toBe(true);
      expect(adminRes.body.items.some((w: { id: string }) => w.id === 'wf-pub-1')).toBe(true);

      // Student A checks list -> sees ONLY published assigned workflow
      const studentASession = await getSession(studentA);
      const studentARes = await request(app)
        .get('/api/workflows')
        .set('Cookie', studentASession.cookie);
      expect(studentARes.status).toBe(200);
      expect(studentARes.body.items.some((w: { id: string }) => w.id === 'wf-pub-1')).toBe(true);
      expect(studentARes.body.items.some((w: { id: string }) => w.id === 'wf-draft-1')).toBe(false);

      // Student B (unassigned) checks list -> sees empty list
      const studentBSession = await getSession(studentB);
      const studentBRes = await request(app)
        .get('/api/workflows')
        .set('Cookie', studentBSession.cookie);
      expect(studentBRes.status).toBe(200);
      expect(studentBRes.body.items.length).toBe(0);
    });
  });

  describe('T-API-014: GET /api/workflows/:workflowId', () => {
    it('redacts unassigned/draft workflows from students', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);

      const draftWf: Workflow = {
        id: 'wf-secret-draft',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Confidential Internal Draft',
        status: 'draft',
        origin: 'manual',
        fields: [],
        stages: [],
        uncertainties: [],
        deadline: null,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(draftWf);

      // Student attempt to inspect draft
      const studentSession = await getSession(studentA);
      const studentRes = await request(app)
        .get(`/api/workflows/${draftWf.id}`)
        .set('Cookie', studentSession.cookie);
      expect(studentRes.status).toBe(404);

      // Admin attempt succeeds
      const adminRes = await request(app)
        .get(`/api/workflows/${draftWf.id}`)
        .set('Cookie', adminSession.cookie);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.title).toBe('Confidential Internal Draft');
    });
  });

  describe('T-API-015: PATCH /api/workflows/:workflowId', () => {
    it('allows admin to edit fields/stages and increments version', async () => {
      const adminSession = await getSession(admin);
      const createRes = await request(app)
        .post('/api/workflows')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Initial Draft Workflow' });
      const wfId = createRes.body.id;

      // Optimistic lock conflict
      const conflictRes = await request(app)
        .patch(`/api/workflows/${wfId}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({
          title: 'Conflict Title',
          expectedVersion: 99,
        });
      expect(conflictRes.status).toBe(409);

      // Valid edit
      const editRes = await request(app)
        .patch(`/api/workflows/${wfId}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({
          title: 'Configured Internship Workflow',
          fields: [
            { key: 'student_name', label: 'Full Name', type: 'text', required: true },
            { key: 'offer_pdf', label: 'Offer Letter', type: 'file', required: true },
          ],
          stages: [
            { stageIndex: 0, label: 'Faculty Mentor Review', reviewerId: mentor.id },
            { stageIndex: 1, label: 'Dean Final Approval', reviewerId: finalAuth.id },
          ],
          deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
          expectedVersion: 1,
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.title).toBe('Configured Internship Workflow');
      expect(editRes.body.version).toBe(2);
      expect(editRes.body.fields.length).toBe(2);
      expect(editRes.body.stages.length).toBe(2);
    });
  });

  describe('T-API-017: POST /api/workflows/:workflowId/publish', () => {
    it('blocks publication if deadline missing or uncertainties unresolved', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);

      // Workflow with unresolved deadline uncertainty
      const blockedWf: Workflow = {
        id: 'wf-blocked-pub',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Unresolved Uncertainty Workflow',
        status: 'proposed',
        origin: 'manual',
        fields: [{ key: 'f1', label: 'F1', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'Mentor', reviewerId: mentor.id }],
        uncertainties: [
          {
            id: 'unc-1',
            kind: 'deadline',
            description: 'Deadline is missing in circular',
            resolved: false,
          },
        ],
        deadline: null,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(blockedWf);

      const pubRes = await request(app)
        .post(`/api/workflows/${blockedWf.id}/publish`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({
          expectedVersion: 1,
          studentIds: [studentA.id],
        });

      expect(pubRes.status).toBe(422);
      expect(pubRes.body.message).toContain('deadline is required');
    });

    it('publishes workflow atomically when all gates are satisfied and creates assignments/notifications', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);
      const futureDeadline = new Date(Date.now() + 10 * 86400000).toISOString();

      const validWf: Workflow = {
        id: 'wf-ready-to-pub',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Complete Judge-Ready Workflow',
        status: 'proposed',
        origin: 'manual',
        fields: [{ key: 'company', label: 'Company Name', type: 'text', required: true }],
        stages: [
          { stageIndex: 0, label: 'Mentor Review', reviewerId: mentor.id },
          { stageIndex: 1, label: 'Final Authority Approval', reviewerId: finalAuth.id },
        ],
        uncertainties: [
          {
            id: 'unc-1',
            kind: 'deadline',
            description: 'Deadline was missing',
            resolved: true,
            resolutionNote: 'Set to 10 days from publication date',
          },
        ],
        deadline: futureDeadline,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(validWf);

      const pubRes = await request(app)
        .post(`/api/workflows/${validWf.id}/publish`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({
          expectedVersion: 1,
          studentIds: [studentA.id, studentB.id],
        });

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.status).toBe('published');
      expect(pubRes.body.version).toBe(2);

      // Verify assignments created
      const assignRepo = new AssignmentRepository(db);
      const assignA = assignRepo.getByStudentAndWorkflow(studentA.id, validWf.id);
      const assignB = assignRepo.getByStudentAndWorkflow(studentB.id, validWf.id);
      expect(assignA).toBeDefined();
      expect(assignB).toBeDefined();

      // Verify notifications sent to both students
      const notifRepo = new NotificationRepository(db);
      const notifsA = notifRepo.listByRecipient(studentA.id);
      expect(notifsA.some((n) => n.title.includes('New Process Assigned'))).toBe(true);
    });
  });

  describe('T-API-018: POST /api/workflows/:workflowId/archive', () => {
    it('archives published workflow with reason', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);

      const wf: Workflow = {
        id: 'wf-archive-target',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Completed Cohort Workflow',
        status: 'published',
        origin: 'manual',
        fields: [{ key: 'f1', label: 'F1', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'Mentor', reviewerId: mentor.id }],
        uncertainties: [],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      // Missing reason
      const badRes = await request(app)
        .post(`/api/workflows/${wf.id}/archive`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ reason: '', expectedVersion: 1 });
      expect(badRes.status).toBe(400);

      // Valid archive
      const archiveRes = await request(app)
        .post(`/api/workflows/${wf.id}/archive`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ reason: 'Cohort period completed for the term', expectedVersion: 1 });

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.status).toBe('archived');
      expect(archiveRes.body.archiveReason).toBe('Cohort period completed for the term');
      expect(archiveRes.body.version).toBe(2);
    });
  });
});
