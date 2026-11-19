import { expect, test } from '@playwright/test';
for (const width of [1440, 390]) test(`invoice property selection is explicit and unsaved at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('https://**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Supabase is not connected' })).toBeVisible();
  await page.evaluate(async () => { const module = await new Function('path', 'return import(path)')('/tests/fixtures/invoicePropertyHarness.tsx'); module.mountInvoicePropertyHarness(); });
  const select = page.getByRole('combobox', { name: 'Invoice service property' });
  await expect(select).toHaveValue('');
  await select.selectOption('fictional-home-1'); await expect(page.getByTestId('selection')).toHaveText('fictional-home-1');
  await select.selectOption('fictional-home-0'); await expect(page.getByTestId('selection')).toHaveText('fictional-home-0');
  await page.getByRole('button', { name: 'Toggle source link' }).click(); await expect(select).toBeDisabled();
  await page.getByRole('button', { name: 'Toggle source link' }).click(); await expect(select).toBeEnabled();
  await page.getByRole('button', { name: 'Toggle editor' }).click(); await page.getByRole('button', { name: 'Toggle editor' }).click();
  await expect(select).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
