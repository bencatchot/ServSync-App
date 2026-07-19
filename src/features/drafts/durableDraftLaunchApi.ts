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
  const metadata = {
    homeowner_user_id: payload.metadata.homeowner_user_id ?? null,
    home_id: payload.metadata.home_id ?? null,
    local_contact_id: payload.metadata.local_contact_id ?? null,
    local_home_id: payload.metadata.local_home_id ?? null,
    service_request_id: payload.metadata.service_request_id ?? null,
    title: payload.metadata.title ?? '',
    scope_description: payload.metadata.scope_description ?? '',
    private_notes: payload.metadata.private_notes ?? '',
    intended_output: payload.metadata.intended_output ?? null,
    work_format: payload.metadata.work_format,
    labor_mode: payload.metadata.labor_mode ?? null,
    labor_rate_cents: payload.metadata.labor_rate_cents ?? null,
    job_labor_hours: payload.metadata.job_labor_hours ?? null,
    legacy_inspection_id: payload.metadata.legacy_inspection_id ?? null,
  };
  const items = payload.items.map(item => ({
    id: item.id ?? null,
    title: item.title ?? '',
    description: item.description ?? '',
    customer_description: item.customer_description ?? '',
    internal_notes: item.internal_notes ?? '',
    line_type: item.line_type,
    quantity: item.quantity,
    unit: item.unit ?? '',
    unit_price_cents: item.unit_price_cents ?? null,
    labor_hours: item.labor_hours ?? null,
    room_id: item.room_id ?? null,
    room_label: item.room_label ?? null,
    location_label: item.location_label ?? null,
    sort_order: item.sort_order,
  }));
  const { data, error } = await client.rpc('servsync_save_work_draft', {
    p_draft_id: payload.draft_id ?? null,
    p_metadata: metadata,
    p_items: items,
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
