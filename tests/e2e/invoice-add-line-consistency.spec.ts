import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Local component fixtures only. No login, external API, persistence or delivery.
async function mountEditor(page: Page, options: { shared?: boolean; empty?: boolean; linked?: boolean; disabled?: boolean; intent?: 'estimate' | 'invoice' | 'job' } = {}) {
  page.on('pageerror', error => { throw error; });
  await page.route('https://**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Supabase is not connected' })).toBeVisible();
  await page.evaluate(async options => {
    const load = new Function('path', 'return import(path)') as <T>(path: string) => Promise<T>;
    const { mountInvoiceFixture } = await load<typeof import('../fixtures/invoiceLineHarness')>('/tests/fixtures/invoiceLineHarness.tsx');
    mountInvoiceFixture(options);
  }, options);
}

for (const width of [1440, 390]) {
  test.describe(`Invoice Add Line at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const shared of [false, true]) {
      test(`${shared ? 'shared Draft' : 'standalone'} appends once, focuses, preserves linked rows and reopens cleanly`, async ({ page }) => {
        await mountEditor(page, { shared, linked: true });
        const descriptions = page.getByRole('textbox', { name: /^Invoice line item \d+ description$/ });
        const add = page.getByRole('button', { name: 'Add Line', exact: true });
        await expect(add).toHaveCount(1);
        for (const activation of ['click', 'Enter', 'Space', 'click']) {
          const count = await descriptions.count();
          if (activation === 'click') await add.click();
          else { await add.focus(); await page.keyboard.press(activation); }
          await expect(descriptions).toHaveCount(count + 1);
          await expect(descriptions.last()).toBeFocused();
          await descriptions.last().fill(`Added ${count}`);
          await expect(descriptions.last()).toBeFocused();
        }
        await expect(descriptions.first()).toHaveValue('Existing work');
        await expect(page.getByTestId('lines-state')).toContainText('fictional-linked-item');
        await expect(page.getByTestId('saves')).toHaveText('0');
        const lastBox = await descriptions.last().boundingBox();
        const addBox = await add.boundingBox();
        expect(addBox!.y).toBeGreaterThan(lastBox!.y + lastBox!.height);
        expect(await add.evaluate(el => getComputedStyle(el).position)).toBe('static');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.getByRole('button', { name: 'Dismiss fixture' }).click();
        await expect(add).toHaveCount(0);
        await page.getByRole('button', { name: 'Reopen fixture' }).click();
        await expect(descriptions).toHaveCount(1);
        await expect(descriptions.first()).not.toBeFocused();
        await add.click();
        await expect(descriptions).toHaveCount(2);
        await expect(descriptions.last()).toBeFocused();
        await page.screenshot({ path: `/tmp/invoice-add-line-${shared ? 'shared' : 'standalone'}-${width}.png`, fullPage: true });
      });

      test(`${shared ? 'shared Draft' : 'standalone'} empty and disabled states`, async ({ page }) => {
        await mountEditor(page, { shared, empty: true });
        const rows = page.getByRole('textbox', { name: /^Invoice line item \d+ description$/ });
        await expect(page.getByRole('button', { name: 'Add Line', exact: true })).toBeVisible();
        const before = await rows.count();
        await page.getByRole('button', { name: 'Add Line', exact: true }).click();
        await expect(rows).toHaveCount(before + 1);
        await expect(rows.last()).toBeFocused();
        await mountEditor(page, { shared, disabled: true });
        await expect(page.getByRole('button', { name: 'Add Line', exact: true })).toBeDisabled();
        await expect(page.getByTestId('saves')).toHaveText('0');
      });
    }
    test('switching shared Draft intent keeps neutral labels and noninvoice actions', async ({ page }) => {
      await mountEditor(page, { shared: true, intent: 'estimate' });
      await expect(page.getByRole('button', { name: 'Add estimate line', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Draft estimate line item 1 description' })).toHaveValue('Existing work');
      await page.getByText('Draft Invoice', { exact: true }).click();
      await page.getByRole('button', { name: 'Add Line', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Invoice line item 2 description' })).toBeFocused();
      await page.getByText('Job', { exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add work line', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Draft line item 1 description' })).toHaveValue('Existing work');
    });
  });
}

test('all existing invoice entry points retain their gates and converge on the corrected editor', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  expect(app.match(/<InvoiceLineItems /g)).toHaveLength(1);
  expect(app).toContain('const authorizedInvoiceComposerOpen = canManageFinancialActions && invoiceComposerOpen;');
  expect(app).toContain('if (invoiceRecordOpensEditable(invoice.status, financialActionVisibility))');
  expect(app).toContain('if (sharedDraftComposerEnabled && durableDraftInvoiceLaunchAvailable)');
  for (const marker of ['const beginInvoiceDraftForCustomer =', 'const openInvoiceRecord =', 'const startDraftFirstInvoiceComposer =', 'const startCleanDraftFirstInvoiceComposer =', "supabase.rpc('servsync_create_invoice_from_job'", "supabase.rpc('servsync_create_partial_invoice_from_job'"]) expect(app).toContain(marker);
  expect(app).toContain("currentInvoice.status !== 'draft'");
  expect(app).toContain('job_work_item_id: line.job_work_item_id || null');
  expect(app).toContain('onAddLines={addPriceBookLinesToInvoiceDraft}');
});
