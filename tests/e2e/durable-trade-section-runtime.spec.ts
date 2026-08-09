import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createTradeSectionAdapter,
  type TradeSectionRpcClient,
} from '../../src/features/trade-sections/tradeSectionAdapter';
import {
  emptyTradeSectionForm,
  parseTradeSectionDefinition,
  parseTradeSectionInstance,
  persistedValuesFromForm,
} from '../../src/features/trade-sections/tradeSectionContracts';
import {
  isDurableTradeSectionsUiEnabled,
  shouldMountTradeSectionJobPanel,
  tradeSectionRoleAccess,
} from '../../src/features/trade-sections/tradeSectionAvailability';

const CONTRACTOR_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_JOB_ID = '20000000-0000-4000-8000-000000000002';
const INSTANCE_ID = '30000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '40000000-0000-4000-8000-000000000001';

const definition = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  section: { key: 'fixture', label: 'Fixture section', description: 'Private field capture.', customer_visibility: 'contractor_private' },
  readings: [
    { key: 'measurement', label: 'Measurement', description: null, value_type: 'number', unit: 'units', required: true, customer_visibility: 'contractor_private', options: [] },
    { key: 'observation', label: 'Observation', description: null, value_type: 'text', unit: null, required: false, customer_visibility: 'contractor_private', options: [] },
  ],
  tests: [
    { key: 'verified', label: 'Verified', description: null, value_type: 'boolean', required: true, customer_visibility: 'contractor_private', options: [] },
    { key: 'condition', label: 'Condition', description: null, value_type: 'choice', required: true, customer_visibility: 'contractor_private', options: ['good', 'review'] },
  ],
  findings: [],
  recommendations: [],
  ...overrides,
});

const workType = () => ({
  work_type_key: 'fixturetrade.fixture_service',
  trade_key: 'fixturetrade',
  workflow_family_key: 'fixture_work',
  capability_key: 'fixturetrade.fixture_service',
  version_number: 1,
  display_name: 'Fixture service',
  description: 'Disposable fixture.',
  definition_contract: definition(),
});

const instance = (overrides: Record<string, unknown> = {}) => ({
  id: INSTANCE_ID,
  contractor_id: CONTRACTOR_ID,
  work_draft_id: null,
  estimate_id: null,
  job_id: JOB_ID,
  homeowner_user_id: '50000000-0000-4000-8000-000000000001',
  local_contact_id: null,
  home_id: '60000000-0000-4000-8000-000000000001',
  local_home_id: null,
  property_asset_id: null,
  property_asset_revision_number: null,
  workflow_family_id: '70000000-0000-4000-8000-000000000001',
  workflow_family_key: 'fixture_work',
  trade_id: '71000000-0000-4000-8000-000000000001',
  trade_key: 'fixturetrade',
  work_type_id: '72000000-0000-4000-8000-000000000001',
  work_type_key: 'fixturetrade.fixture_service',
  capability_id: '73000000-0000-4000-8000-000000000001',
  capability_key: 'fixturetrade.fixture_service',
  definition_version_id: '74000000-0000-4000-8000-000000000001',
  definition_version_number: 1,
  definition_schema_version: 1,
  definition_snapshot: definition(),
  definition_snapshot_sha256: 'a'.repeat(64),
  current_values: { measurement: 2.5, verified: true, condition: 'good' },
  lifecycle_status: 'active',
  current_revision_number: 1,
  section_order: 0,
  origin_kind: 'job',
  idempotency_key: IDEMPOTENCY_KEY,
  created_by_user_id: '75000000-0000-4000-8000-000000000001',
  created_at: '2026-08-09T10:00:00.000Z',
  updated_at: '2026-08-09T10:00:00.000Z',
  lifecycle_changed_at: null,
  ...overrides,
});

function client(handler: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpcClient: TradeSectionRpcClient = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(handler(name, args)).then(data => ({ data, error: null }));
    },
  };
  return { rpcClient, calls };
}

