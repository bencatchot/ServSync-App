import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DurableDraftError,
  getContractorWorkDraft,
  importLegacyContractorWorkDraft,
  launchContractorWorkDraft,
  listContractorWorkDrafts,
  normalizeDurableDraftError,
  saveContractorWorkDraft,
  type DurableDraftSupabaseClient,
} from '../../src/features/drafts/durableDraftLaunchApi';
import {
  capabilitiesFromCompatibilityChecks,
  loadDurableDraftCapabilities,
} from '../../src/features/drafts/durableDraftCapabilities';
import {
  canonicalDraftToSaveMetadata,
  canonicalItemsToSaveItems,
  durableDraftEnvelopeFromRpc,
  durableDraftListRowsToPresentation,
  legacyImportResultToResumeRequest,
  reconcileCanonicalSaveResponse,
  reconcileRemovedDurableItemIds,
  type DurableDraftCanonicalItem,
} from '../../src/features/drafts/durableDraftMappings';
import {
  clearAllDurableDraftLaunchAttempts,
  clearDefinitiveFailedDurableDraftLaunchAttempt,
  clearDurableDraftLaunchAttempt,
  createDurableDraftLaunchAttempt,
  durableDraftLaunchAttemptKey,
  readDurableDraftLaunchAttempt,
  recordDurableDraftLaunchSuccess,
  retainAmbiguousDurableDraftLaunchAttempt,
  updateDurableDraftLaunchAttemptPhase,
} from '../../src/features/drafts/durableDraftLaunchAttempt';
import type {
  ContractorWorkDraft,
  ContractorWorkDraftEnvelope,
  ContractorWorkDraftItem,
  ContractorWorkDraftListRow,
  ContractorWorkDraftSavePayload,
} from '../../src/features/drafts/durableDraftLaunchTypes';

function sourceFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const DRAFT_ID = '00000000-0000-4000-8000-000000000001';
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000002';
const ITEM_ID = '00000000-0000-4000-8000-000000000003';
const HOMEOWNER_ID = '00000000-0000-4000-8000-000000000004';
const HOME_ID = '00000000-0000-4000-8000-000000000005';
const REQUEST_ID = '00000000-0000-4000-8000-000000000006';
const NEW_ITEM_ID = '00000000-0000-4000-8000-000000000007';
const IDEMPOTENCY_ID = '00000000-0000-4000-8000-000000000008';
const JOB_ID = '00000000-0000-4000-8000-000000000009';
const ESTIMATE_ID = '00000000-0000-4000-8000-00000000000a';
const LAUNCH_ID = '00000000-0000-4000-8000-00000000000b';
const OTHER_DRAFT_ID = '00000000-0000-4000-8000-00000000000e';
const OTHER_ITEM_ID = '00000000-0000-4000-8000-00000000000f';

function draft(overrides: Partial<ContractorWorkDraft> = {}): ContractorWorkDraft {
  return {
    id: DRAFT_ID,
    contractor_id: CONTRACTOR_ID,
    created_by_user_id: null,
    homeowner_user_id: HOMEOWNER_ID,
    home_id: HOME_ID,
    local_contact_id: null,
    local_home_id: null,
    service_request_id: REQUEST_ID,
    subject_type: 'connected_homeowner',
    subject_display_name_snapshot: 'Private subject',
    property_display_snapshot: 'Private property',
    title: 'Water heater',
    scope_description: 'Replace unit',
    private_notes: 'Contractor only',
    intended_output: null,
    work_format: 'standard',
    labor_mode: 'line_specific',
    labor_rate_cents: 12500,
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
  };
}

function item(overrides: Partial<ContractorWorkDraftItem> = {}): ContractorWorkDraftItem {
  return {
    id: ITEM_ID,
    draft_id: DRAFT_ID,
    contractor_id: CONTRACTOR_ID,
    title: 'Install heater',
    description: 'Install heater',
    customer_description: 'Install replacement',
    internal_notes: 'Private item note',
    line_type: 'labor',
    quantity: 1,
    unit: 'each',
    unit_price_cents: 50000,
    labor_hours: 3,
    room_id: null,
    room_label: 'Utility room',
    location_label: null,
    sort_order: 0,
    created_at: '2026-07-19T10:00:00.000Z',
    updated_at: '2026-07-19T10:00:00.000Z',
    ...overrides,
  };
}

function envelope(overrides: Partial<ContractorWorkDraftEnvelope> = {}): ContractorWorkDraftEnvelope {
  return { draft: draft(), items: [item()], launches: [], ...overrides };
}

function rpcClient(data: unknown, error: unknown = null) {
  const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const client = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data, error, status: error ? 400 : 200 };
    },
  } as unknown as DurableDraftSupabaseClient;
  return { client, calls };
}

