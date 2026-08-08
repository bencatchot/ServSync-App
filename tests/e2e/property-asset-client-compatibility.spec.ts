import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPropertyAssetAdapter,
  isExactMissingPropertyAssetRpcError,
  type PropertyAssetDataClient,
  type PropertyAssetWriteInput,
} from '../../src/propertyAssetAdapter';

const HOME_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_HOME_ID = '10000000-0000-4000-8000-000000000002';
const ASSET_ID = '50000000-0000-4000-8000-000000000001';
const ACTOR_ID = '20000000-0000-4000-8000-000000000001';

type Result = { data: unknown; error: unknown };
type Call = { kind: 'rpc' | 'legacy'; name: string; args: unknown[] };

const missingRpc = (name: string) => ({
  code: 'PGRST202',
  details: `Searched for the function public.${name} with parameters p_home_id or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`,
  hint: 'Perhaps you meant to call another function.',
  message: `Could not find the function public.${name}(p_home_id) in the schema cache`,
});

const bridgeAsset = (overrides: Record<string, unknown> = {}) => ({
  id: ASSET_ID,
  home_id: HOME_ID,
  local_home_id: null,
  home_room_id: null,
  asset_kind: 'hvac',
  asset_category: 'HVAC',
  asset_type: 'Heat pump',
  name: 'Main heat pump',
  location_label: 'Utility room',
  manufacturer: 'Example',
  model: 'HP-1',
  serial_identifier: 'SERIAL-1',
  install_date: '2025-01-02',
  approximate_age_years: 1,
  warranty_expires_on: '2030-01-02',
  customer_safe_description: 'Customer-facing description',
  notes: 'Private homeowner note',
  lifecycle_status: 'active',
  archived_at: null,
  revision_number: 3,
  created_by: ACTOR_ID,
  created_at: '2025-01-02T00:00:00.000Z',
  updated_at: '2025-02-02T00:00:00.000Z',
  ...overrides,
});

const legacyAsset = (overrides: Record<string, unknown> = {}) => {
  const value: Record<string, unknown> = bridgeAsset(overrides);
  for (const field of [
    'asset_kind',
    'local_home_id',
    'location_label',
    'serial_identifier',
    'approximate_age_years',
    'customer_safe_description',
    'lifecycle_status',
    'revision_number',
  ]) {
    delete value[field];
  }
  return value;
};

const writeInput = (overrides: Partial<PropertyAssetWriteInput> = {}): PropertyAssetWriteInput => ({
  homeId: HOME_ID,
  homeRoomId: null,
  assetCategory: 'HVAC',
  assetType: 'Heat pump',
  name: 'Main heat pump',
  manufacturer: 'Example',
  model: 'HP-1',
  installDate: '2025-01-02',
  warrantyExpiresOn: '2030-01-02',
  notes: 'Private homeowner note',
  actorUserId: ACTOR_ID,
  ...overrides,
});

function mockClient(options: {
  rpc: (name: string, args: Record<string, unknown>) => Result | Promise<Result>;
  legacy?: (calls: Call[]) => Result | Promise<Result>;
}) {
  const calls: Call[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ kind: 'rpc' as const, name, args: [args] });
      return Promise.resolve(options.rpc(name, args));
    },
    from(relation: string) {
      calls.push({ kind: 'legacy' as const, name: 'from', args: [relation] });
      const query = {
        select(...args: unknown[]) { calls.push({ kind: 'legacy' as const, name: 'select', args }); return query; },
        in(...args: unknown[]) { calls.push({ kind: 'legacy' as const, name: 'in', args }); return query; },
        is(...args: unknown[]) { calls.push({ kind: 'legacy' as const, name: 'is', args }); return query; },
        order(...args: unknown[]) { calls.push({ kind: 'legacy' as const, name: 'order', args }); return query; },
        insert(...args: unknown[]) { calls.push({ kind: 'legacy' as const, name: 'insert', args }); return query; },
        update(...args: unknown[]) { calls.push({ kind: 'legacy' as const, name: 'update', args }); return query; },
        eq(...args: unknown[]) { calls.push({ kind: 'legacy' as const, name: 'eq', args }); return query; },
        then(resolveResult: (result: Result) => unknown, rejectResult: (error: unknown) => unknown) {
          return Promise.resolve(options.legacy?.(calls) ?? { data: [], error: null }).then(resolveResult, rejectResult);
        },
      };
      return query;
    },
  };
  return { client: client as unknown as PropertyAssetDataClient, calls };
}

