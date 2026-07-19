export type ContractorWorkDraftIntendedOutput = 'estimate' | 'job';
export type ContractorWorkDraftWorkFormat = 'standard';
export type ContractorWorkDraftStatus = 'active' | 'consumed' | 'discarded';
export type ContractorWorkDraftLaunchStatus = 'succeeded';
export type ContractorWorkDraftLaunchOutput = 'estimate' | 'job';

export type ContractorWorkDraft = {
  id: string;
  contractor_id: string;
  created_by_user_id: string | null;
  homeowner_user_id: string | null;
  home_id: string | null;
  local_contact_id: string | null;
  local_home_id: string | null;
  service_request_id: string | null;
  subject_type: 'connected_homeowner' | 'local_contact';
  subject_display_name_snapshot: string;
  property_display_snapshot: string;
  title: string;
  scope_description: string;
  private_notes: string;
  intended_output: ContractorWorkDraftIntendedOutput | null;
  work_format: ContractorWorkDraftWorkFormat;
  labor_mode: 'job_total' | 'line_specific' | null;
  labor_rate_cents: number | null;
  job_labor_hours: number | null;
  status: ContractorWorkDraftStatus;
  legacy_inspection_id: string | null;
  launched_output_type: ContractorWorkDraftLaunchOutput | null;
  launched_estimate_id: string | null;
  launched_job_id: string | null;
  launched_at: string | null;
  launched_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractorWorkDraftItem = {
  id: string;
  draft_id: string;
  contractor_id: string;
  title: string;
  description: string;
  customer_description: string;
  internal_notes: string;
  line_type: 'labor' | 'material' | 'fee' | 'other';
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  labor_hours: number | null;
  room_id: string | null;
  room_label: string | null;
  location_label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ContractorWorkDraftLaunch = {
  id: string;
  draft_id: string;
  contractor_id: string;
  idempotency_key: string;
  requested_output: ContractorWorkDraftLaunchOutput;
  status: ContractorWorkDraftLaunchStatus;
  launched_estimate_id: string | null;
  launched_job_id: string | null;
  requested_by_user_id: string | null;
  created_at: string;
  completed_at: string;
};

// Full snapshot: omitted optional values are represented explicitly as null or ''.
export type ContractorWorkDraftMetadataInput = {
  homeowner_user_id: string | null;
  home_id: string | null;
  local_contact_id: string | null;
  local_home_id: string | null;
  service_request_id: string | null;
  title: string;
  scope_description: string;
  private_notes: string;
  intended_output: ContractorWorkDraftIntendedOutput | null;
  work_format: ContractorWorkDraftWorkFormat;
  labor_mode: 'job_total' | 'line_specific' | null;
  labor_rate_cents: number | null;
  job_labor_hours: number | null;
  legacy_inspection_id: string | null;
};

export type ContractorWorkDraftItemInput = {
  id: string | null;
  title: string;
  description: string;
  customer_description: string;
  internal_notes: string;
  line_type: 'labor' | 'material' | 'fee' | 'other';
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  labor_hours: number | null;
  room_id: string | null;
  room_label: string | null;
  location_label: string | null;
  sort_order: number;
};

export type ContractorWorkDraftSavePayload = {
  draft_id?: string | null;
  metadata: ContractorWorkDraftMetadataInput;
  items: ContractorWorkDraftItemInput[];
  removed_item_ids?: string[];
};

export type ContractorWorkDraftLaunchResult = {
  draft_id: string;
  status: 'succeeded' | 'already_consumed';
  output_type: ContractorWorkDraftLaunchOutput;
  estimate_id?: string | null;
  job_id?: string | null;
  launch_id?: string | null;
  idempotent?: boolean;
};
