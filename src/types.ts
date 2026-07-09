export type UserRole = 'homeowner' | 'contractor' | 'platform_admin';

export type ConnectionStatus = 'pending' | 'active' | 'declined' | 'revoked' | 'dismissed';
export type ContractorAccountStatus = 'active' | 'inactive' | 'paused';
export type ContractorSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'unpaid';
export type ContractorBillingStatus = 'none' | 'beta_free' | 'trialing' | 'active' | 'past_due' | 'grace_period' | 'limited' | 'canceled' | 'comped' | 'manual_review';
export type ContractorAccessMode = 'none' | 'full_beta' | 'full_paid' | 'founder' | 'read_only' | 'limited' | 'suspended';
export type InviteStatus = 'active' | 'used' | 'revoked' | 'expired';
export type ReferralRewardStatus = 'not_eligible' | 'pending_review' | 'approved' | 'denied' | 'paid';
export type UniversalReferralStatus = 'pending' | 'signed_up' | 'qualified' | 'reward_approved' | 'reward_paid' | 'rejected';
export type UniversalReferralRewardStatus = 'pending' | 'approved' | 'denied' | 'paid' | 'not_eligible';
export type ContractorReferralInviteStatus = 'created' | 'sent' | 'signed_up' | 'accepted' | 'expired' | 'cancelled' | 'duplicate' | 'admin_review';
export type ContractorReferralInviteAdminStatus = 'new' | 'reviewing' | 'contacted' | 'followed_up' | 'joined' | 'duplicate' | 'bad_contact_info' | 'declined' | 'no_response' | 'archived';
export type ConnectionAlertLevel = 'green' | 'yellow' | 'red';
export type ConnectionAlertStatus = 'open' | 'acknowledged' | 'contacted' | 'dismissed' | 'resolved';
export type ExternalReviewSource = 'google' | 'facebook' | 'yelp' | 'other';
export type ReviewModerationStatus = 'pending' | 'approved' | 'hidden' | 'rejected';
export type ServiceRequestStatus = 'open' | 'contractor_responded' | 'homeowner_replied' | 'declined' | 'closed';
export type ServiceRequestUrgency = 'low' | 'normal' | 'urgent';
export type QuoteStatus = 'pending' | 'accepted' | 'declined';
export type AppointmentStatus = 'proposed' | 'confirmed' | 'completed' | 'cancelled';
export type ServiceRequestAppointmentWindowStatus = 'proposed' | 'accepted' | 'declined' | 'superseded' | 'cancelled' | 'expired';
export type ContractorVisitEventStatus = 'scheduled' | 'completed' | 'cancelled';
export type ContractorVisitHomeownerResponseStatus = 'not_shared' | 'shared_waiting' | 'accepted' | 'declined' | 'countered';
export type CalendarEventType = 'service_visit' | 'inspection_visit' | 'estimate_visit' | 'follow_up_visit' | 'custom';
export type CalendarEventRecurrenceFrequency = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'revised';
export type EstimateLineType = 'labor' | 'material' | 'fee' | 'other';
export type LegacyEstimateLineType = EstimateLineType | 'equipment';
export type EstimateLaborMode = 'job_total' | 'line_specific';
export type EstimateChargeType = 'flat' | 'hourly';
export type EstimateLineSupplyStatus = 'contractor_supplied' | 'customer_supplied' | 'to_be_confirmed';
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'partially_paid' | 'void' | 'overdue';
export type InvoiceType = 'total' | 'deposit' | 'progress' | 'final';
export type ExternalObjectMappingStatus = 'active' | 'pending' | 'conflict' | 'failed' | 'archived';
export type ExternalObjectMappingSyncDirection = 'imported' | 'exported' | 'synced' | 'linked';
export type ExternalObjectMappingEntityType =
  | 'contractor_profile'
  | 'homeowner_profile'
  | 'home'
  | 'home_document'
  | 'home_reminder'
  | 'contractor_local_contact'
  | 'contractor_local_home'
  | 'homeowner_contractor_connection'
  | 'service_request'
  | 'service_request_appointment'
  | 'contractor_calendar_event'
  | 'estimate'
  | 'estimate_line_item'
  | 'invoice'
  | 'invoice_line_item'
  | 'inspection'
  | 'job_work_item'
  | 'home_maintenance_log'
  | 'notification'
  | 'workflow_message'
  | 'workflow_activity_event'
  | 'service_agreement_template'
  | 'service_agreement_offer'
  | 'service_agreement'
  | 'contractor_price_book_item';
