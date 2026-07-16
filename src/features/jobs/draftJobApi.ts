import type { Inspection } from '../../types';
import type {
  DraftJobMetadataPayload,
  DraftJobScopePayloadItem,
  DraftJobScopeUpsertResult,
} from './draftJobMappings';

type DraftJobSupabaseClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export async function createDraftJob(
  client: DraftJobSupabaseClient,
  payload: DraftJobMetadataPayload,
) {
  const { data, error } = await client.rpc('servsync_create_draft_job', payload);
  if (error) throw new Error(error.message || 'Unable to create Draft Job.');
  if (typeof data !== 'string') throw new Error('Draft Job response was missing its id.');
  return data;
}

export async function updateDraftJob(
  client: DraftJobSupabaseClient,
  inspectionId: string,
  payload: DraftJobMetadataPayload,
) {
  const { data, error } = await client.rpc('servsync_update_draft_job', {
    p_inspection_id: inspectionId,
    ...payload,
  });
  if (error) throw new Error(error.message || 'Unable to update Draft Job.');
  return data as Inspection;
}

export async function upsertDraftJobScope(
  client: DraftJobSupabaseClient,
  inspectionId: string,
  items: DraftJobScopePayloadItem[],
) {
  const { data, error } = await client.rpc('servsync_upsert_draft_job_scope', {
    p_inspection_id: inspectionId,
    p_items: items,
  });
  if (error) throw new Error(error.message || 'Unable to save Draft Job scope.');
  return data as DraftJobScopeUpsertResult;
}

export async function activateDraftJob(
  client: DraftJobSupabaseClient,
  inspectionId: string,
) {
  const { data, error } = await client.rpc('servsync_activate_draft_job', {
    p_inspection_id: inspectionId,
    p_job_status: null,
  });
  if (error) throw new Error(error.message || 'Unable to create Job from Draft.');
  return data as Inspection;
}
