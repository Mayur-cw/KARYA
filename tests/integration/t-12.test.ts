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
import { recordAudit } from '../../src/server/events.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-12 — Audit Explorer, CSV Report and Healthz', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;
  let wfRepo: WorkflowRepository;
  let assignRepo: AssignmentRepository;
  let subRepo: SubmissionRepository;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
  const mentor = SEEDED_USERS.find((u) => u.name.includes('Mentor'))!;

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

  function setupWorkflow(): Workflow {
    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Aerospace Systems Grant',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [
        { key: 'projectSummary', label: 'Project Summary', type: 'text', required: true },
        { key: 'budgetFormula', label: 'Budget Details', type: 'text', required: false },
      ],
      stages: [{ stageIndex: 0, label: 'Faculty Review', reviewerId: mentor.id }],
      uncertainties: [],
      requirements: [],
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      version: 1,
      archiveReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wfRepo.create(wf);
    return wf;
  }

  describe('T-API-033: GET /api/audit', () => {
    it('allows admin departmental audit search with filters; strictly blocks student and reviewer', async () => {
      const adminSession = await getSession(admin);
      const studentSession = await getSession(studentA);
      const reviewerSession = await getSession(mentor);
      const wf = setupWorkflow();

      // Seed audit entries
      recordAudit(db, {
        departmentId: admin.departmentId,
        workflowId: wf.id,
        actorId: admin.id,
        actorRole: 'admin',
        event: 'workflow_published',
        targetEntity: 'Workflow',
        targetId: wf.id,
        details: { version: 1 },
      });

      recordAudit(db, {
        departmentId: admin.departmentId,
        workflowId: wf.id,
        actorId: studentA.id,
        actorRole: 'student',
        event: 'submission_created',
        targetEntity: 'Submission',
        targetId: crypto.randomUUID(),
        details: { revision: 1 },
      });

      // Different department audit entry (should NOT be visible to admin)
      recordAudit(db, {
        departmentId: '99999999-9999-9999-9999-999999999999',
        actorId: 'someone-else',
        actorRole: 'admin',
        event: 'unrelated_event',
        targetEntity: 'Workflow',
        targetId: 'other-wf',
      });

      // Anonymous blocked (401)
      const anonRes = await request(app).get('/api/audit');
      expect(anonRes.status).toBe(401);

      // Student and Reviewer blocked (403)
      const studentRes = await request(app).get('/api/audit').set('Cookie', studentSession.cookie);
      expect(studentRes.status).toBe(403);

      const reviewerRes = await request(app).get('/api/audit').set('Cookie', reviewerSession.cookie);
      expect(reviewerRes.status).toBe(403);

      // Admin accesses scoped audit logs
      const adminRes = await request(app).get('/api/audit').set('Cookie', adminSession.cookie);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.total).toBe(2);
      expect(adminRes.body.items.length).toBe(2);
      expect(adminRes.body.items[0].departmentId).toBe(admin.departmentId);

      // Filter by event
      const filterRes = await request(app)
        .get('/api/audit?event=workflow_published')
        .set('Cookie', adminSession.cookie);
      expect(filterRes.status).toBe(200);
      expect(filterRes.body.total).toBe(1);
      expect(filterRes.body.items[0].event).toBe('workflow_published');
    });
  });

  describe('T-API-035: GET /api/workflows/:workflowId/report.csv', () => {
    it('exports CSV report and neutralizes VR-019 spreadsheet formula injection', async () => {
      const adminSession = await getSession(admin);
      const studentSession = await getSession(studentA);
      const wf = setupWorkflow();

      const [assign] = assignRepo.createAssignments(wf.id, [studentA.id]);

      // Student submission containing dangerous CSV formula injection payload
      subRepo.createDraft(wf.id, studentA.id, assign.id, {
        projectSummary: 'Autonomous Flight Control',
        budgetFormula: '=cmd|\' /C calc\'!A0', // Dangerous formula injection!
      });

      // Student blocked from downloading administrative report (403)
      const studentRes = await request(app)
        .get(`/api/workflows/${wf.id}/report.csv`)
        .set('Cookie', studentSession.cookie);
      expect(studentRes.status).toBe(403);

      // Admin exports CSV report
      const reportRes = await request(app)
        .get(`/api/workflows/${wf.id}/report.csv`)
        .set('Cookie', adminSession.cookie);

      expect(reportRes.status).toBe(200);
      expect(reportRes.headers['content-type']).toContain('text/csv');
      expect(reportRes.headers['content-disposition']).toContain('report.csv');
      expect(reportRes.headers['x-content-type-options']).toBe('nosniff');

      const csvText = reportRes.text;
      // Headers check
      expect(csvText).toContain('Submission ID,Student Name,Student Email,Status');
      expect(csvText).toContain('Project Summary');
      expect(csvText).toContain('Budget Details');

      // Invariant VR-019 check: Dangerous formula is neutralized with leading single quote `'`
      expect(csvText).toContain("'=cmd|' /C calc'!A0");
      // Must NOT contain bare unescaped `=cmd`
      expect(csvText).not.toMatch(/,=cmd/);
    });
  });

  describe('T-API-040: GET /api/healthz', () => {
    it('returns public health check status without secret leakage', async () => {
      const res1 = await request(app).get('/healthz');
      expect(res1.status).toBe(200);
      expect(res1.body).toEqual({ status: 'ok' });

      const res2 = await request(app).get('/api/healthz');
      expect(res2.status).toBe(200);
      expect(res2.body).toEqual({ status: 'ok' });
    });
  });
});
