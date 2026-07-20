import { expect, test, type Page } from '@playwright/test';
import {
  durableDraftLaunchAllowsEditing,
  durableDraftLaunchCanRetry,
  durableDraftLaunchReducer,
  INITIAL_DURABLE_DRAFT_LAUNCH_STATE,
} from '../../src/features/drafts/durableDraftLaunchMachine';
import { classifyDurableDraftLaunchFailure } from '../../src/features/drafts/durableDraftLaunchErrorCopy';
import { DurableDraftError } from '../../src/features/drafts/durableDraftLaunchApi';

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000301';
const DRAFT_ID = '00000000-0000-4000-8000-000000000302';
const ITEM_ID = '00000000-0000-4000-8000-000000000303';
const HOMEOWNER_ID = '00000000-0000-4000-8000-000000000304';
const HOME_ID = '00000000-0000-4000-8000-000000000305';
const REQUEST_ID = '00000000-0000-4000-8000-000000000306';
const ESTIMATE_ID = '00000000-0000-4000-8000-000000000307';
const JOB_ID = '00000000-0000-4000-8000-000000000308';
const LAUNCH_ID = '00000000-0000-4000-8000-000000000309';
const ATTEMPT_KEY = '00000000-0000-4000-8000-00000000030a';

type OutputType = 'estimate' | 'job';

