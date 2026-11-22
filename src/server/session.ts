import crypto from 'node:crypto';
import type { UserPublic } from '../shared/contracts.js';

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

// In-memory session store (can also query SQLite when repository is initialized)
const sessionsByHash = new Map<string, Session>();
const customUsers = new Map<string, UserPublic>();

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function findUserById(id: string): UserPublic | undefined {
  const seeded = SEEDED_USERS.find((u) => u.id === id);
  if (seeded) return seeded;
  return customUsers.get(id);
}

export function registerCustomUser(user: UserPublic): void {
  customUsers.set(user.id, user);
}

export function createSession(user: UserPublic, ttlMs = 24 * 60 * 60 * 1000): { sessionToken: string; csrfToken: string; session: Session } {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(sessionToken);
  const now = Date.now();

  const session: Session = {
    id: crypto.randomUUID(),
    tokenHash,
    userId: user.id,
    csrfToken,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + ttlMs,
  };

  sessionsByHash.set(tokenHash, session);
  return { sessionToken, csrfToken, session };
}

export function getSessionByToken(sessionToken: string): { session: Session; user: UserPublic } | null {
  if (!sessionToken) return null;
  const tokenHash = hashToken(sessionToken);
  const session = sessionsByHash.get(tokenHash);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessionsByHash.delete(tokenHash);
    return null;
  }

  const user = findUserById(session.userId);
  if (!user || !user.active) {
    sessionsByHash.delete(tokenHash);
    return null;
  }

  // Touch session
  session.lastActiveAt = Date.now();
  return { session, user };
}

export function deleteSessionByToken(sessionToken: string): boolean {
  if (!sessionToken) return false;
  const tokenHash = hashToken(sessionToken);
  return sessionsByHash.delete(tokenHash);
}

export function deleteSessionsByUserId(userId: string): void {
  for (const [hash, session] of sessionsByHash.entries()) {
    if (session.userId === userId) {
      sessionsByHash.delete(hash);
    }
  }
}

export function clearAllSessions(): void {
  sessionsByHash.clear();
  customUsers.clear();
}
