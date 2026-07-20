import { expect, test, type Page } from '@playwright/test';
import {
  durableDraftLaunchAllowsEditing,
  durableDraftLaunchCanRetry,
  durableDraftLaunchReducer,
  decideDurableDraftLaunchTransition,
  INITIAL_DURABLE_DRAFT_LAUNCH_STATE,
} from '../../src/features/drafts/durableDraftLaunchMachine';
import { classifyDurableDraftLaunchFailure } from '../../src/features/drafts/durableDraftLaunchErrorCopy';
import { DurableDraftError } from '../../src/features/drafts/durableDraftLaunchApi';
import {
  clearDurableDraftLaunchAttempt,
  durableDraftLaunchAttemptKey,
} from '../../src/features/drafts/durableDraftLaunchAttempt';

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
const OTHER_ATTEMPT_KEY = '00000000-0000-4000-8000-00000000030b';

type OutputType = 'estimate' | 'job';

async function installLaunchHarness(page: Page, options: {
  outputType?: OutputType | null;
  launchEnabled?: boolean;
  canLaunchEstimate?: boolean;
  canLaunchJob?: boolean;
  canPersistDraft?: boolean;
  targetKind?: 'durable' | 'new';
  storedAttempt?: 'prepared' | 'launching' | 'ambiguous' | 'succeeded' | 'malformed';
  storedAttemptOutputType?: OutputType;
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
    const secondaryClient = { ...client };
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
    const rawDraft = (status: 'active' | 'consumed' | 'discarded' = 'active', outputType: 'estimate' | 'job' | null = options.outputType ?? null, available = true) => ({
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
    const envelope = (status: 'active' | 'consumed' | 'discarded' = 'active', outputType: 'estimate' | 'job' | null = options.outputType ?? null, available = true) => ({
      draft: rawDraft(status, outputType, available),
      items: [rawItem(ids.draftId)],
      launches: [],
    });
    const loadedOutputRecord = (type: string, id: string) => type === 'estimate' ? {
      id, contractor_id: ids.contractorId, homeowner_user_id: ids.homeownerId, local_contact_id: null,
      service_request_id: ids.requestId, inspection_id: null, home_id: ids.homeId, local_home_id: null,
      title: 'Water heater Estimate', scope: 'Replace water heater', notes: '', terms: '', status: 'draft',
      subtotal_cents: 50000, total_cents: 50000, labor_mode: 'line_specific', labor_rate_cents: null,
      job_labor_hours: null, material_total_cents: 0, labor_total_cents: 50000, fee_total_cents: 0,
      other_total_cents: 0, tax_rate_percent: 0, tax_cents: 0,
      created_at: '2026-07-19T10:05:00.000Z', updated_at: '2026-07-19T10:05:00.000Z',
      line_items: [], payment_schedule_items: [],
    } : {
      id, contractor_id: ids.contractorId, homeowner_user_id: ids.homeownerId, home_id: ids.homeId,
      local_contact_id: null, local_home_id: null, service_request_id: ids.requestId, template_id: null,
      name: 'Water heater Job', summary: 'Replace water heater', status: 'draft', job_type: 'service_visit',
      job_status: 'draft', job_origin: 'direct', estimate_id: null, rooms_with_findings: [],
      report_storage_path: null, report_file_name: null, created_at: '2026-07-19T10:05:00.000Z',
      updated_at: '2026-07-19T10:05:00.000Z',
    };
    const state = {
      client,
      mode: 'editor' as 'list' | 'editor',
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
      client: state.client,
      mode: state.mode,
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
        state.mode = 'editor';
        state.target = target;
        state.openTargets.push(`${String(target.kind)}:${String(target.draftId ?? '')}`);
        render();
      },
      onBack: () => { state.backCount += 1; state.mode = 'list'; state.target = null; render(); },
      onLoadOutput: async (type: string, id: string) => {
        state.outputLoadCount += 1;
        return { type, id, record: loadedOutputRecord(type, id) };
      },
      onAdoptOutput: () => { state.adoptCount += 1; },
    }));

    const storedPhase = options.storedAttempt;
    if (storedPhase) {
      const key = attemptStorageKey(ids.contractorId, ids.draftId);
      if (storedPhase === 'malformed') {
        localStorage.setItem(key, '{"schemaVersion":1,"private_notes":"must not survive"}');
      } else {
        const outputType = options.storedAttemptOutputType ?? options.outputType ?? 'estimate';
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
      envelopeFor: (draftId: string, status: 'active' | 'consumed' | 'discarded' = 'active', outputType: OutputType | null = options.outputType ?? null) => ({
        draft: { ...rawDraft(status, outputType), id: draftId },
        items: [{ ...rawItem(draftId), draft_id: draftId }],
        launches: [],
      }),
      consumedEnvelope: (outputType: OutputType = options.outputType ?? 'estimate', available = true) => envelope('consumed', outputType, available),
      discardedEnvelope: (outputType: OutputType = options.outputType ?? 'estimate') => envelope('discarded', outputType, false),
      listRow: (status: 'active' | 'consumed' | 'discarded', outputType: OutputType = options.outputType ?? 'estimate', available = true) => rawDraft(status, outputType, available),
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
      setTarget(target: Record<string, unknown>) { state.mode = 'editor'; state.target = target; render(); },
      setMode(mode: 'list' | 'editor') { state.mode = mode; render(); },
      setContractorId(contractorId: string) { state.capabilities = { ...state.capabilities, contractorId }; render(); },
      setClient() { state.client = secondaryClient; render(); },
      unmount() { root.unmount(); },
      snapshot() {
        return {
          mode: state.mode,
          target: state.target,
          launchEnabled: state.launchEnabled,
          capabilities: { ...state.capabilities },
          backCount: state.backCount,
          adoptCount: state.adoptCount,
          outputLoadCount: state.outputLoadCount,
          openTargets: [...state.openTargets],
          calls: calls.map(call => ({ kind: call.kind, name: call.name, args: call.args, settled: call.settled })),
        };
      },
      dispatchAttempt(phase: 'prepared' | 'launching' | 'ambiguous' | 'succeeded', outputType: OutputType = options.outputType ?? 'estimate', idempotencyKey = ids.attemptKey) {
        const key = attemptStorageKey(ids.contractorId, ids.draftId);
        const value = JSON.stringify({
          schemaVersion: 1,
          contractorId: ids.contractorId,
          draftId: ids.draftId,
          outputType,
          idempotencyKey,
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
      dispatchMalformedAttempt() {
        const key = attemptStorageKey(ids.contractorId, ids.draftId);
        const value = '{"schemaVersion":1,"private_notes":"unsafe"}';
        localStorage.setItem(key, value);
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
      },
      dispatchAbsentAttempt() {
        const key = attemptStorageKey(ids.contractorId, ids.draftId);
        localStorage.removeItem(key);
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: null, storageArea: localStorage }));
      },
      dispatchUnrelatedAttempt() {
        const key = attemptStorageKey(ids.contractorId, ids.homeId);
        localStorage.setItem(key, '{bad');
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: '{bad', storageArea: localStorage }));
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
      ignoreStorageRemoval() {
        const original = Storage.prototype.removeItem;
        Object.defineProperty(Storage.prototype, 'removeItem', { configurable: true, value() { return undefined; } });
        return () => Object.defineProperty(Storage.prototype, 'removeItem', { configurable: true, value: original });
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

async function rejectExternalAttemptThenCompleteLocalLaunch(page: Page, options: {
  localOutput: OutputType;
  externalPhase: 'prepared' | 'launching' | 'ambiguous';
  externalOutput?: OutputType;
  externalKey?: string;
}) {
  await installLaunchHarness(page, { outputType: options.localOutput });
  await completeInitialDraft(page, options.localOutput);
  await confirmLaunch(page, options.localOutput);
  await harnessValue(page, `h.dispatchAttempt('${options.externalPhase}', '${options.externalOutput ?? options.localOutput}', '${options.externalKey ?? ATTEMPT_KEY}')`);
  await expect(page.getByTestId('durable-draft-create-output')).toHaveText('Working…');
  await expect(page.getByTestId('durable-draft-create-output')).toBeDisabled();
  await expect(page.getByText(/Continue Create|Retry Create/)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
  await harnessValue(page, `h.completeRpc('servsync_launch_work_draft', h.launchResult('${options.localOutput}', 'succeeded', false))`);
  await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
  await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('${options.localOutput}', true))`);
  await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
  expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
  await expect.poll(() => harnessValue<number>(page, 'h.snapshot().outputLoadCount')).toBe(1);
}

async function enterLifecycleUnavailable(page: Page, outputType: OutputType = 'estimate') {
  await installLaunchHarness(page, { outputType });
  await completeInitialDraft(page, outputType);
  await confirmLaunch(page, outputType);
  await harnessValue(page, "h.failRpc('servsync_launch_work_draft', { message: 'DRAFT_NOT_ACTIVE' })");
  await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
  await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.activeEnvelope('${outputType}'))`);
  await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toBeVisible();
}

test.describe('Slice 2C-C1 launch machine', () => {
  const estimateResult = {
    draft_id: DRAFT_ID,
    status: 'succeeded' as const,
    output_type: 'estimate' as const,
    estimate_id: ESTIMATE_ID,
    job_id: null,
    output_id_snapshot: ESTIMATE_ID,
    output_available: true,
    launch_id: LAUNCH_ID,
    idempotent: false,
  };

  const externalAttempt = (phase: 'preparing' | 'launching' | 'ambiguous', overrides: Partial<{
    outputType: OutputType;
    draftId: string;
    idempotencyKey: string;
  }> = {}) => ({
    type: 'EXTERNAL_ATTEMPT' as const,
    outputType: overrides.outputType ?? 'estimate',
    phase,
    draftId: overrides.draftId ?? DRAFT_ID,
    idempotencyKey: overrides.idempotencyKey ?? ATTEMPT_KEY,
    message: `external ${phase}`,
  });

  const lifecycleUnavailableState = () => {
    const token = Symbol('lifecycle-owner');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'estimate', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'BEGIN_LIFECYCLE_RECONCILIATION', operationToken: token, draftId: DRAFT_ID, message: 'checking' });
    return durableDraftLaunchReducer(state, { type: 'LIFECYCLE_UNAVAILABLE', operationToken: token, message: 'locked' });
  };

  const reconciliationFailedState = () => {
    const token = Symbol('reconcile-owner');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'estimate', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'RESPONSE_RECEIVED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'CONSUMED_PROOF', operationToken: token, result: estimateResult });
    return durableDraftLaunchReducer(state, { type: 'RECONCILE_FAILED', operationToken: token, message: 'reload failed' });
  };

  test('confirmation cancel returns to idle', () => {
    const opened = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    expect(opened.phase).toBe('confirming');
    expect(durableDraftLaunchReducer(opened, { type: 'CANCEL_CONFIRMATION' })).toEqual(INITIAL_DURABLE_DRAFT_LAUNCH_STATE);
  });

  test('save, prepare, launch, validate, and consume require token ownership', () => {
    const token = Symbol('owner');
    const stale = Symbol('stale');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'job' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'job', operationToken: token, draftId: null, needsSave: true });
    expect(state.phase).toBe('saving');
    expect(durableDraftLaunchReducer(state, { type: 'SAVED', operationToken: stale, draftId: DRAFT_ID })).toBe(state);
    state = durableDraftLaunchReducer(state, { type: 'SAVED', operationToken: token, draftId: DRAFT_ID });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    expect(state.phase).toBe('launching');
    expect(durableDraftLaunchAllowsEditing(state)).toBe(false);
    state = durableDraftLaunchReducer(state, { type: 'RESPONSE_RECEIVED', operationToken: token });
    const jobResult = { ...estimateResult, output_type: 'job' as const, estimate_id: null, job_id: JOB_ID, output_id_snapshot: JOB_ID };
    state = durableDraftLaunchReducer(state, { type: 'CONSUMED_PROOF', operationToken: token, result: jobResult });
    state = durableDraftLaunchReducer(state, { type: 'CONSUMED', operationToken: token, draftId: DRAFT_ID, outputType: 'job' });
    expect(state.phase).toBe('consumed');
    expect(durableDraftLaunchReducer(state, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' })).toBe(state);
  });

  test('ambiguous state retains the key and is retryable but noneditable', () => {
    const token = Symbol('owner');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'estimate', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'FAIL', operationToken: token, phase: 'ambiguous', message: 'uncertain', idempotencyKey: ATTEMPT_KEY });
    expect(state.idempotencyKey).toBe(ATTEMPT_KEY);
    expect(durableDraftLaunchCanRetry(state)).toBe(true);
    expect(durableDraftLaunchAllowsEditing(state)).toBe(false);
  });

  test('illegal critical transitions and missing invariants are rejected', () => {
    const token = Symbol('owner');
    expect(durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'RPC_STARTED', operationToken: token })).toBe(INITIAL_DURABLE_DRAFT_LAUNCH_STATE);
    const confirming = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    expect(durableDraftLaunchReducer(confirming, { type: 'RPC_STARTED', operationToken: token })).toBe(confirming);
    expect(durableDraftLaunchReducer(confirming, { type: 'START', outputType: 'job', operationToken: token, draftId: DRAFT_ID, needsSave: false })).toBe(confirming);
    const preparing = durableDraftLaunchReducer(confirming, { type: 'START', outputType: 'estimate', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    expect(durableDraftLaunchReducer(preparing, { type: 'RPC_STARTED', operationToken: token })).toBe(preparing);
    expect(durableDraftLaunchReducer(preparing, { type: 'CONSUMED_PROOF', operationToken: token, result: estimateResult })).toBe(preparing);
    const storageFailure = durableDraftLaunchReducer(preparing, { type: 'FAIL', operationToken: token, phase: 'storage_unavailable', message: 'blocked', recoveryLocked: true });
    expect(durableDraftLaunchReducer(storageFailure, { type: 'RPC_STARTED', operationToken: token })).toBe(storageFailure);
    expect(durableDraftLaunchAllowsEditing(storageFailure)).toBe(false);
  });

  test('consumed proof requires matching Draft and output identities', () => {
    const token = Symbol('owner');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'estimate', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'RESPONSE_RECEIVED', operationToken: token });
    expect(durableDraftLaunchReducer(state, { type: 'CONSUMED_PROOF', operationToken: token, result: { ...estimateResult, draft_id: HOME_ID } })).toBe(state);
    expect(durableDraftLaunchReducer(state, { type: 'CONSUMED_PROOF', operationToken: token, result: { ...estimateResult, output_type: 'job', estimate_id: null, job_id: JOB_ID, output_id_snapshot: JOB_ID } })).toBe(state);
    const proof = durableDraftLaunchReducer(state, { type: 'CONSUMED_PROOF', operationToken: token, result: estimateResult });
    expect(proof.phase).toBe('reconciling_consumed');
    expect(durableDraftLaunchReducer(proof, { type: 'CONSUMED', operationToken: token, draftId: HOME_ID, outputType: 'estimate' })).toBe(proof);
  });

  test('lifecycle contradiction and reconciliation failure remain locked', () => {
    const token = Symbol('owner');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'job' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'job', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'BEGIN_LIFECYCLE_RECONCILIATION', operationToken: token, draftId: DRAFT_ID, message: 'checking' });
    state = durableDraftLaunchReducer(state, { type: 'LIFECYCLE_UNAVAILABLE', operationToken: token, message: 'contradiction' });
    expect(state.phase).toBe('lifecycle_unavailable');
    expect(durableDraftLaunchAllowsEditing(state)).toBe(false);
    expect(durableDraftLaunchReducer(state, { type: 'OPEN_CONFIRMATION', outputType: 'job' })).toBe(state);
  });

  test('discarded is terminal and wrong-token cleanup is ignored', () => {
    const token = Symbol('owner');
    const stale = Symbol('stale');
    let state = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'job' });
    state = durableDraftLaunchReducer(state, { type: 'START', outputType: 'job', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    state = durableDraftLaunchReducer(state, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    state = durableDraftLaunchReducer(state, { type: 'RPC_STARTED', operationToken: token });
    state = durableDraftLaunchReducer(state, { type: 'BEGIN_LIFECYCLE_RECONCILIATION', operationToken: token, draftId: DRAFT_ID, message: 'checking' });
    expect(durableDraftLaunchReducer(state, { type: 'LIFECYCLE_RESOLVED', operationToken: stale, status: 'discarded' })).toBe(state);
    state = durableDraftLaunchReducer(state, { type: 'LIFECYCLE_RESOLVED', operationToken: token, status: 'discarded' });
    expect(state.phase).toBe('discarded');
    expect(durableDraftLaunchAllowsEditing(state)).toBe(false);
    expect(durableDraftLaunchReducer(state, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' })).toBe(state);
  });

  test('lifecycle and canonical reconciliation locks reject weaker external attempts', () => {
    for (const state of [lifecycleUnavailableState(), reconciliationFailedState()]) {
      for (const phase of ['preparing', 'launching', 'ambiguous'] as const) {
        expect(durableDraftLaunchReducer(state, externalAttempt(phase))).toBe(state);
      }
      expect(durableDraftLaunchAllowsEditing(state)).toBe(false);
    }
  });

  test('authoritative external success supersedes lifecycle and reconciliation locks only into canonical reconciliation', () => {
    for (const state of [lifecycleUnavailableState(), reconciliationFailedState()]) {
      const token = Symbol('external-success');
      const next = durableDraftLaunchReducer(state, {
        type: 'EXTERNAL_SUCCEEDED',
        outputType: 'estimate',
        operationToken: token,
        draftId: DRAFT_ID,
        idempotencyKey: ATTEMPT_KEY,
        result: estimateResult,
      });
      expect(next.phase).toBe('reconciling_consumed');
      expect(next.operationToken).toBe(token);
      expect(next.consumedProof).toEqual(estimateResult);
      expect(durableDraftLaunchAllowsEditing(next)).toBe(false);
    }
  });

  test('terminal consumed and discarded states ignore every external attempt and success', () => {
    const token = Symbol('terminal-owner');
    let consumed = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    consumed = durableDraftLaunchReducer(consumed, { type: 'START', outputType: 'estimate', operationToken: token, draftId: DRAFT_ID, needsSave: false });
    consumed = durableDraftLaunchReducer(consumed, { type: 'ATTEMPT_READY', operationToken: token, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    consumed = durableDraftLaunchReducer(consumed, { type: 'RPC_STARTED', operationToken: token });
    consumed = durableDraftLaunchReducer(consumed, { type: 'RESPONSE_RECEIVED', operationToken: token });
    consumed = durableDraftLaunchReducer(consumed, { type: 'CONSUMED_PROOF', operationToken: token, result: estimateResult });
    consumed = durableDraftLaunchReducer(consumed, { type: 'CONSUMED', operationToken: token, draftId: DRAFT_ID, outputType: 'estimate' });
    const discardedToken = Symbol('discarded-owner');
    let discarded = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    discarded = durableDraftLaunchReducer(discarded, { type: 'START', outputType: 'estimate', operationToken: discardedToken, draftId: DRAFT_ID, needsSave: false });
    discarded = durableDraftLaunchReducer(discarded, { type: 'ATTEMPT_READY', operationToken: discardedToken, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    discarded = durableDraftLaunchReducer(discarded, { type: 'RPC_STARTED', operationToken: discardedToken });
    discarded = durableDraftLaunchReducer(discarded, { type: 'BEGIN_LIFECYCLE_RECONCILIATION', operationToken: discardedToken, draftId: DRAFT_ID, message: 'checking' });
    discarded = durableDraftLaunchReducer(discarded, { type: 'LIFECYCLE_RESOLVED', operationToken: discardedToken, status: 'discarded' });
    for (const state of [consumed, discarded]) {
      for (const phase of ['preparing', 'launching', 'ambiguous'] as const) {
        expect(durableDraftLaunchReducer(state, externalAttempt(phase))).toBe(state);
      }
      expect(durableDraftLaunchReducer(state, {
        type: 'EXTERNAL_SUCCEEDED', outputType: 'estimate', operationToken: Symbol('external'), draftId: DRAFT_ID,
        idempotencyKey: ATTEMPT_KEY, result: estimateResult,
      })).toBe(state);
    }
  });

  test('external recovery follows same-key and same-family precedence without downgrades', () => {
    let prepared = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, externalAttempt('preparing'));
    expect(prepared.phase).toBe('preparing');
    const differentKey = durableDraftLaunchReducer(prepared, externalAttempt('launching', { idempotencyKey: OTHER_ATTEMPT_KEY }));
    const differentFamily = durableDraftLaunchReducer(prepared, externalAttempt('launching', { outputType: 'job' }));
    expect(differentKey).toBe(prepared);
    expect(differentFamily).toBe(prepared);
    const ambiguous = durableDraftLaunchReducer(prepared, externalAttempt('launching'));
    expect(ambiguous.phase).toBe('ambiguous');
    expect(durableDraftLaunchReducer(ambiguous, externalAttempt('preparing'))).toBe(ambiguous);
    expect(durableDraftLaunchReducer(ambiguous, externalAttempt('launching')).phase).toBe('ambiguous');
    prepared = durableDraftLaunchReducer(prepared, externalAttempt('ambiguous'));
    expect(prepared.phase).toBe('ambiguous');
  });

  test('locally owned work rejects weaker external recovery while external success supersedes its token', () => {
    const localToken = Symbol('local-owner');
    let launching = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    launching = durableDraftLaunchReducer(launching, { type: 'START', outputType: 'estimate', operationToken: localToken, draftId: DRAFT_ID, needsSave: false });
    launching = durableDraftLaunchReducer(launching, { type: 'ATTEMPT_READY', operationToken: localToken, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    launching = durableDraftLaunchReducer(launching, { type: 'RPC_STARTED', operationToken: localToken });
    expect(durableDraftLaunchReducer(launching, externalAttempt('preparing'))).toBe(launching);
    expect(durableDraftLaunchReducer(launching, externalAttempt('ambiguous'))).toBe(launching);
    const externalToken = Symbol('external-owner');
    const reconciliating = durableDraftLaunchReducer(launching, {
      type: 'EXTERNAL_SUCCEEDED', outputType: 'estimate', operationToken: externalToken, draftId: DRAFT_ID,
      idempotencyKey: ATTEMPT_KEY, result: estimateResult,
    });
    expect(reconciliating.phase).toBe('reconciling_consumed');
    expect(reconciliating.operationToken).toBe(externalToken);
    expect(durableDraftLaunchReducer(reconciliating, { type: 'FAIL', operationToken: localToken, phase: 'ambiguous', message: 'late' })).toBe(reconciliating);
  });

  test('external transition decisions preserve local ownership when reducer precedence rejects recovery', () => {
    const localToken = Symbol('local-owner');
    let launching = durableDraftLaunchReducer(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, { type: 'OPEN_CONFIRMATION', outputType: 'estimate' });
    launching = durableDraftLaunchReducer(launching, { type: 'START', outputType: 'estimate', operationToken: localToken, draftId: DRAFT_ID, needsSave: false });
    launching = durableDraftLaunchReducer(launching, { type: 'ATTEMPT_READY', operationToken: localToken, draftId: DRAFT_ID, idempotencyKey: ATTEMPT_KEY });
    launching = durableDraftLaunchReducer(launching, { type: 'RPC_STARTED', operationToken: localToken });
    for (const event of [
      externalAttempt('preparing'),
      externalAttempt('launching'),
      externalAttempt('ambiguous'),
      externalAttempt('preparing', { idempotencyKey: OTHER_ATTEMPT_KEY }),
      externalAttempt('ambiguous', { outputType: 'job' }),
    ]) {
      const decision = decideDurableDraftLaunchTransition(launching, event);
      expect(decision.accepted).toBe(false);
      expect(decision.nextState).toBe(launching);
      expect(decision.ownershipEffect).toBe('preserve');
    }
  });

  test('external transition decisions invalidate ownership only for accepted recovery or success', () => {
    const prepared = decideDurableDraftLaunchTransition(INITIAL_DURABLE_DRAFT_LAUNCH_STATE, externalAttempt('preparing'));
    expect(prepared.accepted).toBe(true);
    expect(prepared.nextState.phase).toBe('preparing');
    expect(prepared.ownershipEffect).toBe('invalidate');

    const succeeded = decideDurableDraftLaunchTransition(lifecycleUnavailableState(), {
      type: 'EXTERNAL_SUCCEEDED', outputType: 'estimate', operationToken: Symbol('external-success'), draftId: DRAFT_ID,
      idempotencyKey: ATTEMPT_KEY, result: estimateResult,
    });
    expect(succeeded.accepted).toBe(true);
    expect(succeeded.nextState.phase).toBe('reconciling_consumed');
    expect(succeeded.ownershipEffect).toBe('invalidate');

    const consumed = durableDraftLaunchReducer(succeeded.nextState, {
      type: 'CONSUMED', operationToken: succeeded.nextState.operationToken as symbol, draftId: DRAFT_ID, outputType: 'estimate',
    });
    const ignored = decideDurableDraftLaunchTransition(consumed, {
      type: 'EXTERNAL_SUCCEEDED', outputType: 'estimate', operationToken: Symbol('ignored'), draftId: DRAFT_ID,
      idempotencyKey: ATTEMPT_KEY, result: estimateResult,
    });
    expect(ignored.accepted).toBe(false);
    expect(ignored.nextState).toBe(consumed);
    expect(ignored.ownershipEffect).toBe('preserve');
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

test.describe('Slice 2C-C1 verified attempt removal', () => {
  test('reports success only after absence is read back', () => {
    const key = durableDraftLaunchAttemptKey(CONTRACTOR_ID, DRAFT_ID);
    const values = new Map([[key, 'attempt']]);
    const storage = {
      get length() { return values.size; },
      getItem: (candidate: string) => values.get(candidate) ?? null,
      setItem: (candidate: string, value: string) => { values.set(candidate, value); },
      removeItem: (candidate: string) => { values.delete(candidate); },
      key: (index: number) => [...values.keys()][index] ?? null,
    };
    expect(clearDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID)).toEqual({ status: 'success', removed: true });
  });

  test('fails verification when remove is a no-op or readback throws', () => {
    const key = durableDraftLaunchAttemptKey(CONTRACTOR_ID, DRAFT_ID);
    const retained = {
      length: 1,
      getItem: () => 'attempt',
      setItem: () => undefined,
      removeItem: () => undefined,
      key: () => key,
    };
    expect(clearDurableDraftLaunchAttempt(retained, CONTRACTOR_ID, DRAFT_ID)).toEqual({ status: 'unavailable', operation: 'verify' });
    const throwing = { ...retained, getItem: () => { throw new Error('blocked'); } };
    expect(clearDurableDraftLaunchAttempt(throwing, CONTRACTOR_ID, DRAFT_ID)).toEqual({ status: 'unavailable', operation: 'verify' });
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

    test(`fresh ${label} success adopts consumed and starts one automatic output navigation`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      await completeLaunchAndConsume(page, outputType, 'succeeded', false);
      await expect(page.getByText(new RegExp(`${label} created\\. Opening ${label}`))).toBeVisible();
      await expect(page.getByRole('button', { name: `Open ${label}` })).toBeVisible();
      const snapshot = await harnessValue<{ adoptCount: number; outputLoadCount: number }>(page, 'h.snapshot()');
      expect(snapshot.adoptCount).toBe(1);
      expect(snapshot.outputLoadCount).toBe(1);
    });

    test(`explicit Open ${label} remains available after consumed adoption`, async ({ page }) => {
      await installLaunchHarness(page, { outputType });
      await completeInitialDraft(page, outputType);
      await confirmLaunch(page, outputType);
      await completeLaunchAndConsume(page, outputType, 'succeeded', false);
      await page.getByRole('button', { name: `Open ${label}` }).click();
      await expect.poll(() => harnessValue<number>(page, 'h.snapshot().adoptCount')).toBe(2);
      await expect.poll(() => harnessValue<number>(page, 'h.snapshot().outputLoadCount')).toBe(2);
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

  for (const outcome of ['consumed', 'discarded', 'active', 'reload_failure'] as const) {
    test(`DRAFT_NOT_ACTIVE lifecycle reconciliation is fail-closed for ${outcome}`, async ({ page }) => {
      await installLaunchHarness(page, { outputType: 'estimate' });
      await completeInitialDraft(page, 'estimate');
      await confirmLaunch(page, 'estimate');
      await harnessValue(page, "h.failRpc('servsync_launch_work_draft', { message: 'DRAFT_NOT_ACTIVE' })");
      await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
      if (outcome === 'reload_failure') {
        await harnessValue(page, "h.failRpc('servsync_get_work_draft', { message: 'network request failed' })");
        await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toBeVisible();
      } else {
        await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.${outcome === 'consumed' ? 'consumedEnvelope' : outcome === 'discarded' ? 'discardedEnvelope' : 'activeEnvelope'}('estimate'))`);
        await expect(page.getByTestId(outcome === 'consumed' || outcome === 'discarded' ? 'durable-draft-read-only-summary' : 'durable-draft-lifecycle-unavailable')).toBeVisible();
      }
      await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0);
      await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    });
  }

  test('DRAFT_NOT_FOUND keeps stale active state unavailable', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job' });
    await completeInitialDraft(page, 'job');
    await confirmLaunch(page, 'job');
    await harnessValue(page, "h.failRpc('servsync_launch_work_draft', { message: 'DRAFT_NOT_FOUND' })");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.failRpc('servsync_get_work_draft', { message: 'DRAFT_NOT_FOUND' })");
    await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toContainText('could not be found');
    await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0);
  });

  test('malformed current-key storage event freezes editing and unrelated key is ignored', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await harnessValue(page, 'h.dispatchUnrelatedAttempt()');
    await expect(page.getByTestId('durable-draft-create-output')).toBeEnabled();
    await harnessValue(page, 'h.dispatchMalformedAttempt()');
    await expect(page.getByTestId('durable-draft-launch-storage-error')).toContainText('safely read');
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    await expect(page.getByTestId('durable-draft-create-output')).toBeDisabled();
  });

  test('unreadable current-key event fails closed', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job' });
    await completeInitialDraft(page, 'job');
    await harnessValue(page, "h.breakStorage('getItem')");
    await harnessValue(page, "h.dispatchAttempt('launching', 'job')");
    await expect(page.getByTestId('durable-draft-launch-storage-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
  });

  test('missing current key after an ambiguous attempt remains locked', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', storedAttempt: 'ambiguous' });
    await completeInitialDraft(page, 'estimate');
    await expect(page.getByTestId('durable-draft-create-output')).toHaveText('Retry Create Estimate');
    await harnessValue(page, 'h.dispatchAbsentAttempt()');
    await expect(page.getByTestId('durable-draft-launch-storage-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
  });

  test('prepared attempt discard remains locked when removal readback still finds the key', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', storedAttempt: 'prepared' });
    await completeInitialDraft(page, 'estimate');
    await harnessValue(page, 'h.ignoreStorageRemoval()');
    await page.getByRole('button', { name: 'Discard unused attempt' }).click();
    await expect(page.getByTestId('durable-draft-launch-storage-error')).toContainText('could not verify');
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    expect(await harnessValue<string>(page, 'h.storageRecord().idempotencyKey')).toBe(ATTEMPT_KEY);
  });

  test('malformed canonical lifecycle response remains noneditable', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job' });
    await completeInitialDraft(page, 'job');
    await confirmLaunch(page, 'job');
    await harnessValue(page, "h.failRpc('servsync_launch_work_draft', { message: 'DRAFT_NOT_ACTIVE' })");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', { draft: { id: 'bad' }, items: [], launches: [] })");
    await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0);
  });

  for (const scenario of [
    { name: 'same-key prepared', localOutput: 'estimate', externalPhase: 'prepared' },
    { name: 'same-key launching', localOutput: 'estimate', externalPhase: 'launching' },
    { name: 'same-key ambiguous', localOutput: 'estimate', externalPhase: 'ambiguous' },
    { name: 'different-key prepared', localOutput: 'estimate', externalPhase: 'prepared', externalKey: OTHER_ATTEMPT_KEY },
    { name: 'different-key ambiguous', localOutput: 'estimate', externalPhase: 'ambiguous', externalKey: OTHER_ATTEMPT_KEY },
    { name: 'Estimate-to-Job prepared', localOutput: 'estimate', externalOutput: 'job', externalPhase: 'prepared' },
    { name: 'Job-to-Estimate ambiguous', localOutput: 'job', externalOutput: 'estimate', externalPhase: 'ambiguous' },
  ] as const) {
    test(`local RPC ownership survives rejected ${scenario.name} external recovery`, async ({ page }) => {
      await rejectExternalAttemptThenCompleteLocalLaunch(page, scenario);
    });
  }

  test('local owning failure remains observable after a rejected external attempt', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await confirmLaunch(page, 'estimate');
    await harnessValue(page, "h.dispatchAttempt('prepared', 'estimate')");
    await expect(page.getByTestId('durable-draft-create-output')).toHaveText('Working…');
    await harnessValue(page, "h.rejectRpc('servsync_launch_work_draft', 'local request failed')");
    await expect(page.getByTestId('durable-draft-create-output')).toHaveText('Retry Create Estimate');
    await expect(page.getByTestId('durable-draft-launch-ambiguous')).toBeVisible();
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
  });

  test('external succeeded ignores a late local success and reconciles exactly once', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await confirmLaunch(page, 'estimate');
    await harnessValue(page, "h.dispatchAttempt('succeeded', 'estimate')");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.completeRpc('servsync_launch_work_draft', h.launchResult('estimate', 'succeeded', true))");
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    expect(await harnessValue<number>(page, "h.callCount('servsync_get_work_draft')")).toBe(2);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
    expect(await harnessValue<number>(page, 'h.snapshot().outputLoadCount')).toBe(0);
  });

  test('lifecycle status reload remains authoritative after rejected external launching recovery', async ({ page }) => {
    await enterLifecycleUnavailable(page, 'estimate');
    await harnessValue(page, "h.dispatchAttempt('launching', 'estimate')");
    await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toBeVisible();
    await expect(page.getByText(/Continue Create|Retry Create/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload Draft status' }).click();
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 2);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
  });

  test('external succeeded proof supersedes a locally pending launch', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await confirmLaunch(page, 'estimate');
    await harnessValue(page, "h.dispatchAttempt('succeeded', 'estimate')");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await harnessValue(page, "h.rejectRpc('servsync_launch_work_draft', 'late local failure')");
    await expect(page.getByTestId('durable-draft-launch-ambiguous')).toHaveCount(0);
  });

  test('valid server success remains consumed proof when success storage persistence fails', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job' });
    await completeInitialDraft(page, 'job');
    await confirmLaunch(page, 'job');
    await harnessValue(page, "h.breakStorage('setItem')");
    await harnessValue(page, "h.completeRpc('servsync_launch_work_draft', h.launchResult('job', 'succeeded', false))");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('job', true))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
  });

  test('active-to-consumed list synchronization rejects a stale list response', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await confirmLaunch(page, 'estimate');
    await completeLaunchAndConsume(page, 'estimate', 'succeeded', false);
    await page.getByRole('button', { name: 'Back to Work' }).click();
    await expect(page.getByTestId('durable-draft-row-consumed')).toHaveCount(1);
    await expect(page.getByTestId('durable-draft-row-active')).toHaveCount(0);
    await harnessValue(page, "h.completeList([h.listRow('active', 'estimate')])");
    await expect(page.getByTestId('durable-draft-row-consumed')).toHaveCount(1);
    await expect(page.getByTestId('durable-draft-row-active')).toHaveCount(0);
  });

  for (const phase of ['prepared', 'ambiguous'] as const) {
    test(`lifecycle lock rejects an external ${phase} attempt`, async ({ page }) => {
      await enterLifecycleUnavailable(page, 'estimate');
      await harnessValue(page, `h.dispatchAttempt('${phase}', 'estimate')`);
      await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toBeVisible();
      await expect(page.getByTestId('shared-draft-composer')).toHaveCount(0);
      await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
      await expect(page.getByText(/Continue Create|Retry Create/)).toHaveCount(0);
      expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
    });
  }

  test('external success supersedes a lifecycle lock only through canonical consumed reconciliation', async ({ page }) => {
    await enterLifecycleUnavailable(page, 'estimate');
    await harnessValue(page, "h.dispatchAttempt('succeeded', 'estimate')");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 2);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    expect(await harnessValue<number>(page, 'h.snapshot().adoptCount')).toBe(0);
    expect(await harnessValue<number>(page, 'h.snapshot().outputLoadCount')).toBe(0);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(1);
  });

  test('canonical reconciliation failure rejects an external prepared downgrade', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job' });
    await completeInitialDraft(page, 'job');
    await confirmLaunch(page, 'job');
    await harnessValue(page, "h.completeRpc('servsync_launch_work_draft', h.launchResult('job', 'succeeded', false))");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.failRpc('servsync_get_work_draft')");
    await expect(page.getByTestId('durable-draft-consumed-reconciliation')).toBeVisible();
    await harnessValue(page, "h.dispatchAttempt('prepared', 'job')");
    await expect(page.getByTestId('durable-draft-consumed-reconciliation')).toBeVisible();
    await expect(page.getByTestId('shared-draft-composer')).toHaveCount(0);
    await expect(page.getByText(/Continue Create|Retry Create/)).toHaveCount(0);
  });

  test('stale save cannot reactivate a Draft after external consumed proof', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await page.getByLabel('Draft title').fill('Pending old save');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') === 1);
    await harnessValue(page, "h.dispatchAttempt('succeeded', 'estimate')");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await harnessValue(page, "h.completeRpc('servsync_save_work_draft', h.activeEnvelope('estimate'))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0);
    await expect(page.getByTestId('durable-draft-create-output')).toHaveCount(0);
  });

  test('stale resume cannot reactivate a Draft after consumed reconciliation', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await harnessValue(page, `h.setTarget({ kind: 'durable', draftId: '${DRAFT_ID}' })`);
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') === 2);
    await harnessValue(page, "h.dispatchAttempt('succeeded', 'estimate')");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') === 3);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true), 1)");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.activeEnvelope('estimate'))");
    await expect(page.getByTestId('durable-draft-read-only-summary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0);
  });

  test('verified prepared discard permits a later output change without reusing the old key', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', storedAttempt: 'prepared' });
    await completeInitialDraft(page, 'estimate');
    await page.getByRole('button', { name: 'Discard unused attempt' }).click();
    expect(await harnessValue<null>(page, 'h.storageRecord()')).toBeNull();
    await page.getByRole('radio', { name: 'Job' }).check({ force: true });
    expect(await page.getByRole('radio', { name: 'Job' }).isChecked()).toBe(true);
    expect(await harnessValue<null>(page, 'h.storageRecord()')).toBeNull();
    await confirmLaunch(page, 'job');
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') > 0);
    await harnessValue(page, "h.completeRpc('servsync_save_work_draft', h.activeEnvelope('job'))");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_launch_work_draft') > 0);
    const nextKey = await harnessValue<string>(page, 'h.storageRecord().idempotencyKey');
    expect(nextKey).not.toBe(ATTEMPT_KEY);
  });

  test('prepared discard verification failure blocks output-family change and a new key', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', storedAttempt: 'prepared' });
    await completeInitialDraft(page, 'estimate');
    await harnessValue(page, 'h.ignoreStorageRemoval()');
    await page.getByRole('button', { name: 'Discard unused attempt' }).click();
    await expect(page.getByLabel('Job')).toBeDisabled();
    expect(await harnessValue<string>(page, 'h.storageRecord().idempotencyKey')).toBe(ATTEMPT_KEY);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
  });

  test('stored and canonical output mismatch enters lifecycle reconciliation without a new attempt', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job', storedAttempt: 'prepared', storedAttemptOutputType: 'estimate' });
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 0);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.activeEnvelope('job'))");
    await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toBeVisible();
    await expect(page.getByText(/Continue Create|Retry Create/)).toHaveCount(0);
    expect(await harnessValue<string>(page, 'h.storageRecord().idempotencyKey')).toBe(ATTEMPT_KEY);
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
  });

  test('Back during save-before-launch abandons adoption and never launches', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate', targetKind: 'new' });
    await confirmLaunch(page, 'estimate');
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_save_work_draft') > 0);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Back to Work' }).click();
    await harnessValue(page, "h.completeRpc('servsync_save_work_draft', h.activeEnvelope('estimate'))");
    expect(await harnessValue<number>(page, "h.callCount('servsync_launch_work_draft')")).toBe(0);
    expect(await harnessValue<null>(page, 'h.storageRecord()')).toBeNull();
    expect(await harnessValue<string[]>(page, 'h.snapshot().openTargets')).toEqual([]);
  });

  test('unmount during launch ignores late completion and preserves recoverable storage', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'job' });
    await completeInitialDraft(page, 'job');
    await confirmLaunch(page, 'job');
    await harnessValue(page, 'h.unmount()');
    await harnessValue(page, "h.completeRpc('servsync_launch_work_draft', h.launchResult('job', 'succeeded', false))");
    await page.waitForTimeout(50);
    expect(await harnessValue<string>(page, 'h.storageRecord().phase')).toBe('launching');
    expect(await harnessValue<number>(page, 'h.snapshot().adoptCount')).toBe(0);
    expect(await harnessValue<number>(page, 'h.snapshot().outputLoadCount')).toBe(0);
  });

  test('client switch during launch rejects the old client completion', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await confirmLaunch(page, 'estimate');
    await harnessValue(page, 'h.setClient()');
    await harnessValue(page, "h.rejectRpc('servsync_launch_work_draft', 'old client failed')");
    await expect(page.getByTestId('durable-draft-launch-ambiguous')).toHaveCount(0);
    expect(await harnessValue<number>(page, 'h.snapshot().adoptCount')).toBe(0);
    expect(await harnessValue<string>(page, 'h.storageRecord().phase')).toBe('ambiguous');
  });

  test('lifecycle reload after target switch cannot enter the new Draft', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await confirmLaunch(page, 'estimate');
    await harnessValue(page, "h.failRpc('servsync_launch_work_draft', { message: 'DRAFT_NOT_ACTIVE' })");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, `h.setTarget({ kind: 'durable', draftId: '${HOME_ID}' })`);
    await harnessValue(page, "h.completeRpc('servsync_get_work_draft', h.consumedEnvelope('estimate', true))");
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 2);
    await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.envelopeFor('${HOME_ID}', 'active', 'estimate'))`);
    await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
    await expect(page.getByTestId('durable-draft-read-only-summary')).toHaveCount(0);
    await expect(page.getByTestId('durable-draft-lifecycle-unavailable')).toHaveCount(0);
  });

  test('old storage listener is removed after target switch', async ({ page }) => {
    await installLaunchHarness(page, { outputType: 'estimate' });
    await completeInitialDraft(page, 'estimate');
    await harnessValue(page, `h.setTarget({ kind: 'durable', draftId: '${HOME_ID}' })`);
    await page.waitForFunction(() => (window as typeof window & { __launchHarness: { callCount: (name: string) => number } }).__launchHarness.callCount('servsync_get_work_draft') > 1);
    await harnessValue(page, `h.completeRpc('servsync_get_work_draft', h.envelopeFor('${HOME_ID}', 'active', 'estimate'))`);
    const before = await harnessValue<number>(page, "h.callCount('servsync_get_work_draft')");
    await harnessValue(page, "h.dispatchAttempt('succeeded', 'estimate')");
    await page.waitForTimeout(50);
    expect(await harnessValue<number>(page, "h.callCount('servsync_get_work_draft')")).toBe(before);
    await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
    await expect(page.getByTestId('durable-draft-read-only-summary')).toHaveCount(0);
  });
});
