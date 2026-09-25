import { expect, test } from '@playwright/test';
import { loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';

// Existing fictional Demo records only. Do not save, launch, send, or alter a record.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.skip(process.env.SERVSYNC_VALIDATION_TARGET !== 'demo', 'Requires the approved Demo identity.');

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`contractor can find and start private work on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = captureMajorConsoleErrors(page);
    await page.route(/\/auth\/v1\/token(?:\?|$)/, async route => {
      if (new URL(route.request().url()).origin !== 'https://bdytwgejqnlblhrnqxkp.supabase.co') {
        await route.abort();
        throw new Error('Refusing to send Demo credentials to another backend.');
      }
      await route.continue();
    });
    await loginAs(page, 'contractor');
    await openSidebarTab(page, /^Dashboard$/);
    const weekly = page.getByTestId('contractor-schedule-snapshot');
    await expect(weekly).toBeVisible();
    // The weekly summary remains available even when there is no Today card.
    await expect(page.getByTestId('contractor-todays-work-empty')).toHaveCount(0);
    const review = page.getByRole('heading', { name: 'Workflow overview', exact: true });
    expect((await review.boundingBox())!.y).toBeLessThan((await weekly.boundingBox())!.y);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${viewport.name}.png`) });

    await openSidebarTab(page, /^Work\b/);
    const start = page.getByTestId('contractor-work-start-draft');
    await expect(start).toBeVisible();
    expect((await start.boundingBox())!.y).toBeLessThan(viewport.height);
    await expect(page.getByRole('heading', { name: 'Work', exact: true })).toHaveCount(1);
    const attention = page.getByTestId('contractor-jobs-summary-needs-attention');
    await expect(attention).toBeVisible();
    const label = await attention.getAttribute('aria-label');
    if (label?.includes('Needs Attention: 0.')) {
      await expect(attention).toContainText('No work items need attention');
      await expect(attention).not.toHaveClass(/bg-amber-50/);
    }
    await page.screenshot({ path: testInfo.outputPath(`work-${viewport.name}.png`) });

    await start.click();
    const composer = page.getByTestId('shared-draft-composer');
    await expect(composer).toBeVisible();
    await expect(composer.getByText('Private Draft', { exact: true })).toBeVisible();
    await expect(composer.getByTestId('draft-compact-line')).toHaveCount(1);
    await expect(composer.getByText('Price Required', { exact: true })).toHaveCount(0);
    // The untouched starter row must not trigger the unsaved-change confirmation.
    await composer.getByRole('button', { name: 'Back to Work', exact: true }).click();
    await expect(page.getByTestId('contractor-work-dashboard')).toBeVisible();
    await start.click();
    await expect(composer).toBeVisible();
    const title = composer.getByRole('textbox', { name: 'What needs doing?', exact: true });
    await title.fill('Unsaved presentation check');
    await composer.getByRole('radiogroup').getByText('Estimate', { exact: true }).click();
    await expect(composer.getByRole('radio', { name: /^Estimate/ })).toBeChecked();
    await expect(title).toHaveValue('Unsaved presentation check');
    await composer.getByRole('radiogroup').getByText('Choose later', { exact: true }).click();
    await expect(composer.getByRole('radio', { name: /^Choose later/ })).toBeChecked();
    await expect(title).toHaveValue('Unsaved presentation check');
    await composer.getByLabel('Draft line item 1 description', { exact: true }).fill('Unsaved faucet review');
    await composer.getByLabel('Draft line item 1 type', { exact: true }).selectOption('material');
    await composer.getByLabel('Draft line item 1 unit price', { exact: true }).fill('250');
    const line = composer.getByTestId('draft-compact-line');
    await line.scrollIntoViewIfNeeded();
    await expect(line.getByText('$250.00', { exact: true })).toBeVisible();
    const actionBar = composer.getByTestId('draft-action-bar');
    const barBox = (await actionBar.boundingBox())!;
    expect(barBox.y).toBeGreaterThanOrEqual(0);
    expect(barBox.y + barBox.height).toBeLessThan(viewport.height);
    await page.screenshot({ path: testInfo.outputPath(`draft-line-${viewport.name}.png`) });
    await composer.getByRole('button', { name: 'Remove draft line 1', exact: true }).click();
    // Return to a clean unsaved form; no business-record mutation is needed.
    await title.fill('');
    await page.getByRole('heading', { name: 'Start New Draft', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`draft-${viewport.name}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Discard unsaved local changes and return to Work?');
      await dialog.accept();
    });
    await composer.getByRole('button', { name: 'Back to Work', exact: true }).click();
    await expect(page.getByTestId('contractor-work-dashboard')).toBeVisible();
    await errors.assertClean(testInfo);
  });
}
