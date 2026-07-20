import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  createPostLaunchNavigationEligibility,
  INITIAL_POST_LAUNCH_NAVIGATION_STATE,
  postLaunchNavigationContextMatches,
  postLaunchNavigationReducer,
  resolvePostLaunchNavigationIntent,
} from '../../src/features/drafts/durableDraftPostLaunchNavigation';

const IDS = {
  contractor: '10000000-0000-4000-8000-000000000001',
  otherContractor: '10000000-0000-4000-8000-000000000002',
  draft: '10000000-0000-4000-8000-000000000003',
  otherDraft: '10000000-0000-4000-8000-000000000004',
  item: '10000000-0000-4000-8000-000000000005',
  homeowner: '10000000-0000-4000-8000-000000000006',
  home: '10000000-0000-4000-8000-000000000007',
  estimate: '10000000-0000-4000-8000-000000000008',
  job: '10000000-0000-4000-8000-000000000009',
  launch: '10000000-0000-4000-8000-00000000000a',
  attempt: '10000000-0000-4000-8000-00000000000b',
};

type OutputType = 'estimate' | 'job';

function result(outputType: OutputType, status: 'succeeded' | 'already_consumed' = 'succeeded', idempotent = false) {
  return {
    draft_id: IDS.draft,
    status,
    output_type: outputType,
    estimate_id: outputType === 'estimate' ? IDS.estimate : null,
    job_id: outputType === 'job' ? IDS.job : null,
    output_id_snapshot: outputType === 'estimate' ? IDS.estimate : IDS.job,
    output_available: true,
    launch_id: IDS.launch,
    idempotent,
  } as const;
}

function eligibility(source: 'confirmed_create' | 'explicit_retry' = 'confirmed_create', outputType: OutputType = 'estimate') {
  return createPostLaunchNavigationEligibility({
    token: Symbol('navigation'),
    source,
    contractorId: IDS.contractor,
    outputType,
    targetKey: `durable:${IDS.draft}`,
    editorGeneration: 2,
    workspaceGeneration: 3,
    clientGeneration: 4,
    createdAt: 1,
  });
}

function resolvedIntent(source: 'confirmed_create' | 'explicit_retry' = 'confirmed_create', outputType: OutputType = 'estimate') {
  const outputId = outputType === 'estimate' ? IDS.estimate : IDS.job;
  return resolvePostLaunchNavigationIntent({
    eligibility: eligibility(source, outputType),
    result: result(outputType, source === 'explicit_retry' ? 'succeeded' : 'succeeded', source === 'explicit_retry'),
    draftId: IDS.draft,
    contractorId: IDS.contractor,
    outputType,
    outputId,
    outputIdSnapshot: outputId,
    outputAvailable: true,
  });
}

