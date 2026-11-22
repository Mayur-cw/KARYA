import crypto from 'node:crypto';
import type { UserPublic } from '../shared/contracts.js';
import { getDb, UserRepository } from './repository.js';

export interface Session {
  id: string;
  tokenHash: string;
  userId: string;
  csrfToken: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
}

export const SEEDED_DEPARTMENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

export const SEEDED_USERS: UserPublic[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    departmentId: SEEDED_DEPARTMENT_ID,
    name: 'Dr. Alok Verma (Administrator)',
    email: 'admin@karya.edu',
    role: 'admin',
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    departmentId: SEEDED_DEPARTMENT_ID,
    name: 'Aarav Patel (Student A)',
    email: 'aarav@student.karya.edu',
    role: 'student',
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    departmentId: SEEDED_DEPARTMENT_ID,
    name: 'Bhavya Singh (Student B)',
    email: 'bhavya@student.karya.edu',
    role: 'student',
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    departmentId: SEEDED_DEPARTMENT_ID,
    name: 'Prof. Priya Iyer (Faculty Mentor)',
    email: 'priya@faculty.karya.edu',
    role: 'reviewer',
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    departmentId: SEEDED_DEPARTMENT_ID,
    name: 'Dean R. K. Nair (Final Authority)',
    email: 'dean@karya.edu',
    role: 'reviewer',
    active: true,
    createdAt: '2026-11-22T08:00:00.000Z',
  },
];

// Tokens are stored only as SHA-256 digests in SQLite, shared with the app's data.
export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET;
  return secret ? crypto.createHmac('sha256', secret).update(token).digest('hex') : crypto.createHash('sha256').update(token).digest('hex');
}
export function findUserById(id: string): UserPublic | undefined {
  return new UserRepository(getDb()).getById(id) || undefined;
}
export function registerCustomUser(user: UserPublic): void {
  // User creation already persists the account in UserRepository.
  if (!new UserRepository(getDb()).getById(user.id)) throw new Error('Account must be persisted before use');
}
export function createSession(user: UserPublic, ttlMs = 24 * 60 * 60 * 1000): { sessionToken: string; csrfToken: string; session: Session } {
  const db = getDb();
  const current = new UserRepository(db).getById(user.id);
  if (!current?.active) throw new Error('Account is unavailable');
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(now);
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const session: Session = { id: crypto.randomUUID(), tokenHash: hashToken(sessionToken), userId: current.id, csrfToken, createdAt: now, lastActiveAt: now, expiresAt: now + ttlMs };
  db.prepare('INSERT INTO sessions (id, tokenHash, userId, csrfToken, createdAt, lastActiveAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)').run(session.id, session.tokenHash, session.userId, session.csrfToken, session.createdAt, session.lastActiveAt, session.expiresAt);
  return { sessionToken, csrfToken, session };
}
export function getSessionByToken(token: string): { session: Session; user: UserPublic } | null {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE tokenHash = ?').get(hashToken(token)) as unknown as Session | undefined;
  if (!row) return null;
  const now = Date.now();
  const user = new UserRepository(db).getById(row.userId);
  if (row.expiresAt <= now || !user?.active) { db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id); return null; }
  // Throttle idle-touch writes; expiration remains fixed and is checked on every request.
  if (now - row.lastActiveAt > 60000) { db.prepare('UPDATE sessions SET lastActiveAt = ? WHERE id = ?').run(now, row.id); row.lastActiveAt = now; }
  return { session: row, user };
}
export function deleteSessionByToken(token: string): boolean {
  return Number(getDb().prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hashToken(token)).changes) > 0;
}
export function deleteSessionsByUserId(userId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
}
export function clearAllSessions(): void { getDb().exec('DELETE FROM sessions'); }

export function pruneExpiredSessions(): number {
  return Number(getDb().prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(Date.now()).changes);
}
