import type { SupabaseClient } from '@supabase/supabase-js';

type DurableOperationRecord = {
  operationKey: string;
  payloadFingerprint: string;
  updatedAt: string;
};

const STORAGE_PREFIX = 'servsync.durableOperation.v1.';

export type PreparedRequestMedia = {
  ordinal: number;
  storage_path: string;
  sha256: string;
  file_name: string;
  content_type: string;
  file_size_bytes: number;
};

type ServiceRequestResult = {
  status?: string;
  request_id?: string;
  media_manifest?: PreparedRequestMedia[];
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function durableOperationCanonicalPayload(payload: unknown) {
  return JSON.stringify(stableValue(payload));
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function durableFileSha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadPreparedRequestMedia(
  supabase: SupabaseClient,
  files: File[],
  manifest: PreparedRequestMedia[],
  operationKey: string,
) {
  if (files.length !== manifest.length) {
    throw new Error('The prepared attachments no longer match this request. Review the files and try again.');
  }
  for (const item of manifest) {
    const file = files[item.ordinal];
    if (!file) throw new Error('One prepared attachment is missing. Review the files and try again.');
    const { error } = await supabase.storage.from('service-request-media').upload(item.storage_path, file, {
      contentType: item.content_type,
      upsert: false,
      metadata: { servsync_sha256: item.sha256, servsync_operation_key: operationKey },
    });
    const duplicate = error
      && (('statusCode' in error && String(error.statusCode) === '409') || /already exists|duplicate/i.test(error.message));
    if (error && !duplicate) throw error;
  }
}

export async function saveServiceRequestDurably(
  supabase: SupabaseClient,
  files: File[],
  operationKey: string,
  payload: unknown,
) {
  const { data: preparation, error: preparationError } = await supabase.rpc(
    'servsync_prepare_service_request_creation',
    { p_operation_key: operationKey, p_payload: payload },
  );
  if (preparationError) throw preparationError;

  const prepared = preparation as ServiceRequestResult | null;
  if (prepared?.status === 'succeeded' && prepared.request_id) return prepared;

  await uploadPreparedRequestMedia(supabase, files, prepared?.media_manifest ?? [], operationKey);
  const { data: committed, error: commitError } = await supabase.rpc(
    'servsync_commit_service_request_creation',
    { p_operation_key: operationKey, p_payload: payload },
  );
  if (commitError) throw commitError;
  return committed as ServiceRequestResult | null;
}

function storageKey(scope: string, payloadFingerprint: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}.${payloadFingerprint}`;
}

function readRecord(scope: string, payloadFingerprint: string): DurableOperationRecord | null {
  try {
    const value = window.localStorage.getItem(storageKey(scope, payloadFingerprint));
    if (!value) return null;
    const record = JSON.parse(value) as Partial<DurableOperationRecord>;
    if (!record.operationKey || !record.payloadFingerprint || !record.updatedAt) return null;
    return record as DurableOperationRecord;
  } catch {
    return null;
  }
}

function writeRecord(scope: string, record: DurableOperationRecord) {
  window.localStorage.setItem(storageKey(scope, record.payloadFingerprint), JSON.stringify(record));
}

async function resolveOperationKey(scope: string, payloadFingerprint: string) {
  const existing = readRecord(scope, payloadFingerprint);
  if (existing) return existing.operationKey;
  const operationKey = crypto.randomUUID();
  writeRecord(scope, { operationKey, payloadFingerprint, updatedAt: new Date().toISOString() });
  return operationKey;
}

export async function durableOperationKey(scope: string, payload: unknown) {
  const payloadFingerprint = await sha256(durableOperationCanonicalPayload(payload));
  const lockName = `servsync-durable-operation:${scope}:${payloadFingerprint}`;
  if (navigator.locks?.request) {
    return navigator.locks.request(lockName, () => resolveOperationKey(scope, payloadFingerprint));
  }
  return resolveOperationKey(scope, payloadFingerprint);
}

export async function completeDurableOperation(scope: string, operationKey: string, payload: unknown) {
  const payloadFingerprint = await sha256(durableOperationCanonicalPayload(payload));
  const existing = readRecord(scope, payloadFingerprint);
  if (existing?.operationKey === operationKey) {
    window.localStorage.removeItem(storageKey(scope, payloadFingerprint));
  }
}
