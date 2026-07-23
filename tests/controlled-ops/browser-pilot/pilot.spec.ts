import { expect, test } from './controlled-ops-test';

test('synthetic-form-submit', async ({ page, baseURL }) => {
  await test.step('open-local-page', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'controlled ops local pilot' })).toBeVisible();
    expect(page.url().startsWith(baseURL ?? '')).toBe(true);
  });

  await test.step('enter-safe-value', async () => {
    await page.getByLabel('Safe input').fill('synthetic-value');
  });

  await test.step('confirm-success-state', async () => {
    await page.evaluate(() => console.log('controlled-ops-synthetic-console'));
    await expect.poll(() => page.evaluate(async () => (await fetch('/health')).ok)).toBe(true);
    await expect.poll(() => page.evaluate(async () => {
      const response = await fetch('/redirect', { redirect: 'follow' });
      return response.ok;
    })).toBe(true);
    await expect.poll(() => page.evaluate(async () => {
      const response = await fetch('/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'safe=synthetic-value',
      });
      return response.ok;
    })).toBe(true);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('#result')).toHaveText('synthetic-success');
    await page.evaluate(() => {
      setTimeout(() => { throw new Error('controlled-ops-synthetic-page-error'); }, 0);
    });
    await page.waitForTimeout(100);
  });
});
