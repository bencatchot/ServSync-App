import { expect, test, type Page } from '@playwright/test';

const CONTRACTOR_A = '00000000-0000-4000-8000-000000000201';
const CONTRACTOR_B = '00000000-0000-4000-8000-000000000202';
const DRAFT_A = '00000000-0000-4000-8000-000000000203';
const DRAFT_B = '00000000-0000-4000-8000-000000000204';
const HOMEOWNER_A = '00000000-0000-4000-8000-000000000205';
const HOME_A = '00000000-0000-4000-8000-000000000206';
const HOMEOWNER_B = '00000000-0000-4000-8000-000000000207';
const HOME_B = '00000000-0000-4000-8000-000000000208';
const REQUEST_ID = '00000000-0000-4000-8000-000000000209';
const LEGACY_ID = '00000000-0000-4000-8000-000000000210';
const HOME_B_SECONDARY = '00000000-0000-4000-8000-000000000211';
const ESTIMATE_ID = '00000000-0000-4000-8000-000000000212';
const JOB_ID = '00000000-0000-4000-8000-000000000213';

async function installWorkspaceHarness(page: Page) {
  await page.goto('/');
  await page.evaluate(async ({ ids }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const workspaceModule = await dynamicImport('/src/features/drafts/DurableDraftWorkspace.tsx');
    const mappingModule = await dynamicImport('/src/features/drafts/draftComposerMappings.ts');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const DurableDraftWorkspace = workspaceModule.DurableDraftWorkspace as (...args: unknown[]) => unknown;
    const createBlankDraft = mappingModule.createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;

    document.body.innerHTML = '<div id="durable-test-root"></div>';
    const root = createRoot(document.getElementById('durable-test-root') as HTMLElement);
    type PendingCall = {
      client: string;
      kind: 'list' | 'rpc' | 'output';
      name: string;
      args: unknown;
      settled: boolean;
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    };
    const calls: PendingCall[] = [];
    const deferred = () => {
      let resolve!: (value: unknown) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<unknown>((next, fail) => { resolve = next; reject = fail; });
      return { promise, resolve, reject };
    };
    const makeClient = (clientName: string) => ({
      rpc(name: string, args: unknown) {
        const next = deferred();
        calls.push({ client: clientName, kind: 'rpc', name, args, settled: false, resolve: next.resolve, reject: next.reject });
        return next.promise;
      },
      from(name: string) {
        const next = deferred();
        const call: PendingCall = { client: clientName, kind: 'list', name, args: null, settled: false, resolve: next.resolve, reject: next.reject };
        calls.push(call);
        const query = {
          select() { return query; },
          in(_column: string, values: string[]) { call.args = values; return query; },
          order() { return query; },
          then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) { return next.promise.then(resolve, reject); },
        };
        return query;
      },
    });
    const clients = { A: makeClient('A'), B: makeClient('B') };
    const initialDraft = createBlankDraft({
      subject_type: 'connected',
      homeowner_user_id: ids.homeownerA,
      home_id: ids.homeA,
      service_request_id: ids.requestId,
      title: 'Initial plan',
      scope: 'Initial scope',
      notes: 'Private note',
      line_items: [],
    });
    const state = {
      mode: 'list' as 'list' | 'editor',
      target: null as Record<string, unknown> | null,
      contractorId: ids.contractorA,
      clientName: 'A' as 'A' | 'B',
      legacyDrafts: [] as Record<string, unknown>[],
      backCount: 0,
      openCount: 0,
    };
    const capabilities = () => ({
      contractorId: state.contractorId,
      canReadDrafts: true,
      canPersistDraft: true,
      canImportLegacyDraft: true,
      canLaunchJob: true,
      canLaunchEstimate: true,
    });
    const render = () => root.render(React.createElement(DurableDraftWorkspace, {
      client: clients[state.clientName],
      mode: state.mode,
      capabilities: capabilities(),
      target: state.target,
      legacyDrafts: state.legacyDrafts,
      connectedOptions: [
        { id: ids.homeownerA, label: 'Customer A', properties: [{ id: ids.homeA, label: 'Home A' }] },
        { id: ids.homeownerB, label: 'Customer B', properties: [{ id: ids.homeB, label: 'Home B' }, { id: ids.homeBSecondary, label: 'Home B Secondary' }] },
      ],
      localOptions: [],
      customerLabel: () => 'Legacy customer',
      propertyLabel: () => 'Legacy home',
      onStartNew: () => {
        state.target = { kind: 'new', initialDraft };
        state.mode = 'editor';
        render();
      },
      onOpenTarget: (target: Record<string, unknown>) => {
        state.openCount += 1;
        state.target = target;
        state.mode = 'editor';
        render();
      },
      onBack: () => {
        state.backCount += 1;
        state.target = null;
        state.mode = 'list';
        render();
      },
      onOpenOutput: (type: string, id: string) => {
        const next = deferred();
        calls.push({ client: state.clientName, kind: 'output', name: type, args: id, settled: false, resolve: next.resolve, reject: next.reject });
        return next.promise;
      },
    }));
    const rawDraft = (draftId: string, contractorId: string, title: string, overrides: Record<string, unknown> = {}) => ({
      id: draftId,
      contractor_id: contractorId,
      created_by_user_id: null,
      subject_type: 'connected_homeowner',
      homeowner_user_id: ids.homeownerA,
      home_id: ids.homeA,
      local_contact_id: null,
      local_home_id: null,
      service_request_id: ids.requestId,
      subject_display_name_snapshot: 'Customer A',
      property_display_snapshot: 'Home A',
      title,
      scope_description: 'Initial scope',
      private_notes: 'Private note',
      intended_output: null,
      work_format: 'standard',
      labor_mode: 'line_specific',
      labor_rate_cents: null,
      job_labor_hours: null,
      status: 'active',
      legacy_inspection_id: null,
      launched_output_type: null,
      launched_estimate_id: null,
      launched_job_id: null,
      launched_estimate_id_snapshot: null,
      launched_job_id_snapshot: null,
      launched_at: null,
      launched_by_user_id: null,
      created_at: '2026-07-19T10:00:00.000Z',
      updated_at: '2026-07-19T10:00:00.000Z',
      ...overrides,
    });
    const envelope = (draftId: string, contractorId: string, title: string, overrides: Record<string, unknown> = {}) => ({
      draft: rawDraft(draftId, contractorId, title, overrides),
      items: [],
      launches: [],
    });
    const row = (draftId: string, contractorId: string, title: string, overrides: Record<string, unknown> = {}) => ({
      id: draftId,
      contractor_id: contractorId,
      subject_type: 'connected_homeowner',
      subject_display_name_snapshot: 'Customer A',
      property_display_snapshot: 'Home A',
      title,
      intended_output: null,
      work_format: 'standard',
      status: 'active',
      legacy_inspection_id: null,
      launched_output_type: null,
      launched_estimate_id: null,
      launched_job_id: null,
      launched_estimate_id_snapshot: null,
      launched_job_id_snapshot: null,
      launched_at: null,
      created_at: '2026-07-19T10:00:00.000Z',
      updated_at: '2026-07-19T10:00:00.000Z',
      ...overrides,
    });
    const harness = {
      render,
      showList() { state.mode = 'list'; state.target = null; render(); },
      showTarget(target: Record<string, unknown> | null) { state.mode = 'editor'; state.target = target; render(); },
      showNew() { state.mode = 'editor'; state.target = { kind: 'new', initialDraft }; render(); },
      switchContext(contractorId: string, clientName: 'A' | 'B') { state.contractorId = contractorId; state.clientName = clientName; render(); },
      setLegacy(enabled: boolean) {
        state.legacyDrafts = enabled ? [{ id: ids.legacyId, name: 'Earlier plan', updated_at: '2026-07-19T10:00:00.000Z', job_origin: 'draft_composer', status: 'draft', job_status: 'draft' }] : [];
        render();
      },
      complete(kind: PendingCall['kind'], name: string, data: unknown, clientName?: string) {
        const call = calls.find(candidate => !candidate.settled && candidate.kind === kind && candidate.name === name && (!clientName || candidate.client === clientName));
        if (!call) throw new Error(`Missing pending ${kind}:${name}:${clientName ?? '*'}`);
        call.settled = true;
        call.resolve({ data, error: null, status: 200 });
      },
      completeLast(kind: PendingCall['kind'], name: string, data: unknown, clientName?: string) {
        const matching = calls.filter(candidate => !candidate.settled && candidate.kind === kind && candidate.name === name && (!clientName || candidate.client === clientName));
        const call = matching[matching.length - 1];
        if (!call) throw new Error(`Missing pending ${kind}:${name}:${clientName ?? '*'}`);
        call.settled = true;
        call.resolve({ data, error: null, status: 200 });
      },
      fail(kind: PendingCall['kind'], name: string, clientName?: string) {
        const call = calls.find(candidate => !candidate.settled && candidate.kind === kind && candidate.name === name && (!clientName || candidate.client === clientName));
        if (!call) throw new Error(`Missing pending ${kind}:${name}:${clientName ?? '*'}`);
        call.settled = true;
        call.resolve({ data: null, error: { message: 'network failure' }, status: 503 });
      },
      reject(kind: PendingCall['kind'], name: string, clientName?: string) {
        const call = calls.find(candidate => !candidate.settled && candidate.kind === kind && candidate.name === name && (!clientName || candidate.client === clientName));
        if (!call) throw new Error(`Missing pending ${kind}:${name}:${clientName ?? '*'}`);
        call.settled = true;
        call.reject(new Error('navigation failed'));
      },
      callCount(kind: PendingCall['kind'], name: string, clientName?: string) {
        return calls.filter(call => call.kind === kind && call.name === name && (!clientName || call.client === clientName)).length;
      },
      calls() { return calls.map(({ client, kind, name, args, settled }) => ({ client, kind, name, args, settled })); },
      snapshot() { return { ...state, target: state.target ? { ...state.target, initialDraft: undefined } : null }; },
      envelope,
      row,
    };
    (window as typeof window & { __durableHarness: typeof harness }).__durableHarness = harness;
    render();
  }, { ids: {
    contractorA: CONTRACTOR_A,
    homeownerA: HOMEOWNER_A,
    homeA: HOME_A,
    homeownerB: HOMEOWNER_B,
    homeB: HOME_B,
    homeBSecondary: HOME_B_SECONDARY,
    requestId: REQUEST_ID,
    legacyId: LEGACY_ID,
  } });
}

