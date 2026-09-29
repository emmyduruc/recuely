import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT } from './global-setup.ts';

export default defineConfig({
  testDir: './specs',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // The built server runs against a per-run test schema (global-setup.ts), so tests need DATABASE_URL_TEST.
  globalSetup: './global-setup.ts',
  use: { baseURL: `http://127.0.0.1:${String(E2E_PORT)}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
