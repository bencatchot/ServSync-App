import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyDraftCustomerSelection,
  buildDraftCustomerOptions,
  defaultDraftPropertyId,
  draftCustomerOptionKey,
  draftCustomerOptionLabel,
  draftCustomerOptionsWithSavedSelection,
  selectedDraftCustomerKey,
  type DraftCustomerOption,
} from '../../src/features/drafts/draftCustomerOptions';
import { createBlankDraftJobComposerDraft, draftJobMetadataPayload } from '../../src/features/jobs/draftJobMappings';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const connectedCandidate = (overrides: Partial<Parameters<typeof buildDraftCustomerOptions>[0]['connectedCustomers'][number]> = {}) => ({
  contractorId: 'contractor-a',
  customerId: 'shared-id',
  label: 'Alex Customer',
  connectionStatus: 'active',
  properties: [{ id: 'connected-home-1', label: 'Main Home' }],
  ...overrides,
});

const localCandidate = (overrides: Partial<Parameters<typeof buildDraftCustomerOptions>[0]['localCustomers'][number]> = {}) => ({
  contractorId: 'contractor-a',
  customerId: 'shared-id',
  label: 'Alex Customer',
  claimed: false,
  invitationPending: false,
  properties: [{ id: 'local-home-1', label: '123 Main Street' }],
  ...overrides,
});

const buildOptions = (overrides: Partial<Parameters<typeof buildDraftCustomerOptions>[0]> = {}) => buildDraftCustomerOptions({
  contractorId: 'contractor-a',
  connectedCustomers: [connectedCandidate()],
  localCustomers: [localCandidate()],
  ...overrides,
});

async function installUnifiedComposerHarness(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const composerModule = await dynamicImport('/src/features/drafts/ContractorDraftComposer.tsx');
    const mappingModule = await dynamicImport('/src/features/drafts/draftComposerMappings.ts');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const ContractorDraftComposer = composerModule.ContractorDraftComposer as (...args: unknown[]) => unknown;
    const createBlankDraft = mappingModule.createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;
    const state = {
      draft: createBlankDraft({ intended_output: null, title: 'Unified customer Draft' }),
    };
    const customerOptions = [
      {
        key: 'connected:same-id', subjectType: 'connected', customerId: 'same-id', label: 'Alex Customer',
        status: 'connected', statusLabel: 'Connected', properties: [{ id: 'home-1', label: 'Main Home' }],
      },
      {
        key: 'local:same-id', subjectType: 'local', customerId: 'same-id', label: 'Alex Customer',
        status: 'invitation_pending', statusLabel: 'Invitation pending', properties: [
          { id: 'local-home-1', label: '123 Main Street' },
          { id: 'local-home-2', label: '456 Oak Street' },
        ],
      },
    ];

    document.body.innerHTML = '<main id="unified-customer-root"></main>';
    const root = createRoot(document.getElementById('unified-customer-root') as HTMLElement);
    const render = () => root.render(React.createElement(ContractorDraftComposer, {
      draft: state.draft,
      customerOptions,
      checklistOptions: [],
      canSave: true,
      saving: false,
      onChange: (draft: Record<string, unknown>) => { state.draft = draft; render(); },
      onSave: () => undefined,
      onBack: () => undefined,
      onRemovePersistedLine: () => undefined,
    }));
    render();
  });
}