async function installLaunchHarness(page: Page, options: {
  outputType?: OutputType | null;
  launchEnabled?: boolean;
  canLaunchEstimate?: boolean;
  canLaunchJob?: boolean;
  canPersistDraft?: boolean;
  targetKind?: 'durable' | 'new';
  storedAttempt?: 'prepared' | 'launching' | 'ambiguous' | 'succeeded' | 'malformed';
} = {}) {
  await page.goto('/');
  await page.evaluate(async ({ ids, options }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const workspaceModule = await dynamicImport('/src/features/drafts/DurableDraftWorkspace.tsx');
    const mappingModule = await dynamicImport('/src/features/drafts/draftComposerMappings.ts');
    const attemptModule = await dynamicImport('/src/features/drafts/durableDraftLaunchAttempt.ts');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void; unmount: () => void } }).createRoot;
    const DurableDraftWorkspace = workspaceModule.DurableDraftWorkspace as (...args: unknown[]) => unknown;
    const createBlankDraft = mappingModule.createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;
    const attemptStorageKey = attemptModule.durableDraftLaunchAttemptKey as (contractorId: string, draftId: string) => string;

    document.body.innerHTML = '<div id="durable-launch-test-root"></div>';
    localStorage.clear();
    const root = createRoot(document.getElementById('durable-launch-test-root') as HTMLElement);
    type PendingCall = {
      kind: 'rpc' | 'list' | 'output';
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
    const client = {
      rpc(name: string, args: unknown) {
        const next = deferred();
        calls.push({ kind: 'rpc', name, args, settled: false, resolve: next.resolve, reject: next.reject });
        return next.promise;
      },
      from(name: string) {
        const next = deferred();
        const call: PendingCall = { kind: 'list', name, args: null, settled: false, resolve: next.resolve, reject: next.reject };
        calls.push(call);
        const query = {
          select() { return query; },
          in(_column: string, values: string[]) { call.args = values; return query; },
          order() { return query; },
          then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) { return next.promise.then(resolve, reject); },
        };
        return query;
      },
    };
    const itemDraft = {
      id: 'local-row-1',
      job_work_item_id: options.targetKind === 'new' ? null : ids.itemId,
      line_type: 'labor',
      description: 'Install replacement',
      line_title: 'Install replacement',
      customer_description: 'Install replacement',
      model_spec: '',
      supply_status: '',
      quantity: '1',
      unit: 'each',
      unit_price: '500.00',
      labor_hours: '2',
      work_state: 'not_started',
      room_id: null,
      room_label: 'Utility room',
      location_label: '',
      internal_notes: 'Private item note',
    };
    const initialDraft = createBlankDraft({
      subject_type: 'connected',
      homeowner_user_id: ids.homeownerId,
      home_id: ids.homeId,
      service_request_id: ids.requestId,
      title: 'Water heater plan',
      scope: 'Replace water heater',
      notes: 'Private contractor note',
      intended_output: options.outputType ?? null,
      labor_mode: 'line_specific',
      line_items: [itemDraft],
    });
    const rawItem = (draftId: string) => ({
      id: ids.itemId,
      draft_id: draftId,
      contractor_id: ids.contractorId,
      title: 'Install replacement',
      description: 'Install replacement',
      customer_description: 'Install replacement',
      internal_notes: 'Private item note',
      line_type: 'labor',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 50000,
      labor_hours: 2,
      room_id: null,
      room_label: 'Utility room',
      location_label: '',
      sort_order: 0,
      created_at: '2026-07-19T10:00:00.000Z',
      updated_at: '2026-07-19T10:00:00.000Z',
    });
    const rawDraft = (status: 'active' | 'consumed' = 'active', outputType: 'estimate' | 'job' | null = options.outputType ?? null, available = true) => ({
      id: ids.draftId,
      contractor_id: ids.contractorId,
      created_by_user_id: null,
      homeowner_user_id: ids.homeownerId,
      home_id: ids.homeId,
      local_contact_id: null,
      local_home_id: null,
      service_request_id: ids.requestId,
      subject_type: 'connected_homeowner',
      subject_display_name_snapshot: 'Customer A',
      property_display_snapshot: 'Home A',
      title: 'Water heater plan',
      scope_description: 'Replace water heater',
      private_notes: 'Private contractor note',
      intended_output: outputType,
      work_format: 'standard',
      labor_mode: 'line_specific',
      labor_rate_cents: null,
      job_labor_hours: null,
      status,
      legacy_inspection_id: null,
      launched_output_type: status === 'consumed' ? outputType : null,
      launched_estimate_id: status === 'consumed' && outputType === 'estimate' && available ? ids.estimateId : null,
      launched_job_id: status === 'consumed' && outputType === 'job' && available ? ids.jobId : null,
      launched_estimate_id_snapshot: status === 'consumed' && outputType === 'estimate' ? ids.estimateId : null,
      launched_job_id_snapshot: status === 'consumed' && outputType === 'job' ? ids.jobId : null,
      launched_at: status === 'consumed' ? '2026-07-19T10:05:00.000Z' : null,
      launched_by_user_id: null,
      created_at: '2026-07-19T10:00:00.000Z',
      updated_at: status === 'consumed' ? '2026-07-19T10:05:00.000Z' : '2026-07-19T10:00:00.000Z',
    });
    const envelope = (status: 'active' | 'consumed' = 'active', outputType: 'estimate' | 'job' | null = options.outputType ?? null, available = true) => ({
      draft: rawDraft(status, outputType, available),
      items: [rawItem(ids.draftId)],
      launches: [],
    });
    const state = {
      target: options.targetKind === 'new'
        ? { kind: 'new', initialDraft }
        : { kind: 'durable', draftId: ids.draftId },
      launchEnabled: options.launchEnabled ?? true,
      capabilities: {
        contractorId: ids.contractorId,
        canReadDrafts: true,
        canPersistDraft: options.canPersistDraft ?? true,
        canImportLegacyDraft: true,
        canLaunchJob: options.canLaunchJob ?? true,
        canLaunchEstimate: options.canLaunchEstimate ?? true,
      },
      refreshedCapabilities: null as Record<string, unknown> | null,
      backCount: 0,
      adoptCount: 0,
      outputLoadCount: 0,
      openTargets: [] as string[],
    };
    const render = () => root.render(React.createElement(DurableDraftWorkspace, {
      client,
      mode: 'editor',
      target: state.target,
      capabilities: state.capabilities,
      launchEnabled: state.launchEnabled,
      onRefreshCapabilities: async () => state.refreshedCapabilities ?? state.capabilities,
      legacyDrafts: [],
      connectedOptions: [{ id: ids.homeownerId, label: 'Customer A', properties: [{ id: ids.homeId, label: 'Home A' }] }],
      localOptions: [],
      customerLabel: () => 'Customer A',
      propertyLabel: () => 'Home A',
      onStartNew: () => undefined,
      onOpenTarget: (target: Record<string, unknown>) => {
        state.target = target;
        state.openTargets.push(`${String(target.kind)}:${String(target.draftId ?? '')}`);
        render();
      },
      onBack: () => { state.backCount += 1; state.target = null; render(); },
      onLoadOutput: async (type: string, id: string) => {
        state.outputLoadCount += 1;
        return { type, id, record: { id } };
      },
      onAdoptOutput: () => { state.adoptCount += 1; },
    }));

    const storedPhase = options.storedAttempt;
    if (storedPhase) {
      const key = attemptStorageKey(ids.contractorId, ids.draftId);
      if (storedPhase === 'malformed') {
        localStorage.setItem(key, '{"schemaVersion":1,"private_notes":"must not survive"}');
      } else {
        const outputType = options.outputType ?? 'estimate';
        localStorage.setItem(key, JSON.stringify({
          schemaVersion: 1,
          contractorId: ids.contractorId,
          draftId: ids.draftId,
          outputType,
          idempotencyKey: ids.attemptKey,
          phase: storedPhase,
          createdAt: '2026-07-19T10:00:00.000Z',
          updatedAt: '2026-07-19T10:01:00.000Z',
          ...(storedPhase === 'succeeded' ? {
            launchId: ids.launchId,
            estimateId: outputType === 'estimate' ? ids.estimateId : null,
            jobId: outputType === 'job' ? ids.jobId : null,
            outputIdSnapshot: outputType === 'estimate' ? ids.estimateId : ids.jobId,
            outputAvailable: true,
          } : {}),
        }));
      }
    }

    const harness = {
      render,
      envelope,
      activeEnvelope: (outputType: OutputType | null = options.outputType === undefined ? 'estimate' : options.outputType) => envelope('active', outputType),
      consumedEnvelope: (outputType: OutputType = options.outputType ?? 'estimate', available = true) => envelope('consumed', outputType, available),
      launchResult: (outputType: OutputType = options.outputType ?? 'estimate', status: 'succeeded' | 'already_consumed' = 'succeeded', idempotent = status === 'succeeded') => ({
        draft_id: ids.draftId,
        status,
        output_type: outputType,
        estimate_id: outputType === 'estimate' ? ids.estimateId : null,
        job_id: outputType === 'job' ? ids.jobId : null,
        output_id_snapshot: outputType === 'estimate' ? ids.estimateId : ids.jobId,
        output_available: true,
        launch_id: ids.launchId,
        idempotent,
      }),
      completeRpc(name: string, data: unknown, occurrence = 0) {
        const matches = calls.filter(call => !call.settled && call.kind === 'rpc' && call.name === name);
        const call = matches[occurrence];
        if (!call) throw new Error(`Missing pending rpc:${name}:${occurrence}`);
        call.settled = true;
        call.resolve({ data, error: null, status: 200 });
      },
      failRpc(name: string, error: Record<string, unknown> = { message: 'network request failed' }) {
        const call = calls.find(candidate => !candidate.settled && candidate.kind === 'rpc' && candidate.name === name);
        if (!call) throw new Error(`Missing pending rpc:${name}`);
        call.settled = true;
        call.resolve({ data: null, error, status: 503 });
      },
      rejectRpc(name: string, message = 'Failed to fetch') {
        const call = calls.find(candidate => !candidate.settled && candidate.kind === 'rpc' && candidate.name === name);
        if (!call) throw new Error(`Missing pending rpc:${name}`);
        call.settled = true;
        call.reject(new TypeError(message));
      },
      completeList(data: unknown[]) {
        const call = calls.find(candidate => !candidate.settled && candidate.kind === 'list');
        if (!call) return;
        call.settled = true;
        call.resolve({ data, error: null, status: 200 });
      },
      callCount(name: string) { return calls.filter(call => call.name === name).length; },
      calls() { return calls.map(({ kind, name, args, settled }) => ({ kind, name, args, settled })); },
      setRefreshedCapabilities(overrides: Record<string, unknown>) { state.refreshedCapabilities = { ...state.capabilities, ...overrides }; },
      setLaunchEnabled(enabled: boolean) { state.launchEnabled = enabled; render(); },
      setTarget(target: Record<string, unknown>) { state.target = target; render(); },
      setContractorId(contractorId: string) { state.capabilities = { ...state.capabilities, contractorId }; render(); },
      snapshot() { return { ...state, capabilities: { ...state.capabilities }, calls: calls.map(call => ({ kind: call.kind, name: call.name, args: call.args, settled: call.settled })) }; },
      dispatchAttempt(phase: 'launching' | 'ambiguous' | 'succeeded', outputType: OutputType = options.outputType ?? 'estimate') {
        const key = attemptStorageKey(ids.contractorId, ids.draftId);
        const value = JSON.stringify({
          schemaVersion: 1,
          contractorId: ids.contractorId,
          draftId: ids.draftId,
          outputType,
          idempotencyKey: ids.attemptKey,
          phase,
          createdAt: '2026-07-19T10:00:00.000Z',
          updatedAt: '2026-07-19T10:02:00.000Z',
          ...(phase === 'succeeded' ? {
            launchId: ids.launchId,
            estimateId: outputType === 'estimate' ? ids.estimateId : null,
            jobId: outputType === 'job' ? ids.jobId : null,
            outputIdSnapshot: outputType === 'estimate' ? ids.estimateId : ids.jobId,
            outputAvailable: true,
          } : {}),
        });
        localStorage.setItem(key, value);
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
      },
      storageRecord() {
        const value = localStorage.getItem(attemptStorageKey(ids.contractorId, ids.draftId));
        return value ? JSON.parse(value) : null;
      },
      breakStorage(operation: 'getItem' | 'setItem') {
        const original = Storage.prototype[operation];
        Object.defineProperty(Storage.prototype, operation, { configurable: true, value() { throw new DOMException('blocked'); } });
        return () => Object.defineProperty(Storage.prototype, operation, { configurable: true, value: original });
      },
    };
    (window as typeof window & { __launchHarness: typeof harness }).__launchHarness = harness;
    render();
  }, { ids: {
    contractorId: CONTRACTOR_ID,
    draftId: DRAFT_ID,
    itemId: ITEM_ID,
    homeownerId: HOMEOWNER_ID,
    homeId: HOME_ID,
    requestId: REQUEST_ID,
    estimateId: ESTIMATE_ID,
    jobId: JOB_ID,
    launchId: LAUNCH_ID,
    attemptKey: ATTEMPT_KEY,
  }, options });
}