function canonicalItem(overrides: Partial<DurableDraftCanonicalItem> = {}): DurableDraftCanonicalItem {
  return {
    rowId: 'local-row-1',
    durableItemId: null,
    sourceDraftId: null,
    title: 'Install heater',
    description: 'Install heater',
    customerDescription: 'Install replacement',
    internalNotes: '',
    lineType: 'labor',
    quantity: 1,
    unit: 'each',
    unitPriceCents: 50000,
    laborHours: 3,
    roomId: null,
    roomLabel: null,
    locationLabel: null,
    sortOrder: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class ThrowingStorage implements Storage {
  private readonly memory = new MemoryStorage();
  readonly failures = new Set<'get' | 'set' | 'remove' | 'length' | 'key'>();
  failVerificationRead = false;
  private getCount = 0;
  get length() { if (this.failures.has('length')) throw new Error('native length failure'); return this.memory.length; }
  clear() { this.memory.clear(); }
  getItem(key: string) {
    this.getCount += 1;
    if (this.failures.has('get') || (this.failVerificationRead && this.getCount > 1)) throw new Error('native get failure');
    return this.memory.getItem(key);
  }
  key(index: number) { if (this.failures.has('key')) throw new Error('native key failure'); return this.memory.key(index); }
  removeItem(key: string) { if (this.failures.has('remove')) throw new Error('native remove failure'); this.memory.removeItem(key); }
  setItem(key: string, value: string) { if (this.failures.has('set')) throw new Error('native set failure'); this.memory.setItem(key, value); }
}

test.describe('Slice 2C-A durable Draft adapters', () => {
  test('save sends the exact full-snapshot RPC contract without mutating input', async () => {
    const { client, calls } = rpcClient(envelope());
    const payload: ContractorWorkDraftSavePayload = {
      draft_id: null,
      metadata: canonicalDraftToSaveMetadata(durableDraftEnvelopeFromRpc(envelope()).draft),
      items: canonicalItemsToSaveItems([canonicalItem()], null),
      removed_item_ids: [],
    };
    const before = structuredClone(payload);
    const result = await saveContractorWorkDraft(client, payload);

    expect(result.draft.id).toBe(DRAFT_ID);
    expect(payload).toEqual(before);
    expect(calls).toEqual([{
      fn: 'servsync_save_work_draft',
      args: {
        p_draft_id: null,
        p_metadata: payload.metadata,
        p_items: payload.items,
        p_removed_item_ids: [],
      },
    }]);
    expect(payload.items[0].id).toBeNull();
  });

  test('save rejects duplicate durable item IDs before invoking the RPC', async () => {
    const { client, calls } = rpcClient(envelope());
    const persisted = canonicalItemsToSaveItems([
      canonicalItem({ durableItemId: ITEM_ID, sourceDraftId: DRAFT_ID }),
    ], DRAFT_ID)[0];
    await expect(saveContractorWorkDraft(client, {
      draft_id: DRAFT_ID,
      metadata: canonicalDraftToSaveMetadata(durableDraftEnvelopeFromRpc(envelope()).draft),
      items: [persisted, { ...persisted }],
      removed_item_ids: [],
    })).rejects.toMatchObject({ applicationCode: 'DRAFT_INVALID', phase: 'save' });
    expect(calls).toEqual([]);
  });

  test('get, import, and launch preserve exact public RPC names and parameters', async () => {
    const getMock = rpcClient(envelope());
    await getContractorWorkDraft(getMock.client, DRAFT_ID);
    expect(getMock.calls[0]).toEqual({ fn: 'servsync_get_work_draft', args: { p_draft_id: DRAFT_ID } });

    const importMock = rpcClient(DRAFT_ID);
    const imported = await importLegacyContractorWorkDraft(importMock.client, {
      inspection_id: 'legacy-1',
      intended_output: null,
    });
    expect(importMock.calls[0]).toEqual({
      fn: 'servsync_import_legacy_draft_job',
      args: { p_inspection_id: 'legacy-1', p_intended_output: null },
    });
    expect(imported).toEqual({ draft_id: DRAFT_ID });
    expect(legacyImportResultToResumeRequest(imported)).toEqual({ draftId: DRAFT_ID });

    const launchResult = {
      draft_id: DRAFT_ID,
      status: 'succeeded',
      output_type: 'job',
      estimate_id: null,
      job_id: JOB_ID,
      output_id_snapshot: JOB_ID,
      output_available: true,
      launch_id: LAUNCH_ID,
      idempotent: false,
    };
    const launchMock = rpcClient(launchResult);
    expect(await launchContractorWorkDraft(launchMock.client, {
      draft_id: DRAFT_ID,
      intended_output: 'job',
      idempotency_key: 'attempt-1',
    })).toEqual(launchResult);
    expect(launchMock.calls[0]).toEqual({
      fn: 'servsync_launch_work_draft',
      args: {
        p_draft_id: DRAFT_ID,
        p_intended_output: 'job',
        p_idempotency_key: 'attempt-1',
      },
    });
  });

  test('list uses one authenticated read-only table query with explicit filters and ordering', async () => {
    const operations: string[] = [];
    const rows = [draft()];
    const query = {
      in(column: string, values: readonly string[]) { operations.push(`in:${column}:${values.join('|')}`); return this; },
      order(column: string, options: { ascending: boolean }) { operations.push(`order:${column}:${options.ascending}`); return this; },
      then(resolve: (value: unknown) => void) { resolve({ data: rows, error: null, status: 200 }); },
    };
    const client = {
      from(table: string) {
        operations.push(`from:${table}`);
        return { select(columns: string) { operations.push(`select:${columns}`); return query; } };
      },
    } as unknown as DurableDraftSupabaseClient;
    const result = await listContractorWorkDrafts(client, { statuses: ['active', 'consumed'] });

    expect(result).toEqual(rows);
    expect(operations[0]).toBe('from:contractor_work_drafts');
    expect(operations).toContain('in:status:active|consumed');
    expect(operations).toContain('order:updated_at:false');
    expect(operations).toContain('order:id:true');
    expect(operations.join(' ')).not.toMatch(/\b(?:insert|update|delete)\b/i);
  });

  test('application, database, transport, and unknown errors remain structured and UI-safe', () => {
    const application = normalizeDurableDraftError({
      message: 'DRAFT_PERMISSION_DENIED',
      code: 'P0001',
      details: 'policy detail',
      hint: 'server hint',
      status: 403,
    }, 'save');
    expect(application).toMatchObject({
      applicationCode: 'DRAFT_PERMISSION_DENIED',
      postgresCode: 'P0001',
      details: 'policy detail',
      hint: 'server hint',
      httpStatus: 403,
      kind: 'application',
      safeMessage: 'DRAFT_PERMISSION_DENIED',
    });

    const malformedUuid = normalizeDurableDraftError({ message: 'raw internal cast text', code: '22P02' }, 'get');
    expect(malformedUuid.safeMessage).toBe('DRAFT_INVALID');
    expect(malformedUuid.message).not.toContain('raw internal cast text');
    expect(normalizeDurableDraftError(new TypeError('Failed to fetch private URL'), 'launch')).toMatchObject({
      kind: 'transport',
      transportClassification: 'network',
      safeMessage: 'DRAFT_LAUNCH_FAILED',
    });
    expect(normalizeDurableDraftError(new Error('secret database internals'), 'list')).toMatchObject({
      kind: 'unknown',
      safeMessage: 'DRAFT_LIST_FAILED',
    });
  });

  test('RPC errors are thrown as DurableDraftError without exposing raw SQL as the message', async () => {
    const { client } = rpcClient(null, { message: 'constraint internals', code: '23514', details: 'private detail' });
    await expect(getContractorWorkDraft(client, DRAFT_ID)).rejects.toMatchObject({
      name: 'DurableDraftError',
      postgresCode: '23514',
      details: 'private detail',
      message: 'DRAFT_LOAD_FAILED',
    });
  });

  test('connected, local, null-intent, consumed, and deleted-output mappings preserve contract state', () => {
    const connected = durableDraftEnvelopeFromRpc(envelope()).draft;
    expect(connected.subject).toEqual({
      type: 'connected_homeowner',
      homeownerUserId: HOMEOWNER_ID,
      homeId: HOME_ID,
      serviceRequestId: REQUEST_ID,
    });
    expect(canonicalDraftToSaveMetadata(connected).intended_output).toBeNull();

    const local = durableDraftEnvelopeFromRpc(envelope({
      draft: draft({
        subject_type: 'local_contact',
        homeowner_user_id: null,
        home_id: null,
        service_request_id: null,
        local_contact_id: '00000000-0000-4000-8000-00000000000c',
        local_home_id: '00000000-0000-4000-8000-00000000000d',
      }),
    })).draft;
    expect(local.subject).toEqual({
      type: 'local_contact',
      localContactId: '00000000-0000-4000-8000-00000000000c',
      localHomeId: '00000000-0000-4000-8000-00000000000d',
    });

    const consumed = durableDraftEnvelopeFromRpc(envelope({
      draft: draft({
        status: 'consumed',
        intended_output: 'job',
        launched_output_type: 'job',
        launched_job_id: null,
        launched_job_id_snapshot: JOB_ID,
        launched_at: '2026-07-19T11:00:00.000Z',
      }),
    })).draft;
    expect(consumed).toMatchObject({
      status: 'consumed',
      launchedJobId: null,
      launchedJobIdSnapshot: JOB_ID,
    });
  });

  test('local row identity is never submitted as a durable item identity', () => {
    const fresh = canonicalItem({ rowId: '00000000-0000-4000-8000-999999999999' });
    expect(canonicalItemsToSaveItems([fresh], null)[0]).toMatchObject({ id: null, sort_order: 0 });

    const persisted = canonicalItem({
      rowId: 'stable-react-row',
      durableItemId: ITEM_ID,
      sourceDraftId: DRAFT_ID,
    });
    expect(canonicalItemsToSaveItems([persisted], DRAFT_ID)[0].id).toBe(ITEM_ID);
    expect(() => canonicalItemsToSaveItems([
      persisted,
      { ...persisted, rowId: 'duplicate-row' },
    ], DRAFT_ID)).toThrow('DUPLICATE_DURABLE_ITEM_ID');
    expect(() => canonicalItemsToSaveItems([
      { ...persisted, sourceDraftId: 'foreign-draft' },
    ], DRAFT_ID)).toThrow('DURABLE_ITEM_DRAFT_MISMATCH');
  });

  test('reordering preserves durable identities and emits canonical sequential sort order', () => {
    const first = canonicalItem({ rowId: 'first', durableItemId: ITEM_ID, sourceDraftId: DRAFT_ID });
    const second = canonicalItem({ rowId: 'second', durableItemId: NEW_ITEM_ID, sourceDraftId: DRAFT_ID });
    expect(canonicalItemsToSaveItems([second, first], DRAFT_ID).map(value => [value.id, value.sort_order])).toEqual([
      [NEW_ITEM_ID, 0],
      [ITEM_ID, 1],
    ]);
  });

  test('removed-item reconciliation includes persisted IDs only', () => {
    const persisted = canonicalItem({ rowId: 'persisted', durableItemId: ITEM_ID, sourceDraftId: DRAFT_ID });
    const unsaved = canonicalItem({ rowId: 'unsaved' });
    expect(reconcileRemovedDurableItemIds([persisted, unsaved], [])).toEqual([ITEM_ID]);
    expect(reconcileRemovedDurableItemIds([persisted, unsaved], [persisted])).toEqual([]);
  });

  test('canonical save reconciliation retains local row IDs and adopts server durable IDs', () => {
    const previousItems = [
      canonicalItem({ rowId: 'persisted-row', durableItemId: ITEM_ID, sourceDraftId: DRAFT_ID }),
      canonicalItem({ rowId: 'new-row' }),
    ];
    const response = envelope({ items: [
      item({ id: ITEM_ID, sort_order: 0 }),
      item({
        id: NEW_ITEM_ID,
        sort_order: 1,
        created_at: '2026-07-19T10:01:00.000Z',
        updated_at: '2026-07-19T10:01:00.000Z',
      }),
    ] });
    const reconciled = reconcileCanonicalSaveResponse({
      draft: durableDraftEnvelopeFromRpc(envelope()).draft,
      items: previousItems,
    }, response);
    expect(reconciled.items.map(value => [value.rowId, value.durableItemId])).toEqual([
      ['persisted-row', ITEM_ID],
      ['new-row', NEW_ITEM_ID],
    ]);
  });

  test('save reconciliation rejects malformed ownership, counts, IDs, removals, and ordering atomically', () => {
    const submitted = {
      draft: durableDraftEnvelopeFromRpc(envelope()).draft,
      items: [
        canonicalItem({ rowId: 'persisted-row', durableItemId: ITEM_ID, sourceDraftId: DRAFT_ID }),
        canonicalItem({ rowId: 'new-row' }),
      ],
    };
    const validItems = [item({ id: ITEM_ID, sort_order: 0 }), item({ id: NEW_ITEM_ID, sort_order: 1 })];
    const rejects = (items: ContractorWorkDraftItem[], removed: string[] = []) => {
      expect(() => reconcileCanonicalSaveResponse(submitted, envelope({ items }), removed)).toThrow('DRAFT_RESPONSE_INVALID');
    };

    rejects([item({ id: OTHER_ITEM_ID, sort_order: 0 }), validItems[1]]); // no positional fallback
    rejects([validItems[0], item({ id: ITEM_ID, sort_order: 1 })]);
    rejects([validItems[0], item({ id: NEW_ITEM_ID, sort_order: 0 })]);
    rejects([validItems[1]]);
    rejects([...validItems, item({ id: OTHER_ITEM_ID, sort_order: 2 })]);
    rejects(validItems, [NEW_ITEM_ID]);
    rejects([validItems[0], item({ id: NEW_ITEM_ID, draft_id: OTHER_DRAFT_ID, sort_order: 1 })]);
    rejects([validItems[0], item({ id: NEW_ITEM_ID, contractor_id: OTHER_DRAFT_ID, sort_order: 1 })]);
    rejects([validItems[0], item({ id: NEW_ITEM_ID, sort_order: 2 })]);
    rejects([validItems[0], item({ id: 'not-a-uuid', sort_order: 1 })]);
  });

  test('two identical new rows reconcile by canonical sort order even when the server array is reordered', () => {
    const first = canonicalItem({ rowId: 'new-a', title: 'Same content' });
    const second = canonicalItem({ rowId: 'new-b', title: 'Same content' });
    const submitted = {
      draft: durableDraftEnvelopeFromRpc(envelope()).draft,
      items: [second, first],
    };
    const reconciled = reconcileCanonicalSaveResponse(submitted, envelope({ items: [
      item({ id: OTHER_ITEM_ID, title: 'Same content', sort_order: 1 }),
      item({ id: NEW_ITEM_ID, title: 'Same content', sort_order: 0 }),
    ] }));
    expect(reconciled.items.map(value => [value.rowId, value.durableItemId, value.sortOrder])).toEqual([
      ['new-b', NEW_ITEM_ID, 0],
      ['new-a', OTHER_ITEM_ID, 1],
    ]);
    expect(new Set(reconciled.items.map(value => value.rowId)).size).toBe(2);
  });

  test('list presentation is deterministic and preserves status, legacy linkage, and deleted output', () => {
    const rows = [
      draft({ id: 'b', updated_at: '2026-07-19T10:00:00.000Z' }),
      draft({
        id: 'a',
        status: 'consumed',
        intended_output: 'estimate',
        legacy_inspection_id: 'legacy-1',
        launched_output_type: 'estimate',
        launched_estimate_id: null,
        launched_estimate_id_snapshot: 'estimate-deleted',
        launched_at: '2026-07-19T11:00:00.000Z',
        updated_at: '2026-07-19T11:00:00.000Z',
      }),
      draft({ id: 'c', status: 'discarded', updated_at: '2026-07-19T09:00:00.000Z' }),
    ] as ContractorWorkDraftListRow[];
    const presentation = durableDraftListRowsToPresentation(rows);
    expect(presentation.map(value => value.draftId)).toEqual(['a', 'b', 'c']);
    expect(presentation[0]).toMatchObject({
      status: 'consumed',
      legacyInspectionId: 'legacy-1',
      liveOutputId: null,
      outputIdSnapshot: 'estimate-deleted',
      outputAvailable: false,
    });
  });

  test('capability combinations preserve independent persistence, Job, Estimate, and read boundaries', () => {
    const base = {
      contractorId: CONTRACTOR_ID,
      currentUserId: 'user-1',
      contractorOwnerUserId: 'owner-1',
      canAccessContractor: true,
    };
    expect(capabilitiesFromCompatibilityChecks({ ...base, canManageBilling: true, canWriteJobs: false })).toMatchObject({
      canPersistDraft: true,
      canImportLegacyDraft: true,
      canLaunchJob: false,
      canLaunchEstimate: false,
    });
    expect(capabilitiesFromCompatibilityChecks({ ...base, canManageBilling: false, canWriteJobs: true })).toMatchObject({
      canPersistDraft: true,
      canImportLegacyDraft: false,
      canLaunchJob: true,
      canLaunchEstimate: false,
    });
    expect(capabilitiesFromCompatibilityChecks({ ...base, canManageBilling: false, canWriteJobs: false })).toMatchObject({
      canReadDrafts: true,
      canPersistDraft: false,
      canLaunchJob: false,
    });
    expect(capabilitiesFromCompatibilityChecks({
      ...base,
      contractorOwnerUserId: 'user-1',
      canManageBilling: true,
      canWriteJobs: true,
    }).canLaunchEstimate).toBe(true);
    expect(capabilitiesFromCompatibilityChecks({
      ...base,
      contractorId: null,
      canManageBilling: true,
      canWriteJobs: true,
    })).toMatchObject({ contractorId: null, canPersistDraft: false, canLaunchJob: false, canLaunchEstimate: false });
  });

  test('capability adapter has no role-name policy or private helper browser call', () => {
    const source = sourceFile('src/features/drafts/durableDraftCapabilities.ts');
    expect(source).not.toMatch(/field_tech|office|viewer|\badmin\b|\bowner\b/);
    expect(source).not.toContain('servsync_private_can_persist_work_draft');
    expect(source).toContain('current_user_can_manage_contractor_billing');
    expect(source).toContain('current_user_can_write_contractor_jobs');
    expect(source).toContain('servsync_current_contractor_profile');
  });

  test('capability loader resolves the current tenant and calls only public compatibility helpers', async () => {
    const calls: string[] = [];
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      },
      rpc: async (fn: string) => {
        calls.push(fn);
        const dataByFunction: Record<string, unknown> = {
          servsync_current_contractor_profile: [{ id: CONTRACTOR_ID, owner_user_id: 'owner-1' }],
          current_user_can_access_contractor: true,
          current_user_can_manage_contractor_billing: false,
          current_user_can_write_contractor_jobs: true,
        };
        return { data: dataByFunction[fn], error: null, status: 200 };
      },
    } as unknown as Parameters<typeof loadDurableDraftCapabilities>[0];

    await expect(loadDurableDraftCapabilities(client)).resolves.toMatchObject({
      contractorId: CONTRACTOR_ID,
      canReadDrafts: true,
      canPersistDraft: true,
      canImportLegacyDraft: false,
      canLaunchJob: true,
      canLaunchEstimate: false,
    });
    expect(calls).toEqual([
      'servsync_current_contractor_profile',
      'current_user_can_access_contractor',
      'current_user_can_manage_contractor_billing',
      'current_user_can_write_contractor_jobs',
    ]);
  });

  test('launch attempts are namespaced per contractor and Draft and survive reload', () => {
    const storage = new MemoryStorage();
    const created = createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'job',
    }, {
      now: () => new Date('2026-07-19T12:00:00.000Z'),
      randomUUID: () => IDEMPOTENCY_ID,
    });
    expect(durableDraftLaunchAttemptKey(CONTRACTOR_ID, DRAFT_ID)).toBe(
      `servsync.workDraftLaunch:${CONTRACTOR_ID}:${DRAFT_ID}`,
    );
    expect(created).toMatchObject({ status: 'success', attempt: { idempotencyKey: IDEMPOTENCY_ID } });
    expect(readDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID)).toEqual({
      status: 'found',
      attempt: created.status === 'success' ? created.attempt : null,
    });
    expect(readDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, OTHER_DRAFT_ID)).toEqual({ status: 'absent' });
    const reused = createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'job',
    }, { randomUUID: () => 'must-not-be-used' });
    expect(reused).toMatchObject({ status: 'success', attempt: { idempotencyKey: IDEMPOTENCY_ID } });
    expect(() => createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'estimate',
    })).toThrow('DRAFT_LAUNCH_ATTEMPT_OUTPUT_MISMATCH');
  });

  test('ambiguous attempts retain keys and canonical success retains deleted-output identity', () => {
    const storage = new MemoryStorage();
    createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'job',
    }, { randomUUID: () => IDEMPOTENCY_ID });
    updateDurableDraftLaunchAttemptPhase(storage, CONTRACTOR_ID, DRAFT_ID, 'launching');
    const ambiguous = retainAmbiguousDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID);
    expect(ambiguous).toMatchObject({ status: 'success', attempt: { phase: 'ambiguous', idempotencyKey: IDEMPOTENCY_ID } });
    expect(clearDefinitiveFailedDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID)).toEqual({
      status: 'success', removed: false,
    });

    const success = recordDurableDraftLaunchSuccess(storage, CONTRACTOR_ID, DRAFT_ID, {
      draft_id: DRAFT_ID,
      status: 'already_consumed',
      output_type: 'job',
      estimate_id: null,
      job_id: null,
      output_id_snapshot: JOB_ID,
      output_available: false,
      launch_id: LAUNCH_ID,
      idempotent: true,
    });
    expect(success).toMatchObject({
      status: 'success',
      attempt: {
        phase: 'succeeded',
        jobId: null,
        outputIdSnapshot: JOB_ID,
        outputAvailable: false,
      },
    });
  });

  test('attempt storage ignores malformed data, clears safely, and stores no sensitive Draft content', () => {
    const storage = new MemoryStorage();
    storage.setItem(durableDraftLaunchAttemptKey(CONTRACTOR_ID, DRAFT_ID), '{bad json');
    expect(readDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID)).toEqual({ status: 'invalid' });
    storage.setItem(durableDraftLaunchAttemptKey(CONTRACTOR_ID, DRAFT_ID), JSON.stringify({
      schemaVersion: 1,
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'job',
      idempotencyKey: IDEMPOTENCY_ID,
      phase: 'prepared',
      createdAt: '2026-07-19T12:00:00.000Z',
      updatedAt: '2026-07-19T12:00:00.000Z',
      privateNotes: 'must not be retained',
    }));
    const reconstructed = readDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID);
    expect(reconstructed).toMatchObject({ status: 'found', attempt: { idempotencyKey: IDEMPOTENCY_ID } });
    expect(reconstructed).not.toHaveProperty('attempt.privateNotes');
    clearDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID);

    createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'estimate',
    }, { randomUUID: () => IDEMPOTENCY_ID });
    const raw = storage.getItem(durableDraftLaunchAttemptKey(CONTRACTOR_ID, DRAFT_ID)) ?? '';
    expect(raw).not.toMatch(/homeowner|address|propertyDescription|privateNotes|lineItems|pricing|serviceRequest/i);
    expect(clearDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID)).toEqual({ status: 'success', removed: true });
    expect(storage.length).toBe(0);

    createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID,
      draftId: OTHER_DRAFT_ID,
      outputType: 'job',
    }, { randomUUID: () => IDEMPOTENCY_ID });
    storage.setItem('unrelated', 'keep');
    expect(clearAllDurableDraftLaunchAttempts(storage)).toEqual({ status: 'success', removedCount: 1, failedCount: 0 });
    expect(storage.getItem('unrelated')).toBe('keep');
    expect(storage.length).toBe(1);

    const removableStorage = new MemoryStorage();
    createDurableDraftLaunchAttempt(removableStorage, {
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'job',
    }, { randomUUID: () => IDEMPOTENCY_ID });
    expect(clearDefinitiveFailedDurableDraftLaunchAttempt(removableStorage, CONTRACTOR_ID, DRAFT_ID)).toEqual({
      status: 'success', removed: true,
    });
    expect(removableStorage.length).toBe(0);
  });

  test('throwing storage is fail-closed for reads, writes, verification, removal, and enumeration', () => {
    const create = (storage: Storage) => createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'job',
    }, { randomUUID: () => IDEMPOTENCY_ID });

    const readFailure = new ThrowingStorage();
    readFailure.failures.add('get');
    expect(readDurableDraftLaunchAttempt(readFailure, CONTRACTOR_ID, DRAFT_ID)).toEqual({
      status: 'unavailable', operation: 'read',
    });
    expect(create(readFailure)).toEqual({ status: 'unavailable', operation: 'read' });

    const writeFailure = new ThrowingStorage();
    writeFailure.failures.add('set');
    expect(create(writeFailure)).toEqual({ status: 'unavailable', operation: 'write' });

    const verifyFailure = new ThrowingStorage();
    verifyFailure.failVerificationRead = true;
    expect(create(verifyFailure)).toEqual({ status: 'unavailable', operation: 'verify' });

    const removeFailure = new ThrowingStorage();
    expect(create(removeFailure).status).toBe('success');
    removeFailure.failures.add('remove');
    expect(clearDurableDraftLaunchAttempt(removeFailure, CONTRACTOR_ID, DRAFT_ID)).toEqual({
      status: 'unavailable', operation: 'remove',
    });

    const lengthFailure = new ThrowingStorage();
    lengthFailure.failures.add('length');
    expect(clearAllDurableDraftLaunchAttempts(lengthFailure)).toEqual({
      status: 'unavailable', operation: 'enumerate', removedCount: 0, failedCount: 0,
    });
    const keyFailure = new ThrowingStorage();
    expect(create(keyFailure).status).toBe('success');
    keyFailure.failures.add('key');
    expect(clearAllDurableDraftLaunchAttempts(keyFailure)).toEqual({
      status: 'unavailable', operation: 'enumerate', removedCount: 0, failedCount: 0,
    });
    const partialFailure = new ThrowingStorage();
    expect(create(partialFailure).status).toBe('success');
    partialFailure.setItem('unrelated', 'keep');
    partialFailure.failures.add('remove');
    expect(clearAllDurableDraftLaunchAttempts(partialFailure)).toEqual({
      status: 'partial', removedCount: 0, failedCount: 1,
    });
    partialFailure.failures.delete('remove');
    expect(partialFailure.getItem('unrelated')).toBe('keep');
  });

  test('stored attempts reject malformed identity, time, phase, and output state', () => {
    const storage = new MemoryStorage();
    const key = durableDraftLaunchAttemptKey(CONTRACTOR_ID, DRAFT_ID);
    const base = {
      schemaVersion: 1,
      contractorId: CONTRACTOR_ID,
      draftId: DRAFT_ID,
      outputType: 'job',
      idempotencyKey: IDEMPOTENCY_ID,
      phase: 'prepared',
      createdAt: '2026-07-19T12:00:00.000Z',
      updatedAt: '2026-07-19T12:01:00.000Z',
    };
    const rejects = (overrides: Record<string, unknown>) => {
      storage.setItem(key, JSON.stringify({ ...base, ...overrides }));
      expect(readDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID)).toEqual({ status: 'invalid' });
    };
    rejects({ contractorId: 'bad' });
    rejects({ draftId: 'bad' });
    rejects({ idempotencyKey: 'bad' });
    rejects({ outputType: 'invoice' });
    rejects({ phase: 'unknown' });
    rejects({ createdAt: 'not-a-date' });
    rejects({ updatedAt: '2026-07-19T11:59:00.000Z' });
    rejects({ phase: 'succeeded' });
    rejects({ schemaVersion: 2 });
    rejects({ outputAvailable: true });
    rejects({
      phase: 'succeeded', launchId: LAUNCH_ID, estimateId: ESTIMATE_ID, jobId: JOB_ID,
      outputIdSnapshot: JOB_ID, outputAvailable: true,
    });
    rejects({
      outputType: 'estimate', phase: 'succeeded', launchId: LAUNCH_ID, estimateId: null, jobId: null,
      outputIdSnapshot: ESTIMATE_ID, outputAvailable: true,
    });

    clearDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID);
    expect(createDurableDraftLaunchAttempt(storage, {
      contractorId: CONTRACTOR_ID, draftId: DRAFT_ID, outputType: 'job',
    }, { randomUUID: () => IDEMPOTENCY_ID }).status).toBe('success');
    expect(() => recordDurableDraftLaunchSuccess(storage, CONTRACTOR_ID, DRAFT_ID, {
      draft_id: DRAFT_ID,
      status: 'succeeded',
      output_type: 'job',
      estimate_id: null,
      job_id: 'bad',
      output_id_snapshot: JOB_ID,
      output_available: true,
      launch_id: LAUNCH_ID,
      idempotent: false,
    })).toThrow('DRAFT_LAUNCH_ATTEMPT_RESULT_INVALID');
    expect(readDurableDraftLaunchAttempt(storage, CONTRACTOR_ID, DRAFT_ID)).toMatchObject({
      status: 'found', attempt: { phase: 'prepared' },
    });
  });

  test('launch response parser accepts canonical live/deleted results and rejects contradictions', async () => {
    const result = (overrides: Record<string, unknown> = {}) => ({
      draft_id: DRAFT_ID,
      status: 'succeeded',
      output_type: 'job',
      estimate_id: null,
      job_id: JOB_ID,
      output_id_snapshot: JOB_ID,
      output_available: true,
      launch_id: LAUNCH_ID,
      idempotent: false,
      ...overrides,
    });
    const launch = (value: unknown, intended_output: 'estimate' | 'job' = 'job') => launchContractorWorkDraft(rpcClient(value).client, {
      draft_id: DRAFT_ID, intended_output, idempotency_key: IDEMPOTENCY_ID,
    });
    await expect(launch(result())).resolves.toMatchObject({ output_type: 'job', job_id: JOB_ID });
    await expect(launch(result({ status: 'already_consumed', job_id: null, output_available: false, idempotent: true })))
      .resolves.toMatchObject({ status: 'already_consumed', output_available: false });
    await expect(launch(result({
      output_type: 'estimate', estimate_id: ESTIMATE_ID, job_id: null,
      output_id_snapshot: ESTIMATE_ID,
    }), 'estimate')).resolves.toMatchObject({ output_type: 'estimate', estimate_id: ESTIMATE_ID });
    await expect(launch(result({
      output_type: 'estimate', estimate_id: null, job_id: null,
      output_id_snapshot: ESTIMATE_ID, output_available: false, status: 'already_consumed', idempotent: true,
    }), 'estimate')).resolves.toMatchObject({ output_type: 'estimate', output_available: false });

    const invalid = [
      { output_type: 'job' },
      result({ draft_id: 'bad' }),
      result({ job_id: 'bad' }),
      result({ output_id_snapshot: 'bad' }),
      result({ output_id_snapshot: undefined }),
      result({ estimate_id: ESTIMATE_ID }),
      result({ output_available: false }),
      result({ status: 'pending' }),
      result({ launch_id: null }),
    ];
    for (const value of invalid) {
      await expect(launch(value)).rejects.toMatchObject({ applicationCode: 'DRAFT_RESPONSE_INVALID', phase: 'launch' });
    }
  });

  test('save, get, and import reject malformed canonical responses before mapping', async () => {
    const savePayload: ContractorWorkDraftSavePayload = {
      draft_id: DRAFT_ID,
      metadata: canonicalDraftToSaveMetadata(durableDraftEnvelopeFromRpc(envelope()).draft),
      items: canonicalItemsToSaveItems([canonicalItem({ durableItemId: ITEM_ID, sourceDraftId: DRAFT_ID })], DRAFT_ID),
      removed_item_ids: [],
    };
    const malformed = envelope({ items: [item({ id: 'bad' })] });
    await expect(saveContractorWorkDraft(rpcClient(malformed).client, savePayload)).rejects.toMatchObject({
      applicationCode: 'DRAFT_RESPONSE_INVALID', phase: 'save',
    });
    await expect(getContractorWorkDraft(rpcClient(envelope({ draft: draft({ status: 'unknown' as never }) })).client, DRAFT_ID))
      .rejects.toMatchObject({ applicationCode: 'DRAFT_RESPONSE_INVALID', phase: 'get' });
    await expect(importLegacyContractorWorkDraft(rpcClient('bad').client, { inspection_id: ITEM_ID }))
      .rejects.toMatchObject({ applicationCode: 'DRAFT_RESPONSE_INVALID', phase: 'import' });
  });

  test('hidden adapters do not wire App, Composer, routes, or feature gates', () => {
    const app = sourceFile('src/App.tsx');
    const composer = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');
    const api = sourceFile('src/features/drafts/durableDraftLaunchApi.ts');
    expect(app).not.toMatch(/durableDraft(?:LaunchApi|Mappings|Capabilities|LaunchAttempt)/);
    expect(composer).not.toMatch(/durableDraft(?:LaunchApi|Mappings|Capabilities|LaunchAttempt)/);
    expect(api).not.toContain('servsync_private_');
    expect(composer).not.toContain('Create Estimate');
    expect(composer).not.toContain('Create Job');
  });

  test('SQL hashes remain the merged Slice 2B artifacts', async () => {
    const { createHash } = await import('node:crypto');
    const hash = (path: string) => createHash('sha256').update(sourceFile(path)).digest('hex');
    expect(hash('servsync-durable-draft-launch-foundation.sql')).toBe(
      'ac9e600ece3075e2d171da5571aab2b26e7a1f6f234239b02194fa7be3d2354f',
    );
    expect(hash('servsync-durable-draft-launch-permission-parity-correction.sql')).toBe(
      'b4a98f33acd99083bea4497268393f6277ef330cdcb31bdc5d253adb94b14c7f',
    );
  });

  test('normalizer class remains an Error for existing caller ergonomics', () => {
    const normalized = normalizeDurableDraftError({ message: 'DRAFT_NOT_FOUND' }, 'get');
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized).toBeInstanceOf(DurableDraftError);
  });
});
