export type ContractorWorkDraftIntendedOutput = 'estimate' | 'job';
export type ContractorWorkDraftWorkFormat = 'standard';
export type ContractorWorkDraftStatus = 'active' | 'consumed' | 'discarded';
export type ContractorWorkDraftSubjectType = 'connected_homeowner' | 'local_contact';
export type ContractorWorkDraftLaborMode = 'job_total' | 'line_specific' | null;
export type ContractorWorkDraftLineType = 'labor' | 'material' | 'fee' | 'other';
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
  subject_type: ContractorWorkDraftSubjectType;
  subject_display_name_snapshot: string;
  property_display_snapshot: string;
  title: string;
  scope_description: string;
  private_notes: string;
  intended_output: ContractorWorkDraftIntendedOutput | null;
  work_format: ContractorWorkDraftWorkFormat;
  labor_mode: ContractorWorkDraftLaborMode;
  labor_rate_cents: number | null;
  job_labor_hours: number | null;
  status: ContractorWorkDraftStatus;
  legacy_inspection_id: string | null;
  launched_output_type: ContractorWorkDraftLaunchOutput | null;
  launched_estimate_id: string | null;
  launched_job_id: string | null;
  launched_estimate_id_snapshot: string | null;
  launched_job_id_snapshot: string | null;
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
  line_type: ContractorWorkDraftLineType;
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
  launched_estimate_id_snapshot: string | null;
  launched_job_id_snapshot: string | null;
  requested_by_user_id: string | null;
  created_at: string;
  completed_at: string;
};

export type ContractorWorkDraftEnvelope = {
  draft: ContractorWorkDraft;
  items: ContractorWorkDraftItem[];
  launches: ContractorWorkDraftLaunch[];
};

// Save is a complete snapshot. Optional database values are explicit nulls.
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
  labor_mode: ContractorWorkDraftLaborMode;
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
  line_type: ContractorWorkDraftLineType;
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
  draft_id: string | null;
  metadata: ContractorWorkDraftMetadataInput;
  items: ContractorWorkDraftItemInput[];
  removed_item_ids: string[];
};

export type ContractorWorkDraftSaveResponse = ContractorWorkDraftEnvelope;
export type ContractorWorkDraftGetResponse = ContractorWorkDraftEnvelope;

export type ContractorWorkDraftListRow = Pick<
  ContractorWorkDraft,
  | 'id'
  | 'contractor_id'
  | 'subject_type'
  | 'subject_display_name_snapshot'
  | 'property_display_snapshot'
  | 'title'
  | 'intended_output'
  | 'work_format'
  | 'status'
  | 'legacy_inspection_id'
  | 'launched_output_type'
  | 'launched_estimate_id'
  | 'launched_job_id'
  | 'launched_estimate_id_snapshot'
  | 'launched_job_id_snapshot'
  | 'launched_at'
  | 'created_at'
  | 'updated_at'
>;

export type ContractorWorkDraftListOptions = {
  statuses?: readonly ContractorWorkDraftStatus[];
};

export type ContractorWorkDraftLegacyImportRequest = {
  inspection_id: string;
  intended_output?: ContractorWorkDraftIntendedOutput | null;
};

export type ContractorWorkDraftLegacyImportResponse = {
  draft_id: string;
};

export type ContractorWorkDraftLaunchRequest = {
  draft_id: string;
  intended_output: ContractorWorkDraftLaunchOutput;
  idempotency_key: string;
};

type ContractorWorkDraftLaunchResultBase = {
  draft_id: string;
  status: 'succeeded' | 'already_consumed';
  output_available: boolean;
  launch_id: string | null;
  idempotent: boolean;
};

export type ContractorWorkDraftEstimateLaunchResult = ContractorWorkDraftLaunchResultBase & {
  output_type: 'estimate';
  estimate_id: string | null;
  job_id: null;
  // The public RPC returns one immutable snapshot selected by output_type.
  output_id_snapshot: string;
};

