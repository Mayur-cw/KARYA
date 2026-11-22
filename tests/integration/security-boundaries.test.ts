import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { initDatabase, getDb } from '../../src/server/repository';
import { createApp } from '../../src/server/app';
import { getConfig } from '../../src/server/config';
import { pagination, workflowPage, submissionPage } from '../../src/server/queries';
import { SEEDED_USERS, createSession, getSessionByToken, hashToken, deleteSessionByToken, deleteSessionsByUserId, pruneExpiredSessions, registerCustomUser } from '../../src/server/session';
import { parseCookies, timingSafeTokenMatch } from '../../src/server/security';
import { groundRequirements } from '../../src/server/modules/private-source-extraction-ai-proposal-adapter';

describe('Configuration and session boundaries', () => {
  beforeEach(() => { initDatabase(':memory:'); });
  afterEach(() => { vi.unstubAllEnvs(); getDb().close(); });
  it.each([{ PORT: '0' }, { NODE_ENV: 'unknown' }, { NODE_ENV: 'production', SESSION_SECRET: '' }, { DEMO_ACCESS_PASSWORD: 'short' }, { ALLOWED_ORIGINS: 'https://example.com/path' }, { ALLOWED_ORIGINS: 'ftp://example.com' }, { ALLOWED_ORIGINS: 'https://user:pass@example.com' }])('rejects unsafe configuration %j', env => { expect(() => getConfig(env)).toThrow(); });
  it('trusts only a bounded explicit proxy count and exact origins', () => {
    expect(getConfig({ RENDER: 'true' }).TRUST_PROXY_HOPS).toBe(1);
    expect(getConfig({ RENDER: 'true', TRUST_PROXY_HOPS: '0' }).TRUST_PROXY_HOPS).toBe(0);
    expect(getConfig({ ALLOWED_ORIGINS: 'https://example.com, https://other.example.com' }).ALLOWED_ORIGINS).toContain('other');
  });
  it('clamps malformed and excessive pagination', () => {
    expect(pagination({ page: '-2', limit: '100000' })).toEqual({ page: 1, limit: 50, offset: 0 });
    expect(pagination({ page: 'NaN', limit: ['100'] })).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(pagination({ page: '100000000000', limit: '0' })).toEqual({ page: 1000000, limit: 1, offset: 999999 });
  });
  it('treats search as data for every role and supports empty pages', () => {
    for (const user of SEEDED_USERS) {
      expect(workflowPage(getDb(), user, { q: "' OR 1=1 --", status: 'published' }).items).toEqual([]);
      expect(submissionPage(getDb(), user, { q: 'Missing', workflowId: 'unknown', status: 'draft' }).total).toBe(0);
    }
  });
  it('expires, revokes, and touches persisted sessions', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-thirty-two-characters');
    const login = createSession(SEEDED_USERS[1]!);
    expect(hashToken(login.sessionToken)).toHaveLength(64);
    expect(getSessionByToken('invalid')).toBeNull(); expect(getSessionByToken('a'.repeat(64))).toBeNull();
    getDb().prepare('UPDATE sessions SET lastActiveAt = ?').run(Date.now() - 120000);
    expect(getSessionByToken(login.sessionToken)?.session.lastActiveAt).toBeGreaterThan(Date.now() - 1000);
    expect(deleteSessionByToken(login.sessionToken)).toBe(true); expect(deleteSessionByToken(login.sessionToken)).toBe(false);
    createSession(SEEDED_USERS[1]!); deleteSessionsByUserId(SEEDED_USERS[1]!.id);
    expect(getDb().prepare('SELECT COUNT(*) n FROM sessions').get()).toMatchObject({ n: 0 });
    createSession(SEEDED_USERS[1]!, -1); expect(pruneExpiredSessions()).toBe(1);
    registerCustomUser(SEEDED_USERS[1]!);
    expect(() => registerCustomUser({ ...SEEDED_USERS[1]!, id: crypto.randomUUID() })).toThrow();
  });
  it('decodes malformed cookies safely and rejects mismatched CSRF lengths', () => {
    expect(parseCookies()).toEqual({});
    expect(parseCookies('ignored; value=%E0%A4%A; good=hello%20world')).toMatchObject({ value: '%E0%A4%A', good: 'hello world' });
    expect(timingSafeTokenMatch('same', 'same')).toBe(true); expect(timingSafeTokenMatch('same', 'diff')).toBe(false); expect(timingSafeTokenMatch('same', 'same-prefix')).toBe(false);
  });
  it('grounds citations and marks absent evidence uncertain', () => {
    const grounded = groundRequirements([{ id: 'one', text: 'Apply', sourcePassage: 'must apply', uncertain: false }, { id: 'two', text: 'No evidence', uncertain: false }], 'Students must apply before review.');
    expect(grounded[0]?.uncertain).toBe(false); expect(grounded[0]?.startOffset).toBe(9); expect(grounded[1]?.uncertain).toBe(true);
  });
  it('requires session-bound CSRF for logout and rejects unknown identities', async () => {
    const app = createApp();
    expect((await request(app).post('/api/session').send({ userId: crypto.randomUUID() })).status).toBe(404);
    expect((await request(app).post('/api/session').send({})).status).toBe(400);
    const login = await request(app).post('/api/session').send({ userId: SEEDED_USERS[0]!.id });
    expect((await request(app).delete('/api/session').set('Cookie', login.headers['set-cookie'])).status).toBe(403);
    expect((await request(app).delete('/api/session').set('Cookie', login.headers['set-cookie']).set('x-csrf-token', login.body.csrfToken)).status).toBe(200);
    vi.stubEnv('DEMO_MODE', 'false');
    expect((await request(createApp()).post('/api/session').send({ userId: SEEDED_USERS[0]!.id })).status).toBe(403);
  });
});
