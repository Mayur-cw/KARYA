import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/server/app';
import { initDatabase, getDb, UserRepository, WorkflowRepository, SubmissionRepository } from '../../src/server/repository';
import { createSession, getSessionByToken, SEEDED_USERS } from '../../src/server/session';
import { seedPresentation, PRESENTATION_WORKFLOWS } from '../../src/server/presentation-seed';
import { refreshDueReminders } from '../../src/server/reminders';
import { groundRequirements, generateProposal } from '../../src/server/modules/private-source-extraction-ai-proposal-adapter';

const admin = SEEDED_USERS[0]!;
const student = SEEDED_USERS[1]!;
describe('Security and efficiency regression coverage', () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(path.join(os.tmpdir(), 'karya-security-')); vi.stubEnv('ATTACHMENT_STORAGE_DIR', directory); initDatabase(':memory:'); });
  afterEach(() => { vi.restoreAllMocks(); getDb().close(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
  const seed = () => seedPresentation(getDb(), { ...process.env, DEMO_MODE: 'true', DEMO_SEED: 'true' });
  it('denies inactive accounts and invalidates their existing sessions', async () => {
    const app = createApp();
    const login = await request(app).post('/api/session').send({ userId: student.id });
    new UserRepository(getDb()).update(student.id, { active: false });
    expect((await request(app).get('/api/workflows').set('Cookie', login.headers['set-cookie'])).status).toBe(401);
    expect((await request(app).post('/api/session').send({ userId: student.id })).status).toBe(404);
  });
  it('does not authenticate when account storage fails, and redacts internal errors', async () => {
    const app = createApp();
    vi.spyOn(UserRepository.prototype, 'getById').mockImplementation(() => { throw new Error('/private/database-secret-location.db'); });
    const result = await request(app).post('/api/session').send({ userId: student.id });
    expect(result.status).toBe(500);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('database-secret');
    expect(result.body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('allows exact CORS origins while rejecting an arbitrary hosted origin', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://presentation.example.com');
    const app = createApp();
    const allowed = await request(app).get('/api/session').set('Origin', 'https://presentation.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://presentation.example.com');
    const denied = await request(app).post('/api/session').set('Origin', 'https://attacker.vercel.app').send({ userId: admin.id });
    expect(denied.status).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('returns bounded, safe errors for malformed bodies and unknown endpoints', async () => {
    const app = createApp();
    expect((await request(app).post('/api/session').set('Content-Type', 'application/json').send('{bad-json')).status).toBe(400);
    expect((await request(app).get('/api/not-an-endpoint')).body).toMatchObject({ code: 'NOT_FOUND' });
    const login = await request(app).post('/api/session').send({ userId: admin.id });
    expect((await request(app).get('/api/workflows').set('Cookie', login.headers['set-cookie'])).headers['cache-control']).toBe('no-store');
  });
  it('keeps hashed sessions across database reopen and enforces expiration', () => {
    const file = path.join(directory, 'state.db');
    const first = initDatabase(file);
    const login = createSession(student);
    const stored = first.prepare('SELECT tokenHash FROM sessions').get() as { tokenHash: string };
    expect(stored.tokenHash).not.toBe(login.sessionToken);
    first.close();
    initDatabase(file);
    expect(getSessionByToken(login.sessionToken)?.user.id).toBe(student.id);
    const expired = createSession(student, -1);
    expect(getSessionByToken(expired.sessionToken)).toBeNull();
  });
  it('protects demo pages and APIs with an optional presentation access password', async () => {
    vi.stubEnv('DEMO_ACCESS_PASSWORD', 'a-private-presentation-passphrase');
    const app = createApp();
    expect((await request(app).get('/api/session')).status).toBe(401);
    expect((await request(app).get('/api/session').auth('presenter', 'wrong-password')).status).toBe(401);
    expect((await request(app).get('/api/session').auth('presenter', 'a-private-presentation-passphrase')).status).toBe(200);
    expect((await request(app).get('/healthz')).status).toBe(200);
  });
  it('blocks audit mutation and invalid publication recipients at the database boundary', () => {
    seed();
    expect(() => getDb().exec("UPDATE audit_logs SET event = 'overwritten'")).toThrow('append-only');
    expect(() => getDb().exec('DELETE FROM audit_logs')).toThrow('append-only');
    const repo = new WorkflowRepository(getDb());
    const draft = repo.getLatestVersion(PRESENTATION_WORKFLOWS[4].id)!;
    draft.deadline = new Date(Date.now() + 86400000).toISOString();
    draft.stages[1]!.reviewerId = SEEDED_USERS[4]!.id; draft.uncertainties = [];
    repo.updateVersioned(draft, draft.version);
    expect(repo.publishAtomic(draft.id, draft.version, [admin.id], { id: admin.id, role: admin.role, departmentId: admin.departmentId }).success).toBe(false);
  });
  it('paginates scoped queries and never exposes full source text to students', async () => {
    seed(); const app = createApp();
    const login = await request(app).post('/api/session').send({ userId: student.id });
    const cookie = login.headers['set-cookie'];
    const first = await request(app).get('/api/workflows?limit=2&page=1').set('Cookie', cookie);
    const second = await request(app).get('/api/workflows?limit=2&page=2').set('Cookie', cookie);
    expect(first.body.items).toHaveLength(2); expect(second.body.items).toHaveLength(2);
    expect(first.body.total).toBe(5);
    expect(first.body.items.some((a: { id: string }) => second.body.items.some((b: { id: string }) => b.id === a.id))).toBe(false);
    const detail = await request(app).get(`/api/workflows/${PRESENTATION_WORKFLOWS[0].id}`).set('Cookie', cookie);
    expect(detail.body.sourceDocument).toBeNull();
  });
  it('creates due reminders once per day without modifying submitted applications', () => {
    seed(); const db = getDb(); const repo = new WorkflowRepository(db);
    const workflow = repo.getLatestVersion(PRESENTATION_WORKFLOWS[0].id)!;
    workflow.deadline = new Date(Date.now() + 86400000).toISOString();
    repo.updateVersioned(workflow, workflow.version);
    refreshDueReminders(db, student); refreshDueReminders(db, student);
    const count = db.prepare("SELECT COUNT(*) count FROM notifications WHERE eventType = 'deadline_reminder' AND recipientId = ?").get(student.id) as { count: number };
    expect(count.count).toBe(1);
    expect(new SubmissionRepository(db).getByStudentAndWorkflow(student.id, workflow.id)).toBeNull();
  });
  it('flags invented source passages and creates manual requirements from actual text', async () => {
    expect(groundRequirements([{ id: 'r1', text: 'Invented requirement', sourcePassage: 'not in source', uncertain: false }], 'Actual instructions')[0]?.uncertain).toBe(true);
    const source = 'Applicants must provide their company name. Faculty will review each application.';
    const proposal = await generateProposal(source, 'Application review process');
    expect(proposal.origin).toBe('manual');
    for (const requirement of proposal.requirements) expect(source.slice(requirement.startOffset, requirement.endOffset)).toBe(requirement.sourcePassage);
  });
});
