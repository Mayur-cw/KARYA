import type { RequestHandler } from 'express';
export type Principal = { id: string; role: string; scope?: string };
// T-03 replaces the stub with verified, signed server-side sessions and object ownership checks.
export function requireRoles(...roles: string[]): RequestHandler {
 return (req,res,next) => {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) {res.status(401).json({code:'UNAUTHORIZED',message:'Sign in required'});return;}
  if (!roles.includes(principal.role)) {res.status(403).json({code:'FORBIDDEN',message:'Not permitted'});return;}
  next();
 };
}
