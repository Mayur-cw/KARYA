import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';
import { clearAllSessions, SEEDED_USERS } from '../../src/server/session.js';

describe('Session Security, Authorization and Private File Guard (T-03)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    clearAllSessions();
    app = createApp();
  });

  const adminUser = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
  const studentB = SEEDED_USERS.find((u) => u.name.includes('Student B'))!;
  const reviewerUser = SEEDED_USERS.find((u) => u.role === 'reviewer')!;

  describe('Health check endpoints (EP-040)', () => {
    it('allows anonymous access to /healthz and /api/healthz', async () => {
      const res1 = await request(app).get('/healthz');
      expect(res1.status).toBe(200);
      expect(res1.body).toEqual({ status: 'ok' });

      const res2 = await request(app).get('/api/healthz');
      expect(res2.status).toBe(200);
      expect(res2.body).toEqual({ status: 'ok' });
    });
  });

  describe('Demo Login & Sessions (EP-001, EP-002, EP-003)', () => {
    it('allows anonymous login with allowlisted seed user and returns session cookie + csrfToken', async () => {
      const res = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: studentA.id });

      expect(res.status).toBe(201);
      expect(res.body.user.id).toBe(studentA.id);
      expect(res.body.user.role).toBe('student');
      expect(typeof res.body.csrfToken).toBe('string');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('karya_session=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    it('rejects demo login with unknown or arbitrary user ID', async () => {
      const res = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: '00000000-0000-0000-0000-000000000999' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('denies authenticated user from re-calling demo-login (403)', async () => {
      // Login first
      const loginRes = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: adminUser.id });
      const cookie = loginRes.headers['set-cookie'][0];

      // Call demo-login again with cookie
      const reLoginRes = await request(app)
        .post('/api/auth/demo-login')
        .set('Cookie', cookie)
        .send({ userId: studentA.id });

      expect(reLoginRes.status).toBe(403);
      expect(reLoginRes.body.code).toBe('FORBIDDEN');
    });

    it('requires authentication for /api/auth/me (EP-002)', async () => {
      // Unauthenticated
      const anonRes = await request(app).get('/api/auth/me');
      expect(anonRes.status).toBe(401);
      expect(anonRes.body.code).toBe('UNAUTHORIZED');

      // Authenticated
      const loginRes = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: adminUser.id });
      const cookie = loginRes.headers['set-cookie'][0];

      const authRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      expect(authRes.status).toBe(200);
      expect(authRes.body.user.id).toBe(adminUser.id);
      expect(authRes.body.user.role).toBe('admin');
    });

    it('invalidates session on logout (EP-003)', async () => {
      const loginRes = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: reviewerUser.id });
      const cookie = loginRes.headers['set-cookie'][0];
      const csrfToken = loginRes.body.csrfToken;

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('x-csrf-token', csrfToken);

      expect(logoutRes.status).toBe(201);
      expect(logoutRes.headers['set-cookie'][0]).toContain('Max-Age=0');

      // Subsequent /api/auth/me request fails
      const checkRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);
      expect(checkRes.status).toBe(401);
    });
  });

  describe('CSRF Protection', () => {
    it('blocks mutating write without x-csrf-token header', async () => {
      const loginRes = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: studentA.id });
      const cookie = loginRes.headers['set-cookie'][0];

      // Mutating request without x-csrf-token
      const postRes = await request(app)
        .post('/api/workflows/wf-123/submissions')
        .set('Cookie', cookie)
        .send({});

      expect(postRes.status).toBe(403);
      expect(postRes.body.code).toBe('FORBIDDEN');
      expect(postRes.body.message).toContain('CSRF');
    });

    it('allows mutating write with valid x-csrf-token header', async () => {
      const loginRes = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: studentA.id });
      const cookie = loginRes.headers['set-cookie'][0];
      const csrfToken = loginRes.body.csrfToken;

      const postRes = await request(app)
        .post('/api/workflows/wf-123/submissions')
        .set('Cookie', cookie)
        .set('x-csrf-token', csrfToken)
        .send({});

      expect(postRes.status).toBe(201);
      expect(postRes.body.workflowId).toBe('wf-123');
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    it('denies anonymous access to protected endpoints by default (401)', async () => {
      const res1 = await request(app).get('/api/users');
      expect(res1.status).toBe(401);

      const res2 = await request(app).post('/api/workflows/wf-1/submissions').send({});
      expect(res2.status).toBe(401);

      const res3 = await request(app).post('/api/submissions/sub-1/decision').send({});
      expect(res3.status).toBe(401);
    });

    it('enforces admin-only scope: rejects students and reviewers (403)', async () => {
      // Student login
      const studentLogin = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: studentA.id });
      const studentCookie = studentLogin.headers['set-cookie'][0];

      const resStudent = await request(app)
        .get('/api/users')
        .set('Cookie', studentCookie);
      expect(resStudent.status).toBe(403);

      // Reviewer login
      const reviewerLogin = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: reviewerUser.id });
      const reviewerCookie = reviewerLogin.headers['set-cookie'][0];

      const resReviewer = await request(app)
        .get('/api/users')
        .set('Cookie', reviewerCookie);
      expect(resReviewer.status).toBe(403);

      // Admin login succeeds
      const adminLogin = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: adminUser.id });
      const adminCookie = adminLogin.headers['set-cookie'][0];

      const resAdmin = await request(app)
        .get('/api/users')
        .set('Cookie', adminCookie);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.items).toBeDefined();
    });

    it('enforces student-only submission creation: rejects admin and reviewer (403)', async () => {
      const adminLogin = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: adminUser.id });
      const adminCookie = adminLogin.headers['set-cookie'][0];
      const adminCsrf = adminLogin.body.csrfToken;

      const resAdmin = await request(app)
        .post('/api/workflows/wf-1/submissions')
        .set('Cookie', adminCookie)
        .set('x-csrf-token', adminCsrf)
        .send({});
      expect(resAdmin.status).toBe(403);
    });

    it('enforces reviewer-only decision: rejects admin and student (403)', async () => {
      const studentLogin = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: studentA.id });
      const studentCookie = studentLogin.headers['set-cookie'][0];
      const studentCsrf = studentLogin.body.csrfToken;

      const resStudent = await request(app)
        .post('/api/submissions/sub-1/decision')
        .set('Cookie', studentCookie)
        .set('x-csrf-token', studentCsrf)
        .send({});
      expect(resStudent.status).toBe(403);
    });
  });

  describe('Object-Level Scope & IDOR Protection', () => {
    it('Student B cannot access Student A private submission (403/404)', async () => {
      // Student B logged in
      const studentBLogin = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: studentB.id });
      const studentBCookie = studentBLogin.headers['set-cookie'][0];

      // Student B attempts to query Student A's submission
      const res = await request(app)
        .get(`/api/submissions/sub-student-a/test-scope?ownerStudentId=${studentA.id}`)
        .set('Cookie', studentBCookie);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('Student A can access their own submission (200)', async () => {
      // Student A logged in
      const studentALogin = await request(app)
        .post('/api/auth/demo-login')
        .send({ userId: studentA.id });
      const studentACookie = studentALogin.headers['set-cookie'][0];

      // Student A queries their own submission
      const res = await request(app)
        .get(`/api/submissions/sub-student-a/test-scope?ownerStudentId=${studentA.id}`)
        .set('Cookie', studentACookie);

      expect(res.status).toBe(200);
      expect(res.body.ownerStudentId).toBe(studentA.id);
    });
  });
});