test.describe('Slice 2C-C2 navigation contracts', () => {
  test('fresh explicit Create is eligible only for fresh canonical success', () => {
    expect(resolvedIntent('confirmed_create')).not.toBeNull();
    const retryLike = resolvePostLaunchNavigationIntent({
      eligibility: eligibility('confirmed_create'), result: result('estimate', 'succeeded', true), draftId: IDS.draft,
      contractorId: IDS.contractor, outputType: 'estimate', outputId: IDS.estimate, outputIdSnapshot: IDS.estimate, outputAvailable: true,
    });
    expect(retryLike).toBeNull();
  });

  test('explicit retry accepts same-key and already-consumed canonical outcomes', () => {
    expect(resolvedIntent('explicit_retry')).not.toBeNull();
    expect(resolvePostLaunchNavigationIntent({
      eligibility: eligibility('explicit_retry'), result: result('estimate', 'already_consumed', false), draftId: IDS.draft,
      contractorId: IDS.contractor, outputType: 'estimate', outputId: IDS.estimate, outputIdSnapshot: IDS.estimate, outputAvailable: true,
    })).not.toBeNull();
  });

  for (const change of ['unavailable', 'missing live id', 'snapshot mismatch', 'contractor mismatch', 'family mismatch'] as const) {
    test(`${change} is ineligible`, () => {
      const input = {
        eligibility: eligibility(), result: result('estimate'), draftId: IDS.draft, contractorId: IDS.contractor,
        outputType: 'estimate' as const, outputId: IDS.estimate as string | null, outputIdSnapshot: IDS.estimate as string | null, outputAvailable: true,
      };
      if (change === 'unavailable') input.outputAvailable = false;
      if (change === 'missing live id') input.outputId = null;
      if (change === 'snapshot mismatch') input.outputIdSnapshot = IDS.job;
      if (change === 'contractor mismatch') input.contractorId = IDS.otherContractor;
      if (change === 'family mismatch') input.outputType = 'job' as never;
      expect(resolvePostLaunchNavigationIntent(input)).toBeNull();
    });
  }

  test('context matching requires every generation, target, contractor, and gate', () => {
    const intent = resolvedIntent();
    expect(intent).not.toBeNull();
    const current = { contractorId: IDS.contractor, targetKey: `durable:${IDS.draft}`, editorGeneration: 2, workspaceGeneration: 3, clientGeneration: 4, launchEnabled: true };
    expect(postLaunchNavigationContextMatches(intent!, current)).toBe(true);
    for (const changed of [
      { ...current, contractorId: IDS.otherContractor }, { ...current, targetKey: `durable:${IDS.otherDraft}` },
      { ...current, editorGeneration: 5 }, { ...current, workspaceGeneration: 5 }, { ...current, clientGeneration: 5 },
      { ...current, launchEnabled: false },
    ]) expect(postLaunchNavigationContextMatches(intent!, changed)).toBe(false);
  });

  test('intent is consumed exactly once through loading and adoption', () => {
    const intent = resolvedIntent()!;
    let state = postLaunchNavigationReducer(INITIAL_POST_LAUNCH_NAVIGATION_STATE, { type: 'ELIGIBLE', eligibility: intent });
    state = postLaunchNavigationReducer(state, { type: 'CANONICAL_READY', intent });
    expect(state.phase).toBe('loading_output');
    state = postLaunchNavigationReducer(state, { type: 'START_ADOPTION', token: intent.token });
    state = postLaunchNavigationReducer(state, { type: 'NAVIGATED', token: intent.token });
    expect(state).toMatchObject({ phase: 'navigated', intent: null, eligibility: null });
    expect(postLaunchNavigationReducer(state, { type: 'CANONICAL_READY', intent })).toBe(state);
  });

  test('wrong-token transitions and duplicate triggers are rejected', () => {
    const intent = resolvedIntent()!;
    let state = postLaunchNavigationReducer(INITIAL_POST_LAUNCH_NAVIGATION_STATE, { type: 'ELIGIBLE', eligibility: intent });
    const wrongIntent = { ...intent, token: Symbol('wrong') };
    expect(postLaunchNavigationReducer(state, { type: 'CANONICAL_READY', intent: wrongIntent })).toBe(state);
    state = postLaunchNavigationReducer(state, { type: 'CANONICAL_READY', intent });
    expect(postLaunchNavigationReducer(state, { type: 'ELIGIBLE', eligibility: wrongIntent })).toBe(state);
  });

  test('failure, unavailable, and stale cancellation do not recreate eligibility', () => {
    const intent = resolvedIntent()!;
    const loading = postLaunchNavigationReducer(
      postLaunchNavigationReducer(INITIAL_POST_LAUNCH_NAVIGATION_STATE, { type: 'ELIGIBLE', eligibility: intent }),
      { type: 'CANONICAL_READY', intent },
    );
    expect(postLaunchNavigationReducer(loading, { type: 'FAILED', token: intent.token, message: 'failed' })).toMatchObject({ phase: 'navigation_failed', intent: null, eligibility: null });
    expect(postLaunchNavigationReducer(loading, { type: 'UNAVAILABLE', token: intent.token, message: 'gone' })).toMatchObject({ phase: 'output_unavailable', intent: null, eligibility: null });
    expect(postLaunchNavigationReducer(loading, { type: 'CANCEL_STALE', token: intent.token })).toMatchObject({ phase: 'cancelled_stale', intent: null, eligibility: null });
  });

  test('navigation intent remains identifier-only and memory-only', () => {
    const source = readFileSync('src/features/drafts/durableDraftPostLaunchNavigation.ts', 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|history\.state|private.notes|customer.*name|property.*address/i);
    expect(Object.keys(eligibility())).toEqual(expect.arrayContaining(['token', 'source', 'contractorId', 'outputType', 'targetKey', 'editorGeneration', 'workspaceGeneration', 'clientGeneration', 'createdAt']));
  });

  test('App provides focusable Estimate and Job destinations after synchronous adoption', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    expect(source).toContain('data-durable-output-heading={contractorFinancialRecordKind');
    expect(source).toContain('data-durable-output-heading="job"');
    expect(source).toContain("focusDurableDraftOutputHeading('estimate')");
    expect(source).toContain("focusDurableDraftOutputHeading('job')");
  });
});