async function harnessValue<T>(page: Page, expression: string): Promise<T> {
  return page.evaluate(expression => {
    const harness = (window as typeof window & { __launchHarness: Record<string, unknown> }).__launchHarness;
    return new Function('h', `return (${expression})`)(harness) as T;
  }, expression);
}

async function completeInitialDraft(page: Page, outputType: OutputType | null = 'estimate') {
  await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 0);
  await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.activeEnvelope(${outputType === null ? 'null' : `'${outputType}'`}))`);
  await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
}

async function confirmLaunch(page: Page, outputType: OutputType) {
  const label = outputType === 'estimate' ? 'Estimate' : 'Job';
  await page.getByTestId('durable-draft-create-output').click();
  await expect(page.getByRole('dialog', { name: `Create ${label}?` })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: `Create ${label}` }).click();
}

async function completeLaunchAndConsume(page: Page, outputType: OutputType, status: 'succeeded' | 'already_consumed' = 'succeeded', idempotent = status === 'succeeded') {
  await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') > 0);
  await harnessValue(page, `h.completeRpc('servsync_launch_work_draft', h.launchResult('${outputType}', '${status}', ${String(idempotent)}))`);
  await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
  await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('${outputType}', true))`);
  await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
}

test.describe('Slice 2C-C1 launch machine', () => {
  test('confirmation cancel returns to idle', () => {
    const opened = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    expect(opened.phase).toBe('confirming');
    expect(durableDraftLaunchReducer(opened, { type: 'CANCEL_CONFIRMATION' })).toEqual(INITIAL_DURABLE_DRAFT_LAUNCH_STATE);
  });

  test('save, prepare, launch, validate, and consume require token ownership', () => {
    const token = Symbol('owner');
    const stale = Symbol('stale');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'job' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'job', operationToken: token, needsSave: true });
    expect(state.phase).toBe('saving');
    expect(durableDraftLaunchReducer(state, { type: 'SAVED', operationToken: stale })).toBe(state);
    state = durableDraftLaunchReducer(state, { type: 'SAVED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    expect(state.phase).toBe('launching');
    expect(durableDraftLaunchAllowsEditing(state)).toBe(false);
    state = durableDraftLaunchReducer(state, { type: 'RESPONSE_RECEIVED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'CONSUMED_PROOF', operationToken: token, alreadyConsumed: false });
    state = durableDraftLaunchReducer(state, { type: 'CONSUMED', operationToken: token });
    expect(state.phase).toBe('consumed');
  });

  test('ambiguous state retains the key and is retryable but noneditable', () => {
    const token = Symbol('owner');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'estimate', operationToken: token, needsSave: false });
    state = durableDraftLaunchReducer(state, { type: 'FAIL', operationToken: token, phase: 'ambiguous', message: 'uncertain', idempotencyKey: ATTEMPT_KEY });
    expect(state.idempotencyKey).toBe(ATTEMPT_KEY);
    expect(durableDraftLaunchCanRetry(state)).toBe(true);
    expect(durableDraftLaunchAllowsEditing(state)).toBe(false);
  });

  test('error taxonomy separates denied, fixable, reconcile, and ambiguous outcomes', () => {
    const error = (code: 'DRAFT_PERMISSION_DENIED' | 'DRAFT_INVALID' | 'DRAFT_NOT_ACTIVE' | 'DRAFT_RESPONSE_INVALID') => new DurableDraftError({
      name: 'DurableDraftError', phase: 'launch', kind: 'application', applicationCode: code,
      postgresCode: null, details: null, hint: null, httpStatus: 400, transportClassification: null, safeMessage: code,
    });
    expect(classifyDurableDraftLaunchFailure(error('DRAFT_PERMISSION_DENIED')).kind).toBe('denied');
    expect(classifyDurableDraftLaunchFailure(error('DRAFT_INVALID')).kind).toBe('fixable');
    expect(classifyDurableDraftLaunchFailure(error('DRAFT_NOT_ACTIVE')).kind).toBe('reconcile');
    expect(classifyDurableDraftLaunchFailure(error('DRAFT_RESPONSE_INVALID')).kind).toBe('ambiguous');
  });
});