test.describe('Slice 2C-B rendered durable Draft behavior', () => {
  test('normalizes a targetless editor to the list without persistence', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(() => window.__durableHarness.showTarget(null));
    await expect(page.getByTestId('durable-draft-list')).toBeVisible();
    await expect(page.getByText('Loading Draft…')).toHaveCount(0);
    expect(await page.evaluate(() => window.__durableHarness.snapshot().backCount)).toBe(1);
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_save_work_draft'))).toBe(0);
  });

  test('ignores stale contractor list success responses', async ({ page }) => {
    await installWorkspaceHarness(page);
    await expect.poll(() => page.evaluate(() => window.__durableHarness.callCount('list', 'contractor_work_drafts', 'A'))).toBe(1);
    await page.evaluate(({ contractorB }) => window.__durableHarness.switchContext(contractorB, 'B'), { contractorB: CONTRACTOR_B });
    await expect.poll(() => page.evaluate(() => window.__durableHarness.callCount('list', 'contractor_work_drafts', 'B'))).toBe(1);
    await page.evaluate(({ draftB, contractorB }) => window.__durableHarness.complete('list', 'contractor_work_drafts', [window.__durableHarness.row(draftB, contractorB, 'B Draft')], 'B'), { draftB: DRAFT_B, contractorB: CONTRACTOR_B });
    await expect(page.getByText('B Draft')).toBeVisible();
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('list', 'contractor_work_drafts', [window.__durableHarness.row(draftA, contractorA, 'A Draft')], 'A'), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await expect(page.getByText('A Draft')).toHaveCount(0);
    await expect(page.getByText('B Draft')).toBeVisible();
  });

  test('ignores stale contractor errors and supports guarded list retry', async ({ page }) => {
    await installWorkspaceHarness(page);
    await expect.poll(() => page.evaluate(() => window.__durableHarness.callCount('list', 'contractor_work_drafts', 'A'))).toBe(1);
    await page.evaluate(({ contractorB }) => window.__durableHarness.switchContext(contractorB, 'B'), { contractorB: CONTRACTOR_B });
    await expect.poll(() => page.evaluate(() => window.__durableHarness.callCount('list', 'contractor_work_drafts', 'B'))).toBe(1);
    await page.evaluate(({ draftB, contractorB }) => window.__durableHarness.complete('list', 'contractor_work_drafts', [window.__durableHarness.row(draftB, contractorB, 'B Draft')], 'B'), { draftB: DRAFT_B, contractorB: CONTRACTOR_B });
    await page.evaluate(() => window.__durableHarness.fail('list', 'contractor_work_drafts', 'A'));
    await expect(page.getByText('B Draft')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Again' })).toHaveCount(0);

    await page.evaluate(({ contractorA }) => window.__durableHarness.switchContext(contractorA, 'A'), { contractorA: CONTRACTOR_A });
    await expect.poll(() => page.evaluate(() => window.__durableHarness.callCount('list', 'contractor_work_drafts', 'A'))).toBe(2);
    await page.evaluate(() => window.__durableHarness.fail('list', 'contractor_work_drafts', 'A'));
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    await page.getByRole('button', { name: 'Try Again' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    expect(await page.evaluate(() => window.__durableHarness.callCount('list', 'contractor_work_drafts', 'A'))).toBe(3);
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('list', 'contractor_work_drafts', [window.__durableHarness.row(draftA, contractorA, 'Recovered Draft')], 'A'), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await expect(page.getByText('Recovered Draft')).toBeVisible();
  });

  test('canonicalizes the first save, reuses its ID, and blocks synchronous duplicate saves', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(() => window.__durableHarness.showNew());
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_save_work_draft'))).toBe(0);
    await page.getByRole('button', { name: 'Save Draft' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_save_work_draft'))).toBe(1);
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('rpc', 'servsync_save_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Initial plan')), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await expect(page.getByTestId('durable-draft-save-success')).toBeVisible();
    expect(await page.evaluate(() => window.__durableHarness.snapshot().target)).toEqual({ kind: 'durable', draftId: DRAFT_A, initialDraft: undefined });
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_get_work_draft'))).toBe(0);

    await page.getByLabel('Draft title').fill('Updated plan');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    const calls = await page.evaluate(() => window.__durableHarness.calls());
    expect(calls.filter(call => call.name === 'servsync_save_work_draft')[1].args).toMatchObject({ p_draft_id: DRAFT_A });
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('rpc', 'servsync_save_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Updated plan')), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await expect(page.getByLabel('Draft title')).toHaveValue('Updated plan');
  });

  test('preserves local edits after save failure, retries, and ignores a later save after leaving', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(() => window.__durableHarness.showNew());
    await page.getByLabel('Draft title').fill('Unsaved local title');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.evaluate(() => window.__durableHarness.fail('rpc', 'servsync_save_work_draft'));
    await expect(page.getByLabel('Draft title')).toHaveValue('Unsaved local title');
    await expect(page.getByTestId('durable-draft-save-error')).toBeVisible();
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('rpc', 'servsync_save_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Unsaved local title')), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await expect(page.getByTestId('durable-draft-save-success')).toBeVisible();
    await page.getByLabel('Draft title').fill('Later local edit');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.evaluate(() => window.__durableHarness.showList());
    await expect(page.getByTestId('durable-draft-list')).toBeVisible();
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('rpc', 'servsync_save_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Late saved title')), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await expect(page.getByTestId('durable-draft-list')).toBeVisible();
    await expect(page.getByText('Late saved title')).toHaveCount(0);
  });

  test('keeps Draft B open when Draft A resolves late', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(({ draftA }) => window.__durableHarness.showTarget({ kind: 'durable', draftId: draftA }), { draftA: DRAFT_A });
    await page.evaluate(({ draftB }) => window.__durableHarness.showTarget({ kind: 'durable', draftId: draftB }), { draftB: DRAFT_B });
    await page.evaluate(({ draftB, contractorA }) => window.__durableHarness.completeLast('rpc', 'servsync_get_work_draft', window.__durableHarness.envelope(draftB, contractorA, 'Draft B')), { draftB: DRAFT_B, contractorA: CONTRACTOR_A });
    await expect(page.getByLabel('Draft title')).toHaveValue('Draft B');
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('rpc', 'servsync_get_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Draft A')), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await expect(page.getByLabel('Draft title')).toHaveValue('Draft B');
  });

  test('clears hidden service request identity after customer and property changes', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(({ draftA }) => window.__durableHarness.showTarget({ kind: 'durable', draftId: draftA }), { draftA: DRAFT_A });
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('rpc', 'servsync_get_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Request-backed')), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await page.getByTestId('durable-draft-customer').selectOption(HOMEOWNER_B);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    let calls = await page.evaluate(() => window.__durableHarness.calls());
    expect(calls.find(call => call.name === 'servsync_save_work_draft')?.args).toMatchObject({ p_metadata: { service_request_id: null } });
    await page.evaluate(({ draftA, contractorA, ids }) => window.__durableHarness.complete('rpc', 'servsync_save_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Request-backed', { homeowner_user_id: ids.homeownerB, home_id: ids.homeB, service_request_id: null })), { draftA: DRAFT_A, contractorA: CONTRACTOR_A, ids: { homeownerB: HOMEOWNER_B, homeB: HOME_B } });
    await page.getByTestId('durable-draft-property').selectOption(HOME_B_SECONDARY);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    calls = await page.evaluate(() => window.__durableHarness.calls());
    expect(calls.filter(call => call.name === 'servsync_save_work_draft')[1].args).toMatchObject({ p_metadata: { service_request_id: null } });
  });

  test('guards legacy import double click and canonicalizes exactly once', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(() => window.__durableHarness.setLegacy(true));
    await page.evaluate(() => window.__durableHarness.complete('list', 'contractor_work_drafts', [], 'A'));
    const continueButton = page.getByRole('button', { name: 'Continue Draft' });
    await continueButton.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    expect(await page.evaluate(() => window.__durableHarness.snapshot().openCount)).toBe(1);
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_import_legacy_draft_job'))).toBe(1);
    await page.evaluate(({ draftA }) => window.__durableHarness.complete('rpc', 'servsync_import_legacy_draft_job', draftA), { draftA: DRAFT_A });
    await page.evaluate(({ draftA, contractorA, legacyId }) => window.__durableHarness.complete('rpc', 'servsync_get_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Imported', { legacy_inspection_id: legacyId })), { draftA: DRAFT_A, contractorA: CONTRACTOR_A, legacyId: LEGACY_ID });
    await expect(page.getByLabel('Draft title')).toHaveValue('Imported');
    expect(await page.evaluate(() => window.__durableHarness.snapshot().target)).toEqual({ kind: 'durable', draftId: DRAFT_A, initialDraft: undefined });
  });

  test('preserves a legacy row after import failure and permits retry', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(() => window.__durableHarness.setLegacy(true));
    await page.evaluate(() => window.__durableHarness.complete('list', 'contractor_work_drafts', [], 'A'));
    await page.getByRole('button', { name: 'Continue Draft' }).click();
    await page.evaluate(() => window.__durableHarness.fail('rpc', 'servsync_import_legacy_draft_job'));
    await expect(page.getByTestId('durable-draft-open-error')).toBeVisible();
    await page.getByRole('button', { name: 'Back to Work' }).click();
    await page.evaluate(() => window.__durableHarness.complete('list', 'contractor_work_drafts', [], 'A'));
    await expect(page.getByText('Earlier plan')).toBeVisible();
    await page.getByRole('button', { name: 'Continue Draft' }).click();
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_import_legacy_draft_job'))).toBe(2);
  });

  test('guards repeated active Draft open clicks', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('list', 'contractor_work_drafts', [window.__durableHarness.row(draftA, contractorA, 'Active Draft')], 'A'), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await page.getByRole('button', { name: 'Continue Draft' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    expect(await page.evaluate(() => window.__durableHarness.snapshot().openCount)).toBe(1);
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_get_work_draft'))).toBe(1);
  });

  test('prompts on dirty Back and leaves the saved Draft intact', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(({ draftA }) => window.__durableHarness.showTarget({ kind: 'durable', draftId: draftA }), { draftA: DRAFT_A });
    await page.evaluate(({ draftA, contractorA }) => window.__durableHarness.complete('rpc', 'servsync_get_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Saved Draft')), { draftA: DRAFT_A, contractorA: CONTRACTOR_A });
    await page.getByLabel('Draft title').fill('Local edit');
    page.once('dialog', dialog => void dialog.dismiss());
    await page.getByRole('button', { name: 'Back to Work' }).click();
    await expect(page.getByLabel('Draft title')).toHaveValue('Local edit');
    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Back to Work' }).click();
    await expect(page.getByTestId('durable-draft-list')).toBeVisible();
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_save_work_draft'))).toBe(0);
  });

  test('keeps a consumed Draft visible when output navigation fails and allows retry', async ({ page }) => {
    await installWorkspaceHarness(page);
    await page.evaluate(({ draftA }) => window.__durableHarness.showTarget({ kind: 'durable', draftId: draftA }), { draftA: DRAFT_A });
    await page.evaluate(({ draftA, contractorA, estimateId }) => window.__durableHarness.complete('rpc', 'servsync_get_work_draft', window.__durableHarness.envelope(draftA, contractorA, 'Consumed Draft', {
      status: 'consumed',
      intended_output: 'estimate',
      launched_output_type: 'estimate',
      launched_estimate_id: estimateId,
      launched_estimate_id_snapshot: estimateId,
      launched_at: '2026-07-19T11:00:00.000Z',
    })), { draftA: DRAFT_A, contractorA: CONTRACTOR_A, estimateId: ESTIMATE_ID });
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await page.getByRole('button', { name: 'Open Estimate' }).click();
    await page.evaluate(() => window.__durableHarness.reject('output', 'estimate'));
    await expect(page.getByText('The Estimate could not be opened. Try again.')).toBeVisible();
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Estimate' })).toBeEnabled();
    await page.getByRole('button', { name: 'Open Estimate' }).click();
    expect(await page.evaluate(() => window.__durableHarness.callCount('output', 'estimate'))).toBe(2);
    expect(await page.evaluate(() => window.__durableHarness.callCount('rpc', 'servsync_launch_work_draft'))).toBe(0);
  });

  for (const output of [{ type: 'estimate', id: ESTIMATE_ID }, { type: 'job', id: JOB_ID }] as const) {
    test(`renders a deleted ${output.type} honestly without an open action`, async ({ page }) => {
      await installWorkspaceHarness(page);
      await page.evaluate(({ draftA }) => window.__durableHarness.showTarget({ kind: 'durable', draftId: draftA }), { draftA: DRAFT_A });
      await page.evaluate(({ draftA, contractorA, output }) => window.__durableHarness.complete('rpc', 'servsync_get_work_draft', window.__durableHarness.envelope(draftA, contractorA, `Deleted ${output.type}`, {
        status: 'consumed',
        intended_output: output.type,
        launched_output_type: output.type,
        launched_estimate_id: null,
        launched_job_id: null,
        launched_estimate_id_snapshot: output.type === 'estimate' ? output.id : null,
        launched_job_id_snapshot: output.type === 'job' ? output.id : null,
        launched_at: '2026-07-19T11:00:00.000Z',
      })), { draftA: DRAFT_A, contractorA: CONTRACTOR_A, output });
      await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
      await expect(page.getByText(new RegExp(`created an ${output.type === 'estimate' ? 'Estimate' : 'Job'} that is no longer available`))).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(`Open ${output.type}`, 'i') })).toHaveCount(0);
    });
  }
});

