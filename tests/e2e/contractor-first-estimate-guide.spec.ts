import { expect, test, type Page } from '@playwright/test';
import { createBlankSharedDraftComposerDraft } from '../../src/features/drafts/draftComposerMappings';
import { createWorkComposerLineDraft } from '../../src/features/work-composer/workComposerDrafts';
import { draftEstimatePreview, estimatePreviewError } from '../../src/features/onboarding/estimatePreview';
import { readFileSync } from 'node:fs';

async function mount(page: Page, options: { identity?: string; canStartReal?: boolean; businessName?: string } = {}) {
  await page.goto('/');
  await page.evaluate(async options => {
    const load = new Function('path', 'return import(path)');
    const { default: React } = await load('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await load('/node_modules/.vite/deps/react-dom_client.js');
    const { ContractorFirstEstimateGuide } = await load('/src/features/onboarding/ContractorFirstEstimateGuide.tsx');
    document.body.innerHTML = '<main id="guide-root" style="padding:16px;max-width:1100px;margin:auto"></main><output id="navigation"></output>';
    const route = (target: string) => { document.getElementById('navigation')!.textContent = target; };
    ReactDOM.createRoot(document.getElementById('guide-root')).render(React.createElement(ContractorFirstEstimateGuide, {
      identity: options.identity ?? 'synthetic-owner:synthetic-business', businessName: options.businessName ?? 'Test Service Company',
      hasEstimates: false, canStartReal: options.canStartReal ?? true,
      onStartReal: () => route('new-empty-real-draft'), onResumeReal: () => route('existing-drafts'),
      onBusiness: () => route('business'), onPrices: () => route('prices'), onCustomers: () => route('customers'),
    }));
  }, options);
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`isolated sample previews, refreshes, skips and starts fresh real work on ${viewport.name}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const mutations: string[] = [];
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`); });
    await mount(page);
    await page.getByRole('button', { name: 'Try sample estimate', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Create (Estimate|Job|Invoice)$/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview customer estimate', exact: true }).click();
    const preview = page.getByTestId('onboarding-estimate-preview');
    await expect(preview).toContainText('$195.00');
    const pdf = await page.getByRole('link', { name: 'Open customer PDF preview' }).getAttribute('href');
    expect(pdf).toMatch(/^blob:/);
    const pdfText = await page.evaluate(async url => new TextDecoder().decode(await (await fetch(url!)).arrayBuffer()), pdf);
    expect(pdfText).toContain('%PDF');
    expect(pdfText).toContain('Sample Service Company');
    expect(pdfText).toContain('195.00');
    expect(pdfText).toContain('Preview generated:');
    expect(pdfText).not.toContain('Invalid Date');
    expect(pdfText).not.toContain('Updated:');
    await page.screenshot({ path: info.outputPath(`guide-${viewport.name}.png`), fullPage: true });
    await page.getByLabel('Draft estimate line item 1 quantity', { exact: true }).fill('3');
    await expect(preview).toHaveCount(0);
    await mount(page);
    await expect(page.getByLabel('Draft estimate line item 1 quantity', { exact: true })).toHaveValue('3');
    await page.getByRole('button', { name: 'Preview customer estimate', exact: true }).click();
    await expect(preview).toContainText('$270.00');
    await page.getByRole('button', { name: 'Start a real estimate', exact: true }).click();
    await expect(page.locator('#navigation')).toHaveText('new-empty-real-draft');
    await expect(page.getByTestId('shared-draft-composer')).toHaveCount(0);
    await page.getByRole('button', { name: 'Resume saved Drafts', exact: true }).click();
    await expect(page.locator('#navigation')).toHaveText('existing-drafts');
    await page.getByRole('button', { name: 'Skip optional setup' }).click();
    await mount(page);
    await expect(page.getByRole('button', { name: 'Open first-estimate guide' })).toBeVisible();
    expect(mutations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('stored state is actor scoped, malformed data recovers, unavailable access and business name prevent real start', async ({ page }) => {
  await mount(page, { identity: 'one' });
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await mount(page, { identity: 'two', canStartReal: false });
  await expect(page.getByRole('heading', { name: 'Build your first estimate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a real estimate' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Resume saved Drafts' })).toBeDisabled();
  await page.evaluate(() => { localStorage.setItem('servsync.firstEstimate.v1:two', '{bad'); sessionStorage.setItem('servsync.firstEstimate.v1:two', '{bad'); });
  await mount(page, { identity: 'two', businessName: '' });
  await expect(page.getByRole('button', { name: 'Start a real estimate' })).toBeDisabled();
  await page.getByRole('button', { name: 'Try sample estimate' }).click();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('SAMPLE — Small repair visit');
});

test('accurate mixed prices and labor; customer optional; private notes never enter PDF data', () => {
  const draft = createBlankSharedDraftComposerDraft({ title: 'Test repair', scope: 'Agreed scope', notes: 'PRIVATE DRAFT SECRET', intended_output: 'estimate', labor_mode: 'job_total', labor_rate: '80', job_labor_hours: '1.5', line_items: [createWorkComposerLineDraft({ line_title: 'Part', line_type: 'material', quantity: '2.5', unit_price: '12.35', internal_notes: 'PRIVATE LINE SECRET' }), createWorkComposerLineDraft({ line_title: 'Fee', line_type: 'fee', quantity: '1', unit_price: '10' })] });
  expect(estimatePreviewError(draft)).toBe('');
  const result = draftEstimatePreview(draft);
  expect(result.total_cents).toBe(16088);
  expect(result.labor_total_cents).toBe(12000);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  for (const value of ['', '-1', 'NaN']) {
    expect(estimatePreviewError({ ...draft, line_items: [{ ...draft.line_items[0], unit_price: value }] })).not.toBe('');
  }
  expect(estimatePreviewError({ ...draft, labor_rate: '' })).toContain('labor rate');
  expect(estimatePreviewError({ ...draft, labor_rate: '-1' })).not.toBe('');
  expect(estimatePreviewError({ ...draft, line_items: [] })).not.toBe('');
});

test('application preserves role and capability gating and new real drafts receive no sample payload', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const workspace = readFileSync('src/features/drafts/DurableDraftWorkspace.tsx', 'utf8');
  expect(app).toContain("!SERVSYNC_DEMO_PRESENTATION_MODE && (durableDraftCapabilities.canLaunchEstimate || (!contractor?.id && !teamAccess))");
  expect(app).toContain('onStartReal={startCleanDraftFirstEstimateComposer}');
  expect(app).toContain('sharedDraftComposerEnabled && !durableDraftCohortSafeHold && !createEstimateCapability.disabled');
  expect(workspace).toContain('previewBusinessName={capabilities.canLaunchEstimate ? previewBusinessName : undefined}');
});

test('saved Estimate PDFs retain their saved update date', async ({ page }) => {
  await page.goto('/');
  const pdfText = await page.evaluate(async () => {
    const load = new Function('path', 'return import(path)');
    const { createEstimatePdf } = await load('/src/utils/pdfDocuments.ts');
    const { draftEstimatePreview } = await load('/src/features/onboarding/estimatePreview.ts');
    const { createBlankSharedDraftComposerDraft } = await load('/src/features/drafts/draftComposerMappings.ts');
    const estimate = draftEstimatePreview(createBlankSharedDraftComposerDraft());
    estimate.updated_at = '2026-01-02T12:00:00';
    const { blob } = await createEstimatePdf(estimate, { contractorName: 'Test Company', customerName: 'Test Customer' });
    return blob.text();
  });
  expect(pdfText).toContain('Updated: 1/2/2026');
  expect(pdfText).not.toContain('Preview generated:');
  expect(pdfText).not.toContain('Invalid Date');
});
