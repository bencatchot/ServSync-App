import type { SupabaseClient } from '@supabase/supabase-js';

export type RecordFinalizationResult = {
  status?: string;
  operation_key?: string;
  storage_path?: string;
  report_storage_path?: string;
  report_file_name?: string;
  file_size_bytes?: number;
  file_sha256?: string;
  maintenance_log_id?: string;
  document_id?: string | null;
};

export type ManualHomeHistoryDocumentPayload = {
  file_name: string;
  content_type: string;
  file_size_bytes: number;
  sha256: string;
};

export type ManualHomeHistoryPayload = {
  service_request_id: string | null;
  home_id: string | null;
  category: string;
  title: string;
  description: string;
  performed_at: string;
  contractor_name: string;
  cost_cents: number | null;
  notes: string;
  document: ManualHomeHistoryDocumentPayload | null;
};

export type JobReportFinalizationPayload = {
  rooms_with_findings: unknown[];
  summary: string;
  file_name: string;
  file_size_bytes: number;
  file_sha256: string;
  include_summary: boolean;
  include_value_add: boolean;
  value_add_text: string;
};

export async function recordFinalizationBlobSha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function isDuplicateUpload(error: { message?: string; statusCode?: string | number } | null) {
  return Boolean(error && (String(error.statusCode ?? '') === '409' || /already exists|duplicate/i.test(error.message ?? '')));
}

async function uploadPreparedFinalizationFile(
  supabase: SupabaseClient,
  storagePath: string,
  body: Blob,
  contentType: string,
  operationKey: string,
  sha256?: string,
) {
  const metadata: Record<string, string> = { servsync_operation_key: operationKey };
  if (sha256) metadata.servsync_sha256 = sha256;
  const { error } = await supabase.storage.from('home-documents').upload(storagePath, body, {
    contentType,
    upsert: false,
    metadata,
  });
  if (error && !isDuplicateUpload(error)) throw error;
}

export async function finalizeJobReportDurably(
  supabase: SupabaseClient,
  operationKey: string,
  inspectionId: string,
  payload: JobReportFinalizationPayload,
  reportBlob: Blob,
) {
  const rpcPayload = {
    p_operation_key: operationKey,
    p_inspection_id: inspectionId,
    p_payload: payload,
  };
  const { data: preparation, error: preparationError } = await supabase.rpc(
    'servsync_prepare_job_report_finalization',
    rpcPayload,
  );
  if (preparationError) throw preparationError;

  const prepared = preparation as RecordFinalizationResult | null;
  if (prepared?.status === 'succeeded') return prepared;
  if (!prepared?.storage_path) {
    throw new Error('ServSync could not prepare the report file. Retry without changing the report.');
  }
  const preparedOperationKey = prepared.operation_key || operationKey;
  await uploadPreparedFinalizationFile(
    supabase,
    prepared.storage_path,
    reportBlob,
    'application/pdf',
    preparedOperationKey,
    payload.file_sha256,
  );

  const { data: committed, error: commitError } = await supabase.rpc(
    'servsync_commit_job_report_finalization',
    { ...rpcPayload, p_operation_key: preparedOperationKey },
  );
  if (commitError) throw commitError;
  return committed as RecordFinalizationResult | null;
}

export async function createManualHomeHistoryDurably(
  supabase: SupabaseClient,
  operationKey: string,
  payload: ManualHomeHistoryPayload,
  file?: File | null,
) {
  const rpcPayload = { p_operation_key: operationKey, p_payload: payload };
  const { data: preparation, error: preparationError } = await supabase.rpc(
    'servsync_prepare_manual_home_history_creation',
    rpcPayload,
  );
  if (preparationError) throw preparationError;

  const prepared = preparation as RecordFinalizationResult | null;
  if (prepared?.status === 'succeeded') return prepared;
  const preparedOperationKey = prepared?.operation_key || operationKey;
  if (file) {
    if (!prepared?.storage_path || !payload.document) {
      throw new Error('ServSync could not prepare the receipt file. Retry without changing the Home History entry.');
    }
    await uploadPreparedFinalizationFile(
      supabase,
      prepared.storage_path,
      file,
      payload.document.content_type,
      preparedOperationKey,
      prepared.file_sha256 || payload.document.sha256,
    );
  } else if (prepared?.storage_path) {
    throw new Error('ServSync prepared an unexpected file for this Home History entry. Review the entry and try again.');
  }

  const { data: committed, error: commitError } = await supabase.rpc(
    'servsync_commit_manual_home_history_creation',
    { ...rpcPayload, p_operation_key: preparedOperationKey },
  );
  if (commitError) throw commitError;
  return committed as RecordFinalizationResult | null;
}
