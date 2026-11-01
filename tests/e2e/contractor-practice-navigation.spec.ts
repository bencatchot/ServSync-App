import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function mount(page: Page, direct = false, storageFails = false, ineligible = false, pending = false) {
  await page.route(/\/src\/App\.tsx(?:\?.*)?$/, route => route.fulfill({
    contentType: 'text/javascript', body: "export { default } from '/tests/fixtures/ContractorPracticeNavigationHarness.tsx';",
  }));
  if (storageFails) await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('servsync.firstEstimate')) throw new Error('Synthetic storage unavailable');
      original.call(this, key, value);
    };
  });
  if (ineligible) await page.goto('/#before-practice');
  await page.goto(direct ? `/#/contractor?practice=estimate${ineligible ? '&ineligible=1' : ''}${pending ? '&pending=1' : ''}` : '/#/contractor');
  await page.reload();
}

async function selectTab(page: Page, name: string, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

for (const mobile of [false, true]) {
  test(`Practice entry/history/tab switching preserves inputs ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, info) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const mutations: string[] = [];
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()); });
    await mount(page);
    await expect(page.getByRole('heading', { name: 'Build your first estimate' })).toBeHidden();
    await page.getByRole('button', { name: 'Try practice estimate builder', exact: true }).click();
    await expect(page).toHaveURL(/#\/contractor\?practice=estimate$/);
    await page.getByRole('button', { name: 'Try sample estimate', exact: true }).click();
    await page.getByLabel('What needs doing?').fill('SAMPLE — Retain my inputs');
    await page.getByLabel('Draft estimate line item 1 quantity', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Preview customer estimate', exact: true }).click();
    await expect(page.getByTestId('onboarding-estimate-preview')).toContainText('$270.00');
    await page.goBack();
    await expect(page.getByTestId('active-tab')).toHaveText('overview');
    await expect(page.getByTestId('shared-draft-composer')).toBeHidden();
    await page.goForward();
    await expect(page.getByLabel('What needs doing?')).toHaveValue('SAMPLE — Retain my inputs');
    await selectTab(page, 'Work', mobile);
    await expect(page.getByTestId('shared-draft-composer')).toBeHidden();
    await page.goBack();
    await expect(page.getByLabel('Draft estimate line item 1 quantity', { exact: true })).toHaveValue('3');
    await page.goForward();
    await selectTab(page, 'Practice', mobile);
    await expect(page.getByTestId('onboarding-estimate-preview')).toContainText('$270.00');
    await expect(page.getByRole('button', { name: /^Create (Estimate|Job|Invoice)$/ })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`practice-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mount(page, true);
    await expect(page.getByLabel('What needs doing?')).toHaveValue('SAMPLE — Retain my inputs');
    await page.getByRole('button', { name: 'Start a real estimate', exact: true }).click();
    await expect(page.locator('#real-navigation')).toHaveText('new-empty-real-draft');
    await expect(page.getByTestId('active-tab')).toHaveText('work');
    expect(mutations).toEqual([]);
  });
}

test('unavailable storage does not lose live inputs on workspace navigation', async ({ page }) => {
  await mount(page, true, true);
  await page.getByRole('button', { name: 'Try sample estimate', exact: true }).click();
  await page.getByLabel('What needs doing?').fill('SAMPLE — Memory survives tabs');
  await expect(page.getByTestId('contractor-practice-workspace').getByRole('status')).toContainText('could not be saved');
  await selectTab(page, 'Dashboard', false);
  await page.goBack();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('SAMPLE — Memory survives tabs');
  await page.goForward();
  await page.getByRole('button', { name: 'Try practice estimate builder', exact: true }).click();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('SAMPLE — Memory survives tabs');
});

test('App wires the dedicated tab and retained workspace behind the existing gate', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  expect(app).toContain("{ id: 'practice', label: 'Practice'");
  expect(app).toContain("<ContractorPracticeWorkspace activeTab={contractorTab} onOpenPractice={() => setContractorTab('practice')}");
  expect(app).toContain("{!loading && !SERVSYNC_DEMO_PRESENTATION_MODE && (durableDraftCapabilities.canLaunchEstimate || (!contractor?.id && !teamAccess)) && (");
});

test('ineligible direct Practice links fall back without exposing the editor', async ({ page }) => {
  await mount(page, true, false, true);
  await expect(page.getByTestId('active-tab')).toHaveText('overview');
  await expect(page).not.toHaveURL(/practice=estimate/);
  await expect(page.getByTestId('contractor-practice-workspace')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/#before-practice$/);
});

test('direct Practice waits for pending eligibility without replacing the destination', async ({ page }) => {
  await mount(page, true, false, false, true);
  await expect(page.getByTestId('active-tab')).toHaveText('practice');
  await page.getByRole('button', { name: 'Resolve eligible access' }).click();
  await expect(page.getByRole('heading', { name: 'Practice estimate builder', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/practice=estimate/);
});
