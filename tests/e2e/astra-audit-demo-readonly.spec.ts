import { expect, test } from '@playwright/test';
import { loginAs, openSidebarTab } from './helpers/auth';

// Authenticated Demo evidence only: no business-record saves, sends, or provider actions.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.skip(process.env.SERVSYNC_VALIDATION_TARGET !== 'demo', 'Requires the approved Demo fixtures.');

test('invoice overview opens distinct filters and calendar reaches the connected customer request', async ({ page }, testInfo) => {
  await loginAs(page, 'contractor');
  await openSidebarTab(page, /^Financials\b/i);
  await expect(page.getByTestId('contractor-financials-dashboard')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('financials-overview.png') });
  await page.getByTestId('contractor-financials-summary-drafts').click();
  await expect(page.getByTestId('contractor-invoice-status-filter')).toHaveValue('draft');
  await page.getByRole('button', { name: 'Back to Financials Overview', exact: true }).click();
  await page.getByTestId('contractor-financials-summary-open').click();
  await expect(page.getByTestId('contractor-invoice-status-filter')).toHaveValue('open');
  await page.getByRole('button', { name: 'Back to Financials Overview', exact: true }).click();
  await page.getByTestId('contractor-financials-summary-closed').click();
  await expect(page.getByTestId('contractor-invoice-status-filter')).toHaveValue('all');
  await openSidebarTab(page, /^Calendar\b/i);
  const connected = page.getByRole('region', { name: 'Schedule with a connected customer' });
  await expect(connected).toBeVisible();
  await connected.getByRole('combobox', { name: 'Connected customer' }).selectOption({ index: 1 });
  const request = connected.getByRole('button', { name: /^Open request:/ }).first();
  if (await request.count()) {
    await request.click();
    await expect(page.getByRole('heading', { name: /^Service Requests$/i, level: 1 })).toBeVisible();
  } else {
    await connected.getByRole('button', { name: 'View customer requests' }).click();
    await expect(page.getByRole('heading', { name: /^Customers$/i, level: 1 })).toBeVisible();
  }
});

test('mobile navigation traps focus, restores it on Escape, and Calendar starts in Agenda', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'contractor');
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
  await openSidebarTab(page, /^Calendar\b/i);
  await expect(page.getByRole('button', { name: 'Agenda', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Agenda date').fill('2026-09-08');
  await expect(page.getByLabel('Agenda date')).toHaveValue('2026-09-08');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('calendar-mobile-agenda.png') });
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a remembered foreign home is not used for Home Access after an account switch', async ({ page }) => {
  const staleHome = '00000000-0000-4000-8000-000000000999';
  const queriedHomes: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/rpc/servsync_list_home_membership_email_invites')) {
      const body = request.postDataJSON() as { p_home_id?: string };
      if (body?.p_home_id) queriedHomes.push(body.p_home_id);
    }
  });
  await loginAs(page, 'contractor');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create free contractor account', exact: true })).toBeVisible();
  await page.evaluate(home => localStorage.setItem('servsync.homeowner.selectedHome', home), staleHome);
  await loginAs(page, 'homeowner');
  await openSidebarTab(page, /^Properties\b/i);
  await expect.poll(() => queriedHomes.length).toBeGreaterThan(0);
  expect(queriedHomes).not.toContain(staleHome);
  await expect(page.getByText(/Unable to load Home Access|Only the home owner/i)).toHaveCount(0);
});
