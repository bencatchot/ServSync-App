import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureMajorConsoleErrors } from './helpers/console';

const REQUIRED_PRODUCTION_APP_URL = 'https://servsync.app';
const ENV_FILES = ['.env', '.env.local', '.env.test.local'];
const REQUIRED_CREDENTIALS = [
  'PROD_SMOKE_HOMEOWNER_EMAIL',
  'PROD_SMOKE_HOMEOWNER_PASSWORD',
  'PROD_SMOKE_CONTRACTOR_OWNER_EMAIL',
  'PROD_SMOKE_CONTRACTOR_OWNER_PASSWORD',
] as const;
const OPTIONAL_RECORD_IDS = [
  'PROD_SMOKE_CONNECTION_ID',
  'PROD_SMOKE_HOME_ID',
  'PROD_SMOKE_SHARED_PROPERTY_ID',
  'PROD_SMOKE_LOCAL_CONTACT_ID',
  'PROD_SMOKE_LOCAL_HOME_ID',
  'PROD_SMOKE_PROPERTY_PROPOSAL_ID',
  'PROD_SMOKE_SERVICE_REQUEST_ID',
  'PROD_SMOKE_INSPECTION_ID',
  'PROD_SMOKE_ESTIMATE_ID',
  'PROD_SMOKE_INVOICE_ID',
] as const;

type ProductionSmokeConfig = {
  appUrl: string;
  homeownerEmail: string;
  homeownerPassword: string;
  contractorEmail: string;
  contractorPassword: string;
};

const localEnv = loadLocalEnvFiles();
const smokeConfig = requireProductionSmokeConfig();

function loadLocalEnvFiles() {
  const values = new Map<string, string>();

  for (const fileName of ENV_FILES) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const parsed = parseEnvLine(rawLine);
      if (parsed) values.set(parsed.name, parsed.value);
    }
  }

  return values;
}

function parseEnvLine(rawLine: string) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) return null;

  const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
  const separatorIndex = withoutExport.indexOf('=');
  if (separatorIndex <= 0) return null;

  const name = withoutExport.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;

  const value = stripInlineComment(withoutExport.slice(separatorIndex + 1).trim());
  return { name, value: unquote(value) };
}

function stripInlineComment(value: string) {
  if (value.startsWith('"') || value.startsWith("'")) return value;
  const commentIndex = value.search(/\s#/);
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trim();
}

function unquote(value: string) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function valueFor(name: string) {
  return process.env[name]?.trim() || localEnv.get(name)?.trim() || '';
}

function requireProductionSmokeConfig(): ProductionSmokeConfig {
  const appUrl = valueFor('TEST_APP_URL');
  const missing = REQUIRED_CREDENTIALS.filter(name => !valueFor(name));
  const errors: string[] = [];

  if (appUrl !== REQUIRED_PRODUCTION_APP_URL) {
    errors.push(`TEST_APP_URL must be exactly ${REQUIRED_PRODUCTION_APP_URL} for production auth read-only smoke.`);
  }

  if (missing.length > 0) {
    errors.push(`Missing required production smoke variables: ${missing.join(', ')}.`);
  }

  if (errors.length > 0) {
    throw new Error(`${errors.join(' ')} Values were not printed.`);
  }

  return {
    appUrl,
    homeownerEmail: valueFor('PROD_SMOKE_HOMEOWNER_EMAIL'),
    homeownerPassword: valueFor('PROD_SMOKE_HOMEOWNER_PASSWORD'),
    contractorEmail: valueFor('PROD_SMOKE_CONTRACTOR_OWNER_EMAIL'),
    contractorPassword: valueFor('PROD_SMOKE_CONTRACTOR_OWNER_PASSWORD'),
  };
}

function authUrl(role: 'homeowner' | 'contractor') {
  return `${smokeConfig.appUrl}/#/${role}`;
}

async function signInProductionSmokeUser(page: Page, role: 'homeowner' | 'contractor', email: string, password: string) {
  await page.goto(authUrl(role), { waitUntil: 'domcontentloaded' });
  const main = page.getByRole('main');

  await expect(main.getByRole('heading', { name: /^Sign in$/i })).toBeVisible();
  await main.getByLabel(/^Email$/i).fill(email);
  await main.getByLabel(/^Password$/i).fill(password);
  await main.getByRole('button', { name: /^Sign in$/i }).click();
}

async function openSidebarTab(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click();
  await expect(page.getByRole('main')).toBeVisible();
}

async function expectActiveHeading(page: Page, name: RegExp) {
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name })).toBeVisible();
}

