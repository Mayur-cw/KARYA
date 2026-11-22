import process from 'node:process';

// Enforce optimized client output even when a developer's .env selects development.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build({ mode: 'production' });