test.describe('Durable Trade Section Runtime Slice 1A contracts', () => {
  test('keeps the UI gate exact and excludes ineligible roles and Jobs', () => {
    expect(isDurableTradeSectionsUiEnabled({})).toBe(false);
    expect(isDurableTradeSectionsUiEnabled({ VITE_DURABLE_TRADE_SECTIONS_UI_ENABLED: 'TRUE' })).toBe(false);
    expect(isDurableTradeSectionsUiEnabled({ VITE_DURABLE_TRADE_SECTIONS_UI_ENABLED: 'true' })).toBe(true);
    expect(tradeSectionRoleAccess('owner')).toEqual({ canRead: true, canMutate: true });
    expect(tradeSectionRoleAccess('admin').canMutate).toBe(true);
    expect(tradeSectionRoleAccess('office').canMutate).toBe(true);
    expect(tradeSectionRoleAccess('viewer')).toEqual({ canRead: true, canMutate: false });
    expect(tradeSectionRoleAccess('field_tech').canRead).toBe(false);
    expect(tradeSectionRoleAccess(null).canRead).toBe(false);
    expect(shouldMountTradeSectionJobPanel({ enabled: true, role: 'owner', jobStatus: 'in_progress', recordStatus: 'draft' })).toBe(true);
    for (const input of [
      { enabled: false, role: 'owner' as const, jobStatus: 'draft', recordStatus: 'draft' },
      { enabled: true, role: 'field_tech' as const, jobStatus: 'draft', recordStatus: 'draft' },
      { enabled: true, role: null, jobStatus: 'draft', recordStatus: 'draft' },
      { enabled: true, role: 'owner' as const, jobStatus: 'completed', recordStatus: 'draft' },
      { enabled: true, role: 'owner' as const, jobStatus: 'in_progress', recordStatus: 'finalized' },
    ]) expect(shouldMountTradeSectionJobPanel(input)).toBe(false);
  });

  test('parses schema-v1 scalar fields and rejects deferred or malformed contracts', () => {
    const parsed = parseTradeSectionDefinition(definition());
    expect(parsed.fields.map(field => field.valueType)).toEqual(['number', 'text', 'boolean', 'choice']);
    const form = emptyTradeSectionForm(parsed);
    expect(persistedValuesFromForm(parsed, { ...form, measurement: '3.25', verified: true, condition: 'review' }))
      .toEqual({ measurement: 3.25, verified: true, condition: 'review' });
    expect(parseTradeSectionDefinition(definition({ findings: [{ key: 'deferred' }] })).supported).toBe(false);
    expect(() => parseTradeSectionDefinition(definition({ tests: [{ key: 'bad' }] }))).toThrow('malformed');
    expect(() => persistedValuesFromForm(parsed, { ...form, measurement: '', verified: true, condition: 'review' })).toThrow('required');
    expect(() => persistedValuesFromForm(parsed, { ...form, measurement: '3', verified: true, condition: 'unknown' })).toThrow('invalid choice');
  });

  test('distinguishes unsupported numeric schema versions from malformed versions', () => {
    expect(parseTradeSectionDefinition(definition({ schema_version: 2 }))).toMatchObject({
      schemaVersion: 2,
      supported: false,
      unsupportedReason: 'This Trade Section uses an unsupported schema version.',
    });

    for (const schemaVersion of [null, '1', 0, -1, 1.5]) {
      expect(() => parseTradeSectionDefinition(definition({ schema_version: schemaVersion }))).toThrow('malformed');
    }
  });

  test('fails closed on cross-Job, asset-bound, malformed, and conflicting instance payloads', () => {
    expect(parseTradeSectionInstance(instance(), { contractorId: CONTRACTOR_ID, jobId: JOB_ID }).revisionNumber).toBe(1);
    expect(parseTradeSectionInstance(instance({
      homeowner_user_id: null,
      home_id: null,
      local_contact_id: '51000000-0000-4000-8000-000000000001',
      local_home_id: '61000000-0000-4000-8000-000000000001',
    }), { contractorId: CONTRACTOR_ID, jobId: JOB_ID }).jobId).toBe(JOB_ID);
    for (const payload of [
      instance({ job_id: OTHER_JOB_ID }),
      instance({ contractor_id: '10000000-0000-4000-8000-000000000002' }),
      instance({ property_asset_id: '76000000-0000-4000-8000-000000000001', property_asset_revision_number: 1 }),
      instance({ current_revision_number: 0 }),
      instance({ current_values: { measurement: 'forged', verified: true, condition: 'good' } }),
    ]) expect(() => parseTradeSectionInstance(payload, { contractorId: CONTRACTOR_ID, jobId: JOB_ID })).toThrow('malformed');
  });

  test('uses only the four approved RPCs and preserves exact server-derived arguments', async () => {
    const { rpcClient, calls } = client((name, args) => {
      if (name === 'servsync_list_available_trade_pack_work_types') return [workType()];
      if (name === 'servsync_list_trade_section_instances') return [instance()];
      if (name === 'servsync_create_trade_section_instance') return instance({ current_values: args.p_values, idempotency_key: args.p_idempotency_key });
      if (name === 'servsync_update_trade_section_values') return instance({ current_revision_number: 2, current_values: args.p_values });
      throw new Error('Unexpected RPC');
    });
    const adapter = createTradeSectionAdapter(rpcClient);
    await adapter.listAvailableWorkTypes(CONTRACTOR_ID);
    await adapter.listJobInstances(CONTRACTOR_ID, JOB_ID);
    await adapter.createJobInstance({ contractorId: CONTRACTOR_ID, jobId: JOB_ID, workTypeKey: 'fixturetrade.fixture_service', versionNumber: 1, values: { measurement: 2.5, verified: true, condition: 'good' }, sectionOrder: 0, idempotencyKey: IDEMPOTENCY_KEY });
    await adapter.updateValues({ contractorId: CONTRACTOR_ID, jobId: JOB_ID, instanceId: INSTANCE_ID, expectedRevision: 1, values: { measurement: 3, verified: true, condition: 'review' } });
    expect(calls.map(call => call.name)).toEqual([
      'servsync_list_available_trade_pack_work_types',
      'servsync_list_trade_section_instances',
      'servsync_create_trade_section_instance',
      'servsync_update_trade_section_values',
    ]);
    expect(calls[2].args).toMatchObject({ p_job_id: JOB_ID, p_work_draft_id: null, p_property_asset_id: null, p_idempotency_key: IDEMPOTENCY_KEY });
    expect(calls[3].args).toEqual({ p_instance_id: INSTANCE_ID, p_expected_revision: 1, p_values: { measurement: 3, verified: true, condition: 'review' } });
  });

  test('does not retry ambiguous mutations and classifies stale and authorization failures', async () => {
    let callCount = 0;
    const ambiguousClient: TradeSectionRpcClient = { rpc() { callCount += 1; return Promise.reject(new Error('network')); } };
    await expect(createTradeSectionAdapter(ambiguousClient).createJobInstance({ contractorId: CONTRACTOR_ID, jobId: JOB_ID, workTypeKey: 'fixturetrade.fixture_service', versionNumber: 1, values: {}, sectionOrder: 0, idempotencyKey: IDEMPOTENCY_KEY }))
      .rejects.toMatchObject({ kind: 'ambiguous' });
    expect(callCount).toBe(1);

    for (const [error, kind] of [
      [{ code: '42501', message: 'Trade Section is unavailable.' }, 'unauthorized'],
      [{ code: 'P0001', message: 'Trade Section has changed; refresh and try again.' }, 'stale'],
      [{ code: 'P0001', message: 'Trade Section capability is unavailable.' }, 'unauthorized'],
    ] as const) {
      const failingClient: TradeSectionRpcClient = { rpc() { return Promise.resolve({ data: null, error }); } };
      await expect(createTradeSectionAdapter(failingClient).updateValues({ contractorId: CONTRACTOR_ID, jobId: JOB_ID, instanceId: INSTANCE_ID, expectedRevision: 1, values: {} }))
        .rejects.toMatchObject({ kind });
    }
  });

  test('keeps lifecycle, revision history, assets, and legacy fallback outside the runtime client', () => {
    const source = ['tradeSectionAdapter.ts', 'TradeSectionJobPanel.tsx']
      .map(file => readFileSync(resolve(process.cwd(), 'src/features/trade-sections', file), 'utf8'))
      .join('\n');
    expect(source).not.toContain('servsync_set_trade_section_lifecycle');
    expect(source).not.toContain('servsync_list_trade_section_revisions');
    expect(source).not.toContain("from('home_assets')");
    expect(source).not.toContain('PGRST202');
    expect(source).toContain('p_property_asset_id: null');
  });
});