async function installHarness(page: Page, options: {
  outputType?: OutputType;
  launchEnabled?: boolean;
  initialStatus?: 'active' | 'consumed';
  storedAttempt?: 'ambiguous' | 'succeeded';
} = {}) {
  await page.goto('/');
  await page.evaluate(async ({ ids, options }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (node: HTMLElement) => { render: (node: unknown) => void; unmount: () => void } }).createRoot;
    const Workspace = (await dynamicImport('/src/features/drafts/DurableDraftWorkspace.tsx')).DurableDraftWorkspace as (...args: unknown[]) => unknown;
    const createBlank = (await dynamicImport('/src/features/drafts/draftComposerMappings.ts')).createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;
    const attemptKey = (await dynamicImport('/src/features/drafts/durableDraftLaunchAttempt.ts')).durableDraftLaunchAttemptKey as (contractorId: string, draftId: string) => string;
    document.body.innerHTML = '<div id="root"></div><div id="destination"></div>';
    localStorage.clear();
    const root = createRoot(document.getElementById('root') as HTMLElement);
    type Pending = { kind: 'rpc' | 'list' | 'output'; name: string; args: unknown; settled: boolean; resolve: (value: unknown) => void; reject: (error: unknown) => void };
    const calls: Pending[] = [];
    const deferred = () => {
      let resolve!: (value: unknown) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
      return { promise, resolve, reject };
    };
    const makeClient = (name: string) => ({
      name,
      rpc(rpcName: string, args: unknown) {
        const next = deferred();
        calls.push({ kind: 'rpc', name: rpcName, args, settled: false, resolve: next.resolve, reject: next.reject });
        return next.promise;
      },
      from(table: string) {
        const next = deferred();
        const call: Pending = { kind: 'list', name: table, args: null, settled: false, resolve: next.resolve, reject: next.reject };
        calls.push(call);
        const query = { select() { return query; }, in(_column: string, values: unknown) { call.args = values; return query; }, order() { return query; }, then(done: (value: unknown) => void, fail: (error: unknown) => void) { return next.promise.then(done, fail); } };
        return query;
      },
    });
    const clients = { A: makeClient('A'), B: makeClient('B') };
    const outputType = options.outputType ?? 'estimate';
    const outputId = (type: OutputType) => type === 'estimate' ? ids.estimate : ids.job;
    const rawDraft = (status: 'active' | 'consumed', type: OutputType = outputType, available = true) => ({
      id: ids.draft, contractor_id: state.contractorId, created_by_user_id: null,
      homeowner_user_id: ids.homeowner, home_id: ids.home, local_contact_id: null, local_home_id: null, service_request_id: null,
      subject_type: 'connected_homeowner', subject_display_name_snapshot: 'Customer', property_display_snapshot: 'Home',
      title: 'Plan', scope_description: 'Scope', private_notes: 'Private', intended_output: type,
      work_format: 'standard', labor_mode: 'line_specific', labor_rate_cents: null, job_labor_hours: null, status,
      legacy_inspection_id: null, launched_output_type: status === 'consumed' ? type : null,
      launched_estimate_id: status === 'consumed' && type === 'estimate' && available ? ids.estimate : null,
      launched_job_id: status === 'consumed' && type === 'job' && available ? ids.job : null,
      launched_estimate_id_snapshot: status === 'consumed' && type === 'estimate' ? ids.estimate : null,
      launched_job_id_snapshot: status === 'consumed' && type === 'job' ? ids.job : null,
      launched_at: status === 'consumed' ? '2026-07-20T10:01:00.000Z' : null, launched_by_user_id: null,
      created_at: '2026-07-20T10:00:00.000Z', updated_at: '2026-07-20T10:01:00.000Z',
    });
    const rawItem = () => ({ id: ids.item, draft_id: ids.draft, contractor_id: state.contractorId, title: 'Item', description: 'Item', customer_description: 'Item', internal_notes: '', line_type: 'labor', quantity: 1, unit: 'each', unit_price_cents: 100, labor_hours: 1, room_id: null, room_label: null, location_label: null, sort_order: 0, created_at: '2026-07-20T10:00:00.000Z', updated_at: '2026-07-20T10:00:00.000Z' });
    const envelope = (status: 'active' | 'consumed', type: OutputType = outputType, available = true) => ({ draft: rawDraft(status, type, available), items: [rawItem()], launches: [] });
    const initialDraft = createBlank({ subject_type: 'connected', homeowner_user_id: ids.homeowner, home_id: ids.home, title: 'Plan', scope: 'Scope', intended_output: outputType, line_items: [{ id: 'local', job_work_item_id: ids.item, line_type: 'labor', description: 'Item', line_title: 'Item', customer_description: 'Item', quantity: '1', unit: 'each', unit_price: '1.00', labor_hours: '1', work_state: 'not_started', room_id: null, room_label: '', location_label: '', internal_notes: '' }] });
    const state = {
      client: clients.A, contractorId: ids.contractor, mode: 'editor' as 'editor' | 'list',
      target: { kind: 'durable', draftId: ids.draft } as Record<string, unknown> | null,
      launchEnabled: options.launchEnabled ?? true, adopted: [] as string[], focusCount: 0, backCount: 0,
    };
    const render = () => root.render(React.createElement(Workspace, {
      client: state.client, mode: state.mode, target: state.target,
      capabilities: { contractorId: state.contractorId, canReadDrafts: true, canPersistDraft: true, canImportLegacyDraft: true, canLaunchEstimate: true, canLaunchJob: true },
      launchEnabled: state.launchEnabled, onRefreshCapabilities: async () => ({ contractorId: state.contractorId, canReadDrafts: true, canPersistDraft: true, canImportLegacyDraft: true, canLaunchEstimate: true, canLaunchJob: true }),
      legacyDrafts: [], connectedOptions: [{ id: ids.homeowner, label: 'Customer', properties: [{ id: ids.home, label: 'Home' }] }], localOptions: [], customerLabel: () => '', propertyLabel: () => '', onStartNew: () => undefined,
      onOpenTarget: (target: Record<string, unknown>) => { state.target = target; render(); },
      onBack: () => { state.backCount += 1; state.mode = 'list'; state.target = null; render(); },
      onLoadOutput: (type: OutputType, id: string) => { const next = deferred(); calls.push({ kind: 'output', name: type, args: id, settled: false, resolve: next.resolve, reject: next.reject }); return next.promise; },
      onAdoptOutput: (loaded: { type: OutputType; id: string }) => {
        state.adopted.push(`${loaded.type}:${loaded.id}`);
        const destination = document.getElementById('destination') as HTMLElement;
        destination.innerHTML = `<h2 tabindex="-1" data-testid="output-heading">${loaded.type === 'estimate' ? 'Estimate workspace' : 'Job workspace'}</h2>`;
        requestAnimationFrame(() => { (destination.firstElementChild as HTMLElement)?.focus({ preventScroll: true }); state.focusCount += 1; });
      },
    }));
    if (options.storedAttempt) {
      const type = outputType;
      localStorage.setItem(attemptKey(ids.contractor, ids.draft), JSON.stringify({ schemaVersion: 1, contractorId: ids.contractor, draftId: ids.draft, outputType: type, idempotencyKey: ids.attempt, phase: options.storedAttempt, createdAt: '2020-07-20T10:00:00.000Z', updatedAt: '2020-07-20T10:01:00.000Z', ...(options.storedAttempt === 'succeeded' ? { launchId: ids.launch, estimateId: type === 'estimate' ? ids.estimate : null, jobId: type === 'job' ? ids.job : null, outputIdSnapshot: outputId(type), outputAvailable: true } : {}) }));
    }
    const harness = {
      render, envelope,
      launchResult: (type: OutputType = outputType, status: 'succeeded' | 'already_consumed' = 'succeeded', idempotent = false) => ({ draft_id: ids.draft, status, output_type: type, estimate_id: type === 'estimate' ? ids.estimate : null, job_id: type === 'job' ? ids.job : null, output_id_snapshot: outputId(type), output_available: true, launch_id: ids.launch, idempotent }),
      completeRpc(name: string, data: unknown) { const call = calls.find(item => !item.settled && item.kind === 'rpc' && item.name === name); if (!call) throw new Error(`missing ${name}`); call.settled = true; call.resolve({ data, error: null, status: 200 }); },
      failRpc(name: string, error: unknown) { const call = calls.find(item => !item.settled && item.kind === 'rpc' && item.name === name); if (!call) throw new Error(`missing ${name}`); call.settled = true; call.resolve({ data: null, error, status: 500 }); },
      completeOutput(type: OutputType = outputType, overrides: Record<string, unknown> = {}) { const call = calls.find(item => !item.settled && item.kind === 'output' && item.name === type); if (!call) throw new Error(`missing output ${type}`); call.settled = true; call.resolve({ type, id: outputId(type), record: { id: outputId(type), contractor_id: state.contractorId, ...overrides } }); },
      failOutput(type: OutputType = outputType, error: unknown = new Error('network failed')) { const call = calls.find(item => !item.settled && item.kind === 'output' && item.name === type); if (!call) throw new Error(`missing output ${type}`); call.settled = true; call.reject(error); },
      completeList(data: unknown[] = []) { const call = calls.find(item => !item.settled && item.kind === 'list'); if (call) { call.settled = true; call.resolve({ data, error: null, status: 200 }); } },
      count(kind: 'rpc' | 'output', name: string) { return calls.filter(item => item.kind === kind && item.name === name).length; },
      pending(kind: 'rpc' | 'output', name: string) { return calls.filter(item => !item.settled && item.kind === kind && item.name === name).length; },
      snapshot() { return { adopted: [...state.adopted], focusCount: state.focusCount, backCount: state.backCount, mode: state.mode, target: state.target, calls: calls.map(item => ({ kind: item.kind, name: item.name, settled: item.settled })) }; },
      showTarget(draftId: string) { state.mode = 'editor'; state.target = { kind: 'durable', draftId }; render(); },
      switchContractor(id: string) { state.contractorId = id; render(); },
      switchClient() { state.client = clients.B; render(); },
      setGate(enabled: boolean) { state.launchEnabled = enabled; render(); },
      back() { state.mode = 'list'; state.target = null; render(); },
      unmount() { root.unmount(); },
      storageKey: attemptKey(ids.contractor, ids.draft),
    };
    (window as typeof window & { __c2: typeof harness }).__c2 = harness;
    render();
  }, { ids: IDS, options });
}

