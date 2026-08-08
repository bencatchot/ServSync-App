import type { HomeAsset } from './types';

type PropertyAssetRpcName =
  | 'servsync_list_property_assets'
  | 'servsync_create_property_asset'
  | 'servsync_update_property_asset'
  | 'servsync_set_property_asset_lifecycle';

type DataResult = {
  data: unknown;
  error: unknown;
};

interface LegacyAssetRequest extends PromiseLike<DataResult> {
  select(columns: string): LegacyAssetRequest;
  in(column: string, values: string[]): LegacyAssetRequest;
  is(column: string, value: null): LegacyAssetRequest;
  order(column: string, options: { ascending: boolean }): LegacyAssetRequest;
  insert(values: Record<string, unknown>): LegacyAssetRequest;
  update(values: Record<string, unknown>): LegacyAssetRequest;
  eq(column: string, value: string): LegacyAssetRequest;
}

export interface PropertyAssetDataClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<DataResult>;
  from(relation: string): LegacyAssetRequest;
}

export type PropertyAssetWriteInput = {
  homeId: string;
  homeRoomId: string | null;
  assetCategory: string;
  assetType: string | null;
  name: string;
  manufacturer: string | null;
  model: string | null;
  installDate: string | null;
  warrantyExpiresOn: string | null;
  notes: string | null;
  actorUserId: string;
};

export type PropertyAssetUpdateInput = PropertyAssetWriteInput & {
  assetId: string;
  expectedRevision: number | null;
  locationLabel: string | null;
  serialIdentifier: string | null;
  approximateAgeYears: number | null;
  customerSafeDescription: string | null;
};

const LEGACY_SELECT = 'id, home_id, home_room_id, asset_category, asset_type, name, manufacturer, model, install_date, warranty_expires_on, notes, archived_at, created_by, created_at, updated_at';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_KINDS = new Set(['hvac', 'plumbing', 'electrical', 'appliance', 'roof', 'exterior', 'garage', 'safety', 'other']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

const requireUuid = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`Property asset response has an invalid ${field}.`);
  }
  return value;
};

