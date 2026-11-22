import { z } from 'zod';
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  SESSION_SECRET: z.string().default(''),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  DEMO_SEED: z.enum(['true', 'false']).optional(),
  DEMO_ACCESS_PASSWORD: z.string().default(''),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).optional(),
});
export function getConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid environment keys: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  const config = parsed.data;
  if (config.NODE_ENV === 'production' && config.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be configured in production');
  if (config.DEMO_ACCESS_PASSWORD && config.DEMO_ACCESS_PASSWORD.length < 16) throw new Error('DEMO_ACCESS_PASSWORD must contain at least 16 characters');
  const origins = config.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins');
  }
  return { ...config, TRUST_PROXY_HOPS: config.TRUST_PROXY_HOPS ?? (env.RENDER === 'true' ? 1 : 0) };
}
