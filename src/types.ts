export type UserRole = 'homeowner' | 'contractor' | 'platform_admin';

export type ConnectionStatus = 'pending' | 'active' | 'declined' | 'revoked' | 'dismissed';
export type ContractorAccountStatus = 'active' | 'inactive' | 'paused';
export type ContractorSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'unpaid';
export type InviteStatus = 'active' | 'used' | 'revoked' | 'expired';
export type ReferralRewardStatus = 'not_eligible' | 'pending_review' | 'approved' | 'denied' | 'paid';
export type ExternalReviewSource = 'google' | 'facebook' | 'yelp' | 'other';
export type ServiceRequestStatus = 'open' | 'contractor_responded' | 'homeowner_replied' | 'declined' | 'closed';
export type ServiceRequestUrgency = 'low' | 'normal' | 'urgent';
export type QuoteStatus = 'pending' | 'accepted' | 'declined';
export type AppointmentStatus = 'proposed' | 'confirmed' | 'completed' | 'cancelled';
export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'revised';
export type EstimateLineType = 'labor' | 'material' | 'equipment' | 'fee' | 'other';
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'partially_paid' | 'void' | 'overdue';
export type JobLifecycleStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'closed' | 'cancelled';
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
  proposed_at: string;
  notes: string;
  status: AppointmentStatus;
  proposed_by: 'contractor' | 'homeowner';
  created_at: string;
  updated_at: string;
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
  line_type: EstimateLineType;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
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
  title: string;
  scope: string;
  notes: string;
  terms: string;
  status: EstimateStatus;
  subtotal_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
  line_items?: EstimateLineItem[];
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  line_type: EstimateLineType;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
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
  invoice_number: string;
  title: string;
  scope: string;
  notes: string;
  terms: string;
  status: InvoiceStatus;
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[];
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
  discount_cents: number;
  line_items: Array<{
    line_type: EstimateLineType;
    description: string;
    quantity: string;
    unit: string;
    unit_price: string;
  }>;
}

export interface EstimateTemplateLineItem {
  line_type: EstimateLineType;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
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
  subscription_notes: string;
  admin_notes: string;
  permanent_invite_code: string | null;
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
  created_at: string;
  updated_at: string;
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
  home: {
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
  } | null;
  created_at: string;
  updated_at: string;
  source: string;
}

export interface ContractorConnectionRequest {
  id: string;
  homeowner_user_id: string;
  contractor_id: string;
  invite_id: string | null;
  status: ConnectionStatus;
  source: string;
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
  service_request_id: string | null;
  estimate_id: string | null;
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
}

export type HomeDocumentType = 'warranty' | 'manual' | 'inspection' | 'insurance' | 'permit' | 'receipt' | 'other';

export type FindingStatus = 'Pass' | 'Monitor' | 'Fixed On Site' | 'Needs Repair' | 'Urgent';

export interface InspectionRoomFinding {
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
  display_name: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string;
  updated_at: string;
  homes?: ContractorLocalHome[];
}

export interface Inspection {
  id: string;
  contractor_id: string;
  homeowner_user_id: string | null;
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

export interface HomeDocument {
  id: string;
  homeowner_user_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size_bytes: number | null;
  document_type: HomeDocumentType;
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
  review: ServiceRequestReview | null;
  created_at: string;
  updated_at: string;
}