const requireString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Property asset response has an invalid ${field}.`);
  }
  return value;
};

const nullableString = (value: unknown, field: string) => {
  if (!isNullableString(value)) {
    throw new Error(`Property asset response has an invalid ${field}.`);
  }
  return value;
};

const nullableNumber = (value: unknown, field: string) => {
  if (value !== null && (typeof value !== 'number' || !Number.isInteger(value))) {
    throw new Error(`Property asset response has an invalid ${field}.`);
  }
  return value as number | null;
};

const assetKindFromCategory = (category: string) => {
  const kind = category.trim().toLowerCase();
  if (!ASSET_KINDS.has(kind)) {
    throw new Error('Asset category is not supported by the Property Asset Bridge.');
  }
  return kind;
};

const normalizeAsset = (
  value: unknown,
  expectedHomeId: string,
  options: { bridge: boolean; expectedAssetId?: string; expectedLifecycle?: 'active' | 'retired' },
): HomeAsset => {
  if (!isRecord(value)) throw new Error('Property asset response is malformed.');

  const id = requireUuid(value.id, 'asset identity');
  const homeId = requireUuid(value.home_id, 'property identity');
  if (homeId !== expectedHomeId || (options.expectedAssetId && id !== options.expectedAssetId)) {
    throw new Error('Property asset response does not match the requested property or asset.');
  }
  if (value.home_room_id !== null && (typeof value.home_room_id !== 'string' || !UUID_PATTERN.test(value.home_room_id))) {
    throw new Error('Property asset response has an invalid room identity.');
  }

  const normalized: HomeAsset = {
    id,
    home_id: homeId,
    home_room_id: value.home_room_id as string | null,
    asset_category: requireString(value.asset_category, 'asset category'),
    asset_type: nullableString(value.asset_type, 'asset type'),
    name: requireString(value.name, 'asset name'),
    manufacturer: nullableString(value.manufacturer, 'manufacturer'),
    model: nullableString(value.model, 'model'),
    install_date: nullableString(value.install_date, 'install date'),
    warranty_expires_on: nullableString(value.warranty_expires_on, 'warranty date'),
    notes: nullableString(value.notes, 'notes'),
    archived_at: nullableString(value.archived_at, 'archive timestamp'),
    created_by: requireUuid(value.created_by, 'creator identity'),
    created_at: requireString(value.created_at, 'creation timestamp'),
    updated_at: requireString(value.updated_at, 'update timestamp'),
  };

  if (!options.bridge) return normalized;

  const assetKind = requireString(value.asset_kind, 'asset kind').toLowerCase();
  if (!ASSET_KINDS.has(assetKind)) throw new Error('Property asset response has an unknown asset kind.');
  const revisionNumber = value.revision_number;
  if (typeof revisionNumber !== 'number' || !Number.isSafeInteger(revisionNumber) || revisionNumber < 1) {
    throw new Error('Property asset response has an invalid revision number.');
  }
  const lifecycleStatus = value.lifecycle_status;
  if (lifecycleStatus !== 'active' && lifecycleStatus !== 'retired') {
    throw new Error('Property asset response has an invalid lifecycle state.');
  }
  if (options.expectedLifecycle && lifecycleStatus !== options.expectedLifecycle) {
    throw new Error('Property asset response has an unexpected lifecycle state.');
  }
  if ((lifecycleStatus === 'active') !== (normalized.archived_at === null)) {
    throw new Error('Property asset response has conflicting lifecycle state.');
  }
  if (value.local_home_id !== null) {
    throw new Error('Property asset response is not bound to the requested connected property.');
  }

  normalized.asset_kind = assetKind;
  normalized.revision_number = revisionNumber;
  normalized.lifecycle_status = lifecycleStatus;
  normalized.location_label = nullableString(value.location_label, 'location');
  normalized.serial_identifier = nullableString(value.serial_identifier, 'serial identifier');
  normalized.approximate_age_years = nullableNumber(value.approximate_age_years, 'approximate age');
  normalized.customer_safe_description = nullableString(value.customer_safe_description, 'customer-safe description');
  return normalized;
};

export const isExactMissingPropertyAssetRpcError = (error: unknown, rpcName: PropertyAssetRpcName) => {
  if (!isRecord(error) || error.code !== 'PGRST202') return false;
  const details = error.details;
  const message = error.message;
  return typeof details === 'string'
    && details.startsWith(`Searched for the function public.${rpcName} `)
    && details.endsWith('but no matches were found in the schema cache.')
    && typeof message === 'string'
    && message.startsWith(`Could not find the function public.${rpcName}(`)
    && message.endsWith(' in the schema cache');
};

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

const legacyPayload = (input: PropertyAssetWriteInput) => ({
  home_room_id: input.homeRoomId,
  asset_category: input.assetCategory,
  asset_type: input.assetType,
  name: input.name,
  manufacturer: input.manufacturer,
  model: input.model,
  install_date: input.installDate,
  warranty_expires_on: input.warrantyExpiresOn,
  notes: input.notes,
});

const bridgeWriteArguments = (input: PropertyAssetWriteInput) => ({
  p_home_id: input.homeId,
  p_local_home_id: null,
  p_contractor_id: null,
  p_home_room_id: input.homeRoomId,
  p_asset_kind: assetKindFromCategory(input.assetCategory),
  p_asset_type: input.assetType,
  p_name: input.name,
  p_location_label: null,
  p_manufacturer: input.manufacturer,
  p_model: input.model,
  p_serial_identifier: null,
  p_install_date: input.installDate,
  p_approximate_age_years: null,
  p_warranty_expires_on: input.warrantyExpiresOn,
  p_customer_safe_description: null,
  p_notes: input.notes,
});

const operationKey = (operation: string, value: Record<string, unknown>) => `${operation}:${JSON.stringify(value)}`;

export const createPropertyAssetAdapter = (client: PropertyAssetDataClient) => {
  const pendingMutations = new Map<string, Promise<HomeAsset | void>>();

  const listBridgeAssets = async (homeId: string) => {
    const result = await client.rpc('servsync_list_property_assets', {
      p_home_id: homeId,
      p_local_home_id: null,
      p_contractor_id: null,
      p_include_retired: false,
    });
    return result;
  };

  const listLegacyAssets = async (homeIds: string[]) => {
    const result = await client
      .from('home_assets')
      .select(LEGACY_SELECT)
      .in('home_id', homeIds)
      .is('archived_at', null)
      .order('asset_category', { ascending: true })
      .order('name', { ascending: true });
    throwIfError(result.error);
    if (!Array.isArray(result.data)) throw new Error('Legacy property asset response is malformed.');
    const allowedHomes = new Set(homeIds);
    return result.data.map(value => {
      if (!isRecord(value) || typeof value.home_id !== 'string' || !allowedHomes.has(value.home_id)) {
        throw new Error('Legacy property asset response does not match the requested properties.');
      }
      return normalizeAsset(value, value.home_id, { bridge: false });
    });
  };

  const list = async (homeIds: string[]) => {
    const uniqueHomeIds = [...new Set(homeIds)];
    if (uniqueHomeIds.length === 0) return [];
    uniqueHomeIds.forEach(homeId => requireUuid(homeId, 'requested property identity'));

    const first = await listBridgeAssets(uniqueHomeIds[0]);
    if (first.error) {
      if (isExactMissingPropertyAssetRpcError(first.error, 'servsync_list_property_assets')) {
        return listLegacyAssets(uniqueHomeIds);
      }
      throw first.error;
    }
    if (!Array.isArray(first.data)) throw new Error('Property asset list response is malformed.');
    const assets = first.data.map(value => normalizeAsset(value, uniqueHomeIds[0], { bridge: true, expectedLifecycle: 'active' }));

    for (const homeId of uniqueHomeIds.slice(1)) {
      const result = await listBridgeAssets(homeId);
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new Error('Property asset list response is malformed.');
      assets.push(...result.data.map(value => normalizeAsset(value, homeId, { bridge: true, expectedLifecycle: 'active' })));
    }
    return assets;
  };

  const runOnce = <T extends HomeAsset | void>(key: string, operation: () => Promise<T>) => {
    const existing = pendingMutations.get(key);
    if (existing) return existing as Promise<T>;
    const pending = operation().finally(() => pendingMutations.delete(key));
    pendingMutations.set(key, pending);
    return pending;
  };

  const create = (input: PropertyAssetWriteInput) => {
    requireUuid(input.homeId, 'requested property identity');
    requireUuid(input.actorUserId, 'actor identity');
    const rpcArguments = bridgeWriteArguments(input);
    const key = operationKey('create', { ...rpcArguments, actorUserId: input.actorUserId });
    return runOnce(key, async () => {
      const result = await client.rpc('servsync_create_property_asset', rpcArguments);
      if (result.error) {
        if (!isExactMissingPropertyAssetRpcError(result.error, 'servsync_create_property_asset')) throw result.error;
        const legacyResult = await client.from('home_assets').insert({
          home_id: input.homeId,
          created_by: input.actorUserId,
          ...legacyPayload(input),
        });
        throwIfError(legacyResult.error);
        return;
      }
      return normalizeAsset(result.data, input.homeId, { bridge: true, expectedLifecycle: 'active' });
    });
  };

  const bridgeAvailability = async (homeId: string) => {
    const result = await listBridgeAssets(homeId);
    if (result.error) {
      if (isExactMissingPropertyAssetRpcError(result.error, 'servsync_list_property_assets')) return false;
      throw result.error;
    }
    if (!Array.isArray(result.data)) throw new Error('Property asset list response is malformed.');
    result.data.forEach(value => normalizeAsset(value, homeId, { bridge: true, expectedLifecycle: 'active' }));
    return true;
  };

  const update = (input: PropertyAssetUpdateInput) => {
    requireUuid(input.homeId, 'requested property identity');
    requireUuid(input.assetId, 'asset identity');
    requireUuid(input.actorUserId, 'actor identity');
    const key = operationKey('update', { assetId: input.assetId, expectedRevision: input.expectedRevision, ...legacyPayload(input) });
    return runOnce(key, async () => {
      if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision ?? 0) < 1) {
        if (await bridgeAvailability(input.homeId)) {
          throw new Error('Property asset revision is unavailable. Reload before saving.');
        }
        const legacyResult = await client.from('home_assets').update(legacyPayload(input)).eq('id', input.assetId).eq('home_id', input.homeId);
        throwIfError(legacyResult.error);
        return;
      }

      const commonArguments = bridgeWriteArguments(input);
      const rpcArguments = {
        p_asset_id: input.assetId,
        p_expected_revision: input.expectedRevision,
        p_contractor_id: commonArguments.p_contractor_id,
        p_home_room_id: commonArguments.p_home_room_id,
        p_asset_kind: commonArguments.p_asset_kind,
        p_asset_type: commonArguments.p_asset_type,
        p_name: commonArguments.p_name,
        p_location_label: input.locationLabel,
        p_manufacturer: commonArguments.p_manufacturer,
        p_model: commonArguments.p_model,
        p_serial_identifier: input.serialIdentifier,
        p_install_date: commonArguments.p_install_date,
        p_approximate_age_years: input.approximateAgeYears,
        p_warranty_expires_on: commonArguments.p_warranty_expires_on,
        p_customer_safe_description: input.customerSafeDescription,
        p_notes: commonArguments.p_notes,
      };

      const result = await client.rpc('servsync_update_property_asset', rpcArguments);
      if (result.error) {
        if (!isExactMissingPropertyAssetRpcError(result.error, 'servsync_update_property_asset')) throw result.error;
        const legacyResult = await client.from('home_assets').update(legacyPayload(input)).eq('id', input.assetId).eq('home_id', input.homeId);
        throwIfError(legacyResult.error);
        return;
      }
      return normalizeAsset(result.data, input.homeId, { bridge: true, expectedAssetId: input.assetId, expectedLifecycle: 'active' });
    });
  };

  const archive = (asset: HomeAsset) => {
    requireUuid(asset.id, 'asset identity');
    requireUuid(asset.home_id, 'requested property identity');
    const expectedRevision = asset.revision_number ?? null;
    const key = operationKey('archive', { assetId: asset.id, homeId: asset.home_id, expectedRevision });
    return runOnce(key, async () => {
      if (!Number.isSafeInteger(expectedRevision) || (expectedRevision ?? 0) < 1) {
        if (await bridgeAvailability(asset.home_id)) {
          throw new Error('Property asset revision is unavailable. Reload before archiving.');
        }
        const legacyResult = await client.from('home_assets').update({ archived_at: new Date().toISOString() }).eq('id', asset.id).eq('home_id', asset.home_id);
        throwIfError(legacyResult.error);
        return;
      }

      const result = await client.rpc('servsync_set_property_asset_lifecycle', {
        p_asset_id: asset.id,
        p_expected_revision: expectedRevision,
        p_lifecycle_status: 'retired',
        p_contractor_id: null,
      });
      if (result.error) {
        if (!isExactMissingPropertyAssetRpcError(result.error, 'servsync_set_property_asset_lifecycle')) throw result.error;
        const legacyResult = await client.from('home_assets').update({ archived_at: new Date().toISOString() }).eq('id', asset.id).eq('home_id', asset.home_id);
        throwIfError(legacyResult.error);
        return;
      }
      return normalizeAsset(result.data, asset.home_id, { bridge: true, expectedAssetId: asset.id, expectedLifecycle: 'retired' });
    });
  };

  return { list, create, update, archive };
};
