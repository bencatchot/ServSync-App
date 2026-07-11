import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';

const sensitiveKeys = [
  'servsync.contractor.fieldWorkState',
  'servsync.homeowner.requestSearch',
  'servsync.contractor.homeownerSearch',
  'servsync.contractor.selectedHomeowner',
  'servsync.contractor.jobsCustomerFilter',
];

const preservedKeys = [
  'servsync.contractor.activeTab',
  'servsync.contractor.jobsView',
];

test.describe('sign-out local storage cleanup', () => {
  test('clears sensitive ServSync browser state without wiping harmless preferences', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);

    await loginAs(page, 'contractor');

    await page.evaluate(({ sensitiveKeys: keysToClear, preservedKeys: keysToKeep }) => {
      keysToClear.forEach(key => {
        window.localStorage.setItem(key, `e2e-sensitive-${key}`);
      });
      keysToKeep.forEach(key => {
        window.localStorage.setItem(key, `e2e-preserved-${key}`);
      });
    }, { sensitiveKeys, preservedKeys });

    await page.getByRole('button', { name: /Sign out/i }).first().click();

    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.getByRole('button', { name: /^Sign in$/i })).toBeVisible();

    const storageState = await page.evaluate(({ sensitiveKeys: keysToClear, preservedKeys: keysToKeep }) => ({
      cleared: keysToClear.every(key => window.localStorage.getItem(key) === null),
      preserved: keysToKeep.every(key => window.localStorage.getItem(key)?.startsWith('e2e-preserved-')),
      authKeysRemaining: Object.keys(window.localStorage).filter(key => key.startsWith('sb-')).length,
      sessionKeysRemaining: Object.keys(window.sessionStorage).length,
    }), { sensitiveKeys, preservedKeys });

    expect(storageState.cleared).toBe(true);
    expect(storageState.preserved).toBe(true);
    expect(storageState.authKeysRemaining).toBe(0);
    expect(storageState.sessionKeysRemaining).toBe(0);

    await consoleErrors.assertClean(testInfo);
  });
});