export type ContractorWorkDraftJobLaunchResult = ContractorWorkDraftLaunchResultBase & {
  output_type: 'job';
  estimate_id: null;
  job_id: string | null;
  // The public RPC returns one immutable snapshot selected by output_type.
  output_id_snapshot: string;
};

export type ContractorWorkDraftLaunchResult =
  | ContractorWorkDraftEstimateLaunchResult
  | ContractorWorkDraftJobLaunchResult;

export type DurableDraftOperationPhase =
  | 'save'
  | 'get'
  | 'list'
  | 'import'
  | 'launch'
  | 'capability';

export type DurableDraftApplicationErrorCode =
  | 'DRAFT_PERMISSION_DENIED'
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_NOT_ACTIVE'
  | 'DRAFT_ALREADY_CONSUMED'
  | 'DRAFT_INVALID'
  | 'DRAFT_RESPONSE_INVALID'
  | 'INTENDED_OUTPUT_REQUIRED'
  | 'INTENDED_OUTPUT_MISMATCH'
  | 'UNSUPPORTED_OUTPUT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'LAUNCH_CONFLICT'
  | 'CUSTOMER_INVALID'
  | 'PROPERTY_INVALID'
  | 'PROPERTY_NOT_SHARED'
  | 'SERVICE_REQUEST_INVALID'
  | 'JOB_SERVICE_REQUEST_CONFLICT'
  | 'LEGACY_DRAFT_INCOMPATIBLE';

export type DurableDraftErrorKind = 'application' | 'database' | 'transport' | 'unknown';

export type DurableDraftNormalizedError = {
  name: 'DurableDraftError';
  phase: DurableDraftOperationPhase;
  kind: DurableDraftErrorKind;
  applicationCode: DurableDraftApplicationErrorCode | null;
  postgresCode: string | null;
  details: string | null;
  hint: string | null;
  httpStatus: number | null;
  transportClassification: 'network' | 'timeout' | 'offline' | null;
  safeMessage: string;
};

export type DurableDraftCompatibilityCapabilities = {
  contractorId: string | null;
  canReadDrafts: boolean;
  canPersistDraft: boolean;
  canImportLegacyDraft: boolean;
  canLaunchJob: boolean;
  canLaunchEstimate: boolean;
};

export type DurableDraftLaunchAttemptPhase = 'prepared' | 'launching' | 'succeeded' | 'ambiguous';

export type DurableDraftLaunchAttemptRecord = {
  schemaVersion: 1;
  contractorId: string;
  draftId: string;
  outputType: ContractorWorkDraftLaunchOutput;
  idempotencyKey: string;
  phase: DurableDraftLaunchAttemptPhase;
  createdAt: string;
  updatedAt: string;
  launchId?: string | null;
  estimateId?: string | null;
  jobId?: string | null;
  outputIdSnapshot?: string;
  outputAvailable?: boolean;
};

export type DurableDraftLaunchAttemptReadResult =
  | { status: 'found'; attempt: DurableDraftLaunchAttemptRecord }
  | { status: 'absent' }
  | { status: 'invalid' }
  | { status: 'unavailable'; operation: 'read' };

export type DurableDraftLaunchAttemptWriteResult =
  | { status: 'success'; attempt: DurableDraftLaunchAttemptRecord }
  | { status: 'invalid'; reason: 'canonical_result' | 'attempt_mismatch' }
  | { status: 'unavailable'; operation: 'read' | 'write' | 'verify' };

export type DurableDraftLaunchAttemptClearResult =
  | { status: 'success'; removed: boolean }
  | { status: 'unavailable'; operation: 'read' | 'remove' };

export type DurableDraftLaunchAttemptClearAllResult =
  | { status: 'success'; removedCount: number; failedCount: 0 }
  | { status: 'partial'; removedCount: number; failedCount: number }
  | { status: 'unavailable'; operation: 'enumerate'; removedCount: 0; failedCount: 0 };
