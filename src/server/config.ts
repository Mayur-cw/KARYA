import { z } from 'zod';
const schema = z.object({ PORT: z.coerce.number().int().min(1).max(65535).default(8080), NODE_ENV: z.enum(['development','production','test']).default('development'), ALLOWED_ORIGINS: z.string().default('http://localhost:5173'), SESSION_SECRET: z.string().default(''), DEMO_MODE: z.enum(['true','false']).default('false') });
export function getConfig(env: NodeJS.ProcessEnv = process.env) {
 const parsed = schema.safeParse(env);
 if (!parsed.success) throw new Error('Invalid environment keys: '+parsed.error.issues.map(x=>x.path.join('.')).join(', '));
 if (parsed.data.NODE_ENV === 'production' && parsed.data.SESSION_SECRET.length<32) throw new Error('SESSION_SECRET must be configured in production');
 return parsed.data;
}