test.describe('unified Draft customer options', () => {
  test('includes active connected, unclaimed local, and invitation-pending local customers', () => {
    const options = buildOptions({
      localCustomers: [
        localCandidate({ customerId: 'local-plain' }),
        localCandidate({ customerId: 'local-pending', invitationPending: true }),
      ],
    });

    expect(options.map(option => [option.key, option.status])).toEqual([
      ['connected:shared-id', 'connected'],
      ['local:local-pending', 'invitation_pending'],
      ['local:local-plain', 'not_connected'],
    ]);
  });

  test('excludes inactive connections, claimed local duplicates, and cross-tenant records', () => {
    const options = buildOptions({
      connectedCustomers: [
        connectedCandidate({ customerId: 'active' }),
        connectedCandidate({ customerId: 'inactive', connectionStatus: 'inactive' }),
        connectedCandidate({ customerId: 'declined', connectionStatus: 'declined' }),
        connectedCandidate({ customerId: 'other-tenant', contractorId: 'contractor-b' }),
      ],
      localCustomers: [
        localCandidate({ customerId: 'eligible' }),
        localCandidate({ customerId: 'claimed', claimed: true }),
        localCandidate({ customerId: 'other-tenant', contractorId: 'contractor-b' }),
      ],
    });

    expect(options.map(option => option.key)).toEqual(['connected:active', 'local:eligible']);
  });

  test('uses collision-safe keys and customer-facing status and property context', () => {
    const options = buildOptions();
    expect(options.map(option => option.key)).toEqual(['connected:shared-id', 'local:shared-id']);
    expect(options.map(draftCustomerOptionLabel)).toEqual([
      'Alex Customer — Connected · Main Home',
      'Alex Customer — Not connected · 123 Main Street',
    ]);
  });
});

test.describe('unified Draft subject mapping', () => {
  const option = (overrides: Partial<DraftCustomerOption> = {}): DraftCustomerOption => ({
    key: 'connected:connected-customer',
    subjectType: 'connected',
    customerId: 'connected-customer',
    label: 'Connected Customer',
    status: 'connected',
    statusLabel: 'Connected',
    properties: [{ id: 'home-1', label: 'Home 1' }],
    ...overrides,
  });

  test('maps connected selections atomically and preserves the persisted payload contract', () => {
    const starting = createBlankDraftJobComposerDraft({
      subject_type: 'local',
      local_contact_id: 'old-local',
      local_home_id: 'old-local-home',
      service_request_id: 'old-request',
      title: 'Preserved title',
    });
    const selected = applyDraftCustomerSelection(starting, option());

    expect(selected).toMatchObject({
      subject_type: 'connected',
      homeowner_user_id: 'connected-customer',
      home_id: 'home-1',
      local_contact_id: '',
      local_home_id: '',
      service_request_id: '',
      title: 'Preserved title',
    });
    expect(selectedDraftCustomerKey(selected)).toBe('connected:connected-customer');
    expect(draftJobMetadataPayload(selected)).toMatchObject({
      p_homeowner_user_id: 'connected-customer',
      p_home_id: 'home-1',
      p_local_contact_id: null,
      p_local_home_id: null,
      p_service_request_id: null,
    });
  });

  test('maps local selections atomically and clears connected identifiers', () => {
    const starting = createBlankDraftJobComposerDraft({
      homeowner_user_id: 'old-connected',
      home_id: 'old-home',
      service_request_id: 'old-request',
    });
    const selected = applyDraftCustomerSelection(starting, option({
      key: 'local:local-customer',
      subjectType: 'local',
      customerId: 'local-customer',
      status: 'not_connected',
      statusLabel: 'Not connected',
      properties: [{ id: 'local-home', label: 'Local Home' }],
    }));

    expect(selected).toMatchObject({
      subject_type: 'local',
      homeowner_user_id: '',
      home_id: '',
      local_contact_id: 'local-customer',
      local_home_id: 'local-home',
      service_request_id: '',
    });
    expect(draftJobMetadataPayload(selected)).toMatchObject({
      p_homeowner_user_id: null,
      p_home_id: null,
      p_local_contact_id: 'local-customer',
      p_local_home_id: 'local-home',
    });
  });
});