test.describe('Slice 2C-C1 rendered durable launch behavior', () => {
  test('gate-off durable editor exposes no launch control', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', launchEnabled: false });
    await completeInitialDraft(page, 'estimate');
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();
  });

  test('Demo-equivalent suppression exposes no launch mutation', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job', launchEnabled: false });
    await completeInitialDraft(page, 'job');
    await expect(page.getByText('Create Job', { exact: true })).toHaveCount(0);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
  });

  test('null intent provides guidance without a generic launch action', async ({ page }) => {
    await installLaunchHarness(page, { outputType: null });
    await completeInitialDraft(page, null);
    await expect(page.getByTestId('durable-draft-launch-guidance')).toContainText('Choose Estimate or Job');
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    await expect(page.getByText('Launch Draft', { exact: true })).toHaveCount(0);
  });

  for (const outputType of ['estimate', 'job'] as const) {
    const label = outputType === 'estimate' ? 'Estimate' : 'Job';

    test(`${label} action appears with authority`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await expect(page.getByTestId('durable-draft-create-output')).toHaveText(`Create ${label}`);
      await expect(page.getByTestId('durable-draft-create-output')).toBeEnabled();
    });

    test(`${label} action fails closed without output authority`, async ({ page }) => {
      await installLaunchHarness(page, { outputType, ...(outputType === 'estimate' ? { canLaunchEstimate: false } : { canLaunchJob: false }) });
      await completeInitialDraft(page, outputType);
      await expect(page.getByTestId('durable-draft-create-output')).toBeDisabled();
      await expect(page.getByTestId('durable-draft-launch-disabled-reason')).toContainText(`does not allow creating this ${label}`);
    });

    test(`${label} confirmation is explicit, private-safe, and cancellable`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await page.getByTestId('durable-draft-create-output').click();
      const dialog = page.getByRole('dialog', { name: `Create ${label}?` });
      await expect(dialog).toContainText('Water heater plan');
      await expect(dialog).toContainText('Customer A');
      await expect(dialog).not.toContainText('Private contractor note');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
    });

    test(`clean ${label} launch skips save and persists attempt before RPC`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      expect(await harnessValue<number>(page, "h.callCount('servsync_save_work_draft')")).toBe(0);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
      const record = await harnessValue<Record<string, unknown>>(page, 'h.storageRecord()');
      expect(record.phase).toBe('launching');
      expect(record.outputType).toBe(outputType);
      expect(record.private_notes).toBeUndefined();
    });

    test(`fresh ${label} success adopts consumed without automatic output navigation`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      await completeLaunchAndConsume(page, outputType, 'succeeded', false);
      await expect(page.getByText(`${label} created.`, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: `Open ${label}` })).toBeVisible();
      const snapshot = await harnessValue<{ adoptCount: number; outputLoadCount: number }>(page, 'h.snapshot()');
      expect(snapshot.adoptCount).toBe(0);
      expect(snapshot.outputLoadCount).toBe(0);
    });

    test(`explicit Open ${label} remains available after consumed adoption`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      await completeLaunchAndConsume(page, outputType, 'succeeded', false);
      await page.getByRole('button', { name: `Open ${label}` }).click();
      await expect.poll(() => harnessValue<number>(page, 'h.snapshot().adoptCount')).toBe(1);
      await expect.poll(() => harnessValue<number>(page, 'h.snapshot().outputLoadCount')).toBe(1);
    });

    test(`already-consumed live ${label} reconciles without relaunch or a new key`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      const before = await harnessValue<string>(page, 'h.storageRecord().idempotencyKey');
      await completeLaunchAndConsume(page, outputType, 'already_consumed', false);
      expect(await harnessValue<string>(page, 'h.storageRecord().idempotencyKey')).toBe(before);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
    });

    test(`deleted ${label} remains consumed and exposes no relaunch`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') > 0);
      await harnessValue(page, `h.completeRpc('servsync_launch_work_draft', { ...h.launchResult('${outputType}', 'succeeded', false), ${outputType === 'estimate' ? 'estimate_id' : 'job_id'}: null, output_available: false })`);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
      await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('${outputType}', false))`);
      await expect(page.getByText(`This Draft created an ${label} that is no longer available.`)).toBeVisible();
      await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    });

    test(`${label} malformed response becomes ambiguous and retains the same key`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      const key = await harnessValue<string>(page, 'h.storageRecord().idempotencyKey');
      await harnessValue(page, `h.completeRpc('servsync_launch_work_draft', { output_type: '${outputType}' })`);
      await expect(page.getByTestId('durable-draft-launch-ambiguous')).toContainText('could not confirm');
      expect(await harnessValue<string>(page, 'h.storageRecord().idempotencyKey')).toBe(key);
      expect(await harnessValue<string>(page, 'h.storageRecord().phase')).toBe('ambiguous');
    });

    test(`${label} transport failure remains frozen for same-key retry`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      const key = await harnessValue<string>(page, 'h.storageRecord().idempotencyKey');
      await harnessValue(page, "h.rejectRpc('servsync_launch_work_draft')");
      await expect(page.getByTestId('durable-draft-create-output')).toHaveText(`Retry Create ${label}`);
      await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
      expect(await harnessValue<string>(page, 'h.storageRecord().idempotencyKey')).toBe(key);
    });

    test(`${label} same-key retry reaches canonical consumed state`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      const key = await harnessValue<string>(page, 'h.storageRecord().idempotencyKey');
      await harnessValue(page, "h.rejectRpc('servsync_launch_work_draft')");
      await page.getByTestId('durable-draft-create-output').click();
      await page.getByRole('dialog').getByRole('button', { name: `Create ${label}` }).click();
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') === 2);
      const calls = await harnessValue<Array<{ name: string; args: Record<string, string> }>>(page, 'h.calls()');
      const launchCalls = calls.filter(call => call.name === 'servsync_launch_work_draft');
      expect(launchCalls[0].args.p_idempotency_key).toBe(key);
      expect(launchCalls[1].args.p_idempotency_key).toBe(key);
      await harnessValue(page, `h.completeRpc('servsync_launch_work_draft', h.launchResult('${outputType}', 'succeeded', true))`);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
      await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('${outputType}', true))`);
      await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    });

    test(`${label} save failure prevents attempt creation and launch`, async ({ page }) => {
      await installLaunchHarness(page, { outputType, targetKind: 'new' });
      await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
      await confirmLaunch(page, outputType);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') > 0);
      await harnessValue(page, "h.failRpc('servsync_save_work_draft', { message: 'DRAFT_INVALID' })");
      await expect(page.getByTestId('durable-draft-launch-error')).toBeVisible();
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
      expect(await harnessValue<null>(page, 'h.storageRecord()')).toBeNull();
    });

    test(`${label} capability loss after save prevents attempt and RPC`, async ({ page }) => {
      await installLaunchHarness(page, { outputType, targetKind: 'new' });
      await harnessValue(page, `h.setRefreshedCapabilities({ ${outputType === 'estimate' ? 'canLaunchEstimate' : 'canLaunchJob'}: false })`);
      await confirmLaunch(page, outputType);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') > 0);
      await harnessValue(page, `h.completeRpc('servsync_save_work_draft', h.activeEnvelope('${outputType}'))`);
      await expect(page.getByTestId('durable-draft-launch-error')).toContainText('does not allow');
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
      expect(await harnessValue<null>(page, 'h.storageRecord()')).toBeNull();
    });

    test(`local-new ${label} saves canonically before launching`, async ({ page }) => {
      await installLaunchHarness(page, { outputType, targetKind: 'new' });
      await confirmLaunch(page, outputType);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') > 0);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
      await harnessValue(page, `h.completeRpc('servsync_save_work_draft', h.activeEnvelope('${outputType}'))`);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') > 0);
      const snapshot = await harnessValue<{ openTargets: string[] }>(page, 'h.snapshot()');
      expect(snapshot.openTargets).toContain(`durable:${DRAFT_ID}`);
    });

    test(`dirty existing ${label} performs one save before launch`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await page.getByLabel('Draft title').fill('Updated water heater plan');
      await confirmLaunch(page, outputType);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') > 0);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
      const saved = await harnessValue<Record<string, unknown>>(page, `({ ...h.activeEnvelope('${outputType}'), draft: { ...h.activeEnvelope('${outputType}').draft, title: 'Updated water heater plan' } })`);
      await harnessValue(page, `h.completeRpc('servsync_save_work_draft', ${JSON.stringify(saved)})`);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') > 0);
      expect(await harnessValue<number>(page, "h.callCount('servsync_save_work_draft')")).toBe(1);
    });

    test(`${label} duplicate confirmation activation creates one operation`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await page.getByTestId('durable-draft-create-output').click();
      const create = page.getByRole('dialog').getByRole('button', { name: `Create ${label}` });
      await create.dblclick();
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') > 0);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
    });

    test(`${label} page recovery from prepared attempt never auto-launches`, async ({ page }) => {
      await installLaunchHarness(page, { outputType, storedAttempt: 'prepared' });
      await completeInitialDraft(page, outputType);
      await expect(page.getByTestId('durable-draft-create-output')).toHaveText(`Continue Create ${label}`);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
      await expect(page.getByRole('button', { name: 'Discard unused attempt' })).toBeVisible();
    });

    for (const phase of ['launching', 'ambiguous'] as const) {
      test(`${label} page recovery from ${phase} attempt freezes editing and requires same-key retry`, async ({ page }) => {
        await installLaunchHarness(page, { outputType, storedAttempt: phase });
        await completeInitialDraft(page, outputType);
        await expect(page.getByTestId('durable-draft-create-output')).toHaveText(`Retry Create ${label}`);
        await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
        expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
        expect(await harnessValue<string>(page, 'h.storageRecord().idempotencyKey')).toBe(ATTEMPT_KEY);
      });
    }

    test(`${label} succeeded attempt reconciles canonical state without calling launch`, async ({ page }) => {
      await installLaunchHarness(page, { outputType, storedAttempt: 'succeeded' });
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 0);
      await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.activeEnvelope('${outputType}'))`);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
      await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('${outputType}', true))`);
      await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
    });

    test(`${label} multi-tab launching event disables local mutation without auto-launch`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await harnessValue(page, `h.dispatchAttempt('launching', '${outputType}')`);
      await expect(page.getByTestId('durable-draft-create-output')).toHaveText(`Retry Create ${label}`);
      await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
    });

    test(`${label} multi-tab succeeded event reconciles consumed without auto-launch`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await harnessValue(page, `h.dispatchAttempt('succeeded', '${outputType}')`);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
      await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('${outputType}', true))`);
      await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
    });

    test(`${label} canonical reload failure remains noneditable and does not retry launch`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') > 0);
      await harnessValue(page, `h.completeRpc('servsync_launch_work_draft', h.launchResult('${outputType}', 'succeeded', false))`);
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
      await harnessValue(page, "h.failRpc('servsync_get_work_draft')");
      await expect(page.getByTestId('durable-draft-consumed-reconciliation')).toBeVisible();
      await expect(page.getByText('Do not create it again.')).toBeVisible();
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
    });
  }

  test('viewer-style read-only state exposes neither Save nor Create', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', canPersistDraft: false, canLaunchEstimate: false, canLaunchJob: false });
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 0);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.activeEnvelope('estimate'))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0);
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
  });

  test('malformed stored attempt fails closed and does not expose private content', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', storedAttempt: 'malformed' });
    await completeInitialDraft(page, 'estimate');
    await expect(page.getByTestId('durable-draft-launch-disabled-reason')).toContainText('safely read');
    await expect(page.getByText('must not survive')).toHaveCount(0);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
  });

  test('storage write failure blocks RPC and reports retry protection unavailable', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await page.getByTestId('durable-draft-create-output').click();
    await harnessValue(page, 'h.breakStorage(\'setItem\')');
    await page.getByRole('dialog').getByRole('button', { name: 'Create Estimate' }).click();
    await expect(page.getByTestId('durable-draft-launch-storage-error')).toContainText('retry protection is unavailable');
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
  });

  test('platform-admin-like unresolved contractor context exposes no mutation controls', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job', canPersistDraft: false, canLaunchEstimate: false, canLaunchJob: false });
    await page.evaluate(() => {
      const h = (window as typeof window & { __launchHarness: { snapshot: () => { capabilities: Record<string, unknown> }; render: () => void } }).__launchHarness;
      h.snapshot().capabilities.contractorId = null;
      h.render();
    });
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
  });

  test('there is no Draft-to-Invoice action in the rendered durable workspace', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await expect(page.getByText(/Create Invoice|Launch Draft|Finish Draft/)).toHaveCount(0);
  });

  test('an ordinary pending save blocks launch commitment', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await page.getByLabel('Draft title').fill('Saving first');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') > 0);
    await expect(page.getByTestId('durable-draft-create-output')).toBeDisabled();
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
  });

  test('older same-key launch failure cannot clear a newer token-owned operation', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await confirmLaunch(page, 'estimate');
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Back to Work' }).click();
    await harnessValue(page, `h.setTarget({ kind: 'durable', draftId: '${DRAFT_ID}' })`);
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.activeEnvelope('estimate'))");
    await expect(page.getByTestId('durable-draft-create-output')).toHaveText('Retry Create Estimate');
    await page.getByTestId('durable-draft-create-output').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create Estimate' }).click();
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') === 2);

    await harnessValue(page, "h.rejectRpc('servsync_launch_work_draft', 'old request failed')");
    await expect(page.getByTestId('durable-draft-create-output')).toHaveText('Working…');
    await expect(page.getByTestId('durable-draft-create-output')).toBeDisabled();
    await expect(page.getByTestId('durable-draft-launch-ambiguous')).toHaveCount(0);

    await harnessValue(page, "h.completeRpc('servsync_launch_work_draft', h.launchResult('estimate', 'succeeded', true))");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 2);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(2);
  });

  test('contractor change makes a pending launch failure stale', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job' });
    await completeInitialDraft(page, 'job');
    await confirmLaunch(page, 'job');
    await harnessValue(page, "h.setContractorId('00000000-0000-4000-8000-000000000399')");
    await harnessValue(page, "h.rejectRpc('servsync_launch_work_draft', 'old contractor failed')");
    await expect(page.getByTestId('durable-draft-launch-ambiguous')).toHaveCount(0);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
  });
});
