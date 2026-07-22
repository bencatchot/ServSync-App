import { expect, test } from '@playwright/test';

test('synthetic-form-submit', async ({ page, baseURL }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(url.hostname);
  });

  await test.step('open-local-page', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'controlled ops local pilot' })).toBeVisible();
    expect(page.url().startsWith(baseURL ?? '')).toBe(true);
  });

  await test.step('enter-safe-value', async () => {
    await page.getByLabel('Safe input').fill('synthetic-value');
  });

  await test.step('confirm-success-state', async () => {
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('#result')).toHaveText('synthetic-success');
    expect(externalRequests).toEqual([]);
  });
});
