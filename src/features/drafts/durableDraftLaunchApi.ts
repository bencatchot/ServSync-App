import type {
  ContractorWorkDraftLaunchResult,
  ContractorWorkDraftSavePayload,
} from './durableDraftLaunchTypes';

type DurableDraftSupabaseClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export async function saveContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  payload: ContractorWorkDraftSavePayload,
) {
  const { data, error } = await client.rpc('servsync_save_work_draft', {
    p_draft_id: payload.draft_id ?? null,
    p_metadata: payload.metadata,
    p_items: payload.items,
    p_removed_item_ids: payload.removed_item_ids ?? [],
  });
  if (error) throw new Error(error.message || 'DRAFT_SAVE_FAILED');
  return data;
}

export async function getContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  draftId: string,
) {
  const { data, error } = await client.rpc('servsync_get_work_draft', {
    p_draft_id: draftId,
  });
  if (error) throw new Error(error.message || 'DRAFT_LOAD_FAILED');
  return data;
}

export async function launchContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  draftId: string,
  intendedOutput: 'estimate' | 'job',
  idempotencyKey: string,
): Promise<ContractorWorkDraftLaunchResult> {
  const { data, error } = await client.rpc('servsync_launch_work_draft', {
    p_draft_id: draftId,
    p_intended_output: intendedOutput,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message || 'DRAFT_LAUNCH_FAILED');
  return data as ContractorWorkDraftLaunchResult;
}
