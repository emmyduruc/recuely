import { mkdirSync, readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { BlockType, type ChunkPlanResource, KeyboardKey, type Script } from '@repo/contracts';

const E1_SOURCE = readFileSync(new URL('../../fixtures/scripts/e1-mixed.md', import.meta.url), 'utf8');
const SCREENSHOT_DIR = new URL('../../../docs/screenshots/task-12/', import.meta.url).pathname;
const WIDTHS = [360, 768, 1280, 1728] as const;
/** Tab presses allowed to reach an element; the page has far fewer stops before the chunks. */
const MAX_TABS = 60;
const CREATED = 201;

const normalize = (text: string): string => text.normalize('NFC').replace(/\s+/g, ' ').trim();

async function openImport(page: Page, title: string, source: string): Promise<void> {
  await page.goto('/import');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-project-title]').fill(title);
  await page.locator('[data-script-source]').fill(source);
  await expect(page.locator('[data-chunk-index]').first()).toBeVisible();
}

const chunkTexts = (page: Page): Promise<string[]> => page.locator('[data-chunk-text]').allTextContents();

function word(page: Page, chunkText: string, text: string): Locator {
  return page.locator('[data-chunk-index]', { has: page.locator('[data-chunk-text]', { hasText: chunkText }) }).locator('[data-word-offset]', { hasText: text }).first();
}