declare global {
  interface Window {
    __durableHarness: {
      showList: () => void;
      showTarget: (target: Record<string, unknown> | null) => void;
      showNew: () => void;
      switchContext: (contractorId: string, clientName: 'A' | 'B') => void;
      setLegacy: (enabled: boolean) => void;
      complete: (kind: 'list' | 'rpc' | 'output', name: string, data: unknown, clientName?: string) => void;
      completeLast: (kind: 'list' | 'rpc' | 'output', name: string, data: unknown, clientName?: string) => void;
      fail: (kind: 'list' | 'rpc' | 'output', name: string, clientName?: string) => void;
      reject: (kind: 'list' | 'rpc' | 'output', name: string, clientName?: string) => void;
      callCount: (kind: 'list' | 'rpc' | 'output', name: string, clientName?: string) => number;
      calls: () => Array<{ client: string; kind: string; name: string; args: Record<string, unknown>; settled: boolean }>;
      snapshot: () => { backCount: number; openCount: number; target: Record<string, unknown> | null };
      envelope: (draftId: string, contractorId: string, title: string, overrides?: Record<string, unknown>) => Record<string, unknown>;
      row: (draftId: string, contractorId: string, title: string, overrides?: Record<string, unknown>) => Record<string, unknown>;
    };
  }
}
