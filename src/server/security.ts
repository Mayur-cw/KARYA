import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

export const SESSION_COOKIE_NAME = 'karya_session';

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx !== -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function setSessionCookie(res: Response, sessionToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieValue = `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax${
    isProd ? '; Secure' : ''
  }; Max-Age=86400`;
  res.setHeader('Set-Cookie', cookieValue);
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieValue = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${
    isProd ? '; Secure' : ''
  }; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  res.setHeader('Set-Cookie', cookieValue);
}

/**
 * CSRF Protection Middleware
 * Requires state-changing requests using cookie authentication to supply valid x-csrf-token header.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    next();
    return;
  }

  // Exempt public demo login
  if (req.path === '/api/auth/demo-login') {
    next();
    return;
  }

  const session = res.locals.session;
  if (!session) {
    // If not authenticated via session, authentication middleware handles 401
    next();
    return;
  }

  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Invalid or missing CSRF token',
    });
    return;
  }

  next();
}

/**
 * Rate limiters configured according to contracts/api.json
 * Relaxed during NODE_ENV==='test' to permit high-speed automated integration test runs
 */
const isTest = process.env.NODE_ENV === 'test';

export const loginRateLimiter: RequestHandler = isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please retry later.' },
    });

export const aiRateLimiter: RequestHandler = isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 3,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', message: 'AI proposal limit reached. Please wait a moment.' },
    });

export const uploadRateLimiter: RequestHandler = isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', message: 'Upload rate limit reached.' },
    });

export const writeRateLimiter: RequestHandler = isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', message: 'Write request limit reached.' },
    });

export const readRateLimiter: RequestHandler = isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'RATE_LIMITED', message: 'Read request limit reached.' },
    });