async function h<T>(page: Page, expression: string): Promise<T> {
  return page.evaluate(expression => new Function('h', `return (${expression})`)((window as typeof window & { __c2: unknown }).__c2) as T, expression);
}

async function openActive(page: Page, outputType: OutputType) {
  await page.waitForFunction(() => (window as typeof window & { __c2: { count: (kind: string, name: string) => number } }).__c2.count('rpc', 'servsync_get_work_draft') > 0);
  await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('active', '${outputType}', true))`);
  await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
}

async function confirm(page: Page, outputType: OutputType) {
  const label = outputType === 'estimate' ? 'Estimate' : 'Job';
  await page.getByTestId('durable-draft-create-output').click();
  await page.getByRole('dialog').getByRole('button', { name: `Create ${label}` }).click();
}

async function consume(page: Page, outputType: OutputType, status: 'succeeded' | 'already_consumed' = 'succeeded', idempotent = false) {
  await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBeGreaterThan(0);
  await h(page, `h.completeRpc('servsync_launch_work_draft', h.launchResult('${outputType}', '${status}', ${String(idempotent)}))`);
  await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(1);
  await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', true))`);
}

async function waitForOutputLoad(page: Page, outputType: OutputType) {
  await expect.poll(() => h<number>(page, `h.count('output', '${outputType}')`)).toBeGreaterThan(0);
}

