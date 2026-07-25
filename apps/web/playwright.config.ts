import { defineConfig } from '@playwright/test';

/**
 * E2E harness (PLANNING.md §8, 0.4): mobile-viewport Chromium against the locally
 * built web app + route API with the synthetic engine — no staging URL needed.
 * Real-device iPhone/WebKit coverage stays on the manual smoke checklist for now.
 *
 * Requires `pnpm build` first (route-api `start` and vite `preview` serve built output).
 * PW_CHROMIUM_PATH overrides the browser binary (pre-provisioned CI/container images).
 */

const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    // iPhone-class mobile emulation (Chromium engine; see note above).
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 59.3251, longitude: 18.0708 }, // Stockholm, mocked
    permissions: ['geolocation'],
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    {
      command: 'pnpm --filter @slinga/route-api start',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { ROUTING_ENGINE: 'synthetic', PORT: '3000' },
    },
    {
      command: 'pnpm --filter @slinga/web preview -- --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
