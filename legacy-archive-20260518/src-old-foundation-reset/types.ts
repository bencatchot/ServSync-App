export type ServicePlan = 'Monthly $85/mo' | 'Quarterly $240' | 'Biannually $450' | 'Custom Plan' | 'No active plan';

export type RoofType = 'Asphalt Shingles' | 'Metal' | 'Tile' | 'Flat/TPO' | 'Slate' | 'Wood Shake' | 'Other';
export type HvacType = 'Central Air/Gas Heat' | 'Heat Pump' | 'Mini-Split' | 'Window Units' | 'Radiant' | 'Other';

export type VendorType = 'HVAC' | 'Pest Control' | 'Landscape/Lawn' | 'Electrician' | 'Plumber' | 'Roofing' | 'Painter' | 'Appliance Repair' | 'Security/Alarm' | 'Locksmith' | 'Cleaning Service' | 'Pressure Washing' | 'Pool Service' | 'Other';

export type FindingStatus = 'Pass' | 'Monitor' | 'Fixed On Site' | 'Needs Repair' | 'Urgent';
export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
export type QuoteStatus = 'Not Sent' | 'Ready to Quote' | 'Needs Approval' | 'Approved' | 'Declined' | 'Included in Plan';

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';

export interface InvoiceLineItem {
  id: string;
  description: string;
  category: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface ReportSnapshotFinding {
  id: string;
  title: string;
  status: FindingStatus;
  description: string;
  action: string;
  due: string;
  photoUrls: string[];
}

export interface ReportSnapshotRoom {
  name: string;
  findings: ReportSnapshotFinding[];
  passed: ReportSnapshotFinding[];
  roomPhotoUrls: string[];
}

export interface ReportSnapshot {
  customerName: string;
  address: string;
  owner: string;
  plan: ServicePlan;
  createdAt: string;
  rooms: ReportSnapshotRoom[];
}

export interface ReportLog {
  id: string;
  customerId?: string;
  createdAt: string;
  title: string;
  issueCount: number;
  urgentCount: number;
  passCount: number;
  roomCount: number;
  photoCount: number;
  notes: string;
  snapshot?: ReportSnapshot;
  pdfUrl?: string;
  pdfPath?: string;
  fileName?: string;
  isPublished?: boolean;
}


export type MaintenanceScheduleStatus = 'Due' | 'Upcoming' | 'Completed' | 'Skipped';
export type MaintenanceScheduleSource = 'Inspection Follow-up' | 'Fixed On Site Recheck' | 'Seasonal Recommendation' | 'Manual';
export type MaintenanceCadenceType = 'visit' | 'calendar' | 'both';

export interface MaintenanceScheduleItem {
  id: string;
  customerId?: string;
  title: string;
  room: string;
  source: MaintenanceScheduleSource;
  priority: Priority;
  cadenceType: MaintenanceCadenceType;
  frequency: string;
  nextDueDate: string;
  nextDueVisit: string;
  status: MaintenanceScheduleStatus;
  notes: string;
  createdFromFindingId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  date: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  taxRate: number;
  notes: string;
  status: InvoiceStatus;
  qbInvoiceId?: string;
}

export interface QBSettings {
  connected: boolean;
  accountName: string;
  lastSync: string;
}

export interface HomeDetails {
  sqft: string;
  yearBuilt: string;
  stories: string;
  garage: string;
  pool: boolean;
  roofType: RoofType;
  roofAge: string;
  hvacType: HvacType;
  hvacAge: string;
  notes: string;
}

export interface Vendor {
  id: string;
  type: VendorType;
  company: string;
  phone: string;
  account: string;
  notes: string;
}

export interface Finding {
  id: string;
  itemKey: string;
  title: string;
  room: string;
  status: FindingStatus;
  priority: Priority;
  description: string;
  action: string;
  due: string;
  quoteStatus: QuoteStatus;
}

export interface Photo {
  id: string;
  url: string;
  caption: string;
}


export type AppointmentStatus = 'Recommended' | 'Confirmed' | 'Customer Requested' | 'Cancelled' | 'Completed';
export type VisitType = 'Inspection' | 'Follow-up' | 'Urgent' | 'Seasonal' | 'Blocked' | 'Other';
export type TimeWindow = 'Morning' | 'Midday' | 'Afternoon' | 'Custom';

export interface Appointment {
  id: string;
  customerId?: string;
  title: string;
  status: AppointmentStatus;
  visitType: VisitType;
  recommendedDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  timeWindow: TimeWindow;
  internalNotes: string;
  customerNotes: string;
  customerRequestedStart?: string;
  customerRequestNotes: string;
  source: string;
  sourceScheduleItemId?: string;
  customerVisible: boolean;
  emailNotificationStatus: string;
  smsNotificationStatus: string;
  lastNotificationSentAt?: string;
  googleCalendarEventId?: string;
  outlookCalendarEventId?: string;
  icsUid: string;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  owner: string;
  phone: string;
  email: string;
  plan: ServicePlan;
  home: HomeDetails;
  vendors: Vendor[];
  rooms: string[];
  checklist: Record<string, string[]>;
  findings: Record<string, Finding[]>;
  photos: Record<string, Photo[]>;
  requests: ServiceRequest[];
  invoices: Invoice[];
  reportLogs: ReportLog[];
  maintenanceSchedule: MaintenanceScheduleItem[];
  appointments: Appointment[];
  isActive: boolean;
  qbCustomerId?: string;
  lastVisit?: string;
}

export type UserRole = 'admin' | 'customer' | 'contractor' | 'platform_admin';

export interface AppProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  propertyId: string | null;
  activeOrganizationId?: string | null;
}

export type ContractorAccountStatus = 'active' | 'inactive' | 'paused' | 'deleted';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

export interface ContractorOrganization {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  logoUrl?: string | null;
  brandColor: string;
  timezone: string;
  planName: string;
  monthlyPriceCents: number;
  accountStatus: ContractorAccountStatus;
  subscriptionStatus: SubscriptionStatus;
  serviceCategories: string[];
  serviceZipCodes: string[];
  serviceRadiusMiles: number;
  licenseNumber: string;
  businessLicenseNumber: string;
  insured: boolean;
  bonded: boolean;
  yearsInBusiness: string;
  googleReviewsUrl: string;
  testimonialsUrl: string;
  publicBio: string;
  createdAt: string;
  updatedAt: string;
}

export type Page = 'dashboard' | 'customers' | 'connected' | 'checklist' | 'inspection' | 'report' | 'tracker' | 'calendar' | 'settings';

export type RequestCategory = 'HVAC' | 'Plumbing' | 'Electrical' | 'Appliance' | 'Exterior' | 'Interior' | 'Pest/Landscaping' | 'Other';
export type RequestPriority = 'Low' | 'Medium' | 'Urgent';
export type RequestStatus = 'Pending' | 'Scheduled' | 'In Progress' | 'Completed';

export interface ServiceRequest {
  id: string;
  customerId?: string;
  customerName: string;
  category: RequestCategory;
  room: string;
  description: string;
  priority: RequestPriority;
  photoUrl?: string;
  status: RequestStatus;
  contractorNotes: string;
  submittedAt: string;
  read: boolean;
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  customerId?: string;
}
