import { expect, test, type Page } from '@playwright/test';

async function mount(page: Page, modulePath: string, exportName: string, props: Record<string, unknown>) {
  await page.goto('/');
  await page.evaluate(async ({ modulePath, exportName, props }) => {
    const load = new Function('path', 'return import(path)');
    const React = (await load('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await load('/node_modules/.vite/deps/react-dom_client.js')).default;
    const module = await load(modulePath);
    document.body.innerHTML = '<div id="audit-test-root"></div><output id="result"></output>';
    const action = (value: string) => { document.getElementById('result')!.textContent = value; };
    createRoot(document.getElementById('audit-test-root')).render(React.createElement(module[exportName], {
      ...props, onViewDrafts: () => action('draft'), onViewOpen: () => action('open'), onViewClosed: () => action('closed'),
      onViewAttention: () => action('attention'), onCreateInvoice: () => action('create'),
      onOpenRequest: (id: string) => action(id), onOpenCustomer: (id: string) => action(id),
    }));
  }, { modulePath, exportName, props });
}

test('billing tiles distinguish drafts from open and closed invoices and invoke separate filters', async ({ page }) => {
  await mount(page, '/src/features/financials/ContractorFinancialsDashboard.tsx', 'ContractorFinancialsDashboard', {
    invoices: [{ status: 'draft' }, { status: 'sent' }, { status: 'partially_paid' }, { status: 'paid' }, { status: 'void' }],
    attentionCount: 2, canCreateInvoice: true,
  });
  await expect(page.getByTestId('contractor-financials-summary-drafts')).toContainText('1');
  await expect(page.getByTestId('contractor-financials-summary-open')).toContainText('2');
  await expect(page.getByTestId('contractor-financials-summary-closed')).toContainText('2');
  for (const [tile, result] of [['drafts', 'draft'], ['open', 'open'], ['closed', 'closed']]) {
    await page.getByTestId(`contractor-financials-summary-${tile}`).click();
    await expect(page.locator('#result')).toHaveText(result);
  }
});

test('connected customer calendar handoff selects only that customer open requests', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, '/src/features/calendar/ConnectedCustomerScheduling.tsx', 'ConnectedCustomerScheduling', {
    customers: [{ connection_id: 'customer-a', display_name: 'Sarah' }, { connection_id: 'customer-b', display_name: 'Jordan' }],
    requests: [{ id: 'request-a', connection_id: 'customer-a', title: 'Leaking water heater', status: 'open' },
      { id: 'closed-a', connection_id: 'customer-a', title: 'Closed request', status: 'closed' },
      { id: 'request-b', connection_id: 'customer-b', title: 'Different customer request', status: 'open' }],
  });
  await page.getByRole('combobox', { name: 'Connected customer', exact: true }).selectOption('customer-a');
  await expect(page.getByRole('button', { name: /Closed request|Different customer/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open request: Leaking water heater' }).click();
  await expect(page.locator('#result')).toHaveText('request-a');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const width of [390, 1440]) {
  test(`PDF preview opens without a popup, downloads, closes and revokes its URL at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(async () => {
      const load = new Function('path', 'return import(path)');
      const { showPdfPreview } = await load('/src/utils/pdfPreview.ts');
      const { jsPDF } = await load('/node_modules/.vite/deps/jspdf.js');
      const pdf = new jsPDF(); pdf.text('ServSync audit PDF', 20, 20);
      const urlRevoke = URL.revokeObjectURL;
      document.body.innerHTML = '<button id="trigger">Preview test PDF</button><output id="revoked"></output>';
      URL.revokeObjectURL = url => { document.getElementById('revoked')!.textContent = 'revoked'; urlRevoke(url); };
      window.open = () => { throw new Error('Popups blocked'); };
      document.getElementById('trigger')!.onclick = () => showPdfPreview(pdf.output('blob'), 'audit-preview.pdf');
    });
    await page.locator('#trigger').click();
    await expect(page.getByRole('dialog', { name: 'PDF preview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close PDF preview' })).toBeFocused();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download PDF' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('audit-preview.pdf');
    await expect(page.locator('#revoked')).toHaveText('');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#trigger')).toBeFocused();
    await expect(page.locator('#revoked')).toHaveText('revoked');
  });
}
