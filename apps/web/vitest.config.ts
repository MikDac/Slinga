import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only — Playwright owns e2e/ (run via `playwright test`).
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    passWithNoTests: true,
  },
});