test.describe('Slice 2C-C2 rendered post-launch navigation', () => {
  for (const outputType of ['estimate', 'job'] as const) {
    const label = outputType === 'estimate' ? 'Estimate' : 'Job';

    test(`fresh ${label} loads, adopts, and focuses exactly once`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await expect(page.getByText(`${label} created. Opening ${label}…`)).toBeVisible();
      await waitForOutputLoad(page, outputType);
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(1);
      await h(page, `h.completeOutput('${outputType}')`);
      await expect(page.getByTestId('output-heading')).toBeFocused();
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()')).adopted).toEqual([`${outputType}:${outputType === 'estimate' ? IDS.estimate : IDS.job}`]);
      expect((await h<{ focusCount: number }>(page, 'h.snapshot()')).focusCount).toBe(1);
    });

    test(`explicit same-key ${label} retry becomes eligible`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await h(page, `h.failRpc('servsync_launch_work_draft', { message: 'network request failed' })`);
      await page.getByTestId('durable-draft-create-output').click();
      await page.getByRole('dialog').getByRole('button', { name: `Create ${label}` }).click();
      await consume(page, outputType, 'succeeded', true);
      await waitForOutputLoad(page, outputType);
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(1);
    });

    test(`explicit ${label} retry returning already consumed becomes eligible`, async ({ page }) => {
      await installHarness(page, { outputType, storedAttempt: 'ambiguous' });
      await openActive(page, outputType);
      await expect(page.getByRole('button', { name: `Retry Create ${label}` })).toBeVisible();
      await page.getByTestId('durable-draft-create-output').click();
      await page.getByRole('dialog').getByRole('button', { name: `Create ${label}` }).click();
      await consume(page, outputType, 'already_consumed', false);
      await waitForOutputLoad(page, outputType);
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(1);
    });

    test(`mount succeeded ${label} recovery remains explicit-only`, async ({ page }) => {
      await installHarness(page, { outputType, storedAttempt: 'succeeded' });
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(0);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('active', '${outputType}', true))`);
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(1);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', true))`);
      await expect(page.getByRole('button', { name: `Open ${label}` })).toBeVisible();
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(0);
    });

    test(`existing consumed ${label} remains explicit-only`, async ({ page }) => {
      await installHarness(page, { outputType, initialStatus: 'consumed' });
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(0);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', true))`);
      await expect(page.getByRole('button', { name: `Open ${label}` })).toBeVisible();
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(0);
    });

    test(`${label} loader failure preserves consumed summary and retries manually only`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await h(page, `h.failOutput('${outputType}')`);
      await expect(page.getByText(`${label} created, but it could not be opened. Open ${label} to try again.`)).toBeVisible();
      expect(await h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBe(1);
      await page.getByRole('button', { name: `Open ${label}` }).click();
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(2);
    });

    test(`malformed ${label} result is not adopted`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await h(page, `h.completeOutput('${outputType}', { contractor_id: '${IDS.otherContractor}' })`);
      await expect(page.getByText(/created, but it could not be opened/)).toBeVisible();
      expect((await h<{ adopted: string[] }>(page, 'h.snapshot()')).adopted).toEqual([]);
    });

    test(`deleted ${label} refreshes unavailable canonical state`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await h(page, `h.failOutput('${outputType}', { status: 404, message: '${label} not found' })`);
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(2);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', false))`);
      await expect(page.getByText(`The created ${label} is no longer available.`)).toBeVisible();
      await expect(page.getByRole('button', { name: `Open ${label}` })).toHaveCount(0);
    });

    test(`Back during automatic ${label} load suppresses late success`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await page.getByRole('button', { name: 'Back to Work' }).click();
      await h(page, `h.completeOutput('${outputType}')`);
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()')).adopted).toEqual([]);
      expect((await h<{ focusCount: number }>(page, 'h.snapshot()')).focusCount).toBe(0);
    });

    test(`manual Open during automatic ${label} load starts no second loader`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await expect(page.getByRole('button', { name: 'Opening…' })).toBeDisabled();
      await page.getByRole('button', { name: 'Opening…' }).click({ force: true });
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(1);
    });

    test(`duplicate consumed rerender starts one automatic ${label} load`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await h(page, 'h.render()');
      await h(page, 'h.render()');
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(1);
    });

    test(`Back during automatic ${label} load suppresses late failure`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await page.getByRole('button', { name: 'Back to Work' }).click();
      await h(page, `h.failOutput('${outputType}')`);
      await expect(page.getByTestId('durable-draft-list')).toBeVisible();
      await expect(page.getByText(/could not be opened/)).toHaveCount(0);
    });

    test(`unmount during automatic ${label} load suppresses late success`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await h(page, 'h.unmount()');
      await h(page, `h.completeOutput('${outputType}')`);
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()')).adopted).toEqual([]);
      expect((await h<{ focusCount: number }>(page, 'h.snapshot()')).focusCount).toBe(0);
    });

    test(`unmount during automatic ${label} load suppresses late failure`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await consume(page, outputType);
      await waitForOutputLoad(page, outputType);
      await h(page, 'h.unmount()');
      await h(page, `h.failOutput('${outputType}')`);
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()')).adopted).toEqual([]);
    });

    test(`lifecycle-only consumed ${label} reconciliation remains explicit-only`, async ({ page }) => {
      await installHarness(page, { outputType });
      await openActive(page, outputType);
      await confirm(page, outputType);
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBeGreaterThan(0);
      await h(page, `h.failRpc('servsync_launch_work_draft', { message: 'DRAFT_NOT_ACTIVE' })`);
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(1);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', true))`);
      await expect(page.getByRole('button', { name: `Open ${label}` })).toBeVisible();
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(0);
    });

    test(`page-recovered ${label} remains explicit-only and manual Open works`, async ({ page }) => {
      await installHarness(page, { outputType, storedAttempt: 'succeeded' });
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(0);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('active', '${outputType}', true))`);
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(1);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', true))`);
      await page.getByRole('button', { name: `Open ${label}` }).click();
      await waitForOutputLoad(page, outputType);
      await h(page, `h.completeOutput('${outputType}')`);
      expect((await h<{ adopted: string[] }>(page, 'h.snapshot()')).adopted).toEqual([`${outputType}:${outputType === 'estimate' ? IDS.estimate : IDS.job}`]);
    });

    test(`existing consumed ${label} explicit Open remains available`, async ({ page }) => {
      await installHarness(page, { outputType });
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(0);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', true))`);
      await page.getByRole('button', { name: `Open ${label}` }).click();
      await waitForOutputLoad(page, outputType);
      expect(await h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBe(0);
    });

    test(`initial unavailable consumed ${label} has no automatic or explicit Open`, async ({ page }) => {
      await installHarness(page, { outputType });
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(0);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', false))`);
      await expect(page.getByText(new RegExp(`${label}.*no longer available`, 'i'))).toBeVisible();
      await expect(page.getByRole('button', { name: `Open ${label}` })).toHaveCount(0);
      expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(0);
    });
  }

  for (const outputType of ['estimate', 'job'] as const) test(`external cross-tab ${outputType} success reconciles without automatic navigation or focus`, async ({ page }) => {
    await installHarness(page, { outputType });
    await openActive(page, outputType);
    await page.evaluate(({ ids, outputType }) => {
      const h = (window as typeof window & { __c2: { storageKey: string } }).__c2;
      const value = JSON.stringify({ schemaVersion: 1, contractorId: ids.contractor, draftId: ids.draft, outputType, idempotencyKey: ids.attempt, phase: 'succeeded', createdAt: '2020-07-20T10:00:00.000Z', updatedAt: '2020-07-20T10:01:00.000Z', launchId: ids.launch, estimateId: outputType === 'estimate' ? ids.estimate : null, jobId: outputType === 'job' ? ids.job : null, outputIdSnapshot: outputType === 'estimate' ? ids.estimate : ids.job, outputAvailable: true });
      localStorage.setItem(h.storageKey, value);
      window.dispatchEvent(new StorageEvent('storage', { key: h.storageKey, newValue: value, storageArea: localStorage }));
    }, { ids: IDS, outputType });
    await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(1);
    await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', '${outputType}', true))`);
    expect(await h<number>(page, `h.count('output', '${outputType}')`)).toBe(0);
    expect((await h<{ focusCount: number }>(page, 'h.snapshot()')).focusCount).toBe(0);
  });

  for (const race of ['target', 'contractor', 'client', 'unmount', 'gate'] as const) {
    test(`${race} change cancels a pending automatic navigation`, async ({ page }) => {
      await installHarness(page, { outputType: 'estimate' });
      await openActive(page, 'estimate');
      await confirm(page, 'estimate');
      await consume(page, 'estimate');
      await waitForOutputLoad(page, 'estimate');
      if (race === 'target') await h(page, `h.showTarget('${IDS.otherDraft}')`);
      if (race === 'contractor') await h(page, `h.switchContractor('${IDS.otherContractor}')`);
      if (race === 'client') await h(page, 'h.switchClient()');
      if (race === 'gate') await h(page, 'h.setGate(false)');
      if (race === 'unmount') await h(page, 'h.unmount()');
      await h(page, `h.completeOutput('estimate')`);
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()')).adopted).toEqual([]);
      expect((await h<{ focusCount: number }>(page, 'h.snapshot()')).focusCount).toBe(0);
    });
  }

  for (const race of ['target', 'contractor', 'client'] as const) {
    test(`Job ${race} change suppresses stale automatic adoption`, async ({ page }) => {
      await installHarness(page, { outputType: 'job' });
      await openActive(page, 'job');
      await confirm(page, 'job');
      await consume(page, 'job');
      await waitForOutputLoad(page, 'job');
      if (race === 'target') await h(page, `h.showTarget('${IDS.otherDraft}')`);
      if (race === 'contractor') await h(page, `h.switchContractor('${IDS.otherContractor}')`);
      if (race === 'client') await h(page, 'h.switchClient()');
      await h(page, `h.completeOutput('job')`);
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()')).adopted).toEqual([]);
      expect((await h<{ focusCount: number }>(page, 'h.snapshot()')).focusCount).toBe(0);
    });
  }

  test('gate-off editor creates no navigation intent or launch', async ({ page }) => {
    await installHarness(page, { outputType: 'estimate', launchEnabled: false });
    await openActive(page, 'estimate');
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    expect(await h<number>(page, `h.count('output', 'estimate')`)).toBe(0);
  });

  test('Demo-equivalent suppression creates no automatic navigation', async ({ page }) => {
    await installHarness(page, { outputType: 'job', launchEnabled: false });
    await openActive(page, 'job');
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    expect(await h<number>(page, `h.count('output', 'job')`)).toBe(0);
  });

  test('C2 contains no Invoice launch or navigation path', async ({ page }) => {
    await installHarness(page, { outputType: 'estimate' });
    await openActive(page, 'estimate');
    await expect(page.getByText(/Create Invoice|Open Invoice|Opening Invoice/)).toHaveCount(0);
  });
});
