import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  createPostLaunchNavigationEligibility,
  INITIAL_POST_LAUNCH_NAVIGATION_STATE,
  postLaunchNavigationContextMatches,
  postLaunchNavigationReducer,
  resolvePostLaunchNavigationIntent,
} from '../../src/features/drafts/durableDraftPostLaunchNavigation';
import {
  validateDurableDraftEstimateRecord,
  validateDurableDraftJobRecord,
  validateDurableDraftLoadedOutput,
} from '../../src/features/drafts/durableDraftOutputValidation';
import {
  createDurableDraftOutputFocusCoordinator,
} from '../../src/features/drafts/DurableDraftOutputFocus';

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
  estimateLine: '10000000-0000-4000-8000-00000000000c',
  otherEstimate: '10000000-0000-4000-8000-00000000000d',
  otherJob: '10000000-0000-4000-8000-00000000000e',
};

type OutputType = 'estimate' | 'job';

function validEstimateFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.estimate,
    contractor_id: IDS.contractor,
    homeowner_user_id: IDS.homeowner,
    local_contact_id: null,
    service_request_id: null,
    inspection_id: null,
    home_id: IDS.home,
    local_home_id: null,
    title: 'Plan Estimate',
    scope: 'Approved scope',
    notes: '',
    terms: '',
    status: 'draft',
    subtotal_cents: 100,
    total_cents: 100,
    labor_mode: 'line_specific',
    labor_rate_cents: null,
    job_labor_hours: null,
    material_total_cents: 0,
    labor_total_cents: 100,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_rate_percent: 0,
    tax_cents: 0,
    created_at: '2026-07-20T10:01:00.000Z',
    updated_at: '2026-07-20T10:01:00.000Z',
    line_items: [{
      id: IDS.estimateLine,
      estimate_id: IDS.estimate,
      line_type: 'labor',
      description: 'Item',
      line_title: 'Item',
      customer_description: 'Item',
      model_spec: null,
      supply_status: null,
      quantity: 1,
      unit: 'each',
      unit_price_cents: 100,
      labor_hours: 1,
      sort_order: 0,
      created_at: '2026-07-20T10:01:00.000Z',
      updated_at: '2026-07-20T10:01:00.000Z',
    }],
    payment_schedule_items: [],
    ...overrides,
  };
}

function validJobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.job,
    contractor_id: IDS.contractor,
    homeowner_user_id: IDS.homeowner,
    home_id: IDS.home,
    local_contact_id: null,
    local_home_id: null,
    service_request_id: null,
    template_id: null,
    name: 'Plan Job',
    summary: 'Approved scope',
    status: 'draft',
    job_type: 'service_visit',
    job_status: 'draft',
    job_origin: 'direct',
    estimate_id: null,
    draft_created_by: null,
    draft_updated_by: null,
    draft_saved_at: null,
    activated_at: null,
    activated_by: null,
    project_id: null,
    completed_at: null,
    closed_at: null,
    rooms_with_findings: [],
    report_storage_path: null,
    report_file_name: null,
    created_at: '2026-07-20T10:01:00.000Z',
    updated_at: '2026-07-20T10:01:00.000Z',
    ...overrides,
  };
}

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

  test('complete Estimate and Job records satisfy the production output validators', () => {
    expect(validateDurableDraftEstimateRecord(validEstimateFixture()).ok).toBe(true);
    expect(validateDurableDraftJobRecord(validJobFixture()).ok).toBe(true);
  });

  for (const malformed of [
    ['missing status', { status: undefined }],
    ['invalid status', { status: 'unknown' }],
    ['missing title', { title: undefined }],
    ['missing contractor', { contractor_id: undefined }],
    ['invalid output ID', { id: 'not-an-id' }],
    ['non-finite total', { total_cents: Number.POSITIVE_INFINITY }],
    ['malformed timestamp', { updated_at: 'yesterday' }],
    ['malformed line list', { line_items: [{ id: IDS.estimateLine }] }],
    ['partial ID/contractor record', { partial: true }],
  ] as const) {
    test(`Estimate validator rejects ${malformed[0]}`, () => {
      const record = malformed[0] === 'partial ID/contractor record'
        ? { id: IDS.estimate, contractor_id: IDS.contractor }
        : validEstimateFixture(malformed[1]);
      expect(validateDurableDraftEstimateRecord(record)).toEqual({ ok: false, reason: 'invalid_record' });
    });
  }

  for (const malformed of [
    ['missing status', { job_status: undefined }],
    ['invalid status', { job_status: 'unknown' }],
    ['missing discriminator', { job_type: undefined }],
    ['missing contractor', { contractor_id: undefined }],
    ['invalid output ID', { id: 'not-an-id' }],
    ['malformed subject', { homeowner_user_id: null, local_contact_id: null }],
    ['malformed timestamp', { updated_at: 'yesterday' }],
    ['malformed room list', { rooms_with_findings: [{ room: 'Kitchen' }] }],
    ['partial ID/contractor record', { partial: true }],
  ] as const) {
    test(`Job validator rejects ${malformed[0]}`, () => {
      const record = malformed[0] === 'partial ID/contractor record'
        ? { id: IDS.job, contractor_id: IDS.contractor }
        : validJobFixture(malformed[1]);
      expect(validateDurableDraftJobRecord(record)).toEqual({ ok: false, reason: 'invalid_record' });
    });
  }

  test('loaded-output validation distinguishes family, identity, contractor, and record failures', () => {
    const expected = { outputType: 'estimate' as const, outputId: IDS.estimate, contractorId: IDS.contractor };
    expect(validateDurableDraftLoadedOutput({ type: 'job', id: IDS.estimate, record: validEstimateFixture() }, expected)).toMatchObject({ ok: false, reason: 'wrong_family' });
    expect(validateDurableDraftLoadedOutput({ type: 'estimate', id: IDS.otherEstimate, record: validEstimateFixture() }, expected)).toMatchObject({ ok: false, reason: 'identity_mismatch' });
    expect(validateDurableDraftLoadedOutput({ type: 'estimate', id: IDS.estimate, record: validEstimateFixture({ contractor_id: IDS.otherContractor }) }, expected)).toMatchObject({ ok: false, reason: 'contractor_mismatch' });
    expect(validateDurableDraftLoadedOutput({ type: 'estimate', id: IDS.estimate, record: { id: IDS.estimate, contractor_id: IDS.contractor } }, expected)).toMatchObject({ ok: false, reason: 'invalid_record' });
  });

  test('focus coordinator keeps exact-token ownership and cancels stale requests', () => {
    let callback: FrameRequestCallback | null = null;
    let context = { outputType: 'estimate' as OutputType | null, outputId: IDS.estimate as string | null, contractorId: IDS.contractor as string | null, workspaceActive: true };
    const coordinator = createDurableDraftOutputFocusCoordinator({
      requestFrame: next => { callback = next; return 1; },
      cancelFrame: () => { callback = null; },
      getContext: () => context,
      getRoot: () => ({ querySelectorAll: () => [] }) as unknown as ParentNode,
    });
    const first = Symbol('first');
    coordinator.request({ token: first, outputType: 'estimate', outputId: IDS.estimate, contractorId: IDS.contractor });
    const staleCallback = callback;
    const second = Symbol('second');
    coordinator.request({ token: second, outputType: 'estimate', outputId: IDS.otherEstimate, contractorId: IDS.contractor });
    context = { ...context, outputId: IDS.otherEstimate };
    staleCallback?.(0);
    expect(coordinator.current()?.token).toBe(second);
    coordinator.cancelUnlessCurrent();
    expect(coordinator.current()?.token).toBe(second);
  });

  test('App uses production validators and exact-output focus destinations', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    expect(source).toContain('validateDurableDraftEstimateRecord(rawEstimate)');
    expect(source).toContain('validateDurableDraftJobRecord(rawJob)');
    expect(source).toContain('<DurableDraftOutputHeading');
    expect(source).toContain('outputId={editingEstimateId}');
    expect(source).toContain('outputId={activeInspection.id}');
    expect(source).not.toMatch(/querySelector<HTMLElement>\(`\[data-durable-output-heading="\$\{type\}"\]`/);
  });
});