export type IntegrationOutboxChannel =
  | 'accounting'
  | 'payment'
  | 'calendar'
  | 'email'
  | 'sms'
  | 'push'
  | 'document'
  | 'crm'
  | 'webhook'
  | 'other';
export type IntegrationOutboxStatus =
  | 'pending'
  | 'locked'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'dead_letter'
  | 'cancelled';
export type JobLifecycleStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'closed' | 'cancelled';
export type JobWorkItemCompletionStatus = 'open' | 'completed' | 'declined' | 'removed';
export type JobWorkItemBillingStatus = 'unbilled' | 'drafted' | 'invoiced' | 'not_billable';
export type SupportInquiryStatus = 'new' | 'in_progress' | 'waiting_on_user' | 'waiting_on_admin' | 'resolved' | 'closed';
export type SupportInquiryCategory = 'feature_request' | 'tweak' | 'bug' | 'question' | 'billing' | 'other';

export interface ExternalReviewLink {
  source: ExternalReviewSource;
  label: string;
  url: string;
  updated_at?: string;
}

export interface ServiceRequestAppointment {
  id: string;
  request_id: string;
  contractor_id: string;
  visit_event_id?: string | null;
  proposed_at: string;
  notes: string;
  status: AppointmentStatus;
  proposed_by: 'contractor' | 'homeowner';
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestAppointmentWindow {
  id: string;
  request_id: string;
  starts_at: string;
  ends_at: string;
  status: ServiceRequestAppointmentWindowStatus;
  proposal_batch_id: string;
  contractor_note: string | null;
  homeowner_response_note: string | null;
  created_at: string;
  accepted_at?: string | null;
  cancelled_at?: string | null;
}

export interface ServiceRequestQuote {
  id: string;
  request_id: string;
  contractor_id: string;
  amount_cents: number;
  scope: string;
  status: QuoteStatus;
  created_at: string;
  updated_at: string;
}

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  line_type: LegacyEstimateLineType;
  description: string;
  line_title?: string | null;
  customer_description?: string | null;
  model_spec?: string | null;
  supply_status?: EstimateLineSupplyStatus | null;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  labor_hours?: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Estimate {
  id: string;
  contractor_id: string;
  homeowner_user_id: string | null;
  local_contact_id: string | null;
  service_request_id: string | null;
  inspection_id: string | null;
  home_id?: string | null;
  local_home_id?: string | null;
  home_label?: string | null;
  home_address?: string | null;
  title: string;
  scope: string;
  notes: string;
  terms: string;
  status: EstimateStatus;
  subtotal_cents: number;
  total_cents: number;
  labor_mode?: EstimateLaborMode | null;
  labor_rate_cents?: number | null;
  job_labor_hours?: number | null;
  material_total_cents?: number | null;
  labor_total_cents?: number | null;
  fee_total_cents?: number | null;
  other_total_cents?: number | null;
  tax_rate_percent?: number | null;
  tax_cents?: number | null;
  created_at: string;
  updated_at: string;
  line_items?: EstimateLineItem[];
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  job_work_item_id?: string | null;
  line_type: LegacyEstimateLineType;
  description: string;
  line_title?: string | null;
  customer_description?: string | null;
  model_spec?: string | null;
  supply_status?: EstimateLineSupplyStatus | null;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  labor_hours?: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface JobWorkItem {
  id: string;
  inspection_id: string;
  contractor_id: string;
  source_type?: string | null;
  source_key?: string | null;
  source_room_id?: string | null;
  source_finding_id?: string | null;
  source_estimate_line_item_id?: string | null;
  reserved_invoice_id?: string | null;
  invoiced_invoice_id?: string | null;
  title: string;
  description: string;
  customer_description: string;
  internal_notes: string;
  line_type: EstimateLineType;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  labor_hours?: number | null;
  billable: boolean;
  completion_status: JobWorkItemCompletionStatus;
  billing_status: JobWorkItemBillingStatus;
  completed_at?: string | null;
  completed_by?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceBacklogItem {
  id: string;
  invoice_id: string;
  job_work_item_id?: string | null;
  title: string;
  description: string;
  completion_status: JobWorkItemCompletionStatus;
  billing_status: JobWorkItemBillingStatus;
  not_included_reason: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  contractor_id: string;
  homeowner_user_id: string | null;
  local_contact_id: string | null;
  service_request_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  home_id?: string | null;
  local_home_id?: string | null;
  home_label?: string | null;
  home_address?: string | null;
  invoice_number: string;
  invoice_type: InvoiceType;
  invoice_sequence?: number | null;
  title: string;
  scope: string;
  notes: string;
  terms: string;
  status: InvoiceStatus;
  subtotal_cents: number;
  labor_mode?: EstimateLaborMode | null;
  labor_rate_cents?: number | null;
  job_labor_hours?: number | null;
  material_total_cents?: number | null;
  labor_total_cents?: number | null;
  fee_total_cents?: number | null;
  other_total_cents?: number | null;
  tax_cents: number;
  tax_rate_percent?: number;
  discount_cents: number;
  discount_type?: 'amount' | 'percentage';
  discount_value?: number;
  discount_reason?: string;
  total_cents: number;
  amount_paid_cents: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[];
  backlog_items?: InvoiceBacklogItem[];
}

export interface ExternalObjectMapping {
  id: string;
  provider: string;
  provider_account_id: string;
  provider_object_type: string;
  provider_object_id: string;
  provider_parent_object_id?: string | null;
  servsync_entity_type: ExternalObjectMappingEntityType;
  servsync_entity_id: string;
  contractor_id?: string | null;
  homeowner_user_id?: string | null;
  home_id?: string | null;
  mapping_status: ExternalObjectMappingStatus;
  sync_direction: ExternalObjectMappingSyncDirection;
  last_synced_at?: string | null;
  last_seen_at?: string | null;
  external_updated_at?: string | null;
  metadata: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationOutboxEvent {
  id: string;
  event_key: string;
  channel: IntegrationOutboxChannel;
  provider: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id?: string | null;
  contractor_id?: string | null;
  homeowner_user_id?: string | null;
  home_id?: string | null;
  status: IntegrationOutboxStatus;
  priority: number;
  scheduled_for: string;
  attempt_count: number;
  max_attempts: number;
  locked_at?: string | null;
  locked_by?: string | null;
  processing_started_at?: string | null;
  processed_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  payload: Record<string, unknown>;
  result_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InvoiceDraft {
  invoice_number: string;
  title: string;
  scope: string;
  notes: string;
  terms: string;
  service_request_id: string;
  job_id: string;
  estimate_id: string;
  issued_at: string;
  due_at: string;
  tax_cents: number;
  tax_rate_percent?: number;
  discount_cents: number;
  discount_type?: 'amount' | 'percentage';
  discount_value?: number;
  discount_reason?: string;
  line_items: Array<{
    line_type: EstimateLineType;
    description: string;
    line_title?: string;
    customer_description?: string;
    model_spec?: string;
    supply_status?: EstimateLineSupplyStatus | '';
    quantity: string;
    unit: string;
    unit_price: string;
    labor_hours?: string;
  }>;
}

export interface EstimateTemplateLineItem {
  line_type: LegacyEstimateLineType;
  description: string;
  line_title?: string;
  customer_description?: string;
  model_spec?: string;
  supply_status?: EstimateLineSupplyStatus | null;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  labor_hours?: number | null;
  sort_order: number;
}

export interface EstimateTemplate {
  id: string;
  contractor_id: string;
  name: string;
  trade: string;
  scope: string;
  notes: string;
  terms: string;
  line_items: EstimateTemplateLineItem[];
  created_at: string;
  updated_at: string;
}

export interface ContractorSavedEstimateCharge {
  id: string;
  contractor_id: string;
  name: string;
  description: string;
  line_type: LegacyEstimateLineType;
  charge_type: EstimateChargeType;
  amount_cents: number;
  default_quantity: number;
  unit: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ContractorPriceBookItem {
  id: string;
  contractor_id: string;
  title: string;
  customer_description: string;
  internal_notes: string;
  trade: string;
  category: string;
  line_type: EstimateLineType;
  unit: string | null;
  default_unit_price_cents: number | null;
  taxable: boolean;
  labor_hours: number | null;
  sku: string | null;
  source: string | null;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceAgreementTemplateStatus = 'active' | 'archived';
export type ServiceAgreementOfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
export type ServiceAgreementStatus = 'active' | 'cancelled' | 'expired';

export interface ServiceAgreementTemplate {
  id: string;
  contractor_id: string;
  name: string;
  description: string | null;
  service_frequency: string | null;
  default_duration_months: number | null;
  default_price_cents: number | null;
  included_visit_count: number | null;
  terms_summary: string | null;
  status: ServiceAgreementTemplateStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceAgreementOffer {
  id: string;
  template_id: string | null;
  contractor_id: string;
  homeowner_user_id: string;
  home_id: string;
  connection_id: string;
  title: string;
  description: string | null;
  price_cents: number | null;
  duration_months: number | null;
  included_visit_count: number | null;
  starts_on: string | null;
  ends_on: string | null;
  terms_summary: string | null;
  status: ServiceAgreementOfferStatus;
  sent_at: string | null;
  responded_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceAgreement {
  id: string;
  offer_id: string;
  contractor_id: string;
  homeowner_user_id: string;
  home_id: string;
  connection_id: string;
  title: string;
  description: string | null;
  price_cents: number | null;
  duration_months: number | null;
  included_visit_count: number | null;
  starts_on: string | null;
  ends_on: string | null;
  renewal_due_on: string | null;
  terms_summary: string | null;
  status: ServiceAgreementStatus;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  email_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface HomeownerProfile {
  user_id: string;
  display_name: string;
  phone: string;
  city: string;
  state: string;
  zip_code: string;
  profile_photo_path: string;
  created_at: string;
  updated_at: string;
}

export interface HomeProfile {
  id: string;
  homeowner_user_id: string;
  nickname: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  home_type: string;
  year_built: string;
  square_feet: string;
  notes: string;
  home_photo_path: string;
  created_at: string;
  updated_at: string;
}

export interface HomeRoom {
  id: string;
  home_id: string;
  name: string;
  room_type: string | null;
  floor_label: string | null;
  area_label: string | null;
  sort_order: number;
  notes: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HomeRoomLayout {
  id: string;
  home_id: string;
  home_room_id: string;
  floor_label: string | null;
  layout_x: number;
  layout_y: number;
  layout_width: number;
  layout_height: number;
  measured_width: number | null;
  measured_depth: number | null;
  measurement_unit: string | null;
  sort_order: number;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HomeAsset {
  id: string;
  home_id: string;
  home_room_id: string | null;
  asset_category: string;
  asset_type: string | null;
  name: string;
  manufacturer: string | null;
  model: string | null;
  install_date: string | null;
  warranty_expires_on: string | null;
  notes: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContractorProfile {
  id: string;
  owner_user_id: string;
  business_name: string;
  slug: string;
  contact_name: string;
  email: string;
  phone: string;
  website_url: string;
  logo_url: string;
  city: string;
  state: string;
  zip_code: string;
  service_categories: string[];
  service_zip_codes: string[];
  license_number: string;
  insurance_status: string;
  bonded_status: string;
  business_summary: string;
  external_review_links: ExternalReviewLink[];
  public_profile_enabled: boolean;
  account_status: ContractorAccountStatus;
  subscription_status: ContractorSubscriptionStatus;
  monthly_price_cents: number;
  default_labor_rate_cents?: number | null;
  subscription_notes: string;
  admin_notes: string;
  permanent_invite_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorEntitlements {
  contractor_id: string | null;
  billing_status: ContractorBillingStatus | string;
  current_plan: string;
  access_mode: ContractorAccessMode | string;
  subscription_required_after: string | null;
  grace_period_ends_at: string | null;
  can_use_workspace: boolean;
  can_create_service_requests_for_local_customers: boolean;
  can_create_estimates: boolean;
  can_send_estimates: boolean;
  can_create_jobs: boolean;
  can_create_invoices: boolean;
  can_send_invoices: boolean;
  can_use_discover_profile: boolean;
  can_accept_new_connections: boolean;
  can_use_ai_features: boolean;
  can_invite_team_members: boolean;
  max_team_seats: number;
  max_storage_mb: number;
  read_only_reason: string;
}

export interface ContractorServiceArea {
  id: string;
  contractor_id: string;
  label: string;
  location_text: string;
  zip_code: string;
  city: string;
  state: string;
  radius_miles: number;
  latitude: number | null;
  longitude: number | null;
  geocode_status: 'pending' | 'geocoded' | 'failed';
  geocoded_at: string | null;
  normalized_location: string;
  geocode_provider: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ContractorTeamRole = 'admin' | 'office' | 'field_tech' | 'viewer';
export type ContractorTeamStatus = 'active' | 'disabled';
export type ContractorTeamInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface ContractorTeamMember {
  id: string;
  contractor_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: ContractorTeamRole;
  status: ContractorTeamStatus;
  accepted_at: string;
  created_at: string;
  updated_at: string;
}

export interface ContractorTeamInvite {
  id: string;
  contractor_id: string;
  email: string;
  display_name: string;
  role: ContractorTeamRole;
  invite_code: string;
  status: ContractorTeamInviteStatus;
  expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorTeamAccess {
  contractor_id: string | null;
  can_manage: boolean;
  included_seats: number;
  active_seat_count: number;
  extra_seat_count: number;
  members: ContractorTeamMember[];
  invites: ContractorTeamInvite[];
}

export interface HomeownerConnection {
  connection_id: string;
  contractor_id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  logo_url: string;
  city: string;
  state: string;
  status: ConnectionStatus;
  source: string;
  permissions: SharingPermissions;
  shared_properties?: HomeownerConnectionSharedProperty[];
  request_context?: ConnectionRequestContext | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorConnectedHomeownerHome {
  id?: string;
  nickname: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  home_type: string;
  year_built: string;
  square_feet: string;
  notes: string;
}

export interface ContractorConnectedHomeowner {
  connection_id: string;
  homeowner_user_id: string;
  display_name: string;
  phone: string;
  city: string;
  state: string;
  zip_code: string;
  status: ConnectionStatus;
  permissions: SharingPermissions;
  home: ContractorConnectedHomeownerHome | null;
  homes?: ContractorConnectedHomeownerHome[];
  created_at: string;
  updated_at: string;
  source: string;
}

export interface ContractorPendingConnectionContactSummary {
  display_name: string;
  phone?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export interface ContractorPendingConnectionRequestContext {
  message: string;
  created_at: string;
  updated_at: string;
}

export interface ContractorPendingConnectionSharedProperty {
  home_id: string;
  label: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  share_home_overview: boolean;
  share_address: boolean;
  share_preferred_vendors: boolean;
  share_photos: boolean;
  updated_at: string;
}

export interface ContractorConnectionRequest {
  connection_id: string;
  contractor_id: string;
  status: ConnectionStatus;
  source: string;
  share_contact: boolean;
  contact_summary: ContractorPendingConnectionContactSummary;
  request_context: ContractorPendingConnectionRequestContext | null;
  shared_properties: ContractorPendingConnectionSharedProperty[];
  created_at: string;
  updated_at: string;
}

export interface ConnectionAuditEvent {
  id: string;
  connection_id: string;
  actor_user_id: string | null;
  event_type: string;
  event_details: Record<string, unknown>;
  created_at: string;
}

export interface SharingPermissions {
  share_contact: boolean;
  share_home_overview: boolean;
  share_address: boolean;
  share_preferred_vendors: boolean;
  share_photos: boolean;
}

export interface ContextualConnectionPropertyPermission {
  home_id: string;
  share_home_overview: boolean;
  share_address: boolean;
  share_preferred_vendors: boolean;
  share_photos: boolean;
}

export interface HomeownerConnectionSharedProperty extends ContextualConnectionPropertyPermission {
  id?: string;
  nickname?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  updated_at?: string;
}

export interface ConnectionRequestContext {
  message: string;
  created_at: string;
  updated_at: string;
}

export interface ContextualConnectionContractorTarget {
  id: string;
  business_name: string;
  city?: string | null;
  state?: string | null;
  logo_url?: string | null;
  service_categories?: string[];
}

export interface ContextualConnectionRequestResult {
  connection_id: string;
  status: ConnectionStatus;
  property_count: number;
}

export interface InvitePreview {
  invite_id: string;
  contractor_id: string;
  business_name: string;
  city: string;
  state: string;
}

export interface ContractorInvite {
  id: string;
  contractor_id: string;
  invite_code: string;
  invite_type: 'manual' | 'permanent_qr';
  status: InviteStatus;
  created_by: string;
  used_by_homeowner_id: string | null;
  used_at: string | null;
  expires_at: string | null;
  reward_status: ReferralRewardStatus;
  reward_notes: string;
  created_at: string;
}

export interface AdminReferral {
  referral_id: string;
  referral_code: string;
  referrer_user_id: string | null;
  referrer_role: 'homeowner' | 'contractor' | null;
  referrer_email: string | null;
  referrer_name: string | null;
  referred_user_id: string | null;
  referred_role: 'homeowner' | 'contractor' | null;
  referred_email: string | null;
  referred_name: string | null;
  source: string;
  status: UniversalReferralStatus;
  reward_status: UniversalReferralRewardStatus;
  reward_type: string | null;
  reward_amount_cents: number | null;
  admin_notes: string;
  created_at: string;
  updated_at: string;
  qualified_at: string | null;
  reward_approved_at: string | null;
  reward_paid_at: string | null;
  rejected_at: string | null;
}

export interface AdminContractorReferralInvite {
  referral_id: string;
  referral_type: 'contractor_refers_contractor';
  referrer_user_id: string | null;
  referrer_email: string | null;
  referrer_name: string | null;
  referrer_contractor_id: string | null;
  referrer_contractor_name: string | null;
  referred_business_name: string;
  referred_contact_name: string | null;
  referred_email: string;
  referred_phone: string | null;
  referred_trade_category: string | null;
  referred_location: string | null;
  referrer_note: string | null;
  status: ContractorReferralInviteStatus;
  admin_status: ContractorReferralInviteAdminStatus;
  admin_notes: string | null;
  outreach_attempt_count: number;
  last_outreach_at: string | null;
  next_follow_up_at: string | null;
  matched_contractor_id: string | null;
  matched_contractor_name: string | null;
  matched_user_id: string | null;
  matched_user_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminReviewModerationRow {
  review_id: string;
  request_id: string;
  request_title: string | null;
  request_category: string | null;
  contractor_id: string;
  contractor_name: string | null;
  homeowner_user_id: string;
  homeowner_name: string | null;
  rating: number;
  body: string;
  kudos: string[];
  reviewer_display_name: string;
  reviewer_location: string;
  moderation_status: ReviewModerationStatus;
  moderation_note: string;
  created_at: string;
  updated_at: string;
  moderated_at: string | null;
  moderated_by: string | null;
}

export interface AdminContractorAdoption {
  contractor_id: string;
  contractor_name: string | null;
  contractor_owner_user_id: string | null;
  owner_email: string | null;
  total_customer_count: number;
  connected_homeowner_count: number;
  local_customer_count: number;
  connection_rate: number;
  connection_level: ConnectionAlertLevel;
  invites_sent_count: number;
  invites_used_count: number;
  last_customer_created_at: string | null;
  last_invite_used_at: string | null;
  alert_id: string | null;
  alert_status: ConnectionAlertStatus | null;
  alert_level: ConnectionAlertLevel | null;
  last_triggered_at: string | null;
  acknowledged_at: string | null;
  contacted_at: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
  next_follow_up_at: string | null;
  admin_notes: string | null;
}

export interface PlatformOverview {
  homeowners: number;
  contractors: number;
  active_connections: number;
  pending_connections: number;
  active_invites: number;
}

export interface PlatformConnectionOverview {
  connection_id: string;
  contractor_id: string;
  contractor_name: string;
  status: ConnectionStatus;
  source: string;
  event_count: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestMessage {
  id: string;
  actor_user_id: string | null;
  actor_role: 'homeowner' | 'contractor' | 'platform_admin';
  message_type: string;
  body: string;
  created_at: string;
}

export interface MaintenanceLogEntry {
  id: string;
  homeowner_user_id: string;
  home_id?: string | null;
  service_request_id: string | null;
  estimate_id: string | null;
  invoice_id?: string | null;
  inspection_id: string | null;
  report_document_id: string | null;
  invoice_document_id: string | null;
  category: string;
  title: string;
  description: string;
  performed_at: string;
  contractor_name: string;
  cost_cents: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type HomeReminderStatus = 'open' | 'completed' | 'dismissed';

export interface HomeReminder {
  id: string;
  homeowner_user_id: string;
  home_id: string | null;
  home_room_id: string | null;
  maintenance_log_id: string | null;
  service_request_id: string | null;
  invoice_id: string | null;
  title: string;
  notes: string;
  due_on: string;
  status: HomeReminderStatus;
  completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestReview {
  id: string;
  request_id: string;
  rating: number;
  body: string;
  kudos: string[];
  reviewer_display_name: string;
  reviewer_location: string;
  created_at: string;
}

export interface PublicReview {
  rating: number;
  body: string;
  kudos: string[];
  reviewer_display_name: string;
  reviewer_location: string;
  created_at: string;
}

export interface PublicContractorListing {
  contractor_id: string;
  business_name: string;
  slug: string;
  logo_url: string;
  city: string;
  state: string;
  categories: string[];
  business_summary: string;
  avg_rating: number | null;
  review_count: number;
  reviews: PublicReview[];
  external_review_links: ExternalReviewLink[];
}

export interface ContractorPublicProfile {
  contractor_id: string;
  business_name: string;
  slug: string;
  contact_name: string;
  city: string;
  state: string;
  zip_code: string;
  website_url: string;
  logo_url: string;
  categories: string[];
  business_summary: string;
  license_number: string;
  insurance_status: string;
  bonded_status: string;
  avg_rating: number | null;
  review_count: number;
  reviews: PublicReview[];
  external_review_links: ExternalReviewLink[];
}

export interface PublicContractorServiceArea {
  label: string;
  location_text: string;
  zip_code: string;
  city: string;
  state: string;
  radius_miles: number;
}

export interface DiscoverFeedItem {
  post_id: string;
  contractor_id: string;
  business_name: string;
  contractor_city: string;
  contractor_state: string;
  categories: string[];
  business_summary: string;
  avg_rating: number | null;
  review_count: number;
  post_category: string;
  title: string;
  description: string;
  photos: string[];
  reviews: PublicReview[];
  created_at: string;
  view_count?: number;
  save_count?: number;
  is_saved?: boolean;
  external_review_links?: ExternalReviewLink[];
  service_areas?: PublicContractorServiceArea[];
}

export type HomeDocumentType = 'warranty' | 'manual' | 'inspection' | 'insurance' | 'permit' | 'receipt' | 'other';
export type HomeDocumentUploadSource =
  | 'legacy'
  | 'manual_documents_tab'
  | 'home_history_receipt'
  | 'estimate_filing'
  | 'contractor_report'
  | 'profile_photo'
  | 'home_photo'
  | 'app_generated';

export type FindingStatus = 'Pass' | 'Monitor' | 'Fixed On Site' | 'Needs Repair' | 'Urgent';

export interface InspectionRoomFinding {
  source_key?: string;
  source_type?: string;
  source_room_id?: string;
  source_finding_id?: string;
  title: string;
  status: FindingStatus;
  notes: string;
  action: string;
  due: string;
  photos: string[];
}

export interface RoomIdentityFields {
  room_id?: string;
  display_name?: string;
  room_type?: string;
  location_note?: string;
  reference_photo_storage_path?: string;
  sort_order?: number;
  last_edited_by?: string;
  last_edited_at?: string;
}

export interface InspectionRoomData extends RoomIdentityFields {
  room: string;
  findings: InspectionRoomFinding[];
}

export interface InspectionTemplateRoom extends RoomIdentityFields {
  room: string;
  items: string[];
}

export interface InspectionTemplate {
  id: string;
  contractor_id: string;
  name: string;
  rooms: InspectionTemplateRoom[];
  scope?: 'contractor' | 'home';
  homeowner_user_id?: string | null;
  home_id?: string | null;
  local_contact_id?: string | null;
  local_home_id?: string | null;
  source_inspection_id?: string | null;
  is_default_for_home?: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ContractorLocalHome {
  id: string;
  contractor_id: string;
  local_contact_id: string;
  home_id?: string | null;
  claimed_at?: string | null;
  nickname: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  home_type: string;
  year_built: string;
  square_feet: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ContractorLocalContact {
  id: string;
  contractor_id: string;
  homeowner_user_id?: string | null;
  display_name: string;
  phone: string;
  email: string;
  notes: string;
  claimed_at?: string | null;
  created_at: string;
  updated_at: string;
  homes?: ContractorLocalHome[];
}

export type LocalCustomerClaimInviteStatus = 'pending' | 'claimed' | 'declined' | 'expired' | 'revoked';

export interface LocalCustomerClaimInvite {
  id: string;
  contractor_id: string;
  local_contact_id: string;
  local_home_id: string | null;
  invite_token: string;
  invited_email: string | null;
  invited_phone: string | null;
  status: LocalCustomerClaimInviteStatus;
  created_by: string;
  claimed_by_homeowner_user_id: string | null;
  claimed_home_id: string | null;
  connection_id: string | null;
  expires_at: string;
  used_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Inspection {
  id: string;
  contractor_id: string;
  homeowner_user_id: string | null;
  home_id?: string | null;
  local_contact_id: string | null;
  local_home_id: string | null;
  service_request_id: string | null;
  template_id: string | null;
  name: string;
  summary: string;
  status: 'draft' | 'finalized';
  job_type?: string;
  job_status?: JobLifecycleStatus;
  estimate_id?: string | null;
  completed_at?: string | null;
  closed_at?: string | null;
  rooms_with_findings: InspectionRoomData[];
  report_storage_path: string | null;
  report_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export type Job = Inspection;

export interface ContractorVisitEvent {
  id: string;
  contractor_id: string;
  inspection_id: string;
  service_request_id: string | null;
  homeowner_user_id: string | null;
  local_contact_id: string | null;
  scheduled_at: string;
  notes: string;
  share_with_homeowner: boolean;
  status: ContractorVisitEventStatus;
  homeowner_response_status: ContractorVisitHomeownerResponseStatus;
  inspection?: Inspection | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventDraft {
  title: string;
  event_type: CalendarEventType;
  starts_at: string;        // datetime-local input value
  duration_minutes: string; // form string; '' = unset
  notes: string;
  local_contact_id: string; // '' = none
  recurrence_frequency: CalendarEventRecurrenceFrequency;
  recurrence_ends_at: string; // date input value; '' = no end date
}

// Standalone contractor calendar event — not tied to a job/inspection.
export interface ContractorCalendarEvent {
  id: string;
  contractor_id: string;
  created_by: string | null;
  title: string;
  event_type: CalendarEventType;
  starts_at: string;
  duration_minutes: number | null;
  notes: string;
  local_contact_id: string | null;
  homeowner_user_id: string | null;
  recurrence_rule: string | null;
  recurrence_frequency: CalendarEventRecurrenceFrequency | null;
  recurrence_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorCalendarEventJobLink {
  id: string;
  contractor_id: string;
  calendar_event_id: string;
  occurrence_starts_at: string;
  inspection_id: string;
  visit_event_id: string | null;
  created_by: string | null;
  created_at: string;
  inspection?: Inspection | null;
}

export interface ContractorCalendarEventOccurrenceExclusion {
  id: string;
  contractor_id: string;
  calendar_event_id: string;
  occurrence_starts_at: string;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface HomeDocument {
  id: string;
  homeowner_user_id: string;
  home_id?: string | null;
  home_room_id: string | null;
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size_bytes: number | null;
  document_type: HomeDocumentType;
  upload_source?: HomeDocumentUploadSource | string;
  notes: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  request_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  support_inquiry_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface SupportAttachment {
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size_bytes: number | null;
}

export interface SupportInquiryMessage {
  id: string;
  inquiry_id: string;
  actor_user_id: string | null;
  actor_role: UserRole;
  message_type: 'user_message' | 'admin_reply' | 'status_update';
  body: string;
  attachments?: SupportAttachment[];
  created_at: string;
}

export interface SupportInquiry {
  id: string;
  requester_user_id: string;
  requester_role: 'homeowner' | 'contractor';
  status: SupportInquiryStatus;
  category: SupportInquiryCategory;
  title: string;
  last_admin_reply_at: string | null;
  last_user_reply_at: string | null;
  created_at: string;
  updated_at: string;
  messages?: SupportInquiryMessage[];
}

export interface ServiceRequestMedia {
  id: string;
  message_id: string | null;
  storage_path: string;
  file_name: string;
  content_type: string;
  created_at: string;
}

export interface AdminPlatformHealth {
  total_homeowners: number;
  total_contractors: number;
  active_contractors: number;
  total_connections: number;
  active_connections: number;
  total_service_requests: number;
  closed_service_requests: number;
  declined_service_requests: number;
  total_reviews: number;
  platform_avg_rating: number | null;
  total_posts: number;
  estimated_mrr_cents: number;
}

export interface AdminRevenueRow {
  subscription_status: string;
  account_status: string;
  contractor_count: number;
  total_monthly_cents: number;
}

export interface AdminContractorBillingReadinessRow {
  contractor_id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  trade_category: string;
  service_area: string;
  account_status: string;
  legacy_subscription_status: string;
  legacy_monthly_price_cents: number;
  billing_status: string;
  access_mode: string;
  current_plan: string;
  beta_cohort: string | null;
  beta_started_at: string | null;
  founder_discount_eligible: boolean;
  subscription_required_after: string | null;
  grace_period_ends_at: string | null;
  monthly_price_cents: number;
  has_stripe_customer_id: boolean;
  has_stripe_subscription_id: boolean;
  can_create_estimates: boolean;
  can_create_jobs: boolean;
  can_create_invoices: boolean;
  can_use_ai_features: boolean;
  can_invite_team_members: boolean;
  max_team_seats: number;
  max_storage_mb: number;
}

export interface AdminGrowthRow {
  month: string;
  new_homeowners: number;
  new_contractors: number;
  new_connections: number;
  new_service_requests: number;
}

export interface AdminContractorActivityRow {
  contractor_id: string;
  business_name: string;
  account_status: string;
  subscription_status: string;
  monthly_price_cents: number;
  connection_count: number;
  request_count: number;
  closed_request_count: number;
  review_count: number;
  avg_rating: number | null;
  post_count: number;
  joined_at: string;
}

export interface ServiceRequestSummary {
  id: string;
  connection_id: string;
  contractor_id: string;
  contractor_name: string;
  homeowner_user_id: string;
  homeowner_name: string;
  homeowner_city: string;
  home_id: string | null;
  home_label: string;
  home_address: string;
  category: string;
  title: string;
  description: string;
  urgency: ServiceRequestUrgency;
  status: ServiceRequestStatus;
  closing_summary: string;
  messages: ServiceRequestMessage[];
  media: ServiceRequestMedia[];
  quote: ServiceRequestQuote | null;
  appointment: ServiceRequestAppointment | null;
  appointment_windows?: ServiceRequestAppointmentWindow[];
  review: ServiceRequestReview | null;
  review_eligible?: boolean;
  created_at: string;
  updated_at: string;
}
