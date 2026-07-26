import { expect, test } from '@playwright/test';

/**
 * The zero-instruction family-beta flow (PLANNING.md §6.1):
 * pick distance → generate → see loops → tap one → export GPX (+ shuffle).
 * Tile CDN is blocked in tests so the blank-style fallback path is exercised —
 * no network flakiness, and route layers must still render on it.
 */

test.beforeEach(async ({ context }) => {
  await context.route('https://tiles.openfreemap.org/**', (route) => route.abort());
});

test('full flow: distance → generate → select → GPX → shuffle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Slinga' })).toBeVisible();

  // Geolocation is granted (mocked Stockholm) — the start note reflects it.
  await expect(page.getByTestId('start-note')).toBeVisible();

  await page.getByTestId('distance-chip-8000').click();
  await page.getByTestId('generate-btn').click();

  await expect(page.getByTestId('results-state')).toBeVisible({ timeout: 15_000 });
  const firstCard = page.getByTestId('candidate-card-0');
  await expect(firstCard).toBeVisible();
  // Distance shown is the actual route length near the 8 km target.
  await expect(firstCard).toContainText('km');

  // Tap the second card if present — selection moves.
  const secondCard = page.getByTestId('candidate-card-1');
  if (await secondCard.isVisible()) {
    await secondCard.click();
    await expect(secondCard).toHaveClass(/selected/);
  }

  // GPX export triggers a download (no navigator.share in headless Chromium).
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('gpx-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.gpx');

  // Shuffle re-generates with fresh seeds.
  await page.getByTestId('shuffle-btn').click();
  await expect(page.getByTestId('results-state')).toBeVisible({ timeout: 15_000 });

  await test.info().attach('results', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test.describe('geolocation denied', () => {
  test.use({ permissions: [] });

  test('falls back to the canonical Köpmangatan start with a note', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-note')).toContainText(/Köpmangatan|Gamla stan/i, {
      timeout: 10_000,
    });
    // The flow still works from the fallback start.
    await page.getByTestId('generate-btn').click();
    await expect(page.getByTestId('results-state')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Swedish locale', () => {
  test.use({ locale: 'sv-SE' });

  test('UI renders Swedish strings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('generate-btn')).toHaveText('Hitta rundor');
  });
});

test.describe('English locale', () => {
  test.use({ locale: 'en-US' });

  test('UI renders English strings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('generate-btn')).toHaveText('Find routes');
  });
});