async function installHarness(page: Page, options: {
  outputType?: OutputType;
  launchEnabled?: boolean;
  initialStatus?: 'active' | 'consumed';
  storedAttempt?: 'ambiguous' | 'succeeded';
  strictMode?: boolean;
} = {}) {
  await page.goto('/');
  await page.evaluate(async ({ ids, options, fixtures }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown; StrictMode: unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (node: HTMLElement) => { render: (node: unknown) => void; unmount: () => void } }).createRoot;
    const Workspace = (await dynamicImport('/src/features/drafts/DurableDraftWorkspace.tsx')).DurableDraftWorkspace as (...args: unknown[]) => unknown;
    const focusModule = await dynamicImport('/src/features/drafts/DurableDraftOutputFocus.tsx');
    const OutputHeading = focusModule.DurableDraftOutputHeading as (...args: unknown[]) => unknown;
    const createFocusCoordinator = focusModule.createDurableDraftOutputFocusCoordinator as (options: Record<string, unknown>) => { request: (request: Record<string, unknown>) => void; dispose: () => void; current: () => Record<string, unknown> | null };
    const createBlank = (await dynamicImport('/src/features/drafts/draftComposerMappings.ts')).createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;
    const attemptKey = (await dynamicImport('/src/features/drafts/durableDraftLaunchAttempt.ts')).durableDraftLaunchAttemptKey as (contractorId: string, draftId: string) => string;
    document.body.innerHTML = '<div id="root"></div><div id="destination"></div>';
    localStorage.clear();
    const root = createRoot(document.getElementById('root') as HTMLElement);
    const destination = document.getElementById('destination') as HTMLElement;
    const destinationRoot = createRoot(destination);
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
      selectedOutput: null as { type: OutputType; id: string } | null,
    };
    destination.addEventListener('focusin', () => { state.focusCount += 1; });
    const focusCoordinator = createFocusCoordinator({
      requestFrame: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
      cancelFrame: (handle: number) => cancelAnimationFrame(handle),
      getContext: () => ({
        outputType: state.selectedOutput?.type ?? null,
        outputId: state.selectedOutput?.id ?? null,
        contractorId: state.contractorId,
        workspaceActive: Boolean(state.selectedOutput),
      }),
      getRoot: () => destination,
    });
    const workspaceElement = () => React.createElement(Workspace, {
      client: state.client, mode: state.mode, target: state.target,
      capabilities: { contractorId: state.contractorId, canReadDrafts: true, canPersistDraft: true, canImportLegacyDraft: true, canLaunchEstimate: true, canLaunchJob: true },
      launchEnabled: state.launchEnabled, onRefreshCapabilities: async () => ({ contractorId: state.contractorId, canReadDrafts: true, canPersistDraft: true, canImportLegacyDraft: true, canLaunchEstimate: true, canLaunchJob: true }),
      legacyDrafts: [], connectedOptions: [{ id: ids.homeowner, label: 'Customer', properties: [{ id: ids.home, label: 'Home' }] }], localOptions: [], customerLabel: () => '', propertyLabel: () => '', onStartNew: () => undefined,
      onOpenTarget: (target: Record<string, unknown>) => { state.target = target; render(); },
      onBack: () => { state.backCount += 1; state.mode = 'list'; state.target = null; render(); },
      onLoadOutput: (type: OutputType, id: string) => { const next = deferred(); calls.push({ kind: 'output', name: type, args: id, settled: false, resolve: next.resolve, reject: next.reject }); return next.promise; },
      onAdoptOutput: (loaded: { type: OutputType; id: string }, focusToken: symbol) => {
        state.adopted.push(`${loaded.type}:${loaded.id}`);
        state.selectedOutput = { type: loaded.type, id: loaded.id };
        destinationRoot.render(React.createElement(OutputHeading, {
          as: 'h2', outputType: loaded.type, outputId: loaded.id, testId: 'output-heading',
        }, loaded.type === 'estimate' ? 'Estimate workspace' : 'Job workspace'));
        focusCoordinator.request({ token: focusToken, outputType: loaded.type, outputId: loaded.id, contractorId: state.contractorId });
      },
    });
    const render = () => root.render(options.strictMode
      ? React.createElement(React.StrictMode, null, workspaceElement())
      : workspaceElement());
    if (options.storedAttempt) {
      const type = outputType;
      localStorage.setItem(attemptKey(ids.contractor, ids.draft), JSON.stringify({ schemaVersion: 1, contractorId: ids.contractor, draftId: ids.draft, outputType: type, idempotencyKey: ids.attempt, phase: options.storedAttempt, createdAt: '2020-07-20T10:00:00.000Z', updatedAt: '2020-07-20T10:01:00.000Z', ...(options.storedAttempt === 'succeeded' ? { launchId: ids.launch, estimateId: type === 'estimate' ? ids.estimate : null, jobId: type === 'job' ? ids.job : null, outputIdSnapshot: outputId(type), outputAvailable: true } : {}) }));
    }
    const harness = {
      render, envelope,
      launchResult: (type: OutputType = outputType, status: 'succeeded' | 'already_consumed' = 'succeeded', idempotent = false) => ({ draft_id: ids.draft, status, output_type: type, estimate_id: type === 'estimate' ? ids.estimate : null, job_id: type === 'job' ? ids.job : null, output_id_snapshot: outputId(type), output_available: true, launch_id: ids.launch, idempotent }),
      completeRpc(name: string, data: unknown) { const call = calls.find(item => !item.settled && item.kind === 'rpc' && item.name === name); if (!call) throw new Error(`missing ${name}`); call.settled = true; call.resolve({ data, error: null, status: 200 }); },
      completeLastRpc(name: string, data: unknown) { const matching = calls.filter(item => !item.settled && item.kind === 'rpc' && item.name === name); const call = matching[matching.length - 1]; if (!call) throw new Error(`missing ${name}`); call.settled = true; call.resolve({ data, error: null, status: 200 }); },
      failRpc(name: string, error: unknown) { const call = calls.find(item => !item.settled && item.kind === 'rpc' && item.name === name); if (!call) throw new Error(`missing ${name}`); call.settled = true; call.resolve({ data: null, error, status: 500 }); },
      completeOutput(type: OutputType = outputType, overrides: Record<string, unknown> = {}) { const call = calls.find(item => !item.settled && item.kind === 'output' && item.name === type); if (!call) throw new Error(`missing output ${type}`); call.settled = true; call.resolve({ type, id: outputId(type), record: { ...(type === 'estimate' ? fixtures.estimate : fixtures.job), contractor_id: state.contractorId, ...overrides } }); },
      completeMalformedOutput(type: OutputType, mutation: string) {
        const call = calls.find(item => !item.settled && item.kind === 'output' && item.name === type);
        if (!call) throw new Error(`missing output ${type}`);
        call.settled = true;
        let record: Record<string, unknown> = { ...(type === 'estimate' ? fixtures.estimate : fixtures.job), contractor_id: state.contractorId };
        if (mutation === 'partial') record = { id: outputId(type), contractor_id: state.contractorId };
        if (mutation === 'missing_status') delete record[type === 'estimate' ? 'status' : 'job_status'];
        if (mutation === 'invalid_status') record[type === 'estimate' ? 'status' : 'job_status'] = 'unknown';
        if (mutation === 'missing_title') delete record[type === 'estimate' ? 'title' : 'job_type'];
        if (mutation === 'missing_contractor') delete record.contractor_id;
        if (mutation === 'invalid_id') record.id = ids.otherDraft;
        if (mutation === 'invalid_subject') { record.homeowner_user_id = null; record.local_contact_id = null; }
        if (mutation === 'invalid_numeric') record[type === 'estimate' ? 'total_cents' : 'rooms_with_findings'] = type === 'estimate' ? Number.POSITIVE_INFINITY : [{ room: 'Kitchen' }];
        if (mutation === 'invalid_timestamp') record.updated_at = 'yesterday';
        if (mutation === 'invalid_list') record[type === 'estimate' ? 'line_items' : 'rooms_with_findings'] = [{ id: ids.item }];
        call.resolve({ type, id: outputId(type), record });
      },
      failOutput(type: OutputType = outputType, error: unknown = new Error('network failed')) { const call = calls.find(item => !item.settled && item.kind === 'output' && item.name === type); if (!call) throw new Error(`missing output ${type}`); call.settled = true; call.reject(error); },
      completeList(data: unknown[] = []) { const call = calls.find(item => !item.settled && item.kind === 'list'); if (call) { call.settled = true; call.resolve({ data, error: null, status: 200 }); } },
      count(kind: 'rpc' | 'output', name: string) { return calls.filter(item => item.kind === kind && item.name === name).length; },
      pending(kind: 'rpc' | 'output', name: string) { return calls.filter(item => !item.settled && item.kind === kind && item.name === name).length; },
      snapshot() { const active = document.activeElement as HTMLElement | null; return { adopted: [...state.adopted], focusCount: state.focusCount, focusedId: active?.dataset.durableOutputId ?? null, focusRequest: focusCoordinator.current(), backCount: state.backCount, mode: state.mode, target: state.target, calls: calls.map(item => ({ kind: item.kind, name: item.name, settled: item.settled })) }; },
      showTarget(draftId: string) { state.mode = 'editor'; state.target = { kind: 'durable', draftId }; render(); },
      switchContractor(id: string) { state.contractorId = id; render(); },
      switchClient() { state.client = clients.B; render(); },
      setGate(enabled: boolean) { state.launchEnabled = enabled; render(); },
      back() { state.mode = 'list'; state.target = null; render(); },
      unmount() { focusCoordinator.dispose(); root.unmount(); destinationRoot.unmount(); },
      storageKey: attemptKey(ids.contractor, ids.draft),
    };
    (window as typeof window & { __c2: typeof harness }).__c2 = harness;
    render();
  }, { ids: IDS, options, fixtures: { estimate: validEstimateFixture(), job: validJobFixture() } });
}

