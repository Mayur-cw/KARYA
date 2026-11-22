import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist-server/server/migrations', { recursive: true });
cpSync('src/server/migrations', 'dist-server/server/migrations', { recursive: true });
