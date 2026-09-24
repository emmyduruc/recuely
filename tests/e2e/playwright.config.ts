import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './specs',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${String(PORT)}` },
  webServer: {
    command: 'node ../../apps/web/.output/server/index.mjs',
    env: { PORT: String(PORT) },
    url: `http://localhost:${String(PORT)}/api/health`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