async function h<T>(page: Page, expression: string): Promise<T> {
  return page.evaluate(expression => new Function('h', `return (${expression})`)((window as typeof window & { __c2: unknown }).__c2) as T, expression);
}

async function installProductionFocusHarness(page: Page) {
  await page.goto('/');
  await page.evaluate(async ids => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (node: HTMLElement) => { render: (node: unknown) => void; unmount: () => void } }).createRoot;
    const module = await dynamicImport('/src/features/drafts/DurableDraftOutputFocus.tsx');
    const Heading = module.DurableDraftOutputHeading as (...args: unknown[]) => unknown;
    const createCoordinator = module.createDurableDraftOutputFocusCoordinator as (options: Record<string, unknown>) => { request: (request: Record<string, unknown>) => void; cancelUnlessCurrent: () => void; dispose: () => void };
    document.body.innerHTML = '<div id="focus-root"></div>';
    const container = document.getElementById('focus-root') as HTMLElement;
    const root = createRoot(container);
    let nextFrame = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const state = {
      contractorId: ids.contractor,
      selected: null as { type: OutputType; id: string } | null,
      focusCount: 0,
    };
    container.addEventListener('focusin', () => { state.focusCount += 1; });
    const coordinator = createCoordinator({
      requestFrame: (callback: FrameRequestCallback) => { const id = nextFrame; nextFrame += 1; callbacks.set(id, callback); return id; },
      cancelFrame: () => undefined,
      getContext: () => ({ outputType: state.selected?.type ?? null, outputId: state.selected?.id ?? null, contractorId: state.contractorId, workspaceActive: Boolean(state.selected) }),
      getRoot: () => container,
    });
    const harness = {
      adopt(type: OutputType, id: string) {
        const token = Symbol(`${type}:${id}`);
        state.selected = { type, id };
        root.render(React.createElement(Heading, { as: 'h2', outputType: type, outputId: id, testId: `heading-${id}` }, `${type} ${id}`));
        coordinator.request({ token, outputType: type, outputId: id, contractorId: state.contractorId });
      },
      runFrame(id: number) { callbacks.get(id)?.(0); },
      snapshot() {
        const active = document.activeElement as HTMLElement | null;
        return { focusCount: state.focusCount, focusedType: active?.dataset.durableOutputHeading ?? null, focusedId: active?.dataset.durableOutputId ?? null, frameCount: callbacks.size };
      },
      dispose() { coordinator.dispose(); root.unmount(); },
    };
    (window as typeof window & { __focus: typeof harness }).__focus = harness;
  }, IDS);
}

