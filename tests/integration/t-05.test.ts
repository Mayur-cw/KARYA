import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';
import { clearAllSessions, SEEDED_USERS, SEEDED_DEPARTMENT_ID } from '../../src/server/session.js';
import { initDatabase, WorkflowRepository } from '../../src/server/repository.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-05 — Private Source Extraction and AI Proposal Adapter', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const student = SEEDED_USERS.find((u) => u.role === 'student')!;
  const reviewer = SEEDED_USERS.find((u) => u.role === 'reviewer')!;

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

  describe('T-API-008: POST /api/documents', () => {
    it('enforces RBAC: denies anonymous (401), student (403), reviewer (403)', async () => {
      const anonRes = await request(app).post('/api/documents').send({ title: 'Test', content: 'Sample' });
      expect(anonRes.status).toBe(401);

      const studentSession = await getSession(student);
      const studentRes = await request(app)
        .post('/api/documents')
        .set('Cookie', studentSession.cookie)
        .set('x-csrf-token', studentSession.csrfToken)
        .send({ title: 'Test', content: 'Sample' });
      expect(studentRes.status).toBe(403);

      const reviewerSession = await getSession(reviewer);
      const reviewerRes = await request(app)
        .post('/api/documents')
        .set('Cookie', reviewerSession.cookie)
        .set('x-csrf-token', reviewerSession.csrfToken)
        .send({ title: 'Test', content: 'Sample' });
      expect(reviewerRes.status).toBe(403);
    });

    it('allows admin upload, extracts text and page offsets, computes sha256', async () => {
      const adminSession = await getSession(admin);
      const sampleText = 'Department Internship Circular 2026. Submission deadline will be announced separately.';

      const res = await request(app)
        .post('/api/documents')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Internship Notice', content: sampleText, mime: 'text/plain' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Internship Notice');
      expect(res.body.mime).toBe('text/plain');
      expect(res.body.sha256).toHaveLength(64);
      expect(res.body.extractedLength).toBe(sampleText.length);
      expect(res.body.status).toBe('uploaded');
    });

    it('rejects empty document content (400)', async () => {
      const adminSession = await getSession(admin);
      const res = await request(app)
        .post('/api/documents')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Empty Doc', content: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });
  });

  describe('T-API-009: GET /api/documents/:documentId', () => {
    it('enforces RBAC and returns full extracted text to admin', async () => {
      const adminSession = await getSession(admin);
      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Circular A', content: 'Full text of circular.', mime: 'text/plain' });
      const docId = uploadRes.body.id;

      // Student attempt
      const studentSession = await getSession(student);
      const studentRes = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Cookie', studentSession.cookie);
      expect(studentRes.status).toBe(403);

      // Admin fetch
      const adminRes = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Cookie', adminSession.cookie);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.extractedText).toBe('Full text of circular.');
      expect(adminRes.body.pageOffsets).toBeDefined();
    });

    it('returns 404 for unknown document ID', async () => {
      const adminSession = await getSession(admin);
      const res = await request(app)
        .get('/api/documents/00000000-0000-0000-0000-000000000000')
        .set('Cookie', adminSession.cookie);
      expect(res.status).toBe(404);
    });
  });

  describe('T-API-010: PATCH /api/documents/:documentId', () => {
    it('renames document with validation and logs audit', async () => {
      const adminSession = await getSession(admin);
      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Original Name', content: 'Text', mime: 'text/plain' });
      const docId = uploadRes.body.id;

      // Invalid title
      const badRes = await request(app)
        .patch(`/api/documents/${docId}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: '' });
      expect(badRes.status).toBe(400);

      // Valid rename
      const patchRes = await request(app)
        .patch(`/api/documents/${docId}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Revised Circular 2026' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.title).toBe('Revised Circular 2026');
    });
  });

  describe('T-API-011: DELETE /api/documents/:documentId', () => {
    it('soft-deletes unreferenced document', async () => {
      const adminSession = await getSession(admin);
      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Draft Doc', content: 'Text', mime: 'text/plain' });
      const docId = uploadRes.body.id;

      const delRes = await request(app)
        .delete(`/api/documents/${docId}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken);
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);

      // Subsequent get returns 404
      const getRes = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Cookie', adminSession.cookie);
      expect(getRes.status).toBe(404);
    });

    it('blocks deletion (409 Conflict) if referenced by an active published workflow', async () => {
      const adminSession = await getSession(admin);
      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Published Doc', content: 'Content', mime: 'text/plain' });
      const docId = uploadRes.body.id;

      // Create published workflow referencing this doc
      const wfRepo = new WorkflowRepository(db);
      const wf: Workflow = {
        id: 'wf-locked-1',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Published Internship Workflow',
        sourceId: docId,
        status: 'published',
        origin: 'manual',
        fields: [{ key: 'f1', label: 'Field 1', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'Mentor', reviewerId: reviewer.id }],
        uncertainties: [],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      const delRes = await request(app)
        .delete(`/api/documents/${docId}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken);
      expect(delRes.status).toBe(409);
      expect(delRes.body.code).toBe('CONFLICT');
      expect(delRes.body.message).toContain('Publication lock');
    });
  });

  describe('T-API-016: POST /api/workflows/:workflowId/propose', () => {
    it('generates structured proposal from circular text with uncertainties and source citations', async () => {
      const adminSession = await getSession(admin);

      // 1. Upload circular
      const circularText = `Department Internship Documentation 2026: Eligible final-year internship applicants must provide their name, student ID, internship organization, internship start date, offer letter (PDF), and mentor acknowledgement. Submission deadline will be announced separately. Faculty mentor verifies that the offer letter and enrollment details are complete. After mentor verification, the designated department approving authority provides final approval. If supporting documents are missing, the faculty mentor returns the application for corrections with an explanation.`;

      const uploadRes = await request(app)
        .post('/api/documents')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ title: 'Internship Circular 2026', content: circularText, mime: 'text/plain' });
      const docId = uploadRes.body.id;

      // 2. Create draft workflow
      const wfRepo = new WorkflowRepository(db);
      const wf: Workflow = {
        id: 'wf-propose-1',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Internship Circular 2026',
        sourceId: docId,
        status: 'draft',
        origin: 'not_proposed',
        fields: [],
        stages: [],
        uncertainties: [],
        deadline: null,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      // 3. Request proposal
      const proposeRes = await request(app)
        .post(`/api/workflows/${wf.id}/propose`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ expectedVersion: 1 });

      expect(proposeRes.status).toBe(200);
      expect(proposeRes.body.status).toBe('proposed');
      expect(proposeRes.body.origin).toBe('manual');
      expect(proposeRes.body.version).toBe(2);
      expect(proposeRes.body.fields.length).toBeGreaterThanOrEqual(4);
      expect(proposeRes.body.stages.length).toBe(2);
      expect(proposeRes.body.uncertainties.length).toBeGreaterThan(0);
      // Deadline missing is correctly flagged
      expect(proposeRes.body.uncertainties.some((u: { kind: string }) => u.kind === 'deadline')).toBe(true);
      expect(proposeRes.body.deadline).toBeNull();
      expect(proposeRes.body.confidenceNotes).toBeDefined();
    });

    it('rejects proposal generation on version mismatch (409 Conflict)', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);
      const wf: Workflow = {
        id: 'wf-propose-conflict',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Conflict Workflow',
        status: 'draft',
        origin: 'not_proposed',
        fields: [],
        stages: [],
        uncertainties: [],
        deadline: null,
        version: 2,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      const res = await request(app)
        .post(`/api/workflows/${wf.id}/propose`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ expectedVersion: 1 }); // Stale version 1 when DB is 2

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
    });
  });
});
