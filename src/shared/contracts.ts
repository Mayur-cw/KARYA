import { z } from 'zod';
export const roleSchema = z.enum(['anonymous', 'user', 'admin']);
export type Role = z.infer<typeof roleSchema>;
export const errorSchema = z.object({ code: z.string(), message: z.string() });
export const healthSchema = z.object({ status: z.literal('ok') });
export const responseCode = { UNAUTHORIZED: 'UNAUTHORIZED', FORBIDDEN: 'FORBIDDEN', INVALID_INPUT: 'INVALID_INPUT' } as const;
