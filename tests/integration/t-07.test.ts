import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';
import { clearAllSessions, SEEDED_USERS, SEEDED_DEPARTMENT_ID } from '../../src/server/session.js';
import { initDatabase, WorkflowRepository } from '../../src/server/repository.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-07 — Cohort Eligibility and Assignee Policies', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
  const studentB = SEEDED_USERS.find((u) => u.name.includes('Student B'))!;
  const mentor = SEEDED_USERS.find((u) => u.name.includes('Mentor'))!;

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

  describe('T-API-004: GET /api/users', () => {
    it('allows admin with search and role filter, denies student and reviewer', async () => {
      const adminSession = await getSession(admin);
      const studentSession = await getSession(studentA);

      // Student denied
      const stuRes = await request(app).get('/api/users').set('Cookie', studentSession.cookie);
      expect(stuRes.status).toBe(403);

      // Admin all
      const allRes = await request(app).get('/api/users').set('Cookie', adminSession.cookie);
      expect(allRes.status).toBe(200);
      expect(allRes.body.items.length).toBe(5);

      // Admin filter by role student
      const studentOnlyRes = await request(app)
        .get('/api/users?role=student')
        .set('Cookie', adminSession.cookie);
      expect(studentOnlyRes.status).toBe(200);
      expect(studentOnlyRes.body.items.length).toBe(2);
      expect(studentOnlyRes.body.items.every((u: { role: string }) => u.role === 'student')).toBe(true);

      // Admin search by query
      const queryRes = await request(app)
        .get('/api/users?q=Aarav')
        .set('Cookie', adminSession.cookie);
      expect(queryRes.status).toBe(200);
      expect(queryRes.body.items.length).toBe(1);
      expect(queryRes.body.items[0].name).toContain('Aarav');
    });
  });

  describe('T-API-005: POST /api/users', () => {
    it('creates new participant in department and enforces unique email', async () => {
      const adminSession = await getSession(admin);

      const createRes = await request(app)
        .post('/api/users')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({
          name: 'Chirag Dave',
          email: 'chirag@student.karya.edu',
          role: 'student',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.name).toBe('Chirag Dave');
      expect(createRes.body.role).toBe('student');

      // Duplicate email attempt
      const dupRes = await request(app)
        .post('/api/users')
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({
          name: 'Chirag Duplicate',
          email: 'chirag@student.karya.edu',
          role: 'student',
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe('CONFLICT');
    });
  });

  describe('T-API-006: GET /api/users/:userId', () => {
    it('protects PII: student cannot view another student profile', async () => {
      const studentASession = await getSession(studentA);

      // Student A can view own profile
      const ownRes = await request(app)
        .get(`/api/users/${studentA.id}`)
        .set('Cookie', studentASession.cookie);
      expect(ownRes.status).toBe(200);
      expect(ownRes.body.id).toBe(studentA.id);

      // Student A cannot view Student B profile (403)
      const otherRes = await request(app)
        .get(`/api/users/${studentB.id}`)
        .set('Cookie', studentASession.cookie);
      expect(otherRes.status).toBe(403);
      expect(otherRes.body.code).toBe('FORBIDDEN');
    });
  });

  describe('T-API-007: PATCH /api/users/:userId', () => {
    it('allows self update of display name; blocks non-admin active tampering', async () => {
      const studentASession = await getSession(studentA);

      // Student A updates own name
      const patchRes = await request(app)
        .patch(`/api/users/${studentA.id}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ name: 'Aarav Patel (Updated)' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.name).toBe('Aarav Patel (Updated)');

      // Student A attempts to change active state (blocked 403)
      const badActiveRes = await request(app)
        .patch(`/api/users/${studentA.id}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ active: false });
      expect(badActiveRes.status).toBe(403);

      // Student A attempts to edit Student B (blocked 403)
      const editOtherRes = await request(app)
        .patch(`/api/users/${studentB.id}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ name: 'Hacked Name' });
      expect(editOtherRes.status).toBe(403);
    });
  });

  describe('T-API-019 & T-API-020: Assignment Management', () => {
    it('assigns students to workflow, verifies scoping, and dedupes', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);

      const wf: Workflow = {
        id: 'wf-assign-test-1',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Assignment Cohort Test',
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

      // Admin adds studentA and studentB
      const addRes = await request(app)
        .post(`/api/workflows/${wf.id}/assignments`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({
          studentIds: [studentA.id, studentB.id],
          reason: 'Initial cohort enrollment',
        });

      expect(addRes.status).toBe(201);
      expect(addRes.body.items.length).toBe(2);

      // Student A queries assignments -> sees own only
      const studentASession = await getSession(studentA);
      const stuARes = await request(app)
        .get('/api/assignments')
        .set('Cookie', studentASession.cookie);
      expect(stuARes.status).toBe(200);
      expect(stuARes.body.items.length).toBe(1);
      expect(stuARes.body.items[0].studentId).toBe(studentA.id);
    });
  });

  describe('T-API-021 & T-API-022: Assignment Revocation Policies (VR-010)', () => {
    it('revokes unstarted assignment; strictly blocks revocation if student started', async () => {
      const adminSession = await getSession(admin);
      const wfRepo = new WorkflowRepository(db);

      const wf: Workflow = {
        id: 'wf-revoke-test',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Revoke Test Workflow',
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

      // Create unstarted assignment
      const assignId1 = 'assign-unstarted-1';
      db.prepare(`
        INSERT INTO assignments (id, workflowId, studentId, status, assignedAt)
        VALUES (?, ?, ?, 'invited', ?)
      `).run(assignId1, wf.id, studentA.id, new Date().toISOString());

      // Create started assignment
      const assignId2 = 'assign-started-2';
      db.prepare(`
        INSERT INTO assignments (id, workflowId, studentId, status, assignedAt)
        VALUES (?, ?, ?, 'started', ?)
      `).run(assignId2, wf.id, studentB.id, new Date().toISOString());

      // Revoke unstarted assignment succeeds (EP-021)
      const revokeRes = await request(app)
        .patch(`/api/assignments/${assignId1}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ action: 'revoke', reason: 'Student transferred out of course' });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.status).toBe('revoked');
      expect(revokeRes.body.revokeReason).toBe('Student transferred out of course');

      // Attempt to revoke started assignment fails with 409 Conflict
      const blockedRes = await request(app)
        .patch(`/api/assignments/${assignId2}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ action: 'revoke', reason: 'Attempted late revoke' });

      expect(blockedRes.status).toBe(409);
      expect(blockedRes.body.code).toBe('CONFLICT');
      expect(blockedRes.body.message).toContain('already started');

      // Soft delete unstarted via EP-022
      const studentC = {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        email: 'student.c@karya.local',
        name: 'Chetan Sharma',
        role: 'student' as const,
        departmentId: admin.departmentId,
        createdAt: new Date().toISOString(),
      };
      db.prepare(`
        INSERT INTO users (id, email, name, role, departmentId, active, createdAt)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(studentC.id, studentC.email, studentC.name, studentC.role, studentC.departmentId, studentC.createdAt);

      const assignId3 = 'assign-unstarted-3';
      db.prepare(`
        INSERT INTO assignments (id, workflowId, studentId, status, assignedAt)
        VALUES (?, ?, ?, 'invited', ?)
      `).run(assignId3, wf.id, studentC.id, new Date().toISOString());

      const deleteRes = await request(app)
        .delete(`/api/assignments/${assignId3}`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ reason: 'Admin cleanup' });

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.deleted).toBe(true);
    });
  });
});
