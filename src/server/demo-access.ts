import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

/** Optional outer access gate for a presentation link; application roles remain separate. */
export function demoAccess(password: string): RequestHandler {
  const expected = crypto.createHash('sha256').update(`presenter:${password}`).digest();
  return (req, res, next) => {
    if (!password || req.path === '/healthz' || req.path === '/api/healthz') { next(); return; }
    const header = req.get('authorization') || '';
    const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
    const candidate = crypto.createHash('sha256').update(supplied).digest();
    res.setHeader('Cache-Control', 'no-store');
    if (!crypto.timingSafeEqual(candidate, expected)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="KARYA presentation", charset="UTF-8"');
      res.status(401).json({ code: 'DEMO_ACCESS_REQUIRED', message: 'This presentation requires access credentials.' });
      return;
    }
    next();
  };
}