const legacyCalls = (calls: Call[]) => calls.filter(call => call.kind === 'legacy');
const rpcCalls = (calls: Call[], name?: string) => calls.filter(call => call.kind === 'rpc' && (!name || call.name === name));

test.describe('Property Asset Bridge client compatibility', () => {
  test('recognizes only the exact missing-RPC catalog response', () => {
    const rpcName = 'servsync_list_property_assets';
    expect(isExactMissingPropertyAssetRpcError(missingRpc(rpcName), rpcName)).toBe(true);
    expect(isExactMissingPropertyAssetRpcError({ ...missingRpc(rpcName), code: '42501' }, rpcName)).toBe(false);
    expect(isExactMissingPropertyAssetRpcError({ ...missingRpc(rpcName), details: 'Permission denied.' }, rpcName)).toBe(false);
    expect(isExactMissingPropertyAssetRpcError({ ...missingRpc(rpcName), message: 'Could not find a relation.' }, rpcName)).toBe(false);
    expect(isExactMissingPropertyAssetRpcError(missingRpc('servsync_create_property_asset'), rpcName)).toBe(false);
  });

  test('uses the migrated list RPC and never touches the legacy table after a successful probe', async () => {
    const { client, calls } = mockClient({ rpc: () => ({ data: [bridgeAsset()], error: null }) });
    const assets = await createPropertyAssetAdapter(client).list([HOME_ID]);

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ id: ASSET_ID, revision_number: 3, lifecycle_status: 'active' });
    expect(rpcCalls(calls, 'servsync_list_property_assets')).toHaveLength(1);
    expect(legacyCalls(calls)).toHaveLength(0);
  });

  test('uses one legacy multi-property list only for the exact missing-RPC response', async () => {
    const { client, calls } = mockClient({
      rpc: name => ({ data: null, error: missingRpc(name) }),
      legacy: () => ({ data: [legacyAsset(), legacyAsset({ id: '50000000-0000-4000-8000-000000000002', home_id: OTHER_HOME_ID })], error: null }),
    });
    const assets = await createPropertyAssetAdapter(client).list([HOME_ID, OTHER_HOME_ID]);

    expect(assets.map(asset => asset.home_id)).toEqual([HOME_ID, OTHER_HOME_ID]);
    expect(rpcCalls(calls)).toHaveLength(1);
    expect(legacyCalls(calls).filter(call => call.name === 'from')).toHaveLength(1);
  });

  test('repeats the RPC-first decision without caching or combining schema modes', async () => {
    let attempt = 0;
    const { client, calls } = mockClient({
      rpc: name => {
        attempt += 1;
        return attempt === 1
          ? { data: null, error: missingRpc(name) }
          : { data: [bridgeAsset()], error: null };
      },
      legacy: () => ({ data: [legacyAsset()], error: null }),
    });
    const adapter = createPropertyAssetAdapter(client);

    expect(await adapter.list([HOME_ID])).toHaveLength(1);
    expect(await adapter.list([HOME_ID])).toHaveLength(1);
    expect(rpcCalls(calls, 'servsync_list_property_assets')).toHaveLength(2);
    expect(legacyCalls(calls).filter(call => call.name === 'from')).toHaveLength(1);
  });

  for (const [label, failure] of [
    ['permission denial', { code: '42501', message: 'permission denied' }],
    ['unauthenticated caller', { code: '42501', message: 'You must be signed in.' }],
    ['inactive member', { code: 'P0001', message: 'Property assets are unavailable for inactive members.' }],
    ['read-only mutation role', { code: 'P0001', message: 'Property asset management is unavailable.' }],
    ['cross-contractor identity', { code: 'P0001', message: 'Property asset is unavailable.' }],
    ['cross-property identity', { code: 'P0001', message: 'Property asset is unavailable.' }],
    ['RLS denial', { code: 'PGRST301', message: 'row-level security denied' }],
    ['validation failure', { code: '22023', message: 'invalid property' }],
    ['generic server failure', { code: 'PGRST500', message: 'server error' }],
  ] as const) {
    test(`does not fall back after ${label}`, async () => {
      const { client, calls } = mockClient({ rpc: () => ({ data: null, error: failure }) });
      await expect(createPropertyAssetAdapter(client).list([HOME_ID])).rejects.toEqual(failure);
      expect(legacyCalls(calls)).toHaveLength(0);
    });
  }

  test('does not fall back after a network failure, timeout, or malformed successful RPC payload', async () => {
    const network = mockClient({ rpc: async () => { throw new Error('network timeout'); } });
    await expect(createPropertyAssetAdapter(network.client).list([HOME_ID])).rejects.toThrow('network timeout');
    expect(legacyCalls(network.calls)).toHaveLength(0);

    const timeout = mockClient({ rpc: async () => { throw new DOMException('timed out', 'AbortError'); } });
    await expect(createPropertyAssetAdapter(timeout.client).list([HOME_ID])).rejects.toMatchObject({ name: 'AbortError' });
    expect(legacyCalls(timeout.calls)).toHaveLength(0);

    const malformed = mockClient({ rpc: () => ({ data: [bridgeAsset({ home_id: OTHER_HOME_ID })], error: null }) });
    await expect(createPropertyAssetAdapter(malformed.client).list([HOME_ID])).rejects.toThrow('does not match');
    expect(legacyCalls(malformed.calls)).toHaveLength(0);
  });

  test('creates through the bridge, derives the kind, and never asks for revision history', async () => {
    const { client, calls } = mockClient({ rpc: () => ({ data: bridgeAsset({ revision_number: 1 }), error: null }) });
    await createPropertyAssetAdapter(client).create(writeInput());

    const createCall = rpcCalls(calls, 'servsync_create_property_asset')[0];
    expect(createCall.args[0]).toMatchObject({
      p_home_id: HOME_ID,
      p_local_home_id: null,
      p_contractor_id: null,
      p_asset_kind: 'hvac',
    });
    expect(calls.some(call => call.name === 'servsync_list_property_asset_revisions')).toBe(false);
    expect(legacyCalls(calls)).toHaveLength(0);
  });

  test('deduplicates concurrent legacy create fallback without swallowing ambiguous failures', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolveGate => { release = resolveGate; });
    const fallback = mockClient({
      rpc: async name => { await gate; return { data: null, error: missingRpc(name) }; },
      legacy: () => ({ data: null, error: null }),
    });
    const adapter = createPropertyAssetAdapter(fallback.client);
    const first = adapter.create(writeInput());
    const second = adapter.create(writeInput());
    expect(first).toBe(second);
    release();
    await Promise.all([first, second]);
    expect(rpcCalls(fallback.calls, 'servsync_create_property_asset')).toHaveLength(1);
    expect(legacyCalls(fallback.calls).filter(call => call.name === 'insert')).toHaveLength(1);

    const ambiguous = mockClient({ rpc: async () => { throw new Error('connection closed'); } });
    await expect(createPropertyAssetAdapter(ambiguous.client).create(writeInput())).rejects.toThrow('connection closed');
    expect(legacyCalls(ambiguous.calls)).toHaveLength(0);
  });

  test('preserves hidden bridge fields and exact revision on update and lifecycle mutation', async () => {
    const { client, calls } = mockClient({
      rpc: name => ({
        data: bridgeAsset(name === 'servsync_set_property_asset_lifecycle'
          ? { revision_number: 5, lifecycle_status: 'retired', archived_at: '2025-03-02T00:00:00.000Z' }
          : { revision_number: 4 }),
        error: null,
      }),
    });
    const adapter = createPropertyAssetAdapter(client);
    await adapter.update({
      ...writeInput(),
      assetId: ASSET_ID,
      expectedRevision: 3,
      locationLabel: 'Utility room',
      serialIdentifier: 'SERIAL-1',
      approximateAgeYears: 1,
      customerSafeDescription: 'Customer-facing description',
    });
    await adapter.archive(bridgeAsset({ revision_number: 4 }));

    expect(rpcCalls(calls, 'servsync_update_property_asset')[0].args[0]).toMatchObject({
      p_asset_id: ASSET_ID,
      p_expected_revision: 3,
      p_location_label: 'Utility room',
      p_serial_identifier: 'SERIAL-1',
      p_customer_safe_description: 'Customer-facing description',
    });
    expect(rpcCalls(calls, 'servsync_set_property_asset_lifecycle')[0].args[0]).toEqual({
      p_asset_id: ASSET_ID,
      p_expected_revision: 4,
      p_lifecycle_status: 'retired',
      p_contractor_id: null,
    });
    expect(legacyCalls(calls)).toHaveLength(0);
  });

  test('probes safely before legacy update/archive when a loaded row has no bridge revision', async () => {
    const legacy = mockClient({
      rpc: name => ({ data: null, error: missingRpc(name) }),
      legacy: () => ({ data: null, error: null }),
    });
    const adapter = createPropertyAssetAdapter(legacy.client);
    await adapter.update({
      ...writeInput(),
      assetId: ASSET_ID,
      expectedRevision: null,
      locationLabel: null,
      serialIdentifier: null,
      approximateAgeYears: null,
      customerSafeDescription: null,
    });
    await adapter.archive(legacyAsset());

    expect(rpcCalls(legacy.calls, 'servsync_list_property_assets')).toHaveLength(2);
    expect(legacyCalls(legacy.calls).filter(call => call.name === 'update')).toHaveLength(2);
    expect(legacyCalls(legacy.calls).filter(call => call.name === 'eq' && call.args[0] === 'home_id')).toHaveLength(2);
  });

  test('requires reload instead of mutating when bridge availability is proven but revision is absent', async () => {
    const migrated = mockClient({ rpc: () => ({ data: [bridgeAsset()], error: null }) });
    await expect(createPropertyAssetAdapter(migrated.client).update({
      ...writeInput(),
      assetId: ASSET_ID,
      expectedRevision: null,
      locationLabel: null,
      serialIdentifier: null,
      approximateAgeYears: null,
      customerSafeDescription: null,
    })).rejects.toThrow('revision is unavailable');
    expect(rpcCalls(migrated.calls, 'servsync_update_property_asset')).toHaveLength(0);
    expect(legacyCalls(migrated.calls)).toHaveLength(0);
  });

  test('keeps fallback isolated to the adapter and independent of environment selection', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const adapter = readFileSync(resolve(process.cwd(), 'src/propertyAssetAdapter.ts'), 'utf8');

    expect(app).toContain('createPropertyAssetAdapter');
    expect(app).not.toContain(".from('home_assets')");
    expect(adapter).toContain(".from('home_assets')");
    expect(adapter).toContain("error.code !== 'PGRST202'");
    expect(adapter).not.toMatch(/production|demo|sandbox|project[_-]?ref|feature[_-]?flag/i);
    expect(adapter).not.toContain('servsync_list_property_asset_revisions');
  });
});
