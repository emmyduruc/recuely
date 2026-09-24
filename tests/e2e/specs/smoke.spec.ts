import { expect, test } from '@playwright/test';
import { HealthStatus } from '@repo/contracts';

declare global {
  interface Window {
    getUserMediaCalls: number;
  }
}

test('T0: home page loads without requesting camera or microphone', async ({ page }) => {
  await page.addInitScript(() => {
    window.getUserMediaCalls = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints?: MediaStreamConstraints) => {
      window.getUserMediaCalls += 1;
      return original(constraints);
    };
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => window.getUserMediaCalls)).toBe(0);
});

test('T1: health endpoint responds and reports the database status', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBe(true);
  const health: unknown = await response.json();
  expect(health).toMatchObject({ app: HealthStatus.Ok });
  expect(Object.values(HealthStatus)).toContain((health as { db: unknown }).db);
});
