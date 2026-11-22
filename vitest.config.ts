import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',globals:true,include:['tests/**/*.test.{ts,tsx}'],coverage:{provider:'v8',reporter:['text','json-summary'],thresholds:{lines:70,functions:70,branches:65,statements:70}}}});
