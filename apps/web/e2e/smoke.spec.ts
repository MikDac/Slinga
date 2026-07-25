import { expect, test } from '@playwright/test';

test('walking skeleton loads and reaches the API', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Slinga' })).toBeVisible();

  // The page pings /health through the preview proxy; synthetic engine answers.
  const status = page.getByTestId('api-status');
  await expect(status).toContainText('API: ok', { timeout: 10_000 });
  await expect(status).toContainText('synthetic');

  await testInfo.attach('smoke', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
