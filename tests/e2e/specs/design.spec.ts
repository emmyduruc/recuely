import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CaptureState, DecisionAction, HighlightTier, SessionState } from '@repo/contracts';

const SCREENSHOT_DIR = new URL('../../../docs/screenshots/task-11/', import.meta.url).pathname;
const WIDTHS = [360, 768, 1280, 1728] as const;
const REPORTED_CONSOLE_TYPES = new Set(['error', 'warning']);

/** Collects console errors and warnings, which include missing i18n keys (§B11 runtime rule). */
function watchConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (REPORTED_CONSOLE_TYPES.has(message.type())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}

test('T11: shell and /_design render with zero missing-key warnings or console errors', async ({ page }) => {
  const messages = watchConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();
  await page.goto('/_design');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(messages).toEqual([]);
});

test('T11: every status shows an icon and text', async ({ page }) => {
  await page.goto('/_design');
  for (const state of Object.values(SessionState)) {
    const pill = page.locator(`[data-session-state="${state}"] [data-status-pill]`);
    await expect(pill.locator('[data-status-icon]')).toBeVisible();
    await expect(pill.locator('[data-status-label]')).not.toBeEmpty();
  }
  for (const state of Object.values(CaptureState)) {
    const indicator = page.locator(`[data-capture-state="${state}"]`);
    await expect(indicator.locator('[data-status-icon]')).toBeVisible();
    await expect(indicator.locator('[data-status-label]')).not.toBeEmpty();
  }
});

test('T11: the chunk tier has no word markers; word tiers do', async ({ page }) => {
  await page.goto('/_design');
  await expect(page.locator(`[data-demo-tier="${HighlightTier.Chunk}"] [data-word]`)).toHaveCount(0);
  for (const tier of [HighlightTier.WordProvider, HighlightTier.WordApprox]) {
    await expect(page.locator(`[data-demo-tier="${tier}"] [data-word-state="current"]`)).toHaveCount(1);
  }
});

test('T11: the decision bar reports the chosen action', async ({ page }) => {
  await page.goto('/_design');
  await page.locator(`[data-action="${DecisionAction.Retake}"]`).click();
  await expect(page.locator('[data-last-choice]')).toHaveText('Last choice: Retake');
});

test('T11: reduced motion makes transitions instant', async ({ browser }) => {
  const motion = await browser.newPage();
  await motion.goto('/_design');
  const indicator = motion.locator(`[data-capture-state="${CaptureState.Recording}"]`);
  expect(await indicator.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.2s');
  await motion.close();

  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto('/_design');
  const still = reduced.locator(`[data-capture-state="${CaptureState.Recording}"]`);
  expect(await still.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await still.locator('.motion-safe\\:animate-pulse').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await reduced.close();
});

test('T11: dark by default; the theme switch changes to light', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(darkBackground);
});

test('T11: /_design has no horizontal scroll from 320 px up; screenshots at 4 widths', async ({ page }) => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const width of [320, ...WIDTHS]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/_design');
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${String(width)} px`).toBeLessThanOrEqual(0);
    if (width !== 320) await page.screenshot({ path: `${SCREENSHOT_DIR}design-${String(width)}.png`, fullPage: true });
  }
});
