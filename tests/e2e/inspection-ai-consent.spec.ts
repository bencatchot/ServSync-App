import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reviewLabel = 'Review and get AI suggestions';
const allowLabel = 'Allow and send to OpenAI';
const sample = 'The condensate drain line is blocked.';
const fixturePath = '/tests/e2e/fixtures/inspection-ai-consent/index.html';

async function openFixture(page: Page, status = 200) {
  const observed: unknown[] = [];
  const appOrigin = new URL(process.env.TEST_APP_URL!).origin;
  await page.route('**/*', route => new URL(route.request().url()).origin === appOrigin
    ? route.continue()
    : route.abort());
  await page.route('**/functions/v1/inspection-ai', async route => {
    observed.push(route.request().postDataJSON());
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status, json: [] });
  });
  await page.goto(fixturePath);
  return observed;
}

test('the Inspection AI invocation exists once and uses only the approved request', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  expect(source.match(/functions\.invoke\('inspection-ai'/g)).toHaveLength(1);
  expect(source).toContain('const inspectionAiScope = JSON.stringify([profile.id, activeInspection.id]);');
  expect(source).toContain("const aiNoteText = aiNoteDraft?.scope === inspectionAiScope ? aiNoteDraft.notes : '';");
  expect(source).toMatch(/<InspectionAiConsent[\s\S]*?key=\{inspectionAiScope\}[\s\S]*?onApprove=\{async request =>[\s\S]*?invoke\('inspection-ai', \{ body: request \}\)/);
});

test('review discloses data and provider, cancel and manual walkthrough never transfer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await openFixture(page);
  await expect(page.getByRole('button', { name: reviewLabel })).toBeDisabled();
  await page.getByLabel('Notes').fill(sample);
  await page.getByRole('button', { name: reviewLabel }).click();
  const disclosure = page.getByRole('region', { name: 'Send inspection text to OpenAI?' });
  await expect(disclosure).toContainText('room names and checklist items');
  await expect(disclosure.getByRole('heading')).toBeFocused();
  await expect(disclosure).toContainText('a third-party AI provider');
  await disclosure.getByText('Review room names and checklist items', { exact: true }).click();
  await expect(disclosure).toContainText('Check drain line');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await disclosure.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Notes')).toHaveValue(sample);
  await expect(disclosure).toHaveCount(0);
  await expect(page.getByRole('button', { name: reviewLabel })).toBeFocused();
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await expect(page.getByText('Manual walkthrough, no AI transfer')).toBeVisible();
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(page.getByRole('button', { name: allowLabel })).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test('editing inputs or switching inspections invalidates an open review', async ({ page }) => {
  const calls = await openFixture(page);
  await page.getByLabel('Notes').fill(sample);
  await page.getByRole('button', { name: reviewLabel }).click();
  await page.getByLabel('Notes').fill('Updated note');
  await expect(page.getByRole('button', { name: allowLabel })).toHaveCount(0);
  await page.getByRole('button', { name: reviewLabel }).click();
  await page.getByLabel('Room').fill('Updated room');
  await expect(page.getByRole('button', { name: allowLabel })).toHaveCount(0);
  await page.getByRole('button', { name: reviewLabel }).click();
  await page.getByRole('button', { name: 'Switch inspection' }).click();
  await expect(page.getByLabel('Notes')).toBeEmpty();
  await expect(page.getByRole('button', { name: allowLabel })).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test('approval sends exactly one scoped payload; a failed request does not retry', async ({ page }) => {
  const calls = await openFixture(page, 503);
  await page.getByLabel('Notes').fill(sample);
  await page.getByRole('button', { name: reviewLabel }).click();
  expect(calls).toHaveLength(0);
  const confirm = page.getByRole('button', { name: allowLabel });
  await confirm.evaluate(el => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  await expect(page.getByRole('status')).toHaveText('Suggestions unavailable');
  expect(calls).toEqual([{ notes: sample, rooms: [{ room: 'Utility room', items: ['Check drain line'] }] }]);
  await expect(page.getByRole('button', { name: reviewLabel })).toBeEnabled();
  await expect(confirm).toHaveCount(0);
  await page.getByRole('button', { name: reviewLabel }).click();
  expect(calls).toHaveLength(1);
});
