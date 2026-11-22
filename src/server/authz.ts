import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Role, UserPublic } from '../shared/contracts.js';
import { parseCookies, SESSION_COOKIE_NAME } from './security.js';
import { getSessionByToken } from './session.js';
import { getDb, UserRepository } from './repository.js';

export type Principal = UserPublic;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      principal?: Principal;
      session?: import('./session.js').Session;
    }
  }
}

/**
 * Authentication middleware: extract session token from cookie or Authorization header.
 * Attaches verified Principal and Session to res.locals.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  let sessionToken = cookies[SESSION_COOKIE_NAME];

  if (!sessionToken && req.headers.authorization?.startsWith('Bearer ')) {
    sessionToken = req.headers.authorization.slice(7).trim();
  }

  if (sessionToken) {
    const verified = getSessionByToken(sessionToken);
    if (verified) {
      let user: UserPublic = verified.user;
      try {
        const dbUser = new UserRepository(getDb()).getById(verified.user.id);
        if (dbUser) user = dbUser;
      } catch {
        // fallback to in-memory verified user
      }
      if (user?.active) {
        res.locals.principal = user;
        res.locals.session = verified.session;
      }
    }
  }

  next();
}

/**
 * Enforce authenticated session. Rejects anonymous access with 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.principal) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in.',
    });
    return;
  }
  next();
}

/**
 * Enforce role-based access. Denies unauthorized roles with 403.
 */
export function requireRoles(...roles: Role[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const principal = res.locals.principal;
    if (!principal) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
      return;
    }

    if (!roles.includes(principal.role)) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: `Forbidden: role '${principal.role}' cannot access this resource.`,
      });
      return;
    }

    next();
  };
}

/**
 * For EP-001 POST /api/auth/demo-login:
 * Only anonymous may call this. Active authenticated roles receive 403.
 */
export function requireAnonymous(req: Request, res: Response, next: NextFunction): void {
  if (res.locals.principal) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Already authenticated. Please log out before starting a new session.',
    });
    return;
  }
  next();
}

/**
 * Object-level scope guards (IDOR prevention)
 */
export function checkDepartment(principal: Principal, departmentId: string): boolean {
  return principal.departmentId === departmentId;
}

export function checkStudentOwnership(principal: Principal, ownerStudentId: string): boolean {
  if (principal.role !== 'student') return false;
  return principal.id === ownerStudentId;
}

export function checkReviewerAssignment(principal: Principal, assignedReviewerId: string): boolean {
  if (principal.role !== 'reviewer') return false;
  return principal.id === assignedReviewerId;
}

export function denyPrivateObject(res: Response): void {
  res.status(403).json({
    code: 'FORBIDDEN',
    message: 'Access denied: private object outside permitted scope.',
  });
}