test('T12-E1: paste, mark spoken, move boundaries, save; wording is preserved exactly', async ({ page, request }) => {
  await openImport(page, 'E1 launch', E1_SOURCE);

  // Headings, notes, scene cue and table parts are typed; notes are never chunked.
  await expect(page.locator('[data-block-type]')).toHaveCount(17);
  await expect(page.locator(`[data-block-type="${BlockType.Spoken}"]`)).toHaveCount(7);
  await expect(page.locator('[data-coverage-ok]')).toBeVisible();
  expect(await chunkTexts(page)).toEqual([
    'Welcome back, everyone.',
    "Today we're launching something **new**.",
    "It's small, light, and fast.",
    'Dr. Smith designed it — with care.',
    'Here it is, finally.',
    "Let's open it together.",
    'First, charge it overnight.',
    'Then press the button.',
    'Thanks for watching.',
  ]);
  await expect(page.locator('[data-chunk-index="2"]')).toContainText('Scene: Scene 2: show the product screen');

  // Mark a note (a table cell) as spoken.
  const closeUp = page.locator('li', { has: page.locator('[data-block-text]', { hasText: 'Close-up of the box' }) });
  await closeUp.locator('[data-block-type-select]').selectOption(BlockType.Spoken);
  await expect(page.locator('[data-chunk-text]', { hasText: 'Close-up of the box' })).toHaveCount(1);

  // Split before "and" by clicking it.
  await word(page, "It's small, light, and fast.", 'and').click();
  expect(await chunkTexts(page)).toEqual(expect.arrayContaining(["It's small, light,", 'and fast.']));

  // Drag the boundary before "and fast." onto "light," to move it.
  const boundaryIndex = (await chunkTexts(page)).indexOf('and fast.');
  const handle = page.locator(`[data-boundary-index="${String(boundaryIndex)}"]`);
  const target = word(page, "It's small, light,", 'light,');
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (from === null || to === null) throw new Error('boundary or word not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await chunkTexts(page)).toEqual(expect.arrayContaining(["It's small,", 'light, and fast.']));

  // Merge across the paragraph break.
  const thanks = (await chunkTexts(page)).indexOf('Thanks for watching.');
  await page.locator(`[data-merge-index="${String(thanks)}"]`).click();
  const edited = await chunkTexts(page);
  expect(edited).toContain('Then press the button. Thanks for watching.');
  await expect(page.locator('[data-coverage-ok]')).toBeVisible();

  // Save; the server rebuilds every text from the paste and checks coverage again.
  const planResponse = page.waitForResponse((response) => response.url().endsWith('/chunk-plans') && response.status() === CREATED);
  await page.locator('[data-save-script]').click();
  const plan = (await (await planResponse).json()) as ChunkPlanResource;
  expect(plan.chunks.map((chunk) => chunk.text)).toEqual(edited);
  await expect(page).toHaveURL('/');
  await expect(page.locator('[data-project]', { hasText: 'E1 launch' })).toBeVisible();

  // Round trip: the saved plan covers exactly the spoken blocks' wording.
  const script = (await (await request.get(`/api/scripts/${plan.scriptId}`)).json()) as Script;
  const spoken = script.blocks.filter((block) => block.type === BlockType.Spoken).map((block) => block.text);
  expect(spoken).toContain('Close-up of the box');
  expect(normalize(plan.chunks.map((chunk) => chunk.text).join(' '))).toBe(normalize(spoken.join(' ')));
  for (const block of script.blocks) expect(E1_SOURCE.slice(block.source.start, block.source.end)).toBe(block.text);
});

test('T12: the table column picker switches which column is read', async ({ page }) => {
  await openImport(page, 'Table', E1_SOURCE);
  const picker = page.locator('[data-spoken-column]');
  await expect(picker).toHaveValue('2');
  await picker.selectOption({ label: 'Visual' });
  const texts = await chunkTexts(page);
  expect(texts).toEqual(expect.arrayContaining(['Close-up of the box', 'Hands open the box']));
  expect(texts).not.toContain('Here it is, finally.');
});

async function tabTo(page: Page, selector: string): Promise<void> {
  for (let i = 0; i < MAX_TABS; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

test('T12: boundaries can be edited with the keyboard only', async ({ page }) => {
  await page.goto('/import');
  await page.waitForLoadState('networkidle');
  await tabTo(page, '[data-project-title]');
  await page.keyboard.type('Keyboard only');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('One two three. Four five six. Seven eight.');
  await expect(page.locator('[data-chunk-index]')).toHaveCount(3);

  await tabTo(page, '[data-boundary-index="1"]');
  await page.keyboard.press(KeyboardKey.ArrowDown);
  expect(await chunkTexts(page)).toEqual(['One two three. Four', 'five six.', 'Seven eight.']);
  await expect(page.locator('[data-boundary-index="1"]')).toBeFocused();
  await page.keyboard.press(KeyboardKey.ArrowUp);
  await page.keyboard.press(KeyboardKey.ArrowUp);
  expect(await chunkTexts(page)).toEqual(['One two', 'three. Four five six.', 'Seven eight.']);

  // At the limit the plan stays unchanged and the reason is announced.
  await page.keyboard.press(KeyboardKey.ArrowUp);
  expect(await chunkTexts(page)).toEqual(['One', 'two three. Four five six.', 'Seven eight.']);
  await page.keyboard.press(KeyboardKey.ArrowUp);
  expect(await chunkTexts(page)).toEqual(['One', 'two three. Four five six.', 'Seven eight.']);
  await expect(page.locator('[data-edit-error]')).not.toBeEmpty();

  await page.keyboard.press(KeyboardKey.Delete);
  expect(await chunkTexts(page)).toEqual(['One two three. Four five six.', 'Seven eight.']);
  await expect(page.locator('[data-chunk-index="0"]')).toBeFocused();

  // Split mode on the focused chunk: Enter, move right twice, Enter.
  await page.keyboard.press(KeyboardKey.Enter);
  await page.keyboard.press(KeyboardKey.ArrowRight);
  await page.keyboard.press(KeyboardKey.ArrowRight);
  await expect(page.locator('[data-split-caret]')).toHaveText('Four');
  await page.keyboard.press(KeyboardKey.Enter);
  expect(await chunkTexts(page)).toEqual(['One two three.', 'Four five six.', 'Seven eight.']);
  await expect(page.locator('[data-coverage-ok]')).toBeVisible();

  // Escape leaves split mode without changing anything.
  await page.keyboard.press(KeyboardKey.Enter);
  await page.keyboard.press(KeyboardKey.Escape);
  await expect(page.locator('[data-split-caret]')).toHaveCount(0);
  expect(await chunkTexts(page)).toEqual(['One two three.', 'Four five six.', 'Seven eight.']);
});

test('T12: /import has no horizontal scroll from 320 px up; screenshots at 4 widths', async ({ page }) => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await openImport(page, 'Product launch', E1_SOURCE);
  for (const width of [320, ...WIDTHS]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${String(width)} px`).toBeLessThanOrEqual(0);
    if (width !== 320) await page.screenshot({ path: `${SCREENSHOT_DIR}import-${String(width)}.png`, fullPage: true });
  }
});
