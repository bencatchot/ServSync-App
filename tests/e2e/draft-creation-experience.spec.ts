import { expect, test, type Page } from '@playwright/test';

// In-memory component fixtures: no authentication, saves, or business-record writes.
async function mountComposer(page: Page, configured = false, locked = false) {
  await page.goto('/');
  await page.evaluate(async ({ configured, locked }) => {
    const load = new Function('path', 'return import(path)');
    const { default: React } = await load('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await load('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = ReactDOM;
    const { ContractorDraftComposer } = await load('/src/features/drafts/ContractorDraftComposer.tsx');
    const { createBlankSharedDraftComposerDraft } = await load('/src/features/drafts/draftComposerMappings.ts');
    let draft = createBlankSharedDraftComposerDraft({
      intended_output: configured ? 'estimate' : null,
      notes: configured ? 'Bring a protective mat' : '',
      labor_rate: configured ? '80' : '',
    });
    document.body.innerHTML = '<main id="draft-review-root" style="padding:16px;max-width:1000px;margin:auto"></main>';
    const root = createRoot(document.getElementById('draft-review-root')!);
    let changes = 0;
    let savedDraft: typeof draft | null = null;
    const render = () => root.render(React.createElement(React.Fragment, null, React.createElement(ContractorDraftComposer, {
      draft,
      customerOptions: [],
      savedWorkTemplates: [{
        id: 'template-fixture', contractor_id: 'contractor-fixture', name: 'Faucet replacement',
        description: 'Replace the faucet', notes: '', terms: '',
        created_at: '2026-09-25T00:00:00Z', updated_at: '2026-09-25T00:00:00Z',
        line_items: [{ line_type: 'material', line_title: 'New faucet', description: 'New faucet',
          quantity: 1, unit: 'each', unit_price_cents: 25000, sort_order: 0 }],
      }],
      checklistOptions: [{
        source_kind: 'contractor_inspection_checklist', source_id: 'fixture-checklist', source_label: 'Plumbing inspection',
        workflow_kind: 'inspection', job_type: 'inspection', source_updated_at: null,
        group_label: 'Your Inspection Checklists',
        rooms: [{ room: 'Kitchen', room_id: 'kitchen', display_name: 'Kitchen', room_type: '', location_note: '', sort_order: 0, items: ['Check faucet'] }],
      }],
      canSave: !locked, saving: false, interactionDisabled: locked, invoiceOutputAvailable: true,
      canViewPriceBook: true, priceBookLoadState: 'ready', priceBookItems: [],
      launchLabel: draft.intended_output ? `Create ${draft.intended_output}` : null,
      launchDisabled: locked,
      onChange: (next: typeof draft) => { changes += 1; draft = next; render(); },
      onSave: () => { savedDraft = structuredClone(draft); render(); }, onLaunch: () => undefined, onBack: () => undefined, onRemovePersistedLine: () => undefined,
    }), React.createElement('output', { hidden: true, 'data-testid': 'draft-state' }, JSON.stringify({ draft, changes, savedDraft }))));
    render();
  }, { configured, locked });
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`Draft planning stays compact and preserves choices on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mountComposer(page);
    const customer = page.getByRole('region', { name: 'Customer and work', exact: true });
    const scope = page.getByRole('region', { name: 'Scope and pricing', exact: true });
    const next = page.getByRole('region', { name: 'Next step', exact: true });
    expect((await customer.boundingBox())!.y).toBeLessThan((await scope.boundingBox())!.y);
    expect((await scope.boundingBox())!.y).toBeLessThan((await next.boundingBox())!.y);
    await expect(page.locator('textarea[aria-describedby="durable-draft-private-notes-help"]')).toBeHidden();
    await expect(page.getByText('Draft Job total', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Work items', exact: true })).toBeVisible();
    const title = page.getByRole('textbox', { name: 'What needs doing?', exact: true });
    await title.fill('Replace kitchen faucet');
    await page.getByLabel('Draft line item 1 description', { exact: true }).fill('Replacement faucet');
    await page.getByLabel('Draft line item 1 type', { exact: true }).selectOption('material');
    await page.getByLabel('Draft line item 1 unit price', { exact: true }).fill('250');
    const row = page.getByTestId('draft-compact-line');
    await expect(row.getByText('$250.00', { exact: true })).toBeVisible();
    expect((await row.boundingBox())!.height).toBeLessThan(340);

    const format = page.getByTestId('durable-draft-work-format');
    for (const option of ['Choose later', 'Estimate', 'Job', 'Draft Invoice']) {
      const selected = page.getByRole('radio', { name: new RegExp(`^${option}`) });
      await page.getByRole('radiogroup').getByText(option, { exact: true }).click();
      await format.selectOption('inspection_checklist');
      await page.getByTestId('durable-draft-checklist-source').selectOption('contractor_inspection_checklist:fixture-checklist');
      await format.selectOption('standard');
      await expect(selected).toBeChecked();
      await expect(title).toHaveValue('Replace kitchen faucet');
      await expect(page.getByTestId('draft-compact-line').getByText('$250.00', { exact: true })).toBeVisible();
      await format.selectOption('inspection_checklist');
      await expect(page.getByTestId('durable-draft-checklist-source')).toHaveValue('contractor_inspection_checklist:fixture-checklist');
      await format.selectOption('standard');
    }
    await page.getByRole('radiogroup').getByText('Estimate', { exact: true }).click();
    await expect(page.getByTestId('durable-draft-labor-rate')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Price Book', exact: true })).toHaveCount(0);
    await page.getByTestId('durable-draft-estimate-labor-model').locator('summary').click();
    await page.getByTestId('durable-draft-labor-rate').fill('80');
    await page.getByTestId('durable-draft-labor-mode-job-total').click();
    await page.getByTestId('durable-draft-job-labor-hours').fill('2');
    await expect(page.getByTestId('draft-action-bar')).toContainText('$410.00');
    await page.getByTestId('durable-draft-estimate-labor-model').locator('summary').click();
    await expect(page.getByTestId('durable-draft-labor-rate')).toBeHidden();
    await page.getByRole('radiogroup').getByText('Job', { exact: true }).click();
    await page.getByRole('radiogroup').getByText('Estimate', { exact: true }).click();
    await page.getByTestId('durable-draft-estimate-labor-model').locator('summary').click();
    await expect(page.getByTestId('durable-draft-labor-rate')).toHaveValue('80');
    await expect(page.getByTestId('durable-draft-job-labor-hours')).toHaveValue('2');
    await page.getByRole('region', { name: 'Scope and pricing', exact: true }).scrollIntoViewIfNeeded();
    const actionBox = (await page.getByTestId('draft-action-bar').boundingBox())!;
    expect(actionBox.y).toBeGreaterThanOrEqual(0);
    expect(actionBox.y + actionBox.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`draft-scope-${viewport.name}.png`) });
  });
}

test('existing private notes and configured labor remain discoverable; frozen fields stay disabled', async ({ page }) => {
  await mountComposer(page, true, true);
  await expect(page.locator('textarea[aria-describedby="durable-draft-private-notes-help"]')).toBeVisible();
  await expect(page.locator('textarea[aria-describedby="durable-draft-private-notes-help"]')).toHaveValue('Bring a protective mat');
  await expect(page.getByTestId('durable-draft-labor-rate')).toBeVisible();
  await expect(page.getByTestId('durable-draft-labor-rate')).toHaveValue('80');
  await expect(page.getByTestId('durable-draft-labor-rate')).toBeDisabled();
  await expect(page.getByTestId('durable-draft-work-format')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeDisabled();
  await expect(page.getByTestId('durable-draft-create-output')).toBeDisabled();
});


test('the starter line is presentation-only until edited and returns after the last line is removed', async ({ page }) => {
  await mountComposer(page);
  const state = async () => JSON.parse((await page.getByTestId('draft-state').textContent())!);
  const first = page.getByLabel('Draft line item 1 description', { exact: true });
  await expect(first).toBeVisible();
  await expect(page.getByTestId('draft-compact-line')).toHaveCount(1);
  await expect(page.getByText('Price Required', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove draft line 1', exact: true })).toHaveCount(0);
  await first.focus();
  await page.getByRole('button', { name: /more details/i }).click();
  expect((await state()).changes).toBe(0);
  expect((await state()).draft.line_items).toEqual([]);
  await page.getByRole('textbox', { name: 'What needs doing?', exact: true }).fill('Plan repairs');
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  expect((await state()).savedDraft.line_items).toEqual([]);

  await page.getByTestId('durable-draft-work-format').selectOption('inspection_checklist');
  await expect(page.getByTestId('draft-compact-line')).toHaveCount(0);
  await page.getByTestId('durable-draft-work-format').selectOption('standard');
  await expect(first).toBeVisible();
  expect((await state()).draft.line_items).toEqual([]);

  // Changing any work field materializes the row and restores normal validation.
  await page.getByLabel('Draft line item 1 type', { exact: true }).selectOption('material');
  expect((await state()).draft.line_items).toHaveLength(1);
  await expect(page.getByText('Price Required', { exact: true })).toBeVisible();
  await first.fill('Replacement faucet');
  await page.getByLabel('Draft line item 1 unit price', { exact: true }).fill('250');
  await page.getByTestId('durable-draft-add-line').click();
  await expect(page.getByTestId('draft-compact-line')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove draft line 2', exact: true }).click();
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  expect((await state()).savedDraft.line_items).toHaveLength(1);
  expect((await state()).savedDraft.line_items[0].line_title).toBe('Replacement faucet');
  await page.getByRole('button', { name: 'Remove draft line 1', exact: true }).click();
  await expect(first).toHaveValue('');
  await expect(page.getByTestId('draft-compact-line')).toHaveCount(1);
  expect((await state()).draft.line_items).toEqual([]);
});


test('a saved template replaces the starter row without leaving an empty line', async ({ page }) => {
  await mountComposer(page);
  await page.getByTestId('durable-draft-template-picker-toggle').click();
  await page.getByTestId('durable-draft-template-option').click();
  await expect(page.getByTestId('durable-draft-template-confirmation')).toHaveCount(0);
  await expect(page.getByTestId('draft-compact-line')).toHaveCount(1);
  await expect(page.getByLabel('Draft line item 1 description', { exact: true })).toHaveValue('New faucet');
  const state = JSON.parse((await page.getByTestId('draft-state').textContent())!);
  expect(state.draft.line_items).toHaveLength(1);
});