test.describe('unified Draft property defaults and saved subjects', () => {
  test('retains an explicit authorized property and rejects stale explicit context', () => {
    const properties = [{ id: 'home-1', label: 'Home 1' }, { id: 'home-2', label: 'Home 2' }];
    expect(defaultDraftPropertyId(properties, 'home-2')).toBe('home-2');
    expect(defaultDraftPropertyId(properties, 'not-authorized')).toBe('');
  });

  test('selects exactly one property and never guesses among multiple or none', () => {
    expect(defaultDraftPropertyId([{ id: 'only', label: 'Only' }])).toBe('only');
    expect(defaultDraftPropertyId([{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }])).toBe('');
    expect(defaultDraftPropertyId([])).toBe('');
  });

  test('keeps persisted Draft options within the canonical saved subject type', () => {
    const draft = createBlankDraftJobComposerDraft({
      subject_type: 'local',
      local_contact_id: 'shared-id',
      local_home_id: 'local-home-1',
    });
    const options = draftCustomerOptionsWithSavedSelection(buildOptions(), draft, true, {
      customer: 'Saved customer',
      property: 'Saved property',
    });

    expect(options.map(item => item.key)).toEqual(['local:shared-id']);
    expect(options[0].subjectType).toBe('local');
  });

  test('restores an ineligible historical local subject as a local-only fallback', () => {
    const draft = createBlankDraftJobComposerDraft({
      subject_type: 'local',
      local_contact_id: 'claimed-history',
      local_home_id: 'claimed-home',
    });
    const options = draftCustomerOptionsWithSavedSelection(buildOptions(), draft, true, {
      customer: 'Historical customer',
      property: 'Historical property',
    });

    expect(options).toContainEqual(expect.objectContaining({
      key: draftCustomerOptionKey('local', 'claimed-history'),
      subjectType: 'local',
      customerId: 'claimed-history',
      savedFallback: true,
      properties: [{ id: 'claimed-home', label: 'Historical property' }],
    }));
    expect(options.every(item => item.subjectType === 'local')).toBeTruthy();
  });
});

test.describe('unified Draft UI wiring', () => {
  test('both composers expose one Customer selector and no Connection status selector', () => {
    const durable = read('src/features/drafts/ContractorDraftComposer.tsx');
    const legacy = read('src/features/jobs/DraftJobComposer.tsx');

    for (const source of [durable, legacy]) {
      expect(source).toContain("composerField('Customer'");
      expect(source).toContain('draftCustomerOptionLabel(option)');
      expect(source).toContain('applyDraftCustomerSelection(draft, option)');
      expect(source).not.toContain("composerField('Connection status'");
      expect(source).not.toContain('durable-draft-customer-type');
    }
    expect(durable).toContain('updateDraftSubject(option');
    expect(durable).toContain('checklist_source: null');
  });

  test('customer-profile initial entry routes through one neutral Create Draft action', () => {
    const app = read('src/App.tsx');
    const profileStart = app.indexOf("{activeTabId === 'overview'");
    const profileEnd = app.indexOf("{/* INSPECTIONS TAB */}", profileStart);
    const profile = app.slice(profileStart, profileEnd > profileStart ? profileEnd : undefined);

    expect(app).toContain('const startCustomerProfileDraft = (');
    expect(app).toContain("if (!DRAFT_JOB_UI_ENABLED) {\n      setError('Draft creation is not available in this environment.');");
    expect(app).toContain('const customerProfileDraftDisabled = !DRAFT_JOB_UI_ENABLED');
    expect(app).toContain('{ intendedOutput: null }');
    expect(profile).toContain('Plan an estimate, job, or invoice');
    expect(profile).toContain('openCustomerProfileDraft');
    expect(profile).not.toContain('<p className="mt-2 text-sm font-bold">Create job</p>');
    expect(profile).not.toContain('<p className="mt-2 text-sm font-bold">Create estimate</p>');
    expect(profile).not.toContain('<p className="mt-2 text-sm font-bold">Create invoice</p>');
    expect(app).toContain('data-testid="contractor-create-job-from-accepted-estimate"');
    expect(app).toContain('Create invoice from estimate');
  });

  for (const viewport of [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`renders one accessible selector with safe property defaults on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await installUnifiedComposerHarness(page);

      const customer = page.getByTestId('durable-draft-customer');
      const property = page.getByTestId('durable-draft-property');
      await expect(customer).toBeVisible();
      await expect(customer).toHaveAccessibleName('Customer');
      await expect(page.getByTestId('durable-draft-customer-type')).toHaveCount(0);
      await expect(customer.locator('option')).toContainText([
        'Choose customer...',
        'Alex Customer — Connected · Main Home',
        'Alex Customer — Invitation pending · 2 properties',
      ]);

      await customer.focus();
      await customer.selectOption('connected:same-id');
      await expect(property).toHaveValue('home-1');
      await customer.selectOption('local:same-id');
      await expect(property).toHaveValue('');
      await expect(property.locator('option')).toContainText(['Choose property...', '123 Main Street', '456 Oak Street']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    });
  }
});
