import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    env: { DEMO_MODE: 'true' },
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 },
    },
  },
});
