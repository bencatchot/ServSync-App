import { expect, test } from '@playwright/test';

const path = '/portal-switch-preview.html';
test('switching clears work in progress and refresh restores only the portal', async ({ page }) => {
  const unexpected: string[] = [];
  page.on('request', req => {
    if (req.method() !== 'GET' || ['fetch', 'xhr', 'websocket'].includes(req.resourceType()) || new URL(req.url()).hostname !== '127.0.0.1') unexpected.push(req.url());
  });
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Willow Cottage' })).toBeVisible();
  await page.getByLabel('Home project', { exact: true }).selectOption('Kitchen faucet repair');
  await page.getByLabel('Personal project note').fill('fictional kitchen note');
  await page.getByRole('button', { name: 'Switch to Contractor' }).click();
  await expect(page.getByRole('heading', { name: 'Heron Home Services' })).toBeVisible();
  await expect(page.getByLabel('Personal project note')).toHaveCount(0);
  await page.getByLabel('Customer job').selectOption('Deck repair estimate');
  await page.getByLabel('Job draft note').fill('fictional job note');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Contractor portal' })).toBeVisible();
  await expect(page.getByLabel('Customer job')).toHaveValue('');
  await expect(page.getByLabel('Job draft note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to Homeowner' }).click();
  await expect(page.getByLabel('Home project', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Personal project note')).toHaveCount(0);
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([['servsync.fictional-portal-preview.v1.dual.portal', 'Homeowner']]);
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('single-role examples never inherit the other account’s choices', async ({ page }) => {
  await page.goto(path);
  await page.getByRole('button', { name: 'Switch to Contractor' }).click();
  await page.getByLabel('Example account').selectOption('homeowner');
  await expect(page.getByRole('heading', { name: 'Maple House' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('servsync.fictional-portal-preview.v1.homeowner.portal', 'Contractor'));
  await page.goto(path + '?example=homeowner&portal=Contractor#/contractor');
  await expect(page.getByRole('heading', { name: 'Homeowner portal' })).toBeVisible();
  await expect(page.getByLabel('Customer job')).toHaveCount(0);
  await page.getByLabel('Example account').selectOption('contractor');
  await expect(page.getByRole('heading', { name: 'Cedar Creek Repairs' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cedar Creek Repairs' })).toBeVisible();
  await page.getByLabel('Example account').selectOption('dual');
  await expect(page.getByRole('heading', { name: 'Heron Home Services' })).toBeVisible();
});

test('the standalone page blocks backend requests and ignores real-session state', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('servsync.homeowner.selectedHome', 'private-home-sentinel');
    localStorage.setItem('servsync.contractor.selectedHomeowner', 'private-client-sentinel');
  });
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Homeowner portal' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('private-home-sentinel');
  const result = await page.evaluate(async () => {
    const violation = new Promise<string>(resolve => document.addEventListener('securitypolicyviolation', event => resolve(event.effectiveDirective), { once: true }));
    await fetch('/api/fixture-isolation-check').catch(() => {});
    return violation;
  });
  expect(result).toBe('connect-src');
  expect(await page.evaluate(() => localStorage.getItem('servsync.contractor.selectedHomeowner'))).toBe('private-client-sentinel');
});

test('the compiled preview refuses an unrelated host even with a fixture URL', async ({ page, request, baseURL }) => {
  // Serve the same local build bytes under an unrelated origin without external traffic.
  await page.route('https://other.invalid/**', async route => {
    const file = new URL(route.request().url()).pathname;
    await route.fulfill({ response: await request.get(new URL(file, baseURL).href) });
  });
  await page.goto('https://other.invalid' + path + '?example=dual');
  await page.waitForLoadState('load');
  await expect(page.getByText('Preview unavailable.')).toBeVisible();
  await expect(page.getByLabel('Example account')).toHaveCount(0);
});