async function fh<T>(page: Page, expression: string): Promise<T> {
  return page.evaluate(expression => new Function('h', `return (${expression})`)((window as typeof window & { __focus: unknown }).__focus) as T, expression);
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

test.describe('Slice 2C-C2 production focus integration', () => {
  test('stale Estimate A focus cannot enter Estimate B', async ({ page }) => {
    await installProductionFocusHarness(page);
    await fh(page, `h.adopt('estimate', '${IDS.estimate}')`);
    await fh(page, `h.adopt('estimate', '${IDS.otherEstimate}')`);
    await expect(page.getByTestId(`heading-${IDS.otherEstimate}`)).toBeVisible();
    await fh(page, 'h.runFrame(1)');
    expect(await fh(page, 'h.snapshot()')).toMatchObject({ focusCount: 0, focusedId: null });
    await fh(page, 'h.runFrame(2)');
    expect(await fh(page, 'h.snapshot()')).toMatchObject({ focusCount: 1, focusedType: 'estimate', focusedId: IDS.otherEstimate });
  });

  test('stale Job A focus cannot enter Job B', async ({ page }) => {
    await installProductionFocusHarness(page);
    await fh(page, `h.adopt('job', '${IDS.job}')`);
    await fh(page, `h.adopt('job', '${IDS.otherJob}')`);
    await expect(page.getByTestId(`heading-${IDS.otherJob}`)).toBeVisible();
    await fh(page, 'h.runFrame(1)');
    expect(await fh(page, 'h.snapshot()')).toMatchObject({ focusCount: 0, focusedId: null });
    await fh(page, 'h.runFrame(2)');
    expect(await fh(page, 'h.snapshot()')).toMatchObject({ focusCount: 1, focusedType: 'job', focusedId: IDS.otherJob });
  });

  test('stale cross-family focus cannot enter the newer workspace', async ({ page }) => {
    await installProductionFocusHarness(page);
    await fh(page, `h.adopt('estimate', '${IDS.estimate}')`);
    await fh(page, `h.adopt('job', '${IDS.job}')`);
    await expect(page.getByTestId(`heading-${IDS.job}`)).toBeVisible();
    await fh(page, 'h.runFrame(1)');
    expect(await fh(page, 'h.snapshot()')).toMatchObject({ focusCount: 0, focusedId: null });
    await fh(page, 'h.runFrame(2)');
    expect(await fh(page, 'h.snapshot()')).toMatchObject({ focusCount: 1, focusedType: 'job', focusedId: IDS.job });
  });
});

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

    for (const mutation of [
      'partial', 'missing_status', 'invalid_status', 'missing_title', 'missing_contractor',
      'invalid_id', 'invalid_subject', 'invalid_numeric', 'invalid_timestamp', 'invalid_list',
    ] as const) {
      test(`${label} ${mutation.replaceAll('_', ' ')} output remains on consumed fallback`, async ({ page }) => {
        await installHarness(page, { outputType });
        await openActive(page, outputType);
        await confirm(page, outputType);
        await consume(page, outputType);
        await waitForOutputLoad(page, outputType);
        await h(page, `h.completeMalformedOutput('${outputType}', '${mutation}')`);
        await expect(page.getByText(`${label} created, but it could not be opened. Open ${label} to try again.`)).toBeVisible();
        await expect(page.getByRole('button', { name: `Open ${label}` })).toBeVisible();
        const snapshot = await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()');
        expect(snapshot.adopted).toEqual([]);
        expect(snapshot.focusCount).toBe(0);
        expect(await h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBe(1);
      });
    }

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

  test('duplicate external succeeded events remain explicit-only and explicit Open uses one loader', async ({ page }) => {
    await installHarness(page, { outputType: 'estimate' });
    await openActive(page, 'estimate');
    const dispatchSucceeded = () => page.evaluate(ids => {
      const harness = (window as typeof window & { __c2: { storageKey: string } }).__c2;
      const value = JSON.stringify({ schemaVersion: 1, contractorId: ids.contractor, draftId: ids.draft, outputType: 'estimate', idempotencyKey: ids.attempt, phase: 'succeeded', createdAt: '2020-07-20T10:00:00.000Z', updatedAt: '2020-07-20T10:01:00.000Z', launchId: ids.launch, estimateId: ids.estimate, jobId: null, outputIdSnapshot: ids.estimate, outputAvailable: true });
      localStorage.setItem(harness.storageKey, value);
      window.dispatchEvent(new StorageEvent('storage', { key: harness.storageKey, newValue: value, storageArea: localStorage }));
    }, IDS);
    await dispatchSucceeded();
    await dispatchSucceeded();
    await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(1);
    await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', 'estimate', true))`);
    expect(await h<number>(page, `h.count('output', 'estimate')`)).toBe(0);
    await page.getByRole('button', { name: 'Open Estimate' }).click();
    await waitForOutputLoad(page, 'estimate');
    await h(page, `h.completeOutput('estimate')`);
    await expect.poll(() => h(page, 'h.snapshot()')).toMatchObject({ focusCount: 1, focusedId: IDS.estimate, focusRequest: null });
    expect(await h<number>(page, `h.count('output', 'estimate')`)).toBe(1);
    expect(await h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBe(0);
  });

  test('genuine Strict Mode replay loads, adopts, and focuses once', async ({ page }) => {
    await installHarness(page, { outputType: 'job', strictMode: true });
    await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(1);
    await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('active', 'job', true))`);
    await h(page, `h.completeLastRpc('servsync_get_work_draft', h.envelope('active', 'job', true))`);
    await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
    await confirm(page, 'job');
    await consume(page, 'job');
    await waitForOutputLoad(page, 'job');
    expect(await h<number>(page, `h.count('output', 'job')`)).toBe(1);
    expect(await h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBe(1);
    await h(page, `h.completeOutput('job')`);
    await expect(page.getByTestId('output-heading')).toBeFocused();
    expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()'))).toMatchObject({ adopted: [`job:${IDS.job}`], focusCount: 1 });
  });

  for (const completion of ['success', 'failure'] as const) {
    test(`stale automatic ${completion} cannot clear a newer manual Open`, async ({ page }) => {
      await installHarness(page, { outputType: 'estimate' });
      await openActive(page, 'estimate');
      await confirm(page, 'estimate');
      await consume(page, 'estimate');
      await waitForOutputLoad(page, 'estimate');
      await page.getByRole('button', { name: 'Back to Work' }).click();
      await h(page, `h.showTarget('${IDS.draft}')`);
      await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(2);
      await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', 'estimate', true))`);
      await page.getByRole('button', { name: 'Open Estimate' }).click();
      await expect.poll(() => h<number>(page, `h.count('output', 'estimate')`)).toBe(2);
      if (completion === 'success') await h(page, `h.completeOutput('estimate')`);
      else await h(page, `h.failOutput('estimate')`);
      await expect(page.getByRole('button', { name: 'Opening…' })).toBeDisabled();
      expect((await h<{ adopted: string[] }>(page, 'h.snapshot()')).adopted).toEqual([]);
      await h(page, `h.completeOutput('estimate')`);
      await expect(page.getByTestId('output-heading')).toBeFocused();
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()'))).toMatchObject({ adopted: [`estimate:${IDS.estimate}`], focusCount: 1 });
    });
  }

  test('not-found with canonical output still available falls back without looping', async ({ page }) => {
    await installHarness(page, { outputType: 'job' });
    await openActive(page, 'job');
    await confirm(page, 'job');
    await consume(page, 'job');
    await waitForOutputLoad(page, 'job');
    await h(page, `h.failOutput('job', { status: 404, message: 'Job not found' })`);
    await expect.poll(() => h<number>(page, `h.count('rpc', 'servsync_get_work_draft')`)).toBeGreaterThan(2);
    await h(page, `h.completeRpc('servsync_get_work_draft', h.envelope('consumed', 'job', true))`);
    await expect(page.getByText('Job created, but it could not be opened. Open Job to try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Job' })).toBeVisible();
    expect(await h<number>(page, `h.count('output', 'job')`)).toBe(1);
    expect(await h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBe(1);
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

  for (const race of ['target', 'contractor', 'client', 'unmount'] as const) {
    test(`${race} change suppresses a late automatic loader failure`, async ({ page }) => {
      await installHarness(page, { outputType: 'estimate' });
      await openActive(page, 'estimate');
      await confirm(page, 'estimate');
      await consume(page, 'estimate');
      await waitForOutputLoad(page, 'estimate');
      if (race === 'target') await h(page, `h.showTarget('${IDS.otherDraft}')`);
      if (race === 'contractor') await h(page, `h.switchContractor('${IDS.otherContractor}')`);
      if (race === 'client') await h(page, 'h.switchClient()');
      if (race === 'unmount') await h(page, 'h.unmount()');
      await h(page, `h.failOutput('estimate')`);
      await expect(page.getByText(/could not be opened/)).toHaveCount(0);
      expect((await h<{ adopted: string[]; focusCount: number }>(page, 'h.snapshot()'))).toMatchObject({ adopted: [], focusCount: 0 });
      expect(await h<number>(page, `h.count('rpc', 'servsync_launch_work_draft')`)).toBe(1);
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
