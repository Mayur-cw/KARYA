import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app';
import { initDatabase } from '../../src/server/repository';
import { clearAllSessions, SEEDED_USERS } from '../../src/server/session';
import { seedDatabase } from '../../src/server/seed';

const admin = SEEDED_USERS[0];
describe('Workspace integration regressions', () => {
  beforeEach(() => { clearAllSessions(); initDatabase(':memory:'); });
  it('disables both demo entry points and the account directory unless explicitly enabled', async () => {
    vi.stubEnv('DEMO_MODE', 'false');
    try {
      const app = createApp();
      for (const path of ['/api/auth/demo-login', '/api/session']) {
        expect((await request(app).post(path).send({ userId: admin.id })).status).toBe(403);
      }
      expect((await request(app).get('/api/auth/demo-users')).status).toBe(403);
      const session = await request(app).get('/api/session');
      expect(session.body).toMatchObject({ user: null, demoMode: false, demoActors: [] });
    } finally { vi.unstubAllEnvs(); }
  });
  it('requires CSRF to switch accounts or delete an active session', async () => {
    const app = createApp();
    const login = await request(app).post('/api/session').send({ userId: admin.id });
    const cookie = login.headers['set-cookie'];
    expect((await request(app).post('/api/session').set('Cookie', cookie).send({ userId: SEEDED_USERS[1].id })).status).toBe(403);
    expect((await request(app).delete('/api/session').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).delete('/api/session').set('Cookie', cookie).set('x-csrf-token', login.body.csrfToken)).status).toBe(200);
  });
  it('keeps saved profile names across session refresh and database seeding', async () => {
    const app = createApp();
    const login = await request(app).post('/api/session').send({ userId: admin.id });
    const cookie = login.headers['set-cookie'];
    const saved = await request(app).patch(`/api/users/${admin.id}`).set('Cookie', cookie).set('x-csrf-token', login.body.csrfToken).send({ name: 'Updated administrator' });
    expect(saved.status).toBe(200);
    const { getDb } = await import('../../src/server/repository');
    seedDatabase(getDb());
    const session = await request(app).get('/api/session').set('Cookie', cookie);
    expect(session.body.user.name).toBe('Updated administrator');
  });
  it('accepts a real PDF binary at the source upload endpoint', async () => {
    const app = createApp();
    const login = await request(app).post('/api/session').send({ userId: admin.id });
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 65 >>\nstream\nBT (Official internship requirements for November 2026) Tj ET\nendstream\nendobj\n%%EOF');
    const uploaded = await request(app).post('/api/documents').set('Cookie', login.headers['set-cookie']).set('x-csrf-token', login.body.csrfToken).set('Content-Type', 'application/pdf').set('x-document-title', 'Circular.pdf').send(pdf);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({ title: 'Circular.pdf', mime: 'application/pdf' });
    expect(uploaded.body.sha256).toHaveLength(64);
  });
  it('rejects a required file reference that is not attached to this application', async () => {
    const app = createApp();
    const login = await request(app).post('/api/session').send({ userId: admin.id });
    const cookie = login.headers['set-cookie'];
    const csrf = login.body.csrfToken;
    const draft = await request(app).post('/api/workflows').set('Cookie', cookie).set('x-csrf-token', csrf).send({ title: 'Verified attachment workflow' });
    const id = draft.body.id;
    const configured = await request(app).patch(`/api/workflows/${id}`).set('Cookie', cookie).set('x-csrf-token', csrf).send({ expectedVersion: draft.body.version, fields: [{ key: 'offer', label: 'Offer document', type: 'file', required: true }], stages: [{ stageIndex: 0, label: 'Faculty review', reviewerId: SEEDED_USERS[3].id }, { stageIndex: 1, label: 'Final approval', reviewerId: SEEDED_USERS[4].id }], uncertainties: [], deadline: new Date(Date.now() + 86400000).toISOString() });
    expect(configured.status).toBe(200);
    const published = await request(app).post(`/api/workflows/${id}/publish`).set('Cookie', cookie).set('x-csrf-token', csrf).send({ expectedVersion: configured.body.version, studentIds: [SEEDED_USERS[1].id] });
    expect(published.status).toBe(200);
    const student = await request(app).post('/api/session').send({ userId: SEEDED_USERS[1].id });
    const studentCookie = student.headers['set-cookie'];
    const studentCsrf = student.body.csrfToken;
    const submission = await request(app).post(`/api/workflows/${id}/submissions`).set('Cookie', studentCookie).set('x-csrf-token', studentCsrf).send({});
    const saved = await request(app).patch(`/api/submissions/${submission.body.id}`).set('Cookie', studentCookie).set('x-csrf-token', studentCsrf).send({ expectedVersion: submission.body.version, answers: { offer: 'a-document-from-another-application' } });
    const submitted = await request(app).post(`/api/submissions/${submission.body.id}/submit`).set('Cookie', studentCookie).set('x-csrf-token', studentCsrf).send({ expectedVersion: saved.body.version });
    expect(submitted.status).toBe(422);
    expect(submitted.body.errors).toContainEqual({ field: 'offer', message: 'Attach a valid document for "Offer document".' });
  });

});