async function reportOptionalRecordIds(testInfo: TestInfo) {
  const statuses = OPTIONAL_RECORD_IDS.map(name => `${name}: ${valueFor(name) ? 'present' : 'missing'}`);
  await testInfo.attach('production-smoke-record-id-status.txt', {
    body: [
      'Optional production smoke record IDs are reported by variable name only.',
      'Record-specific UI assertions remain read-only and should be added only after stable selectors/labels are approved.',
      '',
      ...statuses,
    ].join('\n'),
    contentType: 'text/plain',
  });
}

test.describe('production authenticated read-only smoke', () => {
  test('homeowner smoke account can sign in and navigate read-only areas', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await test.step('preflight optional smoke record IDs', async () => {
      await reportOptionalRecordIds(testInfo);
    });

    await test.step('sign in homeowner smoke account', async () => {
      await signInProductionSmokeUser(page, 'homeowner', smokeConfig.homeownerEmail, smokeConfig.homeownerPassword);
      await expect(main.getByText(/Home command center/i)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: /^Properties$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Estimates \/ Invoices(?: \d+)?$/i })).toBeVisible();
    });

    await test.step('navigate homeowner read-only surfaces', async () => {
      await openSidebarTab(page, /^Dashboard\b/i);
      await expectActiveHeading(page, /^Dashboard$/i);

      await openSidebarTab(page, /^Properties\b/i);
      await expectActiveHeading(page, /^Properties$/i);
      await expect(main.getByRole('heading', { level: 2, name: /^Home \/ Properties$/i })).toBeVisible();

      await openSidebarTab(page, /^Contractors\b/i);
      await expectActiveHeading(page, /^Contractors$/i);
      await expect(main.getByRole('heading', { level: 2, name: /^My Contractors$/i })).toBeVisible();

      await openSidebarTab(page, /Service Requests/i);
      await expectActiveHeading(page, /^Service Requests$/i);

      await openSidebarTab(page, /Estimates \/ Invoices/i);
      await expectActiveHeading(page, /^Estimates \/ Invoices$/i);

      await openSidebarTab(page, /Home History/i);
      await expectActiveHeading(page, /^Home History$/i);
    });

    await consoleErrors.assertClean(testInfo);
  });

  test('contractor owner smoke account can sign in and navigate read-only areas', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await test.step('preflight optional smoke record IDs', async () => {
      await reportOptionalRecordIds(testInfo);
    });

    await test.step('sign in contractor owner smoke account', async () => {
      await signInProductionSmokeUser(page, 'contractor', smokeConfig.contractorEmail, smokeConfig.contractorPassword);
      await expect(main.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
      await expect(main.getByRole('heading', { name: /Workflow overview/i })).toBeVisible();
    });

    await test.step('navigate contractor read-only surfaces', async () => {
      await openSidebarTab(page, /^Dashboard\b/i);
      await expectActiveHeading(page, /^Dashboard$/i);

      await openSidebarTab(page, /Homeowners/i);
      await expectActiveHeading(page, /^Homeowners$/i);
      await expect(main.getByPlaceholder(/Search homeowner, city, address/i)).toBeVisible();

      await openSidebarTab(page, /Service Requests/i);
      await expectActiveHeading(page, /^Service Requests$/i);

      await openSidebarTab(page, /^Jobs\b/i);
      await expectActiveHeading(page, /^Jobs$/i);
      await expect(main.getByRole('heading', { level: 3, name: /^Estimates \/ Invoices$/i })).toBeVisible();

      await openSidebarTab(page, /^Calendar\b/i);
      await expectActiveHeading(page, /^Calendar$/i);
    });

    await consoleErrors.assertClean(testInfo);
  });
});
