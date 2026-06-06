import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  Calendar,
  Camera,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  CreditCard,
  Download,
  FileText,
  FolderOpen,
  Home,
  KeyRound,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Receipt,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';
import { supabase, supabaseConfigured } from './supabaseClient';
import type {
  AdminContractorActivityRow,
  AdminGrowthRow,
  AdminPlatformHealth,
  AdminRevenueRow,
  AppNotification,
  ConnectionAuditEvent,
  ContractorPublicProfile,
  DiscoverFeedItem,
  Estimate,
  EstimateLineType,
  EstimateTemplate,
  EstimateTemplateLineItem,
  FindingStatus,
  Inspection,
  InspectionRoomFinding,
  InspectionRoomData,
  InspectionTemplate,
  InspectionTemplateRoom,
  MaintenanceLogEntry,
  PublicReview,
  ConnectionStatus,
  ContractorConnectedHomeowner,
  ContractorAccountStatus,
  ContractorConnectionRequest,
  ContractorLocalContact,
  ContractorLocalHome,
  ContractorProfile,
  ContractorSubscriptionStatus,
  ContractorInvite,
  HomeProfile,
  HomeownerConnection,
  HomeownerProfile,
  PlatformOverview,
  PlatformConnectionOverview,
  Profile,
  SharingPermissions,
  SupportInquiry,
  SupportInquiryCategory,
  SupportInquiryStatus,
  UserRole,
  ReferralRewardStatus,
  AppointmentStatus,
  HomeDocument,
  HomeDocumentType,
  QuoteStatus,
  ServiceRequestAppointment,
  ServiceRequestMedia,
  ServiceRequestQuote,
  ServiceRequestStatus,
  ServiceRequestSummary,
  ServiceRequestUrgency,
} from './types';

type RouteName = 'home' | 'homeowner' | 'contractor' | 'admin' | 'profile';
type HomeownerRequestView = 'attention' | 'new' | 'scheduled' | 'closed' | 'declined';
type ContractorRequestView = 'overview' | 'new' | 'open' | 'scheduled' | 'closed' | 'declined';
type HomeownerWorkspaceRequestView = 'attention' | 'active' | 'closed';
type HomeownerWorkspaceEstimateView = 'draft' | 'sent' | 'accepted' | 'closed';
type AdminContractorDraft = {
  account_status: ContractorAccountStatus;
  subscription_status: ContractorSubscriptionStatus;
  monthly_price: string;
  subscription_notes: string;
  admin_notes: string;
};
type InviteRewardDraft = {
  reward_status: ReferralRewardStatus;
  reward_notes: string;
};
type WalkthroughSuggestion = {
  id: string;
  rawText: string;
  detectedRoom: string | null;
  detectedItem: string | null;
  newChecklistItem?: string;
  needsNewChecklistItem?: boolean;
  suggestedStatus: FindingStatus;
  notes: string;
  suggestedAction?: string;
  due?: string;
  accepted: boolean | null;
};
type EstimatePricingType = 'Needs site visit' | 'Diagnostic' | 'Labor only' | 'Labor + materials' | 'Custom';
type RepairEstimateLineDraft = {
  id: string;
  sourceKey: string;
  issue: string;
  description: string;
  trade: string;
  pricingType: EstimatePricingType;
  lowEstimate: string;
  highEstimate: string;
  notes: string;
};
type HomeownerServiceRequestDraft = {
  connection_id: string;
  category: string;
  urgency: ServiceRequestUrgency;
  title: string;
  description: string;
};
type FieldWorkflowKind = 'inspection' | 'work_order' | 'maintenance' | 'assessment';
type ServSyncFieldWorkTemplate = {
  id: string;
  name: string;
  kind: FieldWorkflowKind;
  trade: string;
  description: string;
  rooms: InspectionTemplateRoom[];
};
type StarterEstimateTemplate = {
  id: string;
  name: string;
  trade: string;
  scope: string;
  notes: string;
  terms: string;
  line_items: EstimateTemplateLineItem[];
};
type HomeownerTab = 'overview' | 'home' | 'contractors' | 'requests' | 'calendar' | 'estimates' | 'log' | 'documents' | 'discover' | 'support';
type ContractorTab = 'overview' | 'profile' | 'connections' | 'requests' | 'calendar' | 'invites' | 'discover' | 'inspections' | 'support';
type HomeownerWorkspaceTab = 'overview' | 'profile' | 'home' | 'fieldwork' | 'estimates' | 'requests' | 'schedule';
type InspectionView = 'list' | 'new' | 'detail';
type InspectionSubTab = 'checklist' | 'inspect' | 'report';
type EstimateLineDraft = {
  id: string;
  line_type: EstimateLineType;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
};
type EstimateDraft = {
  title: string;
  scope: string;
  notes: string;
  terms: string;
  service_request_id: string;
  inspection_id: string;
  line_items: EstimateLineDraft[];
};
type StoredFieldWorkDraft = {
  inspectionId: string;
  rooms_with_findings: InspectionRoomData[];
  summary: string;
  savedAt: string;
};
type StoredFieldWorkState = {
  inspectionId?: string | null;
  view?: InspectionView;
  subTab?: InspectionSubTab;
  selectedRoom?: string | null;
  draftSnapshot?: StoredFieldWorkDraft | null;
};

const STORAGE_KEYS = {
  homeownerTab: 'servsync.homeowner.activeTab',
  homeownerRequestView: 'servsync.homeowner.requestView',
  homeownerRequestSearch: 'servsync.homeowner.requestSearch',
  homeownerExpandedRequests: 'servsync.homeowner.expandedRequests',
  contractorTab: 'servsync.contractor.activeTab',
  contractorHomeownerFilter: 'servsync.contractor.homeownerFilter',
  contractorHomeownerSearch: 'servsync.contractor.homeownerSearch',
  contractorSelectedHomeowner: 'servsync.contractor.selectedHomeowner',
  contractorHomeownerDetailTab: 'servsync.contractor.homeownerDetailTab',
  contractorHomeownerRequestView: 'servsync.contractor.homeownerRequestView',
  fieldWorkState: 'servsync.contractor.fieldWorkState',
};

function createEstimateLineDraft(overrides: Partial<EstimateLineDraft> = {}): EstimateLineDraft {
  return {
    id: crypto.randomUUID(),
    line_type: 'labor',
    description: '',
    quantity: '1',
    unit: 'each',
    unit_price: '',
    ...overrides,
  };
}

function createBlankEstimateDraft(overrides: Partial<EstimateDraft> = {}): EstimateDraft {
  return {
    title: '',
    scope: '',
    notes: '',
    terms: 'Estimate is valid for 30 days unless otherwise noted. Final pricing may change if site conditions or requested scope changes.',
    service_request_id: '',
    inspection_id: '',
    line_items: [createEstimateLineDraft()],
    ...overrides,
  };
}

function inferSmartEstimateLineType(text: string): EstimateLineType {
  const normalized = normalizeText(text);
  if (/\b(trip|service call|diagnostic|permit|fee)\b/.test(normalized)) return 'fee';
  if (/\b(material|materials|parts|supplies|fixture|filter|valve|fitting|faucet|fan|outlet|cabinet|drywall|sheetrock)\b/.test(normalized)) return 'material';
  if (/\b(equipment|machine|rental|lift|pump|tool)\b/.test(normalized)) return 'equipment';
  if (/\b(labor|repair|replace|install|remove|tighten|seal|patch|paint|inspect|service|clean)\b/.test(normalized)) return 'labor';
  return 'other';
}

function extractSmartEstimateQuantity(text: string) {
  const quantityMatch =
    text.match(/\b(?:qty|quantity)\s*[:x]?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/\bx\s*(\d+(?:\.\d+)?)/i)
    || text.match(/\b(\d+(?:\.\d+)?)\s+(?:hours?|hrs?|outlets?|fixtures?|filters?|valves?|faucets?|fans?|cabinets?|sheets?|sq\s*ft|sqft|sf)\b/i);
  return quantityMatch?.[1] || '1';
}

function extractSmartEstimateUnit(text: string) {
  const normalized = normalizeText(text);
  if (/\b(hours?|hrs?)\b/.test(normalized)) return 'hour';
  if (/\b(sq ft|sqft|sf)\b/.test(normalized)) return 'sq ft';
  if (/\b(linear ft|lf)\b/.test(normalized)) return 'linear ft';
  return 'each';
}

function extractSmartEstimatePrice(text: string) {
  const priceMatch =
    text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)
    || text.match(/\b(?:at|for|rate|price|cost)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/i)
    || text.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|each|ea|per)\b/i);
  return priceMatch?.[1]?.replace(/,/g, '') || '';
}

function cleanSmartEstimateDescription(text: string) {
  const cleaned = text
    .replace(/\$\s*[\d,]+(?:\.\d{1,2})?/g, '')
    .replace(/\b(?:at|for|rate|price|cost)\s+\$?\s*[\d,]+(?:\.\d{1,2})?/gi, '')
    .replace(/\b[\d,]+(?:\.\d{1,2})?\s*(?:dollars|each|ea|per)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || text.trim();
}

function parseSmartEstimateText(text: string) {
  const cleaned = text.trim();
  const parts = cleaned
    .split(/\n+|;|\.|\b(?:plus|and also)\b/i)
    .map(part => part.trim())
    .filter(Boolean);
  const sourceParts = parts.length ? parts : [cleaned];
  const lines = sourceParts.map(part => createEstimateLineDraft({
    line_type: inferSmartEstimateLineType(part),
    description: cleanSmartEstimateDescription(part),
    quantity: extractSmartEstimateQuantity(part),
    unit: extractSmartEstimateUnit(part),
    unit_price: extractSmartEstimatePrice(part),
  }));

  return {
    scope: cleaned,
    lines,
  };
}

function estimateDraftFromEstimate(estimate: Estimate): EstimateDraft {
  return {
    title: estimate.title,
    scope: estimate.scope,
    notes: estimate.notes,
    terms: estimate.terms,
    service_request_id: estimate.service_request_id || '',
    inspection_id: estimate.inspection_id || '',
    line_items: estimate.line_items?.length
      ? [...estimate.line_items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(line => createEstimateLineDraft({
            id: line.id,
            line_type: line.line_type,
            description: line.description,
            quantity: String(line.quantity),
            unit: line.unit,
            unit_price: centsToDollars(line.unit_price_cents),
          }))
      : [createEstimateLineDraft()],
  };
}

function estimateDraftFromTemplate(template: EstimateTemplate, subjectName: string): EstimateDraft {
  return {
    title: `${template.name} — ${subjectName} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    scope: template.scope,
    notes: template.notes,
    terms: template.terms || createBlankEstimateDraft().terms,
    service_request_id: '',
    inspection_id: '',
    line_items: template.line_items?.length
      ? [...template.line_items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(line => createEstimateLineDraft({
            line_type: line.line_type,
            description: line.description,
            quantity: String(line.quantity),
            unit: line.unit,
            unit_price: centsToDollars(line.unit_price_cents),
          }))
      : [createEstimateLineDraft()],
  };
}

function estimateDraftFromStarterTemplate(template: StarterEstimateTemplate, subjectName: string): EstimateDraft {
  return {
    title: `${template.name} — ${subjectName} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    scope: template.scope,
    notes: template.notes,
    terms: template.terms || createBlankEstimateDraft().terms,
    service_request_id: '',
    inspection_id: '',
    line_items: template.line_items?.length
      ? [...template.line_items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(line => createEstimateLineDraft({
            line_type: line.line_type,
            description: line.description,
            quantity: String(line.quantity),
            unit: line.unit,
            unit_price: line.unit_price_cents ? centsToDollars(line.unit_price_cents) : '',
          }))
      : [createEstimateLineDraft()],
  };
}

function storedTab<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = window.localStorage.getItem(key) as T | null;
  return stored && allowed.includes(stored) ? stored : fallback;
}

function storedStringSet(key: string): Set<string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

const ROLE_LABEL: Record<UserRole, string> = {
  homeowner: 'Homeowner',
  contractor: 'Contractor',
  platform_admin: 'ServSync Admin',
};

const EMPTY_PERMISSIONS: SharingPermissions = {
  share_contact: false,
  share_home_overview: false,
  share_address: false,
  share_preferred_vendors: false,
  share_photos: false,
};

const TRADE_OPTIONS = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'Roofing',
  'Gutters',
  'Concrete',
  'Masonry',
  'Foundation Repair',
  'Framing',
  'Carpentry',
  'Cabinets',
  'Countertops',
  'Flooring',
  'Tile',
  'Drywall',
  'Painting',
  'Siding',
  'Windows',
  'Doors',
  'Garage Doors',
  'Decks',
  'Fencing',
  'Landscaping',
  'Lawn Care',
  'Tree Service',
  'Irrigation',
  'Pest Control',
  'Septic',
  'Well Service',
  'Insulation',
  'Chimney',
  'Appliance Repair',
  'Locksmith',
  'Cleaning Service',
  'Pressure Washing',
  'Pool Service',
  'Moving Service',
  'Handyman',
  'General Maintenance',
];

const US_STATE_OPTIONS = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
  'District of Columbia',
];

const HOME_TYPE_OPTIONS = [
  'Single-family home',
  'Townhome',
  'Condo',
  'Duplex',
  'Mobile home',
  'Modular home',
  'Multi-family property',
  'Vacation home',
  'Rental property',
  'Other',
];

const SUBSCRIPTION_STATUS_OPTIONS: ContractorSubscriptionStatus[] = ['trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid'];
const ACCOUNT_STATUS_OPTIONS: ContractorAccountStatus[] = ['active', 'paused', 'inactive'];
const REFERRAL_REWARD_STATUS_OPTIONS: ReferralRewardStatus[] = ['not_eligible', 'pending_review', 'approved', 'denied', 'paid'];
const SERVICE_REQUEST_URGENCY_OPTIONS: ServiceRequestUrgency[] = ['low', 'normal', 'urgent'];
const SERVICE_REQUEST_CATEGORIES = [...TRADE_OPTIONS, 'Other'];
const KUDOS_OPTIONS = [
  'Great communication',
  'On time',
  'Clean & professional',
  'Fair pricing',
  'Problem solved',
  'Would recommend',
];

const FINDING_STATUSES: FindingStatus[] = ['Pass', 'Monitor', 'Fixed On Site', 'Needs Repair', 'Urgent'];

const FINDING_STATUS_CONFIG: Record<FindingStatus, { color: string; dot: string }> = {
  'Pass':         { color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  'Monitor':      { color: 'bg-blue-50 text-blue-700 border border-blue-200',         dot: 'bg-blue-500' },
  'Fixed On Site':{ color: 'bg-violet-50 text-violet-700 border border-violet-200',   dot: 'bg-violet-500' },
  'Needs Repair': { color: 'bg-amber-50 text-amber-700 border border-amber-200',      dot: 'bg-amber-500' },
  'Urgent':       { color: 'bg-red-50 text-red-700 border border-red-200',            dot: 'bg-red-500' },
};

const LOCAL_DRAFT_RULES: Array<{ keywords: string[]; status: FindingStatus }> = [
  { keywords: ['urgent', 'immediately', 'hazardous', 'dangerous', 'unsafe', 'critical', 'severe', 'failed', 'failure', 'emergency'], status: 'Urgent' },
  { keywords: ['crack', 'cracked', 'broken', 'leak', 'leaking', 'missing', 'damage', 'damaged', 'rot', 'rotting', 'mold', 'mould', 'deteriorated', 'corroded', 'corrosion', 'rust', 'rusted', 'faulty', 'defective', 'inoperable', 'not working', 'repair', 'estimate', 'quote'], status: 'Needs Repair' },
  { keywords: ['monitor', 'watch', 'minor', 'slight', 'beginning', 'early', 'developing', 'potential', 'possible', 'wear', 'aging', 'age'], status: 'Monitor' },
  { keywords: ['fixed', 'repaired', 'replaced', 'corrected', 'resolved', 'addressed', 'adjusted', 'tightened'], status: 'Fixed On Site' },
];

const COMPLETED_WORK_PHRASES = [
  'fixed',
  'repaired',
  'replaced',
  'corrected',
  'resolved',
  'addressed',
  'adjusted',
  'tightened',
  'secured',
  'sealed',
  'cleared',
  'cleaned',
  'reset',
  'restored',
  'tested good',
  'tested ok',
  'no longer',
  'stopped leaking',
  'stopped leak',
  'squeak gone',
  'noise gone',
  'rattle gone',
  'weight added',
  'balanced',
  'rebalanced',
];

const UNRESOLVED_WORK_PHRASES = [
  'recommend',
  'recommended',
  'will create',
  'will provide',
  'will send',
  'estimate',
  'quote',
  'not fixed',
  'not repaired',
  'unable to repair',
  'could not repair',
  'still leaking',
  'still leaks',
  'continues to leak',
  'continued leak',
  'needs repair',
  'requires repair',
  'recommend repair',
  'should be repaired',
  'have repaired',
  'to be repaired',
  'repair by',
];

const CLEAR_CONDITION_PHRASES = [
  'no leak',
  'no leaks',
  'no active leak',
  'no active leaks',
  'no longer leaks',
  'no longer leaking',
  'no issue',
  'no issues',
  'operating normally',
  'working properly',
];

const DEFAULT_INSPECTION_ROOMS: InspectionTemplateRoom[] = [
  { room: 'Exterior', items: [
    'Siding — damage, rot, or missing sections',
    'Foundation — visible cracks or settlement',
    'Grading — slopes away from house (min 6" drop in 10\')',
    'Driveway and walkways — cracks or settlement',
    'Fascia and soffit — rot, damage, or paint failure',
    'Caulking — windows, doors, and penetrations',
    'Exterior outlets — GFCI and weatherproof covers',
    'Hose bibs — operation and freeze protection',
    'Exterior lighting — condition and operation',
    'Landscaping — overgrowth within 18" of structure',
  ]},
  { room: 'Roof', items: [
    'Shingles — missing, cracked, curled, or granule loss',
    'Gutters — debris, damage, and proper slope',
    'Downspouts — extend at least 4\' from foundation',
    'Flashing — chimney, skylights, vent pipes, and valleys',
    'Ridge cap — condition and secure',
    'Roof penetrations — sealed with appropriate boot or caulk',
    'Fascia and soffit — visible from roofline',
    'Attic ventilation — ridge and soffit vents clear',
  ]},
  { room: 'Attic', items: [
    'Access hatch — condition and weatherstripped',
    'Insulation — depth and moisture (min R-38 recommended)',
    'Ventilation — ridge, soffit, or gable vents clear',
    'Roof sheathing — water stains, mold, or rot',
    'Rafters and trusses — cracks, repairs, or modifications',
    'Wiring — improper splices, exposed wiring, or knob-and-tube',
    'Attic fan — operation and condition (if present)',
    'Pest or rodent evidence — droppings, nests, chewed wiring',
  ]},
  { room: 'HVAC System', items: [
    'Furnace / heat pump — age, condition, and corrosion',
    'Air filter — check and replace if dirty or restricted',
    'Thermostat — operation in heat and cool mode',
    'Ductwork — leaks, disconnections, or improper flex duct',
    'Supply and return registers — clear and functional',
    'A/C condenser — fins, refrigerant line insulation, clearance',
    'Flue / exhaust pipe — secure, no rust, correct slope',
    'Carbon monoxide detector — present and functional',
    'Condensate drain line — clear and properly terminated',
  ]},
  { room: 'Electrical Panel', items: [
    'Panel labeling — accurate and legible for all circuits',
    'Breakers — condition, no double-tapped or oversized',
    'AFCI breakers — installed in bedrooms and required areas',
    'Main disconnect — accessible and operational',
    'Panel enclosure — no moisture, burning odor, or corrosion',
    'Wiring type — aluminum branch wiring or knob-and-tube noted',
    'Grounding and bonding — proper connections',
    'GFCI protection — verified at required locations',
  ]},
  { room: 'Water Heater', items: [
    'Age — note manufacture year from label',
    'Tank condition — rust, corrosion, or active leaks',
    'Pressure relief valve — present and not corroded',
    'PRV discharge pipe — extends to within 6" of floor or drain',
    'Flue / exhaust — secure, no rust, correct upward slope',
    'Expansion tank — present if closed system required',
    'Supply and outlet connections — condition',
    'Drain valve — present and accessible',
    'Seismic strapping — present if required by local code',
  ]},
  { room: 'Kitchen', items: [
    'Range / oven — burners, oven, and self-clean operation',
    'Range hood / exhaust fan — operation and ducted to exterior',
    'Dishwasher — operation, door seal, and high-loop drain',
    'Refrigerator — door seals and ice maker line (if present)',
    'Microwave — operation and ventilation',
    'Sink — basin condition and drainage speed',
    'Faucet — operation, hot/cold, and no drips',
    'Under-sink plumbing — leaks, moisture, and supply lines',
    'Garbage disposal — operation',
    'GFCI outlets — at all countertop locations',
    'Overhead lighting — fixture and operation',
    'Countertops — cracks and water damage near sink',
    'Cabinets — condition, hinges, and drawer hardware',
    'Flooring — water damage, lifting, or soft spots',
  ]},
  { room: 'Living Room', items: [
    'Walls and ceiling — cracks, stains, or bulging',
    'Windows — operation, seals, and locks',
    'Flooring — condition and wear',
    'Electrical outlets — operation',
    'Fireplace firebox — condition and damper operation (if present)',
    'Hearth — extension and clearance (if present)',
    'Smoke and CO detectors — present and functional',
    'Heat / cooling register — clear and functional',
    'Ceiling light fixture or fan — operation and secure mount',
    'Doors — proper operation and latching',
  ]},
  { room: 'Dining Room', items: [
    'Walls and ceiling — cracks or stains',
    'Windows — operation, seals, and locks',
    'Flooring — condition',
    'Electrical outlets — operation',
    'Overhead light fixture — operation',
    'Heat / cooling register — clear and functional',
    'Doors — proper operation (if applicable)',
  ]},
  { room: 'Master Bedroom', items: [
    'Walls and ceiling — cracks, stains, or bulging',
    'Windows — operation, seals, and locks',
    'Window screens — present and condition',
    'Flooring — damage or soft spots',
    'Closet — structure, doors, and rod / shelf condition',
    'Electrical outlets — operation',
    'Overhead light or ceiling fan — operation and secure mount',
    'Smoke detector — present and functional (within 10\' of sleeping area)',
    'Heat / cooling register — clear and functional',
    'Door — proper operation and lock',
  ]},
  { room: 'Bedroom 1', items: [
    'Walls and ceiling — cracks, stains, or bulging',
    'Windows — operation, seals, and locks',
    'Window screens — present and condition',
    'Flooring — damage or soft spots',
    'Closet — structure, doors, and rod / shelf condition',
    'Electrical outlets — operation',
    'Overhead light or ceiling fan — operation and secure mount',
    'Smoke detector — present and functional (within 10\' of sleeping area)',
    'Heat / cooling register — clear and functional',
    'Door — proper operation and lock',
  ]},
  { room: 'Bedroom 2', items: [
    'Walls and ceiling — cracks, stains, or bulging',
    'Windows — operation, seals, and locks',
    'Window screens — present and condition',
    'Flooring — damage or soft spots',
    'Closet — structure, doors, and rod / shelf condition',
    'Electrical outlets — operation',
    'Overhead light or ceiling fan — operation and secure mount',
    'Smoke detector — present and functional (within 10\' of sleeping area)',
    'Heat / cooling register — clear and functional',
    'Door — proper operation and lock',
  ]},
  { room: 'Master Bathroom', items: [
    'Toilet — flush, fill valve, and no base movement',
    'Toilet — signs of prior leaks at base or supply line',
    'Shower / tub caulking and grout — condition',
    'Shower door or curtain rod — secure and seals',
    'Showerhead — operation and flow',
    'Tub / shower faucet — operation and no drips',
    'Sink faucet — operation and no drips',
    'Sink drain — operation and no slow drain',
    'Under-sink plumbing — leaks, moisture, and supply lines',
    'GFCI outlet — present and functional',
    'Exhaust fan — vented to exterior and operational',
    'Tile and grout — cracks or missing sections',
    'Flooring — soft spots or water damage',
    'Ceiling — staining or mold evidence',
    'Water pressure at fixtures',
    'Lighting — fixture and operation',
  ]},
  { room: 'Bathroom 1', items: [
    'Toilet — flush, fill valve, and no base movement',
    'Toilet — signs of prior leaks at base or supply line',
    'Shower / tub caulking and grout — condition',
    'Shower door or curtain rod — secure and seals',
    'Showerhead — operation and flow',
    'Tub / shower faucet — operation and no drips',
    'Sink faucet — operation and no drips',
    'Sink drain — operation and no slow drain',
    'Under-sink plumbing — leaks, moisture, and supply lines',
    'GFCI outlet — present and functional',
    'Exhaust fan — vented to exterior and operational',
    'Tile and grout — cracks or missing sections',
    'Flooring — soft spots or water damage',
    'Ceiling — staining or mold evidence',
    'Water pressure at fixtures',
    'Lighting — fixture and operation',
  ]},
  { room: 'Laundry Room', items: [
    'Dryer vent — clear, no kinks, and properly terminated outside',
    'Dryer vent material — rigid or semi-rigid metal (not foil)',
    'Washer supply hoses — condition (braided steel preferred)',
    'Washer drain hose — proper standpipe height (30–48")',
    'Washer drain — no slow drain or backup',
    'Floor drain — present and functional (if applicable)',
    '240V dryer outlet or gas shutoff — condition',
    'GFCI outlet — present near water sources',
    'Overhead lighting — operation',
    'Flooring — water damage or soft spots',
  ]},
  { room: 'Basement / Crawlspace', items: [
    'Water intrusion — stains, efflorescence, or active leaks',
    'Structural beams — sags, rot, notches, or sistered repairs',
    'Floor joists — condition and bridging',
    'Sump pump — operation, check valve, and discharge line',
    'Crawlspace vapor barrier — coverage and condition',
    'Crawlspace ventilation — clear (approx 1 sq ft per 150 sq ft)',
    'Floor drain — clear and functional',
    'Pest or rodent evidence',
    'Foundation walls — cracks (note diagonal vs horizontal)',
    'Electrical outlets — GFCI where required',
    'Lighting — operation',
  ]},
  { room: 'Garage', items: [
    'Garage door — auto-reverse safety test',
    'Garage door — balance test (disconnect, lift manually)',
    'Springs and cables — wear, corrosion, or misalignment',
    'Door opener — remote and wall button operation',
    'Floor — cracks, oil stains, or moisture',
    'Walls — cracks or moisture intrusion',
    'Fire-rated door to living space — self-closing and proper rating',
    'Electrical outlets — GFCI at required locations',
    'Lighting — operation',
    'Smoke detector — present and functional',
    'Overhead storage — secure mounting and clearance',
  ]},
];

type TradeStarterTemplateBlueprint = {
  kind: FieldWorkflowKind;
  name: string;
  description: string;
  rooms: InspectionTemplateRoom[];
  estimateScope: string;
  estimateLines: Array<{ line_type: EstimateLineType; description: string; quantity?: number; unit?: string }>;
};

function starterSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function starterEstimateLines(lines: TradeStarterTemplateBlueprint['estimateLines']) {
  return lines.map((line, index) => ({
    line_type: line.line_type,
    description: line.description,
    quantity: line.quantity ?? 1,
    unit: line.unit ?? 'each',
    unit_price_cents: 0,
    sort_order: index,
  }));
}

const STARTER_ESTIMATE_TERMS = 'Starter estimate only. Contractor must verify scope, site conditions, materials, labor, taxes, permits, and pricing before sending to homeowner.';

const TRADE_STARTER_TEMPLATE_BLUEPRINTS: Record<string, TradeStarterTemplateBlueprint> = {
  HVAC: {
    kind: 'inspection',
    name: 'HVAC Service Visit',
    description: 'Seasonal HVAC service workflow covering equipment condition, airflow, safety, and recommendations.',
    rooms: [
      { room: 'Indoor Equipment', items: ['Model, serial number, age, and visible condition documented', 'Air filter size and condition checked', 'Thermostat operation verified', 'Blower operation, vibration, and noise checked', 'Condensate drain and overflow protection checked'] },
      { room: 'Outdoor Equipment', items: ['Condenser coil and fins checked', 'Refrigerant line insulation checked', 'Clearance around unit verified', 'Disconnect and visible wiring checked', 'Unit pad and drainage checked'] },
      { room: 'Recommendations', items: ['Temperature split or performance note recorded', 'Safety concerns documented', 'Repair or maintenance recommendation added', 'Next service interval discussed'] },
    ],
    estimateScope: 'HVAC diagnostic, service, repair, or maintenance estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Diagnostic / service call fee' },
      { line_type: 'labor', description: 'HVAC labor' },
      { line_type: 'material', description: 'Parts, filter, refrigerant, or repair materials' },
      { line_type: 'other', description: 'System testing and homeowner documentation' },
    ],
  },
  Plumbing: {
    kind: 'work_order',
    name: 'Plumbing Service Visit',
    description: 'Plumbing repair workflow for leaks, fixtures, drains, water heaters, and follow-up recommendations.',
    rooms: [
      { room: 'Issue and Diagnosis', items: ['Homeowner concern confirmed', 'Affected fixture, supply, drain, or appliance identified', 'Visible leak, corrosion, clog, or failed part documented', 'Water shutoff location and condition noted'] },
      { room: 'Repair Work', items: ['Repair or replacement completed', 'Parts and materials documented', 'System tested after repair', 'Work area cleaned', 'Before/after photos added'] },
      { room: 'Recommendations', items: ['Preventive recommendation added', 'Follow-up repair or estimate needed', 'Homeowner instructions documented'] },
    ],
    estimateScope: 'Plumbing repair, replacement, or diagnostic estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Service call / diagnostic fee' },
      { line_type: 'labor', description: 'Plumbing labor' },
      { line_type: 'material', description: 'Pipe, fittings, valves, fixture, or repair materials' },
      { line_type: 'other', description: 'Testing, cleanup, and documentation' },
    ],
  },
  Electrical: {
    kind: 'inspection',
    name: 'Electrical Safety Check',
    description: 'Electrical workflow for panels, outlets, fixtures, devices, safety concerns, and homeowner recommendations.',
    rooms: [
      { room: 'Panel and Power', items: ['Panel labeling checked', 'Breaker condition checked for heat, corrosion, or damage', 'Open knockouts or exposed wiring noted', 'Grounding and bonding visible where accessible'] },
      { room: 'Devices and Fixtures', items: ['GFCI protection tested where required', 'Switches, outlets, and fixtures checked', 'Smoke and carbon monoxide detectors noted', 'Exterior outlets and covers checked'] },
      { room: 'Repair Notes', items: ['Homeowner concern documented', 'Repair or diagnostic work completed', 'Permit or follow-up recommendation noted', 'Photos added for homeowner record'] },
    ],
    estimateScope: 'Electrical diagnostic, repair, fixture, outlet, circuit, or panel-related estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Service call / diagnostic fee' },
      { line_type: 'labor', description: 'Electrical labor' },
      { line_type: 'material', description: 'Devices, fixtures, wire, breakers, boxes, or parts' },
      { line_type: 'fee', description: 'Permit or inspection fee if required' },
    ],
  },
  Roofing: {
    kind: 'assessment',
    name: 'Roofing Assessment',
    description: 'Roof inspection and repair assessment for shingles, flashing, penetrations, gutters, and leak concerns.',
    rooms: [
      { room: 'Roof Surface', items: ['Roof type and approximate age documented', 'Shingle or panel condition checked', 'Missing, lifted, cracked, or damaged areas noted', 'Debris, moss, or ponding noted'] },
      { room: 'Details and Drainage', items: ['Flashing at walls, chimney, skylights, and valleys checked', 'Pipe boots and penetrations checked', 'Gutters and downspouts checked', 'Interior leak location connected to roof area if known'] },
      { room: 'Recommendations', items: ['Repair area documented with photos', 'Replacement or maintenance recommendation added', 'Urgency and weather risk noted'] },
    ],
    estimateScope: 'Roof repair, replacement, leak investigation, or maintenance estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Roofing labor' },
      { line_type: 'material', description: 'Shingles, panels, flashing, underlayment, sealant, or fasteners' },
      { line_type: 'equipment', description: 'Access equipment or safety setup' },
      { line_type: 'fee', description: 'Disposal, dump, or permit fee' },
    ],
  },
  Gutters: {
    kind: 'work_order',
    name: 'Gutter Service Visit',
    description: 'Gutter cleaning, repair, replacement, and drainage workflow.',
    rooms: [
      { room: 'Gutter System', items: ['Gutters checked for debris and standing water', 'Slope and attachment checked', 'Leaks at seams or corners noted', 'Downspouts checked for flow and extensions'] },
      { room: 'Service Work', items: ['Cleaning or repair completed', 'Hangers, elbows, guards, or sections documented', 'Drainage away from foundation confirmed', 'Photos added for homeowner record'] },
    ],
    estimateScope: 'Gutter cleaning, repair, guard, downspout, or replacement estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Gutter labor' },
      { line_type: 'material', description: 'Gutter sections, hangers, elbows, downspouts, or guards' },
      { line_type: 'equipment', description: 'Ladder or access setup' },
      { line_type: 'fee', description: 'Debris disposal or haul-off' },
    ],
  },
  Concrete: {
    kind: 'assessment',
    name: 'Concrete Assessment',
    description: 'Concrete repair, flatwork, crack, drainage, and replacement assessment.',
    rooms: [
      { room: 'Existing Concrete', items: ['Area measured or described', 'Cracks, settlement, spalling, or trip hazards documented', 'Drainage and slope reviewed', 'Existing thickness or edge condition noted where visible'] },
      { room: 'Scope Planning', items: ['Demo or prep needs documented', 'Forming, reinforcement, and finish type noted', 'Access and cleanup considerations noted', 'Photos added'] },
    ],
    estimateScope: 'Concrete repair, slab, walkway, driveway, patio, or flatwork estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Concrete labor and prep' },
      { line_type: 'material', description: 'Concrete, reinforcement, forms, base, and finishing materials' },
      { line_type: 'equipment', description: 'Equipment, saw cutting, pump, or rental allowance' },
      { line_type: 'fee', description: 'Demo, haul-off, or disposal fee' },
    ],
  },
  Masonry: {
    kind: 'assessment',
    name: 'Masonry Assessment',
    description: 'Brick, block, stone, mortar, chimney, veneer, and repair workflow.',
    rooms: [
      { room: 'Masonry Condition', items: ['Cracked, loose, bowed, or damaged masonry documented', 'Mortar joints checked for deterioration', 'Water intrusion or staining noted', 'Flashing, weeps, or drainage concerns documented'] },
      { room: 'Repair Scope', items: ['Repair area measured or photographed', 'Material match requirements noted', 'Access, protection, and cleanup needs documented'] },
    ],
    estimateScope: 'Masonry repair, repointing, veneer, chimney, brick, block, or stone estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Masonry labor' },
      { line_type: 'material', description: 'Brick, block, stone, mortar, flashing, or sealant' },
      { line_type: 'equipment', description: 'Scaffold, lift, or access equipment' },
      { line_type: 'fee', description: 'Demo, disposal, or cleanup fee' },
    ],
  },
  'Foundation Repair': {
    kind: 'assessment',
    name: 'Foundation Repair Assessment',
    description: 'Foundation, crawlspace, settlement, moisture, and structural repair assessment.',
    rooms: [
      { room: 'Foundation Condition', items: ['Cracks, settlement, movement, or bowing documented', 'Moisture, efflorescence, or drainage concerns noted', 'Doors, floors, or walls with related movement noted', 'Crawlspace or basement access conditions documented'] },
      { room: 'Repair Planning', items: ['Recommended engineering or specialist review noted if needed', 'Repair method or next diagnostic step documented', 'Photos and location notes added'] },
    ],
    estimateScope: 'Foundation repair, stabilization, drainage, crawlspace, or structural support estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Assessment / diagnostic fee' },
      { line_type: 'labor', description: 'Foundation repair labor' },
      { line_type: 'material', description: 'Piers, jacks, beams, drainage, sealant, or repair materials' },
      { line_type: 'equipment', description: 'Access, excavation, or equipment allowance' },
    ],
  },
  Framing: {
    kind: 'work_order',
    name: 'Framing Work Order',
    description: 'Framing, structural carpentry, rough opening, blocking, and repair workflow.',
    rooms: [
      { room: 'Framing Scope', items: ['Area and dimensions documented', 'Existing framing condition checked', 'Load path or structural concern noted', 'Openings, blocking, or support requirements documented'] },
      { room: 'Work Performed', items: ['Framing repair or installation completed', 'Fasteners and connectors documented', 'Photos added before closing walls', 'Cleanup and next trade notes added'] },
    ],
    estimateScope: 'Framing, rough carpentry, blocking, repair, or structural carpentry estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Framing labor' },
      { line_type: 'material', description: 'Lumber, sheathing, hangers, fasteners, and connectors' },
      { line_type: 'equipment', description: 'Saw, lift, scaffold, or access allowance' },
      { line_type: 'other', description: 'Layout, protection, and cleanup' },
    ],
  },
  Carpentry: {
    kind: 'work_order',
    name: 'Carpentry Work Order',
    description: 'Finish carpentry, trim, repair, shelving, doors, and woodwork workflow.',
    rooms: [
      { room: 'Carpentry Scope', items: ['Work area and dimensions documented', 'Existing trim, door, cabinet, or woodwork condition noted', 'Material species/profile/finish requirements recorded', 'Fit, alignment, or damage concern documented'] },
      { room: 'Work Performed', items: ['Repair or installation completed', 'Caulking, fastening, and finish prep documented', 'Photos added', 'Touch-up or painting follow-up noted'] },
    ],
    estimateScope: 'Carpentry repair, trim, shelving, door, cabinet, or woodwork estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Carpentry labor' },
      { line_type: 'material', description: 'Wood, trim, hardware, fasteners, adhesive, or finish materials' },
      { line_type: 'equipment', description: 'Tooling, setup, or access allowance' },
      { line_type: 'other', description: 'Protection, cleanup, and touch-up coordination' },
    ],
  },
  Cabinets: {
    kind: 'work_order',
    name: 'Cabinet Service Visit',
    description: 'Cabinet repair, adjustment, replacement, hardware, and water-damage workflow.',
    rooms: [
      { room: 'Cabinet Condition', items: ['Doors, drawers, hinges, slides, and hardware checked', 'Water damage, swelling, rot, or delamination documented', 'Alignment and operation tested', 'Material/finish match noted'] },
      { room: 'Repair Scope', items: ['Adjustment, repair, or replacement performed', 'Parts and hardware documented', 'Follow-up cabinet maker or finish work recommendation added', 'Photos added'] },
    ],
    estimateScope: 'Cabinet repair, adjustment, hardware, drawer, door, or replacement estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Cabinet labor' },
      { line_type: 'material', description: 'Hinges, slides, pulls, panels, trim, or cabinet parts' },
      { line_type: 'other', description: 'Finish matching, protection, and cleanup' },
      { line_type: 'fee', description: 'Design, measurement, or specialty fabrication allowance' },
    ],
  },
  Countertops: {
    kind: 'assessment',
    name: 'Countertop Assessment',
    description: 'Countertop measurement, repair, replacement, seams, cutouts, and installation workflow.',
    rooms: [
      { room: 'Countertop Condition', items: ['Surface type and condition documented', 'Cracks, chips, stains, loose seams, or water damage noted', 'Sink, cooktop, and backsplash areas checked', 'Dimensions and cutouts measured'] },
      { room: 'Scope Planning', items: ['Material selection or allowance noted', 'Removal and disposal needs documented', 'Template, fabrication, and install steps noted', 'Photos added'] },
    ],
    estimateScope: 'Countertop repair, replacement, fabrication, cutout, or installation estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Countertop labor / installation' },
      { line_type: 'material', description: 'Countertop material, edge, backsplash, adhesive, or sealant' },
      { line_type: 'fee', description: 'Template, fabrication, sink/cooktop cutout, or disposal fee' },
      { line_type: 'other', description: 'Protection, cleanup, and coordination' },
    ],
  },
  Flooring: {
    kind: 'assessment',
    name: 'Flooring Assessment',
    description: 'Flooring repair/replacement workflow for damage, measurements, substrate, transitions, and finish notes.',
    rooms: [
      { room: 'Flooring Condition', items: ['Floor type and affected area documented', 'Damage, gaps, squeaks, soft spots, or moisture noted', 'Subfloor or substrate concern documented where visible', 'Transitions, baseboards, and door clearances checked'] },
      { room: 'Scope Planning', items: ['Area measured', 'Material selection or allowance noted', 'Furniture move, demo, disposal, and prep needs documented', 'Photos added'] },
    ],
    estimateScope: 'Flooring repair, replacement, installation, prep, or transition estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Flooring labor and prep' },
      { line_type: 'material', description: 'Flooring material, underlayment, adhesive, trim, or transitions' },
      { line_type: 'fee', description: 'Demo, disposal, furniture move, or moisture mitigation fee' },
      { line_type: 'other', description: 'Protection, cleanup, and final walkthrough' },
    ],
  },
  Tile: {
    kind: 'assessment',
    name: 'Tile Assessment',
    description: 'Tile repair/replacement workflow for showers, floors, grout, waterproofing, and substrate concerns.',
    rooms: [
      { room: 'Tile Condition', items: ['Tile area and material documented', 'Cracked, loose, hollow, stained, or missing tile noted', 'Grout and caulk condition checked', 'Waterproofing or moisture concerns documented'] },
      { room: 'Scope Planning', items: ['Repair or replacement area measured', 'Material match or selection noted', 'Demo, substrate, waterproofing, and cleanup needs documented', 'Photos added'] },
    ],
    estimateScope: 'Tile repair, replacement, grout, caulk, waterproofing, or installation estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Tile labor' },
      { line_type: 'material', description: 'Tile, thinset, grout, backer board, membrane, or trim' },
      { line_type: 'fee', description: 'Demo, disposal, waterproofing, or prep fee' },
      { line_type: 'other', description: 'Protection, cleanup, and cure-time notes' },
    ],
  },
  Drywall: {
    kind: 'work_order',
    name: 'Drywall Repair Work Order',
    description: 'Drywall and sheetrock repair workflow for cracks, holes, stains, texture, and paint-ready finish.',
    rooms: [
      { room: 'Drywall Condition', items: ['Damage type and location documented', 'Cause of damage noted when known', 'Moisture or active leak concern checked', 'Texture and finish match requirements documented'] },
      { room: 'Repair Scope', items: ['Patch, tape, mud, texture, or finish completed', 'Dry time and return trip needs noted', 'Paint-ready or painted status documented', 'Photos added'] },
    ],
    estimateScope: 'Drywall/sheetrock repair, patch, texture, finish, or paint-ready estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Drywall labor' },
      { line_type: 'material', description: 'Drywall, tape, mud, screws, texture, or patch materials' },
      { line_type: 'fee', description: 'Protection, sanding containment, or cleanup fee' },
      { line_type: 'other', description: 'Paint touch-up coordination or return trip' },
    ],
  },
  Painting: {
    kind: 'assessment',
    name: 'Painting Assessment',
    description: 'Interior/exterior paint assessment for prep, surfaces, repairs, colors, protection, and finish.',
    rooms: [
      { room: 'Paint Scope', items: ['Areas and surfaces documented', 'Color, sheen, and product preference noted', 'Surface damage, stains, peeling, or repairs documented', 'Access, furniture, masking, and protection needs noted'] },
      { room: 'Prep and Finish', items: ['Cleaning, sanding, caulking, or priming needs documented', 'Number of coats and finish expectations noted', 'Cleanup and final touch-up notes added', 'Photos added'] },
    ],
    estimateScope: 'Interior or exterior painting, prep, primer, repair, and finish estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Painting labor and prep' },
      { line_type: 'material', description: 'Paint, primer, caulk, patch, tape, plastic, and supplies' },
      { line_type: 'equipment', description: 'Ladder, sprayer, scaffold, or access allowance' },
      { line_type: 'other', description: 'Protection, cleanup, and touch-up' },
    ],
  },
  Siding: {
    kind: 'assessment',
    name: 'Siding Assessment',
    description: 'Siding repair/replacement workflow for panels, trim, caulking, flashing, and water intrusion.',
    rooms: [
      { room: 'Siding Condition', items: ['Siding material and affected area documented', 'Cracked, loose, missing, rotted, or damaged areas noted', 'Trim, caulking, flashing, and penetrations checked', 'Water intrusion or pest entry concerns documented'] },
      { room: 'Repair Scope', items: ['Repair area measured or photographed', 'Material match or replacement need noted', 'Access, disposal, and finish needs documented'] },
    ],
    estimateScope: 'Siding repair, replacement, trim, caulking, flashing, or exterior finish estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Siding labor' },
      { line_type: 'material', description: 'Siding, trim, flashing, housewrap, caulk, or fasteners' },
      { line_type: 'equipment', description: 'Ladder, scaffold, or access equipment' },
      { line_type: 'fee', description: 'Disposal, cleanup, or paint/finish coordination' },
    ],
  },
  Windows: {
    kind: 'assessment',
    name: 'Window Service Visit',
    description: 'Window repair/replacement workflow for glass, seals, operation, locks, screens, and flashing.',
    rooms: [
      { room: 'Window Condition', items: ['Window type, size, and location documented', 'Operation, locks, balances, and hardware checked', 'Glass, seal failure, rot, water intrusion, or drafts noted', 'Screen condition documented'] },
      { room: 'Repair Scope', items: ['Repair, adjustment, or replacement need documented', 'Flashing/trim/caulk condition noted', 'Material, glass, or hardware requirements recorded', 'Photos added'] },
    ],
    estimateScope: 'Window repair, glass, screen, hardware, sealing, or replacement estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Window labor' },
      { line_type: 'material', description: 'Window unit, glass, screen, hardware, caulk, trim, or flashing' },
      { line_type: 'fee', description: 'Measurement, disposal, or specialty order fee' },
      { line_type: 'other', description: 'Interior/exterior protection and cleanup' },
    ],
  },
  Doors: {
    kind: 'work_order',
    name: 'Door Service Visit',
    description: 'Door repair/replacement workflow for operation, locks, weatherstripping, frames, and hardware.',
    rooms: [
      { room: 'Door Condition', items: ['Door type and location documented', 'Operation, alignment, latch, hinge, and lock checked', 'Frame, threshold, weatherstrip, and sweep condition noted', 'Rot, damage, draft, or security concern documented'] },
      { room: 'Repair Work', items: ['Adjustment, hardware, weatherstrip, or replacement completed', 'Parts documented', 'Security and operation tested', 'Photos added'] },
    ],
    estimateScope: 'Door repair, replacement, hardware, lockset, weatherstrip, frame, or threshold estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Door labor' },
      { line_type: 'material', description: 'Door, hinges, lockset, closer, weatherstrip, sweep, trim, or threshold' },
      { line_type: 'fee', description: 'Measurement, disposal, or specialty order fee' },
      { line_type: 'other', description: 'Finish, paint, and cleanup coordination' },
    ],
  },
  'Garage Doors': {
    kind: 'work_order',
    name: 'Garage Door Service Visit',
    description: 'Garage door workflow for door operation, opener, sensors, springs, tracks, and safety checks.',
    rooms: [
      { room: 'Door and Opener', items: ['Door type, size, and condition documented', 'Opener, remotes, wall button, and sensors tested', 'Tracks, rollers, hinges, cables, and springs visually checked', 'Balance and auto-reverse safety noted'] },
      { room: 'Repair Work', items: ['Adjustment, lubrication, repair, or replacement completed', 'Parts documented', 'Final operation tested', 'Homeowner safety notes added'] },
    ],
    estimateScope: 'Garage door repair, opener, spring, track, roller, panel, or replacement estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Garage door labor' },
      { line_type: 'material', description: 'Springs, rollers, hinges, cables, opener, panel, sensors, or hardware' },
      { line_type: 'fee', description: 'Service call, disposal, or specialty order fee' },
      { line_type: 'other', description: 'Safety testing and homeowner instruction' },
    ],
  },
  Decks: {
    kind: 'assessment',
    name: 'Deck Assessment',
    description: 'Deck inspection/repair workflow for structure, boards, railing, stairs, ledger, and finish.',
    rooms: [
      { room: 'Deck Condition', items: ['Deck size and material documented', 'Ledger, posts, beams, joists, and connectors checked where visible', 'Decking boards, fasteners, rot, and movement noted', 'Railings, stairs, and handrails checked'] },
      { room: 'Repair Scope', items: ['Safety concerns and urgency documented', 'Repair/replacement area measured', 'Finish, stain, or seal needs noted', 'Photos added'] },
    ],
    estimateScope: 'Deck repair, board replacement, railing, stairs, structural repair, or refinishing estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Deck labor' },
      { line_type: 'material', description: 'Deck boards, framing lumber, fasteners, connectors, railing, or stain' },
      { line_type: 'equipment', description: 'Access, saw, scaffold, or equipment allowance' },
      { line_type: 'fee', description: 'Demo, disposal, or cleanup fee' },
    ],
  },
  Fencing: {
    kind: 'assessment',
    name: 'Fence Assessment',
    description: 'Fence repair/replacement workflow for posts, panels, gates, hardware, and layout.',
    rooms: [
      { room: 'Fence Condition', items: ['Fence type, length, and affected area documented', 'Posts, rails, panels, pickets, gates, and hardware checked', 'Leaning, rot, storm damage, or alignment concerns noted', 'Property line or access notes recorded'] },
      { room: 'Repair Scope', items: ['Repair/replacement area measured', 'Material match or style preference noted', 'Gate operation and latch needs documented', 'Photos added'] },
    ],
    estimateScope: 'Fence repair, replacement, gate, post, panel, or hardware estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Fence labor' },
      { line_type: 'material', description: 'Posts, panels, rails, pickets, concrete, hardware, or gate materials' },
      { line_type: 'equipment', description: 'Post hole, auger, or equipment allowance' },
      { line_type: 'fee', description: 'Demo, disposal, or haul-off fee' },
    ],
  },
  Landscaping: {
    kind: 'assessment',
    name: 'Landscaping Assessment',
    description: 'Landscape project workflow for beds, plants, grading, drainage, mulch, and hardscape coordination.',
    rooms: [
      { room: 'Landscape Scope', items: ['Area and homeowner goals documented', 'Existing plants, beds, drainage, grading, and access checked', 'Sun/shade, irrigation, and maintenance needs noted', 'Plant/material preferences documented'] },
      { room: 'Work Plan', items: ['Prep, removal, install, and cleanup scope documented', 'Materials and quantities estimated', 'Follow-up watering or maintenance notes added', 'Photos added'] },
    ],
    estimateScope: 'Landscape cleanup, planting, bed install, grading, drainage, mulch, or hardscape support estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Landscaping labor' },
      { line_type: 'material', description: 'Plants, soil, mulch, stone, edging, fabric, or amendments' },
      { line_type: 'equipment', description: 'Equipment or delivery allowance' },
      { line_type: 'fee', description: 'Debris removal or disposal fee' },
    ],
  },
  'Lawn Care': {
    kind: 'maintenance',
    name: 'Lawn Care Visit',
    description: 'Lawn care workflow for mowing, edging, trimming, cleanup, turf condition, and recommendations.',
    rooms: [
      { room: 'Lawn Condition', items: ['Turf condition, weeds, bare spots, or disease concerns noted', 'Obstacles, irrigation heads, and access reviewed', 'Mowing height or service preference documented'] },
      { room: 'Service Work', items: ['Mowing, edging, trimming, and blowing completed', 'Clippings/debris handled as agreed', 'Fertilizer, weed, or follow-up recommendation added'] },
    ],
    estimateScope: 'Lawn mowing, trimming, cleanup, fertilizer, weed control, or recurring service estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Lawn care labor' },
      { line_type: 'material', description: 'Fertilizer, seed, weed treatment, or supplies' },
      { line_type: 'equipment', description: 'Equipment/service route allowance' },
      { line_type: 'fee', description: 'Debris bagging, haul-off, or recurring service setup' },
    ],
  },
  'Tree Service': {
    kind: 'assessment',
    name: 'Tree Service Assessment',
    description: 'Tree trimming/removal assessment for condition, hazards, access, cleanup, and disposal.',
    rooms: [
      { room: 'Tree Condition', items: ['Tree species/location and approximate size documented', 'Dead limbs, lean, disease, storm damage, or hazard concerns noted', 'Power lines, structures, fences, and access constraints documented'] },
      { room: 'Work Scope', items: ['Trim, removal, stump, or cleanup scope noted', 'Equipment and safety setup needs documented', 'Disposal and site cleanup expectations documented', 'Photos added'] },
    ],
    estimateScope: 'Tree trimming, removal, stump grinding, storm cleanup, or haul-off estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Tree service labor' },
      { line_type: 'equipment', description: 'Bucket truck, lift, chipper, stump grinder, or rigging allowance' },
      { line_type: 'fee', description: 'Debris hauling, disposal, or dump fee' },
      { line_type: 'other', description: 'Site protection and cleanup' },
    ],
  },
  Irrigation: {
    kind: 'work_order',
    name: 'Irrigation Service Visit',
    description: 'Irrigation inspection/repair workflow for zones, heads, valves, leaks, controller, and coverage.',
    rooms: [
      { room: 'System Check', items: ['Controller program and schedule reviewed', 'Zones operated and coverage checked', 'Heads, nozzles, valves, and leaks documented', 'Pressure, runoff, or overspray concerns noted'] },
      { room: 'Repair Work', items: ['Repairs or adjustments completed', 'Parts documented', 'Final zone test completed', 'Seasonal recommendation added'] },
    ],
    estimateScope: 'Irrigation repair, head replacement, valve, controller, leak, or zone adjustment estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Irrigation labor' },
      { line_type: 'material', description: 'Heads, nozzles, valves, pipe, fittings, wire, or controller parts' },
      { line_type: 'equipment', description: 'Locating, trenching, or equipment allowance' },
      { line_type: 'other', description: 'System testing and homeowner instructions' },
    ],
  },
  'Pest Control': {
    kind: 'maintenance',
    name: 'Pest Control Visit',
    description: 'Pest inspection/service workflow for activity, entry points, treatment, exclusion, and follow-up.',
    rooms: [
      { room: 'Inspection', items: ['Pest type or concern documented', 'Activity, droppings, nests, damage, or entry points noted', 'Moisture, food source, or vegetation concerns documented'] },
      { room: 'Service Work', items: ['Treatment or exclusion performed', 'Materials/products documented as appropriate', 'Homeowner prevention notes added', 'Follow-up timing noted'] },
    ],
    estimateScope: 'Pest inspection, treatment, exclusion, recurring service, or follow-up estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Inspection / initial service fee' },
      { line_type: 'labor', description: 'Pest control labor' },
      { line_type: 'material', description: 'Treatment materials, traps, bait stations, sealants, or exclusion supplies' },
      { line_type: 'other', description: 'Follow-up or recurring service setup' },
    ],
  },
  Septic: {
    kind: 'assessment',
    name: 'Septic Service Visit',
    description: 'Septic service workflow for tank access, pumping, visible issues, drain field concerns, and recommendations.',
    rooms: [
      { room: 'Septic System', items: ['System location, tank access, and service history documented', 'Visible backups, odors, wet areas, or drain field concerns noted', 'Tank level or pump-out status documented where applicable'] },
      { room: 'Service Work', items: ['Pumping, inspection, or repair performed', 'Access lids and site restored', 'Maintenance recommendation and next service interval noted', 'Photos added if appropriate'] },
    ],
    estimateScope: 'Septic inspection, pump-out, repair, riser, drain field, or service estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Inspection / pump-out fee' },
      { line_type: 'labor', description: 'Septic labor' },
      { line_type: 'material', description: 'Risers, lids, pipe, fittings, or repair materials' },
      { line_type: 'equipment', description: 'Truck, excavation, or equipment allowance' },
    ],
  },
  'Well Service': {
    kind: 'assessment',
    name: 'Well Service Visit',
    description: 'Well system workflow for pump, pressure tank, water flow, filtration, and visible equipment condition.',
    rooms: [
      { room: 'Well Equipment', items: ['Pump, pressure tank, controls, and visible piping checked', 'Pressure readings or water flow concern documented', 'Leaks, corrosion, noise, or cycling concerns noted', 'Filtration/softener equipment noted if present'] },
      { room: 'Service Work', items: ['Diagnostic or repair work completed', 'Parts documented', 'System tested', 'Follow-up recommendation added'] },
    ],
    estimateScope: 'Well pump, pressure tank, controls, filtration, diagnostic, or repair estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Diagnostic / service call fee' },
      { line_type: 'labor', description: 'Well service labor' },
      { line_type: 'material', description: 'Pump, tank, switch, fittings, pipe, filter, or parts' },
      { line_type: 'equipment', description: 'Pulling, testing, or equipment allowance' },
    ],
  },
  Insulation: {
    kind: 'assessment',
    name: 'Insulation Assessment',
    description: 'Insulation and air-sealing assessment for attic, crawlspace, walls, ventilation, and comfort concerns.',
    rooms: [
      { room: 'Insulation Condition', items: ['Area and existing insulation type/depth documented', 'Gaps, compression, moisture, pests, or contamination noted', 'Air leaks, penetrations, and ventilation concerns documented'] },
      { room: 'Scope Planning', items: ['Recommended R-value or improvement noted', 'Removal, air sealing, and install scope documented', 'Access and cleanup needs noted', 'Photos added'] },
    ],
    estimateScope: 'Insulation removal, air sealing, attic/crawlspace insulation, or comfort improvement estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Insulation labor and prep' },
      { line_type: 'material', description: 'Insulation, baffles, foam, caulk, vapor barrier, or air sealing materials' },
      { line_type: 'equipment', description: 'Blower, vacuum, protective setup, or access equipment' },
      { line_type: 'fee', description: 'Removal, disposal, or cleanup fee' },
    ],
  },
  Chimney: {
    kind: 'assessment',
    name: 'Chimney Service Visit',
    description: 'Chimney inspection/service workflow for cap, crown, flashing, masonry, flue, and safety concerns.',
    rooms: [
      { room: 'Chimney Condition', items: ['Cap, crown, flashing, and exterior masonry checked', 'Cracks, loose mortar, staining, or water entry noted', 'Flue, damper, firebox, and visible creosote condition documented'] },
      { room: 'Service Work', items: ['Cleaning, repair, or recommendation documented', 'Safety concerns and next steps noted', 'Photos added'] },
    ],
    estimateScope: 'Chimney cleaning, cap, crown, flashing, masonry, liner, or fireplace repair estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Inspection / cleaning fee' },
      { line_type: 'labor', description: 'Chimney labor' },
      { line_type: 'material', description: 'Cap, crown, flashing, mortar, liner, sealant, or repair materials' },
      { line_type: 'equipment', description: 'Roof access, ladder, scaffold, or safety setup' },
    ],
  },
  'Appliance Repair': {
    kind: 'work_order',
    name: 'Appliance Repair Visit',
    description: 'Appliance diagnostic/repair workflow for symptoms, model information, parts, testing, and homeowner notes.',
    rooms: [
      { room: 'Appliance Diagnosis', items: ['Appliance type, brand, model, and serial documented', 'Homeowner concern and error codes recorded', 'Power/water/gas connection checked as appropriate', 'Visible leak, noise, heat, drainage, or operation issue documented'] },
      { room: 'Repair Work', items: ['Diagnostic result documented', 'Part replacement or repair completed', 'Appliance tested after work', 'Warranty or replacement recommendation noted'] },
    ],
    estimateScope: 'Appliance diagnostic, repair, replacement part, or installation estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Diagnostic / service call fee' },
      { line_type: 'labor', description: 'Appliance repair labor' },
      { line_type: 'material', description: 'Replacement part, hose, valve, sensor, motor, or installation materials' },
      { line_type: 'other', description: 'Testing, cleanup, and homeowner instruction' },
    ],
  },
  Locksmith: {
    kind: 'work_order',
    name: 'Locksmith Service Visit',
    description: 'Locksmith workflow for rekeying, lock repair, hardware replacement, entry, and security notes.',
    rooms: [
      { room: 'Lock and Door Hardware', items: ['Affected door/lock location documented', 'Key, cylinder, latch, strike, hinge, or alignment issue checked', 'Security concern or access issue documented', 'Hardware finish/type preference noted'] },
      { room: 'Service Work', items: ['Rekey, repair, replacement, or access work completed', 'Keys/hardware documented', 'Operation tested', 'Homeowner security recommendation added'] },
    ],
    estimateScope: 'Rekey, lock repair, hardware replacement, lockout, smart lock, or security hardware estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Service call / lockout fee' },
      { line_type: 'labor', description: 'Locksmith labor' },
      { line_type: 'material', description: 'Cylinders, keys, locks, deadbolts, smart lock, or hardware' },
      { line_type: 'other', description: 'Testing and homeowner instruction' },
    ],
  },
  'Cleaning Service': {
    kind: 'work_order',
    name: 'Cleaning Service Visit',
    description: 'Residential cleaning workflow for rooms, scope, special surfaces, supplies, and completion notes.',
    rooms: [
      { room: 'Cleaning Scope', items: ['Rooms/areas included documented', 'Standard vs deep clean expectations confirmed', 'Special surfaces, stains, odors, pets, or access notes recorded', 'Supplies/equipment requirements noted'] },
      { room: 'Service Completion', items: ['Kitchen/bath/living/sleeping areas completed as scoped', 'Trash/debris handled as agreed', 'Before/after photos added if appropriate', 'Follow-up or recurring service recommendation added'] },
    ],
    estimateScope: 'Standard cleaning, deep cleaning, move-in/move-out, recurring service, or special cleaning estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Cleaning labor' },
      { line_type: 'material', description: 'Cleaning supplies and consumables' },
      { line_type: 'equipment', description: 'Vacuum, extractor, ladder, or specialty equipment allowance' },
      { line_type: 'fee', description: 'Deep clean, pet, move-out, or disposal fee' },
    ],
  },
  'Pressure Washing': {
    kind: 'work_order',
    name: 'Pressure Washing Visit',
    description: 'Pressure washing workflow for surfaces, water access, detergents, protection, and final rinse.',
    rooms: [
      { room: 'Surface Assessment', items: ['Surfaces and square footage/area documented', 'Material type and condition noted', 'Delicate surfaces, plants, outlets, and openings protected', 'Water access and drainage checked'] },
      { room: 'Service Work', items: ['Pretreatment or detergent used as appropriate', 'Pressure/soft-wash method documented', 'Final rinse completed', 'Photos and follow-up recommendation added'] },
    ],
    estimateScope: 'Pressure washing, soft washing, driveway, siding, patio, deck, or surface cleaning estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Pressure washing labor' },
      { line_type: 'material', description: 'Detergent, treatment, or cleaning supplies' },
      { line_type: 'equipment', description: 'Pressure washer, surface cleaner, hose, or access equipment' },
      { line_type: 'fee', description: 'Water access, protection, or disposal fee' },
    ],
  },
  'Pool Service': {
    kind: 'maintenance',
    name: 'Pool Maintenance Visit',
    description: 'Pool service workflow for water condition, equipment, cleaning, chemicals, and recommendations.',
    rooms: [
      { room: 'Pool Water and Surface', items: ['Water clarity and visible algae condition checked', 'Skimmer and pump baskets cleaned', 'Pool surface, tile, coping, and cracks checked', 'Water level and debris condition documented'] },
      { room: 'Pool Equipment', items: ['Pump operation and leaks checked', 'Filter pressure and cleaning recommendation noted', 'Heater, valves, timer, or automation checked if present', 'Service chemicals or repair recommendation documented'] },
    ],
    estimateScope: 'Pool maintenance, cleaning, repair, equipment service, chemicals, or recurring service estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Pool service labor' },
      { line_type: 'material', description: 'Chemicals, filters, baskets, fittings, valves, or replacement parts' },
      { line_type: 'equipment', description: 'Cleaning equipment or repair equipment allowance' },
      { line_type: 'other', description: 'Water testing, homeowner notes, and follow-up' },
    ],
  },
  'Moving Service': {
    kind: 'work_order',
    name: 'Moving Service Work Order',
    description: 'Moving workflow for inventory, access, protection, labor, travel, and completion condition.',
    rooms: [
      { room: 'Move Scope', items: ['Origin/destination, rooms, and inventory documented', 'Stairs, elevator, parking, access, and travel constraints noted', 'Fragile/heavy/specialty items documented', 'Packing or protection needs confirmed'] },
      { room: 'Move Completion', items: ['Items loaded/unloaded as scoped', 'Damage or condition notes recorded', 'Time, crew, and materials documented', 'Customer completion notes added'] },
    ],
    estimateScope: 'Moving labor, packing, loading, unloading, travel, materials, or specialty item estimate.',
    estimateLines: [
      { line_type: 'labor', description: 'Moving crew labor', unit: 'hour' },
      { line_type: 'material', description: 'Boxes, wrap, blankets, tape, or packing supplies' },
      { line_type: 'equipment', description: 'Truck, dolly, liftgate, or equipment allowance' },
      { line_type: 'fee', description: 'Travel, fuel, stairs, specialty item, or disposal fee' },
    ],
  },
  Handyman: {
    kind: 'work_order',
    name: 'Handyman Work Order',
    description: 'Flexible small-repair workflow for multiple household tasks, materials, photos, and follow-up items.',
    rooms: [
      { room: 'Task List', items: ['Homeowner task list confirmed', 'Each affected area documented', 'Materials or parts needed noted', 'Safety or access concerns documented'] },
      { room: 'Work Completed', items: ['Completed tasks checked off', 'Materials and parts used documented', 'Photos added for before/after record', 'Open follow-up items or estimates noted'] },
    ],
    estimateScope: 'Handyman repair, small project, maintenance, punch-list, or multi-task estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Service call / minimum trip fee' },
      { line_type: 'labor', description: 'Handyman labor', unit: 'hour' },
      { line_type: 'material', description: 'Parts, hardware, fasteners, patch, caulk, or supplies' },
      { line_type: 'other', description: 'Cleanup and homeowner documentation' },
    ],
  },
  'General Maintenance': {
    kind: 'inspection',
    name: 'General Home Inspection',
    description: 'Whole-home room and system walkthrough similar to the original Prevention Pros flow.',
    rooms: DEFAULT_INSPECTION_ROOMS,
    estimateScope: 'General maintenance, small repair, inspection follow-up, or home service estimate.',
    estimateLines: [
      { line_type: 'fee', description: 'Service call / diagnostic fee' },
      { line_type: 'labor', description: 'General maintenance labor', unit: 'hour' },
      { line_type: 'material', description: 'Parts and materials allowance' },
      { line_type: 'other', description: 'Photos, report, cleanup, and homeowner documentation' },
    ],
  },
};

const SERVSYNC_FIELD_WORK_TEMPLATES: ServSyncFieldWorkTemplate[] = TRADE_OPTIONS.map(trade => {
  const blueprint = TRADE_STARTER_TEMPLATE_BLUEPRINTS[trade] ?? TRADE_STARTER_TEMPLATE_BLUEPRINTS['General Maintenance'];
  return {
    id: `starter-${starterSlug(trade)}-field-work`,
    name: blueprint.name,
    kind: blueprint.kind,
    trade,
    description: blueprint.description,
    rooms: blueprint.rooms,
  };
});

const STARTER_ESTIMATE_TEMPLATES: StarterEstimateTemplate[] = TRADE_OPTIONS.map(trade => {
  const blueprint = TRADE_STARTER_TEMPLATE_BLUEPRINTS[trade] ?? TRADE_STARTER_TEMPLATE_BLUEPRINTS['General Maintenance'];
  return {
    id: `starter-${starterSlug(trade)}-estimate`,
    name: `${trade} Estimate Starter`,
    trade,
    scope: blueprint.estimateScope,
    notes: 'Use this as a starting point only. Review all quantities, unit prices, taxes, permit needs, and exclusions before sending.',
    terms: STARTER_ESTIMATE_TERMS,
    line_items: starterEstimateLines(blueprint.estimateLines),
  };
});

const FIELD_WORK_KIND_LABEL: Record<FieldWorkflowKind, string> = {
  inspection: 'Inspection',
  work_order: 'Work Order',
  maintenance: 'Maintenance Visit',
  assessment: 'Assessment',
};

const RECOMMENDED_INSPECTION_ITEMS: Record<string, string[]> = {
  // ── Exterior & structure ───────────────────────────────────────────────────
  exterior: [
    'Siding — damage, rot, or missing sections',
    'Foundation — visible cracks (note diagonal vs horizontal)',
    'Grading and drainage — slopes away from structure',
    'Caulking at windows, doors, and all penetrations',
    'Decks and porches — structure, ledger board, and railings',
    'Stairs and handrails — secure and code compliant',
    'Driveways and walkways — cracks and trip hazards',
    'Exterior GFCI outlets — present and functional',
    'Exterior hose bibs — condition and freeze protection',
    'Exterior lighting — operation',
    'Landscaping — overgrowth or roots near structure or utilities',
  ],
  roof: [
    'Shingles — missing, cracked, curled, or granule loss',
    'Gutters — debris, slope, and secure mounting',
    'Downspouts — extension and drainage away from foundation',
    'Flashing at chimney, vents, skylights, and valleys',
    'Fascia and soffit — rot, damage, or pest entry points',
    'Roof penetrations — boots and seals',
    'Ridge cap — condition and alignment',
    'Chimney — cap, crown, and mortar (if present)',
  ],
  attic: [
    'Attic access hatch — condition and insulated cover',
    'Insulation — depth, coverage, and moisture',
    'Ventilation — soffit and ridge vents clear and functional',
    'Roof sheathing — water stains or active damage',
    'Rafters and trusses — condition, no notching or repairs',
    'Wiring in attic — proper support and no exposed splices',
    'Pest or rodent evidence',
    'Bathroom / kitchen exhaust fans — terminate to exterior (not into attic)',
  ],
  // ── Mechanical systems ─────────────────────────────────────────────────────
  hvac: [
    'Furnace or heat pump — condition, age, and operation',
    'Air filter — condition (replace if dirty)',
    'Thermostat — operation and programming',
    'Ductwork — visible leaks, disconnections, or insulation',
    'A/C condenser unit — fins, coil, refrigerant lines, and clearance',
    'Flue / exhaust pipe — secure, slope, and termination',
    'Carbon monoxide detector — present near unit',
    'Condensate drain line — clear and properly terminated',
    'Heat / cooling registers — all rooms open and unobstructed',
  ],
  'electrical panel': [
    'Panel labeling — accurate and legible',
    'Breaker condition — no tripped, burnt, or double-tapped breakers',
    'AFCI breakers — installed where required (bedrooms, living areas)',
    'GFCI protection — kitchen, bathrooms, garage, exterior, basement',
    'Main disconnect — accessible and operational',
    'Panel grounding and bonding — present',
    'No signs of heat, arcing, or corrosion inside panel',
    'Smoke detectors — present on all levels and near sleeping areas',
  ],
  'water heater': [
    'Age and condition — note manufacturer date label',
    'Tank or tankless unit — visible corrosion, leaks, or rust',
    'Pressure relief valve — present, properly piped to floor or drain',
    'Flue / exhaust — properly sloped, sealed, and terminated',
    'Expansion tank — present on closed systems',
    'Seismic strapping — present where required by local code',
    'Supply and outlet connections — condition and shut-off valve present',
    'Drain valve — present and accessible',
    'Water temperature setting — 120 °F recommended',
  ],
  // ── Kitchen ────────────────────────────────────────────────────────────────
  kitchen: [
    'Range / oven — burners, oven, and self-clean operation',
    'Range hood / exhaust fan — operation and ducted to exterior',
    'Dishwasher — operation, door seal, and high-loop drain',
    'Refrigerator — door seals and ice maker line (if present)',
    'Microwave — operation and ventilation',
    'Sink — basin condition and drainage speed',
    'Faucet — operation, hot/cold, and no drips',
    'Under-sink plumbing — leaks, moisture, and supply line condition',
    'Garbage disposal — operation and no leaks',
    'GFCI outlets — at all countertop locations',
    'Overhead lighting — fixture and operation',
    'Countertops — cracks and water damage near sink',
    'Cabinets — condition, hinges, and drawer hardware',
    'Flooring — water damage, lifting, or soft spots',
  ],
  // ── Living and dining areas ─────────────────────────────────────────────────
  'living room': [
    'Walls and ceiling — cracks, stains, or bulging',
    'Windows — operation, seals, and locks',
    'Window screens — present and condition',
    'Flooring — condition and wear',
    'Electrical outlets — operation',
    'Fireplace firebox — condition and damper operation (if present)',
    'Hearth — extension and clearance (if present)',
    'Smoke and CO detectors — present and functional',
    'Heat / cooling register — clear and functional',
    'Ceiling light fixture or fan — operation and secure mount',
    'Doors — proper operation and latching',
  ],
  dining: [
    'Walls and ceiling — cracks or stains',
    'Windows — operation, seals, and locks',
    'Flooring — condition',
    'Electrical outlets — operation',
    'Overhead light fixture — operation',
    'Heat / cooling register — clear and functional',
    'Doors — proper operation (if applicable)',
  ],
  // ── Bedrooms (more specific first so "master bedroom" matches before "bedroom") ──
  'master bedroom': [
    'Walls and ceiling — cracks, stains, or bulging',
    'Windows — operation, seals, and locks',
    'Window screens — present and condition',
    'Flooring — damage or soft spots',
    'Closet — structure, doors, and rod / shelf condition',
    'Electrical outlets — operation',
    'Overhead light or ceiling fan — operation and secure mount',
    'Smoke detector — present and functional (within 10\' of sleeping area)',
    'Heat / cooling register — clear and functional',
    'Door — proper operation and lock',
  ],
  bedroom: [
    'Walls and ceiling — cracks, stains, or bulging',
    'Windows — operation, seals, and locks',
    'Window screens — present and condition',
    'Flooring — damage or soft spots',
    'Closet — structure, doors, and rod / shelf condition',
    'Electrical outlets — operation',
    'Overhead light or ceiling fan — operation and secure mount',
    'Smoke detector — present and functional (within 10\' of sleeping area)',
    'Heat / cooling register — clear and functional',
    'Door — proper operation and lock',
  ],
  // ── Bathrooms (more specific first) ────────────────────────────────────────
  'master bathroom': [
    'Toilet — flush, fill valve, and no base movement',
    'Toilet — signs of prior leaks at base or supply line',
    'Shower / tub caulking and grout — condition',
    'Shower door or curtain rod — secure and seals',
    'Showerhead — operation and flow',
    'Tub / shower faucet — operation and no drips',
    'Sink faucet — operation and no drips',
    'Sink drain — operation and no slow drain',
    'Under-sink plumbing — leaks, moisture, and supply lines',
    'GFCI outlet — present and functional',
    'Exhaust fan — vented to exterior and operational',
    'Tile and grout — cracks or missing sections',
    'Flooring — soft spots or water damage',
    'Ceiling — staining or mold evidence',
    'Water pressure at fixtures',
    'Lighting — fixture and operation',
  ],
  bathroom: [
    'Toilet — flush, fill valve, and no base movement',
    'Toilet — signs of prior leaks at base or supply line',
    'Shower / tub caulking and grout — condition',
    'Shower door or curtain rod — secure and seals',
    'Showerhead — operation and flow',
    'Tub / shower faucet — operation and no drips',
    'Sink faucet — operation and no drips',
    'Sink drain — operation and no slow drain',
    'Under-sink plumbing — leaks, moisture, and supply lines',
    'GFCI outlet — present and functional',
    'Exhaust fan — vented to exterior and operational',
    'Tile and grout — cracks or missing sections',
    'Flooring — soft spots or water damage',
    'Ceiling — staining or mold evidence',
    'Water pressure at fixtures',
    'Lighting — fixture and operation',
  ],
  // ── Utility and support spaces ─────────────────────────────────────────────
  laundry: [
    'Dryer vent — clear, no kinks, and properly terminated outside',
    'Dryer vent material — rigid or semi-rigid metal (not foil)',
    'Washer supply hoses — condition (braided steel preferred)',
    'Washer drain hose — proper standpipe height (30–48")',
    'Washer drain — no slow drain or backup',
    'Floor drain — present and functional (if applicable)',
    '240V dryer outlet or gas shutoff — condition',
    'GFCI outlet — present near water sources',
    'Overhead lighting — operation',
    'Flooring — water damage or soft spots',
  ],
  basement: [
    'Water intrusion — stains, efflorescence, or active leaks',
    'Structural beams — sags, rot, notches, or sistered repairs',
    'Floor joists — condition and bridging',
    'Sump pump — operation, check valve, and discharge line',
    'Crawlspace vapor barrier — coverage and condition',
    'Crawlspace ventilation — clear (approx 1 sq ft per 150 sq ft)',
    'Floor drain — clear and functional',
    'Pest or rodent evidence',
    'Foundation walls — cracks (note diagonal vs horizontal)',
    'Electrical outlets — GFCI where required',
    'Lighting — operation',
  ],
  garage: [
    'Garage door — auto-reverse safety test',
    'Garage door — balance test (disconnect, lift manually)',
    'Springs and cables — wear, corrosion, or misalignment',
    'Door opener — remote and wall button operation',
    'Floor — cracks, oil stains, or moisture',
    'Walls — cracks or moisture intrusion',
    'Fire-rated door to living space — self-closing and proper rating',
    'Electrical outlets — GFCI at required locations',
    'Lighting — operation',
    'Smoke detector — present and functional',
    'Overhead storage — secure mounting and clearance',
  ],
};

function recommendedItemsForRoom(room: string): string[] {
  const lower = room.toLowerCase();
  for (const [key, items] of Object.entries(RECOMMENDED_INSPECTION_ITEMS)) {
    if (lower.includes(key)) return items;
  }
  return [];
}

function getRoomInspectionIcon(room: string): string {
  const lower = room.toLowerCase();
  if (lower.includes('kitchen')) return '🍳';
  if (lower.includes('master bath') || lower.includes('master bathroom')) return '🛁';
  if (lower.includes('bath')) return '🚿';
  if (lower.includes('master bed') || lower.includes('master bedroom')) return '🛏️';
  if (lower.includes('bedroom') || lower.includes('bed room')) return '🛏️';
  if (lower.includes('living')) return '🛋️';
  if (lower.includes('dining')) return '🍽️';
  if (lower.includes('garage')) return '🚗';
  if (lower.includes('attic')) return '🏠';
  if (lower.includes('roof')) return '🏚️';
  if (lower.includes('basement') || lower.includes('crawl')) return '🪜';
  if (lower.includes('hvac')) return '❄️';
  if (lower.includes('electrical panel') || lower.includes('electric panel')) return '⚡';
  if (lower.includes('water heater')) return '🔥';
  if (lower.includes('exterior') || lower.includes('foundation')) return '🏗️';
  if (lower.includes('laundry')) return '🧺';
  if (lower.includes('office')) return '💼';
  if (lower.includes('stair')) return '🪜';
  if (lower.includes('hall') || lower.includes('foyer') || lower.includes('entry')) return '🚪';
  return '🔍';
}

// PDF generation for inspection reports
async function generateInspectionPdf(
  inspection: Inspection,
  contractorName: string,
  homeownerName: string,
  homeAddress: string,
): Promise<{ blob: Blob; fileName: string }> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 0;

  const BLUE   = [37, 99, 235]   as const;
  const DARK   = [30, 41, 59]    as const;
  const GRAY   = [100, 116, 139] as const;
  const LIGHT  = [248, 250, 252] as const;
  const WHITE  = [255, 255, 255] as const;
  const BORDER = [226, 232, 240] as const;

  const STATUS_PDF: Record<FindingStatus, { bg: readonly number[]; text: readonly number[] }> = {
    'Pass':         { bg: [220, 252, 231], text: [22, 163, 74] },
    'Monitor':      { bg: [219, 234, 254], text: [37, 99, 235] },
    'Fixed On Site':{ bg: [237, 233, 254], text: [109, 40, 217] },
    'Needs Repair': { bg: [254, 243, 199], text: [217, 119, 6] },
    'Urgent':       { bg: [254, 226, 226], text: [220, 38, 38] },
  };

  function checkPageBreak(needed: number) {
    if (y + needed > pageH - 16) { pdf.addPage(); y = 16; }
  }
  function setFill(c: readonly number[]) { pdf.setFillColor(c[0], c[1], c[2]); }
  function setTxt(c: readonly number[]) { pdf.setTextColor(c[0], c[1], c[2]); }
  function drawRect(x: number, yy: number, w: number, h: number, fill: readonly number[], r = 3) {
    setFill(fill); pdf.roundedRect(x, yy, w, h, r, r, 'F');
  }
  function txt(s: string, x: number, yy: number, c: readonly number[], size: number, bold = false, align: 'left'|'center'|'right' = 'left', maxW?: number) {
    setTxt(c); pdf.setFontSize(size); pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    if (maxW) { const lines = pdf.splitTextToSize(s, maxW); pdf.text(lines, x, yy, { align }); }
    else pdf.text(s, x, yy, { align });
  }
  function sectionLine(yy: number) {
    pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); pdf.setLineWidth(0.2);
    pdf.line(margin, yy, pageW - margin, yy);
  }

  const allFindings = inspection.rooms_with_findings.flatMap(r => r.findings);
  const findingsWithRoom = inspection.rooms_with_findings.flatMap(r => r.findings.map(f => ({ ...f, room: r.room })));
  const urgentCount = allFindings.filter(f => f.status === 'Urgent').length;
  const needsRepairCount = allFindings.filter(f => f.status === 'Needs Repair').length;
  const monitorCount = allFindings.filter(f => f.status === 'Monitor').length;
  const fixedCount = allFindings.filter(f => f.status === 'Fixed On Site').length;
  const passCount = allFindings.filter(f => f.status === 'Pass').length;
  const issueCount = urgentCount + needsRepairCount;
  const attentionGroups: Array<{ status: FindingStatus; title: string; findings: Array<InspectionRoomFinding & { room: string }> }> = [
    { status: 'Urgent', title: 'Urgent Items', findings: findingsWithRoom.filter(f => f.status === 'Urgent') },
    { status: 'Needs Repair', title: 'Needs Repair', findings: findingsWithRoom.filter(f => f.status === 'Needs Repair') },
    { status: 'Monitor', title: 'Monitor', findings: findingsWithRoom.filter(f => f.status === 'Monitor') },
  ];
  const fixedValueFindings = findingsWithRoom.filter(f => f.status === 'Fixed On Site');
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Header
  drawRect(0, 0, pageW, 38, BLUE, 0);
  txt(contractorName, margin, 13, WHITE, 16, true);
  txt('Field Work Report', margin, 20, [147, 197, 253], 8);
  const statusLabel = urgentCount > 0 ? `${urgentCount} URGENT` : issueCount > 0 ? `${issueCount} ISSUES` : 'ALL CLEAR';
  const statusBg = urgentCount > 0 ? STATUS_PDF['Urgent'].bg : issueCount > 0 ? STATUS_PDF['Needs Repair'].bg : STATUS_PDF['Pass'].bg;
  const statusTxt = urgentCount > 0 ? STATUS_PDF['Urgent'].text : issueCount > 0 ? STATUS_PDF['Needs Repair'].text : STATUS_PDF['Pass'].text;
  drawRect(pageW - margin - 36, 8, 36, 8, statusBg, 2);
  txt(statusLabel, pageW - margin - 18, 13.5, statusTxt, 7, true, 'center');
  y = 44;

  // Property info
  txt(homeownerName, margin, y, DARK, 15, true); y += 6;
  if (homeAddress) { txt(homeAddress, margin, y, GRAY, 9); y += 5; }
  txt(`Field work: ${inspection.name}`, margin, y, GRAY, 8); y += 5;
  txt(`Prepared: ${today}`, margin, y, GRAY, 8); y += 9;

  // Stats row
  const boxW = (contentW - 10) / 5;
  const stats = [
    { label: 'Urgent',    value: String(urgentCount),    ...STATUS_PDF['Urgent'] },
    { label: 'Repair',    value: String(needsRepairCount), ...STATUS_PDF['Needs Repair'] },
    { label: 'Monitor',   value: String(monitorCount),   ...STATUS_PDF['Monitor'] },
    { label: 'Fixed',     value: String(fixedCount),     ...STATUS_PDF['Fixed On Site'] },
    { label: 'Pass',      value: String(passCount),      ...STATUS_PDF['Pass'] },
  ];
  stats.forEach((s, i) => {
    const bx = margin + i * (boxW + 2.5);
    drawRect(bx, y, boxW, 16, s.bg, 2);
    txt(s.value, bx + boxW / 2, y + 7, s.text, 12, true, 'center');
    txt(s.label.toUpperCase(), bx + boxW / 2, y + 13, s.text, 6, false, 'center');
  });
  y += 22;
  sectionLine(y); y += 8;

  // Professional summary
  if (inspection.summary) {
    txt('INSPECTION SUMMARY', margin, y, GRAY, 8, true); y += 5;
    const summaryLines = pdf.splitTextToSize(inspection.summary, contentW - 6);
    const summaryH = summaryLines.length * 4.5 + 10;
    checkPageBreak(summaryH + 4);
    drawRect(margin, y, contentW, summaryH, LIGHT, 2);
    txt(inspection.summary, margin + 3, y + 7, DARK, 8, false, 'left', contentW - 6);
    y += summaryH + 8;
    sectionLine(y); y += 8;
  }

  // Top-of-report attention items, so homeowners do not have to search the full report.
  const attentionCount = urgentCount + needsRepairCount + monitorCount;
  if (attentionCount > 0) {
    txt('ITEMS NEEDING ATTENTION', margin, y, GRAY, 8, true); y += 5;
    for (const group of attentionGroups) {
      if (group.findings.length === 0) continue;
      const sc = STATUS_PDF[group.status];
      const groupHeaderH = 9;
      checkPageBreak(groupHeaderH + 8);
      drawRect(margin, y, contentW, groupHeaderH, sc.bg, 2);
      txt(`${group.title.toUpperCase()} (${group.findings.length})`, margin + 4, y + 6, sc.text, 8, true);
      y += groupHeaderH + 3;

      for (const f of group.findings) {
        const description = homeownerFindingDescription(f);
        const descriptionLines = pdf.splitTextToSize(description, contentW - 16);
        const actionLines = f.action ? pdf.splitTextToSize(`Action: ${f.action}`, contentW - 16) : [];
        const dueLines = f.due ? pdf.splitTextToSize(`Due: ${f.due}`, contentW - 16) : [];
        const cardH = 11 + descriptionLines.length * 4.2 + actionLines.length * 4.2 + dueLines.length * 4.2;
        checkPageBreak(cardH + 3);
        pdf.setFillColor(sc.text[0], sc.text[1], sc.text[2]);
        pdf.rect(margin, y, 2, cardH, 'F');
        drawRect(margin + 2, y, contentW - 2, cardH, LIGHT, 0);
        txt(`${f.room}: ${f.title}`, margin + 6, y + 5.5, DARK, 8, true, 'left', contentW - 42);
        drawRect(pageW - margin - 32, y + 1.5, 32, 6.5, sc.bg, 2);
        txt(f.status, pageW - margin - 16, y + 6.3, sc.text, 6.5, true, 'center');
        let yOff = 11;
        txt(description, margin + 6, y + yOff, GRAY, 7.6, false, 'left', contentW - 16);
        yOff += descriptionLines.length * 4.2;
        if (f.action) {
          txt(`Action: ${f.action}`, margin + 6, y + yOff, BLUE, 7.2, false, 'left', contentW - 16);
          yOff += actionLines.length * 4.2;
        }
        if (f.due) {
          txt(`Due: ${f.due}`, margin + 6, y + yOff, STATUS_PDF['Needs Repair'].text, 7.2, false, 'left', contentW - 16);
        }
        y += cardH + 3;
      }
      y += 2;
    }
    sectionLine(y); y += 8;
  }

  if (fixedValueFindings.length > 0) {
    const sc = STATUS_PDF['Fixed On Site'];
    txt('VALUE DELIVERED ON SITE', margin, y, sc.text, 8, true); y += 5;
    const intro = `${fixedValueFindings.length} item${fixedValueFindings.length !== 1 ? 's were' : ' was'} corrected during this visit. These completed fixes represent immediate value from the field work and may help prevent repeat service calls or additional damage.`;
    const introLines = pdf.splitTextToSize(intro, contentW - 8);
    const boxH = 10 + introLines.length * 4.3;
    checkPageBreak(boxH + 8);
    drawRect(margin, y, contentW, boxH, sc.bg, 2);
    txt(intro, margin + 4, y + 7, sc.text, 8, false, 'left', contentW - 8);
    y += boxH + 4;
    for (const f of fixedValueFindings.slice(0, 5)) {
      const description = homeownerFindingDescription(f);
      const lines = pdf.splitTextToSize(description, contentW - 12);
      const rowH = 7 + lines.length * 4.2;
      checkPageBreak(rowH + 2);
      pdf.setFillColor(sc.text[0], sc.text[1], sc.text[2]);
      pdf.rect(margin, y, 2, rowH, 'F');
      drawRect(margin + 2, y, contentW - 2, rowH, LIGHT, 0);
      txt(`${f.room}: ${description}`, margin + 6, y + 5.5, DARK, 7.7, false, 'left', contentW - 12);
      y += rowH + 2;
    }
    if (fixedValueFindings.length > 5) {
      txt(`+ ${fixedValueFindings.length - 5} additional fixed item${fixedValueFindings.length - 5 !== 1 ? 's' : ''} shown in the room sections.`, margin + 4, y + 3.5, GRAY, 7.2);
      y += 7;
    }
    sectionLine(y); y += 8;
  }

  // Room sections
  for (const roomData of inspection.rooms_with_findings) {
    if (roomData.findings.length === 0) continue;
    const nonPassFindings = roomData.findings.filter(f => f.status !== 'Pass');
    const passFindings = roomData.findings.filter(f => f.status === 'Pass');
    const hasUrgent = roomData.findings.some(f => f.status === 'Urgent');

    checkPageBreak(20);
    drawRect(margin, y, contentW, 12, DARK, 2);
    txt(roomData.room.toUpperCase(), margin + 4, y + 8, WHITE, 10, true);
    const rBadgeLabel = hasUrgent ? 'URGENT' : nonPassFindings.length > 0 ? 'HAS ISSUES' : 'CLEAR';
    const rBadgeBg = hasUrgent ? STATUS_PDF['Urgent'].bg : nonPassFindings.length > 0 ? STATUS_PDF['Needs Repair'].bg : STATUS_PDF['Pass'].bg;
    const rBadgeTxt = hasUrgent ? STATUS_PDF['Urgent'].text : nonPassFindings.length > 0 ? STATUS_PDF['Needs Repair'].text : STATUS_PDF['Pass'].text;
    drawRect(pageW - margin - 32, y + 2, 32, 8, rBadgeBg, 2);
    txt(rBadgeLabel, pageW - margin - 16, y + 7.5, rBadgeTxt, 7, true, 'center');
    y += 14;
    txt(`${roomData.findings.length} items  ·  ${passFindings.length} passed  ·  ${nonPassFindings.length} need attention`, margin, y, GRAY, 8);
    y += 7;

    if (nonPassFindings.length > 0) {
      txt('FINDINGS', margin, y, GRAY, 7, true); y += 5;
      for (const f of nonPassFindings) {
        const sc = STATUS_PDF[f.status];
        const notesLines = f.notes ? pdf.splitTextToSize(f.notes, contentW - 10).length : 0;
        const actionLine = f.action ? 1 : 0;
        const dueLine = f.due ? 1 : 0;
        const fH = 10 + notesLines * 4.5 + (actionLine + dueLine) * 5 + 8;
        checkPageBreak(fH);
        pdf.setFillColor(sc.text[0], sc.text[1], sc.text[2]);
        pdf.rect(margin, y, 2, fH, 'F');
        drawRect(margin + 2, y, contentW - 2, fH, LIGHT, 0);
        txt(f.title, margin + 6, y + 6, DARK, 9, true, 'left', contentW - 40);
        drawRect(pageW - margin - 32, y + 1, 32, 7, sc.bg, 2);
        txt(f.status, pageW - margin - 16, y + 6, sc.text, 7, true, 'center');
        let yOff = 12;
        if (f.notes) {
          txt(f.notes, margin + 6, y + yOff, GRAY, 8, false, 'left', contentW - 10);
          yOff += notesLines * 4.5;
        }
        if (f.action) {
          txt(`Action: ${f.action}`, margin + 6, y + yOff, [37, 99, 235], 7.5, false, 'left', contentW - 10);
          yOff += 5;
        }
        if (f.due) {
          txt(`Due: ${f.due}`, margin + 6, y + yOff, [217, 119, 6], 7.5, false, 'left', contentW - 10);
        }
        y += fH + 3;
      }
    }

    if (passFindings.length > 0) {
      checkPageBreak(12);
      txt('PASSED', margin, y, GRAY, 7, true); y += 5;
      for (const f of passFindings) {
        checkPageBreak(10);
        pdf.setFillColor(STATUS_PDF['Pass'].text[0], STATUS_PDF['Pass'].text[1], STATUS_PDF['Pass'].text[2]);
        pdf.rect(margin, y, 2, 8, 'F');
        drawRect(margin + 2, y, contentW - 2, 8, LIGHT, 0);
        txt(f.title, margin + 6, y + 5.5, DARK, 8, false, 'left', contentW - 40);
        drawRect(pageW - margin - 18, y + 1, 18, 6, STATUS_PDF['Pass'].bg, 2);
        txt('Pass', pageW - margin - 9, y + 5.5, STATUS_PDF['Pass'].text, 7, true, 'center');
        y += 11;
      }
      y += 3;
    }

    y += 4;
    sectionLine(y); y += 8;
  }

  // Footer
  checkPageBreak(28);
  drawRect(margin, pageH - 28, contentW, 10, LIGHT, 2);
  txt('This report is based on limited field work and accessible conditions at the time of service. It is not a code inspection, engineering report, or guarantee of hidden conditions unless explicitly stated by the contractor. Items marked Urgent or Needs Repair should be addressed by a qualified professional.', margin + 2, pageH - 24, GRAY, 6.2, false, 'left', contentW - 4);
  drawRect(0, pageH - 14, pageW, 14, DARK, 0);
  txt(`${contractorName}  ·  ServSync`, pageW / 2, pageH - 6, [148, 163, 184], 7, false, 'center');

  const safeName = homeownerName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `${safeName}-Field-Work-${dateStr}.pdf`;
  pdf.save(fileName);
  return { blob: pdf.output('blob'), fileName };
}

function localDraftFromNote(note: string): FindingStatus {
  const lower = note.toLowerCase();
  const hasAny = (phrases: string[]) => phrases.some(phrase => lower.includes(phrase));
  const completedOnSite = hasAny(COMPLETED_WORK_PHRASES) && !hasAny(UNRESOLVED_WORK_PHRASES);
  const clearlyOk = hasAny(CLEAR_CONDITION_PHRASES) && !hasAny(UNRESOLVED_WORK_PHRASES);

  if (completedOnSite) return 'Fixed On Site';
  if (clearlyOk) return 'Pass';

  for (const rule of LOCAL_DRAFT_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.status;
  }
  return 'Pass';
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stemToken(value: string) {
  return value
    .replace(/ing$/, '')
    .replace(/age$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

function hasPhrase(haystack: string, phrase: string) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  if (` ${haystack} `.includes(` ${normalizedPhrase} `)) return true;
  const phraseTokens = normalizedPhrase.split(' ');
  if (phraseTokens.length === 1) {
    const target = stemToken(phraseTokens[0]);
    return haystack.split(' ').some(token => {
      const stemmed = stemToken(token);
      return stemmed === target || token.startsWith(target) || target.startsWith(stemmed);
    });
  }
  return false;
}

type ServiceCategorySuggestion = {
  category: string;
  score: number;
  reasons: string[];
};

const SERVICE_CATEGORY_MATCH_RULES: Record<string, string[]> = {
  HVAC: ['air conditioner', 'ac', 'a c', 'heat pump', 'furnace', 'thermostat', 'duct', 'air filter', 'hvac', 'not cooling', 'not heating', 'warm air', 'cold air', 'register', 'vent airflow'],
  Plumbing: ['leak', 'drip', 'pipe', 'faucet', 'toilet', 'sink', 'shower', 'tub', 'drain', 'clog', 'water pressure', 'garbage disposal', 'water heater', 'sewer', 'supply line', 'hose bib'],
  Electrical: ['outlet', 'breaker', 'light switch', 'switch', 'gfci', 'sparking', 'flickering', 'electrical', 'power', 'tripped', 'panel', 'ceiling fan wiring', 'smoke detector'],
  Roofing: ['roof', 'shingle', 'flashing', 'roof leak', 'ceiling stain after rain', 'storm damage', 'ridge cap', 'roof vent', 'skylight leak'],
  Gutters: ['gutter', 'downspout', 'water overflowing', 'fascia water', 'gutter leak', 'drain away', 'rainwater'],
  Concrete: ['driveway', 'sidewalk', 'concrete', 'slab', 'patio crack', 'trip hazard', 'settled concrete'],
  Masonry: ['brick', 'mortar', 'stone', 'chimney brick', 'block wall', 'masonry', 'tuckpoint'],
  'Foundation Repair': ['foundation', 'settling', 'horizontal crack', 'stair step crack', 'crawlspace support', 'pier', 'beam sag', 'structural crack'],
  Framing: ['framing', 'stud', 'joist', 'rafter', 'load bearing', 'header', 'wall framing', 'floor framing'],
  Carpentry: ['trim', 'wood rot', 'shelf', 'built in', 'wood repair', 'baseboard', 'crown molding', 'carpentry'],
  Cabinets: ['cabinet', 'drawer', 'hinge', 'cabinet door', 'vanity cabinet', 'soft close', 'cabinet maker'],
  Countertops: ['countertop', 'counter top', 'granite', 'quartz', 'laminate counter', 'counter crack'],
  Flooring: ['floor', 'flooring', 'hardwood', 'laminate', 'vinyl plank', 'carpet', 'soft spot', 'buckling floor'],
  Tile: ['tile', 'grout', 'backsplash', 'shower tile', 'cracked tile', 'loose tile'],
  Drywall: ['drywall', 'sheetrock', 'wall damage', 'hole in wall', 'ceiling patch', 'ceiling crack', 'texture repair'],
  Painting: ['paint', 'painting', 'stain wall', 'touch up', 'peeling paint', 'exterior paint'],
  Siding: ['siding', 'vinyl siding', 'hardie', 'lap siding', 'siding damage', 'exterior wall panel'],
  Windows: ['window', 'glass', 'window lock', 'window seal', 'fogged window', 'screen', 'sash'],
  Doors: ['door', 'doorknob', 'door frame', 'threshold', 'weatherstrip', 'door lock', 'sticking door'],
  'Garage Doors': ['garage door', 'garage opener', 'garage spring', 'garage track', 'remote opener'],
  Decks: ['deck', 'porch boards', 'railing', 'ledger board', 'deck stair', 'baluster'],
  Fencing: ['fence', 'gate', 'fence post', 'privacy fence', 'picket'],
  Landscaping: ['landscape', 'flower bed', 'mulch', 'grading', 'yard drainage', 'plants', 'bushes'],
  'Lawn Care': ['lawn', 'grass', 'mowing', 'weed', 'fertilizer', 'sod', 'yard maintenance'],
  'Tree Service': ['tree', 'limb', 'branch', 'stump', 'tree removal', 'tree trimming'],
  Irrigation: ['sprinkler', 'irrigation', 'sprinkler head', 'zone valve', 'controller', 'watering system'],
  'Pest Control': ['pest', 'bugs', 'ants', 'roaches', 'termite', 'rodent', 'mice', 'wasp', 'spider', 'droppings'],
  Septic: ['septic', 'drain field', 'septic tank', 'sewage smell', 'backup outside'],
  'Well Service': ['well', 'well pump', 'pressure tank', 'no water', 'water pressure tank'],
  Insulation: ['insulation', 'attic insulation', 'drafty', 'hot room', 'cold room', 'air sealing', 'r value'],
  Chimney: ['chimney', 'fireplace', 'flue', 'damper', 'creosote', 'chimney cap'],
  'Appliance Repair': ['refrigerator', 'fridge', 'dishwasher', 'oven', 'range', 'stove', 'washer', 'dryer', 'ice maker', 'appliance'],
  Locksmith: ['lock', 'locked out', 'key', 'rekey', 'deadbolt', 'smart lock'],
  'Cleaning Service': ['cleaning', 'deep clean', 'move out clean', 'house clean', 'maid', 'odor cleaning'],
  'Pressure Washing': ['pressure wash', 'power wash', 'soft wash', 'driveway cleaning', 'siding cleaning', 'mildew exterior'],
  'Pool Service': ['pool', 'pool pump', 'pool filter', 'algae', 'pool water', 'pool heater'],
  'Moving Service': ['moving', 'movers', 'move furniture', 'packing', 'unloading', 'loading truck'],
  Handyman: ['small repair', 'minor repair', 'odd jobs', 'hang picture', 'assemble', 'general repair', 'punch list'],
  'General Maintenance': ['maintenance', 'not sure', 'multiple issues', 'home check', 'general home'],
};

const WATER_DAMAGE_MATERIAL_CATEGORIES = new Set([
  'Insulation',
  'Drywall',
  'Painting',
  'Flooring',
  'Cabinets',
  'Carpentry',
  'Tile',
  'Countertops',
]);

function uniqueSuggestionReasons(reasons: string[]) {
  const seen = new Set<string>();
  return reasons.filter(reason => {
    const key = normalizeText(reason);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suggestServiceCategories(problem: string, allowedCategories = SERVICE_REQUEST_CATEGORIES): ServiceCategorySuggestion[] {
  const normalized = normalizeText(problem);
  if (!normalized) return [];
  const allowed = new Set(allowedCategories.map(category => category.toLowerCase()));
  const hasAny = (phrases: string[]) => phrases.some(phrase => hasPhrase(normalized, phrase));
  const matchingTerms = (phrases: string[]) => phrases.filter(phrase => hasPhrase(normalized, phrase));
  const issueBoosts: Partial<Record<string, { score: number; reason: string }>> = {};
  const issuePenalties: Partial<Record<string, number>> = {};

  const leakWords = ['leak', 'leaking', 'drip', 'dripping', 'water dripping', 'water leak', 'wet', 'water damage', 'moisture', 'damp', 'standing water'];
  const plumbingContext = ['sink', 'toilet', 'faucet', 'pipe', 'supply line', 'drain', 'shower', 'tub', 'vanity', 'garbage disposal', 'water heater', 'bathroom', 'kitchen'];
  const roofContext = ['roof', 'ceiling stain', 'after rain', 'rain', 'shingle', 'attic leak', 'flashing', 'skylight'];
  const gutterContext = ['gutter', 'downspout', 'rainwater', 'overflow', 'overflowing'];
  const applianceWaterContext = ['dishwasher', 'washer', 'refrigerator', 'fridge', 'ice maker'];
  const leakMatches = matchingTerms(leakWords);
  const plumbingMatches = matchingTerms(plumbingContext);
  const roofMatches = matchingTerms(roofContext);
  const gutterMatches = matchingTerms(gutterContext);
  const applianceWaterMatches = matchingTerms(applianceWaterContext);

  if (leakMatches.length > 0 && roofMatches.length > 0) {
    issueBoosts.Roofing = { score: 9, reason: 'roof or rain leak source' };
  } else if (leakMatches.length > 0 && gutterMatches.length > 0) {
    issueBoosts.Gutters = { score: 9, reason: 'gutter drainage leak source' };
  } else if (leakMatches.length > 0 && plumbingMatches.length > 0) {
    issueBoosts.Plumbing = { score: 10, reason: `plumbing leak near ${plumbingMatches[0]}` };
  } else if (leakMatches.length > 0 && applianceWaterMatches.length > 0) {
    issueBoosts['Appliance Repair'] = { score: 8, reason: `appliance water issue near ${applianceWaterMatches[0]}` };
  } else if (leakMatches.length > 0) {
    issueBoosts.Plumbing = { score: 5, reason: 'leak or water issue' };
  }

  if (leakMatches.length > 0) {
    for (const affectedMaterial of WATER_DAMAGE_MATERIAL_CATEGORIES) {
      issuePenalties[affectedMaterial] = 8;
    }
  }

  if (hasAny(['sparking', 'outlet', 'breaker', 'gfci', 'flickering', 'tripped', 'no power'])) {
    issueBoosts.Electrical = { score: 7, reason: 'electrical symptom' };
  }
  if (hasAny(['not cooling', 'not heating', 'ac', 'a c', 'air conditioner', 'furnace', 'thermostat', 'heat pump'])) {
    issueBoosts.HVAC = { score: 7, reason: 'heating or cooling symptom' };
  }
  if (hasAny(['refrigerator', 'fridge', 'dishwasher', 'oven', 'range', 'stove', 'washer', 'dryer', 'ice maker'])) {
    issueBoosts['Appliance Repair'] = { score: 7, reason: 'appliance symptom' };
  }
  if (hasAny(['gutter', 'downspout']) && hasAny(['overflow', 'overflowing', 'clog', 'clogged', 'rainwater', 'drain'])) {
    issueBoosts.Gutters = { score: 7, reason: 'gutter drainage symptom' };
  }

  const scored = SERVICE_REQUEST_CATEGORIES
    .filter(category => category !== 'Other' && allowed.has(category.toLowerCase()))
    .map(category => {
      const directCategoryMatch = hasPhrase(normalized, category) ? 2 : 0;
      const matchedKeywords = (SERVICE_CATEGORY_MATCH_RULES[category] || []).filter(keyword => hasPhrase(normalized, keyword));
      const boost = issueBoosts[category];
      const penalty = issuePenalties[category] ?? 0;
      const rawReasons = [
        ...(boost ? [boost.reason] : []),
        ...(directCategoryMatch ? [category] : []),
        ...matchedKeywords,
      ];
      const reasons = uniqueSuggestionReasons(rawReasons).slice(0, 4);
      return {
        category,
        score: Math.max(0, (boost?.score ?? 0) + directCategoryMatch + matchedKeywords.length - penalty),
        reasons,
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  if (scored.length > 0) {
    const topScore = scored[0].score;
    return scored.filter(item => item.score >= Math.max(2, topScore - 4)).slice(0, 3);
  }
  return [{ category: 'Other', score: 1, reasons: ['No clear trade match'] }].filter(item => allowed.has(item.category.toLowerCase()));
}

function splitWalkthroughNotes(text: string): string[] {
  return text
    .replace(/\b(and then|then|next)\b/gi, '.')
    .split(/[.\n;•]+|-\s+|\d+\.\s+/)
    .map(s => s.replace(/^\s*[-•]\s*/, '').trim())
    .filter(s => s.length > 4);
}

function roomKeywords(room: string) {
  const lower = normalizeText(room);
  const words = lower.split(' ').filter(word => word.length > 2);
  const keywords = new Set<string>([lower, ...words]);
  if (lower.includes('kitchen')) ['kitchen', 'sink', 'dishwasher', 'refrigerator', 'range', 'stove', 'disposal'].forEach(k => keywords.add(k));
  if (lower.includes('bath') || lower.includes('powder')) ['bathroom', 'bath', 'toilet', 'shower', 'tub', 'vanity', 'sink', 'faucet'].forEach(k => keywords.add(k));
  if (lower.includes('master') && lower.includes('bath')) ['master bath', 'master bathroom', 'primary bath', 'primary bathroom'].forEach(k => keywords.add(k));
  if (lower.includes('garage')) ['garage', 'garage door'].forEach(k => keywords.add(k));
  if (lower.includes('laundry')) ['laundry', 'washer', 'dryer', 'dryer vent'].forEach(k => keywords.add(k));
  if (lower.includes('attic')) ['attic', 'insulation', 'roof leak'].forEach(k => keywords.add(k));
  if (lower.includes('basement') || lower.includes('crawl')) ['basement', 'crawl', 'foundation', 'sump'].forEach(k => keywords.add(k));
  if (lower.includes('exterior') || lower.includes('yard')) ['exterior', 'outside', 'yard', 'gutter', 'downspout', 'siding', 'hose bib', 'driveway'].forEach(k => keywords.add(k));
  if (lower.includes('bedroom')) ['bedroom', 'closet'].forEach(k => keywords.add(k));
  if (lower.includes('living') || lower.includes('family')) ['living room', 'family room', 'fireplace'].forEach(k => keywords.add(k));
  if (lower.includes('whole') || lower.includes('system')) ['hvac', 'thermostat', 'water heater', 'electrical panel', 'smoke detector', 'carbon monoxide'].forEach(k => keywords.add(k));
  return Array.from(keywords).filter(Boolean);
}

function detectRoomFromNote(note: string, rooms: string[], fallbackRoom: string | null = null): string | null {
  const lower = normalizeText(note);
  const scored = rooms.map(room => {
    let score = 0;
    for (const keyword of roomKeywords(room)) {
      if (keyword.length > 2 && hasPhrase(lower, keyword)) score += keyword.includes(' ') ? 8 : 4;
    }
    return { room, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].room : fallbackRoom;
}

const ITEM_MATCH_SYNONYMS: Record<string, string[]> = {
  sink: ['sink', 'sinks', 'faucet', 'faucets', 'under-sink', 'under sink', 'cabinet under sink', 'basin', 'vanity'],
  faucet: ['faucet', 'water pressure', 'spray', 'fixture'],
  toilet: ['toilet', 'toilets', 'tank', 'bowl', 'flange', 'seat', 'flush', 'flushing'],
  shower: ['shower', 'tub', 'bathtub', 'pan', 'shower door', 'enclosure'],
  drain: ['drain', 'drains', 'draining', 'drainage', 'waste', 'p-trap', 'p trap', 'trap', 'slow drain', 'slow draining', 'clog'],
  leak: ['leak', 'leaks', 'leaking', 'drip', 'drips', 'dripping', 'water leak', 'moisture', 'wet', 'damp'],
  caulk: ['caulk', 'caulking', 'sealant', 'grout'],
  dishwasher: ['dishwasher'],
  disposal: ['disposal', 'garbage disposal', 'garburator'],
  refrigerator: ['refrigerator', 'fridge'],
  range: ['oven', 'range', 'stove', 'stovetop', 'burner'],
  vent: ['vent', 'exhaust', 'fan', 'range hood'],
  gfci: ['gfci', 'outlet', 'receptacle'],
  window: ['window', 'sill', 'glass'],
  door: ['door', 'threshold', 'lock', 'hardware'],
  gutter: ['gutter', 'downspout'],
  roof: ['roof', 'shingle', 'flashing'],
  hvac: ['hvac', 'filter', 'thermostat', 'furnace', 'condenser'],
  wall: ['wall', 'walls', 'sheetrock', 'drywall', 'hole', 'paint', 'ceiling'],
  cabinet: ['cabinet', 'cabinets', 'drawer', 'drawers', 'hinge', 'cabinet maker'],
  fan: ['fan', 'ceiling fan', 'fan blade', 'blade', 'squeak', 'squeaking', 'noise', 'balance', 'out of balance'],
};

function checklistMatchConfidence(note: string, item: string) {
  const lower = normalizeText(note);
  const itemLower = normalizeText(item);
  if (!itemLower) return 0;
  let score = 0;
  for (const [concept, phrases] of Object.entries(ITEM_MATCH_SYNONYMS)) {
    const noteHasConcept = phrases.some(phrase => hasPhrase(lower, phrase));
    const itemHasConcept = phrases.some(phrase => hasPhrase(itemLower, phrase)) || hasPhrase(itemLower, concept);
    if (noteHasConcept && itemHasConcept) score += 2;
  }
  const itemWords = itemLower.split(' ').filter(word => word.length > 4);
  for (const word of itemWords) if (hasPhrase(lower, word)) score += 1;
  return score;
}

function suggestedChecklistItemFromNote(note: string, room: string) {
  const lower = normalizeText(note);
  if (['leak', 'leaking', 'drip', 'moisture', 'wet', 'water', 'supply line', 'p trap', 'p-trap'].some(word => hasPhrase(lower, word))) {
    if (['sink', 'faucet', 'vanity', 'basin'].some(word => hasPhrase(lower, word))) return 'Under-sink plumbing — leaks, moisture, and supply lines';
    return 'Plumbing leak or moisture concern';
  }
  if (['slow drain', 'clog', 'backup', 'not draining', 'drain'].some(word => hasPhrase(lower, word))) return 'Drainage — operation and no slow drain';
  if (['wall', 'sheetrock', 'drywall', 'hole', 'paint', 'ceiling'].some(word => hasPhrase(lower, word))) return 'Walls, ceilings, paint, and drywall condition';
  if (['fan', 'ceiling fan', 'fan blade', 'squeak', 'squeaking', 'out of balance'].some(word => hasPhrase(lower, word))) return 'Ceiling light fixture or fan — operation and secure mount';
  if (['floor', 'flooring', 'tile', 'carpet', 'laminate', 'hardwood'].some(word => hasPhrase(lower, word))) return 'Flooring condition and visible damage';
  if (['cabinet', 'drawer', 'countertop'].some(word => hasPhrase(lower, word))) return 'Cabinets, drawers, and countertop condition';
  if (['door', 'hinge', 'lock', 'handle'].some(word => hasPhrase(lower, word))) return 'Doors, hinges, locks, and hardware';
  if (['window', 'screen', 'lock'].some(word => hasPhrase(lower, word))) return 'Windows, locks, and screens';
  return `${room || 'General'} maintenance observation`;
}

function findBestChecklistItem(note: string, items: string[]) {
  if (items.length === 0) return 'General observation';
  const lower = normalizeText(note);
  const noteHasSink = ['sink', 'sinks', 'vanity', 'faucet', 'faucets'].some(word => hasPhrase(lower, word));
  const noteHasDrain = ['drain', 'drains', 'draining', 'drainage', 'slow drain', 'slow draining', 'p trap', 'p-trap'].some(word => hasPhrase(lower, word));
  const noteHasToilet = ['toilet', 'toilets'].some(word => hasPhrase(lower, word));
  const noteHasDisposal = ['disposal', 'garbage disposal', 'garburator'].some(word => hasPhrase(lower, word));
  const noteHasLeak = ['leak', 'leaks', 'leaking', 'drip', 'drips', 'dripping', 'water leak', 'water leaks', 'moisture', 'wet'].some(word => hasPhrase(lower, word));
  const noteHasCabinet = ['cabinet', 'cabinets', 'drawer', 'drawers', 'cabinet maker'].some(word => hasPhrase(lower, word));
  const noteHasWallSurface = ['sheetrock', 'drywall', 'wall', 'walls', 'ceiling', 'paint'].some(word => hasPhrase(lower, word));
  const noteHasFan = ['fan', 'ceiling fan', 'fan blade', 'squeak', 'squeaking', 'balance', 'out of balance'].some(word => hasPhrase(lower, word));

  if (noteHasFan) {
    const fanItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['ceiling fan', 'fan', 'light fixture'].some(word => hasPhrase(itemLower, word));
    });
    if (fanItem) return fanItem;
  }

  if (noteHasCabinet) {
    const cabinetItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['cabinet', 'cabinets', 'drawer', 'drawers'].some(word => hasPhrase(itemLower, word));
    });
    if (cabinetItem) return cabinetItem;
  }

  if (noteHasWallSurface) {
    const wallItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['wall', 'walls', 'ceiling', 'sheetrock', 'drywall', 'paint'].some(word => hasPhrase(itemLower, word));
    });
    if (wallItem) return wallItem;
  }

  if (noteHasDisposal) {
    const disposalItem = items.find(item => ['disposal', 'garbage disposal', 'garburator'].some(word => hasPhrase(normalizeText(item), word)));
    if (disposalItem) return disposalItem;
  }

  if (noteHasSink && noteHasDrain) {
    const sinkDrainItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['sink', 'sinks', 'faucet', 'vanity', 'under sink'].some(word => hasPhrase(itemLower, word)) &&
        ['drain', 'drains', 'drainage', 'waste', 'p trap', 'p-trap'].some(word => hasPhrase(itemLower, word));
    });
    if (sinkDrainItem) return sinkDrainItem;
    const sinkItem = items.find(item => ['sink', 'sinks', 'faucet', 'vanity', 'under sink'].some(word => hasPhrase(normalizeText(item), word)));
    if (sinkItem) return sinkItem;
  }

  if ((noteHasSink || noteHasLeak) && noteHasLeak && !noteHasToilet) {
    const sinkLeakItem = items.find(item => {
      const itemLower = normalizeText(item);
      const sinkRelated = ['sink', 'sinks', 'under sink', 'vanity', 'shut off', 'shutoff', 'supply line', 'plumbing'].some(word => hasPhrase(itemLower, word));
      const leakRelated = ['leak', 'leaks', 'water leak', 'water leaks', 'moisture'].some(word => hasPhrase(itemLower, word));
      return sinkRelated && leakRelated;
    });
    if (sinkLeakItem) return sinkLeakItem;
  }

  if (noteHasSink && !noteHasToilet) {
    const underSinkItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['under sink', 'under-sink', 'shut off', 'shutoff', 'supply line'].some(word => hasPhrase(itemLower, word));
    });
    if (underSinkItem) return underSinkItem;
    const sinkItem = items.find(item => ['sink', 'sinks', 'faucet', 'vanity'].some(word => hasPhrase(normalizeText(item), word)));
    if (sinkItem) return sinkItem;
  }

  const scored = items.map(item => {
    const itemLower = normalizeText(item);
    let score = 0;

    for (const [concept, phrases] of Object.entries(ITEM_MATCH_SYNONYMS)) {
      const noteHasConcept = phrases.some(phrase => hasPhrase(lower, phrase));
      const itemHasConcept = phrases.some(phrase => hasPhrase(itemLower, phrase)) || hasPhrase(itemLower, concept);
      if (noteHasConcept && itemHasConcept) score += 12;
      if (noteHasConcept && !itemHasConcept) score -= 2;
    }

    const itemWords = itemLower.split(' ').filter(w => w.length > 3);
    for (const word of itemWords) {
      if (hasPhrase(lower, word)) score += 2;
    }

    if (noteHasDisposal && (hasPhrase(itemLower, 'disposal') || hasPhrase(itemLower, 'garbage disposal'))) score += 30;
    if (noteHasDisposal && (hasPhrase(itemLower, 'drain') || hasPhrase(itemLower, 'drains')) && !hasPhrase(itemLower, 'disposal')) score -= 10;
    if (noteHasSink && noteHasLeak && (hasPhrase(itemLower, 'leak') || hasPhrase(itemLower, 'leaks')) && (hasPhrase(itemLower, 'sink') || hasPhrase(itemLower, 'under sink') || hasPhrase(itemLower, 'shut off'))) score += 25;
    if (noteHasSink && noteHasLeak && (hasPhrase(itemLower, 'operation') || hasPhrase(itemLower, 'water pressure'))) score -= 8;
    if (noteHasSink && hasPhrase(itemLower, 'toilet')) score -= 20;
    if (noteHasToilet && (hasPhrase(itemLower, 'sink') || hasPhrase(itemLower, 'faucet'))) score -= 20;
    if ((hasPhrase(lower, 'shower') || hasPhrase(lower, 'tub')) && hasPhrase(itemLower, 'toilet')) score -= 8;
    if (noteHasFan && hasPhrase(itemLower, 'outlet')) score -= 25;
    if (noteHasCabinet && (hasPhrase(itemLower, 'under sink') || hasPhrase(itemLower, 'plumbing'))) score -= 16;
    if (noteHasWallSurface && hasPhrase(itemLower, 'flooring')) score -= 18;

    return { item, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].item : items[0];
}

function detectItemFromNote(note: string, items: string[]): string | null {
  if (items.length === 0) return null;
  const item = findBestChecklistItem(note, items);
  return checklistMatchConfidence(note, item) > 0 ? item : null;
}

function inspectionCostSavingsDetails(findings: InspectionRoomFinding[]): string[] {
  const notes = findings.map(f => (f.notes + ' ' + f.title).toLowerCase());
  const details: string[] = [];
  if (notes.some(n => n.includes('pipe') || n.includes('leak') || n.includes('faucet') || n.includes('water heater') || n.includes('plumbing') || n.includes('drain')))
    details.push('Addressing plumbing issues early prevents costly water damage, mold remediation, and emergency call-out fees — often saving $2,000–$8,000+ in deferred repairs.');
  if (notes.some(n => n.includes('roof') || n.includes('shingle') || n.includes('gutter') || n.includes('flashing') || n.includes('soffit')))
    details.push('Roof and exterior maintenance prevents water infiltration. Minor repairs now typically cost $300–$1,500 versus $10,000–$30,000+ for full roof replacement or structural remediation.');
  if (notes.some(n => n.includes('hvac') || n.includes('furnace') || n.includes('filter') || n.includes('ductwork') || n.includes('a/c') || n.includes('heat pump')))
    details.push('HVAC servicing extends equipment life by 5–10 years and can reduce energy bills by 15–25%, saving hundreds annually and avoiding a $3,000–$12,000 replacement.');
  if (notes.some(n => n.includes('electrical') || n.includes('outlet') || n.includes('breaker') || n.includes('wiring') || n.includes('panel')))
    details.push('Electrical deficiencies addressed proactively eliminate fire and safety risks. Code compliance now avoids $5,000–$20,000 in forced remediation at point of sale or insurance renewal.');
  if (notes.some(n => n.includes('pest') || n.includes('rodent') || n.includes('termite') || n.includes('mold') || n.includes('mould') || n.includes('moisture')))
    details.push('Early pest or mold detection prevents structural damage. Treatment now typically costs $500–$3,000 versus $10,000–$50,000+ in structural repair if left unaddressed.');
  return details;
}

function homeownerFindingDescription(finding: InspectionRoomFinding): string {
  const source = (finding.notes || finding.action || finding.title || '').trim().replace(/\s+/g, ' ');
  if (!source) return finding.title;
  const trimmed = source.length > 120 ? `${source.slice(0, 117).trim()}...` : source;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function guessRepairTrade(finding: InspectionRoomFinding & { room?: string }): string {
  const text = normalizeText([finding.room, finding.title, finding.notes, finding.action].filter(Boolean).join(' '));
  if (['sink', 'leak', 'plumbing', 'faucet', 'drain', 'toilet', 'water heater', 'pipe', 'shut off', 'shutoff'].some(word => hasPhrase(text, word))) return 'Plumbing';
  if (['outlet', 'gfci', 'breaker', 'panel', 'electrical', 'wiring', 'light fixture', 'ceiling fan'].some(word => hasPhrase(text, word))) return 'Electrical';
  if (['hvac', 'air conditioner', 'a/c', 'furnace', 'filter', 'thermostat', 'condenser', 'duct', 'heat pump'].some(word => hasPhrase(text, word))) return 'HVAC';
  if (['sheetrock', 'drywall', 'wall', 'walls', 'ceiling', 'paint', 'texture'].some(word => hasPhrase(text, word))) return 'Drywall / Painting';
  if (['cabinet', 'cabinets', 'drawer', 'countertop', 'trim', 'carpentry'].some(word => hasPhrase(text, word))) return 'Cabinetry / Carpentry';
  if (['roof', 'shingle', 'gutter', 'flashing', 'soffit', 'fascia', 'siding'].some(word => hasPhrase(text, word))) return 'Roofing / Exterior';
  if (['floor', 'flooring', 'tile', 'hardwood', 'laminate'].some(word => hasPhrase(text, word))) return 'Flooring';
  return 'General Maintenance';
}

function recommendedEstimatePricingType(trade: string, finding: InspectionRoomFinding): EstimatePricingType {
  if (finding.status === 'Urgent') return 'Diagnostic';
  if (['Plumbing', 'Electrical', 'HVAC'].includes(trade)) return 'Diagnostic';
  if (['Drywall / Painting', 'Cabinetry / Carpentry', 'Roofing / Exterior', 'Flooring'].includes(trade)) return 'Labor + materials';
  return 'Needs site visit';
}

function buildRepairEstimateLineDraft(finding: InspectionRoomFinding & { room: string }): RepairEstimateLineDraft {
  const trade = guessRepairTrade(finding);
  const description = homeownerFindingDescription(finding);
  const recommendedAction = (finding.action || '').trim();
  return {
    id: `${finding.room}-${finding.title}-${finding.status}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    sourceKey: `${finding.room}||${finding.title}`,
    issue: `${finding.room}: ${finding.title}`,
    description,
    trade,
    pricingType: recommendedEstimatePricingType(trade, finding),
    lowEstimate: '',
    highEstimate: '',
    notes: recommendedAction || `Review ${description.toLowerCase()} and prepare pricing after confirming scope, labor, and materials.`,
  };
}

interface ReportSummaryParts {
  intro: string;
  urgentText: string;
  urgentWithRoom: string[];
  fixedText: string;
  followUpText: string;
  savingsDetails: string[];
}

function buildProfessionalReportSummary(rooms: InspectionRoomData[]): ReportSummaryParts {
  const allFindings = rooms.flatMap(r => r.findings);
  if (allFindings.length === 0) return { intro: '', urgentText: '', urgentWithRoom: [], fixedText: '', followUpText: '', savingsDetails: [] };
  const roomCount = rooms.filter(r => r.findings.length > 0).length;
  const totalItems = allFindings.length;
  const urgent = allFindings.filter(f => f.status === 'Urgent');
  const repair = allFindings.filter(f => f.status === 'Needs Repair');
  const monitor = allFindings.filter(f => f.status === 'Monitor');
  const fixed = allFindings.filter(f => f.status === 'Fixed On Site');
  const pass = allFindings.filter(f => f.status === 'Pass');
  const issueCount = urgent.length + repair.length;

  const urgentWithRoom = urgent.map(f => {
    const room = rooms.find(r => r.findings.some(rf => rf.title === f.title))?.room ?? '';
    const description = homeownerFindingDescription(f);
    return room ? `${room}: ${description}` : description;
  });

  const intro = issueCount === 0
    ? `A thorough inspection of ${roomCount} area${roomCount !== 1 ? 's' : ''} covering ${totalItems} checklist item${totalItems !== 1 ? 's' : ''} was completed. The property is in good overall condition with ${pass.length} item${pass.length !== 1 ? 's' : ''} passing inspection.${monitor.length > 0 ? ` ${monitor.length} item${monitor.length !== 1 ? 's' : ''} should be monitored at the next visit.` : ''}`
    : `A comprehensive inspection of ${roomCount} area${roomCount !== 1 ? 's' : ''} covering ${totalItems} checklist item${totalItems !== 1 ? 's' : ''} identified ${issueCount} item${issueCount !== 1 ? 's' : ''} requiring attention — ${urgent.length} urgent and ${repair.length} in need of repair.${pass.length > 0 ? ` ${pass.length} item${pass.length !== 1 ? 's' : ''} passed with no issues noted.` : ''}`;

  const urgentText = urgent.length > 0
    ? `${urgent.length} item${urgent.length !== 1 ? 's' : ''} require${urgent.length === 1 ? 's' : ''} immediate professional attention.`
    : '';

  const fixedText = fixed.length > 0
    ? `${fixed.length} issue${fixed.length !== 1 ? 's' : ''} ${fixed.length === 1 ? 'was' : 'were'} corrected on site during this visit, creating immediate value for the homeowner and reducing the chance of repeat service or additional damage.`
    : '';

  const repairPart = repair.length > 0
    ? `${repair.length} item${repair.length !== 1 ? 's need' : ' needs'} repair${repair.length <= 3 ? ': ' + repair.map(homeownerFindingDescription).join('; ') : ''}.`
    : '';
  const monitorPart = monitor.length > 0
    ? `${monitor.length} item${monitor.length !== 1 ? 's' : ''} should be monitored and reassessed at the next visit.`
    : '';
  const followUpText = [repairPart, monitorPart].filter(Boolean).join(' ');

  const savingsDetails = inspectionCostSavingsDetails(allFindings.filter(f => f.status !== 'Pass'));

  return { intro, urgentText, urgentWithRoom, fixedText, followUpText, savingsDetails };
}

function buildInspectionSummaryText(rooms: InspectionRoomData[]): string {
  const { intro, urgentText, fixedText, followUpText } = buildProfessionalReportSummary(rooms);
  return [intro, urgentText, fixedText, followUpText].filter(Boolean).join(' ');
}

function normalizeServiceRequestSummary(request: ServiceRequestSummary): ServiceRequestSummary {
  if (!request.appointment) return request;
  const rawAppointment = request.appointment as ServiceRequestAppointment & { proposed_by?: 'contractor' | 'homeowner' | null };
  return {
    ...request,
    appointment: {
      ...request.appointment,
      proposed_by: rawAppointment.proposed_by ?? 'contractor',
    },
  };
}

function currentRoute() {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = rawHash.split('?');
  const route = (path || 'home') as RouteName;
  return {
    route: ['home', 'homeowner', 'contractor', 'admin', 'profile'].includes(route) ? route : 'home',
    query: new URLSearchParams(query),
  };
}

function updateRoute(route: RouteName, query = '') {
  window.location.hash = query ? `/${route}?${query}` : `/${route}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function createInviteCode() {
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function centsToDollars(value?: number | null) {
  if (!value) return '';
  return (value / 100).toFixed(2);
}

function dollarsToCents(value: string) {
  const numeric = Number(value.replace(/[$,]/g, '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

function estimateLineTotalCents(line: EstimateLineDraft) {
  const quantity = Number(line.quantity);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  return Math.round(safeQuantity * dollarsToCents(line.unit_price));
}

function estimateTotalCents(lines: EstimateLineDraft[]) {
  return lines.reduce((sum, line) => sum + estimateLineTotalCents(line), 0);
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cleanInvoiceFileStem(fileName: string) {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractInvoiceAmount(text: string) {
  const match = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)|(?:total|amount|paid|invoice)\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return (match?.[1] || match?.[2] || '').replace(/,/g, '');
}

function extractInvoiceDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-_./](\d{1,2})[-_./](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = text.match(/\b(\d{1,2})[-_./](\d{1,2})[-_./](20\d{2})\b/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return '';
}

function inferInvoiceCategory(text: string) {
  const normalized = normalizeText(text);
  return SERVICE_REQUEST_CATEGORIES.find(category => hasPhrase(normalized, category)) || '';
}

function guessInvoiceContractorName(text: string) {
  return cleanInvoiceFileStem(text)
    .replace(/\b(invoice|receipt|paid|total|amount|servsync)\b/gi, ' ')
    .replace(/\$\s*[\d,]+(?:\.\d{1,2})?/g, ' ')
    .replace(/\b20\d{2}[-_./]\d{1,2}[-_./]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[-_./]\d{1,2}[-_./]20\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function invoiceDraftFromFileName(fileName: string) {
  const stem = cleanInvoiceFileStem(fileName);
  return {
    title: stem ? `${stem} invoice` : 'Invoice / receipt',
    cost: extractInvoiceAmount(stem),
    performed_at: extractInvoiceDate(stem),
    category: inferInvoiceCategory(stem),
    contractor_name: guessInvoiceContractorName(stem),
  };
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'servsync';
}

function createEstimatePdf(
  estimate: Estimate,
  context: { contractorName: string; customerName: string; customerAddress?: string },
) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 18;

  const addPageIfNeeded = (height = 12) => {
    if (y + height <= pageH - margin) return;
    pdf.addPage();
    y = margin;
  };
  const addWrappedText = (text: string, x: number, maxW: number, fontSize = 10, lineGap = 5) => {
    if (!text.trim()) return;
    pdf.setFontSize(fontSize);
    const lines = pdf.splitTextToSize(text, maxW);
    lines.forEach((line: string) => {
      addPageIfNeeded(lineGap);
      pdf.text(line, x, y);
      y += lineGap;
    });
  };
  const sectionTitle = (title: string) => {
    addPageIfNeeded(10);
    y += 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(title, margin, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
  };

  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, pageW, 34, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('Estimate', margin, 18);
  pdf.setFontSize(10);
  pdf.text(context.contractorName || 'Contractor', margin, 27);

  y = 45;
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  addWrappedText(estimate.title || 'Estimate', margin, contentW - 45, 16, 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Status: ${estimate.status}`, margin, y);
  pdf.text(`Updated: ${new Date(estimate.updated_at).toLocaleDateString('en-US')}`, margin, y + 5);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42);
  pdf.text(formatMoney(estimate.total_cents), pageW - margin, y, { align: 'right' });
  y += 14;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  sectionTitle('Customer');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  addWrappedText(context.customerName || 'Customer', margin, contentW, 10, 5);
  if (context.customerAddress) addWrappedText(context.customerAddress, margin, contentW, 10, 5);

  if (estimate.scope) {
    sectionTitle('Scope of Work');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(estimate.scope, margin, contentW, 10, 5);
  }

  sectionTitle('Line Items');
  const lines = [...(estimate.line_items || [])].sort((a, b) => a.sort_order - b.sort_order);
  if (lines.length === 0) {
    addWrappedText('No line items listed.', margin, contentW, 10, 5);
  } else {
    lines.forEach(line => {
      const lineTotal = Math.round(Number(line.quantity || 0) * line.unit_price_cents);
      addPageIfNeeded(18);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(margin, y - 4, contentW, 15, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(line.description || 'Line item', margin + 3, y);
      pdf.text(formatMoney(lineTotal), pageW - margin - 3, y, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${line.line_type} · ${line.quantity} ${line.unit} @ ${formatMoney(line.unit_price_cents)}`, margin + 3, y + 5);
      y += 18;
    });
  }

  addPageIfNeeded(16);
  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Total', margin, y);
  pdf.text(formatMoney(estimate.total_cents), pageW - margin, y, { align: 'right' });
  y += 8;

  if (estimate.notes) {
    sectionTitle('Notes / Exclusions');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(estimate.notes, margin, contentW, 10, 5);
  }

  if (estimate.terms) {
    sectionTitle('Terms');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(estimate.terms, margin, contentW, 10, 5);
  }

  const fileName = `${safeFileName(`${context.contractorName}-${estimate.title}`)}.pdf`;
  return { blob: pdf.output('blob'), fileName };
}

function downloadEstimatePdf(
  estimate: Estimate,
  context: { contractorName: string; customerName: string; customerAddress?: string },
) {
  const { blob, fileName } = createEstimatePdf(estimate, context);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function adminDraftFromContractor(contractor: ContractorProfile): AdminContractorDraft {
  return {
    account_status: contractor.account_status || 'active',
    subscription_status: contractor.subscription_status || 'trialing',
    monthly_price: centsToDollars(contractor.monthly_price_cents),
    subscription_notes: contractor.subscription_notes || '',
    admin_notes: contractor.admin_notes || '',
  };
}

function inviteDraftFromInvite(invite: ContractorInvite): InviteRewardDraft {
  return {
    reward_status: invite.reward_status || 'not_eligible',
    reward_notes: invite.reward_notes || '',
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not used yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toList(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function fromList(value?: string[]) {
  return (value || []).join(', ');
}

function normalizeSharingPermissions(permissions?: Partial<SharingPermissions> | null): SharingPermissions {
  return {
    ...EMPTY_PERMISSIONS,
    ...(permissions || {}),
  };
}

function connectionSourceLabel(source?: string | null) {
  if (source === 'homeowner_request') return 'Requested by homeowner';
  if (source === 'homeowner_reconnect') return 'Originally requested by homeowner';
  if (source === 'contractor_invite') return 'Started from contractor referral link';
  return 'Connection source recorded';
}

function connectionEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    connection_requested: 'Connection requested',
    connection_approved: 'Connection approved',
    connection_request_accepted: 'Contractor accepted request',
    connection_request_declined: 'Contractor declined request',
    permissions_updated: 'Sharing permissions updated',
    connection_revoked: 'Access revoked',
    reconnect_requested: 'Reconnect requested',
  };
  return labels[eventType] || eventType.replace(/_/g, ' ');
}

function serviceRequestStatusLabel(status: ServiceRequestStatus) {
  const labels: Record<ServiceRequestStatus, string> = {
    open: 'Open',
    contractor_responded: 'Responded',
    homeowner_replied: 'Replied',
    declined: 'Declined',
    closed: 'Closed',
  };
  return labels[status] || status;
}

function serviceRequestStatusClass(status: ServiceRequestStatus) {
  if (status === 'open') return 'bg-slate-100 text-slate-700';
  if (status === 'contractor_responded') return 'bg-blue-50 text-blue-700';
  if (status === 'homeowner_replied') return 'bg-amber-50 text-amber-700';
  if (status === 'closed') return 'bg-emerald-50 text-emerald-700';
  return 'bg-red-50 text-red-700';
}

function serviceRequestStatusAccent(status: ServiceRequestStatus) {
  if (status === 'open') return 'border-l-slate-300';
  if (status === 'contractor_responded') return 'border-l-blue-400';
  if (status === 'homeowner_replied') return 'border-l-amber-400';
  if (status === 'closed') return 'border-l-emerald-400';
  return 'border-l-red-300';
}

function serviceRequestSearchText(request: ServiceRequestSummary) {
  return normalizeText([
    request.title,
    request.description,
    request.category,
    request.urgency,
    request.status,
    request.contractor_name,
    request.homeowner_name,
    request.homeowner_city,
    request.closing_summary,
    request.quote?.scope,
    request.quote?.status,
    request.appointment?.status,
    request.appointment?.notes,
    ...(request.messages || []).map(message => message.body),
  ].filter(Boolean).join(' '));
}

function serviceRequestMatchesSearch(request: ServiceRequestSummary, query: string) {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const searchable = serviceRequestSearchText(request);
  return terms.every(term => searchable.includes(term));
}

function contractorRequestNeedsFollowUp(request: ServiceRequestSummary) {
  return !['closed', 'declined'].includes(request.status)
    && (
      request.status === 'homeowner_replied'
      || request.quote?.status === 'accepted'
      || (request.appointment?.status === 'proposed' && request.appointment.proposed_by === 'homeowner')
    );
}

function homeownerRequestNeedsResponse(request: ServiceRequestSummary) {
  return !['closed', 'declined'].includes(request.status)
    && (
      request.status === 'contractor_responded'
      || request.quote?.status === 'pending'
      || (request.appointment?.status === 'proposed' && request.appointment.proposed_by === 'contractor')
    );
}

function homeownerRequestQueueFor(request: ServiceRequestSummary): HomeownerRequestView {
  if (request.status === 'closed') return 'closed';
  if (request.status === 'declined') return 'declined';
  if (homeownerRequestNeedsResponse(request)) return 'attention';
  if (request.status === 'open' && !request.appointment) return 'new';
  return 'scheduled';
}

function contractorRequestQueueFor(request: ServiceRequestSummary): ContractorRequestView {
  if (request.status === 'closed') return 'closed';
  if (request.status === 'declined') return 'declined';
  if (request.status === 'open') return 'new';
  if (request.appointment && !contractorRequestNeedsFollowUp(request)) return 'scheduled';
  return 'open';
}

function appointmentNextActionText(appointment: ServiceRequestAppointment, perspective: 'homeowner' | 'contractor') {
  if (appointment.status === 'confirmed') return 'Confirmed on both calendars.';
  if (appointment.status === 'completed') return 'Completed.';
  if (appointment.status === 'cancelled') return 'Cancelled.';
  if (appointment.status === 'proposed') {
    if (appointment.proposed_by === perspective) {
      return perspective === 'homeowner'
        ? 'Waiting on the contractor to confirm this requested time.'
        : 'Waiting on the homeowner to confirm this proposed time.';
    }
    return 'Your response is needed.';
  }
  return '';
}

function appointmentResponseText(appointment: ServiceRequestAppointment, perspective: 'homeowner' | 'contractor') {
  if (appointment.status !== 'proposed') return '';
  if (appointment.proposed_by === perspective) return appointmentNextActionText(appointment, perspective);
  return perspective === 'homeowner'
    ? 'The contractor proposed this time. Confirm it, decline it, or request another time.'
    : 'The homeowner requested this time. Confirm it, decline it, or propose another time.';
}

function notificationCategoryLabel(type: string) {
  if (type.includes('support')) return 'Support';
  if (type.includes('appointment')) return 'Calendar';
  if (type.includes('estimate')) return 'Estimate';
  if (type.includes('quote')) return 'Quote';
  if (type.includes('connection')) return 'Connection';
  if (type.includes('inspection') || type.includes('report')) return 'Field Work';
  if (type.includes('log')) return 'Home History';
  return 'Service Request';
}

function notificationCategoryClass(type: string) {
  if (type.includes('support')) return 'bg-sky-100 text-sky-700';
  if (type.includes('appointment')) return 'bg-amber-100 text-amber-700';
  if (type.includes('estimate')) return 'bg-emerald-100 text-emerald-700';
  if (type.includes('quote')) return 'bg-emerald-100 text-emerald-700';
  if (type.includes('connection')) return 'bg-blue-100 text-blue-700';
  if (type.includes('inspection') || type.includes('report')) return 'bg-violet-100 text-violet-700';
  return 'bg-slate-100 text-slate-700';
}

const SUPPORT_CATEGORY_OPTIONS: { value: SupportInquiryCategory; label: string }[] = [
  { value: 'feature_request', label: 'New feature request' },
  { value: 'tweak', label: 'Tweak existing feature' },
  { value: 'bug', label: 'Something is not working' },
  { value: 'question', label: 'Question' },
  { value: 'billing', label: 'Billing or account' },
  { value: 'other', label: 'Other' },
];

const SUPPORT_STATUS_OPTIONS: { value: SupportInquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_on_user', label: 'Waiting on user' },
  { value: 'waiting_on_admin', label: 'Waiting on ServSync' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

function supportCategoryLabel(category: SupportInquiryCategory | string) {
  return SUPPORT_CATEGORY_OPTIONS.find(option => option.value === category)?.label ?? 'Other';
}

function supportStatusLabel(status: SupportInquiryStatus | string, perspective: 'user' | 'admin' = 'user') {
  if (perspective === 'user' && status === 'waiting_on_admin') return 'Waiting on ServSync';
  if (perspective === 'user' && status === 'waiting_on_user') return 'Waiting on you';
  return SUPPORT_STATUS_OPTIONS.find(option => option.value === status)?.label ?? status;
}

function supportStatusClass(status: SupportInquiryStatus | string) {
  if (status === 'new') return 'bg-blue-100 text-blue-700';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-700';
  if (status === 'waiting_on_user') return 'bg-purple-100 text-purple-700';
  if (status === 'waiting_on_admin') return 'bg-sky-100 text-sky-700';
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-700';
}

function urgencyLabel(urgency: string) {
  if (urgency === 'urgent') return '🔴 Urgent';
  if (urgency === 'normal') return 'Normal';
  return 'Low';
}

function groupConnectionHistory(events: ConnectionAuditEvent[]) {
  return events.reduce<Record<string, ConnectionAuditEvent[]>>((groups, event) => {
    if (!groups[event.connection_id]) {
      groups[event.connection_id] = [];
    }
    groups[event.connection_id].push(event);
    return groups;
  }, {});
}

function readableError(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const possible = err as { message?: string; details?: string; hint?: string; code?: string };
    return JSON.stringify({
      message: possible.message || fallback,
      details: possible.details || '',
      hint: possible.hint || '',
      code: possible.code || '',
    });
  }
  return fallback;
}

function inputClass() {
  return 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15';
}

function buttonClass(kind: 'primary' | 'secondary' | 'danger' = 'primary') {
  if (kind === 'secondary') {
    return 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700';
  }
  if (kind === 'danger') {
    return 'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700';
  }
  return 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700';
}

export default function App() {
  const [{ route, query }, setRouteState] = useState(currentRoute);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');

  useEffect(() => {
    const onHashChange = () => setRouteState(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const loadProfile = async (activeSession: Session | null) => {
    if (!supabase || !activeSession?.user) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .maybeSingle();

    if (error) {
      setAuthMessage(error.message);
      setProfile(null);
      return;
    }

    setProfile((data as Profile | null) || null);
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setProfile(null);
    updateRoute('home');
  };

  if (!supabaseConfigured) {
    return (
      <PublicShell route={route} profile={profile} onSignOut={signOut}>
        <SetupNotice />
      </PublicShell>
    );
  }

  if (loading) {
    return (
      <PublicShell route={route} profile={profile} onSignOut={signOut}>
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center text-sm font-semibold text-slate-400 shadow-lg">
          Loading ServSync...
        </div>
      </PublicShell>
    );
  }

  if (!session) {
    return (
      <PublicShell route={route} profile={profile} onSignOut={signOut}>
        {route === 'home' ? (
          <LandingPage />
        ) : (
          <AuthPage
            role={route === 'admin' ? 'platform_admin' : route === 'contractor' ? 'contractor' : 'homeowner'}
            inviteCode={query.get('invite') || ''}
            onAuthed={() => void loadProfile(session)}
          />
        )}
      </PublicShell>
    );
  }

  if (!profile) {
    return (
      <PublicShell route={route} profile={profile} onSignOut={signOut}>
        <MissingProfile
          session={session}
          requestedRole={route === 'admin' ? 'platform_admin' : route === 'contractor' ? 'contractor' : 'homeowner'}
          onCreated={() => void loadProfile(session)}
        />
        {authMessage && <Notice tone="error" text={authMessage} />}
      </PublicShell>
    );
  }

  if (route === 'profile') {
    return (
      <PublicShell route={route} profile={profile} onSignOut={signOut}>
        <ContractorPublicProfilePage slug={query.get('slug') ?? ''} currentProfile={profile} />
      </PublicShell>
    );
  }

  return (
    <>
      {profile.role === 'homeowner' && <HomeownerDashboard profile={profile} onSignOut={signOut} />}
      {profile.role === 'contractor' && <ContractorDashboard profile={profile} onSignOut={signOut} />}
      {profile.role === 'platform_admin' && <PlatformAdminDashboard onSignOut={signOut} />}
    </>
  );
}

function PublicShell({
  route,
  profile,
  onSignOut,
  children,
}: {
  route: RouteName;
  profile: Profile | null;
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-900">
      <TopBar route={route} profile={profile} onSignOut={onSignOut} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}


function TopBar({
  route,
  profile,
  onSignOut,
}: {
  route: RouteName;
  profile: Profile | null;
  onSignOut: () => Promise<void>;
}) {
  return (
    <header className="border-b border-slate-700/50 bg-slate-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => updateRoute('home')} className="flex items-center gap-3 text-left">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight text-white">ServSync</p>
            <p className="text-xs font-medium text-slate-400">Homeowner-contractor connections</p>
          </div>
        </button>
        <nav className="hidden items-center gap-2 md:flex">
          {!profile && (
            <>
              <NavButton active={route === 'homeowner'} onClick={() => updateRoute('homeowner')}>Homeowner</NavButton>
              <NavButton active={route === 'contractor'} onClick={() => updateRoute('contractor')}>Contractor</NavButton>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {profile ? (
            <>
              <span className="hidden rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 sm:inline">
                {ROLE_LABEL[profile.role]}
              </span>
              <button type="button" onClick={() => void onSignOut()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700">
                <LogOut size={16} />
                Logout
              </button>
            </>
          ) : (
            <button type="button" onClick={() => updateRoute('contractor')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700">
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function QRDisplay({ value, fileName = 'qr-code' }: { value: string; fileName?: string }) {
  const canvasId = `qr-${fileName.replace(/\W/g, '-')}`;

  const download = () => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl bg-white p-3">
        <QRCodeCanvas id={canvasId} value={value} size={160} bgColor="#ffffff" fgColor="#0f172a" level="M" />
      </div>
      <button type="button" onClick={download} className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors">
        Download PNG
      </button>
    </div>
  );
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  trialing:  { label: 'Trial',    color: 'text-blue-400' },
  active:    { label: 'Active',   color: 'text-emerald-400' },
  past_due:  { label: 'Past due', color: 'text-amber-400' },
  paused:    { label: 'Paused',   color: 'text-slate-400' },
  canceled:  { label: 'Canceled', color: 'text-red-400' },
  unpaid:    { label: 'Unpaid',   color: 'text-red-400' },
};

function ContractorBillingCard({ contractor }: { contractor: ContractorProfile | null }) {
  if (!contractor) return null;
  const sub = SUBSCRIPTION_STATUS_LABELS[contractor.subscription_status] ?? { label: contractor.subscription_status, color: 'text-slate-400' };
  const price = contractor.monthly_price_cents > 0
    ? `$${(contractor.monthly_price_cents / 100).toFixed(2)}/mo`
    : 'No price set';

  return (
    <Card title="Subscription & billing" icon={<CreditCard size={18} />}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Status</p>
            <p className={`text-sm font-semibold ${sub.color}`}>{sub.label}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Plan</p>
            <p className="text-sm text-slate-200">{price}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Account</p>
            <p className="text-sm text-slate-200 capitalize">{contractor.account_status}</p>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-400 cursor-not-allowed opacity-50"
          title="Billing portal — coming soon"
        >
          <CreditCard size={14} />
          Manage billing
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-600">Billing portal coming soon. Your subscription status is managed by the platform admin.</p>
    </Card>
  );
}

function EmailNotificationsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const toggle = async (next: boolean) => {
    if (!supabase) return;
    setSaving(true);
    setEnabled(next);
    await supabase.rpc('servsync_update_email_preferences', { p_enabled: next });
    setSaving(false);
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-200">Email notifications</p>
        <p className="text-xs text-slate-500 mt-0.5">Receive email alerts for new activity on your account.</p>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void toggle(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          enabled ? 'bg-blue-600' : 'bg-slate-600'
        } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-pressed={enabled}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function PublicReviewCard({ review }: { review: PublicReview }) {
  const hasKudos = review.kudos.length > 0;
  const attribution = [review.reviewer_display_name, review.reviewer_location].filter(Boolean).join(', ');
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <StarDisplay rating={review.rating} />
        <p className="shrink-0 text-xs text-slate-500">{new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</p>
      </div>
      {hasKudos && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {review.kudos.map(k => (
            <span key={k} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{k}</span>
          ))}
        </div>
      )}
      {review.body && <p className="mt-2 text-sm italic text-slate-700">"{review.body}"</p>}
      <p className="mt-1.5 text-xs text-slate-500">{attribution || 'Anonymous homeowner'}</p>
    </div>
  );
}

function LandingPage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-8 rounded-3xl border border-slate-700 bg-slate-800 p-6 shadow-lg lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">ServSync foundation</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            One place for homeowners and contractors to connect with permission.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Homeowners own their home profile. Contractors own their business profile. ServSync manages the connection,
            referral, and sharing rules between them.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => updateRoute('homeowner')} className={buttonClass('primary')}>
              Homeowner portal <ArrowRight size={16} />
            </button>
            <button type="button" onClick={() => updateRoute('contractor')} className={buttonClass('secondary')}>
              Contractor portal <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-700 p-5">
          <div className="grid gap-3">
            <FeatureRow icon={<UserRound size={18} />} title="Homeowner profile" text="Homeowner controls personal and home details." />
            <FeatureRow icon={<Building2 size={18} />} title="Contractor profile" text="Business information, service areas, categories, and credentials." />
            <FeatureRow icon={<Link2 size={18} />} title="Invite links" text="Contractors can invite homeowners without mass-searching or soliciting." />
            <FeatureRow icon={<Lock size={18} />} title="Permission sharing" text="Each connection can have its own sharing permissions." />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-slate-800 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-900/30 text-blue-400">{icon}</div>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="mt-1 text-sm text-slate-400">{text}</p>
      </div>
    </div>
  );
}

function AuthPage({ role, inviteCode, onAuthed }: { role: UserRole; inviteCode: string; onAuthed: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(inviteCode ? 'signup' : 'signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthed();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            referral_invite_code: role === 'homeowner' ? inviteCode : '',
          },
        },
      });
      if (error) throw error;

      if (data.session && data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
        });
        onAuthed();
      } else {
        setMessage('Account created. Check your email if Supabase asks you to confirm before signing in.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to complete authentication.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-3xl border border-slate-700 bg-slate-800 p-6 shadow-lg">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">{ROLE_LABEL[role]}</p>
          <h1 className="mt-2 text-3xl font-bold text-white">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
          {inviteCode && (
            <p className="mt-2 rounded-xl bg-blue-900/20 px-3 py-2 text-sm font-medium text-blue-400">
              Contractor referral link detected. You can create your homeowner account without automatically sharing any private information.
            </p>
          )}
        </div>
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            if (!busy && email && password) void submit();
          }}
        >
          {mode === 'signup' && (
            <Field label="Full name">
              <input className={inputClass()} value={fullName} onChange={event => setFullName(event.target.value)} />
            </Field>
          )}
          <Field label="Email">
            <input className={inputClass()} type="email" value={email} onChange={event => setEmail(event.target.value)} />
          </Field>
          <Field label="Password">
            <input className={inputClass()} type="password" value={password} onChange={event => setPassword(event.target.value)} />
          </Field>
          {mode === 'signup' && (
            <p className="text-xs text-slate-400">Use a strong password. Supabase may reject short or weak passwords.</p>
          )}
          <button type="submit" disabled={busy || !email || !password} className={buttonClass('primary')}>
            <KeyRound size={16} />
            {busy ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          {message && <Notice tone="info" text={message} />}
        </form>
        <div className="mt-6 border-t border-slate-700 pt-4">
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            {mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MissingProfile({
  session,
  requestedRole,
  onCreated,
}: {
  session: Session;
  requestedRole: UserRole;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState(session.user.user_metadata?.full_name || '');
  const [role, setRole] = useState<UserRole>(requestedRole);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const createProfile = async () => {
    if (!supabase) return;
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: session.user.id,
        email: session.user.email || '',
        role,
        full_name: fullName,
      });
      if (error) throw error;
      onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to create profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-slate-700 bg-slate-800 p-6 shadow-lg">
      <h1 className="text-2xl font-bold text-white">Finish profile setup</h1>
      <p className="mt-2 text-sm text-slate-400">Your login exists, but ServSync needs a role profile before continuing.</p>
      <div className="mt-5 space-y-4">
        <Field label="Full name">
          <input className={inputClass()} value={fullName} onChange={event => setFullName(event.target.value)} />
        </Field>
        <Field label="Role">
          <select className={inputClass()} value={role} onChange={event => setRole(event.target.value as UserRole)}>
            <option value="homeowner">Homeowner</option>
            <option value="contractor">Contractor</option>
            <option value="platform_admin">ServSync Admin</option>
          </select>
        </Field>
        <button type="button" onClick={() => void createProfile()} disabled={busy} className={buttonClass('primary')}>
          {busy ? 'Saving...' : 'Create profile'}
        </button>
        {message && <Notice tone="error" text={message} />}
      </div>
    </div>
  );
}

function HomeownerDashboard({ profile, onSignOut }: { profile: Profile; onSignOut: () => Promise<void> }) {
  const [homeownerTab, setHomeownerTab] = useState<HomeownerTab>(() => storedTab(STORAGE_KEYS.homeownerTab, ['overview', 'home', 'contractors', 'requests', 'calendar', 'estimates', 'log', 'documents', 'discover', 'support'] as const, 'overview'));
  const [homeowner, setHomeowner] = useState<HomeownerProfile | null>(null);
  const [home, setHome] = useState<HomeProfile | null>(null);
  const [connections, setConnections] = useState<HomeownerConnection[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestSummary[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [directoryContractors, setDirectoryContractors] = useState<ContractorProfile[]>([]);
  const [directoryCategory, setDirectoryCategory] = useState('');
  const [directoryLocation, setDirectoryLocation] = useState('');
  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null);
  const [requestingConnectionId, setRequestingConnectionId] = useState<string | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, SharingPermissions>>({});
  const [connectionHistory, setConnectionHistory] = useState<Record<string, ConnectionAuditEvent[]>>({});
  const [savingConnectionId, setSavingConnectionId] = useState<string | null>(null);
  const [revokingConnectionId, setRevokingConnectionId] = useState<string | null>(null);
  const [reconnectingConnectionId, setReconnectingConnectionId] = useState<string | null>(null);
  const [reconnectDraftConnectionId, setReconnectDraftConnectionId] = useState<string | null>(null);
  const [serviceRequestDraft, setServiceRequestDraft] = useState<HomeownerServiceRequestDraft>({
    connection_id: '',
    category: '',
    urgency: 'normal',
    title: '',
    description: '',
  });
  const [serviceProblemText, setServiceProblemText] = useState('');
  const [homeownerRequestView, setHomeownerRequestView] = useState<HomeownerRequestView>(() => storedTab(STORAGE_KEYS.homeownerRequestView, ['attention', 'new', 'scheduled', 'closed', 'declined'] as const, 'attention'));
  const [homeownerRequestSearch, setHomeownerRequestSearch] = useState(() => window.localStorage.getItem(STORAGE_KEYS.homeownerRequestSearch) ?? '');
  const [requestComposerOpen, setRequestComposerOpen] = useState(false);
  const [homeownerReplyDrafts, setHomeownerReplyDrafts] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [supportInquiries, setSupportInquiries] = useState<SupportInquiry[]>([]);
  const [supportDraft, setSupportDraft] = useState<{ category: SupportInquiryCategory; title: string; body: string }>({ category: 'feature_request', title: '', body: '' });
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [savingSupport, setSavingSupport] = useState(false);
  const [homeDocuments, setHomeDocuments] = useState<HomeDocument[]>([]);
  const [docUploadType, setDocUploadType] = useState<HomeDocumentType>('other');
  const [docUploadNotes, setDocUploadNotes] = useState('');
  const [docUploading, setDocUploading] = useState(false);
  const [docDeletingId, setDocDeletingId] = useState<string | null>(null);
  const [maintenanceLog, setMaintenanceLog] = useState<MaintenanceLogEntry[]>([]);
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [logDraft, setLogDraft] = useState<{ service_request_id: string | null; category: string; title: string; description: string; performed_at: string; contractor_name: string; cost: string; notes: string }>({ service_request_id: null, category: '', title: '', description: '', performed_at: new Date().toISOString().slice(0,10), contractor_name: '', cost: '', notes: '' });
  const [logInvoiceFile, setLogInvoiceFile] = useState<File | null>(null);
  const [logInvoiceNotice, setLogInvoiceNotice] = useState('');
  const [savingLogEntry, setSavingLogEntry] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [quickLogDrafts, setQuickLogDrafts] = useState<Record<string, boolean>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { open: boolean; rating: number; kudos: string[]; body: string; displayName: string; location: string }>>({});
  const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);
  const [newRequestFiles, setNewRequestFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<Record<string, File[]>>({});
  const [savingServiceRequest, setSavingServiceRequest] = useState(false);
  const [updatingServiceRequestId, setUpdatingServiceRequestId] = useState<string | null>(null);
  const [updatingQuoteRequestId, setUpdatingQuoteRequestId] = useState<string | null>(null);
  const [updatingEstimateId, setUpdatingEstimateId] = useState<string | null>(null);
  const [filingEstimateId, setFilingEstimateId] = useState<string | null>(null);
  const [updatingAppointmentRequestId, setUpdatingAppointmentRequestId] = useState<string | null>(null);
  const [counterProposeDrafts, setCounterProposeDrafts] = useState<Record<string, { open: boolean; proposedAt: string; notes: string }>>({});
  const [homeownerRescheduleDrafts, setHomeownerRescheduleDrafts] = useState<Record<string, { open: boolean; proposedAt: string; notes: string }>>({});
  const [homeownerReschedulingId, setHomeownerReschedulingId] = useState<string | null>(null);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(() => storedStringSet(STORAGE_KEYS.homeownerExpandedRequests));
  const [reopenDrafts, setReopenDrafts] = useState<Record<string, { open: boolean; body: string }>>({});
  const [reopeningRequestId, setReopeningRequestId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.homeownerTab, homeownerTab);
  }, [homeownerTab]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.homeownerRequestView, homeownerRequestView);
  }, [homeownerRequestView]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.homeownerRequestSearch, homeownerRequestSearch);
  }, [homeownerRequestSearch]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.homeownerExpandedRequests, JSON.stringify([...expandedRequestIds]));
  }, [expandedRequestIds]);

  const profileDraft = homeowner || {
    user_id: profile.id,
    display_name: profile.full_name,
    phone: '',
    city: '',
    state: '',
    zip_code: '',
    created_at: '',
    updated_at: '',
  };

  const homeDraft = home || {
    id: '',
    homeowner_user_id: profile.id,
    nickname: 'My Home',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    home_type: '',
    year_built: '',
    square_feet: '',
    notes: '',
    created_at: '',
    updated_at: '',
  };

  const loadHomeowner = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const [profileRes, homeRes, connectionsRes, directoryRes, serviceRequestsRes, estimatesRes, notifRes, logRes, docsRes, supportRes] = await Promise.all([
        supabase.from('homeowner_profiles').select('*').eq('user_id', profile.id).maybeSingle(),
        supabase.from('homes').select('*').eq('homeowner_user_id', profile.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.rpc('servsync_get_homeowner_connections'),
        supabase.from('contractor_profiles').select('*').eq('public_profile_enabled', true).eq('account_status', 'active').order('business_name', { ascending: true }),
        supabase.rpc('servsync_homeowner_service_requests'),
        supabase.from('estimates').select('*, line_items:estimate_line_items(*)').eq('homeowner_user_id', profile.id).neq('status', 'draft').order('updated_at', { ascending: false }),
        supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('home_maintenance_log').select('*').eq('homeowner_user_id', profile.id).order('performed_at', { ascending: false }),
        supabase.from('home_documents').select('*').eq('homeowner_user_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('support_inquiries').select('*, messages:support_inquiry_messages(*)').eq('requester_user_id', profile.id).order('updated_at', { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (homeRes.error) throw homeRes.error;
      if (connectionsRes.error) throw connectionsRes.error;
      if (serviceRequestsRes.error) throw serviceRequestsRes.error;

      setHomeowner((profileRes.data as HomeownerProfile | null) || null);
      setHome((homeRes.data as HomeProfile | null) || null);
      setDirectoryContractors((directoryRes.data || []) as ContractorProfile[]);
      const loadedConnections = (connectionsRes.data || []) as HomeownerConnection[];
      const connectionIds = loadedConnections.map(connection => connection.connection_id);
      const historyRes = connectionIds.length
        ? await supabase
            .from('connection_audit_events')
            .select('*')
            .in('connection_id', connectionIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (historyRes.error) throw historyRes.error;

      setConnections(loadedConnections);
      setServiceRequests(((serviceRequestsRes.data || []) as ServiceRequestSummary[]).map(normalizeServiceRequestSummary));
      if (!estimatesRes.error) setEstimates((estimatesRes.data || []) as Estimate[]);
      setConnectionHistory(groupConnectionHistory((historyRes.data || []) as ConnectionAuditEvent[]));
      setPermissionDrafts(loadedConnections.reduce<Record<string, SharingPermissions>>((drafts, connection) => {
        drafts[connection.connection_id] = normalizeSharingPermissions(connection.permissions);
        return drafts;
      }, {}));
      if (!notifRes.error) setNotifications((notifRes.data || []) as AppNotification[]);
      if (!logRes.error) setMaintenanceLog((logRes.data || []) as MaintenanceLogEntry[]);
      if (!docsRes.error) setHomeDocuments((docsRes.data || []) as HomeDocument[]);
      if (!supportRes.error) setSupportInquiries((supportRes.data || []) as SupportInquiry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load homeowner dashboard.');
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void loadHomeowner();
  }, [loadHomeowner]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel('homeowner-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        payload => { setNotifications(prev => [payload.new as AppNotification, ...prev]); }
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [profile.id]);

  const markNotificationsRead = async (ids: string[]) => {
    if (!supabase || ids.length === 0) return;
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n));
    await supabase.rpc('servsync_mark_notifications_read', { p_ids: ids });
  };

  const createSupportInquiry = async () => {
    if (!supabase) return;
    if (!supportDraft.title.trim() || !supportDraft.body.trim()) {
      setError('Please add a short title and message before sending support.');
      return;
    }
    setSavingSupport(true);
    setNotice('');
    setError('');
    try {
      const { data: inquiry, error: inquiryError } = await supabase
        .from('support_inquiries')
        .insert({
          requester_user_id: profile.id,
          requester_role: 'homeowner',
          category: supportDraft.category,
          title: supportDraft.title.trim(),
          status: 'new',
        })
        .select('*')
        .single();
      if (inquiryError) throw inquiryError;
      const { error: messageError } = await supabase.from('support_inquiry_messages').insert({
        inquiry_id: inquiry.id,
        actor_user_id: profile.id,
        actor_role: 'homeowner',
        message_type: 'user_message',
        body: supportDraft.body.trim(),
      });
      if (messageError) throw messageError;
      setSupportDraft({ category: 'feature_request', title: '', body: '' });
      setNotice('ServSync received your inquiry. You can track replies in Support.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to send support inquiry.'));
    } finally {
      setSavingSupport(false);
    }
  };

  const replyToSupportInquiry = async (inquiry: SupportInquiry) => {
    if (!supabase) return;
    const body = (supportReplyDrafts[inquiry.id] || '').trim();
    if (!body) return;
    setSavingSupport(true);
    setNotice('');
    setError('');
    try {
      const { error: messageError } = await supabase.from('support_inquiry_messages').insert({
        inquiry_id: inquiry.id,
        actor_user_id: profile.id,
        actor_role: 'homeowner',
        message_type: 'user_message',
        body,
      });
      if (messageError) throw messageError;
      setSupportReplyDrafts(current => ({ ...current, [inquiry.id]: '' }));
      setNotice('Reply sent to ServSync.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to send support reply.'));
    } finally {
      setSavingSupport(false);
    }
  };

  const emptyLogDraft = () => ({ service_request_id: null, category: '', title: '', description: '', performed_at: new Date().toISOString().slice(0,10), contractor_name: '', cost: '', notes: '' });

  const applyInvoiceFileToLogDraft = (file: File) => {
    const parsed = invoiceDraftFromFileName(file.name);
    setLogInvoiceFile(file);
    setLogInvoiceNotice('Invoice selected. ServSync saved the file for upload and prefilled any details it could read from the file name. Full photo text reading will use OCR/AI in a later step.');
    setLogDraft(current => ({
      ...current,
      title: current.title || parsed.title,
      cost: current.cost || parsed.cost,
      performed_at: parsed.performed_at || current.performed_at,
      category: current.category || parsed.category,
      contractor_name: current.contractor_name || parsed.contractor_name,
      notes: current.notes || `Invoice/receipt attached: ${file.name}`,
    }));
  };

  const createHomeDocumentFromBlob = async (
    blob: Blob,
    fileName: string,
    documentType: HomeDocumentType,
    notes: string,
  ) => {
    if (!supabase) throw new Error('Supabase is not connected.');
    const ext = fileName.split('.').pop() ?? 'bin';
    const path = `${profile.id}/documents/${crypto.randomUUID()}.${ext}`;
    const contentType = blob.type || 'application/octet-stream';
    const { error: storageError } = await supabase.storage.from('home-documents').upload(path, blob, { contentType });
    if (storageError) throw storageError;
    const { data, error: insertError } = await supabase.from('home_documents').insert({
      homeowner_user_id: profile.id,
      storage_path: path,
      file_name: fileName,
      content_type: contentType,
      file_size_bytes: blob.size,
      document_type: documentType,
      notes,
    }).select('*').single();
    if (insertError) {
      await supabase.storage.from('home-documents').remove([path]);
      throw insertError;
    }
    return data as HomeDocument;
  };

  const createHomeDocumentFromFile = async (file: File, documentType: HomeDocumentType, notes: string) => {
    return createHomeDocumentFromBlob(file, file.name, documentType, notes);
  };

  const saveLogEntry = async () => {
    if (!supabase) return;
    if (!logDraft.title.trim()) { setError('Add a title before saving.'); return; }
    if (!logDraft.performed_at) { setError('Add a date before saving.'); return; }
    setError('');
    setNotice('');
    setSavingLogEntry(true);
    try {
      const invoiceDocument = logInvoiceFile
        ? await createHomeDocumentFromFile(
            logInvoiceFile,
            'receipt',
            `Invoice/receipt for maintenance log${logDraft.title.trim() ? `: ${logDraft.title.trim()}` : ''}`,
          )
        : null;
      const payload = {
        homeowner_user_id: profile.id,
        service_request_id: logDraft.service_request_id,
        ...(invoiceDocument ? { invoice_document_id: invoiceDocument.id } : {}),
        category: logDraft.category,
        title: logDraft.title.trim(),
        description: logDraft.description.trim(),
        performed_at: logDraft.performed_at,
        contractor_name: logDraft.contractor_name.trim(),
        cost_cents: logDraft.cost ? dollarsToCents(logDraft.cost) : null,
        notes: [
          logDraft.notes.trim(),
          invoiceDocument ? `Invoice saved in Documents: ${invoiceDocument.file_name}` : '',
        ].filter(Boolean).join('\n'),
      };
      const { error: insertError } = await supabase.from('home_maintenance_log').insert(payload);
      if (insertError) {
        const message = insertError.message || '';
        if (invoiceDocument && /invoice_document_id|schema cache|column/i.test(message)) {
          const fallbackPayload = { ...payload };
          delete (fallbackPayload as Record<string, unknown>).invoice_document_id;
          const { error: fallbackError } = await supabase.from('home_maintenance_log').insert(fallbackPayload);
          if (fallbackError) throw fallbackError;
        } else {
          throw insertError;
        }
      }
      setLogDraft(emptyLogDraft());
      setLogInvoiceFile(null);
      setLogInvoiceNotice('');
      setLogFormOpen(false);
      setQuickLogDrafts({});
      setNotice(invoiceDocument ? 'Log entry saved and invoice stored in Documents.' : 'Log entry saved.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to save log entry.'));
    } finally {
      setSavingLogEntry(false);
    }
  };

  const deleteLogEntry = async (id: string) => {
    if (!supabase) return;
    setDeletingLogId(id);
    try {
      const { error: deleteError } = await supabase.from('home_maintenance_log').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setMaintenanceLog(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(readableError(err, 'Unable to delete log entry.'));
    } finally {
      setDeletingLogId(null);
    }
  };

  const uploadDocument = async (file: File) => {
    if (!supabase) return;
    setDocUploading(true);
    setError('');
    try {
      await createHomeDocumentFromFile(file, docUploadType, docUploadNotes.trim());
      setDocUploadNotes('');
      setDocUploadType('other');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to upload document.'));
    } finally {
      setDocUploading(false);
    }
  };

  const downloadDocument = async (doc: HomeDocument) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from('home-documents').createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) { setError('Unable to generate download link.'); return; }
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = doc.file_name;
    link.click();
  };

  const deleteDocument = async (doc: HomeDocument) => {
    if (!supabase) return;
    setDocDeletingId(doc.id);
    try {
      await supabase.storage.from('home-documents').remove([doc.storage_path]);
      const { error } = await supabase.from('home_documents').delete().eq('id', doc.id);
      if (error) throw error;
      setHomeDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      setError(readableError(err, 'Unable to delete document.'));
    } finally {
      setDocDeletingId(null);
    }
  };

  const saveHomeownerProfile = async () => {
    if (!supabase) return;
    setNotice('');
    setError('');
    try {
      const homeownerPayload = {
        user_id: profile.id,
        display_name: profileDraft.display_name,
        phone: profileDraft.phone,
        city: profileDraft.city,
        state: profileDraft.state,
        zip_code: profileDraft.zip_code,
      };
      const { error: profileError } = await supabase.from('homeowner_profiles').upsert(homeownerPayload);
      if (profileError) throw profileError;

      const homePayload = {
        ...(homeDraft.id ? { id: homeDraft.id } : {}),
        homeowner_user_id: profile.id,
        nickname: homeDraft.nickname,
        address_line1: homeDraft.address_line1,
        address_line2: homeDraft.address_line2,
        city: homeDraft.city,
        state: homeDraft.state,
        zip_code: homeDraft.zip_code,
        home_type: homeDraft.home_type,
        year_built: homeDraft.year_built,
        square_feet: homeDraft.square_feet,
        notes: homeDraft.notes,
      };
      const { error: homeError } = await supabase.from('homes').upsert(homePayload).select('*').single();
      if (homeError) throw homeError;

      setNotice('Homeowner profile saved.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to save homeowner profile.'));
    }
  };

  const updatePermissionDraft = (connectionId: string, nextPermissions: SharingPermissions) => {
    setPermissionDrafts(current => ({
      ...current,
      [connectionId]: nextPermissions,
    }));
  };

  const saveConnectionPermissions = async (connection: HomeownerConnection) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setSavingConnectionId(connection.connection_id);
    try {
      const draft = permissionDrafts[connection.connection_id] || normalizeSharingPermissions(connection.permissions);
      const { error: permissionError } = await supabase
        .from('connection_permissions')
        .upsert({
          connection_id: connection.connection_id,
          share_contact: draft.share_contact,
          share_home_overview: draft.share_home_overview,
          share_address: draft.share_address,
          share_preferred_vendors: draft.share_preferred_vendors,
          share_photos: draft.share_photos,
        });
      if (permissionError) throw permissionError;

      const { error: auditError } = await supabase
        .from('connection_audit_events')
        .insert({
          connection_id: connection.connection_id,
          actor_user_id: profile.id,
          event_type: 'permissions_updated',
          event_details: draft,
        });
      if (auditError) throw auditError;

      setNotice(`Sharing updated for ${connection.business_name}.`);
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to update sharing permissions.'));
    } finally {
      setSavingConnectionId(null);
    }
  };

  const revokeConnection = async (connection: HomeownerConnection) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Revoke ${connection.business_name}'s access to your shared information?`);
    if (!confirmed) return;

    setNotice('');
    setError('');
    setRevokingConnectionId(connection.connection_id);
    try {
      const { error: connectionError } = await supabase
        .from('homeowner_contractor_connections')
        .update({ status: 'revoked' })
        .eq('id', connection.connection_id)
        .eq('homeowner_user_id', profile.id);
      if (connectionError) throw connectionError;

      const { error: permissionError } = await supabase
        .from('connection_permissions')
        .upsert({
          connection_id: connection.connection_id,
          share_contact: false,
          share_home_overview: false,
          share_address: false,
          share_preferred_vendors: false,
          share_photos: false,
        });
      if (permissionError) throw permissionError;

      const { error: auditError } = await supabase
        .from('connection_audit_events')
        .insert({
          connection_id: connection.connection_id,
          actor_user_id: profile.id,
          event_type: 'connection_revoked',
          event_details: { contractor_id: connection.contractor_id },
        });
      if (auditError) throw auditError;

      setNotice(`${connection.business_name}'s access has been revoked.`);
      setExpandedConnectionId(null);
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to revoke contractor access.'));
    } finally {
      setRevokingConnectionId(null);
    }
  };

  const requestReconnect = async (connection: HomeownerConnection, proposedPermissions: SharingPermissions) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setReconnectingConnectionId(connection.connection_id);
    try {
      const { error: connectionError } = await supabase
        .from('homeowner_contractor_connections')
        .update({ status: 'pending' })
        .eq('id', connection.connection_id)
        .eq('homeowner_user_id', profile.id);
      if (connectionError) throw connectionError;

      const { error: permissionError } = await supabase
        .from('connection_permissions')
        .upsert({
          connection_id: connection.connection_id,
          share_contact: proposedPermissions.share_contact,
          share_home_overview: proposedPermissions.share_home_overview,
          share_address: proposedPermissions.share_address,
          share_preferred_vendors: proposedPermissions.share_preferred_vendors,
          share_photos: proposedPermissions.share_photos,
        });
      if (permissionError) throw permissionError;

      const { error: auditError } = await supabase
        .from('connection_audit_events')
        .insert({
          connection_id: connection.connection_id,
          actor_user_id: profile.id,
          event_type: 'reconnect_requested',
          event_details: {
            contractor_id: connection.contractor_id,
            proposed_permissions: proposedPermissions,
          },
        });
      if (auditError) throw auditError;

      setNotice(`Reconnect request sent to ${connection.business_name}.`);
      setReconnectDraftConnectionId(null);
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to request reconnect.'));
    } finally {
      setReconnectingConnectionId(null);
    }
  };

  const requestContractorConnection = async (contractor: ContractorProfile) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    try {
      const existing = connections.find(connection => connection.contractor_id === contractor.id);
      if (existing) {
        setNotice(`You already have a ${existing.status} connection with ${contractor.business_name}.`);
        return;
      }

      const { data, error: requestError } = await supabase
        .from('homeowner_contractor_connections')
        .insert({
          homeowner_user_id: profile.id,
          contractor_id: contractor.id,
          status: 'pending',
          source: 'homeowner_request',
        })
        .select('id')
        .single();
      if (requestError) throw requestError;

      const { error: auditError } = await supabase
        .from('connection_audit_events')
        .insert({
          connection_id: data.id,
          actor_user_id: profile.id,
          event_type: 'connection_requested',
          event_details: { contractor_id: contractor.id },
        });
      if (auditError) throw auditError;

      setNotice(`Connection request sent to ${contractor.business_name}.`);
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to request contractor connection.'));
    }
  };

  const uploadMediaFiles = async (files: File[], requestId: string, messageId: string | null) => {
    if (!supabase || files.length === 0) return;
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? '';
      const storagePath = `${profile.id}/${requestId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('service-request-media')
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('service_request_media').insert({
        request_id: requestId,
        uploader_user_id: profile.id,
        message_id: messageId,
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type,
        file_size_bytes: file.size,
      });
      if (insertError) throw insertError;
    }
  };

  const createServiceRequest = async () => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setSavingServiceRequest(true);
    try {
      if (!serviceRequestDraft.connection_id) {
        setError('Choose a connected contractor before creating a request.');
        return;
      }
      if (!serviceRequestDraft.category) {
        setError('Choose the type of service you need before sending the request.');
        return;
      }
      if (!serviceRequestDraft.title.trim() || !serviceRequestDraft.description.trim()) {
        setError('Add a short title and description before sending the request.');
        return;
      }

      const { data: createData, error: requestError } = await supabase.rpc('servsync_create_service_request', {
        p_connection_id: serviceRequestDraft.connection_id,
        p_category: serviceRequestDraft.category,
        p_urgency: serviceRequestDraft.urgency,
        p_title: serviceRequestDraft.title,
        p_description: serviceRequestDraft.description,
      });
      if (requestError) throw requestError;

      if (newRequestFiles.length > 0 && createData?.request_id) {
        await uploadMediaFiles(newRequestFiles, createData.request_id as string, null);
      }

      setServiceRequestDraft({
        connection_id: '',
        category: '',
        urgency: 'normal',
        title: '',
        description: '',
      });
      setNewRequestFiles([]);
      setServiceProblemText('');
      setRequestingConnectionId(null);
      setRequestComposerOpen(false);
      setNotice('Service request sent.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to create service request.'));
    } finally {
      setSavingServiceRequest(false);
    }
  };

  const updateHomeownerServiceRequest = async (request: ServiceRequestSummary, action: 'reply' | 'close') => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setUpdatingServiceRequestId(request.id);
    try {
      const body = action === 'close'
        ? homeownerReplyDrafts[request.id] || 'Homeowner closed this request.'
        : homeownerReplyDrafts[request.id] || '';
      if (action === 'reply' && !body.trim()) {
        setError('Add a reply before sending.');
        return;
      }

      const { data: updateData, error: updateError } = await supabase.rpc('servsync_homeowner_update_service_request', {
        p_request_id: request.id,
        p_body: body,
        p_action: action,
      });
      if (updateError) throw updateError;

      const files = replyFiles[request.id] ?? [];
      if (files.length > 0 && updateData?.message_id) {
        await uploadMediaFiles(files, request.id, updateData.message_id as string);
      }

      setHomeownerReplyDrafts(current => ({ ...current, [request.id]: '' }));
      setReplyFiles(current => ({ ...current, [request.id]: [] }));
      setNotice(action === 'close' ? 'Service request closed.' : 'Reply sent.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to update service request.'));
    } finally {
      setUpdatingServiceRequestId(null);
    }
  };

  const respondToQuote = async (request: ServiceRequestSummary, action: 'accept' | 'decline') => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setUpdatingQuoteRequestId(request.id);
    try {
      const { error: quoteError } = await supabase.rpc('servsync_homeowner_respond_to_quote', {
        p_request_id: request.id,
        p_action: action,
      });
      if (quoteError) throw quoteError;
      setNotice(action === 'accept' ? 'Quote accepted.' : 'Quote declined.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to respond to quote.'));
    } finally {
      setUpdatingQuoteRequestId(null);
    }
  };

  const respondToEstimate = async (estimate: Estimate, action: 'accept' | 'decline') => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setUpdatingEstimateId(estimate.id);
    try {
      const { error: estimateError } = await supabase.rpc('servsync_homeowner_respond_to_estimate', {
        p_estimate_id: estimate.id,
        p_action: action,
      });
      if (estimateError) throw estimateError;
      setNotice(action === 'accept' ? 'Estimate accepted.' : 'Estimate declined.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to respond to estimate.'));
    } finally {
      setUpdatingEstimateId(null);
    }
  };

  const fileEstimateToHomeRecords = async (estimate: Estimate, contractorName: string) => {
    if (!supabase) return;
    if (estimate.status !== 'accepted') {
      setError('Accept the estimate before filing it to your home records.');
      return;
    }
    if (maintenanceLog.some(entry => entry.estimate_id === estimate.id)) {
      setNotice('This estimate is already filed in your maintenance log.');
      return;
    }

    setNotice('');
    setError('');
    setFilingEstimateId(estimate.id);
    try {
      const { blob, fileName } = createEstimatePdf(estimate, {
        contractorName,
        customerName: homeowner?.display_name || profile.full_name || 'Homeowner',
        customerAddress: home?.address_line1 || '',
      });
      const document = await createHomeDocumentFromBlob(
        blob,
        fileName,
        'receipt',
        `Filed by homeowner from accepted contractor estimate: ${estimate.title}`,
      );
      const relatedRequest = estimate.service_request_id
        ? serviceRequests.find(request => request.id === estimate.service_request_id)
        : null;
      const payload = {
        homeowner_user_id: profile.id,
        service_request_id: estimate.service_request_id,
        estimate_id: estimate.id,
        invoice_document_id: document.id,
        category: relatedRequest?.category || 'Estimate / Invoice',
        title: estimate.title || 'Contractor invoice',
        description: estimate.scope || relatedRequest?.description || 'Contractor estimate filed by homeowner.',
        performed_at: new Date().toISOString().slice(0, 10),
        contractor_name: contractorName,
        cost_cents: estimate.total_cents,
        notes: `Homeowner filed accepted estimate/invoice to Documents: ${document.file_name}`,
      };
      const { error: insertError } = await supabase.from('home_maintenance_log').insert(payload);
      if (insertError) {
        const message = insertError.message || '';
        if (/estimate_id|invoice_document_id|schema cache|column/i.test(message)) {
          const fallbackPayload = { ...payload };
          delete (fallbackPayload as Record<string, unknown>).estimate_id;
          delete (fallbackPayload as Record<string, unknown>).invoice_document_id;
          const { error: fallbackError } = await supabase.from('home_maintenance_log').insert(fallbackPayload);
          if (fallbackError) throw fallbackError;
        } else {
          throw insertError;
        }
      }
      setNotice('Estimate filed to Documents and Maintenance Log.');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to file estimate to your home records.'));
    } finally {
      setFilingEstimateId(null);
    }
  };

  const submitReview = async (request: ServiceRequestSummary) => {
    if (!supabase) return;
    const draft = reviewDrafts[request.id];
    if (!draft || draft.rating < 1) { setError('Choose a star rating before submitting.'); return; }
    setError('');
    setNotice('');
    setSubmittingReviewId(request.id);
    try {
      const { error: reviewError } = await supabase.rpc('servsync_homeowner_submit_review', {
        p_request_id: request.id,
        p_rating: draft.rating,
        p_body: draft.body.trim(),
        p_kudos: draft.kudos,
        p_reviewer_display_name: draft.displayName?.trim() ?? '',
        p_reviewer_location: draft.location?.trim() ?? '',
      });
      if (reviewError) throw reviewError;
      setReviewDrafts(prev => ({ ...prev, [request.id]: { ...prev[request.id], open: false } }));
      setNotice('Review submitted. Thank you!');
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to submit review.'));
    } finally {
      setSubmittingReviewId(null);
    }
  };

  const respondToAppointment = async (
    request: ServiceRequestSummary,
    action: 'confirm' | 'decline' | 'counter',
    proposedAt?: string,
    notes?: string,
  ) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setUpdatingAppointmentRequestId(request.id);
    try {
      const params: Record<string, unknown> = { p_request_id: request.id, p_action: action };
      if (action === 'counter') {
        if (!proposedAt) {
          setError('Choose a date and time before sending.');
          return;
        }
        const proposedDate = new Date(proposedAt);
        if (Number.isNaN(proposedDate.getTime())) {
          setError('Choose a valid date and time.');
          return;
        }
        if (proposedDate <= new Date()) {
          setError('Choose a future date and time.');
          return;
        }
        params.p_proposed_at = proposedDate.toISOString();
        params.p_notes = notes ?? '';
      }
      const { error: apptError } = await supabase.rpc('servsync_homeowner_respond_to_appointment', params);
      if (apptError) throw apptError;
      if (action === 'counter') {
        setNotice('Your counter-proposal has been sent. Waiting for the contractor to confirm.');
        setCounterProposeDrafts(current => ({ ...current, [request.id]: { open: false, proposedAt: '', notes: '' } }));
      } else {
        setNotice(action === 'confirm' ? 'Appointment confirmed.' : 'Appointment declined.');
      }
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to respond to appointment.'));
    } finally {
      setUpdatingAppointmentRequestId(null);
    }
  };

  const rescheduleAsHomeowner = async (request: ServiceRequestSummary) => {
    if (!supabase) return;
    const draft = homeownerRescheduleDrafts[request.id];
    if (!draft?.proposedAt) return;
    setNotice('');
    setError('');
    setHomeownerReschedulingId(request.id);
    try {
      const proposedDate = new Date(draft.proposedAt);
      if (Number.isNaN(proposedDate.getTime())) {
        setError('Choose a valid date and time.');
        return;
      }
      if (proposedDate <= new Date()) {
        setError('Choose a future date and time.');
        return;
      }
      const { error: apptError } = await supabase.rpc('servsync_homeowner_propose_appointment', {
        p_request_id: request.id,
        p_proposed_at: proposedDate.toISOString(),
        p_notes: draft.notes ?? '',
      });
      if (apptError) throw apptError;
      setNotice('Reschedule request sent to contractor.');
      setHomeownerRescheduleDrafts(current => ({ ...current, [request.id]: { open: false, proposedAt: '', notes: '' } }));
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to reschedule appointment.'));
    } finally {
      setHomeownerReschedulingId(null);
    }
  };

  const reopenRequest = async (request: ServiceRequestSummary) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setReopeningRequestId(request.id);
    const body = reopenDrafts[request.id]?.body || '';
    try {
      const { error: reopenError } = await supabase.rpc('servsync_homeowner_reopen_service_request', {
        p_request_id: request.id,
        p_body: body,
      });
      if (reopenError) throw reopenError;
      setNotice('Request reopened.');
      setReopenDrafts(current => ({ ...current, [request.id]: { open: false, body: '' } }));
      await loadHomeowner();
    } catch (err) {
      setError(readableError(err, 'Unable to reopen request.'));
    } finally {
      setReopeningRequestId(null);
    }
  };

  const contractorProfileById = new Map(directoryContractors.map(c => [c.id, c]));
  const connectionByContractorId = new Map(connections.map(connection => [connection.contractor_id, connection]));
  const activeConnections = connections.filter(connection => connection.status === 'active');
  const connectedContractorsForRequest = activeConnections.filter(connection => {
    if (!serviceRequestDraft.category) return true;
    const contractor = contractorProfileById.get(connection.contractor_id);
    if (!contractor) return false;
    return contractor.service_categories.some(c => c.toLowerCase() === serviceRequestDraft.category.toLowerCase());
  });
  const serviceCategoriesForConnection = (connection: HomeownerConnection) => {
    const contractor = contractorProfileById.get(connection.contractor_id);
    return contractor?.service_categories?.length ? contractor.service_categories : SERVICE_REQUEST_CATEGORIES;
  };
  const homeownerAttentionRequests = serviceRequests.filter(homeownerRequestNeedsResponse);
  const openServiceRequests = serviceRequests.filter(request => !['closed', 'declined'].includes(request.status));
  const newServiceRequests = serviceRequests.filter(request => request.status === 'open' && !request.appointment);
  const closedServiceRequests = serviceRequests.filter(request => request.status === 'closed');
  const openServiceRequestCount = openServiceRequests.length;
  const activeServiceRequests = openServiceRequests.slice(0, 4);
  const upcomingAppointments = serviceRequests
    .filter(request => request.appointment && ['proposed', 'confirmed'].includes(request.appointment.status))
    .slice(0, 3);
  const unreadNotificationCount = notifications.filter(notification => !notification.read_at).length;
  const homeownerActionRequestCount = homeownerAttentionRequests.length;
  const homeownerCalendarActionCount = serviceRequests.filter(request =>
    request.appointment?.status === 'proposed' && request.appointment.proposed_by === 'contractor'
  ).length;
  const pendingEstimateCount = estimates.filter(estimate => estimate.status === 'sent').length;
  const openSupportInquiryCount = supportInquiries.filter(inquiry => !['resolved', 'closed'].includes(inquiry.status)).length;
  const waitingOnHomeownerSupportCount = supportInquiries.filter(inquiry => inquiry.status === 'waiting_on_user').length;
  const recentLogEntries = maintenanceLog.slice(0, 3);
  const recentDocuments = homeDocuments.slice(0, 3);
  const homeDocumentById = new Map(homeDocuments.map(doc => [doc.id, doc]));
  const homeProfileFields = [
    homeDraft.nickname,
    homeDraft.address_line1,
    homeDraft.city,
    homeDraft.state,
    homeDraft.zip_code,
    homeDraft.home_type,
    homeDraft.year_built,
    homeDraft.square_feet,
  ];
  const completedHomeFields = homeProfileFields.filter(Boolean).length;
  const homeProfileScore = Math.round((completedHomeFields / homeProfileFields.length) * 100);
  const filteredDirectoryContractors = directoryContractors.filter(contractor => {
    const categoryMatch = !directoryCategory || contractor.service_categories.some(c => c.toLowerCase() === directoryCategory.toLowerCase());
    const locationQuery = directoryLocation.trim().toLowerCase();
    const locationMatch = !locationQuery
      || contractor.city.toLowerCase().includes(locationQuery)
      || contractor.state.toLowerCase().includes(locationQuery)
      || contractor.zip_code.toLowerCase().includes(locationQuery)
      || contractor.service_zip_codes.some(zip => zip.toLowerCase().includes(locationQuery));
    return categoryMatch && locationMatch;
  });
  const selectedRequestConnection = serviceRequestDraft.connection_id
    ? activeConnections.find(connection => connection.connection_id === serviceRequestDraft.connection_id) ?? null
    : null;
  const selectedRequestCategories = selectedRequestConnection ? serviceCategoriesForConnection(selectedRequestConnection) : SERVICE_REQUEST_CATEGORIES;
  const applySuggestedServiceCategory = (category: string, options?: { connectionId?: string; allowedCategories?: string[] }) => {
    const allowed = options?.allowedCategories ?? SERVICE_REQUEST_CATEGORIES;
    if (!allowed.some(item => item.toLowerCase() === category.toLowerCase())) return;
    const nextConnectionId = options?.connectionId ?? serviceRequestDraft.connection_id;
    const selectedConnection = activeConnections.find(c => c.connection_id === nextConnectionId);
    const selectedContractor = selectedConnection ? contractorProfileById.get(selectedConnection.contractor_id) : null;
    const selectedStillMatches = !nextConnectionId
      || category === 'Other'
      || selectedContractor?.service_categories.some(c => c.toLowerCase() === category.toLowerCase());
    setServiceRequestDraft(current => ({
      ...current,
      category,
      connection_id: selectedStillMatches ? nextConnectionId : '',
      description: current.description || serviceProblemText,
      title: current.title || (serviceProblemText ? `${category} help needed` : current.title),
    }));
    setDirectoryCategory(category);
  };
  const startServiceRequestForConnection = (connection: HomeownerConnection, category?: string) => {
    const categories = serviceCategoriesForConnection(connection);
    setRequestingConnectionId(connection.connection_id);
    setExpandedConnectionId(connection.connection_id);
    setNewRequestFiles([]);
    setServiceProblemText('');
    setServiceRequestDraft({
      connection_id: connection.connection_id,
      category: category || categories[0] || 'General Maintenance',
      urgency: 'normal',
      title: '',
      description: '',
    });
  };

  return (
    <SidebarLayout
      brand={{ name: 'ServSync', subtitle: 'Homeowner Portal' }}
      tabs={[
        { id: 'overview',     label: 'Dashboard',         icon: <LayoutDashboard size={17} />, group: 'Home' },
        { id: 'home',         label: 'Home Profile',      icon: <Home size={17} />, group: 'Home' },
        { id: 'contractors',  label: 'Contractors',       icon: <Users size={17} />, group: 'Contractors' },
        { id: 'requests',     label: 'Service Requests',  icon: <MessageSquare size={17} />, badge: homeownerActionRequestCount, group: 'Contractors' },
        { id: 'calendar',     label: 'Calendar',          icon: <Calendar size={17} />, badge: homeownerCalendarActionCount, group: 'Contractors' },
        { id: 'estimates',    label: 'Estimates',         icon: <Receipt size={17} />, badge: pendingEstimateCount, group: 'Contractors' },
        { id: 'log',          label: 'Home History',      icon: <ClipboardList size={17} />, group: 'Records' },
        { id: 'documents',    label: 'Documents',         icon: <FolderOpen size={17} />, group: 'Records' },
        { id: 'discover',     label: 'Discover',          icon: <Compass size={17} />, group: 'Explore' },
        { id: 'support',      label: 'Support',           icon: <MessageSquare size={17} />, badge: supportInquiries.filter(inquiry => ['new', 'in_progress', 'waiting_on_user', 'waiting_on_admin'].includes(inquiry.status)).length, group: 'Help' },
      ]}
      activeTab={homeownerTab}
      onChange={tab => setHomeownerTab(tab as typeof homeownerTab)}
      actions={<NotificationBell
        notifications={notifications}
        unreadCount={unreadNotificationCount}
        onMarkRead={ids => void markNotificationsRead(ids)}
        onOpenNotification={notification => {
          if (notification.estimate_id) {
            setHomeownerTab('estimates');
            return;
          }
          if (notification.support_inquiry_id || notification.type.includes('support')) {
            setHomeownerTab('support');
            return;
          }
          if (!notification.request_id) {
            const category = notificationCategoryLabel(notification.type);
            setHomeownerTab(category === 'Calendar' ? 'calendar' : category === 'Estimate' ? 'estimates' : category === 'Field Work' || category === 'Home History' ? 'documents' : category === 'Connection' ? 'contractors' : 'requests');
            return;
          }
          const request = serviceRequests.find(item => item.id === notification.request_id);
          if (!request) return;
          setHomeownerRequestView(homeownerRequestQueueFor(request));
          setExpandedRequestIds(new Set([request.id]));
          setHomeownerTab('requests');
        }}
      />}
      profile={profile}
      onSignOut={onSignOut}
    >
      {loading && <Notice tone="info" text="Loading homeowner profile..." />}
      {notice && <Notice tone="success" text={notice} />}
      {error && <Notice tone="error" text={error} />}

      {homeownerTab === 'overview' && (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Home command center</p>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                  {homeDraft.nickname || 'My Home'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Request help, track active work, store documents, and keep your home history in one place.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => setHomeownerTab('contractors')} className={buttonClass('primary')}>
                    <MessageSquare size={16} />
                    Request service
                  </button>
                  <button type="button" onClick={() => setHomeownerTab('documents')} className={buttonClass('secondary')}>
                    <FolderOpen size={16} />
                    Add document
                  </button>
                  <button type="button" onClick={() => setHomeownerTab('log')} className={buttonClass('secondary')}>
                    <ClipboardList size={16} />
                    Log maintenance
                  </button>
                </div>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 p-5 sm:p-6 lg:border-l lg:border-t-0">
                <div className="grid grid-cols-2 gap-3">
                  <MetricButton label="Open requests" value={String(openServiceRequestCount)} onClick={() => setHomeownerTab('requests')} />
                  <MetricButton label="Connected pros" value={String(activeConnections.length)} onClick={() => setHomeownerTab('contractors')} />
                  <MetricButton label="Home profile" value={`${homeProfileScore}%`} onClick={() => setHomeownerTab('home')} />
                  <MetricButton label="Documents" value={String(homeDocuments.length)} onClick={() => setHomeownerTab('documents')} />
                  <MetricButton label="Support" value={waitingOnHomeownerSupportCount > 0 ? `${waitingOnHomeownerSupportCount} reply` : String(openSupportInquiryCount)} onClick={() => setHomeownerTab('support')} />
                </div>
                <button type="button" onClick={() => setHomeownerTab('calendar')} className="mt-4 w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Next appointment</p>
                  {upcomingAppointments.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-sm font-semibold text-slate-950">{upcomingAppointments[0].title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {upcomingAppointments[0].contractor_name} · {formatDateTime(upcomingAppointments[0].appointment?.proposed_at)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No upcoming appointments yet.</p>
                  )}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Next best action</p>
                <h2 className="mt-2 text-lg font-bold text-slate-950">
                  {homeownerAttentionRequests[0]
                    ? 'Respond to your contractor'
                    : upcomingAppointments[0]
                      ? 'Review your next appointment'
                      : openServiceRequests[0]
                        ? 'Check your active service request'
                        : homeProfileScore < 100
                          ? 'Finish your home profile'
                          : activeConnections.length === 0
                            ? 'Connect with a contractor'
                            : 'Your home workspace is up to date'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {homeownerAttentionRequests[0]
                    ? `${homeownerAttentionRequests[0].contractor_name} is waiting on you for "${homeownerAttentionRequests[0].title}".`
                    : upcomingAppointments[0]?.appointment
                      ? `${upcomingAppointments[0].title} is set for ${formatDateTime(upcomingAppointments[0].appointment.proposed_at)}.`
                      : openServiceRequests[0]
                        ? `${openServiceRequests[0].title} is still active with ${openServiceRequests[0].contractor_name}.`
                        : homeProfileScore < 100
                          ? 'A complete home profile helps contractors respond with better context.'
                          : activeConnections.length === 0
                            ? 'Find a contractor or accept an invite so you can start sending requests.'
                            : 'No urgent items are waiting on you right now.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (homeownerAttentionRequests[0]) {
                    setHomeownerRequestView(homeownerRequestQueueFor(homeownerAttentionRequests[0]));
                    setExpandedRequestIds(new Set([homeownerAttentionRequests[0].id]));
                    setHomeownerTab('requests');
                    return;
                  }
                  if (upcomingAppointments[0]) {
                    setHomeownerTab('calendar');
                    return;
                  }
                  if (openServiceRequests[0]) {
                    setHomeownerRequestView(homeownerRequestQueueFor(openServiceRequests[0]));
                    setExpandedRequestIds(new Set([openServiceRequests[0].id]));
                    setHomeownerTab('requests');
                    return;
                  }
                  setHomeownerTab(homeProfileScore < 100 ? 'home' : activeConnections.length === 0 ? 'contractors' : 'overview');
                }}
                className={buttonClass('primary')}
              >
                <ArrowRight size={16} />
                Open next step
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricButton label="Needs response" value={String(homeownerActionRequestCount)} onClick={() => { setHomeownerRequestView('attention'); setHomeownerTab('requests'); }} />
              <MetricButton label="New requests" value={String(newServiceRequests.length)} onClick={() => { setHomeownerRequestView('new'); setHomeownerTab('requests'); }} />
              <MetricButton label="Calendar items" value={String(upcomingAppointments.length)} onClick={() => setHomeownerTab('calendar')} />
              <MetricButton label="Closed records" value={String(closedServiceRequests.length)} onClick={() => { setHomeownerRequestView('closed'); setHomeownerTab('requests'); }} />
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <Card title="Start a service request" icon={<MessageSquare size={18} />}>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Service type">
                    <select
                      className={inputClass()}
                      value={serviceRequestDraft.category}
                      onChange={event => {
                        const nextCategory = event.target.value;
                        const selectedConnection = activeConnections.find(c => c.connection_id === serviceRequestDraft.connection_id);
                        const selectedContractor = selectedConnection ? contractorProfileById.get(selectedConnection.contractor_id) : null;
                        const selectedStillMatches = !nextCategory || selectedContractor?.service_categories.some(c => c.toLowerCase() === nextCategory.toLowerCase());
                        setServiceRequestDraft({
                          ...serviceRequestDraft,
                          category: nextCategory,
                          connection_id: selectedStillMatches ? serviceRequestDraft.connection_id : '',
                        });
                        setDirectoryCategory(nextCategory);
                      }}
                    >
                      <option value="">Choose service type</option>
                      {SERVICE_REQUEST_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </Field>
                  <Field label="Connected contractor">
                    <select
                      className={inputClass()}
                      value={serviceRequestDraft.connection_id}
                      onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, connection_id: event.target.value })}
                      disabled={!serviceRequestDraft.category || connectedContractorsForRequest.length === 0}
                    >
                      <option value="">Choose contractor</option>
                      {connectedContractorsForRequest.map(connection => (
                        <option key={connection.connection_id} value={connection.connection_id}>{connection.business_name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {serviceRequestDraft.category && connectedContractorsForRequest.length === 0 && (
                  <Notice tone="info" text="No connected contractor matches that service yet. You can search the contractor directory next." />
                )}
                {serviceRequestDraft.connection_id ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                      <Field label="Urgency">
                        <select
                          className={inputClass()}
                          value={serviceRequestDraft.urgency}
                          onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, urgency: event.target.value as ServiceRequestUrgency })}
                        >
                          {SERVICE_REQUEST_URGENCY_OPTIONS.map(urgency => <option key={urgency} value={urgency}>{urgency}</option>)}
                        </select>
                      </Field>
                      <Field label="Short title">
                        <input
                          className={inputClass()}
                          value={serviceRequestDraft.title}
                          onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, title: event.target.value })}
                          placeholder="Example: Leak under kitchen sink"
                        />
                      </Field>
                    </div>
                    <Field label="What do you need help with?">
                      <textarea
                        className={inputClass()}
                        rows={3}
                        value={serviceRequestDraft.description}
                        onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, description: event.target.value })}
                        placeholder="Add enough detail for the contractor to understand the issue."
                      />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void createServiceRequest()}
                        disabled={savingServiceRequest}
                        className={buttonClass('primary')}
                      >
                        <Send size={16} />
                        {savingServiceRequest ? 'Sending...' : 'Send request'}
                      </button>
                      <button type="button" onClick={() => setHomeownerTab('requests')} className={buttonClass('secondary')}>
                        View requests
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">Need a contractor?</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Choose a service type, then use the contractor search to find a matching provider.
                    </p>
                    <button type="button" onClick={() => setHomeownerTab('contractors')} className={`${buttonClass('secondary')} mt-3`}>
                      <Compass size={16} />
                      Search contractors
                    </button>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Active work" icon={<ClipboardCheck size={18} />}>
              <div className="space-y-3">
                {activeServiceRequests.length === 0 ? (
                  <EmptyState text="No active service requests." />
                ) : (
                  activeServiceRequests.map(request => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => {
                        setHomeownerRequestView(homeownerRequestQueueFor(request));
                        setExpandedRequestIds(new Set([request.id]));
                        setHomeownerTab('requests');
                      }}
                      className={`w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 border-l-4 ${serviceRequestStatusAccent(request.status)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{request.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{request.contractor_name} · {request.category}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${serviceRequestStatusClass(request.status)}`}>
                          {serviceRequestStatusLabel(request.status)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="My contractors" icon={<Users size={18} />}>
              <div className="space-y-3">
                {activeConnections.length === 0 ? (
                  <EmptyState text="No active contractor connections yet." />
                ) : (
                  activeConnections.slice(0, 4).map(connection => (
                    <div key={connection.connection_id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-800">{connection.business_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{connection.city}{connection.state ? `, ${connection.state}` : ''}</p>
                      <PermissionChips permissions={connection.permissions} />
                    </div>
                  ))
                )}
                <button type="button" onClick={() => setHomeownerTab('contractors')} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Manage contractors
                </button>
              </div>
            </Card>

            <Card title="Recent home history" icon={<ClipboardList size={18} />}>
              <div className="space-y-3">
                {recentLogEntries.length === 0 ? (
                  <EmptyState text="No maintenance history yet." />
                ) : (
                  recentLogEntries.map(entry => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-800">{entry.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(entry.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {entry.contractor_name ? ` · ${entry.contractor_name}` : ''}
                      </p>
                    </div>
                  ))
                )}
                <button type="button" onClick={() => setHomeownerTab('log')} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Open maintenance log
                </button>
              </div>
            </Card>

            <Card title="Documents" icon={<FolderOpen size={18} />}>
              <div className="space-y-3">
                {recentDocuments.length === 0 ? (
                  <EmptyState text="No documents uploaded yet." />
                ) : (
                  recentDocuments.map(doc => (
                    <div key={doc.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="truncate text-sm font-semibold text-slate-800">{doc.file_name}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">{doc.document_type}</p>
                    </div>
                  ))
                )}
                <button type="button" onClick={() => setHomeownerTab('documents')} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Open documents
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {homeownerTab === 'home' && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card title="My profile" icon={<UserRound size={18} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <input className={`${inputClass()} cursor-not-allowed opacity-60`} value={profile.email} readOnly disabled />
            </Field>
            <Field label="Display name">
              <input className={inputClass()} value={profileDraft.display_name} onChange={event => setHomeowner({ ...profileDraft, display_name: event.target.value })} />
            </Field>
            <Field label="Phone">
              <input className={inputClass()} value={profileDraft.phone} onChange={event => setHomeowner({ ...profileDraft, phone: event.target.value })} />
            </Field>
            <Field label="City">
              <input className={inputClass()} value={profileDraft.city} onChange={event => setHomeowner({ ...profileDraft, city: event.target.value })} />
            </Field>
            <Field label="State">
              <AutocompleteInput
                id="homeowner-profile-state"
                value={profileDraft.state}
                onChange={state => setHomeowner({ ...profileDraft, state })}
                options={US_STATE_OPTIONS}
                placeholder="Start typing a state..."
              />
            </Field>
            <Field label="ZIP code">
              <input className={inputClass()} value={profileDraft.zip_code} onChange={event => setHomeowner({ ...profileDraft, zip_code: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card title="My home" icon={<Home size={18} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Home nickname">
              <input className={inputClass()} value={homeDraft.nickname} onChange={event => setHome({ ...homeDraft, nickname: event.target.value })} />
            </Field>
            <Field label="Address">
              <input className={inputClass()} value={homeDraft.address_line1} onChange={event => setHome({ ...homeDraft, address_line1: event.target.value })} />
            </Field>
            <Field label="City">
              <input className={inputClass()} value={homeDraft.city} onChange={event => setHome({ ...homeDraft, city: event.target.value })} />
            </Field>
            <Field label="State">
              <AutocompleteInput
                id="home-state"
                value={homeDraft.state}
                onChange={state => setHome({ ...homeDraft, state })}
                options={US_STATE_OPTIONS}
                placeholder="Start typing a state..."
              />
            </Field>
            <Field label="ZIP">
              <input className={inputClass()} value={homeDraft.zip_code} onChange={event => setHome({ ...homeDraft, zip_code: event.target.value })} />
            </Field>
            <Field label="Home type">
              <AutocompleteInput
                id="home-type"
                value={homeDraft.home_type}
                onChange={home_type => setHome({ ...homeDraft, home_type })}
                options={HOME_TYPE_OPTIONS}
                placeholder="Start typing a home type..."
              />
            </Field>
            <Field label="Year built">
              <input className={inputClass()} value={homeDraft.year_built} onChange={event => setHome({ ...homeDraft, year_built: event.target.value })} />
            </Field>
            <Field label="Square feet">
              <input className={inputClass()} value={homeDraft.square_feet} onChange={event => setHome({ ...homeDraft, square_feet: event.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className={inputClass()} value={homeDraft.notes} rows={3} onChange={event => setHome({ ...homeDraft, notes: event.target.value })} />
            </Field>
          </div>
          <div className="mt-4">
            <button type="button" onClick={() => void saveHomeownerProfile()} className={buttonClass('primary')}>
              <ClipboardCheck size={16} />
              Save profile
            </button>
          </div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <EmailNotificationsToggle initialEnabled={profile.email_notifications_enabled ?? true} />
          </div>
        </Card>
      </div>
      )}

      {homeownerTab === 'contractors' && (
        <div className="space-y-5">
          {requestingConnectionId && selectedRequestConnection && (
            <Card title="Service request" icon={<MessageSquare size={18} />}>
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-blue-950">
                        Requesting service from {selectedRequestConnection.business_name}
                      </p>
                      <p className="mt-1 text-sm text-blue-800">
                        This request goes directly to your connected contractor. They will see the details you enter here and any files you attach.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestingConnectionId(null);
                        setNewRequestFiles([]);
                        setServiceProblemText('');
                        setServiceRequestDraft({
                          connection_id: '',
                          category: '',
                          urgency: 'normal',
                          title: '',
                          description: '',
                        });
                      }}
                      className={buttonClass('secondary')}
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <ServiceCategoryAdvisor
                  value={serviceProblemText}
                  onChange={setServiceProblemText}
                  allowedCategories={selectedRequestCategories}
                  onApply={category => applySuggestedServiceCategory(category, {
                    connectionId: selectedRequestConnection.connection_id,
                    allowedCategories: selectedRequestCategories,
                  })}
                />

                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Field label="Service type">
                    <select
                      className={inputClass()}
                      value={serviceRequestDraft.category}
                      onChange={event => setServiceRequestDraft(current => ({
                        ...current,
                        connection_id: selectedRequestConnection.connection_id,
                        category: event.target.value,
                      }))}
                    >
                      <option value="">Choose service type</option>
                      {selectedRequestCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Urgency">
                    <select
                      className={inputClass()}
                      value={serviceRequestDraft.urgency}
                      onChange={event => setServiceRequestDraft(current => ({
                        ...current,
                        connection_id: selectedRequestConnection.connection_id,
                        urgency: event.target.value as ServiceRequestUrgency,
                      }))}
                    >
                      {SERVICE_REQUEST_URGENCY_OPTIONS.map(urgency => <option key={urgency} value={urgency}>{urgency}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Short title">
                  <input
                    className={inputClass()}
                    value={serviceRequestDraft.title}
                    onChange={event => setServiceRequestDraft(current => ({
                      ...current,
                      connection_id: selectedRequestConnection.connection_id,
                      title: event.target.value,
                    }))}
                    placeholder="Example: Leak under kitchen sink"
                  />
                </Field>
                <Field label="What do you need help with?">
                  <textarea
                    className={inputClass()}
                    rows={4}
                    value={serviceRequestDraft.description}
                    onChange={event => setServiceRequestDraft(current => ({
                      ...current,
                      connection_id: selectedRequestConnection.connection_id,
                      description: event.target.value,
                    }))}
                    placeholder="Add enough detail for the contractor to understand the issue."
                  />
                </Field>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Photos / Videos (optional)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-blue-300 hover:bg-blue-50">
                    <Paperclip size={15} className="shrink-0 text-slate-400" />
                    Attach files
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      className="sr-only"
                      onChange={event => {
                        const picked = Array.from(event.target.files ?? []);
                        setNewRequestFiles(prev => [...prev, ...picked]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {newRequestFiles.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {newRequestFiles.map((file, i) => (
                        <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                          <span className="truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setNewRequestFiles(prev => prev.filter((_, idx) => idx !== i))}
                            className="ml-2 text-slate-400 hover:text-red-400"
                          >
                            <X size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void createServiceRequest()}
                    disabled={savingServiceRequest}
                    className={buttonClass('primary')}
                  >
                    <Send size={16} />
                    {savingServiceRequest ? 'Sending...' : 'Send request'}
                  </button>
                  <button type="button" onClick={() => setHomeownerTab('requests')} className={buttonClass('secondary')}>
                    View requests
                  </button>
                </div>
              </div>
            </Card>
          )}

        <Card title="My contractors" icon={<Users size={18} />}>
          <div className="space-y-3">
            {connections.length === 0 ? (
              <EmptyState text="No contractor connections yet." />
            ) : (
              connections.map(connection => {
                const isExpanded = expandedConnectionId === connection.connection_id;
                const draft = permissionDrafts[connection.connection_id] || normalizeSharingPermissions(connection.permissions);
                const isSaving = savingConnectionId === connection.connection_id;
                const isRevoking = revokingConnectionId === connection.connection_id;
                const isReconnecting = reconnectingConnectionId === connection.connection_id;
                const isChoosingReconnect = reconnectDraftConnectionId === connection.connection_id;
                const isRequestingService = requestingConnectionId === connection.connection_id;
                const isRevoked = connection.status === 'revoked';
                const isPending = connection.status === 'pending';
                const connectionServiceCategories = serviceCategoriesForConnection(connection);

                return (
                  <div key={connection.connection_id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setExpandedConnectionId(isExpanded ? null : connection.connection_id)}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left"
                    >
                      <div>
                        <p className="font-bold text-slate-950">{connection.business_name}</p>
                        <p className="text-sm text-slate-500">{connection.city}{connection.state ? `, ${connection.state}` : ''}</p>
                        <PermissionChips permissions={connection.permissions} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isRevoked ? 'bg-slate-100 text-slate-600' : isPending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {connection.status}
                        </span>
                        {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 p-4">
                        <div className="mb-4 grid gap-3 sm:grid-cols-3">
                          <InfoBox label="Original connection" value={connectionSourceLabel(connection.source)} />
                          <InfoBox label="Created" value={formatDateTime(connection.created_at)} />
                          <InfoBox label="Last updated" value={formatDateTime(connection.updated_at)} />
                        </div>
                        <ConnectionHistory events={connectionHistory[connection.connection_id] || []} />
                        <p className="text-sm font-bold text-slate-950">Sharing permissions</p>
                        <p className="mt-1 text-sm text-slate-500">
                          This controls what {connection.business_name} can see. Nothing extra is shared unless you turn it on.
                        </p>
                        {isRevoked ? (
                          <div className="mt-4 space-y-3">
                            <Notice tone="info" text="This connection has been revoked. The contractor can no longer see shared home or contact details." />
                            {isChoosingReconnect ? (
                              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                                <p className="text-sm font-bold text-blue-950">Choose proposed sharing</p>
                                <p className="mt-1 text-sm text-blue-800">
                                  These permissions only apply if {connection.business_name} accepts the reconnect request.
                                </p>
                                <PermissionPicker
                                  permissions={draft}
                                  onChange={nextPermissions => updatePermissionDraft(connection.connection_id, nextPermissions)}
                                />
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void requestReconnect(connection, draft)}
                                    disabled={isReconnecting}
                                    className={buttonClass('primary')}
                                  >
                                    <Link2 size={16} />
                                    {isReconnecting ? 'Sending...' : 'Submit reconnect request'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReconnectDraftConnectionId(null)}
                                    disabled={isReconnecting}
                                    className={buttonClass('secondary')}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReconnectDraftConnectionId(connection.connection_id)}
                                className={buttonClass('primary')}
                              >
                                <Link2 size={16} />
                                Request reconnect
                              </button>
                            )}
                          </div>
                        ) : isPending ? (
                          <div className="mt-4 space-y-3">
                            <Notice tone="info" text="This connection is pending. The contractor needs to accept before any sharing permissions can be used." />
                          </div>
                        ) : (
                          <>
                            <PermissionPicker
                              permissions={draft}
                              onChange={nextPermissions => updatePermissionDraft(connection.connection_id, nextPermissions)}
                            />
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void saveConnectionPermissions(connection)}
                                disabled={isSaving || isRevoking}
                                className={buttonClass('primary')}
                              >
                                <ClipboardCheck size={16} />
                                {isSaving ? 'Saving...' : 'Save sharing'}
                              </button>
                              <button
                                type="button"
                                onClick={() => updatePermissionDraft(connection.connection_id, EMPTY_PERMISSIONS)}
                                disabled={isRevoking}
                                className={buttonClass('secondary')}
                              >
                                Clear all sharing
                              </button>
                              <button
                                type="button"
                                onClick={() => void revokeConnection(connection)}
                                disabled={isRevoking}
                                className={buttonClass('danger')}
                              >
                                <Lock size={16} />
                                {isRevoking ? 'Revoking...' : 'Revoke access'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (requestingConnectionId === connection.connection_id) {
                                    setRequestingConnectionId(null);
                                    setServiceProblemText('');
                                    setServiceRequestDraft({
                                      connection_id: '',
                                      category: '',
                                      urgency: 'normal',
                                      title: '',
                                      description: '',
                                    });
                                    return;
                                  }
                                  startServiceRequestForConnection(connection);
                                }}
                                className={buttonClass('secondary')}
                              >
                                <MessageSquare size={16} />
                                {isRequestingService ? 'Hide request' : 'Start request'}
                              </button>
                            </div>
                            {isRequestingService && (
                              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                                <div className="mb-3">
                                  <p className="text-sm font-bold text-blue-950">Request service from {connection.business_name}</p>
                                  <p className="mt-1 text-sm text-blue-800">
                                    Send this request directly to this connected contractor.
                                  </p>
                                </div>
                                <ServiceCategoryAdvisor
                                  value={serviceProblemText}
                                  onChange={setServiceProblemText}
                                  allowedCategories={connectionServiceCategories}
                                  onApply={category => applySuggestedServiceCategory(category, {
                                    connectionId: connection.connection_id,
                                    allowedCategories: connectionServiceCategories,
                                  })}
                                />
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Field label="Service type">
                                    <select
                                      className={inputClass()}
                                      value={serviceRequestDraft.connection_id === connection.connection_id ? serviceRequestDraft.category : ''}
                                      onChange={event => setServiceRequestDraft(current => ({
                                        ...current,
                                        connection_id: connection.connection_id,
                                        category: event.target.value,
                                      }))}
                                    >
                                      <option value="">Choose service type</option>
                                      {connectionServiceCategories.map(category => (
                                        <option key={category} value={category}>{category}</option>
                                      ))}
                                    </select>
                                  </Field>
                                  <Field label="Urgency">
                                    <select
                                      className={inputClass()}
                                      value={serviceRequestDraft.urgency}
                                      onChange={event => setServiceRequestDraft(current => ({
                                        ...current,
                                        connection_id: connection.connection_id,
                                        urgency: event.target.value as ServiceRequestUrgency,
                                      }))}
                                    >
                                      {SERVICE_REQUEST_URGENCY_OPTIONS.map(urgency => <option key={urgency} value={urgency}>{urgency}</option>)}
                                    </select>
                                  </Field>
                                </div>
                                <div className="mt-3 grid gap-3">
                                  <Field label="Short title">
                                    <input
                                      className={inputClass()}
                                      value={serviceRequestDraft.title}
                                      onChange={event => setServiceRequestDraft(current => ({
                                        ...current,
                                        connection_id: connection.connection_id,
                                        title: event.target.value,
                                      }))}
                                      placeholder="Example: Leak under kitchen sink"
                                    />
                                  </Field>
                                  <Field label="What do you need help with?">
                                    <textarea
                                      className={inputClass()}
                                      rows={3}
                                      value={serviceRequestDraft.description}
                                      onChange={event => setServiceRequestDraft(current => ({
                                        ...current,
                                        connection_id: connection.connection_id,
                                        description: event.target.value,
                                      }))}
                                      placeholder="Add enough detail for the contractor to understand the issue."
                                    />
                                  </Field>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void createServiceRequest()}
                                    disabled={savingServiceRequest}
                                    className={buttonClass('primary')}
                                  >
                                    <Send size={16} />
                                    {savingServiceRequest ? 'Sending...' : 'Send request'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRequestingConnectionId(null);
                                      setServiceProblemText('');
                                      setServiceRequestDraft({
                                        connection_id: '',
                                        category: '',
                                        urgency: 'normal',
                                        title: '',
                                        description: '',
                                      });
                                    }}
                                    disabled={savingServiceRequest}
                                    className={buttonClass('secondary')}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card title="Find or request service" icon={<MessageSquare size={18} />}>
            <div className="space-y-4">
              <ServiceCategoryAdvisor
                value={serviceProblemText}
                onChange={setServiceProblemText}
                allowedCategories={SERVICE_REQUEST_CATEGORIES}
                onApply={category => applySuggestedServiceCategory(category, { allowedCategories: SERVICE_REQUEST_CATEGORIES })}
              />
              <Field label="Service type">
                <select
                  className={inputClass()}
                  value={serviceRequestDraft.category}
                  onChange={event => {
                    const nextCategory = event.target.value;
                    const selectedConnection = activeConnections.find(c => c.connection_id === serviceRequestDraft.connection_id);
                    const selectedContractor = selectedConnection ? contractorProfileById.get(selectedConnection.contractor_id) : null;
                    const selectedStillMatches = !nextCategory || selectedContractor?.service_categories.some(c => c.toLowerCase() === nextCategory.toLowerCase());
                    setServiceRequestDraft({
                      ...serviceRequestDraft,
                      category: nextCategory,
                      connection_id: selectedStillMatches ? serviceRequestDraft.connection_id : '',
                    });
                    setDirectoryCategory(nextCategory);
                  }}
                >
                  <option value="">Choose service type</option>
                  {SERVICE_REQUEST_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </Field>

              {serviceRequestDraft.category ? (
                <>
                  {connectedContractorsForRequest.length > 0 && (
                    <Field label="Your connected contractors">
                      <select
                        className={inputClass()}
                        value={serviceRequestDraft.connection_id}
                        onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, connection_id: event.target.value })}
                      >
                        <option value="">Choose connected contractor</option>
                        {connectedContractorsForRequest.map(connection => (
                          <option key={connection.connection_id} value={connection.connection_id}>{connection.business_name}</option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {serviceRequestDraft.connection_id ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Urgency">
                          <select
                            className={inputClass()}
                            value={serviceRequestDraft.urgency}
                            onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, urgency: event.target.value as ServiceRequestUrgency })}
                          >
                            {SERVICE_REQUEST_URGENCY_OPTIONS.map(urgency => <option key={urgency} value={urgency}>{urgency}</option>)}
                          </select>
                        </Field>
                        <Field label="Short title">
                          <input
                            className={inputClass()}
                            value={serviceRequestDraft.title}
                            onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, title: event.target.value })}
                            placeholder="Example: Leak under kitchen sink"
                          />
                        </Field>
                      </div>
                      <div className="mt-3">
                        <Field label="What do you need help with?">
                          <textarea
                            className={inputClass()}
                            rows={4}
                            value={serviceRequestDraft.description}
                            onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, description: event.target.value })}
                            placeholder="Add enough detail for the contractor to understand the issue."
                          />
                        </Field>
                      </div>
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Photos / Videos (optional)
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-blue-300 hover:bg-blue-50">
                          <Paperclip size={15} className="shrink-0 text-slate-400" />
                          Attach files
                          <input
                            type="file"
                            multiple
                            accept="image/*,video/*"
                            className="sr-only"
                            onChange={e => {
                              const picked = Array.from(e.target.files ?? []);
                              setNewRequestFiles(prev => [...prev, ...picked]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {newRequestFiles.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {newRequestFiles.map((file, i) => (
                              <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                                <span className="truncate">{file.name}</span>
                                <button type="button" onClick={() => setNewRequestFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-2 text-slate-400 hover:text-red-400"><X size={13} /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void createServiceRequest()}
                        disabled={savingServiceRequest}
                        className={`${buttonClass('primary')} mt-4`}
                      >
                        <MessageSquare size={16} />
                        {savingServiceRequest ? 'Sending...' : 'Send request'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Field label="City, state, or ZIP">
                        <input
                          className={inputClass()}
                          value={directoryLocation}
                          onChange={event => setDirectoryLocation(event.target.value)}
                          placeholder="Example: Fairhope, AL or 36532"
                        />
                      </Field>
                      <div className="space-y-3">
                        {filteredDirectoryContractors.length === 0 ? (
                          <EmptyState text="No public contractor profiles match that search yet." />
                        ) : (
                          filteredDirectoryContractors.map(contractor => {
                            const existingConnection = connectionByContractorId.get(contractor.id);
                            return (
                              <div key={contractor.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-bold text-slate-950">{contractor.business_name || 'Unnamed contractor'}</p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {contractor.city || 'City not listed'}{contractor.state ? `, ${contractor.state}` : ''}
                                      {contractor.zip_code ? ` · ${contractor.zip_code}` : ''}
                                    </p>
                                  </div>
                                  {existingConnection && (
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      existingConnection.status === 'active'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : existingConnection.status === 'pending'
                                          ? 'bg-amber-50 text-amber-700'
                                          : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {existingConnection.status}
                                    </span>
                                  )}
                                </div>
                                {contractor.service_categories.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {contractor.service_categories.map(category => (
                                      <span key={category} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                        {category}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <p className="mt-3 text-sm text-slate-600">{contractor.business_summary || 'No business summary added yet.'}</p>
                                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-xs font-medium text-slate-500">
                                    You choose what to share after the contractor approves the connection.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => void requestContractorConnection(contractor)}
                                    disabled={Boolean(existingConnection)}
                                    className={existingConnection ? buttonClass('secondary') : buttonClass('primary')}
                                  >
                                    <Link2 size={16} />
                                    {existingConnection ? 'Already requested' : 'Request connection'}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Notice tone="info" text="Start by choosing the type of service you need." />
              )}
            </div>
          </Card>

      </div>
      )}

      {homeownerTab === 'requests' && (
        <div className="space-y-5">
          <Card title="Start a new service request" icon={<MessageSquare size={18} />}>
            {!requestComposerOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-950">Need help with something new?</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Describe the issue, let ServSync suggest a contractor type, then send it to a connected contractor or search for one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRequestComposerOpen(true);
                    setRequestingConnectionId(null);
                  }}
                  className={buttonClass('primary')}
                >
                  <Plus size={16} />
                  New request
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">Create request</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Start with the issue description if you are not sure which type of contractor to choose.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestComposerOpen(false);
                      setServiceProblemText('');
                      setNewRequestFiles([]);
                      setServiceRequestDraft({
                        connection_id: '',
                        category: '',
                        urgency: 'normal',
                        title: '',
                        description: '',
                      });
                    }}
                    className={buttonClass('secondary')}
                  >
                    Cancel
                  </button>
                </div>

                <ServiceCategoryAdvisor
                  value={serviceProblemText}
                  onChange={setServiceProblemText}
                  allowedCategories={SERVICE_REQUEST_CATEGORIES}
                  onApply={category => applySuggestedServiceCategory(category, { allowedCategories: SERVICE_REQUEST_CATEGORIES })}
                />

                <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px]">
                  <Field label="Service type">
                    <select
                      className={inputClass()}
                      value={serviceRequestDraft.category}
                      onChange={event => {
                        const nextCategory = event.target.value;
                        const selectedConnection = activeConnections.find(c => c.connection_id === serviceRequestDraft.connection_id);
                        const selectedContractor = selectedConnection ? contractorProfileById.get(selectedConnection.contractor_id) : null;
                        const selectedStillMatches = !nextCategory || selectedContractor?.service_categories.some(c => c.toLowerCase() === nextCategory.toLowerCase());
                        setServiceRequestDraft({
                          ...serviceRequestDraft,
                          category: nextCategory,
                          connection_id: selectedStillMatches ? serviceRequestDraft.connection_id : '',
                        });
                        setDirectoryCategory(nextCategory);
                      }}
                    >
                      <option value="">Choose service type</option>
                      {SERVICE_REQUEST_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </Field>

                  <Field label="Connected contractor">
                    <select
                      className={inputClass()}
                      value={serviceRequestDraft.connection_id}
                      onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, connection_id: event.target.value })}
                      disabled={!serviceRequestDraft.category || connectedContractorsForRequest.length === 0}
                    >
                      <option value="">{connectedContractorsForRequest.length === 0 ? 'No connected match' : 'Choose contractor'}</option>
                      {connectedContractorsForRequest.map(connection => (
                        <option key={connection.connection_id} value={connection.connection_id}>{connection.business_name}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Urgency">
                    <select
                      className={inputClass()}
                      value={serviceRequestDraft.urgency}
                      onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, urgency: event.target.value as ServiceRequestUrgency })}
                    >
                      {SERVICE_REQUEST_URGENCY_OPTIONS.map(urgency => <option key={urgency} value={urgency}>{urgency}</option>)}
                    </select>
                  </Field>
                </div>

                {serviceRequestDraft.category && connectedContractorsForRequest.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-900">No connected contractor matches {serviceRequestDraft.category}.</p>
                    <p className="mt-1 text-sm text-amber-800">
                      You can search public contractors from the Contractors tab and request a connection before sending the service request.
                    </p>
                    <button type="button" onClick={() => setHomeownerTab('contractors')} className={`${buttonClass('secondary')} mt-3`}>
                      Search contractors
                    </button>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Short title">
                    <input
                      className={inputClass()}
                      value={serviceRequestDraft.title}
                      onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, title: event.target.value })}
                      placeholder="Example: Leak under kitchen sink"
                    />
                  </Field>
                  <Field label="Photos / videos">
                    <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-blue-300 hover:bg-blue-50">
                      <Paperclip size={15} className="shrink-0 text-slate-400" />
                      Attach files
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="sr-only"
                        onChange={event => {
                          const picked = Array.from(event.target.files ?? []);
                          setNewRequestFiles(prev => [...prev, ...picked]);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </Field>
                </div>

                <Field label="What do you need help with?">
                  <textarea
                    className={inputClass()}
                    rows={4}
                    value={serviceRequestDraft.description}
                    onChange={event => setServiceRequestDraft({ ...serviceRequestDraft, description: event.target.value })}
                    placeholder="Add enough detail for the contractor to understand the issue."
                  />
                </Field>

                {newRequestFiles.length > 0 && (
                  <ul className="space-y-1">
                    {newRequestFiles.map((file, i) => (
                      <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                        <span className="truncate">{file.name}</span>
                        <button type="button" onClick={() => setNewRequestFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-2 text-slate-400 hover:text-red-400"><X size={13} /></button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void createServiceRequest()}
                    disabled={savingServiceRequest || !serviceRequestDraft.connection_id}
                    className={buttonClass('primary')}
                  >
                    <Send size={16} />
                    {savingServiceRequest ? 'Sending...' : 'Send request'}
                  </button>
                  <button type="button" onClick={() => setHomeownerTab('contractors')} className={buttonClass('secondary')}>
                    Find contractors
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card title="My requests" icon={<ClipboardCheck size={18} />}>
          {(() => {
            const renderRequestCard = (request: ServiceRequestSummary) => {
              const isClosedCard = ['closed', 'declined'].includes(request.status);
              const isExpanded = expandedRequestIds.has(request.id);
              const isUpdating = updatingServiceRequestId === request.id;
              const lastMessage = request.messages[request.messages.length - 1];
              return (
                <div key={request.id} className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm border-l-4 ${serviceRequestStatusAccent(request.status)}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedRequestIds(prev => { const n = new Set(prev); n.has(request.id) ? n.delete(request.id) : n.add(request.id); return n; })}
                    className="w-full text-left px-4 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-950">{request.title}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${serviceRequestStatusClass(request.status)}`}>
                            {serviceRequestStatusLabel(request.status)}
                          </span>
                          {contractorRequestNeedsFollowUp(request) && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                              Follow-up needed
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {request.contractor_name} · {request.category} · {urgencyLabel(request.urgency)} · {formatDateTime(request.updated_at)}
                        </p>
                        {!isExpanded && lastMessage && (
                          <p className="mt-1 text-sm text-slate-500 line-clamp-1 italic">"{lastMessage.body}"</p>
                        )}
                      </div>
                      <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 px-4 pb-4 pt-4 space-y-4">
                      {isClosedCard && request.closing_summary && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                            <FileText size={11} /> Closing Summary
                          </p>
                          <p className="text-sm text-emerald-800">{request.closing_summary}</p>
                        </div>
                      )}
                      {isClosedCard && request.quote && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                            <Receipt size={11} /> Invoice
                          </p>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="flex-1 text-sm text-slate-600">{request.quote.scope || 'Services rendered'}</p>
                            <p className="shrink-0 text-lg font-bold text-slate-950">${(request.quote.amount_cents / 100).toFixed(2)}</p>
                          </div>
                          <p className={`mt-1 text-xs ${request.quote.status === 'accepted' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {request.quote.status === 'accepted' ? '✓ Accepted' : `Quote ${request.quote.status}`}
                          </p>
                        </div>
                      )}
                      <details open={!isClosedCard}>
                        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
                          Thread · {request.messages.length} {request.messages.length === 1 ? 'message' : 'messages'}
                        </summary>
                        <div className="mt-3"><ServiceRequestMessages messages={request.messages} media={request.media ?? []} /></div>
                      </details>
                      {!isClosedCard && (
                        <>
                          {request.quote && (
                            <ServiceRequestQuoteCard quote={request.quote} showActions
                              isUpdating={updatingQuoteRequestId === request.id}
                              onAccept={() => void respondToQuote(request, 'accept')}
                              onDecline={() => void respondToQuote(request, 'decline')}
                            />
                          )}
                          {request.appointment && (
                            <>
                              <ServiceRequestAppointmentCard appointment={request.appointment}
                                proposedByLabel={request.appointment.proposed_by === 'contractor' ? 'Contractor proposed' : 'You proposed'}
                                nextActionLabel={appointmentNextActionText(request.appointment, 'homeowner')}
                              />
                              {request.appointment.status === 'confirmed' && (
                                homeownerRescheduleDrafts[request.id]?.open ? (
                                  <div className="space-y-3">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <Field label="New date & time">
                                        <input className={inputClass()} type="datetime-local"
                                          value={homeownerRescheduleDrafts[request.id]?.proposedAt ?? ''}
                                          onChange={e => setHomeownerRescheduleDrafts(c => ({ ...c, [request.id]: { ...(c[request.id] || { open: true, notes: '' }), proposedAt: e.target.value } }))}
                                        />
                                      </Field>
                                      <Field label="Reason (optional)">
                                        <input className={inputClass()} placeholder="Why you need to reschedule..."
                                          value={homeownerRescheduleDrafts[request.id]?.notes ?? ''}
                                          onChange={e => setHomeownerRescheduleDrafts(c => ({ ...c, [request.id]: { ...(c[request.id] || { open: true, proposedAt: '' }), notes: e.target.value } }))}
                                        />
                                      </Field>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button type="button" className={buttonClass('primary')}
                                        disabled={!homeownerRescheduleDrafts[request.id]?.proposedAt || homeownerReschedulingId === request.id}
                                        onClick={() => void rescheduleAsHomeowner(request)}
                                      >{homeownerReschedulingId === request.id ? 'Sending...' : 'Send reschedule request'}</button>
                                      <button type="button" className={buttonClass('secondary')}
                                        disabled={homeownerReschedulingId === request.id}
                                        onClick={() => setHomeownerRescheduleDrafts(c => ({ ...c, [request.id]: { open: false, proposedAt: '', notes: '' } }))}
                                      >Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button type="button" className={buttonClass('secondary')}
                                    onClick={() => setHomeownerRescheduleDrafts(c => ({ ...c, [request.id]: { open: true, proposedAt: '', notes: '' } }))}
                                  >
                                    <Calendar size={15} />
                                    Request reschedule
                                  </button>
                                )
                              )}
                              {request.appointment.status === 'proposed' && (
                                request.appointment.proposed_by === 'contractor' ? (
                                  counterProposeDrafts[request.id]?.open ? (
                                    <div className="space-y-3">
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Your proposed date & time">
                                          <input className={inputClass()} type="datetime-local"
                                            value={counterProposeDrafts[request.id]?.proposedAt ?? ''}
                                            onChange={e => setCounterProposeDrafts(c => ({ ...c, [request.id]: { ...(c[request.id] || { open: true, notes: '' }), proposedAt: e.target.value } }))}
                                          />
                                        </Field>
                                        <Field label="Notes (optional)">
                                          <input className={inputClass()} placeholder="Why you need a different time, etc."
                                            value={counterProposeDrafts[request.id]?.notes ?? ''}
                                            onChange={e => setCounterProposeDrafts(c => ({ ...c, [request.id]: { ...(c[request.id] || { open: true, proposedAt: '' }), notes: e.target.value } }))}
                                          />
                                        </Field>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <button type="button" className={buttonClass('primary')}
                                          disabled={!counterProposeDrafts[request.id]?.proposedAt || updatingAppointmentRequestId === request.id}
                                          onClick={() => void respondToAppointment(request, 'counter', counterProposeDrafts[request.id]?.proposedAt, counterProposeDrafts[request.id]?.notes)}
                                        >{updatingAppointmentRequestId === request.id ? 'Sending...' : 'Send counter-proposal'}</button>
                                        <button type="button" className={buttonClass('secondary')}
                                          disabled={updatingAppointmentRequestId === request.id}
                                          onClick={() => setCounterProposeDrafts(c => ({ ...c, [request.id]: { open: false, proposedAt: '', notes: '' } }))}
                                        >Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      <button type="button" className={buttonClass('primary')}
                                        disabled={updatingAppointmentRequestId === request.id}
                                        onClick={() => void respondToAppointment(request, 'confirm')}
                                      ><CheckCircle2 size={16} />{updatingAppointmentRequestId === request.id ? 'Updating...' : 'Confirm appointment'}</button>
                                      <button type="button" className={buttonClass('secondary')}
                                        disabled={updatingAppointmentRequestId === request.id}
                                        onClick={() => setCounterProposeDrafts(c => ({ ...c, [request.id]: { open: true, proposedAt: '', notes: '' } }))}
                                      >Propose new time</button>
                                      <button type="button" className={buttonClass('secondary')}
                                        disabled={updatingAppointmentRequestId === request.id}
                                        onClick={() => void respondToAppointment(request, 'decline')}
                                      >Decline</button>
                                    </div>
                                  )
                                ) : (
                                  <p className="text-sm font-medium text-slate-500">{appointmentResponseText(request.appointment, 'homeowner')}</p>
                                )
                              )}
                            </>
                          )}
                          <div className="space-y-3">
                            <Field label="Reply">
                              <textarea className={inputClass()} rows={3}
                                value={homeownerReplyDrafts[request.id] || ''}
                                onChange={e => setHomeownerReplyDrafts(c => ({ ...c, [request.id]: e.target.value }))}
                                placeholder="Add a reply or update for the contractor."
                              />
                            </Field>
                            <div>
                              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-blue-300 hover:bg-blue-50">
                                <Paperclip size={15} className="shrink-0 text-slate-400" />
                                Attach photos / videos
                                <input
                                  type="file"
                                  multiple
                                  accept="image/*,video/*"
                                  className="sr-only"
                                  onChange={e => {
                                    const picked = Array.from(e.target.files ?? []);
                                    setReplyFiles(prev => ({ ...prev, [request.id]: [...(prev[request.id] ?? []), ...picked] }));
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {(replyFiles[request.id] ?? []).length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {(replyFiles[request.id] ?? []).map((file, i) => (
                                    <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                                      <span className="truncate">{file.name}</span>
                                      <button type="button" onClick={() => setReplyFiles(prev => ({ ...prev, [request.id]: (prev[request.id] ?? []).filter((_, idx) => idx !== i) }))} className="ml-2 text-slate-400 hover:text-red-400"><X size={13} /></button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => void updateHomeownerServiceRequest(request, 'reply')} disabled={isUpdating} className={buttonClass('primary')}>
                                {isUpdating ? 'Sending...' : 'Send reply'}
                              </button>
                              <button type="button" onClick={() => void updateHomeownerServiceRequest(request, 'close')} disabled={isUpdating} className={buttonClass('secondary')}>
                                Close request
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                      {isClosedCard && (
                        <div className="space-y-3">
                          {/* Review section */}
                          {request.review ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your review</p>
                              <StarDisplay rating={request.review.rating} />
                              {request.review.kudos.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {request.review.kudos.map(k => (
                                    <span key={k} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{k}</span>
                                  ))}
                                </div>
                              )}
                              {request.review.body && <p className="mt-2 text-sm text-slate-600 italic">"{request.review.body}"</p>}
                              {(request.review.reviewer_display_name || request.review.reviewer_location) && (
                                <p className="mt-1.5 text-xs text-slate-500">
                                  — {[request.review.reviewer_display_name, request.review.reviewer_location].filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                          ) : reviewDrafts[request.id]?.open ? (
                            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-sm font-semibold text-slate-950">Leave a review for {request.contractor_name}</p>
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Rating</p>
                                <div className="flex gap-1">
                                  {[1,2,3,4,5].map(star => (
                                    <button key={star} type="button"
                                      onClick={() => setReviewDrafts(prev => ({ ...prev, [request.id]: { ...(prev[request.id] ?? { open: true, kudos: [], body: '' }), rating: star } }))}
                                      className={`text-xl transition ${(reviewDrafts[request.id]?.rating ?? 0) >= star ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}
                                    >★</button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Kudos (optional)</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {KUDOS_OPTIONS.map(k => {
                                    const selected = (reviewDrafts[request.id]?.kudos ?? []).includes(k);
                                    return (
                                      <button key={k} type="button"
                                        onClick={() => setReviewDrafts(prev => {
                                          const cur = prev[request.id] ?? { open: true, rating: 0, body: '' };
                                          const kudos = cur.kudos ?? [];
                                          return { ...prev, [request.id]: { ...cur, kudos: selected ? kudos.filter(x => x !== k) : [...kudos, k] } };
                                        })}
                                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${selected ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'}`}
                                      >{k}</button>
                                    );
                                  })}
                                </div>
                              </div>
                              <Field label="Comment (optional)">
                                <textarea className={inputClass()} rows={2}
                                  value={reviewDrafts[request.id]?.body ?? ''}
                                  onChange={e => setReviewDrafts(prev => ({ ...prev, [request.id]: { ...(prev[request.id] ?? { open: true, rating: 0, kudos: [], displayName: '', location: '' }), body: e.target.value } }))}
                                  placeholder="Anything you'd like to add..."
                                />
                              </Field>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Your name (optional — shown publicly)">
                                  <input className={inputClass()} placeholder="e.g. Sarah M."
                                    value={reviewDrafts[request.id]?.displayName ?? ''}
                                    onChange={e => setReviewDrafts(prev => ({ ...prev, [request.id]: { ...(prev[request.id] ?? { open: true, rating: 0, kudos: [], body: '', location: '' }), displayName: e.target.value } }))}
                                  />
                                </Field>
                                <Field label="Your city/state (optional — shown publicly)">
                                  <input className={inputClass()} placeholder="e.g. Fairhope, AL"
                                    value={reviewDrafts[request.id]?.location ?? ''}
                                    onChange={e => setReviewDrafts(prev => ({ ...prev, [request.id]: { ...(prev[request.id] ?? { open: true, rating: 0, kudos: [], body: '', displayName: '' }), location: e.target.value } }))}
                                  />
                                </Field>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={buttonClass('primary')}
                                  disabled={!reviewDrafts[request.id]?.rating || submittingReviewId === request.id}
                                  onClick={() => void submitReview(request)}
                                ><Star size={15} />{submittingReviewId === request.id ? 'Submitting...' : 'Submit review'}</button>
                                <button type="button" className={buttonClass('secondary')}
                                  onClick={() => setReviewDrafts(prev => ({ ...prev, [request.id]: { ...prev[request.id], open: false } }))}
                                >Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" className={buttonClass('secondary')}
                              onClick={() => setReviewDrafts(prev => ({ ...prev, [request.id]: { open: true, rating: 0, kudos: [], body: '', displayName: '', location: '' } }))}
                            ><Star size={15} />Leave a review</button>
                          )}
                          {/* Log this job */}
                          {!maintenanceLog.some(e => e.service_request_id === request.id) && (
                            quickLogDrafts[request.id] ? (
                              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-sm font-semibold text-slate-950">Log this job</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Field label="Date work was done">
                                    <input className={inputClass()} type="date"
                                      value={logDraft.performed_at}
                                      onChange={e => setLogDraft(d => ({ ...d, performed_at: e.target.value }))}
                                    />
                                  </Field>
                                  <Field label="Cost ($) — optional">
                                    <input className={inputClass()} type="number" min="0" step="0.01" placeholder="0.00"
                                      value={logDraft.cost}
                                      onChange={e => setLogDraft(d => ({ ...d, cost: e.target.value }))}
                                    />
                                  </Field>
                                </div>
                                <Field label="Notes — optional">
                                  <input className={inputClass()} placeholder="Warranty, permit numbers, follow-up, etc."
                                    value={logDraft.notes}
                                    onChange={e => setLogDraft(d => ({ ...d, notes: e.target.value }))}
                                  />
                                </Field>
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" className={buttonClass('primary')} disabled={savingLogEntry} onClick={() => void saveLogEntry()}>
                                    <ClipboardList size={15} />{savingLogEntry ? 'Saving...' : 'Save to log'}
                                  </button>
                                  <button type="button" className={buttonClass('secondary')} onClick={() => setQuickLogDrafts(p => ({ ...p, [request.id]: false }))}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button type="button" className={buttonClass('secondary')}
                                onClick={() => {
                                  setLogDraft({
                                    service_request_id: request.id,
                                    category: request.category,
                                    title: request.title,
                                    description: request.closing_summary || request.description,
                                    performed_at: new Date().toISOString().slice(0,10),
                                    contractor_name: request.contractor_name,
                                    cost: request.quote?.status === 'accepted' ? String((request.quote.amount_cents / 100).toFixed(2)) : '',
                                    notes: '',
                                  });
                                  setQuickLogDrafts(p => ({ ...p, [request.id]: true }));
                                }}
                              ><ClipboardList size={15} />Log this job</button>
                            )
                          )}
                          {maintenanceLog.some(e => e.service_request_id === request.id) && (
                            <p className="text-xs text-slate-400 flex items-center gap-1"><ClipboardList size={13} /> Logged in maintenance log</p>
                          )}
                          {/* Reopen section */}
                          {reopenDrafts[request.id]?.open ? (
                            <div className="space-y-3">
                              <Field label="Reason for reopening (optional)">
                                <textarea className={inputClass()} rows={2}
                                  value={reopenDrafts[request.id]?.body ?? ''}
                                  onChange={e => setReopenDrafts(c => ({ ...c, [request.id]: { ...(c[request.id] || { open: true }), body: e.target.value } }))}
                                  placeholder="Describe what needs follow-up..."
                                />
                              </Field>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={buttonClass('primary')} disabled={reopeningRequestId === request.id} onClick={() => void reopenRequest(request)}>
                                  <RotateCcw size={15} />{reopeningRequestId === request.id ? 'Reopening...' : 'Reopen request'}
                                </button>
                                <button type="button" className={buttonClass('secondary')} disabled={reopeningRequestId === request.id}
                                  onClick={() => setReopenDrafts(c => ({ ...c, [request.id]: { open: false, body: '' } }))}
                                >Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" className={buttonClass('secondary')}
                              onClick={() => setReopenDrafts(c => ({ ...c, [request.id]: { open: true, body: '' } }))}
                            ><RotateCcw size={15} />Reopen for follow-up</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            };
            const isHomeownerAttention = homeownerRequestNeedsResponse;
            const requestSections: Array<{ id: HomeownerRequestView; title: string; helper: string; requests: ServiceRequestSummary[] }> = [
              {
                id: 'attention',
                title: 'Needs your response',
                helper: 'Contractor replies, quotes, or proposed appointment times waiting on you.',
                requests: serviceRequests.filter(isHomeownerAttention),
              },
              {
                id: 'new',
                title: 'New requests',
                helper: 'Requests sent to contractors that have not been answered yet.',
                requests: serviceRequests.filter(r => r.status === 'open' && !r.appointment),
              },
              {
                id: 'scheduled',
                title: 'Scheduled and appointment requests',
                helper: 'Confirmed appointments and time changes that are already in motion.',
                requests: serviceRequests.filter(r =>
                  !['closed', 'declined'].includes(r.status)
                  && Boolean(r.appointment)
                  && !isHomeownerAttention(r)
                ),
              },
              {
                id: 'closed',
                title: 'Closed and invoiced',
                helper: 'Completed requests. Quotes or invoices stay attached for your records.',
                requests: serviceRequests.filter(r => r.status === 'closed'),
              },
              {
                id: 'declined',
                title: 'Declined',
                helper: 'Requests that were declined or cancelled.',
                requests: serviceRequests.filter(r => r.status === 'declined'),
              },
            ];
            const activeHomeownerRequestView = requestSections.find(section => section.id === homeownerRequestView)?.id
              ?? homeownerRequestView;
            const selectedSection = requestSections.find(section => section.id === activeHomeownerRequestView) ?? requestSections[0];
            const filteredRequests = selectedSection.requests.filter(request => serviceRequestMatchesSearch(request, homeownerRequestSearch));

            return (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {requestSections.map(section => {
                    const active = section.id === activeHomeownerRequestView;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setHomeownerRequestView(section.id)}
                        className={`rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                          active
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-950 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${active ? 'text-blue-50' : 'text-slate-500'}`}>{section.title}</p>
                        <p className="mt-1 text-xl font-bold">{section.requests.length}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_18rem] lg:items-end">
                    <div>
                      <p className="text-sm font-bold text-slate-950">{selectedSection.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{selectedSection.helper}</p>
                    </div>
                    <Field label="Search this queue">
                      <input
                        className={inputClass()}
                        value={homeownerRequestSearch}
                        onChange={event => setHomeownerRequestSearch(event.target.value)}
                        placeholder="Search title, trade, contractor..."
                      />
                    </Field>
                  </div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                      {filteredRequests.length} shown of {selectedSection.requests.length}
                    </span>
                    {homeownerRequestSearch && (
                      <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-800" onClick={() => setHomeownerRequestSearch('')}>
                        Clear search
                      </button>
                    )}
                  </div>
                  {filteredRequests.length === 0 ? (
                    <EmptyState text={selectedSection.requests.length === 0 ? 'No requests in this queue.' : 'No requests match that search.'} />
                  ) : (
                    <div className="space-y-2">
                      {filteredRequests.map(renderRequestCard)}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Card>
        </div>
      )}

      {homeownerTab === 'calendar' && (
        <Card title="My calendar" icon={<Calendar size={18} />}>
          <CalendarView
            requests={serviceRequests}
            perspective="homeowner"
            onOpenRequest={request => {
              setHomeownerRequestView(homeownerRequestQueueFor(request));
              setExpandedRequestIds(new Set([request.id]));
              setHomeownerTab('requests');
            }}
          />
        </Card>
      )}

      {homeownerTab === 'estimates' && (
        <Card title="Estimates" icon={<Receipt size={18} />}>
          <div className="space-y-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Review estimates from connected contractors</p>
              <p className="mt-1 text-sm text-blue-800">
                Draft estimates stay private to the contractor. Anything shown here has been sent to you for review.
              </p>
            </div>
            {estimates.length === 0 ? (
              <EmptyState text="No estimates have been sent to you yet." />
            ) : (
              estimates.map(estimate => {
                const contractorName = connections.find(connection => connection.contractor_id === estimate.contractor_id)?.business_name
                  || directoryContractors.find(contractor => contractor.id === estimate.contractor_id)?.business_name
                  || 'Contractor';
                const estimateFiled = maintenanceLog.some(entry => entry.estimate_id === estimate.id);
                return (
                  <div key={estimate.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-950">{estimate.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estimate.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : estimate.status === 'declined' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                            {estimate.status}
                          </span>
                          {estimateFiled && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                              Filed
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{contractorName} · Updated {formatDateTime(estimate.updated_at)}</p>
                      </div>
                      <p className="text-2xl font-bold text-slate-950">${(estimate.total_cents / 100).toFixed(2)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => downloadEstimatePdf(estimate, {
                          contractorName,
                          customerName: homeowner?.display_name || profile.full_name || 'Homeowner',
                          customerAddress: home?.address_line1 || '',
                        })}
                        className={buttonClass('secondary')}
                      >
                        <Download size={16} />
                        Download PDF
                      </button>
                      {estimate.status === 'accepted' && (
                        <button
                          type="button"
                          onClick={() => void fileEstimateToHomeRecords(estimate, contractorName)}
                          disabled={filingEstimateId === estimate.id || estimateFiled}
                          className={estimateFiled ? buttonClass('secondary') : buttonClass('primary')}
                        >
                          <FolderOpen size={16} />
                          {estimateFiled ? 'Filed to records' : filingEstimateId === estimate.id ? 'Filing...' : 'File to Documents & Log'}
                        </button>
                      )}
                    </div>
                    {estimate.scope && <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{estimate.scope}</p>}
                    {estimate.line_items && estimate.line_items.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                        {estimate.line_items.sort((a, b) => a.sort_order - b.sort_order).map(line => (
                          <div key={line.id} className="grid gap-2 border-b border-slate-200 bg-white px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[1fr_6rem_6rem]">
                            <span className="text-slate-700">{line.description}</span>
                            <span className="text-slate-500">{line.quantity} {line.unit}</span>
                            <span className="font-semibold text-slate-950 sm:text-right">${((line.quantity * line.unit_price_cents) / 100).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(estimate.notes || estimate.terms) && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {estimate.notes && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes / exclusions</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{estimate.notes}</p>
                          </div>
                        )}
                        {estimate.terms && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{estimate.terms}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {estimate.status === 'sent' && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                        <button
                          type="button"
                          onClick={() => void respondToEstimate(estimate, 'accept')}
                          disabled={updatingEstimateId === estimate.id}
                          className={buttonClass('primary')}
                        >
                          <CheckCircle2 size={16} />
                          {updatingEstimateId === estimate.id ? 'Updating...' : 'Accept estimate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void respondToEstimate(estimate, 'decline')}
                          disabled={updatingEstimateId === estimate.id}
                          className={buttonClass('secondary')}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    {estimate.status === 'accepted' && (
                      <Notice tone="success" text={estimateFiled
                        ? 'This estimate has been saved to your Documents and Maintenance Log.'
                        : 'You accepted this estimate. You can file a copy to Documents and add it to your Maintenance Log when you are ready.'}
                      />
                    )}
                    {estimate.status === 'declined' && (
                      <Notice tone="info" text="You declined this estimate. The contractor can revise it if needed." />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {homeownerTab === 'log' && (
        <div className="space-y-4">
          {/* Stats row */}
          {maintenanceLog.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total jobs logged</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{maintenanceLog.length}</p>
              </div>
              {(() => {
                const total = maintenanceLog.reduce((s, e) => s + (e.cost_cents ?? 0), 0);
                return total > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total cost tracked</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Add entry form */}
          <Card title="Maintenance log" icon={<ClipboardList size={18} />}>
            {!logFormOpen ? (
              <button type="button" className={buttonClass('primary')}
                onClick={() => {
                  setLogDraft(emptyLogDraft());
                  setLogInvoiceFile(null);
                  setLogInvoiceNotice('');
                  setLogFormOpen(true);
                }}
              >
                <Plus size={16} />Add log entry
              </button>
            ) : (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">New log entry</p>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-blue-950">Upload invoice or receipt</p>
                      <p className="mt-1 text-sm text-blue-800">
                        Add a photo or PDF now. ServSync will save it in Documents as a receipt and link it to this log entry.
                      </p>
                      <p className="mt-1 text-xs text-blue-700">
                        Today, smart fill uses details it can read from the file name. OCR/AI reading from the photo itself can plug into this same flow later.
                      </p>
                    </div>
                    <label className={`${buttonClass('secondary')} cursor-pointer bg-white`}>
                      <Upload size={16} />
                      Choose invoice
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file) applyInvoiceFileToLogDraft(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  {logInvoiceFile && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{logInvoiceFile.name}</p>
                        <p className="text-xs text-slate-500">{logInvoiceFile.type || 'File'} · {Math.max(1, Math.round(logInvoiceFile.size / 1024))} KB</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLogInvoiceFile(null);
                          setLogInvoiceNotice('');
                        }}
                        className="text-sm font-semibold text-slate-500 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {logInvoiceNotice && <p className="mt-3 text-xs font-medium text-blue-800">{logInvoiceNotice}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Date work was done">
                    <input className={inputClass()} type="date"
                      value={logDraft.performed_at}
                      onChange={e => setLogDraft(d => ({ ...d, performed_at: e.target.value }))}
                    />
                  </Field>
                  <Field label="Category">
                    <select className={inputClass()} value={logDraft.category} onChange={e => setLogDraft(d => ({ ...d, category: e.target.value }))}>
                      <option value="">Select category</option>
                      {SERVICE_REQUEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Title">
                    <input className={inputClass()} placeholder="e.g. Replaced kitchen faucet"
                      value={logDraft.title}
                      onChange={e => setLogDraft(d => ({ ...d, title: e.target.value }))}
                    />
                  </Field>
                  <Field label="Contractor / who did the work">
                    <input className={inputClass()} placeholder="Name or company"
                      value={logDraft.contractor_name}
                      onChange={e => setLogDraft(d => ({ ...d, contractor_name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Cost ($) — optional">
                    <input className={inputClass()} type="number" min="0" step="0.01" placeholder="0.00"
                      value={logDraft.cost}
                      onChange={e => setLogDraft(d => ({ ...d, cost: e.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="Description / what was done">
                  <textarea className={inputClass()} rows={3}
                    placeholder="Describe the work completed, materials used, etc."
                    value={logDraft.description}
                    onChange={e => setLogDraft(d => ({ ...d, description: e.target.value }))}
                  />
                </Field>
                <Field label="Notes — optional">
                  <input className={inputClass()} placeholder="Warranty info, permit numbers, follow-up needed, etc."
                    value={logDraft.notes}
                    onChange={e => setLogDraft(d => ({ ...d, notes: e.target.value }))}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass('primary')} disabled={savingLogEntry} onClick={() => void saveLogEntry()}>
                    <ClipboardList size={16} />{savingLogEntry ? (logInvoiceFile ? 'Saving invoice...' : 'Saving...') : 'Save entry'}
                  </button>
                  <button type="button" className={buttonClass('secondary')} disabled={savingLogEntry} onClick={() => {
                    setLogInvoiceFile(null);
                    setLogInvoiceNotice('');
                    setLogFormOpen(false);
                  }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Log list */}
            {maintenanceLog.length === 0 && !logFormOpen && (
              <p className="mt-4 text-sm text-slate-500">No log entries yet. Add your first entry or log a job from a closed service request.</p>
            )}
            {maintenanceLog.length > 0 && (
              <div className="mt-4 space-y-3">
                {maintenanceLog.map(entry => {
                  const invoiceDocument = entry.invoice_document_id ? homeDocumentById.get(entry.invoice_document_id) : null;
                  const reportDocument = entry.report_document_id ? homeDocumentById.get(entry.report_document_id) : null;
                  return (
                  <div key={entry.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-950">{entry.title}</span>
                          {entry.category && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{entry.category}</span>
                          )}
                          {entry.service_request_id && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">From request</span>
                          )}
                          {entry.inspection_id && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Field work</span>
                          )}
                          {reportDocument && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Report filed</span>
                          )}
                          {invoiceDocument && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Invoice attached</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {new Date(entry.performed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                          {entry.contractor_name ? ` · ${entry.contractor_name}` : ''}
                          {entry.cost_cents ? ` · $${(entry.cost_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
                        </p>
                        {entry.description && <p className="mt-1.5 text-sm text-slate-700">{entry.description}</p>}
                        {entry.notes && <p className="mt-1 text-xs text-slate-500 italic">{entry.notes}</p>}
                        {(reportDocument || invoiceDocument) && (
                          <div className="mt-2 flex flex-wrap gap-3">
                            {reportDocument && (
                              <button
                                type="button"
                                onClick={() => void downloadDocument(reportDocument)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                              >
                                <FileText size={13} />
                                View report
                              </button>
                            )}
                            {invoiceDocument && (
                              <button
                                type="button"
                                onClick={() => void downloadDocument(invoiceDocument)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                              >
                                <Receipt size={13} />
                                View invoice
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <button type="button"
                        disabled={deletingLogId === entry.id}
                        onClick={() => void deleteLogEntry(entry.id)}
                        className="shrink-0 text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete entry"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {homeownerTab === 'documents' && (
        <div className="space-y-5">
          <Card title="Home documents" icon={<FolderOpen size={18} />}>
            <p className="text-sm text-slate-500 mb-4">
              Store warranty documents, inspection reports, appliance manuals, permits, and other home records securely. Files are private and only accessible by you.
            </p>

            {/* Upload area */}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Document type">
                  <select
                    className={inputClass()}
                    value={docUploadType}
                    onChange={e => setDocUploadType(e.target.value as HomeDocumentType)}
                  >
                    <option value="warranty">Warranty</option>
                    <option value="manual">Appliance manual</option>
                    <option value="inspection">Inspection report</option>
                    <option value="insurance">Insurance document</option>
                    <option value="permit">Permit</option>
                    <option value="receipt">Receipt / Invoice</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Notes (optional)">
                  <input
                    className={inputClass()}
                    value={docUploadNotes}
                    onChange={e => setDocUploadNotes(e.target.value)}
                    placeholder="e.g. HVAC unit, purchased 2024"
                  />
                </Field>
              </div>
              <label className={`${buttonClass('primary')} mt-3 cursor-pointer inline-flex ${docUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={16} />
                {docUploading ? 'Uploading...' : 'Choose file to upload'}
                <input
                  type="file"
                  className="hidden"
                  disabled={docUploading}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void uploadDocument(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">PDF, images, Word docs, and more — up to 50 MB per file.</p>
            </div>

            {/* Document list */}
            {homeDocuments.length === 0 ? (
              <EmptyState text="No documents uploaded yet." />
            ) : (
              <div className="mt-4 space-y-2">
                {homeDocuments.map(doc => {
                  const typeLabels: Record<string, string> = {
                    warranty: 'Warranty', manual: 'Manual', inspection: 'Inspection',
                    insurance: 'Insurance', permit: 'Permit', receipt: 'Receipt', other: 'Other',
                  };
                  const sizeLabel = doc.file_size_bytes
                    ? doc.file_size_bytes > 1_000_000
                      ? `${(doc.file_size_bytes / 1_000_000).toFixed(1)} MB`
                      : `${Math.round(doc.file_size_bytes / 1024)} KB`
                    : '';
                  return (
                    <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <FileText size={18} className="shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-slate-950 text-sm">{doc.file_name}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {typeLabels[doc.document_type] ?? doc.document_type}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {new Date(doc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          {sizeLabel ? ` · ${sizeLabel}` : ''}
                          {doc.notes ? ` · ${doc.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void downloadDocument(doc)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="Download"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={docDeletingId === doc.id}
                          onClick={() => void deleteDocument(doc)}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {homeownerTab === 'discover' && (
        <DiscoverFeed
          perspective="homeowner"
          userId={profile.id}
          contractorId={null}
          connections={connections}
          onConnectionRequested={loadHomeowner}
          onRequestService={(contractorId, category) => {
            const connection = connections.find(item => item.contractor_id === contractorId && item.status === 'active');
            if (!connection) return;
            startServiceRequestForConnection(connection, category);
            setHomeownerTab('contractors');
          }}
        />
      )}

      {homeownerTab === 'support' && (
        <SupportInboxPanel
          title="ServSync support"
          description="Request a new feature, ask for a tweak, report an issue, or send a question. ServSync can reply here, and the full conversation stays on file."
          inquiries={supportInquiries}
          draft={supportDraft}
          onDraftChange={setSupportDraft}
          replyDrafts={supportReplyDrafts}
          onReplyDraftChange={(inquiryId, body) => setSupportReplyDrafts(current => ({ ...current, [inquiryId]: body }))}
          onCreate={() => void createSupportInquiry()}
          onReply={inquiry => void replyToSupportInquiry(inquiry)}
          saving={savingSupport}
        />
      )}

    </SidebarLayout>
  );
}

function ContractorDashboard({ profile, onSignOut }: { profile: Profile; onSignOut: () => Promise<void> }) {
  const [contractor, setContractor] = useState<ContractorProfile | null>(null);
  const [connections, setConnections] = useState<ContractorConnectedHomeowner[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<ContractorConnectionRequest[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestSummary[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimateTemplates, setEstimateTemplates] = useState<EstimateTemplate[]>([]);
  const [invites, setInvites] = useState<ContractorInvite[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [contractorTab, setContractorTab] = useState<ContractorTab>(() => storedTab(STORAGE_KEYS.contractorTab, ['overview', 'profile', 'connections', 'requests', 'calendar', 'invites', 'discover', 'inspections', 'support'] as const, 'overview'));
  const [homeownerFilter, setHomeownerFilter] = useState<'active' | 'inactive'>(() => storedTab(STORAGE_KEYS.contractorHomeownerFilter, ['active', 'inactive'] as const, 'active'));
  const [homeownerWorkspaceSearch, setHomeownerWorkspaceSearch] = useState(() => window.localStorage.getItem(STORAGE_KEYS.contractorHomeownerSearch) ?? '');
  const [selectedHomeownerSubjectId, setSelectedHomeownerSubjectId] = useState<string | null>(() => window.localStorage.getItem(STORAGE_KEYS.contractorSelectedHomeowner));
  const [homeownerDetailTab, setHomeownerDetailTab] = useState<HomeownerWorkspaceTab>(() => storedTab(STORAGE_KEYS.contractorHomeownerDetailTab, ['overview', 'profile', 'home', 'fieldwork', 'estimates', 'requests', 'schedule'] as const, 'overview'));
  const [homeownerWorkspaceRequestView, setHomeownerWorkspaceRequestView] = useState<HomeownerWorkspaceRequestView>(() => storedTab(STORAGE_KEYS.contractorHomeownerRequestView, ['attention', 'active', 'closed'] as const, 'active'));
  const [homeownerWorkspaceEstimateView, setHomeownerWorkspaceEstimateView] = useState<HomeownerWorkspaceEstimateView>('draft');
  const [selectedHomeownerRequestId, setSelectedHomeownerRequestId] = useState<string | null>(null);
  const [estimateComposerOpen, setEstimateComposerOpen] = useState(false);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [estimateDraft, setEstimateDraft] = useState<EstimateDraft>(() => createBlankEstimateDraft());
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [sendingEstimateId, setSendingEstimateId] = useState<string | null>(null);
  const [savingEstimateTemplateId, setSavingEstimateTemplateId] = useState<string | null>(null);
  const [expandedEstimateTemplateId, setExpandedEstimateTemplateId] = useState<string | null>(null);
  const [renamingEstimateTemplateId, setRenamingEstimateTemplateId] = useState<string | null>(null);
  const [deletingEstimateTemplateId, setDeletingEstimateTemplateId] = useState<string | null>(null);
  const [estimateTemplateSearch, setEstimateTemplateSearch] = useState('');
  const [estimateAssistantText, setEstimateAssistantText] = useState('');
  const [estimateAssistantListening, setEstimateAssistantListening] = useState(false);
  const [estimateAssistantNotice, setEstimateAssistantNotice] = useState('');
  const [connectionHistory, setConnectionHistory] = useState<Record<string, ConnectionAuditEvent[]>>({});
  const [contractorResponseDrafts, setContractorResponseDrafts] = useState<Record<string, string>>({});
  const [contractorQuoteDrafts, setContractorQuoteDrafts] = useState<Record<string, { enabled: boolean; amount: string; scope: string }>>({});
  const [appointmentDrafts, setAppointmentDrafts] = useState<Record<string, { enabled: boolean; proposedAt: string; notes: string }>>({});
  const [proposingAppointmentId, setProposingAppointmentId] = useState<string | null>(null);
  const [contractorCounterProposeDrafts, setContractorCounterProposeDrafts] = useState<Record<string, { open: boolean; proposedAt: string; notes: string }>>({});
  const [respondingToHomeownerApptId, setRespondingToHomeownerApptId] = useState<string | null>(null);
  const [contractorExpandedRequestIds, setContractorExpandedRequestIds] = useState<Set<string>>(new Set());
  const [contractorRequestView, setContractorRequestView] = useState<ContractorRequestView>('overview');
  const [contractorRequestSearch, setContractorRequestSearch] = useState('');
  const [closingSummaryDrafts, setClosingSummaryDrafts] = useState<Record<string, string>>({});
  const [closingExpandedId, setClosingExpandedId] = useState<string | null>(null);
  const [contractorReopenDrafts, setContractorReopenDrafts] = useState<Record<string, { open: boolean; body: string }>>({});
  const [contractorReopeningRequestId, setContractorReopeningRequestId] = useState<string | null>(null);
  const [contractorRescheduleDrafts, setContractorRescheduleDrafts] = useState<Record<string, { open: boolean; proposedAt: string; notes: string }>>({});
  const [contractorReschedulingId, setContractorReschedulingId] = useState<string | null>(null);
  const [contractorResponseFiles, setContractorResponseFiles] = useState<Record<string, File[]>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [supportInquiries, setSupportInquiries] = useState<SupportInquiry[]>([]);
  const [supportDraft, setSupportDraft] = useState<{ category: SupportInquiryCategory; title: string; body: string }>({ category: 'feature_request', title: '', body: '' });
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [savingSupport, setSavingSupport] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [updatingServiceRequestId, setUpdatingServiceRequestId] = useState<string | null>(null);
  const [showQrForInvite, setShowQrForInvite] = useState<string | null>(null);

  // Inspection system state
  const [inspectionTemplates, setInspectionTemplates] = useState<InspectionTemplate[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [localContacts, setLocalContacts] = useState<ContractorLocalContact[]>([]);
  const [inspectionView, setInspectionView] = useState<InspectionView>('list');
  const [inspectionSubTab, setInspectionSubTab] = useState<InspectionSubTab>('checklist');
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [inspectionNewDraft, setInspectionNewDraft] = useState({
    subject_type: 'connected' as 'connected' | 'local',
    homeowner_user_id: '',
    local_contact_id: '',
    local_home_id: '',
    service_request_id: '',
    name: '',
    template_id: '',
    starter_template_id: 'starter-general-maintenance-field-work',
    workflow_kind: 'inspection' as FieldWorkflowKind,
  });
  const [localFindings, setLocalFindings] = useState<Record<string, { status: FindingStatus; notes: string; action: string; due: string; photos: string[] }>>({});
  const [inspectionClosedForReview, setInspectionClosedForReview] = useState(false);
  const [repairEstimateDrafts, setRepairEstimateDrafts] = useState<Record<string, RepairEstimateLineDraft[]>>({});
  const [showRepairEstimateDraft, setShowRepairEstimateDraft] = useState(false);
  const [estimateDraftNotice, setEstimateDraftNotice] = useState('');
  const [uploadingInspectionPhotoKey, setUploadingInspectionPhotoKey] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<InspectionTemplateRoom[]>([]);
  const [inspectionSummary, setInspectionSummary] = useState('');
  const [savingInspection, setSavingInspection] = useState(false);
  const [finalizingInspection, setFinalizingInspection] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showLocalContactForm, setShowLocalContactForm] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [localContactDraft, setLocalContactDraft] = useState({
    display_name: '',
    phone: '',
    email: '',
    notes: '',
    home_nickname: 'Home',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    home_type: '',
    year_built: '',
    square_feet: '',
    home_notes: '',
  });
  const [templateDraft, setTemplateDraft] = useState<{ name: string; rooms: InspectionTemplateRoom[] }>({ name: '', rooms: [] });
  const [templateEditRoom, setTemplateEditRoom] = useState('');
  const [templateEditItems, setTemplateEditItems] = useState('');
  // Inspection Assistant state
  const [selectedChecklistRoom, setSelectedChecklistRoom] = useState<string | null>(null);
  const [assistantMode, setAssistantMode] = useState<'single' | 'walkthrough' | 'ai'>('single');
  const [singleNoteText, setSingleNoteText] = useState('');
  const [singleNoteRoom, setSingleNoteRoom] = useState('');
  const [singleNoteItem, setSingleNoteItem] = useState('');
  const [walkthroughText, setWalkthroughText] = useState('');
  const [walkthroughSuggestions, setWalkthroughSuggestions] = useState<WalkthroughSuggestion[]>([]);
  const [aiNoteText, setAiNoteText] = useState('');
  const [aiProcessing, setAiProcessing] = useState(false);
  const [customItemInput, setCustomItemInput] = useState('');
  const [customRoomInput, setCustomRoomInput] = useState('');
  const [showAddRoom, setShowAddRoom] = useState(false);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const restoredFieldWorkRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveSignatureRef = useRef('');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.contractorTab, contractorTab);
  }, [contractorTab]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.contractorHomeownerFilter, homeownerFilter);
  }, [homeownerFilter]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.contractorHomeownerSearch, homeownerWorkspaceSearch);
  }, [homeownerWorkspaceSearch]);

  useEffect(() => {
    if (selectedHomeownerSubjectId) {
      window.localStorage.setItem(STORAGE_KEYS.contractorSelectedHomeowner, selectedHomeownerSubjectId);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.contractorSelectedHomeowner);
    }
  }, [selectedHomeownerSubjectId]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.contractorHomeownerDetailTab, homeownerDetailTab);
  }, [homeownerDetailTab]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.contractorHomeownerRequestView, homeownerWorkspaceRequestView);
  }, [homeownerWorkspaceRequestView]);

  const contractorDraft = contractor || {
    id: '',
    owner_user_id: profile.id,
    business_name: '',
    slug: '',
    contact_name: profile.full_name,
    email: profile.email,
    phone: '',
    website_url: '',
    city: '',
    state: '',
    zip_code: '',
    service_categories: [],
    service_zip_codes: [],
    license_number: '',
    insurance_status: '',
    bonded_status: '',
    business_summary: '',
    public_profile_enabled: true,
    account_status: 'active' as const,
    subscription_status: 'trialing' as const,
    monthly_price_cents: 0,
    subscription_notes: '',
    admin_notes: '',
    permanent_invite_code: null,
    created_at: '',
    updated_at: '',
  };

  const loadContractor = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const profileRes = await supabase.from('contractor_profiles').select('*').eq('owner_user_id', profile.id).maybeSingle();
      if (profileRes.error) throw profileRes.error;
      const loadedContractor = (profileRes.data as ContractorProfile | null) || null;

      const [connectionsRes, serviceRequestsRes, notifRes, supportRes] = await Promise.all([
        supabase.rpc('servsync_contractor_connected_homeowners'),
        supabase.rpc('servsync_contractor_service_requests'),
        supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('support_inquiries').select('*, messages:support_inquiry_messages(*)').eq('requester_user_id', profile.id).order('updated_at', { ascending: false }),
      ]);
      if (connectionsRes.error) throw connectionsRes.error;
      if (serviceRequestsRes.error) throw serviceRequestsRes.error;

      let loadedInvites: ContractorInvite[] = [];
      let loadedRequests: ContractorConnectionRequest[] = [];
      if (loadedContractor?.id) {
        const [invitesRes, requestsRes] = await Promise.all([
          supabase
            .from('contractor_invites')
            .select('*')
            .eq('contractor_id', loadedContractor.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('homeowner_contractor_connections')
            .select('*')
            .eq('contractor_id', loadedContractor.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        ]);
        if (invitesRes.error) throw invitesRes.error;
        if (requestsRes.error) throw requestsRes.error;
        loadedInvites = (invitesRes.data || []) as ContractorInvite[];
        loadedRequests = (requestsRes.data || []) as ContractorConnectionRequest[];
      }

      const loadedConnections = (connectionsRes.data || []) as ContractorConnectedHomeowner[];
      const connectionIds = [
        ...loadedConnections.map(connection => connection.connection_id),
        ...loadedRequests.map(request => request.id),
      ];
      const historyRes = connectionIds.length
        ? await supabase
            .from('connection_audit_events')
            .select('*')
            .in('connection_id', connectionIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (historyRes.error) throw historyRes.error;

      setContractor(loadedContractor);
      setConnections(loadedConnections);
      setServiceRequests(((serviceRequestsRes.data || []) as ServiceRequestSummary[]).map(normalizeServiceRequestSummary));
      setConnectionHistory(groupConnectionHistory((historyRes.data || []) as ConnectionAuditEvent[]));
      setInvites(loadedInvites);
      setConnectionRequests(loadedRequests);
      if (!notifRes.error) setNotifications((notifRes.data || []) as AppNotification[]);
      if (!supportRes.error) setSupportInquiries((supportRes.data || []) as SupportInquiry[]);

      // Load inspection templates and inspections
      if (loadedContractor?.id) {
        const [tplRes, inspRes, localContactsRes, estimatesRes, estimateTemplatesRes] = await Promise.all([
          supabase.from('inspection_templates').select('*').eq('contractor_id', loadedContractor.id).order('created_at', { ascending: false }),
          supabase.from('inspections').select('*').eq('contractor_id', loadedContractor.id).order('created_at', { ascending: false }),
          supabase
            .from('contractor_local_contacts')
            .select('*, homes:contractor_local_homes(*)')
            .eq('contractor_id', loadedContractor.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('estimates')
            .select('*, line_items:estimate_line_items(*)')
            .eq('contractor_id', loadedContractor.id)
            .order('updated_at', { ascending: false }),
          supabase
            .from('estimate_templates')
            .select('*')
            .eq('contractor_id', loadedContractor.id)
            .order('updated_at', { ascending: false }),
        ]);
        if (!tplRes.error) setInspectionTemplates((tplRes.data || []) as InspectionTemplate[]);
        if (!inspRes.error) setInspections((inspRes.data || []) as Inspection[]);
        if (!localContactsRes.error) setLocalContacts((localContactsRes.data || []) as ContractorLocalContact[]);
        if (!estimatesRes.error) setEstimates((estimatesRes.data || []) as Estimate[]);
        if (!estimateTemplatesRes.error) setEstimateTemplates((estimateTemplatesRes.data || []) as EstimateTemplate[]);
      }
    } catch (err) {
      setError(readableError(err, 'Unable to load contractor workspace.'));
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void loadContractor();
  }, [loadContractor]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel('contractor-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        payload => { setNotifications(prev => [payload.new as AppNotification, ...prev]); }
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [profile.id]);

  const markContractorNotificationsRead = async (ids: string[]) => {
    if (!supabase || ids.length === 0) return;
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n));
    await supabase.rpc('servsync_mark_notifications_read', { p_ids: ids });
  };

  const createContractorSupportInquiry = async () => {
    if (!supabase) return;
    if (!supportDraft.title.trim() || !supportDraft.body.trim()) {
      setError('Please add a short title and message before sending support.');
      return;
    }
    setSavingSupport(true);
    setNotice('');
    setError('');
    try {
      const { data: inquiry, error: inquiryError } = await supabase
        .from('support_inquiries')
        .insert({
          requester_user_id: profile.id,
          requester_role: 'contractor',
          category: supportDraft.category,
          title: supportDraft.title.trim(),
          status: 'new',
        })
        .select('*')
        .single();
      if (inquiryError) throw inquiryError;
      const { error: messageError } = await supabase.from('support_inquiry_messages').insert({
        inquiry_id: inquiry.id,
        actor_user_id: profile.id,
        actor_role: 'contractor',
        message_type: 'user_message',
        body: supportDraft.body.trim(),
      });
      if (messageError) throw messageError;
      setSupportDraft({ category: 'feature_request', title: '', body: '' });
      setNotice('ServSync received your inquiry. You can track replies in Support.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to send support inquiry.'));
    } finally {
      setSavingSupport(false);
    }
  };

  const replyToContractorSupportInquiry = async (inquiry: SupportInquiry) => {
    if (!supabase) return;
    const body = (supportReplyDrafts[inquiry.id] || '').trim();
    if (!body) return;
    setSavingSupport(true);
    setNotice('');
    setError('');
    try {
      const { error: messageError } = await supabase.from('support_inquiry_messages').insert({
        inquiry_id: inquiry.id,
        actor_user_id: profile.id,
        actor_role: 'contractor',
        message_type: 'user_message',
        body,
      });
      if (messageError) throw messageError;
      setSupportReplyDrafts(current => ({ ...current, [inquiry.id]: '' }));
      setNotice('Reply sent to ServSync.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to send support reply.'));
    } finally {
      setSavingSupport(false);
    }
  };

  const saveContractor = async () => {
    if (!supabase) return;
    setNotice('');
    setError('');
    try {
      const generatedSlug = contractorDraft.slug || slugify(contractorDraft.business_name);
      if (!contractorDraft.business_name.trim()) {
        setError('Business name is required before saving the contractor profile.');
        return;
      }
      if (!generatedSlug) {
        setError('A public profile slug is required. Enter a business name and try again.');
        return;
      }
      const payload = {
        ...(contractorDraft.id ? { id: contractorDraft.id } : {}),
        owner_user_id: profile.id,
        business_name: contractorDraft.business_name,
        slug: generatedSlug,
        contact_name: contractorDraft.contact_name,
        email: contractorDraft.email,
        phone: contractorDraft.phone,
        website_url: contractorDraft.website_url,
        city: contractorDraft.city,
        state: contractorDraft.state,
        zip_code: contractorDraft.zip_code,
        service_categories: contractorDraft.service_categories,
        service_zip_codes: contractorDraft.service_zip_codes,
        license_number: contractorDraft.license_number,
        insurance_status: contractorDraft.insurance_status,
        bonded_status: contractorDraft.bonded_status,
        business_summary: contractorDraft.business_summary,
        public_profile_enabled: contractorDraft.public_profile_enabled,
        account_status: contractorDraft.account_status,
      };
      const { error: saveError } = await supabase.from('contractor_profiles').upsert(payload).select('*').single();
      if (saveError) throw saveError;
      setNotice('Contractor profile saved.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to save contractor profile.'));
    }
  };

  const createInvite = async () => {
    if (!supabase) {
      return;
    }
    setNotice('');
    setError('');
    try {
      let contractorId = contractorDraft.id;

      if (!contractorId) {
        const { data: latestContractor, error: contractorError } = await supabase
          .from('contractor_profiles')
          .select('id')
          .eq('owner_user_id', profile.id)
          .maybeSingle();
        if (contractorError) throw contractorError;
        contractorId = latestContractor?.id || '';
      }

      if (!contractorId) {
        setError('Save your contractor profile before creating an invite.');
        return;
      }

      const code = createInviteCode();
      const { error: inviteError } = await supabase
        .from('contractor_invites')
        .insert({
          contractor_id: contractorId,
          invite_code: code,
          created_by: profile.id,
        });
      if (inviteError) throw inviteError;

      setInviteLink(`${window.location.origin}${window.location.pathname}#/homeowner?invite=${encodeURIComponent(code)}`);
      setNotice('Invite link created.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to create invite link.'));
    }
  };

  const updateConnectionRequest = async (request: ContractorConnectionRequest, status: 'active' | 'declined') => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setUpdatingRequestId(request.id);
    try {
      const { error: updateError } = await supabase
        .from('homeowner_contractor_connections')
        .update({ status })
        .eq('id', request.id);
      if (updateError) throw updateError;

      const { error: auditError } = await supabase
        .from('connection_audit_events')
        .insert({
          connection_id: request.id,
          actor_user_id: profile.id,
          event_type: status === 'active' ? 'connection_request_accepted' : 'connection_request_declined',
          event_details: { source: request.source },
        });
      if (auditError) throw auditError;

      setNotice(status === 'active' ? 'Connection request accepted. The homeowner can now choose what to share.' : 'Connection request declined.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to update connection request.'));
    } finally {
      setUpdatingRequestId(null);
    }
  };

  const uploadContractorMediaFiles = async (files: File[], requestId: string, messageId: string | null) => {
    if (!supabase || files.length === 0) return;
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? '';
      const storagePath = `${profile.id}/${requestId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('service-request-media')
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('service_request_media').insert({
        request_id: requestId,
        uploader_user_id: profile.id,
        message_id: messageId,
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type,
        file_size_bytes: file.size,
      });
      if (insertError) throw insertError;
    }
  };

  const updateContractorServiceRequest = async (request: ServiceRequestSummary, action: 'respond' | 'decline' | 'close') => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setUpdatingServiceRequestId(request.id);
    try {
      const apptDraft = appointmentDrafts[request.id];
      const schedulingAppointment = action === 'respond' && Boolean(apptDraft?.enabled);
      const proposedDate = schedulingAppointment && apptDraft?.proposedAt ? new Date(apptDraft.proposedAt) : null;
      if (schedulingAppointment && !apptDraft?.proposedAt) {
        setError('Choose an appointment date and time before sending.');
        return;
      }
      if (proposedDate && Number.isNaN(proposedDate.getTime())) {
        setError('Choose a valid appointment date and time.');
        return;
      }
      if (proposedDate && proposedDate <= new Date()) {
        setError('Choose a future appointment date and time.');
        return;
      }

      const typedBody = action === 'respond'
        ? contractorResponseDrafts[request.id] || ''
        : action === 'decline'
          ? contractorResponseDrafts[request.id] || 'Contractor declined this request.'
          : contractorResponseDrafts[request.id] || 'Contractor closed this request.';
      if (action === 'respond' && !typedBody.trim() && !schedulingAppointment) {
        setError('Add a response before sending.');
        return;
      }
      const body = action === 'respond' && !typedBody.trim() && proposedDate
        ? `Appointment proposed for ${formatDateTime(proposedDate.toISOString())}.`
        : typedBody;

      const nextStatus: ServiceRequestStatus = action === 'respond'
        ? 'contractor_responded'
        : action === 'decline'
          ? 'declined'
          : 'closed';

      const quoteDraft = contractorQuoteDrafts[request.id];
      const attachQuote = action === 'respond' && quoteDraft?.enabled;

      const { data: updateData, error: updateError } = await supabase.rpc('servsync_contractor_update_service_request', {
        p_request_id: request.id,
        p_body: body,
        p_new_status: nextStatus,
        p_quote_amount_cents: attachQuote ? dollarsToCents(quoteDraft.amount) : null,
        p_quote_scope: attachQuote ? (quoteDraft.scope || '') : null,
        p_closing_summary: nextStatus === 'closed' ? (closingSummaryDrafts[request.id] ?? '') : null,
      });
      if (updateError) throw updateError;

      if (action === 'respond' && proposedDate) {
        const { error: apptError } = await supabase.rpc('servsync_contractor_propose_appointment', {
          p_request_id: request.id,
          p_proposed_at: proposedDate.toISOString(),
          p_notes: apptDraft.notes || '',
        });
        if (apptError) throw apptError;
      }

      const cFiles = contractorResponseFiles[request.id] ?? [];
      if (cFiles.length > 0 && updateData?.message_id) {
        await uploadContractorMediaFiles(cFiles, request.id, updateData.message_id as string);
      }

      setContractorResponseDrafts(current => ({ ...current, [request.id]: '' }));
      setContractorQuoteDrafts(current => ({ ...current, [request.id]: { enabled: false, amount: '', scope: '' } }));
      setAppointmentDrafts(current => ({ ...current, [request.id]: { enabled: false, proposedAt: '', notes: '' } }));
      setContractorResponseFiles(current => ({ ...current, [request.id]: [] }));
      setNotice(action === 'respond'
        ? proposedDate ? 'Appointment proposal sent to homeowner.' : 'Response sent.'
        : action === 'decline' ? 'Request declined.' : 'Request closed.'
      );
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to update service request.'));
    } finally {
      setUpdatingServiceRequestId(null);
    }
  };

  const completeAppointment = async (request: ServiceRequestSummary) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setProposingAppointmentId(request.id);
    try {
      const { error: apptError } = await supabase.rpc('servsync_contractor_complete_appointment', {
        p_request_id: request.id,
      });
      if (apptError) throw apptError;
      setNotice('Appointment marked complete.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to complete appointment.'));
    } finally {
      setProposingAppointmentId(null);
    }
  };

  const rescheduleAsContractor = async (request: ServiceRequestSummary) => {
    if (!supabase) return;
    const draft = contractorRescheduleDrafts[request.id];
    if (!draft?.proposedAt) return;
    setNotice('');
    setError('');
    setContractorReschedulingId(request.id);
    try {
      const proposedDate = new Date(draft.proposedAt);
      if (Number.isNaN(proposedDate.getTime())) {
        setError('Choose a valid date and time.');
        return;
      }
      if (proposedDate <= new Date()) {
        setError('Choose a future date and time.');
        return;
      }
      const { error: apptError } = await supabase.rpc('servsync_contractor_propose_appointment', {
        p_request_id: request.id,
        p_proposed_at: proposedDate.toISOString(),
        p_notes: draft.notes ?? '',
      });
      if (apptError) throw apptError;
      setNotice('Reschedule proposal sent to homeowner.');
      setContractorRescheduleDrafts(current => ({ ...current, [request.id]: { open: false, proposedAt: '', notes: '' } }));
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to reschedule appointment.'));
    } finally {
      setContractorReschedulingId(null);
    }
  };

  const respondToHomeownerAppointment = async (
    request: ServiceRequestSummary,
    action: 'confirm' | 'decline' | 'counter',
    proposedAt?: string,
    notes?: string,
  ) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setRespondingToHomeownerApptId(request.id);
    try {
      const params: Record<string, unknown> = { p_request_id: request.id, p_action: action };
      if (action === 'counter') {
        if (!proposedAt) {
          setError('Choose a date and time before sending.');
          return;
        }
        const proposedDate = new Date(proposedAt);
        if (Number.isNaN(proposedDate.getTime())) {
          setError('Choose a valid date and time.');
          return;
        }
        if (proposedDate <= new Date()) {
          setError('Choose a future date and time.');
          return;
        }
        params.p_proposed_at = proposedDate.toISOString();
        params.p_notes = notes ?? '';
      }
      const { error: apptError } = await supabase.rpc('servsync_contractor_respond_to_appointment', params);
      if (apptError) throw apptError;
      if (action === 'counter') {
        setNotice('Your counter-proposal has been sent. Waiting for the homeowner to confirm.');
        setContractorCounterProposeDrafts(current => ({ ...current, [request.id]: { open: false, proposedAt: '', notes: '' } }));
      } else {
        setNotice(action === 'confirm' ? 'Appointment confirmed.' : 'Appointment declined.');
      }
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to respond to appointment.'));
    } finally {
      setRespondingToHomeownerApptId(null);
    }
  };

  const reopenContractorRequest = async (request: ServiceRequestSummary) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setContractorReopeningRequestId(request.id);
    const body = contractorReopenDrafts[request.id]?.body || '';
    try {
      const { error: reopenError } = await supabase.rpc('servsync_contractor_reopen_service_request', {
        p_request_id: request.id,
        p_body: body,
      });
      if (reopenError) throw reopenError;
      setNotice('Request reopened.');
      setContractorReopenDrafts(current => ({ ...current, [request.id]: { open: false, body: '' } }));
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to reopen request.'));
    } finally {
      setContractorReopeningRequestId(null);
    }
  };

  const openHomeownerWorkspaceForConnection = (connection: ContractorConnectedHomeowner, tab: HomeownerWorkspaceTab = 'overview') => {
    setSelectedHomeownerSubjectId(connection.connection_id);
    setHomeownerFilter(connection.status === 'active' ? 'active' : 'inactive');
    setHomeownerDetailTab(tab);
    setContractorTab('connections');
  };

  const openHomeownerWorkspaceForRequest = (request: ServiceRequestSummary, options: { tab?: HomeownerWorkspaceTab } = {}) => {
    const connection = connections.find(candidate =>
      candidate.connection_id === request.connection_id
      || candidate.homeowner_user_id === request.homeowner_user_id
    );
    if (!connection) {
      setContractorRequestView(contractorRequestQueueFor(request));
      setContractorExpandedRequestIds(new Set([request.id]));
      setContractorTab('requests');
      return;
    }
    setSelectedHomeownerSubjectId(connection.connection_id);
    setHomeownerFilter(connection.status === 'active' ? 'active' : 'inactive');
    setHomeownerDetailTab(options.tab ?? 'requests');
    setHomeownerWorkspaceRequestView(
      ['closed', 'declined'].includes(request.status)
        ? 'closed'
        : contractorRequestNeedsFollowUp(request)
          ? 'attention'
          : 'active',
    );
    setSelectedHomeownerRequestId(request.id);
    setContractorTab('connections');
  };

  const saveEstimateDraft = async (subject: {
    homeownerUserId?: string | null;
    localContactId?: string | null;
  }) => {
    if (!supabase || !contractor?.id) return;
    setNotice('');
    setError('');
    if (!estimateDraft.title.trim()) {
      setError('Add an estimate title before saving.');
      return;
    }
    const usableLines = estimateDraft.line_items.filter(line => line.description.trim());
    if (usableLines.length === 0) {
      setError('Add at least one line item before saving the estimate.');
      return;
    }
    setSavingEstimate(true);
    try {
      const subtotalCents = estimateTotalCents(usableLines);
      const estimatePayload = {
        contractor_id: contractor.id,
        homeowner_user_id: subject.homeownerUserId || null,
        local_contact_id: subject.localContactId || null,
        service_request_id: estimateDraft.service_request_id || null,
        inspection_id: estimateDraft.inspection_id || null,
        title: estimateDraft.title.trim(),
        scope: estimateDraft.scope.trim(),
        notes: estimateDraft.notes.trim(),
        terms: estimateDraft.terms.trim(),
        status: 'draft',
        subtotal_cents: subtotalCents,
        total_cents: subtotalCents,
      };
      const { data: estimateData, error: estimateError } = editingEstimateId
        ? await supabase
            .from('estimates')
            .update(estimatePayload)
            .eq('id', editingEstimateId)
            .select('*')
            .single()
        : await supabase
            .from('estimates')
            .insert(estimatePayload)
            .select('*')
            .single();
      if (estimateError) throw estimateError;

      const estimateId = (estimateData as Estimate).id;
      if (editingEstimateId) {
        const { error: deleteLinesError } = await supabase
          .from('estimate_line_items')
          .delete()
          .eq('estimate_id', estimateId);
        if (deleteLinesError) throw deleteLinesError;
      }
      const { error: linesError } = await supabase
        .from('estimate_line_items')
        .insert(usableLines.map((line, index) => ({
          estimate_id: estimateId,
          line_type: line.line_type,
          description: line.description.trim(),
          quantity: Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0 ? Number(line.quantity) : 1,
          unit: line.unit.trim() || 'each',
          unit_price_cents: dollarsToCents(line.unit_price),
          sort_order: index,
        })));
      if (linesError) throw linesError;

      setNotice(editingEstimateId ? 'Estimate draft updated.' : 'Estimate draft saved.');
      setEstimateComposerOpen(false);
      setEditingEstimateId(null);
      setEstimateDraft(createBlankEstimateDraft());
      setEstimateAssistantText('');
      setEstimateAssistantNotice('');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to save estimate. If this is the first estimate, run the ServSync estimates SQL first.'));
    } finally {
      setSavingEstimate(false);
    }
  };

  const sendEstimateToHomeowner = async (estimate: Estimate) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    if (!estimate.homeowner_user_id) {
      setError('This estimate is attached to a local customer. Connect the homeowner before sending it through the portal.');
      return;
    }
    setSendingEstimateId(estimate.id);
    try {
      const { error: sendError } = await supabase
        .from('estimates')
        .update({ status: 'sent' })
        .eq('id', estimate.id);
      if (sendError) throw sendError;
      setNotice('Estimate sent to homeowner.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to send estimate.'));
    } finally {
      setSendingEstimateId(null);
    }
  };

  const saveEstimateAsTemplate = async (estimate: Estimate) => {
    if (!supabase || !contractor?.id) return;
    const templateName = window.prompt('Name this estimate template:', estimate.title.replace(/^Estimate\s+—\s+/i, '').trim() || 'New estimate template');
    if (!templateName?.trim()) return;
    setNotice('');
    setError('');
    setSavingEstimateTemplateId(estimate.id);
    try {
      const { error: templateError } = await supabase.from('estimate_templates').insert({
        contractor_id: contractor.id,
        name: templateName.trim(),
        trade: contractorDraft.service_categories[0] || '',
        scope: estimate.scope || '',
        notes: estimate.notes || '',
        terms: estimate.terms || '',
        line_items: [...(estimate.line_items || [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((line, index) => ({
            line_type: line.line_type,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unit_price_cents: line.unit_price_cents,
            sort_order: index,
          })),
      });
      if (templateError) throw templateError;
      setNotice('Estimate template saved.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to save estimate template. Run the estimate templates SQL first.'));
    } finally {
      setSavingEstimateTemplateId(null);
    }
  };

  const renameEstimateTemplate = async (template: EstimateTemplate) => {
    if (!supabase) return;
    const nextName = window.prompt('Rename estimate template:', template.name);
    if (!nextName?.trim() || nextName.trim() === template.name) return;
    setNotice('');
    setError('');
    setRenamingEstimateTemplateId(template.id);
    try {
      const { error: renameError } = await supabase
        .from('estimate_templates')
        .update({ name: nextName.trim() })
        .eq('id', template.id);
      if (renameError) throw renameError;
      setNotice('Estimate template renamed.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to rename estimate template.'));
    } finally {
      setRenamingEstimateTemplateId(null);
    }
  };

  const deleteEstimateTemplate = async (template: EstimateTemplate) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete the estimate template "${template.name}"? This will not delete any estimates already created from it.`);
    if (!confirmed) return;
    setNotice('');
    setError('');
    setDeletingEstimateTemplateId(template.id);
    try {
      const { error: deleteError } = await supabase
        .from('estimate_templates')
        .delete()
        .eq('id', template.id);
      if (deleteError) throw deleteError;
      setNotice('Estimate template deleted.');
      if (expandedEstimateTemplateId === template.id) setExpandedEstimateTemplateId(null);
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to delete estimate template.'));
    } finally {
      setDeletingEstimateTemplateId(null);
    }
  };

  const applySmartEstimateDraft = () => {
    setEstimateAssistantNotice('');
    if (!estimateAssistantText.trim()) {
      setEstimateAssistantNotice('Add a short description first, then generate the estimate draft.');
      return;
    }
    const parsed = parseSmartEstimateText(estimateAssistantText);
    const currentUsableLines = estimateDraft.line_items.filter(line => line.description.trim());
    setEstimateDraft(draft => ({
      ...draft,
      scope: draft.scope.trim() ? `${draft.scope.trim()}\n\n${parsed.scope}` : parsed.scope,
      line_items: currentUsableLines.length === 0 ? parsed.lines : [...draft.line_items, ...parsed.lines],
      notes: draft.notes.trim()
        ? draft.notes
        : 'Smart estimate draft created from contractor notes. Review quantities, pricing, exclusions, and terms before sending.',
    }));
    setEstimateAssistantNotice(`Added ${parsed.lines.length} editable line item${parsed.lines.length === 1 ? '' : 's'} to this estimate.`);
  };

  const startEstimateAssistantSpeech = () => {
    setEstimateAssistantNotice('');
    const SpeechRecognition = (window as unknown as {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
    }).SpeechRecognition || (window as unknown as {
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
    }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setEstimateAssistantNotice('Speech input is not supported in this browser. Type the estimate details instead.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = event => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) {
        setEstimateAssistantText(current => current.trim() ? `${current.trim()} ${transcript}` : transcript);
        setEstimateAssistantNotice('Speech captured. Review it, then generate the estimate draft.');
      }
    };
    recognition.onerror = () => {
      setEstimateAssistantNotice('Speech input stopped. Type the estimate details if the browser did not capture them.');
      setEstimateAssistantListening(false);
    };
    recognition.onend = () => setEstimateAssistantListening(false);
    setEstimateAssistantListening(true);
    recognition.start();
  };

  const openServiceRequests = serviceRequests.filter(request => !['closed', 'declined'].includes(request.status));
  const openServiceRequestCount = openServiceRequests.length;
  const urgentServiceRequests = openServiceRequests.filter(request => request.urgency === 'urgent');
  const homeownerAppointmentRequests = serviceRequests.filter(
    request => request.appointment?.status === 'proposed' && request.appointment.proposed_by === 'homeowner',
  );
  const contractorUnreadNotificationCount = notifications.filter(notification => !notification.read_at).length;
  const contractorFollowUpCount = serviceRequests.filter(contractorRequestNeedsFollowUp).length;
  const confirmedAppointments = serviceRequests
    .filter(request => request.appointment?.status === 'confirmed')
    .sort((a, b) => new Date(a.appointment?.proposed_at ?? 0).getTime() - new Date(b.appointment?.proposed_at ?? 0).getTime());
  const openSupportInquiryCount = supportInquiries.filter(inquiry => !['resolved', 'closed'].includes(inquiry.status)).length;
  const waitingOnContractorSupportCount = supportInquiries.filter(inquiry => inquiry.status === 'waiting_on_user').length;
  const recentConnectedHomeowners = connections.slice(0, 4);
  const recentOpenServiceRequests = openServiceRequests.slice(0, 4);
  const contractorProfileFields = [
    contractorDraft.business_name,
    contractorDraft.contact_name,
    contractorDraft.email,
    contractorDraft.phone,
    contractorDraft.city,
    contractorDraft.state,
    contractorDraft.zip_code,
    contractorDraft.service_categories.length ? 'categories' : '',
    contractorDraft.service_zip_codes.length ? 'zips' : '',
    contractorDraft.business_summary,
  ];
  const contractorProfileScore = Math.round((contractorProfileFields.filter(Boolean).length / contractorProfileFields.length) * 100);
  const contractorTradeSet = new Set(contractorDraft.service_categories.map(category => category.toLowerCase()));
  const starterTemplateAllowedForContractor = (trade: string) => contractorTradeSet.has(trade.toLowerCase());
  const starterTemplateRecommendedForContractor = (trade: string) =>
    starterTemplateAllowedForContractor(trade) || (contractorTradeSet.size === 0 && trade === 'General Maintenance');
  const contractorFieldWorkStarterTemplates = contractorTradeSet.size
    ? SERVSYNC_FIELD_WORK_TEMPLATES.filter(template => starterTemplateAllowedForContractor(template.trade))
    : SERVSYNC_FIELD_WORK_TEMPLATES.filter(template => template.trade === 'General Maintenance');
  const contractorEstimateStarterTemplates = contractorTradeSet.size
    ? STARTER_ESTIMATE_TEMPLATES.filter(template => starterTemplateAllowedForContractor(template.trade))
    : STARTER_ESTIMATE_TEMPLATES.filter(template => template.trade === 'General Maintenance');
  const starterFieldWorkTemplatePool = contractorFieldWorkStarterTemplates.length
    ? contractorFieldWorkStarterTemplates
    : SERVSYNC_FIELD_WORK_TEMPLATES.filter(template => template.trade === 'General Maintenance');
  const starterEstimateTemplatePool = contractorEstimateStarterTemplates.length
    ? contractorEstimateStarterTemplates
    : STARTER_ESTIMATE_TEMPLATES.filter(template => template.trade === 'General Maintenance');
  const sortedServSyncFieldWorkTemplates = [...starterFieldWorkTemplatePool].sort((a, b) => {
    const aRecommended = starterTemplateRecommendedForContractor(a.trade) ? 0 : 1;
    const bRecommended = starterTemplateRecommendedForContractor(b.trade) ? 0 : 1;
    if (aRecommended !== bRecommended) return aRecommended - bRecommended;
    return a.name.localeCompare(b.name);
  });
  const sortedStarterEstimateTemplates = [...starterEstimateTemplatePool]
    .sort((a, b) => a.name.localeCompare(b.name));
  const normalizedTemplateSearch = normalizeText(templateSearch);
  const templateMatchesSearch = (template: { name: string; rooms: InspectionTemplateRoom[]; trade?: string; description?: string; kind?: FieldWorkflowKind }) => {
    if (!normalizedTemplateSearch) return true;
    const haystack = normalizeText([
      template.name,
      template.trade,
      template.description,
      template.kind ? FIELD_WORK_KIND_LABEL[template.kind] : '',
      ...template.rooms.flatMap(room => [room.room, ...room.items]),
    ].filter(Boolean).join(' '));
    return normalizedTemplateSearch.split(' ').every(term => haystack.includes(term));
  };
  const filteredStarterTemplates = sortedServSyncFieldWorkTemplates.filter(templateMatchesSearch);
  const filteredCustomTemplates = inspectionTemplates.filter(templateMatchesSearch);
  const resetInspectionNewDraft = () => ({
    subject_type: 'connected' as 'connected' | 'local',
    homeowner_user_id: '',
    local_contact_id: '',
    local_home_id: '',
    service_request_id: '',
    name: '',
    template_id: '',
    starter_template_id: sortedServSyncFieldWorkTemplates[0]?.id ?? 'starter-general-maintenance-field-work',
    workflow_kind: sortedServSyncFieldWorkTemplates[0]?.kind ?? 'inspection' as FieldWorkflowKind,
  });
  const fieldWorkDrafts = inspections.filter(insp => insp.status === 'draft');
  const finalizedFieldWork = inspections.filter(insp => insp.status === 'finalized');
  const activeFieldWorkConnections = connections.filter(connection => connection.status === 'active');
  const fieldWorkForHomeowner = (homeownerUserId: string) => inspections
    .filter(insp => insp.homeowner_user_id === homeownerUserId)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const fieldWorkForLocalContact = (localContactId: string) => inspections
    .filter(insp => insp.local_contact_id === localContactId)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const buildFieldWorkName = (connection: ContractorConnectedHomeowner, starterId: string, kind: FieldWorkflowKind) => {
    const starter = SERVSYNC_FIELD_WORK_TEMPLATES.find(template => template.id === starterId);
    const workflowLabel = FIELD_WORK_KIND_LABEL[kind];
    const homeownerName = connection.display_name || connection.home?.nickname || 'Homeowner';
    return `${starter?.name || workflowLabel} — ${homeownerName} — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  };
  const buildLocalFieldWorkName = (contact: ContractorLocalContact, starterId: string, kind: FieldWorkflowKind) => {
    const starter = SERVSYNC_FIELD_WORK_TEMPLATES.find(template => template.id === starterId);
    const workflowLabel = FIELD_WORK_KIND_LABEL[kind];
    return `${starter?.name || workflowLabel} — ${contact.display_name || 'Local customer'} — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  };
  const beginFieldWorkForHomeowner = (connection: ContractorConnectedHomeowner, options?: { templateId?: string; starterTemplateId?: string; workflowKind?: FieldWorkflowKind; name?: string; serviceRequestId?: string }) => {
    const starterTemplateId = options?.starterTemplateId ?? sortedServSyncFieldWorkTemplates[0]?.id ?? 'starter-general-maintenance-field-work';
    const starter = SERVSYNC_FIELD_WORK_TEMPLATES.find(template => template.id === starterTemplateId);
    const workflowKind = options?.workflowKind ?? starter?.kind ?? 'inspection';
    setInspectionNewDraft({
      subject_type: 'connected',
      homeowner_user_id: connection.homeowner_user_id,
      local_contact_id: '',
      local_home_id: '',
      service_request_id: options?.serviceRequestId ?? '',
      name: options?.name ?? buildFieldWorkName(connection, starterTemplateId, workflowKind),
      template_id: options?.templateId ?? '',
      starter_template_id: starterTemplateId,
      workflow_kind: workflowKind,
    });
    setInspectionView('new');
  };
  const beginFieldWorkForLocalContact = (contact: ContractorLocalContact, options?: { templateId?: string; starterTemplateId?: string; workflowKind?: FieldWorkflowKind; name?: string }) => {
    const starterTemplateId = options?.starterTemplateId ?? sortedServSyncFieldWorkTemplates[0]?.id ?? 'starter-general-maintenance-field-work';
    const starter = SERVSYNC_FIELD_WORK_TEMPLATES.find(template => template.id === starterTemplateId);
    const workflowKind = options?.workflowKind ?? starter?.kind ?? 'inspection';
    setInspectionNewDraft({
      subject_type: 'local',
      homeowner_user_id: '',
      local_contact_id: contact.id,
      local_home_id: contact.homes?.[0]?.id ?? '',
      service_request_id: '',
      name: options?.name ?? buildLocalFieldWorkName(contact, starterTemplateId, workflowKind),
      template_id: options?.templateId ?? '',
      starter_template_id: starterTemplateId,
      workflow_kind: workflowKind,
    });
    setInspectionView('new');
  };
  const fieldWorkSubjectLabel = (insp: Inspection) => {
    if (insp.homeowner_user_id) {
      const conn = connections.find(c => c.homeowner_user_id === insp.homeowner_user_id);
      return conn?.display_name || 'ServSync homeowner';
    }
    if (insp.local_contact_id) {
      const contact = localContacts.find(c => c.id === insp.local_contact_id);
      return contact?.display_name || 'Local customer';
    }
    return 'Customer';
  };
  const fieldWorkSubjectAddress = (insp: Inspection) => {
    if (insp.homeowner_user_id) {
      const conn = connections.find(c => c.homeowner_user_id === insp.homeowner_user_id);
      return conn?.home
        ? [conn.home.address_line1, conn.home.city, conn.home.state].filter(Boolean).join(', ')
        : [conn?.city, conn?.state].filter(Boolean).join(', ');
    }
    const contact = insp.local_contact_id ? localContacts.find(c => c.id === insp.local_contact_id) : null;
    const home = contact?.homes?.find(h => h.id === insp.local_home_id) ?? contact?.homes?.[0];
    return home ? [home.address_line1, home.city, home.state].filter(Boolean).join(', ') : '';
  };

  const buildInspectionRoomsSnapshot = (): InspectionRoomData[] => activeRooms.map(r => ({
    room: r.room,
    findings: r.items.map(item => {
      const key = `${r.room}||${item}`;
      const local = localFindings[key];
      return {
        title: item,
        status: (local?.status ?? 'Pass') as FindingStatus,
        notes: local?.notes ?? '',
        action: local?.action ?? '',
        due: local?.due ?? '',
        photos: local?.photos ?? [],
      };
    }),
  }));

  const persistFieldWorkState = (next?: Partial<{ inspectionId: string | null; view: InspectionView; subTab: InspectionSubTab; selectedRoom: string | null }>) => {
    const current = (() => {
      try {
        return JSON.parse(window.localStorage.getItem(STORAGE_KEYS.fieldWorkState) || '{}') as StoredFieldWorkState;
      } catch {
        return {};
      }
    })();
    const shouldClearDraft = next && 'inspectionId' in next && next.inspectionId === null;
    const draftSnapshot = shouldClearDraft
      ? null
      : activeInspection?.status === 'draft'
        ? {
            inspectionId: activeInspection.id,
            rooms_with_findings: buildInspectionRoomsSnapshot(),
            summary: inspectionSummary,
            savedAt: new Date().toISOString(),
          }
        : current.draftSnapshot ?? null;
    window.localStorage.setItem(STORAGE_KEYS.fieldWorkState, JSON.stringify({
      ...current,
      inspectionId: activeInspection?.id ?? null,
      view: inspectionView,
      subTab: inspectionSubTab,
      selectedRoom: selectedChecklistRoom,
      draftSnapshot,
      ...next,
    }));
  };

  // ── Inspection helpers ────────────────────────────────────────────────────
  const startNewInspection = async () => {
    const hasSubject = inspectionNewDraft.subject_type === 'connected'
      ? Boolean(inspectionNewDraft.homeowner_user_id)
      : Boolean(inspectionNewDraft.local_contact_id);
    if (!supabase || !hasSubject || !inspectionNewDraft.name.trim()) return;
    setSavingInspection(true);
    try {
      const selectedTemplate = inspectionTemplates.find(t => t.id === inspectionNewDraft.template_id);
      const selectedStarterTemplate = SERVSYNC_FIELD_WORK_TEMPLATES.find(t => t.id === inspectionNewDraft.starter_template_id);
      const rooms: InspectionTemplateRoom[] = selectedTemplate
        ? selectedTemplate.rooms
        : selectedStarterTemplate?.rooms ?? DEFAULT_INSPECTION_ROOMS;
      const seedFindings: InspectionRoomData[] = rooms.map(r => ({
        room: r.room,
        findings: r.items.map(item => ({ title: item, status: 'Pass' as FindingStatus, notes: '', action: '', due: '', photos: [] })),
      }));

      const { data, error: rpcErr } = await supabase.rpc('servsync_create_field_work', {
        p_homeowner_user_id: inspectionNewDraft.subject_type === 'connected' ? inspectionNewDraft.homeowner_user_id : null,
        p_local_contact_id: inspectionNewDraft.subject_type === 'local' ? inspectionNewDraft.local_contact_id : null,
        p_local_home_id: inspectionNewDraft.subject_type === 'local' ? inspectionNewDraft.local_home_id || null : null,
        p_service_request_id: inspectionNewDraft.service_request_id || null,
        p_name: inspectionNewDraft.name.trim(),
        p_rooms_with_findings: seedFindings,
        p_template_id: inspectionNewDraft.template_id || null,
      });
      if (rpcErr) throw rpcErr;
      const newInspection: Inspection = {
        id: data as string,
        contractor_id: contractor?.id || '',
        homeowner_user_id: inspectionNewDraft.subject_type === 'connected' ? inspectionNewDraft.homeowner_user_id : null,
        local_contact_id: inspectionNewDraft.subject_type === 'local' ? inspectionNewDraft.local_contact_id : null,
        local_home_id: inspectionNewDraft.subject_type === 'local' ? inspectionNewDraft.local_home_id || null : null,
        service_request_id: inspectionNewDraft.service_request_id || null,
        template_id: inspectionNewDraft.template_id || null,
        name: inspectionNewDraft.name.trim(),
        summary: '',
        status: 'draft',
        rooms_with_findings: seedFindings,
        report_storage_path: null,
        report_file_name: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setActiveInspection(newInspection);
      setActiveRooms(rooms);
      const init: Record<string, { status: FindingStatus; notes: string; action: string; due: string; photos: string[] }> = {};
      seedFindings.forEach(rd => rd.findings.forEach(f => { init[`${rd.room}||${f.title}`] = { status: f.status, notes: f.notes, action: f.action ?? '', due: f.due ?? '', photos: [] }; }));
      setLocalFindings(init);
      setInspectionSummary('');
      setInspectionClosedForReview(false);
      setSelectedChecklistRoom(rooms[0]?.room ?? null);
      setInspections(prev => [newInspection, ...prev]);
      setInspectionSubTab('checklist');
      if (contractorTab === 'connections') {
        setInspectionView('detail');
        setHomeownerDetailTab('fieldwork');
        persistFieldWorkState({ inspectionId: newInspection.id, view: 'detail', subTab: 'checklist', selectedRoom: rooms[0]?.room ?? null });
      } else {
        setInspectionView('detail');
        setContractorTab('inspections');
        persistFieldWorkState({ inspectionId: newInspection.id, view: 'detail', subTab: 'checklist', selectedRoom: rooms[0]?.room ?? null });
      }
    } catch (err) {
      setError(readableError(err, 'Failed to create inspection.'));
    } finally {
      setSavingInspection(false);
    }
  };

  const saveInspectionProgress = async (insp: Inspection, options?: { silent?: boolean }) => {
    if (!supabase) return;
    if (!options?.silent) setSavingInspection(true);
    try {
      const updatedRooms: InspectionRoomData[] = buildInspectionRoomsSnapshot();
      const { error: updateError } = await supabase.rpc('servsync_update_inspection', {
        p_inspection_id: insp.id,
        p_rooms_with_findings: updatedRooms,
        p_summary: inspectionSummary,
      });
      if (updateError) throw updateError;
      setActiveInspection(prev => prev ? { ...prev, rooms_with_findings: updatedRooms, summary: inspectionSummary } : prev);
      setInspections(prev => prev.map(i => i.id === insp.id ? { ...i, rooms_with_findings: updatedRooms, summary: inspectionSummary } : i));
      if (!options?.silent) setNotice('Progress saved.');
      return updatedRooms;
    } finally {
      if (!options?.silent) setSavingInspection(false);
    }
  };

  const finalizeInspection = async (insp: Inspection) => {
    if (!supabase || !contractor) return;
    const confirmed = window.confirm(insp.homeowner_user_id
      ? 'Finalize and file this field work report? The PDF will be saved to the homeowner\'s Documents and the completed work will be added to their maintenance log. This cannot be undone.'
      : 'Finalize this local customer field work report? The PDF will be stored with this contractor record, but it will not be sent to a ServSync homeowner until that customer has a profile.'
    );
    if (!confirmed) return;
    setFinalizingInspection(true);
    try {
      const updatedRooms: InspectionRoomData[] = buildInspectionRoomsSnapshot();
      const finalInsp: Inspection = { ...insp, rooms_with_findings: updatedRooms, summary: inspectionSummary };

      const homeownerConn = connections.find(c => c.homeowner_user_id === insp.homeowner_user_id);
      const localContact = insp.local_contact_id ? localContacts.find(contact => contact.id === insp.local_contact_id) : null;
      const localHome = localContact?.homes?.find(home => home.id === insp.local_home_id) ?? localContact?.homes?.[0] ?? null;
      const homeownerName = homeownerConn?.display_name || localContact?.display_name || 'Customer';
      const homeAddress = homeownerConn?.home
        ? [homeownerConn.home.address_line1, homeownerConn.home.city, homeownerConn.home.state].filter(Boolean).join(', ')
        : localHome
          ? [localHome.address_line1, localHome.city, localHome.state].filter(Boolean).join(', ')
          : [homeownerConn?.city, homeownerConn?.state].filter(Boolean).join(', ');

      const { blob, fileName } = await generateInspectionPdf(finalInsp, contractor.business_name, homeownerName, homeAddress);

      const storagePath = insp.homeowner_user_id
        ? `${insp.homeowner_user_id}/documents/${crypto.randomUUID()}.pdf`
        : `local-field-work/${contractor.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadErr } = await supabase.storage.from('home-documents').upload(storagePath, blob, { contentType: 'application/pdf' });
      if (uploadErr) throw uploadErr;

      const { error: finalizeError } = await supabase.rpc('servsync_finalize_field_work', {
        p_inspection_id: insp.id,
        p_rooms_with_findings: updatedRooms,
        p_summary: inspectionSummary,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_file_size_bytes: blob.size,
      });
      if (finalizeError) throw finalizeError;

      const finalized = { ...finalInsp, status: 'finalized' as const, report_storage_path: storagePath, report_file_name: fileName };
      setInspections(prev => prev.map(i => i.id === insp.id ? finalized : i));
      setNotice(insp.homeowner_user_id
        ? 'Field work report finalized, saved to homeowner Documents, and added to their maintenance log.'
        : 'Local customer field work report finalized.'
      );
      // Clear back to list
      setActiveInspection(null);
      setLocalFindings({});
      setActiveRooms([]);
      setInspectionSummary('');
      setInspectionClosedForReview(false);
      setInspectionView('list');
      persistFieldWorkState({ inspectionId: null, view: 'list', subTab: 'checklist', selectedRoom: null });
    } catch (err) {
      setError(readableError(err, 'Failed to finalize field work report.'));
    } finally {
      setFinalizingInspection(false);
    }
  };

  const deleteInspection = async (insp: Inspection) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete "${insp.name}"? This field work record will be permanently removed and the homeowner will not be notified.`);
    if (!confirmed) return;
    const { error: delErr } = await supabase.rpc('servsync_delete_inspection', {
      p_inspection_id: insp.id,
    });
    if (delErr) { setError(readableError(delErr, 'Failed to delete inspection.')); return; }
    setInspections(prev => prev.filter(i => i.id !== insp.id));
    if (activeInspection?.id === insp.id) {
      setActiveInspection(null);
      setLocalFindings({});
      setActiveRooms([]);
      setInspectionSummary('');
      setInspectionClosedForReview(false);
      setInspectionView('list');
      persistFieldWorkState({ inspectionId: null, view: 'list', subTab: 'checklist', selectedRoom: null });
    }
    setNotice('Field work draft deleted.');
  };

  const openInspection = (insp: Inspection, options?: { subTab?: InspectionSubTab; selectedRoom?: string | null; stayInHomeownerWorkspace?: boolean }) => {
    let stored: StoredFieldWorkState | null = null;
    try {
      stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.fieldWorkState) || 'null') as StoredFieldWorkState | null;
    } catch {
      stored = null;
    }
    const storedDraft = insp.status === 'draft' && stored?.draftSnapshot?.inspectionId === insp.id
      ? stored.draftSnapshot
      : null;
    const roomsWithFindings = storedDraft?.rooms_with_findings ?? insp.rooms_with_findings;
    const summary = storedDraft?.summary ?? insp.summary;

    setActiveInspection(insp);
    setInspectionSummary(summary);
    const rooms: InspectionTemplateRoom[] = roomsWithFindings.map(r => ({ room: r.room, items: r.findings.map(f => f.title) }));
    setActiveRooms(rooms);
    const init: Record<string, { status: FindingStatus; notes: string; action: string; due: string; photos: string[] }> = {};
    roomsWithFindings.forEach(rd => rd.findings.forEach(f => { init[`${rd.room}||${f.title}`] = { status: f.status, notes: f.notes, action: f.action ?? '', due: f.due ?? '', photos: f.photos ?? [] }; }));
    setLocalFindings(init);
    setInspectionClosedForReview(false);
    const nextSelectedRoom = options?.selectedRoom && rooms.some(room => room.room === options.selectedRoom)
      ? options.selectedRoom
      : rooms[0]?.room ?? null;
    setSelectedChecklistRoom(nextSelectedRoom);
    setWalkthroughSuggestions([]);
    setWalkthroughText('');
    setSingleNoteText('');
    const nextSubTab = options?.subTab ?? (insp.status === 'draft' ? 'inspect' : 'report');
    setInspectionSubTab(nextSubTab);
    setInspectionView('detail');
    if (options?.stayInHomeownerWorkspace) {
      if (insp.homeowner_user_id) {
        const conn = connections.find(candidate => candidate.homeowner_user_id === insp.homeowner_user_id);
        if (conn) {
          setSelectedHomeownerSubjectId(conn.connection_id);
          setHomeownerFilter(conn.status === 'active' ? 'active' : 'inactive');
        }
      } else if (insp.local_contact_id) {
        setSelectedHomeownerSubjectId(`local:${insp.local_contact_id}`);
        setHomeownerFilter('active');
      }
      setHomeownerDetailTab('fieldwork');
    } else {
      setContractorTab('inspections');
    }
    persistFieldWorkState({ inspectionId: insp.id, view: 'detail', subTab: nextSubTab, selectedRoom: nextSelectedRoom });
  };

  const resolveSuggestionTarget = (suggestion: WalkthroughSuggestion): { room: string; item: string } | null => {
    const roomNames = activeRooms.map(room => room.room);
    const possibleRoomText = [suggestion.detectedRoom, suggestion.rawText, suggestion.notes].filter(Boolean).join(' ');
    const roomName = suggestion.detectedRoom
      ? activeRooms.find(room => room.room.toLowerCase() === suggestion.detectedRoom?.toLowerCase())?.room
        ?? detectRoomFromNote(possibleRoomText, roomNames, selectedChecklistRoom)
      : detectRoomFromNote(possibleRoomText, roomNames, selectedChecklistRoom);

    if (!roomName) return null;
    const room = activeRooms.find(candidate => candidate.room === roomName);
    if (!room) return null;

    const possibleItemText = [suggestion.detectedItem, suggestion.newChecklistItem, suggestion.rawText, suggestion.notes].filter(Boolean).join(' ');
    const explicitItem = suggestion.detectedItem || suggestion.newChecklistItem || '';
    const exactItem = explicitItem
      ? room.items.find(item => item.toLowerCase() === explicitItem.toLowerCase())
      : null;
    if (exactItem) return { room: roomName, item: exactItem };

    const bestExistingItem = detectItemFromNote(possibleItemText, room.items);
    if (bestExistingItem) return { room: roomName, item: bestExistingItem };

    const newChecklistItem = suggestion.newChecklistItem || suggestion.detectedItem || suggestedChecklistItemFromNote(possibleItemText, roomName);
    return newChecklistItem ? { room: roomName, item: newChecklistItem } : null;
  };

  const applySuggestionToFinding = (suggestion: WalkthroughSuggestion): { room: string; item: string } | null => {
    const target = resolveSuggestionTarget(suggestion);
    if (!target) return null;
    const key = `${target.room}||${target.item}`;
    setActiveRooms(prev => prev.map(room => (
      room.room === target.room && !room.items.includes(target.item)
        ? { ...room, items: [...room.items, target.item] }
        : room
    )));
    setLocalFindings(prev => {
      const current = prev[key] ?? { status: 'Pass' as FindingStatus, notes: '', action: '', due: '', photos: [] };
      return {
        ...prev,
        [key]: {
          ...current,
          status: suggestion.suggestedStatus,
          notes: suggestion.notes,
          action: suggestion.suggestedAction ?? current.action ?? '',
          due: suggestion.due ?? current.due ?? '',
          photos: current.photos ?? [],
        },
      };
    });
    setSelectedChecklistRoom(target.room);
    return target;
  };

  useEffect(() => {
    if (!activeInspection) return;
    persistFieldWorkState();
  }, [activeInspection?.id, activeInspection?.status, inspectionView, inspectionSubTab, selectedChecklistRoom, activeRooms, localFindings, inspectionSummary]);

  useEffect(() => {
    if (contractorTab !== 'inspections' || loading || restoredFieldWorkRef.current || activeInspection || inspections.length === 0) return;
    let saved: StoredFieldWorkState | null = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.fieldWorkState) || 'null') as StoredFieldWorkState | null;
    } catch {
      saved = null;
    }
    const savedInspection = saved?.inspectionId
      ? inspections.find(insp => insp.id === saved?.inspectionId)
      : null;
    if (!savedInspection) return;
    const savedSubTab = saved?.subTab;
    const savedSelectedRoom = saved?.selectedRoom ?? null;
    restoredFieldWorkRef.current = true;
    openInspection(savedInspection, {
      subTab: savedSubTab,
      selectedRoom: savedSelectedRoom,
    });
  }, [contractorTab, loading, inspections, activeInspection]);

  useEffect(() => {
    if (!activeInspection || activeInspection.status !== 'draft' || finalizingInspection) return;
    const signature = JSON.stringify({
      id: activeInspection.id,
      rooms: activeRooms,
      findings: localFindings,
      summary: inspectionSummary,
    });
    if (signature === lastAutoSaveSignatureRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void saveInspectionProgress(activeInspection, { silent: true })
        .then(() => { lastAutoSaveSignatureRef.current = signature; })
        .catch(err => setError(readableError(err, 'Unable to auto-save field work progress.')));
    }, 1200);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [activeInspection?.id, activeInspection?.status, activeRooms, localFindings, inspectionSummary, finalizingInspection]);

  const handleInspectionPhotoUpload = async (key: string, file: File) => {
    if (!supabase || !contractor || !activeInspection) return;
    setUploadingInspectionPhotoKey(key);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${contractor.id}/${activeInspection.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('inspection-media').upload(path, file, { contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('inspection-media').getPublicUrl(path);
      setLocalFindings(prev => {
        const current = prev[key] ?? { status: 'Pass' as FindingStatus, notes: '', action: '', due: '', photos: [] };
        return { ...prev, [key]: { ...current, photos: [...(current.photos ?? []), publicUrl] } };
      });
    } catch (err) {
      setError(readableError(err, 'Failed to upload photo.'));
    } finally {
      setUploadingInspectionPhotoKey(null);
    }
  };

  const removeInspectionPhoto = (key: string, url: string) => {
    setLocalFindings(prev => {
      const current = prev[key];
      if (!current) return prev;
      return { ...prev, [key]: { ...current, photos: (current.photos ?? []).filter(p => p !== url) } };
    });
  };

  const saveTemplate = async () => {
    if (!supabase || !contractor || !templateDraft.name.trim() || templateDraft.rooms.length === 0) return;
    setSavingInspection(true);
    try {
      const { data, error: err } = await supabase
        .from('inspection_templates')
        .insert({ contractor_id: contractor.id, name: templateDraft.name.trim(), rooms: templateDraft.rooms })
        .select()
        .single();
      if (err) throw err;
      setInspectionTemplates(prev => [data as InspectionTemplate, ...prev]);
      setTemplateDraft({ name: '', rooms: [] });
      setShowTemplateForm(false);
      setNotice('Template saved.');
    } catch (err) {
      setError(readableError(err, 'Failed to save template.'));
    } finally {
      setSavingInspection(false);
    }
  };

  const deleteTemplate = async (tplId: string) => {
    if (!supabase) return;
    await supabase.from('inspection_templates').delete().eq('id', tplId);
    setInspectionTemplates(prev => prev.filter(t => t.id !== tplId));
  };

  const createLocalContact = async (options?: { autoStartFieldWork?: boolean }) => {
    if (!supabase || !contractor) return;
    if (!localContactDraft.display_name.trim()) {
      setError('Enter a customer name before saving a local customer.');
      return;
    }
    const autoStart = options?.autoStartFieldWork ?? true;
    setSavingInspection(true);
    setError('');
    setNotice('');
    try {
      const { data, error: createError } = await supabase.rpc('servsync_create_local_contact', {
        p_display_name: localContactDraft.display_name,
        p_phone: localContactDraft.phone,
        p_email: localContactDraft.email,
        p_notes: localContactDraft.notes,
        p_home_nickname: localContactDraft.home_nickname,
        p_address_line1: localContactDraft.address_line1,
        p_address_line2: localContactDraft.address_line2,
        p_city: localContactDraft.city,
        p_state: localContactDraft.state,
        p_zip_code: localContactDraft.zip_code,
        p_home_type: localContactDraft.home_type,
        p_year_built: localContactDraft.year_built,
        p_square_feet: localContactDraft.square_feet,
        p_home_notes: localContactDraft.home_notes,
      });
      if (createError) throw createError;

      const created = data as { contact?: ContractorLocalContact; home?: ContractorLocalHome } | null;
      if (created?.contact) {
        const contactWithHome: ContractorLocalContact = {
          ...created.contact,
          homes: created.home ? [created.home] : [],
        };
        setLocalContacts(prev => [contactWithHome, ...prev]);
        if (autoStart) {
          beginFieldWorkForLocalContact(contactWithHome);
        } else {
          setSelectedHomeownerSubjectId(`local:${contactWithHome.id}`);
          setHomeownerDetailTab('overview');
        }
      }

      setLocalContactDraft({
        display_name: '',
        phone: '',
        email: '',
        notes: '',
        home_nickname: 'Home',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        zip_code: '',
        home_type: '',
        year_built: '',
        square_feet: '',
        home_notes: '',
      });
      setShowLocalContactForm(false);
      setNotice(autoStart ? 'Local customer saved. You can start field work now.' : 'Local customer saved.');
      await loadContractor();
    } catch (err) {
      setError(readableError(err, 'Unable to save local customer.'));
    } finally {
      setSavingInspection(false);
    }
  };

  return (
    <SidebarLayout
      brand={{ name: contractorDraft.business_name || 'ServSync', subtitle: 'Contractor Portal' }}
      tabs={[
        { id: 'overview',     label: 'Dashboard',          icon: <LayoutDashboard size={17} />, group: 'Workspace' },
        { id: 'profile',      label: 'Business Profile',   icon: <Building2 size={17} />, group: 'Workspace' },
        { id: 'connections',  label: 'Homeowners',         icon: <Users size={17} />, group: 'Homeowner Work' },
        { id: 'requests',     label: 'Service Requests',   icon: <MessageSquare size={17} />, badge: contractorFollowUpCount || openServiceRequestCount, group: 'Homeowner Work' },
        { id: 'calendar',     label: 'Calendar',           icon: <Calendar size={17} />, badge: homeownerAppointmentRequests.length, group: 'Homeowner Work' },
        { id: 'invites',      label: 'Invites & Referrals', icon: <Link2 size={17} />, group: 'Growth' },
        { id: 'discover',     label: 'Discover',           icon: <Compass size={17} />, group: 'Growth' },
        { id: 'inspections',  label: 'Work Orders',        icon: <ClipboardCheck size={17} />, group: 'Add-ons' },
        { id: 'support',      label: 'Support',            icon: <MessageSquare size={17} />, badge: supportInquiries.filter(inquiry => ['new', 'in_progress', 'waiting_on_user', 'waiting_on_admin'].includes(inquiry.status)).length, group: 'Help' },
      ]}
      activeTab={contractorTab}
      onChange={tab => setContractorTab(tab as typeof contractorTab)}
      actions={<NotificationBell
        notifications={notifications}
        unreadCount={contractorUnreadNotificationCount}
        onMarkRead={ids => void markContractorNotificationsRead(ids)}
        onOpenNotification={notification => {
          if (notification.estimate_id) {
            const estimate = estimates.find(item => item.id === notification.estimate_id);
            if (estimate?.homeowner_user_id) {
              const connection = connections.find(candidate => candidate.homeowner_user_id === estimate.homeowner_user_id);
              if (connection) {
                setSelectedHomeownerSubjectId(connection.connection_id);
                setHomeownerFilter(connection.status === 'active' ? 'active' : 'inactive');
                setHomeownerWorkspaceEstimateView(estimate.status === 'accepted' ? 'accepted' : estimate.status === 'sent' ? 'sent' : ['declined', 'expired', 'revised'].includes(estimate.status) ? 'closed' : 'draft');
                setHomeownerDetailTab('estimates');
                setContractorTab('connections');
                return;
              }
            }
            if (estimate?.local_contact_id) {
              setSelectedHomeownerSubjectId(`local:${estimate.local_contact_id}`);
              setHomeownerFilter('active');
              setHomeownerWorkspaceEstimateView(estimate.status === 'accepted' ? 'accepted' : estimate.status === 'sent' ? 'sent' : ['declined', 'expired', 'revised'].includes(estimate.status) ? 'closed' : 'draft');
              setHomeownerDetailTab('estimates');
              setContractorTab('connections');
              return;
            }
            setContractorTab('connections');
            return;
          }
          if (notification.support_inquiry_id || notification.type.includes('support')) {
            setContractorTab('support');
            return;
          }
          if (!notification.request_id) {
            const category = notificationCategoryLabel(notification.type);
            setContractorTab(category === 'Calendar' ? 'calendar' : category === 'Estimate' ? 'connections' : category === 'Field Work' ? 'inspections' : category === 'Connection' ? 'connections' : 'requests');
            return;
          }
          const request = serviceRequests.find(item => item.id === notification.request_id);
          if (!request) return;
          openHomeownerWorkspaceForRequest(request);
        }}
      />}
      profile={profile}
      onSignOut={onSignOut}
    >
      {loading && <Notice tone="info" text="Loading contractor workspace..." />}
      {notice && <Notice tone="success" text={notice} />}
      {error && <Notice tone="error" text={error} />}

      {contractorTab === 'overview' && (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Contractor command center</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">{contractorDraft.business_name || 'Set up your ServSync workspace'}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Manage homeowner connections, service requests, appointments, referrals, and your public business profile from one place.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass('primary')} onClick={() => setContractorTab(openServiceRequestCount > 0 ? 'requests' : 'connections')}>
                    <MessageSquare size={16} />
                    {openServiceRequestCount > 0 ? 'Review open requests' : 'View homeowners'}
                  </button>
                  <button type="button" className={buttonClass('secondary')} onClick={() => setContractorTab('invites')}>
                    <Link2 size={16} />
                    Create invite
                  </button>
                  <button type="button" className={buttonClass('secondary')} onClick={() => setContractorTab('profile')}>
                    <Building2 size={16} />
                    Edit profile
                  </button>
                </div>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0">
                <p className="text-sm font-semibold text-slate-950">Workspace readiness</p>
                <div className="mt-4 space-y-3">
                  <MetricButton label="Business profile" value={`${contractorProfileScore}% complete`} onClick={() => setContractorTab('profile')} />
                  <InfoBox label="Subscription" value={contractorDraft.subscription_status || 'trialing'} />
                  <MetricButton label="Public listing" value={contractorDraft.public_profile_enabled ? 'Visible' : 'Hidden'} onClick={() => setContractorTab('profile')} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OverviewCard icon={<MessageSquare size={20} />} label="Open requests" value={String(openServiceRequestCount)} helper={`${contractorFollowUpCount} need action · ${urgentServiceRequests.length} urgent`} onClick={() => setContractorTab('requests')} />
            <OverviewCard icon={<Users size={20} />} label="Connected homeowners" value={String(connections.length)} helper="Approved connections" onClick={() => setContractorTab('connections')} />
            <OverviewCard icon={<UserRound size={20} />} label="Connection requests" value={String(connectionRequests.length)} helper="Waiting on your review" onClick={() => setContractorTab('connections')} />
            <OverviewCard icon={<Calendar size={20} />} label="Calendar" value={String(confirmedAppointments.length)} helper={`${homeownerAppointmentRequests.length} homeowner time request${homeownerAppointmentRequests.length === 1 ? '' : 's'}`} onClick={() => setContractorTab('calendar')} />
            <OverviewCard icon={<MessageSquare size={20} />} label="ServSync support" value={String(openSupportInquiryCount)} helper={waitingOnContractorSupportCount > 0 ? `${waitingOnContractorSupportCount} waiting on you` : 'Feature requests and help'} onClick={() => setContractorTab('support')} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card title="Needs attention" icon={<AlertTriangle size={18} />}>
              <div className="space-y-3">
                {connectionRequests.slice(0, 3).map(request => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setContractorTab('connections')}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800">New homeowner connection request</p>
                        <p className="mt-1 text-xs text-slate-500">Requested {formatDateTime(request.created_at)} from {request.source || 'ServSync'}</p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Review</span>
                    </div>
                  </button>
                ))}

                {homeownerAppointmentRequests.slice(0, 3).map(request => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => openHomeownerWorkspaceForRequest(request, { tab: 'schedule' })}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800">{request.homeowner_name || 'Homeowner'} requested a time</p>
                        <p className="mt-1 text-xs text-slate-500">{request.title} · {formatDateTime(request.appointment?.proposed_at)}</p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Respond</span>
                    </div>
                  </button>
                ))}

                {recentOpenServiceRequests.map(request => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => openHomeownerWorkspaceForRequest(request)}
                    className={`w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 border-l-4 ${serviceRequestStatusAccent(request.status)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-800">{request.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${serviceRequestStatusClass(request.status)}`}>
                            {serviceRequestStatusLabel(request.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{request.homeowner_name || 'Homeowner'} · {request.category} · {urgencyLabel(request.urgency)}</p>
                      </div>
                      <ArrowRight size={16} className="mt-1 shrink-0 text-slate-400" />
                    </div>
                  </button>
                ))}

                {connectionRequests.length === 0 && homeownerAppointmentRequests.length === 0 && recentOpenServiceRequests.length === 0 && (
                  <EmptyState text="Nothing waiting right now. New requests, connection approvals, and homeowner appointment changes will show here first." />
                )}
              </div>
            </Card>

            <div className="space-y-4">
              <Card title="Upcoming work" icon={<Calendar size={18} />}>
                <div className="space-y-3">
                  {confirmedAppointments.slice(0, 3).map(request => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => openHomeownerWorkspaceForRequest(request, { tab: 'schedule' })}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <p className="font-semibold text-slate-800">{request.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{request.homeowner_name || 'Homeowner'} · {formatDateTime(request.appointment?.proposed_at)}</p>
                    </button>
                  ))}
                  {confirmedAppointments.length === 0 && <EmptyState text="No confirmed appointments yet. Confirmed service appointments will appear here." />}
                </div>
              </Card>

              <Card title="Invite pipeline" icon={<Link2 size={18} />}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoBox label="Invite links" value={String(invites.length)} />
                  <InfoBox label="Pending approvals" value={String(connectionRequests.length)} />
                </div>
                <button type="button" className={`${buttonClass('secondary')} mt-4 w-full justify-center`} onClick={() => setContractorTab('invites')}>
                  <Plus size={16} />
                  Manage invites and referrals
                </button>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <ContractorBillingCard contractor={contractor} />

            <Card title="Recent homeowners" icon={<Users size={18} />}>
              <div className="space-y-3">
                {recentConnectedHomeowners.map(connection => (
                  <button
                    key={connection.connection_id}
                    type="button"
                    onClick={() => openHomeownerWorkspaceForConnection(connection)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800">{connection.display_name || 'Homeowner'}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {[connection.city, connection.state].filter(Boolean).join(', ') || 'Location not shared'} · {Object.values(connection.permissions).filter(Boolean).length} shared
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Connected</span>
                    </div>
                  </button>
                ))}
                {recentConnectedHomeowners.length === 0 && <EmptyState text="No connected homeowners yet. Invite homeowners or approve connection requests to start building your ServSync network." />}
              </div>
            </Card>
          </div>
        </div>
      )}

      {contractorTab === 'profile' && (
      <Card title="Business profile" icon={<Building2 size={18} />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Business name">
            <input className={inputClass()} value={contractorDraft.business_name} onChange={event => setContractor({ ...contractorDraft, business_name: event.target.value })} />
          </Field>
          <Field label="Public profile slug">
            <input className={inputClass()} value={contractorDraft.slug} onChange={event => setContractor({ ...contractorDraft, slug: slugify(event.target.value) })} placeholder="auto-created from business name" />
          </Field>
          <Field label="Contact name">
            <input className={inputClass()} value={contractorDraft.contact_name} onChange={event => setContractor({ ...contractorDraft, contact_name: event.target.value })} />
          </Field>
          <Field label="Email">
            <input className={inputClass()} value={contractorDraft.email} onChange={event => setContractor({ ...contractorDraft, email: event.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inputClass()} value={contractorDraft.phone} onChange={event => setContractor({ ...contractorDraft, phone: event.target.value })} />
          </Field>
          <Field label="Website">
            <input className={inputClass()} value={contractorDraft.website_url} onChange={event => setContractor({ ...contractorDraft, website_url: event.target.value })} />
          </Field>
          <Field label="City">
            <input className={inputClass()} value={contractorDraft.city} onChange={event => setContractor({ ...contractorDraft, city: event.target.value })} />
          </Field>
          <Field label="State">
            <AutocompleteInput
              id="contractor-state"
              value={contractorDraft.state}
              onChange={state => setContractor({ ...contractorDraft, state })}
              options={US_STATE_OPTIONS}
              placeholder="Start typing a state..."
            />
          </Field>
          <Field label="ZIP code">
            <input className={inputClass()} value={contractorDraft.zip_code} onChange={event => setContractor({ ...contractorDraft, zip_code: event.target.value })} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Service categories</span>
            <ServiceCategorySelector
              selected={contractorDraft.service_categories}
              onChange={service_categories => setContractor({ ...contractorDraft, service_categories })}
            />
          </div>
          <Field label="Service ZIP codes">
            <input className={inputClass()} value={fromList(contractorDraft.service_zip_codes)} onChange={event => setContractor({ ...contractorDraft, service_zip_codes: toList(event.target.value) })} />
          </Field>
          <Field label="License number">
            <input className={inputClass()} value={contractorDraft.license_number} onChange={event => setContractor({ ...contractorDraft, license_number: event.target.value })} />
          </Field>
          <Field label="Insurance status">
            <input className={inputClass()} value={contractorDraft.insurance_status} onChange={event => setContractor({ ...contractorDraft, insurance_status: event.target.value })} />
          </Field>
          <Field label="Bonded status">
            <input className={inputClass()} value={contractorDraft.bonded_status} onChange={event => setContractor({ ...contractorDraft, bonded_status: event.target.value })} />
          </Field>
          <Field label="Business summary">
            <textarea className={inputClass()} rows={3} value={contractorDraft.business_summary} onChange={event => setContractor({ ...contractorDraft, business_summary: event.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void saveContractor()} className={buttonClass('primary')}>
            <ClipboardCheck size={16} />
            Save business profile
          </button>
          {contractor?.slug && (
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}#/profile?slug=${contractor.slug}`;
                void navigator.clipboard.writeText(url);
                setNotice('Profile link copied to clipboard.');
              }}
              className={buttonClass('secondary')}
            >
              <Link2 size={16} />
              Copy profile link
            </button>
          )}
        </div>
        {contractor?.slug && (
          <p className="mt-3 text-xs text-slate-500">
            Public profile: <span className="font-mono text-slate-400">#/profile?slug={contractor.slug}</span>
          </p>
        )}
        <div className="mt-4 border-t border-slate-700 pt-4">
          <EmailNotificationsToggle initialEnabled={profile.email_notifications_enabled ?? true} />
        </div>
      </Card>
      )}

      {contractorTab === 'profile' && (() => {
        const reviewedRequests = serviceRequests.filter(r => r.review);
        if (reviewedRequests.length === 0) return null;
        const avgRating = reviewedRequests.reduce((sum, r) => sum + r.review!.rating, 0) / reviewedRequests.length;
        const kudusCounts: Record<string, number> = {};
        reviewedRequests.forEach(r => (r.review!.kudos ?? []).forEach(k => { kudusCounts[k] = (kudusCounts[k] ?? 0) + 1; }));
        const topKudos = Object.entries(kudusCounts).sort((a, b) => b[1] - a[1]);
        return (
          <Card title="Homeowner reviews" icon={<Star size={18} />}>
            <div className="mb-4 flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{avgRating.toFixed(1)}</p>
                <StarDisplay rating={Math.round(avgRating)} />
                <p className="mt-1 text-xs text-slate-400">{reviewedRequests.length} {reviewedRequests.length === 1 ? 'review' : 'reviews'}</p>
              </div>
              {topKudos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {topKudos.map(([k, count]) => (
                    <span key={k} className="rounded-full bg-blue-900/30 px-2.5 py-1 text-xs font-semibold text-blue-400">
                      {k} <span className="text-blue-500">×{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {reviewedRequests.map(r => (
                <div key={r.id} className="rounded-xl border border-slate-700 bg-slate-700/40 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <StarDisplay rating={r.review!.rating} />
                      {r.review!.kudos.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {r.review!.kudos.map(k => (
                            <span key={k} className="rounded-full bg-slate-600 px-2 py-0.5 text-xs text-slate-300">{k}</span>
                          ))}
                        </div>
                      )}
                      {r.review!.body && <p className="mt-2 text-sm text-slate-300 italic">"{r.review!.body}"</p>}
                    </div>
                    <p className="shrink-0 text-xs text-slate-500">{formatDateTime(r.review!.created_at)}</p>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">{r.category} · {r.title}</p>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {contractorTab === 'requests' && (
        <Card title="Service requests" icon={<MessageSquare size={18} />}>
          {(() => {
            const renderContractorRequestCard = (request: ServiceRequestSummary, isClosedCard: boolean) => {
              const isExpanded = contractorExpandedRequestIds.has(request.id);
              const isUpdating = updatingServiceRequestId === request.id;
              const lastMessage = request.messages[request.messages.length - 1];
              const needsFollowUp = contractorRequestNeedsFollowUp(request);
              const hasAppointment = Boolean(request.appointment);
              const hasQuote = Boolean(request.quote);
              const requestConnection = connections.find(connection =>
                connection.connection_id === request.connection_id
                || connection.homeowner_user_id === request.homeowner_user_id
              );
              return (
                <div key={request.id} className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm border-l-4 ${serviceRequestStatusAccent(request.status)}`}>
                  <button
                    type="button"
                    onClick={() => openHomeownerWorkspaceForRequest(request)}
                    className="w-full text-left px-4 py-3.5 transition-colors hover:bg-blue-50"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-950">{request.title}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${serviceRequestStatusClass(request.status)}`}>
                            {serviceRequestStatusLabel(request.status)}
                          </span>
                          {needsFollowUp && !isClosedCard && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                              Follow-up
                            </span>
                          )}
                          {hasAppointment && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                              Appointment
                            </span>
                          )}
                          {hasQuote && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                              Quote
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {request.homeowner_name || 'Homeowner'}{request.homeowner_city ? ` · ${request.homeowner_city}` : ''} · {request.category} · {urgencyLabel(request.urgency)} · {formatDateTime(request.updated_at)}
                        </p>
                        {!isExpanded && lastMessage && (
                          <p className="mt-2 text-sm text-slate-600 line-clamp-2">{lastMessage.body}</p>
                        )}
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">
                        Open workspace
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </button>

                  {false && isExpanded && (() => {
                    const requestConnectionForExpanded = requestConnection;
                    const requestQuoteForExpanded = request.quote;
                    const requestAppointmentForExpanded = request.appointment;
                    const requestReviewForExpanded = request.review;
                    if (!requestConnectionForExpanded || !requestQuoteForExpanded || !requestAppointmentForExpanded || !requestReviewForExpanded) return null;
                    const expandedRequest: ServiceRequestSummary & {
                      quote: ServiceRequestQuote;
                      appointment: ServiceRequestAppointment;
                      review: NonNullable<ServiceRequestSummary['review']>;
                    } = {
                      ...request,
                      quote: requestQuoteForExpanded!,
                      appointment: requestAppointmentForExpanded!,
                      review: requestReviewForExpanded!,
                    };
                    return ((
                      request: ServiceRequestSummary & {
                        quote: ServiceRequestQuote;
                        appointment: ServiceRequestAppointment;
                        review: NonNullable<ServiceRequestSummary['review']>;
                      },
                      requestConnection: ContractorConnectedHomeowner,
                    ) => (
                    <div className="border-t border-slate-700 px-4 pb-4 pt-4 space-y-4">
                      {/* Description */}
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{request.description}</p>
                      {requestConnection && !isClosedCard && (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-900/40 bg-blue-950/20 p-3">
                          <button
                            type="button"
                            onClick={() => beginFieldWorkForHomeowner(requestConnection, {
                              name: `${request.category} field work — ${request.homeowner_name || requestConnection.display_name || 'Homeowner'} — ${request.title}`,
                              serviceRequestId: request.id,
                            })}
                            className={buttonClass('primary')}
                          >
                            <ClipboardCheck size={16} />
                            Start field work from request
                          </button>
                          <p className="text-xs text-slate-400">This will connect the report to {request.homeowner_name || requestConnection.display_name || 'the homeowner'}.</p>
                        </div>
                      )}

                      {/* Closed: summary + invoice */}
                      {isClosedCard && request.closing_summary && (
                        <div className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-3">
                          <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-emerald-400">
                            <FileText size={11} />
                            Closing Summary
                          </p>
                          <p className="text-sm text-emerald-300">{request.closing_summary}</p>
                        </div>
                      )}
                      {isClosedCard && request.quote && (
                        <div className="rounded-lg border border-slate-700 bg-slate-700 p-3">
                          <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                            <Receipt size={11} />
                            Invoice
                          </p>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="flex-1 text-sm text-slate-300">{request.quote.scope || 'Services rendered'}</p>
                            <p className="shrink-0 text-lg font-bold text-white">${(request.quote.amount_cents / 100).toFixed(2)}</p>
                          </div>
                          <p className={`mt-1 text-xs ${request.quote.status === 'accepted' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {request.quote.status === 'accepted' ? '✓ Accepted' : `Quote ${request.quote.status}`}
                          </p>
                        </div>
                      )}

                      {/* Thread */}
                      <details open={!isClosedCard}>
                        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-400">
                          Thread · {request.messages.length} {request.messages.length === 1 ? 'message' : 'messages'}
                        </summary>
                        <div className="mt-3">
                          <ServiceRequestMessages messages={request.messages} media={request.media ?? []} />
                        </div>
                      </details>

                      {/* Active-only: quote display, appointment, response form */}
                      {!isClosedCard && (
                        <>
                          {request.quote && (
                            <ServiceRequestQuoteCard quote={request.quote} showActions={false} isUpdating={false} />
                          )}
                          {request.appointment && (
                            <>
                              <ServiceRequestAppointmentCard
                                appointment={request.appointment}
                                proposedByLabel={request.appointment.proposed_by === 'homeowner' ? 'Homeowner proposed' : 'You proposed'}
                                nextActionLabel={appointmentNextActionText(request.appointment, 'contractor')}
                              />
                              {request.appointment.status === 'proposed' && request.appointment.proposed_by === 'homeowner' && (
                                <>
                                  {contractorCounterProposeDrafts[request.id]?.open ? (
                                    <div className="space-y-3">
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="Your proposed date & time">
                                          <input className={inputClass()} type="datetime-local"
                                            value={contractorCounterProposeDrafts[request.id]?.proposedAt ?? ''}
                                            onChange={event => setContractorCounterProposeDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { open: true, notes: '' }), proposedAt: event.target.value } }))}
                                          />
                                        </Field>
                                        <Field label="Notes (optional)">
                                          <input className={inputClass()} placeholder="What to expect, access needed, etc."
                                            value={contractorCounterProposeDrafts[request.id]?.notes ?? ''}
                                            onChange={event => setContractorCounterProposeDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { open: true, proposedAt: '' }), notes: event.target.value } }))}
                                          />
                                        </Field>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <button type="button" className={buttonClass('primary')}
                                          disabled={!contractorCounterProposeDrafts[request.id]?.proposedAt || respondingToHomeownerApptId === request.id}
                                          onClick={() => void respondToHomeownerAppointment(request, 'counter', contractorCounterProposeDrafts[request.id]?.proposedAt, contractorCounterProposeDrafts[request.id]?.notes)}
                                        >
                                          {respondingToHomeownerApptId === request.id ? 'Sending...' : 'Send counter-proposal'}
                                        </button>
                                        <button type="button" className={buttonClass('secondary')}
                                          disabled={respondingToHomeownerApptId === request.id}
                                          onClick={() => setContractorCounterProposeDrafts(current => ({ ...current, [request.id]: { open: false, proposedAt: '', notes: '' } }))}
                                        >Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      <button type="button" className={buttonClass('primary')}
                                        disabled={respondingToHomeownerApptId === request.id}
                                        onClick={() => void respondToHomeownerAppointment(request, 'confirm')}
                                      >
                                        <CheckCircle2 size={16} />
                                        {respondingToHomeownerApptId === request.id ? 'Updating...' : 'Confirm appointment'}
                                      </button>
                                      <button type="button" className={buttonClass('secondary')}
                                        disabled={respondingToHomeownerApptId === request.id}
                                        onClick={() => setContractorCounterProposeDrafts(current => ({ ...current, [request.id]: { open: true, proposedAt: '', notes: '' } }))}
                                      >Propose new time</button>
                                      <button type="button" className={buttonClass('secondary')}
                                        disabled={respondingToHomeownerApptId === request.id}
                                        onClick={() => void respondToHomeownerAppointment(request, 'decline')}
                                      >Decline</button>
                                    </div>
                                  )}
                                </>
                              )}
                              {request.appointment.status === 'proposed' && request.appointment.proposed_by === 'contractor' && (
                                <p className="text-sm font-medium text-slate-500">{appointmentResponseText(request.appointment, 'contractor')}</p>
                              )}
                              {request.appointment.status === 'confirmed' && (
                                <div className="space-y-3">
                                  {contractorRescheduleDrafts[request.id]?.open ? (
                                    <div className="space-y-3">
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label="New date & time">
                                          <input className={inputClass()} type="datetime-local"
                                            value={contractorRescheduleDrafts[request.id]?.proposedAt ?? ''}
                                            onChange={event => setContractorRescheduleDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { open: true, notes: '' }), proposedAt: event.target.value } }))}
                                          />
                                        </Field>
                                        <Field label="Reason (optional)">
                                          <input className={inputClass()} placeholder="Why you need to reschedule..."
                                            value={contractorRescheduleDrafts[request.id]?.notes ?? ''}
                                            onChange={event => setContractorRescheduleDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { open: true, proposedAt: '' }), notes: event.target.value } }))}
                                          />
                                        </Field>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <button type="button" className={buttonClass('primary')}
                                          disabled={!contractorRescheduleDrafts[request.id]?.proposedAt || contractorReschedulingId === request.id}
                                          onClick={() => void rescheduleAsContractor(request)}
                                        >{contractorReschedulingId === request.id ? 'Sending...' : 'Send reschedule proposal'}</button>
                                        <button type="button" className={buttonClass('secondary')}
                                          disabled={contractorReschedulingId === request.id}
                                          onClick={() => setContractorRescheduleDrafts(current => ({ ...current, [request.id]: { open: false, proposedAt: '', notes: '' } }))}
                                        >Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      <button type="button" className={buttonClass('primary')}
                                        onClick={() => void completeAppointment(request)}
                                        disabled={proposingAppointmentId === request.id}
                                      >
                                        <CheckCircle2 size={16} />
                                        {proposingAppointmentId === request.id ? 'Updating...' : 'Mark appointment complete'}
                                      </button>
                                      <button type="button" className={buttonClass('secondary')}
                                        onClick={() => setContractorRescheduleDrafts(current => ({ ...current, [request.id]: { open: true, proposedAt: '', notes: '' } }))}
                                      >
                                        <Calendar size={15} />
                                        Reschedule
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          <div className="space-y-3">
                            <Field label="Response">
                              <textarea className={inputClass()} rows={3}
                                value={contractorResponseDrafts[request.id] || ''}
                                onChange={event => setContractorResponseDrafts(current => ({ ...current, [request.id]: event.target.value }))}
                                placeholder="Send an update, ask a question, or explain next steps. Optional if you are only proposing an appointment."
                              />
                            </Field>
                            <div>
                              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600">
                                <Paperclip size={15} className="shrink-0 text-slate-400" />
                                Attach photos / videos
                                <input
                                  type="file"
                                  multiple
                                  accept="image/*,video/*"
                                  className="sr-only"
                                  onChange={e => {
                                    const picked = Array.from(e.target.files ?? []);
                                    setContractorResponseFiles(prev => ({ ...prev, [request.id]: [...(prev[request.id] ?? []), ...picked] }));
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {(contractorResponseFiles[request.id] ?? []).length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {(contractorResponseFiles[request.id] ?? []).map((file, i) => (
                                    <li key={i} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300">
                                      <span className="truncate">{file.name}</span>
                                      <button type="button" onClick={() => setContractorResponseFiles(prev => ({ ...prev, [request.id]: (prev[request.id] ?? []).filter((_, idx) => idx !== i) }))} className="ml-2 text-slate-400 hover:text-red-400"><X size={13} /></button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <label className="flex cursor-pointer items-center gap-2">
                              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                checked={contractorQuoteDrafts[request.id]?.enabled ?? false}
                                onChange={event => setContractorQuoteDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { amount: '', scope: '' }), enabled: event.target.checked } }))}
                              />
                              <span className="text-sm font-semibold text-slate-300">Attach a quote</span>
                            </label>
                            {contractorQuoteDrafts[request.id]?.enabled && (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Amount ($)">
                                  <input className={inputClass()} type="number" min="0" step="0.01" placeholder="0.00"
                                    value={contractorQuoteDrafts[request.id]?.amount ?? ''}
                                    onChange={event => setContractorQuoteDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { enabled: true, scope: '' }), amount: event.target.value } }))}
                                  />
                                </Field>
                                <Field label="What the quote covers">
                                  <input className={inputClass()} placeholder="Parts, labor, etc."
                                    value={contractorQuoteDrafts[request.id]?.scope ?? ''}
                                    onChange={event => setContractorQuoteDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { enabled: true, amount: '' }), scope: event.target.value } }))}
                                  />
                                </Field>
                              </div>
                            )}
                            {!['proposed', 'confirmed', 'completed'].includes(request.appointment?.status ?? '') && (
                              <>
                                <label className="flex cursor-pointer items-center gap-2">
                                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                    checked={appointmentDrafts[request.id]?.enabled ?? false}
                                    onChange={event => setAppointmentDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { proposedAt: '', notes: '' }), enabled: event.target.checked } }))}
                                  />
                                  <span className="text-sm font-semibold text-slate-300">Schedule appointment</span>
                                </label>
                                <p className="text-xs text-slate-500">You can send an appointment proposal by itself, or include a typed response with it.</p>
                                {appointmentDrafts[request.id]?.enabled && (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Date & time">
                                      <input className={inputClass()} type="datetime-local"
                                        value={appointmentDrafts[request.id]?.proposedAt ?? ''}
                                        onChange={event => setAppointmentDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { enabled: true, notes: '' }), proposedAt: event.target.value } }))}
                                      />
                                    </Field>
                                    <Field label="Notes (optional)">
                                      <input className={inputClass()} placeholder="What to expect, access needed, etc."
                                        value={appointmentDrafts[request.id]?.notes ?? ''}
                                        onChange={event => setAppointmentDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { enabled: true, proposedAt: '' }), notes: event.target.value } }))}
                                      />
                                    </Field>
                                  </div>
                                )}
                              </>
                            )}
                            {/* Close with summary — expands inline */}
                            {closingExpandedId === request.id ? (
                              <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-700 p-3">
                                <Field label="Closing summary (what was done)">
                                  <textarea className={inputClass()} rows={3}
                                    value={closingSummaryDrafts[request.id] ?? ''}
                                    onChange={event => setClosingSummaryDrafts(current => ({ ...current, [request.id]: event.target.value }))}
                                    placeholder="Describe the work completed, parts used, next steps, etc."
                                  />
                                </Field>
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" className={buttonClass('primary')}
                                    disabled={isUpdating}
                                    onClick={() => void updateContractorServiceRequest(request, 'close')}
                                  >
                                    {isUpdating ? 'Closing...' : 'Close request'}
                                  </button>
                                  <button type="button" className={buttonClass('secondary')}
                                    disabled={isUpdating}
                                    onClick={() => setClosingExpandedId(null)}
                                  >Cancel</button>
                                </div>
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className={buttonClass('primary')}
                                onClick={() => void updateContractorServiceRequest(request, 'respond')}
                                disabled={isUpdating}
                              >
                                {isUpdating
                                  ? 'Sending...'
                                  : appointmentDrafts[request.id]?.enabled && appointmentDrafts[request.id]?.proposedAt
                                    ? contractorResponseDrafts[request.id]?.trim() ? 'Send response + appointment' : 'Send appointment'
                                    : 'Send response'}
                              </button>
                              <button type="button" className={buttonClass('secondary')}
                                onClick={() => void updateContractorServiceRequest(request, 'decline')}
                                disabled={isUpdating}
                              >Decline</button>
                              {closingExpandedId !== request.id && (
                                <button type="button" className={buttonClass('secondary')}
                                  onClick={() => setClosingExpandedId(request.id)}
                                  disabled={isUpdating}
                                >Close</button>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Closed-only: review display + reopen */}
                      {isClosedCard && request.review && (
                        <div className="rounded-xl border border-slate-700 bg-slate-700/40 px-3 py-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Homeowner review</p>
                          <StarDisplay rating={request.review.rating} />
                          {request.review.kudos.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {request.review.kudos.map(k => (
                                <span key={k} className="rounded-full bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-400">{k}</span>
                              ))}
                            </div>
                          )}
                          {request.review.body && <p className="mt-2 text-sm text-slate-300 italic">"{request.review.body}"</p>}
                        </div>
                      )}
                      {isClosedCard && (
                        <>
                          {contractorReopenDrafts[request.id]?.open ? (
                            <div className="space-y-3">
                              <Field label="Reason for reopening (optional)">
                                <textarea className={inputClass()} rows={2}
                                  value={contractorReopenDrafts[request.id]?.body ?? ''}
                                  onChange={event => setContractorReopenDrafts(current => ({ ...current, [request.id]: { ...(current[request.id] || { open: true }), body: event.target.value } }))}
                                  placeholder="Describe what needs follow-up..."
                                />
                              </Field>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={buttonClass('primary')}
                                  disabled={contractorReopeningRequestId === request.id}
                                  onClick={() => void reopenContractorRequest(request)}
                                >
                                  <RotateCcw size={15} />
                                  {contractorReopeningRequestId === request.id ? 'Reopening...' : 'Reopen request'}
                                </button>
                                <button type="button" className={buttonClass('secondary')}
                                  disabled={contractorReopeningRequestId === request.id}
                                  onClick={() => setContractorReopenDrafts(current => ({ ...current, [request.id]: { open: false, body: '' } }))}
                                >Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" className={buttonClass('secondary')}
                              onClick={() => setContractorReopenDrafts(current => ({ ...current, [request.id]: { open: true, body: '' } }))}
                            >
                              <RotateCcw size={15} />
                              Reopen for follow-up
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    ))(expandedRequest, requestConnectionForExpanded!);
                  })()}
                </div>
              );
            };

            const isContractorAttention = contractorRequestNeedsFollowUp;
            const sortContractorRequests = (requests: ServiceRequestSummary[]) => [...requests].sort((a, b) => {
              const attentionDelta = Number(isContractorAttention(b)) - Number(isContractorAttention(a));
              if (attentionDelta) return attentionDelta;
              const urgentDelta = Number(b.urgency === 'urgent') - Number(a.urgency === 'urgent');
              if (urgentDelta) return urgentDelta;
              const appointmentDelta = Number(Boolean(b.appointment)) - Number(Boolean(a.appointment));
              if (appointmentDelta) return appointmentDelta;
              return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
            const requestSections: Array<{ id: Extract<ContractorRequestView, 'new' | 'open' | 'closed'>; title: string; helper: string; requests: ServiceRequestSummary[] }> = [
              {
                id: 'new',
                title: 'New requests',
                helper: 'Fresh homeowner requests that need your first response.',
                requests: sortContractorRequests(serviceRequests.filter(r => r.status === 'open')),
              },
              {
                id: 'open',
                title: 'Open',
                helper: 'Active requests after the first response, including appointment scheduling and follow-up.',
                requests: sortContractorRequests(serviceRequests.filter(r =>
                  !['closed', 'declined'].includes(r.status)
                  && r.status !== 'open'
                )),
              },
              {
                id: 'closed',
                title: 'Closed',
                helper: 'Completed, declined, cancelled, or invoiced requests.',
                requests: sortContractorRequests(serviceRequests.filter(r => r.status === 'closed' || r.status === 'declined')),
              },
            ];
            const followUpRequests = sortContractorRequests(serviceRequests.filter(isContractorAttention));
            const activeContractorRequestView = contractorRequestView === 'overview'
              ? 'overview'
              : requestSections.find(section => section.id === contractorRequestView)?.id
                ?? contractorRequestView;
            const selectedSection = activeContractorRequestView === 'overview'
              ? null
              : requestSections.find(section => section.id === activeContractorRequestView) ?? requestSections[0];
            const filteredRequests = selectedSection?.requests.filter(request => serviceRequestMatchesSearch(request, contractorRequestSearch)) ?? [];

            return (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setContractorRequestView('overview')}
                    className={`rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                      activeContractorRequestView === 'overview'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-950 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${activeContractorRequestView === 'overview' ? 'text-blue-50' : 'text-slate-500'}`}>Dashboard</p>
                    <p className="mt-1 text-xl font-bold">{serviceRequests.filter(r => !['closed', 'declined'].includes(r.status)).length}</p>
                  </button>
                  {requestSections.map(section => {
                    const active = section.id === activeContractorRequestView;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setContractorRequestView(section.id)}
                        className={`rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                          active
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-950 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${active ? 'text-blue-50' : 'text-slate-500'}`}>{section.title}</p>
                        <p className="mt-1 text-xl font-bold">{section.requests.length}</p>
                      </button>
                    );
                  })}
                </div>
                {activeContractorRequestView === 'overview' ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                      <button type="button" onClick={() => setContractorRequestView('new')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">First priority</p>
                        <p className="mt-1 text-2xl font-bold text-slate-950">{requestSections.find(s => s.id === 'new')?.requests.length ?? 0}</p>
                        <p className="mt-1 text-sm text-slate-500">New requests need an initial response.</p>
                      </button>
                      <button type="button" onClick={() => setContractorRequestView('open')} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition hover:border-amber-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Follow-up signals</p>
                        <p className="mt-1 text-2xl font-bold text-amber-950">{followUpRequests.length}</p>
                        <p className="mt-1 text-sm text-amber-800">Open requests with homeowner replies, accepted quotes, or requested times.</p>
                      </button>
                      <button type="button" onClick={() => setContractorRequestView('open')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Appointment activity</p>
                        <p className="mt-1 text-2xl font-bold text-slate-950">{serviceRequests.filter(r => !['closed', 'declined'].includes(r.status) && r.appointment).length}</p>
                        <p className="mt-1 text-sm text-slate-500">Scheduled and proposed appointments inside open requests.</p>
                      </button>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-950">Needs attention</p>
                            <p className="mt-0.5 text-xs text-slate-500">The most important open requests to deal with next.</p>
                          </div>
                          <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-800" onClick={() => setContractorRequestView('open')}>
                            View open
                          </button>
                        </div>
                        <div className="space-y-2">
                          {followUpRequests.length === 0 ? (
                            <EmptyState text="No open requests need follow-up right now." />
                          ) : (
                            followUpRequests.slice(0, 4).map(request => renderContractorRequestCard(request, false))
                          )}
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-950">New requests</p>
                            <p className="mt-0.5 text-xs text-slate-500">Fresh homeowner requests waiting for your first reply.</p>
                          </div>
                          <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-800" onClick={() => setContractorRequestView('new')}>
                            View new
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(requestSections.find(s => s.id === 'new')?.requests.length ?? 0) === 0 ? (
                            <EmptyState text="No new service requests right now." />
                          ) : (
                            requestSections.find(s => s.id === 'new')!.requests.slice(0, 4).map(request => renderContractorRequestCard(request, false))
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                ) : selectedSection ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_18rem] lg:items-end">
                    <div>
                      <p className="text-sm font-bold text-slate-950">{selectedSection.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{selectedSection.helper}</p>
                    </div>
                    <Field label="Search this queue">
                      <input
                        className={inputClass()}
                        value={contractorRequestSearch}
                        onChange={event => setContractorRequestSearch(event.target.value)}
                        placeholder="Search homeowner, trade, title..."
                      />
                    </Field>
                  </div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                      {filteredRequests.length} shown of {selectedSection.requests.length}
                    </span>
                    {contractorRequestSearch && (
                      <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-800" onClick={() => setContractorRequestSearch('')}>
                        Clear search
                      </button>
                    )}
                  </div>
                  {filteredRequests.length === 0 ? (
                    <EmptyState text={selectedSection.requests.length === 0 ? 'No requests in this queue.' : 'No requests match that search.'} />
                  ) : (
                    <div className="space-y-2">
                      {filteredRequests.map(request => renderContractorRequestCard(request, ['closed', 'declined'].includes(request.status)))}
                    </div>
                  )}
                </div>
                ) : null}
              </div>
            );
          })()}
        </Card>
      )}

      {contractorTab === 'calendar' && (
        <Card title="Calendar" icon={<Calendar size={18} />}>
          <CalendarView
            requests={serviceRequests}
            perspective="contractor"
            onOpenRequest={request => openHomeownerWorkspaceForRequest(request, { tab: 'schedule' })}
          />
        </Card>
      )}

      {contractorTab === 'invites' && (
      <div className="space-y-5">
          <Card title="Permanent referral QR" icon={<Link2 size={18} />}>
            {contractor?.permanent_invite_code ? (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  Put this on business cards, yard signs, or flyers. Any new homeowner who scans it and creates an account counts as your referral automatically.
                </p>
                <QRDisplay
                  value={`${window.location.origin}${window.location.pathname}#/homeowner?invite=${encodeURIComponent(contractor.permanent_invite_code)}`}
                  fileName={`servsync-qr-${contractor.slug || 'referral'}`}
                />
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs text-slate-500 font-mono mb-2">Code: {contractor.permanent_invite_code}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!supabase) return;
                      const confirmed = window.confirm('Regenerating your QR code will invalidate any printed materials using the old code. Continue?');
                      if (!confirmed) return;
                      const { data, error } = await supabase.rpc('servsync_regenerate_permanent_qr');
                      if (!error && data) {
                        setContractor({ ...contractor, permanent_invite_code: data as string });
                        setNotice('QR code regenerated. Old code is now invalid.');
                      }
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Regenerate QR code
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Save your contractor profile first — a permanent code will be generated automatically.</p>
            )}
          </Card>

          <Card title="One-time invite links" icon={<Mail size={18} />}>
            <p className="text-sm text-slate-500">
              Generate a single-use invite link. The homeowner chooses what to share after connecting. Each link tracks referral credit.
            </p>
            <button type="button" onClick={() => void createInvite()} className={`${buttonClass('primary')} mt-4`}>
              <Plus size={16} />
              Create invite link
            </button>
            {inviteLink && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 mb-3">New invite link</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <p className="break-all text-sm font-semibold text-blue-950">{inviteLink}</p>
                  </div>
                  <QRDisplay value={inviteLink} fileName="servsync-invite" />
                </div>
              </div>
            )}
          </Card>

          <Card title="Referral status" icon={<Receipt size={18} />}>
            <div className="space-y-3">
              {invites.length === 0 ? (
                <EmptyState text="No invite links created yet." />
              ) : (
                invites.slice(0, 8).map(invite => {
                  const inviteUrl = `${window.location.origin}${window.location.pathname}#/homeowner?invite=${encodeURIComponent(invite.invite_code)}`;
                  const isShowingQr = showQrForInvite === invite.id;
                  return (
                    <div key={invite.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-bold text-slate-950">{invite.invite_code}</p>
                          <p className="mt-1 text-xs text-slate-500">Created {formatDateTime(invite.created_at)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {invite.used_at ? `Used ${formatDateTime(invite.used_at)}` : 'Not used yet'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${invite.invite_type === 'permanent_qr' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                            {invite.invite_type === 'permanent_qr' ? 'QR' : 'Manual'}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${invite.status === 'used' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                            {invite.status}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {invite.reward_status || 'not_eligible'}
                          </span>
                          {invite.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => setShowQrForInvite(isShowingQr ? null : invite.id)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                            >
                              {isShowingQr ? 'Hide QR' : 'Show QR'}
                            </button>
                          )}
                        </div>
                      </div>
                      {isShowingQr && (
                        <div className="mt-4 flex justify-center border-t border-slate-200 pt-4">
                          <QRDisplay value={inviteUrl} fileName={`servsync-invite-${invite.invite_code}`} />
                        </div>
                      )}
                      {invite.reward_notes && (
                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                          {invite.reward_notes}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      )}

      {contractorTab === 'connections' && !(inspectionView === 'detail' && activeInspection) && (() => {
        type Subject =
          | { kind: 'connection'; id: string; isActive: boolean; connection: ContractorConnectedHomeowner }
          | { kind: 'local'; id: string; contact: ContractorLocalContact }
          | { kind: 'request'; id: string; request: ContractorConnectionRequest };

        const activeConnList = connections.filter(c => c.status === 'active');
        const inactiveConnList = connections.filter(c => c.status === 'declined' || c.status === 'revoked');

        const activeSubjects: Subject[] = [
          ...connectionRequests.map(r => ({ kind: 'request' as const, id: `request:${r.id}`, request: r })),
          ...activeConnList.map(c => ({ kind: 'connection' as const, id: c.connection_id, isActive: true, connection: c })),
          ...localContacts.map(c => ({ kind: 'local' as const, id: `local:${c.id}`, contact: c })),
        ];
        const inactiveSubjects: Subject[] = inactiveConnList.map(c => ({ kind: 'connection' as const, id: c.connection_id, isActive: false, connection: c }));

        const subjectAttentionScore = (subject: Subject) => {
          if (subject.kind === 'request') return 1000;
          if (subject.kind === 'connection') {
            const subjectRequests = serviceRequests.filter(request => request.connection_id === subject.connection.connection_id);
            const followUpCount = subjectRequests.filter(contractorRequestNeedsFollowUp).length;
            const openRequestCount = subjectRequests.filter(request => !['closed', 'declined'].includes(request.status)).length;
            const draftWorkOrderCount = fieldWorkForHomeowner(subject.connection.homeowner_user_id).filter(work => work.status === 'draft').length;
            return followUpCount * 100 + openRequestCount * 30 + draftWorkOrderCount * 20 + (subject.isActive ? 5 : 0);
          }
          return fieldWorkForLocalContact(subject.contact.id).filter(work => work.status === 'draft').length * 20;
        };
        const subjectSearchText = (subject: Subject) => {
          if (subject.kind === 'request') {
            return normalizeText(['pending request', subject.request.status, subject.request.id].filter(Boolean).join(' '));
          }
          if (subject.kind === 'connection') {
            const conn = subject.connection;
            return normalizeText([
              conn.display_name,
              conn.city,
              conn.state,
              conn.zip_code,
              conn.home?.nickname,
              conn.home?.address_line1,
              conn.home?.city,
              conn.home?.state,
              conn.home?.zip_code,
              conn.status,
              'connected homeowner',
            ].filter(Boolean).join(' '));
          }
          const home = subject.contact.homes?.[0];
          return normalizeText([
            subject.contact.display_name,
            subject.contact.phone,
            subject.contact.email,
            home?.nickname,
            home?.address_line1,
            home?.city,
            home?.state,
            home?.zip_code,
            'local customer',
          ].filter(Boolean).join(' '));
        };
        const homeownerSearchTerms = normalizeText(homeownerWorkspaceSearch).split(' ').filter(Boolean);
        const subjectMatchesSearch = (subject: Subject) => {
          if (homeownerSearchTerms.length === 0) return true;
          const haystack = subjectSearchText(subject);
          return homeownerSearchTerms.every(term => haystack.includes(term));
        };
        const visibleSubjects = (homeownerFilter === 'active' ? activeSubjects : inactiveSubjects)
          .filter(subjectMatchesSearch)
          .sort((a, b) => subjectAttentionScore(b) - subjectAttentionScore(a));
        const allSubjects = [...activeSubjects, ...inactiveSubjects];
        const selectedSubject = allSubjects.find(s => s.id === selectedHomeownerSubjectId) ?? null;

        return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex min-h-[640px]" style={{ height: 'calc(100vh - 220px)' }}>
              {/* === Left sidebar === */}
              <div className="w-72 shrink-0 border-r border-slate-200 flex flex-col bg-white">
                <div className="px-4 py-4 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800 text-sm">Homeowners</h2>
                    <button type="button" onClick={() => { setShowLocalContactForm(true); setSelectedHomeownerSubjectId(null); }} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-3 bg-slate-100 rounded-xl p-1">
                    {(['active', 'inactive'] as const).map(filter => (
                      <button key={filter} type="button" onClick={() => setHomeownerFilter(filter)}
                        className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${homeownerFilter === filter ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                        {filter} ({filter === 'active' ? activeSubjects.length : inactiveSubjects.length})
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={homeownerWorkspaceSearch}
                      onChange={event => setHomeownerWorkspaceSearch(event.target.value)}
                      placeholder="Search homeowner, city, address..."
                    />
                    {homeownerWorkspaceSearch && (
                      <button
                        type="button"
                        onClick={() => setHomeownerWorkspaceSearch('')}
                        className="mt-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {visibleSubjects.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8 px-4">
                      {homeownerWorkspaceSearch ? 'No homeowners match that search.' : `No ${homeownerFilter} homeowners yet.`}
                    </p>
                  ) : visibleSubjects.map(subject => {
                    const isSelected = selectedHomeownerSubjectId === subject.id;
                    let rowName = '';
                    let subtitle = '';
                    const pills: { label: string; tone: 'emerald' | 'amber' | 'slate' | 'red' }[] = [];
                    if (subject.kind === 'connection') {
                      const perm = normalizeSharingPermissions(subject.connection.permissions);
                      const subjectRequests = serviceRequests.filter(request => request.connection_id === subject.connection.connection_id);
                      const openRequestCount = subjectRequests.filter(request => !['closed', 'declined'].includes(request.status)).length;
                      const followUpCount = subjectRequests.filter(contractorRequestNeedsFollowUp).length;
                      const subjectWorkOrders = fieldWorkForHomeowner(subject.connection.homeowner_user_id);
                      const draftWorkOrderCount = subjectWorkOrders.filter(work => work.status === 'draft').length;
                      const filedReportCount = subjectWorkOrders.filter(work => work.status === 'finalized').length;
                      rowName = perm.share_contact ? (subject.connection.display_name || 'Homeowner') : 'Homeowner';
                      subtitle = subject.connection.home?.nickname || subject.connection.home?.address_line1 || subject.connection.city || (perm.share_contact ? '' : 'Contact private');
                      pills.push(subject.isActive ? { label: 'Connected', tone: 'emerald' } : { label: subject.connection.status === 'declined' ? 'Declined' : 'Revoked', tone: 'red' });
                      if (followUpCount > 0) pills.push({ label: `${followUpCount} follow-up`, tone: 'amber' });
                      if (openRequestCount > 0) pills.push({ label: `${openRequestCount} open`, tone: 'slate' });
                      if (draftWorkOrderCount > 0) pills.push({ label: `${draftWorkOrderCount} draft`, tone: 'amber' });
                      if (filedReportCount > 0) pills.push({ label: `${filedReportCount} report${filedReportCount === 1 ? '' : 's'}`, tone: 'slate' });
                    } else if (subject.kind === 'local') {
                      const subjectWorkOrders = fieldWorkForLocalContact(subject.contact.id);
                      const draftWorkOrderCount = subjectWorkOrders.filter(work => work.status === 'draft').length;
                      const filedReportCount = subjectWorkOrders.filter(work => work.status === 'finalized').length;
                      rowName = subject.contact.display_name || 'Local customer';
                      const home = subject.contact.homes?.[0];
                      subtitle = home?.address_line1 || home?.nickname || subject.contact.phone || subject.contact.email || '';
                      pills.push({ label: 'Local', tone: 'slate' });
                      if (draftWorkOrderCount > 0) pills.push({ label: `${draftWorkOrderCount} draft`, tone: 'amber' });
                      if (filedReportCount > 0) pills.push({ label: `${filedReportCount} report${filedReportCount === 1 ? '' : 's'}`, tone: 'slate' });
                    } else {
                      rowName = 'New connection request';
                      subtitle = `Requested ${formatDateTime(subject.request.created_at)}`;
                      pills.push({ label: 'Pending', tone: 'amber' });
                    }
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => { setSelectedHomeownerSubjectId(subject.id); setShowLocalContactForm(false); setHomeownerDetailTab('overview'); }}
                        className={`w-full px-4 py-4 text-left transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <p className={`font-medium text-sm ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{rowName}</p>
                        <p className="text-slate-400 text-xs mt-0.5 truncate">{subtitle || '—'}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {pills.map((p, idx) => {
                            const style = p.tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : p.tone === 'amber' ? 'bg-amber-50 text-amber-700' : p.tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600';
                            return <span key={idx} className={`text-xs px-2 py-0.5 rounded-full ${style}`}>{p.label}</span>;
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* === Right detail panel === */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                {showLocalContactForm ? (
                  <div className="overflow-y-auto p-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 max-w-3xl mx-auto">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-950">Add local customer</h3>
                          <p className="mt-1 text-xs text-slate-500">Save someone who's not on ServSync yet. You can invite them to claim their data later.</p>
                        </div>
                        <button type="button" onClick={() => setShowLocalContactForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Customer name"><input className={inputClass()} value={localContactDraft.display_name} onChange={e => setLocalContactDraft(d => ({ ...d, display_name: e.target.value }))} placeholder="e.g. Becky Thomas" /></Field>
                        <Field label="Phone"><input className={inputClass()} value={localContactDraft.phone} onChange={e => setLocalContactDraft(d => ({ ...d, phone: e.target.value }))} placeholder="(555) 555-5555" /></Field>
                        <Field label="Email"><input className={inputClass()} value={localContactDraft.email} onChange={e => setLocalContactDraft(d => ({ ...d, email: e.target.value }))} placeholder="customer@example.com" /></Field>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Home nickname"><input className={inputClass()} value={localContactDraft.home_nickname} onChange={e => setLocalContactDraft(d => ({ ...d, home_nickname: e.target.value }))} placeholder="Main home" /></Field>
                        <Field label="Address"><input className={inputClass()} value={localContactDraft.address_line1} onChange={e => setLocalContactDraft(d => ({ ...d, address_line1: e.target.value }))} placeholder="Street address" /></Field>
                        <Field label="City"><input className={inputClass()} value={localContactDraft.city} onChange={e => setLocalContactDraft(d => ({ ...d, city: e.target.value }))} /></Field>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="State"><input className={inputClass()} value={localContactDraft.state} onChange={e => setLocalContactDraft(d => ({ ...d, state: e.target.value }))} /></Field>
                        <Field label="ZIP"><input className={inputClass()} value={localContactDraft.zip_code} onChange={e => setLocalContactDraft(d => ({ ...d, zip_code: e.target.value }))} /></Field>
                        <Field label="Home type"><input className={inputClass()} value={localContactDraft.home_type} onChange={e => setLocalContactDraft(d => ({ ...d, home_type: e.target.value }))} placeholder="Single family" /></Field>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Customer notes"><textarea className={`${inputClass()} min-h-[80px] resize-y`} value={localContactDraft.notes} onChange={e => setLocalContactDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Gate code, preferred contact method, etc." /></Field>
                        <Field label="Home notes"><textarea className={`${inputClass()} min-h-[80px] resize-y`} value={localContactDraft.home_notes} onChange={e => setLocalContactDraft(d => ({ ...d, home_notes: e.target.value }))} placeholder="Home details useful for this work." /></Field>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button type="button" onClick={() => void createLocalContact({ autoStartFieldWork: false })} disabled={savingInspection || !localContactDraft.display_name.trim()} className={buttonClass('primary')}>
                          {savingInspection ? 'Saving...' : 'Save local customer'}
                        </button>
                        <button type="button" onClick={() => setShowLocalContactForm(false)} className={buttonClass('secondary')}>Cancel</button>
                      </div>
                    </div>
                  </div>
                ) : !selectedSubject ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-sm text-center px-6">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-3">
                        <Users size={22} />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">Pick a homeowner from the list</p>
                      <p className="mt-2 text-xs text-slate-500">Select someone on the left to see their profile, home details, field work history, service requests, and schedule.</p>
                    </div>
                  </div>
                ) : selectedSubject.kind === 'request' ? (
                  (() => {
                    const reqSubject = selectedSubject.request;
                    const isUpdating = updatingRequestId === reqSubject.id;
                    return (
                      <div className="overflow-y-auto p-6">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 max-w-2xl mx-auto">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Pending connection request</p>
                              <h3 className="mt-2 text-lg font-bold text-slate-950">A homeowner is waiting for your approval</h3>
                              <p className="mt-2 text-sm text-slate-700">Requested {formatDateTime(reqSubject.created_at)}. Their contact details stay private until you accept and they choose what to share.</p>
                            </div>
                            <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-800">{reqSubject.status}</span>
                          </div>
                          <div className="mt-5 flex flex-wrap gap-2">
                            <button type="button" disabled={isUpdating} onClick={() => void updateConnectionRequest(reqSubject, 'active')} className={buttonClass('primary')}>
                              <CheckCircle2 size={16} />
                              {isUpdating ? 'Working...' : 'Accept request'}
                            </button>
                            <button type="button" disabled={isUpdating} onClick={() => void updateConnectionRequest(reqSubject, 'declined')} className={buttonClass('secondary')}>
                              Decline
                            </button>
                          </div>
                          <div className="mt-5">
                            <ConnectionHistory events={connectionHistory[reqSubject.id] || []} />
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const isConn = selectedSubject.kind === 'connection';
                    const conn = isConn ? selectedSubject.connection : null;
                    const localCustomer = !isConn ? (selectedSubject as { kind: 'local'; contact: ContractorLocalContact }).contact : null;
                    const perm = conn ? normalizeSharingPermissions(conn.permissions) : null;
                    const headerName = conn ? (perm!.share_contact ? (conn.display_name || 'Homeowner') : 'Homeowner') : (localCustomer!.display_name || 'Local customer');
                    const localHome = localCustomer?.homes?.[0] ?? null;
                    const headerAddress = conn ? (perm!.share_address ? (conn.home?.address_line1 || '') : 'Address private') : (localHome?.address_line1 || '');
                    const headerCity = conn ? (perm!.share_contact ? `${conn.city || ''}${conn.state ? `, ${conn.state}` : ''}`.trim().replace(/^,\s*/, '') : '') : `${localHome?.city ?? ''}${localHome?.state ? `, ${localHome.state}` : ''}`.trim().replace(/^,\s*/, '');
                    const fieldWork = conn ? fieldWorkForHomeowner(conn.homeowner_user_id) : (localCustomer ? fieldWorkForLocalContact(localCustomer.id) : []);
                    const subjectEstimates = conn
                      ? estimates.filter(estimate => estimate.homeowner_user_id === conn.homeowner_user_id)
                      : localCustomer
                        ? estimates.filter(estimate => estimate.local_contact_id === localCustomer.id)
                        : [];
                    const draftEstimateCount = subjectEstimates.filter(estimate => estimate.status === 'draft').length;
                    const estimateSections: Array<{ id: HomeownerWorkspaceEstimateView; title: string; helper: string; estimates: Estimate[] }> = [
                      {
                        id: 'draft',
                        title: 'Drafts',
                        helper: 'Private estimates you can edit before sending.',
                        estimates: subjectEstimates.filter(estimate => estimate.status === 'draft'),
                      },
                      {
                        id: 'sent',
                        title: 'Sent',
                        helper: 'Estimates waiting on homeowner review.',
                        estimates: subjectEstimates.filter(estimate => estimate.status === 'sent'),
                      },
                      {
                        id: 'accepted',
                        title: 'Accepted',
                        helper: 'Approved estimates that are ready to schedule or turn into work orders.',
                        estimates: subjectEstimates.filter(estimate => estimate.status === 'accepted'),
                      },
                      {
                        id: 'closed',
                        title: 'Closed',
                        helper: 'Declined, expired, or revised estimates.',
                        estimates: subjectEstimates.filter(estimate => ['declined', 'expired', 'revised'].includes(estimate.status)),
                      },
                    ];
                    const selectedEstimateSection = estimateSections.find(section => section.id === homeownerWorkspaceEstimateView) ?? estimateSections[0];
                    const estimateTemplateSearchTerms = normalizeText(estimateTemplateSearch).split(' ').filter(Boolean);
                    const visibleEstimateTemplates = estimateTemplates.filter(template => {
                      if (estimateTemplateSearchTerms.length === 0) return true;
                      const haystack = normalizeText([
                        template.name,
                        template.trade,
                        template.scope,
                        template.notes,
                        template.terms,
                        ...(template.line_items || []).map(line => `${line.description} ${line.line_type} ${line.unit}`),
                      ].filter(Boolean).join(' '));
                      return estimateTemplateSearchTerms.every(term => haystack.includes(term));
                    });
                    const visibleStarterEstimateTemplates = sortedStarterEstimateTemplates.filter(template => {
                      if (estimateTemplateSearchTerms.length === 0) return true;
                      const haystack = normalizeText([
                        template.name,
                        template.trade,
                        template.scope,
                        template.notes,
                        template.terms,
                        ...(template.line_items || []).map(line => `${line.description} ${line.line_type} ${line.unit}`),
                      ].filter(Boolean).join(' '));
                      return estimateTemplateSearchTerms.every(term => haystack.includes(term));
                    });
                    const fwDraftCount = fieldWork.filter(insp => insp.status === 'draft').length;
                    const fwFinalCount = fieldWork.filter(insp => insp.status === 'finalized').length;
                    const connReqs = conn ? serviceRequests.filter(r => r.connection_id === conn.connection_id).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) : [];
                    const activeReqs = connReqs.filter(r => !['closed', 'declined'].includes(r.status));
                    const followUpReqs = activeReqs.filter(contractorRequestNeedsFollowUp);
                    const urgentReqs = activeReqs.filter(r => r.urgency === 'urgent');
                    const closedReqs = connReqs.filter(r => ['closed', 'declined'].includes(r.status));
                    const workspaceRequestSections: Array<{ id: HomeownerWorkspaceRequestView; title: string; helper: string; requests: ServiceRequestSummary[] }> = [
                      {
                        id: 'attention',
                        title: 'Needs attention',
                        helper: 'Homeowner replies, accepted quotes, and requested appointment changes.',
                        requests: followUpReqs,
                      },
                      {
                        id: 'active',
                        title: 'Open requests',
                        helper: 'Active work that is still moving toward scheduling, completion, or closeout.',
                        requests: activeReqs,
                      },
                      {
                        id: 'closed',
                        title: 'Closed / declined',
                        helper: 'Completed, closed, or declined request history.',
                        requests: closedReqs,
                      },
                    ];
                    const selectedWorkspaceRequestSection = workspaceRequestSections.find(section => section.id === homeownerWorkspaceRequestView) ?? workspaceRequestSections[1];
                    const selectedWorkspaceRequest = connReqs.find(request => request.id === selectedHomeownerRequestId) ?? connReqs[0] ?? null;
                    const upcomingAppts = conn ? connReqs
                      .filter(r => r.appointment && (r.appointment.status === 'confirmed' || r.appointment.status === 'proposed'))
                      .sort((a, b) => new Date(a.appointment!.proposed_at).getTime() - new Date(b.appointment!.proposed_at).getTime()) : [];

                    const tabs: { id: HomeownerWorkspaceTab; label: string; badge?: number }[] = [
                      { id: 'overview', label: 'Overview' },
                      { id: 'profile', label: 'Profile' },
                      { id: 'home', label: 'Home' },
                      { id: 'fieldwork', label: 'Work Orders', badge: fwDraftCount },
                      { id: 'estimates', label: 'Estimates', badge: draftEstimateCount },
                      ...(isConn ? [
                        { id: 'requests' as const, label: 'Requests', badge: activeReqs.length },
                        { id: 'schedule' as const, label: 'Schedule', badge: upcomingAppts.length },
                      ] : []),
                    ];
                    const activeTabId = tabs.some(t => t.id === homeownerDetailTab) ? homeownerDetailTab : 'overview';
                    const isStartingWorkOrderForThisSubject = inspectionView === 'new' && (
                      (isConn && conn && inspectionNewDraft.subject_type === 'connected' && inspectionNewDraft.homeowner_user_id === conn.homeowner_user_id)
                      || (!isConn && localCustomer && inspectionNewDraft.subject_type === 'local' && inspectionNewDraft.local_contact_id === localCustomer.id)
                    );
                    const recentFieldWork = fieldWork.slice(0, 3);
                    const recentRequests = connReqs.slice(0, 3);
                    const nextFollowUpRequest = followUpReqs[0] ?? null;
                    const nextOpenRequest = activeReqs[0] ?? null;
                    const nextDraftWorkOrder = fieldWork.find(insp => insp.status === 'draft') ?? null;
                    const nextAppointmentRequest = upcomingAppts[0] ?? null;
                    const workspaceCards: Array<{ label: string; value: string; helper: string; icon: React.ReactNode; tone: 'blue' | 'amber' | 'emerald' | 'slate'; onClick: () => void }> = [
                      ...(isConn ? [
                        {
                          label: 'Requests',
                          value: String(activeReqs.length),
                          helper: followUpReqs.length > 0 ? `${followUpReqs.length} need follow-up` : urgentReqs.length > 0 ? `${urgentReqs.length} urgent` : 'Open homeowner requests',
                          icon: <MessageSquare size={16} />,
                          tone: followUpReqs.length > 0 ? 'amber' as const : 'blue' as const,
                          onClick: () => {
                            setSelectedHomeownerRequestId(followUpReqs[0]?.id ?? activeReqs[0]?.id ?? connReqs[0]?.id ?? null);
                            setHomeownerWorkspaceRequestView(followUpReqs.length > 0 ? 'attention' : 'active');
                            setHomeownerDetailTab('requests');
                          },
                        },
                      ] : []),
                      {
                        label: 'Work orders',
                        value: String(fieldWork.length),
                        helper: `${fwDraftCount} draft${fwDraftCount === 1 ? '' : 's'} · ${fwFinalCount} filed`,
                        icon: <ClipboardCheck size={16} />,
                        tone: fwDraftCount > 0 ? 'amber' : 'emerald',
                        onClick: () => setHomeownerDetailTab('fieldwork'),
                      },
                      {
                        label: 'Estimates',
                        value: String(subjectEstimates.length),
                        helper: `${draftEstimateCount} draft${draftEstimateCount === 1 ? '' : 's'} · ${subjectEstimates.filter(estimate => estimate.status === 'accepted').length} accepted`,
                        icon: <Receipt size={16} />,
                        tone: subjectEstimates.some(estimate => estimate.status === 'accepted') ? 'emerald' : draftEstimateCount > 0 ? 'amber' : 'slate',
                        onClick: () => {
                          setHomeownerWorkspaceEstimateView(subjectEstimates.some(estimate => estimate.status === 'accepted') ? 'accepted' : draftEstimateCount > 0 ? 'draft' : 'sent');
                          setHomeownerDetailTab('estimates');
                        },
                      },
                      ...(isConn ? [
                        {
                          label: 'Schedule',
                          value: String(upcomingAppts.length),
                          helper: 'Upcoming/proposed appointments',
                          icon: <Calendar size={16} />,
                          tone: upcomingAppts.length > 0 ? 'blue' as const : 'slate' as const,
                          onClick: () => setHomeownerDetailTab('schedule'),
                        },
                      ] : []),
                      {
                        label: isConn ? 'Home profile' : 'Local profile',
                        value: isConn && conn?.home ? 'Shared' : localHome ? 'Saved' : 'Basic',
                        helper: isConn ? 'Contact and home details' : 'Local customer details',
                        icon: <Home size={16} />,
                        tone: 'slate',
                        onClick: () => setHomeownerDetailTab(isConn ? 'home' : 'profile'),
                      },
                    ];

                    return (
                      <>
                        <div className="bg-white border-b border-slate-200 px-6 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h2 className="font-bold text-slate-950 text-xl">{headerName}</h2>
                              <p className="mt-1 text-sm text-slate-500">{headerAddress || (conn ? 'Address not shared' : 'No address on file')}</p>
                              {headerCity && <p className="text-xs text-slate-400">{headerCity}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {isConn && conn && (
                                <button type="button" onClick={() => { beginFieldWorkForHomeowner(conn); setHomeownerDetailTab('fieldwork'); }} className={buttonClass('primary')}>
                                  <ClipboardCheck size={14} />
                                  Create work order
                                </button>
                              )}
                              {!isConn && localCustomer && (
                                <>
                                  <button type="button" onClick={() => { beginFieldWorkForLocalContact(localCustomer); setHomeownerDetailTab('fieldwork'); }} className={buttonClass('primary')}>
                                    <ClipboardCheck size={14} />
                                    Create work order
                                  </button>
                                  <button type="button" disabled className={buttonClass('secondary')} title="Invite-to-claim flow coming soon.">
                                    Invite to claim
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 mt-4 flex-wrap">
                            {tabs.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setHomeownerDetailTab(t.id)}
                                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTabId === t.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                              >
                                {t.label}
                                {t.badge && t.badge > 0 ? (
                                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTabId === t.id ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700'}`}>{t.badge}</span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                          <div className="mb-5 grid gap-3 max-w-5xl sm:grid-cols-2 xl:grid-cols-4">
                            {workspaceCards.map(card => {
                              const toneClass = card.tone === 'amber'
                                ? 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300'
                                : card.tone === 'emerald'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300'
                                  : card.tone === 'blue'
                                    ? 'border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300'
                                    : 'border-slate-200 bg-white text-slate-800 hover:border-blue-300';
                              return (
                                <button
                                  key={card.label}
                                  type="button"
                                  onClick={card.onClick}
                                  className={`rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${toneClass}`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75">{card.label}</p>
                                      <p className="mt-1 text-2xl font-bold">{card.value}</p>
                                    </div>
                                    <span className="rounded-xl bg-white/75 p-2 shadow-sm">{card.icon}</span>
                                  </div>
                                  <p className="mt-2 text-xs font-medium opacity-80">{card.helper}</p>
                                </button>
                              );
                            })}
                          </div>

                          {activeTabId === 'overview' && (
                            <div className="space-y-4 max-w-5xl">
                              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Next best action</p>
                                    <h3 className="mt-2 text-lg font-bold text-slate-950">
                                      {nextFollowUpRequest
                                        ? 'Follow up on the latest homeowner response'
                                        : nextOpenRequest
                                          ? 'Review the active service request'
                                          : nextDraftWorkOrder
                                            ? 'Continue the draft work order'
                                            : nextAppointmentRequest
                                              ? 'Review the next appointment'
                                              : 'Create a work order when you are ready'}
                                    </h3>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {nextFollowUpRequest
                                        ? `${nextFollowUpRequest.title} was updated ${formatDateTime(nextFollowUpRequest.updated_at)}.`
                                        : nextOpenRequest
                                          ? `${nextOpenRequest.title} is still open.`
                                          : nextDraftWorkOrder
                                            ? `${nextDraftWorkOrder.name} is saved as a draft.`
                                            : nextAppointmentRequest?.appointment
                                              ? `${nextAppointmentRequest.title} is set for ${formatDateTime(nextAppointmentRequest.appointment.proposed_at)}.`
                                              : 'This workspace is ready for profile review, service requests, work orders, and appointments.'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (nextFollowUpRequest || nextOpenRequest) {
                                        setSelectedHomeownerRequestId((nextFollowUpRequest ?? nextOpenRequest)!.id);
                                        setHomeownerDetailTab('requests');
                                      } else if (nextDraftWorkOrder) {
                                        openInspection(nextDraftWorkOrder, { stayInHomeownerWorkspace: true });
                                      } else if (nextAppointmentRequest) {
                                        setHomeownerDetailTab('schedule');
                                      } else if (conn) {
                                        beginFieldWorkForHomeowner(conn);
                                        setHomeownerDetailTab('fieldwork');
                                      } else if (localCustomer) {
                                        beginFieldWorkForLocalContact(localCustomer);
                                        setHomeownerDetailTab('fieldwork');
                                      }
                                    }}
                                    className={buttonClass('primary')}
                                  >
                                    <ArrowRight size={15} />
                                    Open next step
                                  </button>
                                </div>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                {isConn && (
                                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div>
                                        <h3 className="font-bold text-slate-950">Recent requests</h3>
                                        <p className="mt-1 text-xs text-slate-500">{activeReqs.length} active request{activeReqs.length === 1 ? '' : 's'}</p>
                                      </div>
                                      <button type="button" onClick={() => setHomeownerDetailTab('requests')} className="text-xs font-semibold text-blue-700 hover:text-blue-800">View all</button>
                                    </div>
                                    {recentRequests.length === 0 ? (
                                      <EmptyState text="No service requests from this homeowner yet." />
                                    ) : (
                                      <div className="space-y-2">
                                        {recentRequests.map(request => (
                                          <button
                                            key={request.id}
                                            type="button"
                                            onClick={() => {
                                              setSelectedHomeownerRequestId(request.id);
                                              setHomeownerWorkspaceRequestView(['closed', 'declined'].includes(request.status) ? 'closed' : contractorRequestNeedsFollowUp(request) ? 'attention' : 'active');
                                              setHomeownerDetailTab('requests');
                                            }}
                                            className={`w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 border-l-4 ${serviceRequestStatusAccent(request.status)}`}
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="min-w-0">
                                                <p className="font-semibold text-slate-900">{request.title}</p>
                                                <p className="mt-1 text-xs text-slate-500">{serviceRequestStatusLabel(request.status)} · {request.category} · {formatDateTime(request.updated_at)}</p>
                                              </div>
                                              {contractorRequestNeedsFollowUp(request) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Follow-up</span>}
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                      <h3 className="font-bold text-slate-950">Recent work orders</h3>
                                      <p className="mt-1 text-xs text-slate-500">{fwDraftCount} draft{fwDraftCount === 1 ? '' : 's'} · {fwFinalCount} filed</p>
                                    </div>
                                    <button type="button" onClick={() => setHomeownerDetailTab('fieldwork')} className="text-xs font-semibold text-blue-700 hover:text-blue-800">View all</button>
                                  </div>
                                  {recentFieldWork.length === 0 ? (
                                    <EmptyState text="No work orders yet for this workspace." />
                                  ) : (
                                    <div className="space-y-2">
                                      {recentFieldWork.map(insp => (
                                        <button
                                          key={insp.id}
                                          type="button"
                                          onClick={() => openInspection(insp, { stayInHomeownerWorkspace: true })}
                                          className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="font-semibold text-slate-900">{insp.name}</p>
                                              <p className="mt-1 text-xs text-slate-500">{insp.status === 'draft' ? 'Draft' : 'Filed'} · Updated {formatDateTime(insp.updated_at)}</p>
                                            </div>
                                            <ArrowRight size={15} className="shrink-0 text-slate-400" />
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {isConn && (
                                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div>
                                        <h3 className="font-bold text-slate-950">Schedule</h3>
                                        <p className="mt-1 text-xs text-slate-500">{upcomingAppts.length} appointment item{upcomingAppts.length === 1 ? '' : 's'}</p>
                                      </div>
                                      <button type="button" onClick={() => setHomeownerDetailTab('schedule')} className="text-xs font-semibold text-blue-700 hover:text-blue-800">Open schedule</button>
                                    </div>
                                    {upcomingAppts.length === 0 ? (
                                      <EmptyState text="No appointments are scheduled or proposed." />
                                    ) : (
                                      <div className="space-y-2">
                                        {upcomingAppts.slice(0, 3).map(request => (
                                          <button key={request.id} type="button" onClick={() => setHomeownerDetailTab('schedule')} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50">
                                            <p className="font-semibold text-slate-900">{request.title}</p>
                                            <p className="mt-1 text-xs text-slate-500">{request.appointment ? formatDateTime(request.appointment.proposed_at) : 'Appointment'} · {request.appointment?.status ?? 'appointment'}</p>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {activeTabId === 'profile' && (
                            <div className="space-y-4 max-w-3xl">
                              <div className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-2 gap-4">
                                {conn && perm && (
                                  <>
                                    <SharedField label="Homeowner name" value={conn.display_name} allowed={perm.share_contact} />
                                    <SharedField label="Phone" value={conn.phone} allowed={perm.share_contact} />
                                    <SharedField label="City" value={conn.city} allowed={perm.share_contact} />
                                    <SharedField label="State" value={conn.state} allowed={perm.share_contact} />
                                    <div>
                                      <p className="text-xs text-slate-400 font-medium mb-0.5">Status</p>
                                      <p className="text-sm text-slate-800 font-medium capitalize">{conn.status}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-slate-400 font-medium mb-0.5">Source</p>
                                      <p className="text-sm text-slate-800 font-medium">{connectionSourceLabel(conn.source)}</p>
                                    </div>
                                  </>
                                )}
                                {localCustomer && (
                                  <>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Customer name</p><p className="text-sm text-slate-800 font-medium">{localCustomer.display_name || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Phone</p><p className="text-sm text-slate-800 font-medium">{localCustomer.phone || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Email</p><p className="text-sm text-slate-800 font-medium">{localCustomer.email || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Status</p><p className="text-sm text-slate-800 font-medium">Local (not connected)</p></div>
                                    {localCustomer.notes && (
                                      <div className="col-span-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                                        <p className="text-xs font-semibold text-yellow-700 mb-1">Customer notes</p>
                                        <p className="text-sm text-yellow-800 whitespace-pre-wrap">{localCustomer.notes}</p>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              {conn && perm && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-3">Shared access</p>
                                  <PermissionChips permissions={perm} />
                                  <p className="mt-3 text-xs text-slate-500">The homeowner controls these settings. Hidden fields aren't shown to your business.</p>
                                </div>
                              )}
                              {conn && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-3">Connection history</p>
                                  <ConnectionHistory events={connectionHistory[conn.connection_id] || []} />
                                </div>
                              )}
                            </div>
                          )}

                          {activeTabId === 'home' && (
                            <div className="space-y-4 max-w-3xl">
                              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                <div className="flex items-center gap-2 mb-4">
                                  <Home size={18} className="text-blue-700" />
                                  <h3 className="font-bold text-slate-950">Home details</h3>
                                </div>
                                {conn && perm && (
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <SharedField label="Home nickname" value={conn.home?.nickname} allowed={perm.share_home_overview} />
                                    <SharedField label="Home type" value={conn.home?.home_type} allowed={perm.share_home_overview} />
                                    <SharedField label="Year built" value={conn.home?.year_built} allowed={perm.share_home_overview} />
                                    <SharedField label="Square feet" value={conn.home?.square_feet} allowed={perm.share_home_overview} />
                                    <SharedField label="Address" value={conn.home?.address_line1} allowed={perm.share_address} />
                                    <SharedField label="ZIP" value={conn.home?.zip_code} allowed={perm.share_home_overview} />
                                    <div className="sm:col-span-2">
                                      <SharedField label="Home notes" value={conn.home?.notes} allowed={perm.share_home_overview} />
                                    </div>
                                  </div>
                                )}
                                {localCustomer && localHome && (
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Home nickname</p><p className="text-sm text-slate-800 font-medium">{localHome.nickname || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Home type</p><p className="text-sm text-slate-800 font-medium">{localHome.home_type || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Year built</p><p className="text-sm text-slate-800 font-medium">{localHome.year_built || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Square feet</p><p className="text-sm text-slate-800 font-medium">{localHome.square_feet || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">Address</p><p className="text-sm text-slate-800 font-medium">{localHome.address_line1 || '—'}</p></div>
                                    <div><p className="text-xs text-slate-400 font-medium mb-0.5">ZIP</p><p className="text-sm text-slate-800 font-medium">{localHome.zip_code || '—'}</p></div>
                                    {localHome.notes && <div className="sm:col-span-2"><p className="text-xs text-slate-400 font-medium mb-0.5">Home notes</p><p className="text-sm text-slate-800 whitespace-pre-wrap">{localHome.notes}</p></div>}
                                  </div>
                                )}
                                {localCustomer && !localHome && <EmptyState text="No home details on file for this local customer." />}
                              </div>
                            </div>
                          )}

                          {activeTabId === 'fieldwork' && (
                            <div className="space-y-4 max-w-3xl">
                              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <h3 className="font-bold text-slate-950">Work orders</h3>
                                    <p className="mt-1 text-xs text-slate-500">{fwDraftCount} draft{fwDraftCount === 1 ? '' : 's'} · {fwFinalCount} filed report{fwFinalCount === 1 ? '' : 's'}</p>
                                  </div>
                                  <button type="button" onClick={() => { if (isConn && conn) { beginFieldWorkForHomeowner(conn); } else if (localCustomer) { beginFieldWorkForLocalContact(localCustomer); } }} className={buttonClass('primary')}>
                                    <Plus size={14} />
                                    Create work order
                                  </button>
                                </div>
                                {isStartingWorkOrderForThisSubject && (
                                  <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">New work order</p>
                                        <p className="mt-1 text-sm text-blue-900">Choose the work type and template before creating the draft for this workspace.</p>
                                      </div>
                                      <button type="button" onClick={() => setInspectionView('list')} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
                                        Cancel
                                      </button>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <Field label="Work order type">
                                        <select className={inputClass()} value={inspectionNewDraft.workflow_kind} onChange={e => {
                                          const nextKind = e.target.value as FieldWorkflowKind;
                                          const nextStarter = sortedServSyncFieldWorkTemplates.find(t => t.kind === nextKind) ?? sortedServSyncFieldWorkTemplates[0];
                                          const subjectName = conn?.display_name || localCustomer?.display_name || 'Customer';
                                          setInspectionNewDraft(d => ({
                                            ...d,
                                            workflow_kind: nextKind,
                                            starter_template_id: d.template_id ? d.starter_template_id : nextStarter?.id ?? d.starter_template_id,
                                            name: `${nextStarter?.name || FIELD_WORK_KIND_LABEL[nextKind]} — ${subjectName} — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
                                          }));
                                        }}>
                                          {Object.entries(FIELD_WORK_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                        </select>
                                      </Field>
                                      <Field label="Work order name">
                                        <input className={inputClass()} value={inspectionNewDraft.name} onChange={e => setInspectionNewDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. HVAC seasonal inspection" />
                                      </Field>
                                    </div>
                                    <div className="mt-3">
                                      <Field label="Template">
                                        <select className={inputClass()} value={inspectionNewDraft.template_id ? `custom:${inspectionNewDraft.template_id}` : `starter:${inspectionNewDraft.starter_template_id}`} onChange={e => {
                                          const [source, id] = e.target.value.split(':');
                                          const starter = SERVSYNC_FIELD_WORK_TEMPLATES.find(t => t.id === id);
                                          setInspectionNewDraft(d => ({
                                            ...d,
                                            template_id: source === 'custom' ? id : '',
                                            starter_template_id: source === 'starter' ? id : d.starter_template_id,
                                            workflow_kind: source === 'starter' && starter ? starter.kind : d.workflow_kind,
                                          }));
                                        }}>
                                          <optgroup label="ServSync starter templates">
                                            {sortedServSyncFieldWorkTemplates.map(t => (
                                              <option key={t.id} value={`starter:${t.id}`}>
                                                {starterTemplateRecommendedForContractor(t.trade) ? 'Recommended — ' : ''}{t.name} ({FIELD_WORK_KIND_LABEL[t.kind]})
                                              </option>
                                            ))}
                                          </optgroup>
                                          {inspectionTemplates.length > 0 && (
                                            <optgroup label="Your templates">
                                              {inspectionTemplates.map(t => <option key={t.id} value={`custom:${t.id}`}>{t.name}</option>)}
                                            </optgroup>
                                          )}
                                        </select>
                                      </Field>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void startNewInspection()}
                                        disabled={savingInspection || !inspectionNewDraft.name.trim() || (inspectionNewDraft.subject_type === 'connected' ? !inspectionNewDraft.homeowner_user_id : !inspectionNewDraft.local_contact_id)}
                                        className={buttonClass('primary')}
                                      >
                                        {savingInspection ? 'Creating...' : 'Create work order'}
                                      </button>
                                      <button type="button" onClick={() => setInspectionView('list')} className={buttonClass('secondary')}>Cancel</button>
                                    </div>
                                  </div>
                                )}
                                {fieldWork.length === 0 ? (
                                  <EmptyState text="No field work yet for this homeowner." />
                                ) : (
                                  <div className="space-y-2">
                                    {fieldWork.map(insp => {
                                      const issues = insp.rooms_with_findings.flatMap(r => r.findings).filter(f => f.status === 'Urgent' || f.status === 'Needs Repair').length;
                                      return (
                                        <button key={insp.id} type="button" onClick={() => openInspection(insp, { stayInHomeownerWorkspace: true })} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-semibold text-slate-900 truncate">{insp.name}</p>
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${insp.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                  {insp.status === 'draft' ? 'Draft' : 'Filed'}
                                                </span>
                                                {issues > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{issues} open</span>}
                                              </div>
                                              <p className="mt-1 text-xs text-slate-500">Updated {formatDateTime(insp.updated_at)}</p>
                                            </div>
                                            <ArrowRight size={16} className="shrink-0 text-slate-400" />
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {activeTabId === 'estimates' && (
                            <div className="space-y-4 max-w-4xl">
                              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h3 className="font-bold text-slate-950">Estimates</h3>
                                    <p className="mt-1 text-xs text-slate-500">
                                      Draft flexible estimates now. Trade-specific templates can build on this later.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const subjectName = conn?.display_name || localCustomer?.display_name || 'Customer';
                                      setEditingEstimateId(null);
                                      setEstimateDraft(createBlankEstimateDraft({
                                        title: `Estimate — ${subjectName} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                                      }));
                                      setEstimateAssistantText('');
                                      setEstimateAssistantNotice('');
                                      setEstimateComposerOpen(true);
                                    }}
                                    className={buttonClass('primary')}
                                  >
                                    <Plus size={14} />
                                    Create estimate
                                  </button>
                                </div>

                                {estimateComposerOpen && (
                                  <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">{editingEstimateId ? 'Edit estimate draft' : 'Estimate draft'}</p>
                                        <p className="mt-1 text-sm text-blue-900">Start with simple line items. This can become HVAC, plumbing, electrical, or custom templates later.</p>
                                      </div>
                                      <button type="button" onClick={() => { setEstimateComposerOpen(false); setEditingEstimateId(null); }} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
                                        Cancel
                                      </button>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <Field label="Estimate title">
                                        <input className={inputClass()} value={estimateDraft.title} onChange={e => setEstimateDraft(d => ({ ...d, title: e.target.value }))} />
                                      </Field>
                                      {connReqs.length > 0 && (
                                        <Field label="Attach to request (optional)">
                                          <select className={inputClass()} value={estimateDraft.service_request_id} onChange={e => setEstimateDraft(d => ({ ...d, service_request_id: e.target.value }))}>
                                            <option value="">No service request</option>
                                            {connReqs.map(request => <option key={request.id} value={request.id}>{request.title}</option>)}
                                          </select>
                                        </Field>
                                      )}
                                      {fieldWork.length > 0 && (
                                        <Field label="Attach to work order (optional)">
                                          <select className={inputClass()} value={estimateDraft.inspection_id} onChange={e => setEstimateDraft(d => ({ ...d, inspection_id: e.target.value }))}>
                                            <option value="">No work order</option>
                                            {fieldWork.map(work => <option key={work.id} value={work.id}>{work.name}</option>)}
                                          </select>
                                        </Field>
                                      )}
                                    </div>
                                    <div className="mt-4 rounded-2xl border border-blue-200 bg-white p-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <Sparkles size={16} className="text-blue-700" />
                                            <p className="text-sm font-bold text-slate-950">Smart estimate assistant</p>
                                          </div>
                                          <p className="mt-1 text-xs text-slate-500">
                                            Type or speak the work needed. ServSync will draft scope and line items for you to review.
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={startEstimateAssistantSpeech}
                                          disabled={estimateAssistantListening}
                                          className={buttonClass('secondary')}
                                        >
                                          <Mic size={14} />
                                          {estimateAssistantListening ? 'Listening...' : 'Speak'}
                                        </button>
                                      </div>
                                      <div className="mt-3">
                                        <Field label="Describe the estimate">
                                          <textarea
                                            className={`${inputClass()} min-h-[96px] resize-y`}
                                            value={estimateAssistantText}
                                            onChange={event => setEstimateAssistantText(event.target.value)}
                                            placeholder="Example: Replace 2 bathroom outlets at $85 each, add trip fee $75, patch sheetrock damage in bedroom for $350."
                                          />
                                        </Field>
                                      </div>
                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <button type="button" onClick={applySmartEstimateDraft} className={buttonClass('primary')}>
                                          <Sparkles size={14} />
                                          Generate draft
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEstimateAssistantText('');
                                            setEstimateAssistantNotice('');
                                          }}
                                          className={buttonClass('secondary')}
                                        >
                                          Clear
                                        </button>
                                        <p className="text-xs text-slate-500">Pricing is editable and should be reviewed before sending.</p>
                                      </div>
                                      {estimateAssistantNotice && (
                                        <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
                                          {estimateAssistantNotice}
                                        </p>
                                      )}
                                    </div>
                                    <div className="mt-3">
                                      <Field label="Scope of work">
                                        <textarea className={inputClass()} rows={3} value={estimateDraft.scope} onChange={e => setEstimateDraft(d => ({ ...d, scope: e.target.value }))} placeholder="Describe what this estimate covers." />
                                      </Field>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-bold text-slate-950">Line items</p>
                                        <button
                                          type="button"
                                          onClick={() => setEstimateDraft(d => ({ ...d, line_items: [...d.line_items, createEstimateLineDraft()] }))}
                                          className={buttonClass('secondary')}
                                        >
                                          <Plus size={14} />
                                          Add line
                                        </button>
                                      </div>
                                      {estimateDraft.line_items.map((line, index) => (
                                        <div key={line.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                          <div className="grid gap-3 lg:grid-cols-[8rem_1fr_5rem_5rem_7rem_6rem_auto] lg:items-end">
                                            <Field label="Type">
                                              <select
                                                className={inputClass()}
                                                value={line.line_type}
                                                onChange={e => setEstimateDraft(d => ({
                                                  ...d,
                                                  line_items: d.line_items.map(item => item.id === line.id ? { ...item, line_type: e.target.value as EstimateLineType } : item),
                                                }))}
                                              >
                                                {(['labor', 'material', 'equipment', 'fee', 'other'] as EstimateLineType[]).map(type => (
                                                  <option key={type} value={type}>{type}</option>
                                                ))}
                                              </select>
                                            </Field>
                                            <Field label="Description">
                                              <input
                                                className={inputClass()}
                                                value={line.description}
                                                onChange={e => setEstimateDraft(d => ({
                                                  ...d,
                                                  line_items: d.line_items.map(item => item.id === line.id ? { ...item, description: e.target.value } : item),
                                                }))}
                                                placeholder="Labor, material, trip fee..."
                                              />
                                            </Field>
                                            <Field label="Qty">
                                              <input
                                                className={inputClass()}
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={line.quantity}
                                                onChange={e => setEstimateDraft(d => ({
                                                  ...d,
                                                  line_items: d.line_items.map(item => item.id === line.id ? { ...item, quantity: e.target.value } : item),
                                                }))}
                                              />
                                            </Field>
                                            <Field label="Unit">
                                              <input
                                                className={inputClass()}
                                                value={line.unit}
                                                onChange={e => setEstimateDraft(d => ({
                                                  ...d,
                                                  line_items: d.line_items.map(item => item.id === line.id ? { ...item, unit: e.target.value } : item),
                                                }))}
                                              />
                                            </Field>
                                            <Field label="Unit price">
                                              <input
                                                className={inputClass()}
                                                value={line.unit_price}
                                                onChange={e => setEstimateDraft(d => ({
                                                  ...d,
                                                  line_items: d.line_items.map(item => item.id === line.id ? { ...item, unit_price: e.target.value } : item),
                                                }))}
                                                placeholder="$0.00"
                                              />
                                            </Field>
                                            <div>
                                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
                                              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950">
                                                ${(estimateLineTotalCents(line) / 100).toFixed(2)}
                                              </p>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => setEstimateDraft(d => ({
                                                ...d,
                                                line_items: d.line_items.length === 1 ? [createEstimateLineDraft()] : d.line_items.filter(item => item.id !== line.id),
                                              }))}
                                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:text-red-600"
                                              aria-label={`Remove estimate line ${index + 1}`}
                                            >
                                              <Trash2 size={15} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                      <Field label="Notes / exclusions">
                                        <textarea className={inputClass()} rows={3} value={estimateDraft.notes} onChange={e => setEstimateDraft(d => ({ ...d, notes: e.target.value }))} placeholder="What is not included, assumptions, customer choices..." />
                                      </Field>
                                      <Field label="Terms">
                                        <textarea className={inputClass()} rows={3} value={estimateDraft.terms} onChange={e => setEstimateDraft(d => ({ ...d, terms: e.target.value }))} />
                                      </Field>
                                    </div>
                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                                      <p className="text-sm font-semibold text-slate-600">Draft total</p>
                                      <p className="text-2xl font-bold text-slate-950">${(estimateTotalCents(estimateDraft.line_items) / 100).toFixed(2)}</p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void saveEstimateDraft({
                                          homeownerUserId: conn?.homeowner_user_id ?? null,
                                          localContactId: localCustomer?.id ?? null,
                                        })}
                                        disabled={savingEstimate}
                                        className={buttonClass('primary')}
                                      >
                                        <Receipt size={15} />
                                        {savingEstimate ? 'Saving...' : editingEstimateId ? 'Update estimate draft' : 'Save estimate draft'}
                                      </button>
                                      <button type="button" onClick={() => { setEstimateComposerOpen(false); setEditingEstimateId(null); }} disabled={savingEstimate} className={buttonClass('secondary')}>
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="mt-5 space-y-2">
                                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                                    <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_18rem] lg:items-end">
                                      <div>
                                        <p className="text-sm font-bold text-slate-950">ServSync estimate starters</p>
                                        <p className="mt-1 text-xs text-slate-600">
                                          These starter estimates are limited to the service categories checked in your Business Profile.
                                        </p>
                                      </div>
                                      <Field label="Search estimate templates">
                                        <input
                                          className={inputClass()}
                                          value={estimateTemplateSearch}
                                          onChange={event => setEstimateTemplateSearch(event.target.value)}
                                          placeholder="Search trade, scope, line item..."
                                        />
                                      </Field>
                                    </div>
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                                        {visibleStarterEstimateTemplates.length} starter{visibleStarterEstimateTemplates.length === 1 ? '' : 's'}
                                      </span>
                                      {estimateTemplateSearch && (
                                        <button
                                          type="button"
                                          onClick={() => setEstimateTemplateSearch('')}
                                          className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                                        >
                                          Clear search
                                        </button>
                                      )}
                                    </div>
                                    {visibleStarterEstimateTemplates.length === 0 ? (
                                      <EmptyState text="No starter estimate templates match that search." />
                                    ) : (
                                      <div className="grid gap-2 md:grid-cols-2">
                                        {visibleStarterEstimateTemplates.map(template => {
                                          const recommended = starterTemplateRecommendedForContractor(template.trade);
                                          return (
                                            <div key={template.id} className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                  <p className="font-semibold text-slate-950">{template.name}</p>
                                                  <p className="mt-1 text-xs text-slate-500">
                                                    {template.line_items.length} starter line item{template.line_items.length === 1 ? '' : 's'}
                                                  </p>
                                                </div>
                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${recommended ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                  {recommended ? 'Recommended' : template.trade}
                                                </span>
                                              </div>
                                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{template.scope}</p>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const subjectName = conn?.display_name || localCustomer?.display_name || 'Customer';
                                                  setEditingEstimateId(null);
                                                  setEstimateDraft(estimateDraftFromStarterTemplate(template, subjectName));
                                                  setEstimateAssistantText('');
                                                  setEstimateAssistantNotice('');
                                                  setEstimateComposerOpen(true);
                                                }}
                                                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                              >
                                                Use starter
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  {estimateTemplates.length > 0 && (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="mb-3">
                                        <div>
                                          <p className="text-sm font-bold text-slate-950">Saved estimate templates</p>
                                          <p className="mt-1 text-xs text-slate-500">Start faster with a reusable scope, terms, and line-item structure.</p>
                                        </div>
                                      </div>
                                      <div className="mb-3 flex items-center justify-between gap-2">
                                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                                          {visibleEstimateTemplates.length} shown of {estimateTemplates.length}
                                        </span>
                                        {estimateTemplateSearch && (
                                          <button
                                            type="button"
                                            onClick={() => setEstimateTemplateSearch('')}
                                            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                                          >
                                            Clear search
                                          </button>
                                        )}
                                      </div>
                                      {visibleEstimateTemplates.length === 0 ? (
                                        <EmptyState text="No saved templates match that search." />
                                      ) : (
                                      <div className="space-y-2">
                                        {visibleEstimateTemplates.map(template => (
                                          <div key={template.id} className="rounded-xl border border-slate-200 bg-white">
                                            <button
                                              type="button"
                                              onClick={() => setExpandedEstimateTemplateId(expandedEstimateTemplateId === template.id ? null : template.id)}
                                              className="flex w-full items-start justify-between gap-3 p-3 text-left transition hover:bg-blue-50"
                                            >
                                              <div>
                                                <p className="font-semibold text-slate-950">{template.name}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                  {template.line_items?.length ?? 0} line item{(template.line_items?.length ?? 0) === 1 ? '' : 's'}
                                                  {template.trade ? ` · ${template.trade}` : ''}
                                                  {' · '}Updated {formatDateTime(template.updated_at)}
                                                </p>
                                              </div>
                                              {expandedEstimateTemplateId === template.id ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                                            </button>
                                            {expandedEstimateTemplateId === template.id && (
                                              <div className="border-t border-slate-200 p-3">
                                                {template.scope && (
                                                  <p className="line-clamp-3 text-sm text-slate-600">{template.scope}</p>
                                                )}
                                                {template.line_items?.length > 0 && (
                                                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                                                    {template.line_items
                                                      .slice()
                                                      .sort((a, b) => a.sort_order - b.sort_order)
                                                      .slice(0, 4)
                                                      .map((line, index) => (
                                                        <div key={`${template.id}-${index}`} className="grid gap-2 border-b border-slate-200 px-3 py-2 text-xs last:border-b-0 sm:grid-cols-[1fr_5rem_6rem]">
                                                          <span className="font-medium text-slate-800">{line.description || 'Line item'}</span>
                                                          <span className="text-slate-500">{line.quantity} {line.unit}</span>
                                                          <span className="font-semibold text-slate-900 sm:text-right">{formatMoney(Math.round(line.quantity * line.unit_price_cents))}</span>
                                                        </div>
                                                      ))}
                                                    {template.line_items.length > 4 && (
                                                      <p className="px-3 py-2 text-xs font-medium text-slate-500">+ {template.line_items.length - 4} more line item{template.line_items.length - 4 === 1 ? '' : 's'}</p>
                                                    )}
                                                  </div>
                                                )}
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const subjectName = conn?.display_name || localCustomer?.display_name || 'Customer';
                                                      setEditingEstimateId(null);
                                                      setEstimateDraft(estimateDraftFromTemplate(template, subjectName));
                                                      setEstimateAssistantText('');
                                                      setEstimateAssistantNotice('');
                                                      setEstimateComposerOpen(true);
                                                    }}
                                                    className={buttonClass('primary')}
                                                  >
                                                    <ArrowRight size={15} />
                                                    Use template
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => void renameEstimateTemplate(template)}
                                                    disabled={renamingEstimateTemplateId === template.id || deletingEstimateTemplateId === template.id}
                                                    className={buttonClass('secondary')}
                                                  >
                                                    {renamingEstimateTemplateId === template.id ? 'Renaming...' : 'Rename'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => void deleteEstimateTemplate(template)}
                                                    disabled={deletingEstimateTemplateId === template.id || renamingEstimateTemplateId === template.id}
                                                    className={buttonClass('danger')}
                                                  >
                                                    <Trash2 size={15} />
                                                    {deletingEstimateTemplateId === template.id ? 'Deleting...' : 'Delete'}
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                      )}
                                    </div>
                                  )}
                                  {subjectEstimates.length === 0 ? (
                                    <EmptyState text="No estimates have been created for this workspace yet." />
                                  ) : (
                                    <>
                                      <div className="grid gap-2 sm:grid-cols-4">
                                        {estimateSections.map(section => {
                                          const active = homeownerWorkspaceEstimateView === section.id;
                                          return (
                                            <button
                                              key={section.id}
                                              type="button"
                                              onClick={() => setHomeownerWorkspaceEstimateView(section.id)}
                                              className={`rounded-xl border px-3 py-3 text-left transition ${
                                                active
                                                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                                  : section.id === 'accepted' && section.estimates.length > 0
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-300'
                                                    : 'border-slate-200 bg-white text-slate-950 hover:border-blue-300 hover:bg-blue-50'
                                              }`}
                                            >
                                              <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${active ? 'text-blue-50' : 'text-slate-500'}`}>{section.title}</p>
                                              <p className="mt-1 text-xl font-bold">{section.estimates.length}</p>
                                            </button>
                                          );
                                        })}
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{selectedEstimateSection.title}</p>
                                        <p className="mt-1 text-sm text-slate-600">{selectedEstimateSection.helper}</p>
                                      </div>
                                      {selectedEstimateSection.estimates.length === 0 ? (
                                        <EmptyState text={`No ${selectedEstimateSection.title.toLowerCase()} for this workspace.`} />
                                      ) : selectedEstimateSection.estimates.map(estimate => {
                                      const lineCount = estimate.line_items?.length ?? 0;
                                      return (
                                        <div key={estimate.id} className={`rounded-xl border bg-white p-4 ${estimate.status === 'accepted' ? 'border-emerald-200 ring-2 ring-emerald-50' : 'border-slate-200'}`}>
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-semibold text-slate-950">{estimate.title}</p>
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estimate.status === 'draft' ? 'bg-amber-100 text-amber-700' : estimate.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                  {estimate.status}
                                                </span>
                                              </div>
                                              <p className="mt-1 text-xs text-slate-500">
                                                {lineCount} line item{lineCount === 1 ? '' : 's'} · Updated {formatDateTime(estimate.updated_at)}
                                              </p>
                                              {estimate.scope && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{estimate.scope}</p>}
                                            </div>
                                            <p className="text-xl font-bold text-slate-950">${(estimate.total_cents / 100).toFixed(2)}</p>
                                          </div>
                                          <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() => downloadEstimatePdf(estimate, {
                                                contractorName: contractor?.business_name || contractorDraft.business_name || 'Contractor',
                                                customerName: headerName,
                                                customerAddress: headerAddress || headerCity,
                                              })}
                                              className={buttonClass('secondary')}
                                            >
                                              <Download size={15} />
                                              Download PDF
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => void saveEstimateAsTemplate(estimate)}
                                              disabled={savingEstimateTemplateId === estimate.id}
                                              className={buttonClass('secondary')}
                                            >
                                              <Receipt size={15} />
                                              {savingEstimateTemplateId === estimate.id ? 'Saving...' : 'Save as template'}
                                            </button>
                                            {estimate.status === 'draft' && (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setEditingEstimateId(estimate.id);
                                                    setEstimateDraft(estimateDraftFromEstimate(estimate));
                                                    setEstimateAssistantText('');
                                                    setEstimateAssistantNotice('');
                                                    setEstimateComposerOpen(true);
                                                  }}
                                                  className={buttonClass('secondary')}
                                                >
                                                  Edit draft
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => void sendEstimateToHomeowner(estimate)}
                                                  disabled={sendingEstimateId === estimate.id || !estimate.homeowner_user_id}
                                                  className={buttonClass('primary')}
                                                >
                                                  <Send size={15} />
                                                  {sendingEstimateId === estimate.id ? 'Sending...' : estimate.homeowner_user_id ? 'Send to homeowner' : 'Connect homeowner to send'}
                                                </button>
                                              </>
                                            )}
                                            {estimate.status === 'accepted' && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const customerName = conn?.display_name || localCustomer?.display_name || 'Customer';
                                                  const workOrderName = `Work order from accepted estimate — ${customerName} — ${estimate.title}`;
                                                  if (conn) {
                                                    beginFieldWorkForHomeowner(conn, {
                                                      name: workOrderName,
                                                      serviceRequestId: estimate.service_request_id || undefined,
                                                      workflowKind: 'work_order',
                                                    });
                                                  } else if (localCustomer) {
                                                    beginFieldWorkForLocalContact(localCustomer, {
                                                      name: workOrderName,
                                                      workflowKind: 'work_order',
                                                    });
                                                  }
                                                  setHomeownerDetailTab('fieldwork');
                                                }}
                                                className={buttonClass('primary')}
                                              >
                                                <ClipboardCheck size={15} />
                                                Create work order
                                              </button>
                                            )}
                                            {estimate.status === 'sent' && (
                                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                                Waiting on homeowner
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {activeTabId === 'requests' && conn && (
                            <div className="space-y-4 max-w-3xl">
                              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <h3 className="font-bold text-slate-950">Service requests</h3>
                                    <p className="mt-1 text-xs text-slate-500">{activeReqs.length} active · {connReqs.length - activeReqs.length} closed/declined</p>
                                  </div>
                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Homeowner workspace</span>
                                </div>
                                <div className="my-4 grid gap-2 sm:grid-cols-3">
                                  {workspaceRequestSections.map(section => {
                                    const active = homeownerWorkspaceRequestView === section.id;
                                    return (
                                      <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => {
                                          setHomeownerWorkspaceRequestView(section.id);
                                          setSelectedHomeownerRequestId(section.requests[0]?.id ?? null);
                                        }}
                                        className={`rounded-xl border px-3 py-3 text-left transition ${
                                          active
                                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                            : section.id === 'attention' && section.requests.length > 0
                                              ? 'border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300'
                                              : 'border-slate-200 bg-white text-slate-950 hover:border-blue-300 hover:bg-blue-50'
                                        }`}
                                      >
                                        <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${active ? 'text-blue-50' : 'text-slate-500'}`}>{section.title}</p>
                                        <p className="mt-1 text-xl font-bold">{section.requests.length}</p>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{selectedWorkspaceRequestSection.title}</p>
                                  <p className="mt-1 text-sm text-slate-600">{selectedWorkspaceRequestSection.helper}</p>
                                </div>
                                {connReqs.length === 0 ? (
                                  <EmptyState text="No service requests from this homeowner yet." />
                                ) : selectedWorkspaceRequestSection.requests.length === 0 ? (
                                  <EmptyState text={`No ${selectedWorkspaceRequestSection.title.toLowerCase()} for this homeowner.`} />
                                ) : (
                                  <div className="space-y-2">
                                    {selectedWorkspaceRequestSection.requests.map(request => {
                                      const needsFollowUp = contractorRequestNeedsFollowUp(request);
                                      return (
                                        <button key={request.id} type="button" onClick={() => setSelectedHomeownerRequestId(request.id)} className={`w-full rounded-xl border bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm border-l-4 ${selectedHomeownerRequestId === request.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'} ${serviceRequestStatusAccent(request.status)}`}>
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-semibold text-slate-900">{request.title}</p>
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${serviceRequestStatusClass(request.status)}`}>
                                                  {serviceRequestStatusLabel(request.status)}
                                                </span>
                                                {needsFollowUp && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Follow-up</span>}
                                              </div>
                                              <p className="mt-1 text-xs text-slate-500">{request.category} · {urgencyLabel(request.urgency)} · Updated {formatDateTime(request.updated_at)}</p>
                                            </div>
                                            <ArrowRight size={16} className="mt-1 shrink-0 text-slate-400" />
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              {selectedWorkspaceRequest && (
                                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="font-bold text-slate-950">{selectedWorkspaceRequest.title}</h3>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${serviceRequestStatusClass(selectedWorkspaceRequest.status)}`}>
                                          {serviceRequestStatusLabel(selectedWorkspaceRequest.status)}
                                        </span>
                                        {contractorRequestNeedsFollowUp(selectedWorkspaceRequest) && (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Follow-up</span>
                                        )}
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {selectedWorkspaceRequest.category} · {urgencyLabel(selectedWorkspaceRequest.urgency)} · Updated {formatDateTime(selectedWorkspaceRequest.updated_at)}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        beginFieldWorkForHomeowner(conn, {
                                          name: `${selectedWorkspaceRequest.category} work order — ${selectedWorkspaceRequest.homeowner_name || conn.display_name || 'Homeowner'} — ${selectedWorkspaceRequest.title}`,
                                          serviceRequestId: selectedWorkspaceRequest.id,
                                          workflowKind: 'work_order',
                                        });
                                        setHomeownerDetailTab('fieldwork');
                                      }}
                                      className={buttonClass('secondary')}
                                    >
                                      <ClipboardCheck size={15} />
                                      Create work order
                                    </button>
                                  </div>
                                  <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                    {selectedWorkspaceRequest.description || 'No request description provided.'}
                                  </p>
                                  <details className="mt-4" open>
                                    <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Thread · {selectedWorkspaceRequest.messages.length} {selectedWorkspaceRequest.messages.length === 1 ? 'message' : 'messages'}
                                    </summary>
                                    <div className="mt-3">
                                      <ServiceRequestMessages messages={selectedWorkspaceRequest.messages} media={selectedWorkspaceRequest.media ?? []} />
                                    </div>
                                  </details>
                                  {selectedWorkspaceRequest.quote && (
                                    <div className="mt-4">
                                      <ServiceRequestQuoteCard quote={selectedWorkspaceRequest.quote} showActions={false} isUpdating={false} />
                                    </div>
                                  )}
                                  {selectedWorkspaceRequest.appointment && (
                                    <div className="mt-4">
                                      <ServiceRequestAppointmentCard
                                        appointment={selectedWorkspaceRequest.appointment}
                                        proposedByLabel={selectedWorkspaceRequest.appointment.proposed_by === 'homeowner' ? 'Homeowner proposed' : 'You proposed'}
                                        nextActionLabel={appointmentNextActionText(selectedWorkspaceRequest.appointment, 'contractor')}
                                      />
                                    </div>
                                  )}
                                  {!['closed', 'declined'].includes(selectedWorkspaceRequest.status) && (
                                    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <Field label="Respond to homeowner">
                                        <textarea
                                          className={inputClass()}
                                          rows={3}
                                          value={contractorResponseDrafts[selectedWorkspaceRequest.id] ?? ''}
                                          onChange={event => setContractorResponseDrafts(current => ({ ...current, [selectedWorkspaceRequest.id]: event.target.value }))}
                                          placeholder="Type an update, next step, or question..."
                                        />
                                      </Field>
                                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                        <input
                                          type="checkbox"
                                          checked={appointmentDrafts[selectedWorkspaceRequest.id]?.enabled ?? false}
                                          onChange={event => setAppointmentDrafts(current => ({ ...current, [selectedWorkspaceRequest.id]: { ...(current[selectedWorkspaceRequest.id] || { proposedAt: '', notes: '' }), enabled: event.target.checked } }))}
                                        />
                                        Propose an appointment time
                                      </label>
                                      {appointmentDrafts[selectedWorkspaceRequest.id]?.enabled && (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                          <Field label="Date & time">
                                            <input
                                              className={inputClass()}
                                              type="datetime-local"
                                              value={appointmentDrafts[selectedWorkspaceRequest.id]?.proposedAt ?? ''}
                                              onChange={event => setAppointmentDrafts(current => ({ ...current, [selectedWorkspaceRequest.id]: { ...(current[selectedWorkspaceRequest.id] || { enabled: true, notes: '' }), proposedAt: event.target.value } }))}
                                            />
                                          </Field>
                                          <Field label="Appointment notes">
                                            <input
                                              className={inputClass()}
                                              value={appointmentDrafts[selectedWorkspaceRequest.id]?.notes ?? ''}
                                              onChange={event => setAppointmentDrafts(current => ({ ...current, [selectedWorkspaceRequest.id]: { ...(current[selectedWorkspaceRequest.id] || { enabled: true, proposedAt: '' }), notes: event.target.value } }))}
                                              placeholder="Access notes, time window, etc."
                                            />
                                          </Field>
                                        </div>
                                      )}
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void updateContractorServiceRequest(selectedWorkspaceRequest, 'respond')}
                                          disabled={updatingServiceRequestId === selectedWorkspaceRequest.id}
                                          className={buttonClass('primary')}
                                        >
                                          {updatingServiceRequestId === selectedWorkspaceRequest.id ? 'Sending...' : 'Send response'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void updateContractorServiceRequest(selectedWorkspaceRequest, 'decline')}
                                          disabled={updatingServiceRequestId === selectedWorkspaceRequest.id}
                                          className={buttonClass('secondary')}
                                        >
                                          Decline
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {activeTabId === 'schedule' && conn && (
                            <div className="space-y-4 max-w-3xl">
                              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                  <Calendar size={18} className="text-blue-700" />
                                  <h3 className="font-bold text-slate-950">Appointments</h3>
                                </div>
                                {upcomingAppts.length === 0 ? (
                                  <EmptyState text="No upcoming or proposed appointments." />
                                ) : (
                                  <div className="space-y-2">
                                    {upcomingAppts.map(req => (
                                      <button key={req.id} type="button" onClick={() => { setContractorExpandedRequestIds(new Set([req.id])); setContractorTab('calendar'); }} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="font-semibold text-slate-900">{req.title}</p>
                                            <p className="mt-1 text-xs text-slate-500">{req.category} · {formatDateTime(req.appointment!.proposed_at)}</p>
                                          </div>
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${req.appointment!.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {req.appointment!.status}
                                          </span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {contractorTab === 'discover' && (
        <DiscoverFeed
          perspective="contractor"
          userId={profile.id}
          contractorId={contractor?.id ?? null}
          connections={[]}
        />
      )}

      {contractorTab === 'support' && (
        <SupportInboxPanel
          title="ServSync support"
          description="Request a new feature, ask for a workflow tweak, report an issue, or send a question about your contractor workspace. ServSync can reply here, and the conversation stays on file."
          inquiries={supportInquiries}
          draft={supportDraft}
          onDraftChange={setSupportDraft}
          replyDrafts={supportReplyDrafts}
          onReplyDraftChange={(inquiryId, body) => setSupportReplyDrafts(current => ({ ...current, [inquiryId]: body }))}
          onCreate={() => void createContractorSupportInquiry()}
          onReply={inquiry => void replyToContractorSupportInquiry(inquiry)}
          saving={savingSupport}
        />
      )}

      {(contractorTab === 'inspections' || (contractorTab === 'connections' && inspectionView === 'detail' && activeInspection)) && (
        <div className="space-y-5">

          {/* ── LIST VIEW ── */}
          {inspectionView === 'list' && (
            <>
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="p-5 sm:p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Work order command center</p>
                    <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">Templates, local customers, and unassigned work</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      Use this area for local customers who are not connected yet, reusable templates, and work that does not start inside a homeowner workspace.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setContractorTab('connections')}
                        className={buttonClass('primary')}
                      >
                        <Users size={16} />
                        Open Homeowners
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTemplateLibrary(true);
                          setShowTemplateForm(false);
                        }}
                        className={buttonClass('secondary')}
                      >
                        <ClipboardList size={16} />
                        Browse templates
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowLocalContactForm(true)}
                        className={buttonClass('secondary')}
                      >
                        <Plus size={16} />
                        Add local customer
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 bg-slate-50 p-5 sm:p-6 lg:border-l lg:border-t-0">
                    <div className="grid grid-cols-2 gap-3">
                      <InfoBox label="Connected homeowners" value={String(activeFieldWorkConnections.length)} />
                      <InfoBox label="Local customers" value={String(localContacts.length)} />
                      <InfoBox label="Drafts" value={String(fieldWorkDrafts.length)} />
                      <InfoBox label="Finalized reports" value={String(finalizedFieldWork.length)} />
                    </div>
                    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Clean workflow</p>
                      <p className="mt-1 text-sm text-blue-800">
                        Connected homeowners can receive filed reports in ServSync. Local customer work stays in the contractor workspace until that customer joins later.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {showLocalContactForm && (
                <Card title="Add local customer" icon={<UserRound size={18} />}>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Customer name">
                        <input className={inputClass()} value={localContactDraft.display_name} onChange={event => setLocalContactDraft(d => ({ ...d, display_name: event.target.value }))} placeholder="e.g. Becky Thomas" />
                      </Field>
                      <Field label="Phone">
                        <input className={inputClass()} value={localContactDraft.phone} onChange={event => setLocalContactDraft(d => ({ ...d, phone: event.target.value }))} placeholder="(555) 555-5555" />
                      </Field>
                      <Field label="Email">
                        <input className={inputClass()} value={localContactDraft.email} onChange={event => setLocalContactDraft(d => ({ ...d, email: event.target.value }))} placeholder="customer@example.com" />
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Home nickname">
                        <input className={inputClass()} value={localContactDraft.home_nickname} onChange={event => setLocalContactDraft(d => ({ ...d, home_nickname: event.target.value }))} placeholder="Main home" />
                      </Field>
                      <Field label="Address">
                        <input className={inputClass()} value={localContactDraft.address_line1} onChange={event => setLocalContactDraft(d => ({ ...d, address_line1: event.target.value }))} placeholder="Street address" />
                      </Field>
                      <Field label="Address line 2">
                        <input className={inputClass()} value={localContactDraft.address_line2} onChange={event => setLocalContactDraft(d => ({ ...d, address_line2: event.target.value }))} placeholder="Unit, suite, etc." />
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <Field label="City">
                        <input className={inputClass()} value={localContactDraft.city} onChange={event => setLocalContactDraft(d => ({ ...d, city: event.target.value }))} />
                      </Field>
                      <Field label="State">
                        <input className={inputClass()} value={localContactDraft.state} onChange={event => setLocalContactDraft(d => ({ ...d, state: event.target.value }))} />
                      </Field>
                      <Field label="ZIP">
                        <input className={inputClass()} value={localContactDraft.zip_code} onChange={event => setLocalContactDraft(d => ({ ...d, zip_code: event.target.value }))} />
                      </Field>
                      <Field label="Home type">
                        <input className={inputClass()} value={localContactDraft.home_type} onChange={event => setLocalContactDraft(d => ({ ...d, home_type: event.target.value }))} placeholder="Single family" />
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Customer notes">
                        <textarea className={`${inputClass()} min-h-[90px] resize-y`} value={localContactDraft.notes} onChange={event => setLocalContactDraft(d => ({ ...d, notes: event.target.value }))} placeholder="Gate code, preferred contact method, etc." />
                      </Field>
                      <Field label="Home notes">
                        <textarea className={`${inputClass()} min-h-[90px] resize-y`} value={localContactDraft.home_notes} onChange={event => setLocalContactDraft(d => ({ ...d, home_notes: event.target.value }))} placeholder="Home details useful for this work." />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void createLocalContact()} disabled={savingInspection || !localContactDraft.display_name.trim()} className={buttonClass('primary')}>
                        {savingInspection ? 'Saving...' : 'Save local customer'}
                      </button>
                      <button type="button" onClick={() => setShowLocalContactForm(false)} className={buttonClass('secondary')}>Cancel</button>
                    </div>
                  </div>
                </Card>
              )}

              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Connected homeowner work</p>
                    <h3 className="mt-2 font-bold text-slate-950">Use the Homeowners workspace for connected profiles</h3>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-900">
                      Service requests, profile-linked work orders, reports, and appointments stay centered on the homeowner file. This tab is for templates, local customers, and broader work-order management.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setContractorTab('connections')}
                    className={buttonClass('primary')}
                  >
                    <Users size={16} />
                    Open Homeowners
                  </button>
                </div>
              </section>

              <Card title="Local customers" icon={<UserRound size={18} />}>
                {localContacts.length === 0 ? (
                  <EmptyState text="No local customers yet. Add one when you need field work for someone who does not have a ServSync homeowner profile." />
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {localContacts.map(contact => {
                      const localWork = fieldWorkForLocalContact(contact.id);
                      const draftCount = localWork.filter(insp => insp.status === 'draft').length;
                      const finalizedCount = localWork.filter(insp => insp.status === 'finalized').length;
                      const lastWork = localWork[0];
                      const home = contact.homes?.[0];
                      return (
                        <div key={contact.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-950">{contact.display_name || 'Local customer'}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {home?.nickname || 'Home'}{home?.address_line1 ? ` · ${home.address_line1}` : ''}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {[home?.city, home?.state].filter(Boolean).join(', ') || contact.phone || contact.email || 'Contact details not added'}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Local</span>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <InfoBox label="Drafts" value={String(draftCount)} />
                            <InfoBox label="Filed" value={String(finalizedCount)} />
                            <InfoBox label="ServSync" value="Not linked" />
                          </div>
                          {lastWork && (
                            <button
                              type="button"
                              onClick={() => openInspection(lastWork)}
                              className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Most recent</p>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-950">{lastWork.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{lastWork.status === 'draft' ? 'Draft' : 'Finalized'} · {formatDateTime(lastWork.updated_at)}</p>
                            </button>
                          )}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => beginFieldWorkForLocalContact(contact)} className={buttonClass('primary')}>
                              <Plus size={16} />
                              Create work order
                            </button>
                            <button type="button" disabled className={buttonClass('secondary')} title="Claim/invite flow can be added after this foundation is stable.">
                              Invite to claim
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Templates section */}
              <Card title="Workflow templates" icon={<ClipboardList size={18} />}>
                <p className="text-sm text-slate-600 mb-4">
                  Create reusable checklists or search ServSync templates by trade, workflow, room, or checklist item.
                </p>
                <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Search templates</label>
                    <input
                      className={inputClass()}
                      value={templateSearch}
                      onChange={e => {
                        setTemplateSearch(e.target.value);
                        setShowTemplateLibrary(true);
                      }}
                      placeholder="Search electrical, plumbing, HVAC, work order..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTemplateLibrary(prev => !prev)}
                    className={`${buttonClass('secondary')} self-end`}
                  >
                    {showTemplateLibrary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {showTemplateLibrary ? 'Hide templates' : 'Browse templates'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTemplateForm(true);
                      setShowTemplateLibrary(false);
                    }}
                    className={`${buttonClass('primary')} self-end`}
                  >
                    <Plus size={16} /> Create template
                  </button>
                </div>

                {showTemplateForm && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <Field label="Template name">
                      <input className={inputClass()} value={templateDraft.name} onChange={e => setTemplateDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. General Home Inspection" />
                    </Field>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add room</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Room name</label>
                          <input className={inputClass()} value={templateEditRoom} onChange={e => setTemplateEditRoom(e.target.value)} placeholder="e.g. Kitchen" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Items (one per line or comma-separated)</label>
                          <textarea className={`${inputClass()} resize-none`} rows={3} value={templateEditItems} onChange={e => setTemplateEditItems(e.target.value)} placeholder="Check appliances&#10;Test GFCI outlets" />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!templateEditRoom.trim() || !templateEditItems.trim()}
                        onClick={() => {
                          const items = templateEditItems.split(/\n|,/).map(s => s.trim()).filter(Boolean);
                          if (!templateEditRoom.trim() || items.length === 0) return;
                          setTemplateDraft(d => ({ ...d, rooms: [...d.rooms, { room: templateEditRoom.trim(), items }] }));
                          setTemplateEditRoom('');
                          setTemplateEditItems('');
                        }}
                        className={buttonClass('secondary')}
                      >
                        <Plus size={14} /> Add room
                      </button>
                    </div>
                    {templateDraft.rooms.length > 0 && (
                      <div className="space-y-1">
                        {templateDraft.rooms.map((r, i) => (
                          <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <span className="text-sm text-slate-950 font-medium">{r.room}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-400">{r.items.length} items</span>
                              <button type="button" onClick={() => setTemplateDraft(d => ({ ...d, rooms: d.rooms.filter((_, j) => j !== i) }))} className="text-slate-500 hover:text-red-400">
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => void saveTemplate()} disabled={savingInspection || !templateDraft.name.trim() || templateDraft.rooms.length === 0} className={buttonClass('primary')}>
                        Save template
                      </button>
                      <button type="button" onClick={() => setShowTemplateForm(false)} className={buttonClass('secondary')}>Cancel</button>
                    </div>
                  </div>
                )}

                {showTemplateLibrary && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {templateSearch.trim() ? 'Search results' : 'Template library'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {filteredCustomTemplates.length + filteredStarterTemplates.length} match{filteredCustomTemplates.length + filteredStarterTemplates.length !== 1 ? 'es' : ''}
                      </p>
                    </div>

                    {filteredCustomTemplates.length === 0 && filteredStarterTemplates.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-sm font-semibold text-slate-950">No templates found.</p>
                        <p className="mt-1 text-xs text-slate-500">Try a trade like plumbing, electrical, HVAC, roofing, or work order.</p>
                      </div>
                    ) : (
                      <>
                        {filteredCustomTemplates.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Your templates</p>
                            {filteredCustomTemplates.map(tpl => (
                              <div key={tpl.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-950">{tpl.name}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">{tpl.rooms.length} sections · {tpl.rooms.reduce((n, r) => n + r.items.length, 0)} items</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInspectionNewDraft({ ...resetInspectionNewDraft(), template_id: tpl.id, starter_template_id: sortedServSyncFieldWorkTemplates[0]?.id ?? 'starter-general-maintenance-field-work' });
                                      setInspectionView('new');
                                    }}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                  >
                                    Use
                                  </button>
                                  <button type="button" onClick={() => void deleteTemplate(tpl.id)} className="text-slate-500 hover:text-red-400 transition-colors" title="Delete template">
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {filteredStarterTemplates.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ServSync starter templates</p>
                            <div className="grid gap-3 md:grid-cols-2">
                              {filteredStarterTemplates.map(tpl => {
                                const recommended = starterTemplateRecommendedForContractor(tpl.trade);
                                return (
                                  <div key={tpl.id} className={`rounded-xl border px-4 py-3 shadow-sm ${recommended ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-950">{tpl.name}</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">{tpl.description}</p>
                                        <p className="mt-2 text-xs text-slate-500">{tpl.rooms.length} sections · {tpl.rooms.reduce((n, r) => n + r.items.length, 0)} items</p>
                                      </div>
                                      <div className="flex shrink-0 flex-col items-end gap-1">
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{FIELD_WORK_KIND_LABEL[tpl.kind]}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${recommended ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                          {recommended ? 'Recommended' : tpl.trade}
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInspectionNewDraft({ ...resetInspectionNewDraft(), template_id: '', starter_template_id: tpl.id, workflow_kind: tpl.kind });
                                        setInspectionView('new');
                                      }}
                                      className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                    >
                                      Use template
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Card>

              {/* Field work list */}
              <Card title="All work orders" icon={<ClipboardCheck size={18} />}>
                {inspections.length === 0 ? (
                  <EmptyState text="No work orders yet. Create an inspection, repair visit, maintenance visit, or assessment to get started." />
                ) : (
                  <div className="space-y-2">
                    {inspections.map(insp => {
                      const urgentCount = insp.rooms_with_findings.flatMap(r => r.findings).filter(f => f.status === 'Urgent').length;
                      const issueCount = insp.rooms_with_findings.flatMap(r => r.findings).filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;
                      const subjectLabel = fieldWorkSubjectLabel(insp);
                      const subjectAddress = fieldWorkSubjectAddress(insp);
                      return (
                        <div key={insp.id} className={`rounded-xl border bg-white px-4 py-3 flex items-center gap-3 shadow-sm ${insp.status === 'draft' ? 'border-amber-200' : 'border-slate-200'}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-slate-950 truncate">{insp.name}</p>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${insp.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {insp.status === 'draft' ? 'Draft' : 'Finalized'}
                              </span>
                              {urgentCount > 0 && <span className="rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-xs font-semibold">{urgentCount} Urgent</span>}
                              {issueCount > 0 && urgentCount === 0 && <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-semibold">{issueCount} Issues</span>}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {subjectLabel}{subjectAddress ? ` · ${subjectAddress}` : ''} · {new Date(insp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                          {insp.status === 'draft' && (
                            <button type="button" onClick={() => void deleteInspection(insp)} className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:border-red-300 transition-colors" title="Delete inspection">
                              Delete
                            </button>
                          )}
                          <button type="button" onClick={() => openInspection(insp)} className={buttonClass('secondary')}>
                            {insp.status === 'draft' ? 'Continue' : 'View report'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </>
          )}

          {/* ── NEW VIEW ── */}
          {inspectionView === 'new' && (
            <Card title="New work order" icon={<ClipboardList size={18} />}>
              <div className="space-y-4">
                <Field label="Customer">
                  <select
                    className={inputClass()}
                    value={inspectionNewDraft.subject_type === 'local' ? `local:${inspectionNewDraft.local_contact_id}` : `connected:${inspectionNewDraft.homeowner_user_id}`}
                    onChange={e => {
                    const [subjectType, id] = e.target.value.split(':') as ['connected' | 'local', string];
                    const conn = subjectType === 'connected' ? connections.find(c => c.homeowner_user_id === id) : null;
                    const local = subjectType === 'local' ? localContacts.find(c => c.id === id) : null;
                    const selectedTemplate = SERVSYNC_FIELD_WORK_TEMPLATES.find(t => t.id === inspectionNewDraft.starter_template_id);
                    const workflowLabel = FIELD_WORK_KIND_LABEL[inspectionNewDraft.workflow_kind];
                    const subjectName = conn?.display_name || local?.display_name || '';
                    const autoName = subjectName ? `${selectedTemplate?.name || workflowLabel} — ${subjectName} — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : '';
                    setInspectionNewDraft(d => ({
                      ...d,
                      subject_type: subjectType,
                      homeowner_user_id: subjectType === 'connected' ? id : '',
                      local_contact_id: subjectType === 'local' ? id : '',
                      local_home_id: subjectType === 'local' ? local?.homes?.[0]?.id ?? '' : '',
                      service_request_id: subjectType === 'connected' ? d.service_request_id : '',
                      name: autoName || d.name,
                    }));
                  }}>
                    <option value="connected:">Select customer…</option>
                    {connections.filter(c => c.status === 'active').map(c => (
                      <option key={c.homeowner_user_id} value={`connected:${c.homeowner_user_id}`}>{c.display_name} — ServSync homeowner</option>
                    ))}
                    {localContacts.map(contact => (
                      <option key={contact.id} value={`local:${contact.id}`}>{contact.display_name} — Local customer</option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Workflow type">
                    <select className={inputClass()} value={inspectionNewDraft.workflow_kind} onChange={e => {
                      const nextKind = e.target.value as FieldWorkflowKind;
                      const nextStarter = sortedServSyncFieldWorkTemplates.find(t => t.kind === nextKind) ?? sortedServSyncFieldWorkTemplates[0];
                      setInspectionNewDraft(d => ({
                        ...d,
                        workflow_kind: nextKind,
                        starter_template_id: d.template_id ? d.starter_template_id : nextStarter?.id ?? d.starter_template_id,
                        name: d.homeowner_user_id || d.local_contact_id
                          ? `${nextStarter?.name || FIELD_WORK_KIND_LABEL[nextKind]} — ${
                              d.subject_type === 'local'
                                ? localContacts.find(c => c.id === d.local_contact_id)?.display_name ?? 'Local customer'
                                : connections.find(c => c.homeowner_user_id === d.homeowner_user_id)?.display_name ?? 'Homeowner'
                            } — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                          : d.name,
                      }));
                    }}>
                      {Object.entries(FIELD_WORK_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Field work name">
                    <input className={inputClass()} value={inspectionNewDraft.name} onChange={e => setInspectionNewDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. HVAC seasonal inspection" />
                  </Field>
                </div>
                <Field label="Workflow template">
                  <select className={inputClass()} value={inspectionNewDraft.template_id ? `custom:${inspectionNewDraft.template_id}` : `starter:${inspectionNewDraft.starter_template_id}`} onChange={e => {
                    const [source, id] = e.target.value.split(':');
                    const starter = SERVSYNC_FIELD_WORK_TEMPLATES.find(t => t.id === id);
                    setInspectionNewDraft(d => ({
                      ...d,
                      template_id: source === 'custom' ? id : '',
                      starter_template_id: source === 'starter' ? id : d.starter_template_id,
                      workflow_kind: source === 'starter' && starter ? starter.kind : d.workflow_kind,
                    }));
                  }}>
                    <optgroup label="ServSync starter templates">
                      {sortedServSyncFieldWorkTemplates.map(t => (
                        <option key={t.id} value={`starter:${t.id}`}>
                          {starterTemplateRecommendedForContractor(t.trade) ? 'Recommended — ' : ''}{t.name} ({FIELD_WORK_KIND_LABEL[t.kind]})
                        </option>
                      ))}
                    </optgroup>
                    {inspectionTemplates.length > 0 && (
                      <optgroup label="Your templates">
                        {inspectionTemplates.map(t => <option key={t.id} value={`custom:${t.id}`}>{t.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </Field>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void startNewInspection()}
                    disabled={savingInspection || !inspectionNewDraft.name.trim() || (inspectionNewDraft.subject_type === 'connected' ? !inspectionNewDraft.homeowner_user_id : !inspectionNewDraft.local_contact_id)}
                    className={buttonClass('primary')}
                  >
                    {savingInspection ? 'Creating…' : 'Create work order'}
                  </button>
                  <button type="button" onClick={() => setInspectionView('list')} className={buttonClass('secondary')}>Cancel</button>
                </div>
              </div>
            </Card>
          )}

          {/* ── DETAIL VIEW (sub-tabbed) ── */}
          {inspectionView === 'detail' && activeInspection && (() => {
            const homeownerLabel = fieldWorkSubjectLabel(activeInspection);
            const homeAddress = fieldWorkSubjectAddress(activeInspection);
            const workingRooms: InspectionRoomData[] = activeRooms.map(rm => ({
              room: rm.room,
              findings: rm.items.map(item => {
                const key = `${rm.room}||${item}`;
                const local = localFindings[key];
                return { title: item, status: (local?.status ?? 'Pass') as FindingStatus, notes: local?.notes ?? '', action: local?.action ?? '', due: local?.due ?? '', photos: local?.photos ?? [] };
              }),
            }));
            const workingFindings = workingRooms.flatMap(r => r.findings);
            const urgentCountFin = workingFindings.filter(f => f.status === 'Urgent').length;
            const issueCountFin = workingFindings.filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;
            const fixedCountFin = workingFindings.filter(f => f.status === 'Fixed On Site').length;
            const checklistItemCount = activeRooms.reduce((count, room) => count + room.items.length, 0);
            const fieldWorkSteps: Array<{ id: typeof inspectionSubTab; title: string; helper: string; count: string }> = [
              { id: 'checklist', title: 'Checklist', helper: 'Choose sections and items', count: `${activeRooms.length} sections` },
              { id: 'inspect', title: 'Work Notes', helper: 'Record findings, photos, repairs', count: `${issueCountFin + fixedCountFin} updates` },
              { id: 'report', title: 'Report', helper: 'Review, download, and file PDF', count: activeInspection.status === 'finalized' ? 'Filed' : 'Draft' },
            ];
            const goToReportReview = () => {
              if (activeInspection.status === 'draft') {
                setInspectionSummary(prev => prev.trim() ? prev : buildInspectionSummaryText(workingRooms));
                setInspectionClosedForReview(true);
              }
              setInspectionSubTab('report');
              setNotice('Report review is ready. Check the homeowner summary before filing.');
            };
            return (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setInspectionView('list');
                    if (contractorTab === 'connections') {
                      setHomeownerDetailTab('fieldwork');
                    }
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {contractorTab === 'connections' ? '← Back to homeowner workspace' : '← Back to work orders'}
                </button>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-bold text-slate-950 text-xl truncate">{activeInspection.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">{homeownerLabel}{homeAddress ? ` · ${homeAddress}` : ''}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activeInspection.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {activeInspection.status === 'draft' ? 'Draft' : 'Finalized'}
                          </span>
                          {urgentCountFin > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 flex items-center gap-1"><AlertTriangle size={10}/>{urgentCountFin} urgent</span>}
                          {issueCountFin > 0 && urgentCountFin === 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{issueCountFin} open</span>}
                          {fixedCountFin > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">{fixedCountFin} fixed</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        <button type="button" onClick={() => void saveInspectionProgress(activeInspection)} disabled={savingInspection || activeInspection.status !== 'draft'} className="text-xs font-medium border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40">
                          {savingInspection ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={goToReportReview} className={buttonClass('primary')}>
                          Review report
                        </button>
                        {activeInspection.status === 'draft' && (
                          <button type="button" onClick={() => void deleteInspection(activeInspection)} className="text-xs font-medium border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5">
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 mt-4 flex-wrap">
                      {fieldWorkSteps.map(step => (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setInspectionSubTab(step.id)}
                          className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            inspectionSubTab === step.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {step.title}
                          {step.id === 'inspect' && issueCountFin > 0 && (
                            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${inspectionSubTab === step.id ? 'bg-blue-500 text-white' : 'bg-amber-100 text-amber-700'}`}>{issueCountFin}</span>
                          )}
                          {step.id === 'checklist' && (
                            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${inspectionSubTab === step.id ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{checklistItemCount}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── CHECKLIST SUB-TAB ── */}
                {inspectionSubTab === 'checklist' && (
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex" style={{ height: 'calc(100vh - 360px)', minHeight: '560px' }}>
                      {/* Left: Sections sidebar */}
                      <div className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
                        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <h2 className="font-semibold text-slate-800 text-sm">Sections</h2>
                            <p className="text-xs text-slate-400 mt-0.5">{activeRooms.length} section{activeRooms.length === 1 ? '' : 's'}</p>
                          </div>
                          <button type="button" onClick={() => setShowAddRoom(true)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                            <Plus size={14} /> Add
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                          {activeRooms.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-8 px-4">No sections yet. Click + Add to start.</p>
                          ) : activeRooms.map(rm => {
                            const flagged = rm.items.filter(item => {
                              const f = localFindings[`${rm.room}||${item}`];
                              return f && !['Pass', 'Fixed On Site'].includes(f.status);
                            }).length;
                            const isSelected = selectedChecklistRoom === rm.room;
                            return (
                              <div
                                key={rm.room}
                                onClick={() => setSelectedChecklistRoom(rm.room)}
                                className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                              >
                                <span className="text-sm leading-none">{getRoomInspectionIcon(rm.room)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{rm.room}</p>
                                  <p className="text-xs text-slate-400">{rm.items.length} items{flagged > 0 ? ` · ${flagged} flagged` : ''}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (!window.confirm(`Remove section "${rm.room}" and its items?`)) return;
                                    const updated = { ...localFindings };
                                    rm.items.forEach(item => { delete updated[`${rm.room}||${item}`]; });
                                    setLocalFindings(updated);
                                    setActiveRooms(prev => prev.filter(r => r.room !== rm.room));
                                    if (selectedChecklistRoom === rm.room) {
                                      setSelectedChecklistRoom(activeRooms.find(r => r.room !== rm.room)?.room ?? null);
                                    }
                                  }}
                                  className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Items panel */}
                      {selectedChecklistRoom ? (() => {
                        const roomData = activeRooms.find(r => r.room === selectedChecklistRoom);
                        if (!roomData) return null;
                        const recommended = recommendedItemsForRoom(selectedChecklistRoom);
                        const currentSet = new Set(roomData.items);
                        const customItems = roomData.items.filter(item => !recommended.includes(item));
                        const addItem = (item: string) => {
                          if (!item || roomData.items.includes(item)) return;
                          setActiveRooms(prev => prev.map(r => r.room === selectedChecklistRoom ? { ...r, items: [...r.items, item] } : r));
                          setLocalFindings(prev => ({ ...prev, [`${selectedChecklistRoom}||${item}`]: { status: 'Pass', notes: '', action: '', due: '', photos: [] } }));
                        };
                        const removeItem = (item: string) => {
                          setActiveRooms(prev => prev.map(r => r.room === selectedChecklistRoom ? { ...r, items: r.items.filter(i => i !== item) } : r));
                          const updated = { ...localFindings };
                          delete updated[`${selectedChecklistRoom}||${item}`];
                          setLocalFindings(updated);
                        };
                        return (
                          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                            <div className="max-w-2xl space-y-4">
                              <div>
                                <h2 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                                  <span>{getRoomInspectionIcon(selectedChecklistRoom)}</span>
                                  {selectedChecklistRoom}
                                </h2>
                                <p className="text-slate-500 text-sm">{roomData.items.length} items selected</p>
                              </div>

                              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                <p className="text-xs font-semibold text-slate-500 mb-3">Add Custom Item</p>
                                <div className="flex gap-2">
                                  <input
                                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    placeholder="Custom inspection item..."
                                    value={customItemInput}
                                    onChange={e => setCustomItemInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && customItemInput.trim()) { addItem(customItemInput.trim()); setCustomItemInput(''); } }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => { if (customItemInput.trim()) { addItem(customItemInput.trim()); setCustomItemInput(''); } }}
                                    disabled={!customItemInput.trim()}
                                    className="bg-blue-600 text-white px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>

                              {customItems.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Custom Items</p>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {customItems.map(item => (
                                      <div key={item} className="flex items-center gap-3 px-4 py-3">
                                        <input type="checkbox" checked readOnly className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                                        <span className="flex-1 text-sm text-slate-700">{item}</span>
                                        <button type="button" onClick={() => removeItem(item)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {recommended.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Recommended for {selectedChecklistRoom}</p>
                                    <div className="flex gap-3">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const toAdd = recommended.filter(item => !currentSet.has(item));
                                          if (toAdd.length === 0) return;
                                          setActiveRooms(prev => prev.map(r => r.room === selectedChecklistRoom ? { ...r, items: [...r.items, ...toAdd] } : r));
                                          const updates: Record<string, { status: FindingStatus; notes: string; action: string; due: string; photos: string[] }> = {};
                                          toAdd.forEach(item => { updates[`${selectedChecklistRoom}||${item}`] = { status: 'Pass', notes: '', action: '', due: '', photos: [] }; });
                                          setLocalFindings(prev => ({ ...prev, ...updates }));
                                        }}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                      >
                                        Add all
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = { ...localFindings };
                                          roomData.items.forEach(item => { delete updated[`${selectedChecklistRoom}||${item}`]; });
                                          setLocalFindings(updated);
                                          setActiveRooms(prev => prev.map(r => r.room === selectedChecklistRoom ? { ...r, items: [] } : r));
                                        }}
                                        className="text-xs font-semibold text-slate-500 hover:text-red-600"
                                      >
                                        Clear all
                                      </button>
                                    </div>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {recommended.map(item => {
                                      const isChecked = currentSet.has(item);
                                      return (
                                        <label key={item} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => isChecked ? removeItem(item) : addItem(item)}
                                            className="w-4 h-4 accent-blue-600 flex-shrink-0"
                                          />
                                          <span className="text-sm text-slate-700">{item}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm bg-slate-50">
                          {activeRooms.length === 0 ? 'Add a section to start building the checklist' : 'Select a section to build its checklist'}
                        </div>
                      )}
                    </div>

                    {/* Add Section modal */}
                    {showAddRoom && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAddRoom(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <h3 className="font-semibold text-slate-800">Add Section</h3>
                            <button type="button" onClick={() => setShowAddRoom(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                          </div>
                          <div className="p-6 space-y-4">
                            {(() => {
                              const existing = new Set(activeRooms.map(r => r.room.toLowerCase()));
                              const available = DEFAULT_INSPECTION_ROOMS.map(r => r.room).filter(r => !existing.has(r.toLowerCase()));
                              return available.length > 0 ? (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 mb-2">Common Sections</p>
                                  <div className="flex flex-wrap gap-2">
                                    {available.map(r => (
                                      <button
                                        key={r}
                                        type="button"
                                        onClick={() => {
                                          const template = DEFAULT_INSPECTION_ROOMS.find(d => d.room === r);
                                          setActiveRooms(prev => [...prev, { room: r, items: [] }]);
                                          setSelectedChecklistRoom(r);
                                          setShowAddRoom(false);
                                          if (template && template.items.length > 0) {
                                            // Don't auto-add items; user can use "Add all" in the recommended card
                                          }
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
                                      >
                                        <span className="mr-1">{getRoomInspectionIcon(r)}</span>{r}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null;
                            })()}
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-2">Custom Section</p>
                              <div className="flex gap-2">
                                <input
                                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                  placeholder="Section name..."
                                  value={customRoomInput}
                                  onChange={e => setCustomRoomInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && customRoomInput.trim()) {
                                      const name = customRoomInput.trim();
                                      if (activeRooms.some(r => r.room.toLowerCase() === name.toLowerCase())) return;
                                      setActiveRooms(prev => [...prev, { room: name, items: [] }]);
                                      setSelectedChecklistRoom(name);
                                      setCustomRoomInput('');
                                      setShowAddRoom(false);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={!customRoomInput.trim() || activeRooms.some(r => r.room.toLowerCase() === customRoomInput.trim().toLowerCase())}
                                  onClick={() => {
                                    const name = customRoomInput.trim();
                                    if (!name) return;
                                    setActiveRooms(prev => [...prev, { room: name, items: [] }]);
                                    setSelectedChecklistRoom(name);
                                    setCustomRoomInput('');
                                    setShowAddRoom(false);
                                  }}
                                  className="bg-blue-600 text-white px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── INSPECT SUB-TAB ── */}
                {inspectionSubTab === 'inspect' && (() => {
                  const activeWorkRoomName = selectedChecklistRoom && activeRooms.some(room => room.room === selectedChecklistRoom)
                    ? selectedChecklistRoom
                    : activeRooms[0]?.room ?? null;
                  const activeWorkRoom = activeRooms.find(room => room.room === activeWorkRoomName) ?? null;
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="flex flex-col" style={{ height: 'calc(100vh - 360px)', minHeight: '600px' }}>
                        {/* Top room pills */}
                        <div className="bg-white border-b border-slate-200 px-6 py-3">
                          <div className="flex gap-1 overflow-x-auto pb-1">
                            {activeRooms.length === 0 ? (
                              <p className="text-xs text-slate-400 py-1">No sections yet. Go to Checklist to add sections.</p>
                            ) : activeRooms.map(room => {
                              const findings = room.items.map(item => localFindings[`${room.room}||${item}`]);
                              const issueCount = findings.filter(f => f && !['Pass', 'Fixed On Site'].includes(f.status)).length;
                              const isActive = room.room === activeWorkRoomName;
                              return (
                                <button
                                  key={room.room}
                                  type="button"
                                  onClick={() => setSelectedChecklistRoom(room.room)}
                                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    isActive ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <span>{getRoomInspectionIcon(room.room)}</span>
                                  {room.room}
                                  {issueCount > 0 && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white text-blue-600' : 'bg-red-100 text-red-600'}`}>
                                      {issueCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                          {/* Items panel */}
                          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50">
                            {!activeWorkRoom ? (
                              <div className="flex h-full items-center justify-center text-slate-400 text-sm">Pick a section above to start work notes.</div>
                            ) : activeWorkRoom.items.length === 0 ? (
                              <div className="flex h-full items-center justify-center text-slate-400 text-sm text-center px-6">
                                This section has no checklist items yet. Go back to Checklist to add items.
                              </div>
                            ) : (
                              activeWorkRoom.items.map(item => {
                                const key = `${activeWorkRoom.room}||${item}`;
                                const current = localFindings[key] ?? { status: 'Pass' as FindingStatus, notes: '', action: '', due: '', photos: [] };
                                const status = current.status;
                                const isUploading = uploadingInspectionPhotoKey === key;
                                return (
                                  <div
                                    key={item}
                                    className={`rounded-2xl border bg-white overflow-hidden transition-colors ${status !== 'Pass' ? `border-2` : ''}`}
                                    style={{ borderColor: status === 'Urgent' ? '#dc2626' : status === 'Needs Repair' ? '#d97706' : status === 'Monitor' ? '#2563eb' : status === 'Fixed On Site' ? '#0f766e' : '#e2e8f0' }}
                                  >
                                    <div className="p-4">
                                      <div className="flex items-start justify-between gap-2 mb-3">
                                        <p className="font-semibold text-slate-800 text-sm">{item}</p>
                                      </div>
                                      <div className="flex gap-2 flex-wrap">
                                        {FINDING_STATUSES.map(st => {
                                          const isActive = current.status === st;
                                          const stCfg = FINDING_STATUS_CONFIG[st];
                                          return (
                                            <button
                                              key={st}
                                              type="button"
                                              onClick={() => setLocalFindings(prev => ({ ...prev, [key]: { ...current, status: st } }))}
                                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                                isActive ? stCfg.color : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                                              }`}
                                            >
                                              {st}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                    <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                                      <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Comments / Observations</label>
                                        <textarea
                                          rows={2}
                                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none bg-white"
                                          placeholder="Add notes, observations, or comments..."
                                          value={current.notes}
                                          onChange={e => setLocalFindings(prev => ({ ...prev, [key]: { ...current, notes: e.target.value } }))}
                                        />
                                      </div>
                                      {current.status !== 'Pass' && (
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                              {status === 'Fixed On Site' ? 'Action Taken' : 'Recommended Action'}
                                            </label>
                                            <input
                                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                                              placeholder={status === 'Fixed On Site' ? 'e.g. Tightened fitting, cleared drain...' : 'e.g. Replace, repair, monitor...'}
                                              value={current.action}
                                              onChange={e => setLocalFindings(prev => ({ ...prev, [key]: { ...current, action: e.target.value } }))}
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                              {status === 'Fixed On Site' ? 'Follow-up' : 'Follow-up Date'}
                                            </label>
                                            <input
                                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                                              placeholder="e.g. May 30, 2026"
                                              value={current.due}
                                              onChange={e => setLocalFindings(prev => ({ ...prev, [key]: { ...current, due: e.target.value } }))}
                                            />
                                          </div>
                                        </div>
                                      )}
                                      <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-2">Photos</label>
                                        <div className="flex gap-2 mb-2 flex-wrap">
                                          <label className={`flex items-center gap-1.5 border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-slate-100 cursor-pointer bg-white transition-colors ${isUploading ? 'pointer-events-none opacity-50' : ''}`}>
                                            <Camera size={12} /> {isUploading ? 'Uploading...' : 'Add photo'}
                                            <input
                                              type="file" accept="image/*,video/*" className="hidden" disabled={isUploading}
                                              onChange={e => { const f = e.target.files?.[0]; if (f) void handleInspectionPhotoUpload(key, f); e.target.value = ''; }}
                                            />
                                          </label>
                                        </div>
                                        {(current.photos ?? []).length > 0 && (
                                          <div className="grid grid-cols-4 gap-2 mt-1">
                                            {(current.photos ?? []).map((url, pi) => (
                                              <div key={pi} className="relative group rounded-lg overflow-hidden">
                                                <img src={url} alt="finding" className="w-full h-20 object-cover" />
                                                <button
                                                  type="button"
                                                  onClick={() => removeInspectionPhoto(key, url)}
                                                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                  <X size={10} />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Right sidebar: Inspection Assistant */}
                          <div className="w-72 shrink-0 border-l border-slate-200 bg-white overflow-y-auto p-4 space-y-4">
                            <div className="border border-blue-200 rounded-2xl overflow-hidden bg-blue-50/40">
                              <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                                <Sparkles size={14} className="text-blue-600" />
                                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Inspection Assistant</p>
                              </div>
                              <div className="p-3 space-y-3">
                                <div className="grid grid-cols-3 gap-1 bg-white border border-blue-100 rounded-xl p-1">
                                  {(['single', 'walkthrough', 'ai'] as const).map(mode => (
                                    <button key={mode} type="button" onClick={() => setAssistantMode(mode)}
                                      className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${assistantMode === mode ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-blue-50'}`}>
                                      {mode === 'single' ? 'Single' : mode === 'walkthrough' ? 'Walk' : 'AI'}
                                    </button>
                                  ))}
                                </div>

                                {/* Single note mode */}
                                {assistantMode === 'single' && (
                                  <>
                                    <p className="text-xs text-slate-500 leading-relaxed">Type an observation — get an instant status suggestion to apply to any item.</p>
                                    <textarea rows={3}
                                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500 resize-none bg-white"
                                      placeholder="e.g. Crack in foundation wall near corner…"
                                      value={singleNoteText} onChange={e => setSingleNoteText(e.target.value)} />
                                    {singleNoteText.trim() && (() => {
                                      const suggested = localDraftFromNote(singleNoteText);
                                      return (
                                        <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${FINDING_STATUS_CONFIG[suggested].color}`}>
                                          Suggested: {suggested}
                                        </div>
                                      );
                                    })()}
                                    <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500 bg-white"
                                      value={singleNoteRoom}
                                      onChange={e => { setSingleNoteRoom(e.target.value); setSingleNoteItem(''); }}>
                                      <option value="">Select room…</option>
                                      {activeRooms.map(r => <option key={r.room} value={r.room}>{r.room}</option>)}
                                    </select>
                                    <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500 bg-white disabled:opacity-50"
                                      value={singleNoteItem}
                                      onChange={e => setSingleNoteItem(e.target.value)} disabled={!singleNoteRoom}>
                                      <option value="">Select item…</option>
                                      {activeRooms.find(r => r.room === singleNoteRoom)?.items.map(item => (
                                        <option key={item} value={item}>{item}</option>
                                      ))}
                                    </select>
                                    <button type="button" disabled={!singleNoteText.trim() || !singleNoteRoom || !singleNoteItem}
                                      onClick={() => {
                                        const key = `${singleNoteRoom}||${singleNoteItem}`;
                                        const suggested = localDraftFromNote(singleNoteText);
                                        setLocalFindings(prev => ({ ...prev, [key]: { status: suggested, notes: singleNoteText.trim(), action: '', due: '', photos: [] } }));
                                        setSelectedChecklistRoom(singleNoteRoom);
                                        setSingleNoteText(''); setSingleNoteRoom(''); setSingleNoteItem('');
                                      }}
                                      className="w-full bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                                      Apply to item
                                    </button>
                                  </>
                                )}

                                {/* Walkthrough mode */}
                                {assistantMode === 'walkthrough' && (
                                  <>
                                    <p className="text-xs text-slate-500 leading-relaxed">Paste your walkthrough notes. The assistant splits them into findings and suggests a status for each.</p>
                                    <textarea rows={6}
                                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500 resize-none bg-white"
                                      placeholder={"Kitchen — cracked tile under sink\nRoof — missing shingles south side\nHVAC filter dirty\nGarage door auto-reverse fixed on site\n…"}
                                      value={walkthroughText} onChange={e => setWalkthroughText(e.target.value)} />
                                    <button type="button" disabled={!walkthroughText.trim()}
                                      onClick={() => {
                                        const roomNames = activeRooms.map(r => r.room);
                                        const lines = splitWalkthroughNotes(walkthroughText);
                                        const suggestions: WalkthroughSuggestion[] = lines.map(line => {
                                          const detectedRoom = detectRoomFromNote(line, roomNames, selectedChecklistRoom ?? activeRooms[0]?.room ?? null);
                                          const roomItems = detectedRoom ? (activeRooms.find(r => r.room === detectedRoom)?.items ?? []) : [];
                                          const bestItem = roomItems.length > 0 ? findBestChecklistItem(line, roomItems) : null;
                                          const matchedExistingItem = bestItem ? checklistMatchConfidence(line, bestItem) > 0 : false;
                                          const detectedItem = matchedExistingItem && bestItem ? bestItem : suggestedChecklistItemFromNote(line, detectedRoom ?? 'General');
                                          return {
                                            id: crypto.randomUUID(),
                                            rawText: line,
                                            detectedRoom,
                                            detectedItem,
                                            newChecklistItem: matchedExistingItem ? undefined : detectedItem,
                                            needsNewChecklistItem: !matchedExistingItem,
                                            suggestedStatus: localDraftFromNote(line),
                                            notes: line,
                                            accepted: null,
                                          };
                                        });
                                        setWalkthroughSuggestions(suggestions);
                                      }}
                                      className="w-full border border-slate-200 text-slate-600 bg-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50">
                                      <ClipboardList size={12} className="inline mr-1" /> Process notes
                                    </button>
                                    {walkthroughSuggestions.length > 0 && (
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-semibold text-slate-700">{walkthroughSuggestions.length} findings</p>
                                          <button type="button" className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                            onClick={() => {
                                              let firstRoom: string | null = null;
                                              let appliedCount = 0;
                                              walkthroughSuggestions.filter(s => s.accepted !== false).forEach(s => {
                                                const target = applySuggestionToFinding(s);
                                                if (target) {
                                                  appliedCount += 1;
                                                  if (!firstRoom) firstRoom = target.room;
                                                }
                                              });
                                              if (firstRoom) setSelectedChecklistRoom(firstRoom);
                                              if (appliedCount > 0) {
                                                setWalkthroughSuggestions([]);
                                                setWalkthroughText('');
                                              } else {
                                                setError('No matched findings could be applied to the current checklist. Try selecting the item manually or add the missing checklist item first.');
                                              }
                                            }}>Apply all matched</button>
                                        </div>
                                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                          {walkthroughSuggestions.map(s => (
                                            <div key={s.id} className={`bg-white border rounded-xl p-3 space-y-2 text-xs ${s.accepted === true ? 'border-emerald-300 bg-emerald-50/40' : s.accepted === false ? 'border-slate-200 opacity-40' : 'border-slate-200'}`}>
                                              <p className="text-slate-700 leading-relaxed">{s.rawText}</p>
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${FINDING_STATUS_CONFIG[s.suggestedStatus].color}`}>{s.suggestedStatus}</span>
                                                {s.detectedRoom && <span className="text-slate-500">{s.detectedRoom}{s.detectedItem ? ` › ${s.detectedItem.slice(0, 22)}…` : ''}</span>}
                                                {s.needsNewChecklistItem && <span className="text-amber-600">will create item</span>}
                                                {!s.detectedRoom && <span className="text-slate-400">No room matched</span>}
                                              </div>
                                              {s.accepted === null && (
                                                <div className="flex gap-1.5">
                                                  <button type="button" onClick={() => {
                                                    const target = applySuggestionToFinding(s);
                                                    if (!target) {
                                                      setError('That finding could not be matched to a current checklist item. Try selecting the item manually or add the missing checklist item first.');
                                                      return;
                                                    }
                                                    setWalkthroughSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, accepted: true, detectedRoom: target.room, detectedItem: target.item } : x));
                                                  }} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold">Apply</button>
                                                  <button type="button" onClick={() => setWalkthroughSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, accepted: false } : x))}
                                                    className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 font-semibold">Skip</button>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* AI mode */}
                                {assistantMode === 'ai' && (
                                  <>
                                    <p className="text-xs text-slate-500 leading-relaxed">Describe your observations. AI will suggest statuses, actions, and match findings to your checklist items.</p>
                                    <textarea rows={5}
                                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500 resize-none bg-white"
                                      placeholder="Describe what you observed during the inspection…"
                                      value={aiNoteText} onChange={e => setAiNoteText(e.target.value)} />
                                    <button type="button" disabled={!aiNoteText.trim() || aiProcessing}
                                      onClick={async () => {
                                        if (!supabase || !aiNoteText.trim()) return;
                                        setAiProcessing(true);
                                        try {
                                          const { data, error: fnErr } = await supabase.functions.invoke('inspection-ai', {
                                            body: { notes: aiNoteText, rooms: activeRooms.map(r => ({ room: r.room, items: r.items })) },
                                          });
                                          if (fnErr) throw fnErr;
                                          const roomNames = activeRooms.map(r => r.room);
                                          const aiResults = (data as Array<{ room: string; item: string; status: FindingStatus; notes: string; action: string }> || []).map(s => {
                                            const detectedRoom = activeRooms.find(r => r.room.toLowerCase() === s.room?.toLowerCase())?.room
                                              ?? detectRoomFromNote(`${s.room ?? ''} ${s.notes}`, roomNames, selectedChecklistRoom ?? activeRooms[0]?.room ?? null);
                                            const roomItems = detectedRoom ? (activeRooms.find(r => r.room === detectedRoom)?.items ?? []) : [];
                                            const exactItem = s.item
                                              ? roomItems.find(item => item.toLowerCase() === s.item.toLowerCase())
                                              : null;
                                            const bestItem = exactItem ?? (roomItems.length > 0 ? findBestChecklistItem(`${s.item ?? ''} ${s.notes}`, roomItems) : null);
                                            const matchedExistingItem = bestItem ? roomItems.includes(bestItem) && checklistMatchConfidence(`${s.item ?? ''} ${s.notes}`, bestItem) > 0 : false;
                                            const detectedItem = matchedExistingItem && bestItem
                                              ? bestItem
                                              : (s.item || suggestedChecklistItemFromNote(s.notes, detectedRoom ?? 'General'));
                                            return {
                                              id: crypto.randomUUID(),
                                              rawText: s.notes,
                                              detectedRoom,
                                              detectedItem,
                                              newChecklistItem: matchedExistingItem ? undefined : detectedItem,
                                              needsNewChecklistItem: !matchedExistingItem,
                                              suggestedStatus: s.status,
                                              notes: s.notes,
                                              suggestedAction: s.action,
                                              accepted: null as boolean | null,
                                            };
                                          });
                                          setWalkthroughSuggestions(aiResults);
                                          setAssistantMode('walkthrough');
                                        } catch {
                                          setError('AI suggestions unavailable. Ensure the inspection-ai edge function is deployed.');
                                        } finally {
                                          setAiProcessing(false);
                                        }
                                      }}
                                      className="w-full bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                                      {aiProcessing ? 'Getting AI suggestions…' : 'Get AI suggestions'}
                                    </button>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">Requires the <code className="bg-slate-100 px-1 rounded text-slate-500">inspection-ai</code> edge function.</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── REPORT SUB-TAB ── */}
                {inspectionSubTab === 'report' && (() => {
                  const reportRooms: InspectionRoomData[] = activeRooms.map(rm => ({
                    room: rm.room,
                    findings: rm.items.map(item => {
                      const key = `${rm.room}||${item}`;
                      const local = localFindings[key];
                      return { title: item, status: (local?.status ?? 'Pass') as FindingStatus, notes: local?.notes ?? '', action: local?.action ?? '', due: local?.due ?? '', photos: local?.photos ?? [] };
                    }),
                  }));
                  const allReportFindings = reportRooms.flatMap(r => r.findings);
                  const reportSummary = buildProfessionalReportSummary(reportRooms);
                  const statusCounts = Object.fromEntries(FINDING_STATUSES.map(s => [s, allReportFindings.filter(f => f.status === s).length])) as Record<FindingStatus, number>;
                  const openReportFindings = statusCounts.Urgent + statusCounts['Needs Repair'] + statusCounts.Monitor;
                  const clearedReportFindings = statusCounts.Pass + statusCounts['Fixed On Site'];
                  const reportPhotoCount = allReportFindings.reduce((count, finding) => count + (finding.photos?.length ?? 0), 0);
                  const urgentFindings = allReportFindings.filter(f => f.status === 'Urgent');
                  const repairFindings = allReportFindings.filter(f => f.status === 'Needs Repair');
                  const monitorFindings = allReportFindings.filter(f => f.status === 'Monitor');
                  const fixedFindings = allReportFindings.filter(f => f.status === 'Fixed On Site');
                  const findingsWithPhotos = allReportFindings.filter(f => (f.photos ?? []).length > 0);
                  const estimateSourceFindings = reportRooms.flatMap(roomData =>
                    roomData.findings
                      .filter(finding => finding.status === 'Urgent' || finding.status === 'Needs Repair')
                      .map(finding => ({ ...finding, room: roomData.room }))
                  );
                  const activeEstimateDraft = repairEstimateDrafts[activeInspection.id] ?? [];
                  const createRepairEstimateDraft = () => {
                    const lines = estimateSourceFindings.map(buildRepairEstimateLineDraft);
                    setRepairEstimateDrafts(prev => ({ ...prev, [activeInspection.id]: lines }));
                    setShowRepairEstimateDraft(true);
                    setEstimateDraftNotice(lines.length > 0
                      ? `Estimate draft created with ${lines.length} repair item${lines.length !== 1 ? 's' : ''}.`
                      : 'No urgent or repair items were found for an estimate draft.'
                    );
                  };
                  const updateRepairEstimateLine = (lineId: string, updates: Partial<RepairEstimateLineDraft>) => {
                    setRepairEstimateDrafts(prev => ({
                      ...prev,
                      [activeInspection.id]: (prev[activeInspection.id] ?? []).map(line => line.id === lineId ? { ...line, ...updates } : line),
                    }));
                  };
                  const finalSummaryText = inspectionSummary.trim() || buildInspectionSummaryText(reportRooms);
                  return (
                  <div className="grid gap-4 xl:grid-cols-[1fr_260px] items-start">
                    {/* Main report area */}
                    <div className="flex-1 min-w-0 space-y-4">

                      {/* Blue branded header card */}
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                          <div>
                            <p className="text-white font-bold text-lg">{contractor?.business_name || 'ServSync Field Work Report'}</p>
                            <p className="text-blue-200 text-sm">Field Work Report</p>
                          </div>
                          <div className="text-right">
                            {statusCounts.Urgent > 0 ? (
                              <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-red-500 text-white">{statusCounts.Urgent} Urgent</span>
                            ) : (statusCounts['Needs Repair'] + statusCounts.Monitor) > 0 ? (
                              <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-amber-400 text-amber-900">{statusCounts['Needs Repair'] + statusCounts.Monitor} Issues</span>
                            ) : (
                              <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-green-400 text-green-900">All Clear</span>
                            )}
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          <h2 className="font-bold text-slate-800 text-xl">{homeownerLabel}</h2>
                          {homeAddress && <p className="text-slate-500 text-sm">{homeAddress}</p>}
                          <p className="text-slate-400 text-xs mt-1">Prepared: {new Date(activeInspection.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                          <div className="grid grid-cols-3 gap-3 mt-4">
                            <div className="bg-slate-50 rounded-xl px-4 py-3">
                              <p className="text-xs text-slate-400 font-medium">Completed by</p>
                              <p className="text-sm text-slate-800 font-semibold mt-0.5 truncate">{contractor?.contact_name || contractor?.business_name || '—'}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-3">
                              <p className="text-xs text-slate-400 font-medium">Findings</p>
                              <p className="text-sm text-slate-800 font-semibold mt-0.5">{openReportFindings} open · {clearedReportFindings} cleared</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-3">
                              <p className="text-xs text-slate-400 font-medium">Photos</p>
                              <p className="text-sm text-slate-800 font-semibold mt-0.5">{reportPhotoCount}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Close / Reopen status banner */}
                      {activeInspection.status === 'draft' && (
                        <div className={`rounded-2xl border p-4 ${inspectionClosedForReview ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`text-sm font-bold ${inspectionClosedForReview ? 'text-emerald-800' : 'text-amber-800'}`}>
                                {inspectionClosedForReview ? 'Field work closed for review' : 'Field work still open'}
                              </p>
                              <p className={`text-xs mt-1 leading-relaxed ${inspectionClosedForReview ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {inspectionClosedForReview
                                  ? 'You can preview the PDF, edit the homeowner summary below, or finalize and file this field work. The homeowner sees nothing until you finalize.'
                                  : 'Close field work for review when you are done entering findings. Closing does not send anything yet; it locks the work and enables PDF preview and the summary editor.'}
                              </p>
                            </div>
                            {inspectionClosedForReview ? (
                              <button type="button" onClick={() => setInspectionClosedForReview(false)} className="text-xs font-semibold border border-emerald-200 text-emerald-700 bg-white px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors flex-shrink-0">
                                Reopen
                              </button>
                            ) : (
                              <button type="button" onClick={() => {
                                if (allReportFindings.length === 0) {
                                  setError('There are no checklist items yet. Add items in Checklist first.');
                                  return;
                                }
                                setInspectionSummary(prev => prev.trim() ? prev : buildInspectionSummaryText(reportRooms));
                                setInspectionClosedForReview(true);
                              }} className="text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0">
                                Close for Review
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Repair estimate draft */}
                      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="border-b border-slate-200 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Repair Estimate Draft</p>
                            <p className="mt-0.5 text-xs text-slate-500">Create a contractor-reviewed starting point from urgent and repair items. Pricing stays editable before anything is shared.</p>
                          </div>
                          <button
                            type="button"
                            disabled={estimateSourceFindings.length === 0}
                            onClick={createRepairEstimateDraft}
                            className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${estimateSourceFindings.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                          >
                            <Receipt size={13} />{activeEstimateDraft.length > 0 ? 'Refresh draft' : 'Create draft'}
                          </button>
                        </div>

                        <div className="p-4">
                          {estimateDraftNotice && (
                            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                              {estimateDraftNotice}
                            </div>
                          )}
                          {estimateSourceFindings.length === 0 ? (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                              <p className="text-sm font-semibold text-emerald-700">No estimate needed from this report.</p>
                              <p className="mt-1 text-xs leading-5 text-emerald-800">Only items marked Urgent or Needs Repair are pulled into estimate drafts.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs leading-5 text-amber-800">
                                  Draft only. The contractor should confirm scope, labor, material cost, and site conditions before sending pricing to the homeowner.
                                </p>
                                {activeEstimateDraft.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setShowRepairEstimateDraft(prev => !prev)}
                                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                                  >
                                    {showRepairEstimateDraft ? 'Hide draft' : 'Show draft'}
                                  </button>
                                )}
                              </div>

                              {activeEstimateDraft.length === 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <p className="text-sm font-semibold text-slate-950">{estimateSourceFindings.length} item{estimateSourceFindings.length !== 1 ? 's' : ''} ready for draft pricing</p>
                                  <p className="mt-1 text-xs text-slate-500">Create a draft when the report findings are ready to turn into an estimate.</p>
                                </div>
                              ) : showRepairEstimateDraft && (
                                <div className="space-y-3">
                                  {activeEstimateDraft.map((line, index) => (
                                    <div key={line.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Line {index + 1}</p>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{line.trade}</span>
                                      </div>
                                      <div className="grid gap-3 lg:grid-cols-2">
                                        <label className="block">
                                          <span className="text-xs font-medium text-slate-500">Issue</span>
                                          <input
                                            className={`${inputClass()} mt-1`}
                                            value={line.issue}
                                            onChange={e => updateRepairEstimateLine(line.id, { issue: e.target.value })}
                                          />
                                        </label>
                                        <label className="block">
                                          <span className="text-xs font-medium text-slate-500">Trade</span>
                                          <input
                                            className={`${inputClass()} mt-1`}
                                            value={line.trade}
                                            onChange={e => updateRepairEstimateLine(line.id, { trade: e.target.value })}
                                          />
                                        </label>
                                        <label className="block lg:col-span-2">
                                          <span className="text-xs font-medium text-slate-500">Homeowner-facing description</span>
                                          <textarea
                                            className={`${inputClass()} mt-1 min-h-[84px] resize-y`}
                                            value={line.description}
                                            onChange={e => updateRepairEstimateLine(line.id, { description: e.target.value })}
                                          />
                                        </label>
                                        <label className="block">
                                          <span className="text-xs font-medium text-slate-500">Pricing type</span>
                                          <select
                                            className={`${inputClass()} mt-1`}
                                            value={line.pricingType}
                                            onChange={e => updateRepairEstimateLine(line.id, { pricingType: e.target.value as EstimatePricingType })}
                                          >
                                            {(['Needs site visit', 'Diagnostic', 'Labor only', 'Labor + materials', 'Custom'] as EstimatePricingType[]).map(option => (
                                              <option key={option} value={option}>{option}</option>
                                            ))}
                                          </select>
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="block">
                                            <span className="text-xs font-medium text-slate-500">Low</span>
                                            <div className="mt-1 flex rounded-lg border border-slate-300 bg-white focus-within:border-blue-500">
                                              <span className="flex items-center px-3 text-sm font-semibold text-slate-500">$</span>
                                              <input
                                                className="min-w-0 flex-1 rounded-r-lg bg-transparent px-2 py-2 text-sm text-slate-950 outline-none"
                                                inputMode="decimal"
                                                value={line.lowEstimate}
                                                onChange={e => updateRepairEstimateLine(line.id, { lowEstimate: e.target.value })}
                                                placeholder="0"
                                              />
                                            </div>
                                          </label>
                                          <label className="block">
                                            <span className="text-xs font-medium text-slate-500">High</span>
                                            <div className="mt-1 flex rounded-lg border border-slate-300 bg-white focus-within:border-blue-500">
                                              <span className="flex items-center px-3 text-sm font-semibold text-slate-500">$</span>
                                              <input
                                                className="min-w-0 flex-1 rounded-r-lg bg-transparent px-2 py-2 text-sm text-slate-950 outline-none"
                                                inputMode="decimal"
                                                value={line.highEstimate}
                                                onChange={e => updateRepairEstimateLine(line.id, { highEstimate: e.target.value })}
                                                placeholder="0"
                                              />
                                            </div>
                                          </label>
                                        </div>
                                        <label className="block lg:col-span-2">
                                          <span className="text-xs font-medium text-slate-500">Contractor notes</span>
                                          <textarea
                                            className={`${inputClass()} mt-1 min-h-[76px] resize-y`}
                                            value={line.notes}
                                            onChange={e => updateRepairEstimateLine(line.id, { notes: e.target.value })}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Professional Summary card */}
                      <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <h3 className="font-semibold text-slate-800 text-sm">Professional Summary</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Summary of findings, on-site work, follow-ups, and preventative value.</p>
                          </div>
                          {urgentFindings.length > 0 && (
                            <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-600 shrink-0">Urgent Items Included</span>
                          )}
                        </div>

                        {/* Editable homeowner summary (only when closed for review + draft) */}
                        {activeInspection.status === 'draft' && inspectionClosedForReview && (
                          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Edit homeowner summary before filing</p>
                            <textarea
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500 resize-y min-h-[120px] bg-white"
                              value={inspectionSummary}
                              onChange={e => setInspectionSummary(e.target.value)}
                              placeholder="Write the plain-language summary the homeowner should see..."
                            />
                          </div>
                        )}

                        <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                          {reportSummary.intro && <p>{reportSummary.intro}</p>}
                          {reportSummary.urgentWithRoom.length > 0 ? (
                            <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3 text-red-800">
                              <p className="text-xs font-bold uppercase tracking-wide text-red-700 mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Urgent Priority Items</p>
                              <p className="font-medium">{reportSummary.urgentText}</p>
                              <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                                {reportSummary.urgentWithRoom.slice(0, 5).map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            reportSummary.urgentText && <p>{reportSummary.urgentText}</p>
                          )}
                          {reportSummary.fixedText && <p>{reportSummary.fixedText}</p>}
                          {reportSummary.followUpText && <p>{reportSummary.followUpText}</p>}
                          {reportSummary.savingsDetails.length > 0 && (
                            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-green-800">
                              <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1">Potential Cost Savings / Preventative Value</p>
                              <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                                {reportSummary.savingsDetails.map(detail => <li key={detail}>{detail}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Per-room findings */}
                      {reportRooms.every(r => r.findings.length === 0) && (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                          <p className="text-slate-400 text-sm">No findings or photos yet. Run an inspection first.</p>
                        </div>
                      )}
                      {reportRooms.map(roomData => {
                        if (roomData.findings.length === 0) return null;
                        const nonPass = roomData.findings.filter(f => f.status !== 'Pass');
                        const passWithNotes = roomData.findings.filter(f => f.status === 'Pass' && f.notes);
                        const passNoNotes = roomData.findings.filter(f => f.status === 'Pass' && !f.notes);
                        const pass = roomData.findings.filter(f => f.status === 'Pass');
                        const fixed = roomData.findings.filter(f => f.status === 'Fixed On Site');
                        const hasUrgent = nonPass.some(f => f.status === 'Urgent');
                        const openCount = roomData.findings.filter(f => f.status === 'Urgent' || f.status === 'Needs Repair').length;
                        const borderColorFor = (status: FindingStatus) =>
                          status === 'Urgent' ? '#dc2626' : status === 'Needs Repair' ? '#d97706' : status === 'Monitor' ? '#2563eb' : status === 'Fixed On Site' ? '#0f766e' : '#16a34a';
                        return (
                          <div key={roomData.room} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{getRoomInspectionIcon(roomData.room)}</span>
                                <div>
                                  <h3 className="font-semibold text-slate-800">{roomData.room}</h3>
                                  <p className="text-xs text-slate-400">
                                    {roomData.findings.length} checked · {pass.length + fixed.length} pass · {fixed.length} fixed · {openCount} open
                                  </p>
                                </div>
                              </div>
                              {hasUrgent ? (
                                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Urgent</span>
                              ) : openCount > 0 ? (
                                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Has Issues</span>
                              ) : (
                                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Clear</span>
                              )}
                            </div>
                            <div className="p-5 space-y-3">
                              {[...nonPass, ...passWithNotes].map((f, i) => (
                                <div key={i} className="border-l-4 rounded-r-xl overflow-hidden" style={{ borderLeftColor: borderColorFor(f.status) }}>
                                  <div className="pl-4 pr-4 py-3 bg-slate-50">
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="font-semibold text-slate-800 text-sm">{f.title}</p>
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${FINDING_STATUS_CONFIG[f.status].color}`}>{f.status}</span>
                                    </div>
                                    {f.notes && (
                                      <div className="bg-slate-100 rounded-lg px-3 py-2 mb-2">
                                        <p className="text-xs text-slate-500 font-medium mb-0.5">Observed</p>
                                        <p className="text-sm text-slate-700">{f.notes}</p>
                                      </div>
                                    )}
                                    {f.action && (
                                      <p className="text-sm text-blue-600 font-medium">{f.status === 'Fixed On Site' ? '✓ ' : '→ '}{f.action}</p>
                                    )}
                                    {f.due && <p className="text-xs text-slate-400 mt-1">Follow-up: {f.due}</p>}
                                    {(f.photos ?? []).length > 0 && (
                                      <div className="grid grid-cols-4 gap-2 mt-3">
                                        {(f.photos ?? []).map((url, pi) => (
                                          <img key={pi} src={url} alt={f.title} className="w-full h-20 object-cover rounded-lg" />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {passNoNotes.length > 0 && (
                                <div className="pt-2 border-t border-slate-100">
                                  <p className="text-xs text-slate-500"><span className="font-semibold text-emerald-600">Passed:</span> {passNoNotes.map(f => f.title).join(' · ')}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Helper: keep these unused-finding lists referenced for the photo total chip below */}
                      <div className="hidden">{repairFindings.length + monitorFindings.length + findingsWithPhotos.length + fixedFindings.length + finalSummaryText.length}</div>

                    </div>

                    {/* Right action sidebar (PP-style) */}
                    <div className="space-y-4 self-start xl:sticky xl:top-4">
                      <div className="bg-white rounded-2xl border border-slate-200 p-4">
                        <h3 className="font-semibold text-slate-800 text-sm mb-3">Room Summary</h3>
                        <div className="space-y-2">
                          {reportRooms.map(r => {
                            const rUrgent = r.findings.some(f => f.status === 'Urgent');
                            const rIssues = r.findings.filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;
                            const rFixed = r.findings.filter(f => f.status === 'Fixed On Site').length;
                            const photoCount = r.findings.reduce((c, f) => c + (f.photos?.length ?? 0), 0);
                            return (
                              <div key={r.room} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-700 truncate flex items-center gap-1">
                                    <span>{getRoomInspectionIcon(r.room)}</span>{r.room}
                                  </p>
                                  {photoCount > 0 && <p className="text-xs text-slate-400">{photoCount} photo{photoCount !== 1 ? 's' : ''}</p>}
                                </div>
                                {rIssues > 0 ? (
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${rUrgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{rIssues}</span>
                                ) : rFixed > 0 ? (
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">{rFixed} fixed</span>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                        <button
                          type="button"
                          disabled={activeInspection.status !== 'finalized'}
                          title={activeInspection.status !== 'finalized' ? 'Finalize the report first to send it to the homeowner.' : 'Send report to homeowner'}
                          className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send size={14} /> Send to Homeowner
                        </button>

                        {activeInspection.status === 'draft' ? (
                          <button
                            type="button"
                            disabled={!inspectionClosedForReview || finalizingInspection || !inspectionSummary.trim()}
                            onClick={() => void finalizeInspection(activeInspection)}
                            className="w-full bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 size={14} />
                            {finalizingInspection ? 'Finalizing…' : 'Finalize & File'}
                          </button>
                        ) : (
                          <div className="w-full rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center justify-center gap-2">
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-700">Filed to Documents</span>
                          </div>
                        )}

                        <p className="text-[11px] leading-relaxed text-slate-400 px-1">
                          Finalize saves this report to the homeowner's Documents and fires a notification. Send to Homeowner is enabled after filing.
                        </p>

                        <button
                          type="button"
                          disabled={activeInspection.status === 'draft' && !inspectionClosedForReview}
                          onClick={async () => {
                            const previewInsp: Inspection = activeInspection.status === 'finalized'
                              ? activeInspection
                              : { ...activeInspection, rooms_with_findings: reportRooms, summary: inspectionSummary };
                            await generateInspectionPdf(previewInsp, contractor?.business_name ?? '', homeownerLabel, homeAddress);
                          }}
                          className="w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Download size={14} />
                          {activeInspection.status === 'draft' && !inspectionClosedForReview ? 'Close to Preview PDF' : 'Download Preview PDF'}
                        </button>

                        <button
                          type="button"
                          disabled
                          title="Invoicing flow coming soon"
                          className="w-full flex items-center justify-center gap-2 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FileText size={14} /> Create Invoice
                        </button>

                        <button
                          type="button"
                          disabled
                          title="Standalone scheduling coming soon"
                          className="w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Calendar size={14} /> Schedule Next Visit
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })()}

              </div>
            );
          })()}

        </div>
      )}

    </SidebarLayout>
  );
}

function PlatformAdminDashboard({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [contractors, setContractors] = useState<ContractorProfile[]>([]);
  const [invites, setInvites] = useState<ContractorInvite[]>([]);
  const [connectionOverviews, setConnectionOverviews] = useState<PlatformConnectionOverview[]>([]);
  const [adminConnectionHistory, setAdminConnectionHistory] = useState<Record<string, ConnectionAuditEvent[]>>({});
  const [adminDrafts, setAdminDrafts] = useState<Record<string, AdminContractorDraft>>({});
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, InviteRewardDraft>>({});
  const [adminTab, setAdminTab] = useState<'overview' | 'contractors' | 'connections' | 'referrals' | 'support' | 'reports'>('overview');
  const [adminConnectionSearch, setAdminConnectionSearch] = useState('');
  const [adminConnectionStatusFilter, setAdminConnectionStatusFilter] = useState<'all' | ConnectionStatus>('all');
  const [supportInquiries, setSupportInquiries] = useState<SupportInquiry[]>([]);
  const [supportStatusFilter, setSupportStatusFilter] = useState<'all' | SupportInquiryStatus>('all');
  const [supportSearch, setSupportSearch] = useState('');
  const [adminSupportReplyDrafts, setAdminSupportReplyDrafts] = useState<Record<string, string>>({});
  const [savingSupportInquiryId, setSavingSupportInquiryId] = useState<string | null>(null);
  const [savingContractorId, setSavingContractorId] = useState<string | null>(null);
  const [savingInviteId, setSavingInviteId] = useState<string | null>(null);
  const [reportHealth, setReportHealth] = useState<AdminPlatformHealth | null>(null);
  const [reportRevenue, setReportRevenue] = useState<AdminRevenueRow[]>([]);
  const [reportGrowth, setReportGrowth] = useState<AdminGrowthRow[]>([]);
  const [reportActivity, setReportActivity] = useState<AdminContractorActivityRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAdmin = async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const [profilesRes, contractorsRes, connectionsRes, invitesRes, connectionOverviewRes, supportRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('contractor_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('homeowner_contractor_connections').select('status'),
        supabase.from('contractor_invites').select('*').order('created_at', { ascending: false }),
        supabase.rpc('servsync_admin_connection_overview'),
        supabase.from('support_inquiries').select('*, messages:support_inquiry_messages(*)').order('updated_at', { ascending: false }),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (contractorsRes.error) throw contractorsRes.error;
      if (connectionsRes.error) throw connectionsRes.error;
      if (invitesRes.error) throw invitesRes.error;
      if (connectionOverviewRes.error) throw connectionOverviewRes.error;

      const profiles = (profilesRes.data || []) as Profile[];
      const connections = (connectionsRes.data || []) as { status: string }[];
      const loadedInvites = (invitesRes.data || []) as ContractorInvite[];
      const loadedConnectionOverviews = (connectionOverviewRes.data || []) as PlatformConnectionOverview[];
      const adminConnectionIds = loadedConnectionOverviews.map(connection => connection.connection_id);
      const adminHistoryRes = adminConnectionIds.length
        ? await supabase
            .from('connection_audit_events')
            .select('*')
            .in('connection_id', adminConnectionIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (adminHistoryRes.error) throw adminHistoryRes.error;

      setProfiles(profiles);
      setOverview({
        homeowners: profiles.filter(item => item.role === 'homeowner').length,
        contractors: (contractorsRes.data || []).length,
        active_connections: connections.filter(item => item.status === 'active').length,
        pending_connections: connections.filter(item => item.status === 'pending').length,
        active_invites: loadedInvites.filter(item => item.status === 'active').length,
      });
      const loadedContractors = (contractorsRes.data || []) as ContractorProfile[];
      setContractors(loadedContractors);
      setInvites(loadedInvites);
      setConnectionOverviews(loadedConnectionOverviews);
      if (!supportRes.error) setSupportInquiries((supportRes.data || []) as SupportInquiry[]);
      setAdminConnectionHistory(groupConnectionHistory((adminHistoryRes.data || []) as ConnectionAuditEvent[]));
      setAdminDrafts(loadedContractors.reduce<Record<string, AdminContractorDraft>>((drafts, contractor) => {
        drafts[contractor.id] = adminDraftFromContractor(contractor);
        return drafts;
      }, {}));
      setInviteDrafts(loadedInvites.reduce<Record<string, InviteRewardDraft>>((drafts, invite) => {
        drafts[invite.id] = inviteDraftFromInvite(invite);
        return drafts;
      }, {}));
    } catch (err) {
      setError(readableError(err, 'Unable to load admin dashboard.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdmin();
  }, []);

  const loadReports = async () => {
    if (!supabase || reportsLoading) return;
    setReportsLoading(true);
    try {
      const [healthRes, revenueRes, growthRes, activityRes] = await Promise.all([
        supabase.rpc('servsync_admin_platform_health'),
        supabase.rpc('servsync_admin_revenue_breakdown'),
        supabase.rpc('servsync_admin_platform_growth'),
        supabase.rpc('servsync_admin_contractor_activity'),
      ]);
      if (healthRes.data)    setReportHealth(healthRes.data as AdminPlatformHealth);
      if (revenueRes.data)   setReportRevenue((revenueRes.data || []) as AdminRevenueRow[]);
      if (growthRes.data)    setReportGrowth((growthRes.data || []) as AdminGrowthRow[]);
      if (activityRes.data)  setReportActivity((activityRes.data || []) as AdminContractorActivityRow[]);
      setReportsLoaded(true);
    } catch (err) {
      setError(readableError(err, 'Unable to load reports.'));
    } finally {
      setReportsLoading(false);
    }
  };

  const updateAdminDraft = (contractorId: string, nextDraft: AdminContractorDraft) => {
    setAdminDrafts(current => ({
      ...current,
      [contractorId]: nextDraft,
    }));
  };

  const updateInviteDraft = (inviteId: string, nextDraft: InviteRewardDraft) => {
    setInviteDrafts(current => ({
      ...current,
      [inviteId]: nextDraft,
    }));
  };

  const saveAdminContractor = async (contractor: ContractorProfile) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setSavingContractorId(contractor.id);
    try {
      const draft = adminDrafts[contractor.id] || adminDraftFromContractor(contractor);
      const { error: updateError } = await supabase
        .from('contractor_profiles')
        .update({
          account_status: draft.account_status,
          subscription_status: draft.subscription_status,
          monthly_price_cents: dollarsToCents(draft.monthly_price),
          subscription_notes: draft.subscription_notes,
          admin_notes: draft.admin_notes,
        })
        .eq('id', contractor.id);
      if (updateError) throw updateError;
      setNotice(`${contractor.business_name || 'Contractor'} updated.`);
      await loadAdmin();
    } catch (err) {
      setError(readableError(err, 'Unable to update contractor account.'));
    } finally {
      setSavingContractorId(null);
    }
  };

  const saveInviteReward = async (invite: ContractorInvite) => {
    if (!supabase) return;
    setNotice('');
    setError('');
    setSavingInviteId(invite.id);
    try {
      const draft = inviteDrafts[invite.id] || inviteDraftFromInvite(invite);
      const { error: updateError } = await supabase
        .from('contractor_invites')
        .update({
          reward_status: draft.reward_status,
          reward_notes: draft.reward_notes,
        })
        .eq('id', invite.id);
      if (updateError) throw updateError;
      setNotice('Invite reward tracking updated.');
      await loadAdmin();
    } catch (err) {
      setError(readableError(err, 'Unable to update invite reward tracking.'));
    } finally {
      setSavingInviteId(null);
    }
  };

  const updateSupportInquiryStatus = async (inquiry: SupportInquiry, status: SupportInquiryStatus) => {
    if (!supabase) return;
    setSavingSupportInquiryId(inquiry.id);
    setNotice('');
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('support_inquiries')
        .update({ status })
        .eq('id', inquiry.id);
      if (updateError) throw updateError;
      if (status !== inquiry.status) {
        await supabase.from('support_inquiry_messages').insert({
          inquiry_id: inquiry.id,
          actor_user_id: null,
          actor_role: 'platform_admin',
          message_type: 'status_update',
          body: `Status changed to ${supportStatusLabel(status, 'admin')}.`,
        });
      }
      setNotice('Support inquiry updated.');
      await loadAdmin();
    } catch (err) {
      setError(readableError(err, 'Unable to update support inquiry.'));
    } finally {
      setSavingSupportInquiryId(null);
    }
  };

  const replyToSupportInquiryAsAdmin = async (inquiry: SupportInquiry) => {
    if (!supabase) return;
    const body = (adminSupportReplyDrafts[inquiry.id] || '').trim();
    if (!body) return;
    setSavingSupportInquiryId(inquiry.id);
    setNotice('');
    setError('');
    try {
      const { error: messageError } = await supabase.from('support_inquiry_messages').insert({
        inquiry_id: inquiry.id,
        actor_user_id: null,
        actor_role: 'platform_admin',
        message_type: 'admin_reply',
        body,
      });
      if (messageError) throw messageError;
      const { error: statusError } = await supabase
        .from('support_inquiries')
        .update({ status: 'waiting_on_user', last_admin_reply_at: new Date().toISOString() })
        .eq('id', inquiry.id);
      if (statusError) throw statusError;
      setAdminSupportReplyDrafts(current => ({ ...current, [inquiry.id]: '' }));
      setNotice('Reply sent.');
      await loadAdmin();
    } catch (err) {
      setError(readableError(err, 'Unable to send support reply.'));
    } finally {
      setSavingSupportInquiryId(null);
    }
  };

  const openSupportCount = supportInquiries.filter(inquiry => !['resolved', 'closed'].includes(inquiry.status)).length;
  const stats = [
    { label: 'Homeowners', value: overview?.homeowners ?? 0, icon: Home },
    { label: 'Contractors', value: overview?.contractors ?? 0, icon: Building2 },
    { label: 'Active Connections', value: overview?.active_connections ?? 0, icon: Link2 },
    { label: 'Active Invites', value: overview?.active_invites ?? 0, icon: Mail },
    { label: 'Open Support', value: openSupportCount, icon: MessageSquare },
  ];
  const connectionStatusCounts = connectionOverviews.reduce<Record<string, number>>((counts, connection) => {
    counts[connection.status] = (counts[connection.status] || 0) + 1;
    return counts;
  }, {});
  const filteredConnectionOverviews = connectionOverviews.filter(connection => {
    const search = adminConnectionSearch.trim().toLowerCase();
    const sourceLabel = connectionSourceLabel(connection.source).toLowerCase();
    const contractorName = (connection.contractor_name || '').toLowerCase();
    const matchesStatus = adminConnectionStatusFilter === 'all' || connection.status === adminConnectionStatusFilter;
    const matchesSearch = !search
      || contractorName.includes(search)
      || sourceLabel.includes(search)
      || connection.connection_id.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });
  const profileById = new Map(profiles.map(item => [item.id, item]));
  const filteredSupportInquiries = supportInquiries.filter(inquiry => {
    const requester = profileById.get(inquiry.requester_user_id);
    const search = supportSearch.trim().toLowerCase();
    const matchesStatus = supportStatusFilter === 'all' || inquiry.status === supportStatusFilter;
    const haystack = [
      inquiry.title,
      inquiry.category,
      inquiry.status,
      inquiry.requester_role,
      requester?.full_name,
      requester?.email,
      ...(inquiry.messages || []).map(message => message.body),
    ].filter(Boolean).join(' ').toLowerCase();
    return matchesStatus && (!search || haystack.includes(search));
  });

  return (
    <SidebarLayout
      brand={{ name: 'ServSync', subtitle: 'Admin Panel' }}
      tabs={[
        { id: 'overview',     label: 'Overview',    icon: <LayoutDashboard size={17} /> },
        { id: 'contractors',  label: 'Contractors', icon: <Building2 size={17} /> },
        { id: 'connections',  label: 'Connections', icon: <Users size={17} /> },
        { id: 'referrals',    label: 'Referrals',   icon: <Link2 size={17} /> },
        { id: 'support',      label: 'Support',     icon: <MessageSquare size={17} />, badge: openSupportCount },
        { id: 'reports',      label: 'Reports',     icon: <Receipt size={17} /> },
      ]}
      activeTab={adminTab}
      onChange={tab => {
        setAdminTab(tab as typeof adminTab);
        if (tab === 'reports' && !reportsLoaded) void loadReports();
      }}
      profile={{ id: '', email: '', role: 'platform_admin', full_name: 'Admin', email_notifications_enabled: false, created_at: '', updated_at: '' }}
      onSignOut={onSignOut}
    >
      {loading && <Notice tone="info" text="Loading platform overview..." />}
      {notice && <Notice tone="success" text={notice} />}
      {error && <Notice tone="error" text={error} />}

      {adminTab === 'overview' && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <OverviewCard
            key={label}
            icon={<Icon size={20} />}
            label={label}
            value={String(value)}
            helper={label === 'Contractors' ? 'Manage accounts' : label === 'Active Connections' ? 'Relationship health' : label === 'Active Invites' ? 'Track referral flow' : label === 'Open Support' ? 'User requests and replies' : 'Platform health'}
            onClick={() => setAdminTab(label === 'Contractors' ? 'contractors' : label === 'Active Connections' ? 'connections' : label === 'Active Invites' ? 'referrals' : label === 'Open Support' ? 'support' : 'overview')}
          />
        ))}
      </div>
      )}

      {adminTab === 'contractors' && (
      <Card title="Contractor accounts" icon={<Building2 size={18} />}>
        <div className="space-y-3">
          {contractors.length === 0 ? (
            <EmptyState text="No contractor accounts yet." />
          ) : (
            contractors.map(contractor => {
              const draft = adminDrafts[contractor.id] || adminDraftFromContractor(contractor);
              const isSaving = savingContractorId === contractor.id;

              return (
                <div key={contractor.id} className="rounded-xl border border-slate-700 bg-slate-700 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-bold text-white">{contractor.business_name || 'Unnamed contractor'}</p>
                      <p className="text-sm text-slate-400">{contractor.city}{contractor.state ? `, ${contractor.state}` : ''}</p>
                      <p className="mt-1 text-xs text-slate-400">{contractor.email || 'No email'} · {contractor.phone || 'No phone'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-400">{contractor.account_status}</span>
                      <span className="rounded-full bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-400">{contractor.subscription_status || 'trialing'}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-4">
                    <Field label="Account status">
                      <select
                        className={inputClass()}
                        value={draft.account_status}
                        onChange={event => updateAdminDraft(contractor.id, { ...draft, account_status: event.target.value as ContractorAccountStatus })}
                      >
                        {ACCOUNT_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </Field>
                    <Field label="Subscription">
                      <select
                        className={inputClass()}
                        value={draft.subscription_status}
                        onChange={event => updateAdminDraft(contractor.id, { ...draft, subscription_status: event.target.value as ContractorSubscriptionStatus })}
                      >
                        {SUBSCRIPTION_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </Field>
                    <Field label="Monthly price">
                      <input
                        className={inputClass()}
                        value={draft.monthly_price}
                        onChange={event => updateAdminDraft(contractor.id, { ...draft, monthly_price: event.target.value })}
                        placeholder="0.00"
                      />
                    </Field>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void saveAdminContractor(contractor)}
                        disabled={isSaving}
                        className={buttonClass('primary')}
                      >
                        <ClipboardCheck size={16} />
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <Field label="Subscription notes">
                      <textarea
                        className={inputClass()}
                        rows={3}
                        value={draft.subscription_notes}
                        onChange={event => updateAdminDraft(contractor.id, { ...draft, subscription_notes: event.target.value })}
                        placeholder="Billing plan, trial notes, Stripe notes later..."
                      />
                    </Field>
                    <Field label="Internal admin notes">
                      <textarea
                        className={inputClass()}
                        rows={3}
                        value={draft.admin_notes}
                        onChange={event => updateAdminDraft(contractor.id, { ...draft, admin_notes: event.target.value })}
                        placeholder="Private ServSync admin notes"
                      />
                    </Field>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
      )}

      {adminTab === 'connections' && (
      <Card title="Connection oversight" icon={<Link2 size={18} />}>
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <InfoBox label="Active" value={String(connectionStatusCounts.active || 0)} />
          <InfoBox label="Pending" value={String(connectionStatusCounts.pending || 0)} />
          <InfoBox label="Revoked" value={String(connectionStatusCounts.revoked || 0)} />
          <InfoBox label="Declined" value={String(connectionStatusCounts.declined || 0)} />
        </div>
        <p className="mb-4 text-sm text-slate-400">
          This view intentionally avoids homeowner names, contact information, addresses, and home details. It is for platform support and relationship health only.
        </p>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <Field label="Search contractor/source">
            <input
              className={inputClass()}
              value={adminConnectionSearch}
              onChange={event => setAdminConnectionSearch(event.target.value)}
              placeholder="Contractor name, source, or connection ID"
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass()}
              value={adminConnectionStatusFilter}
              onChange={event => setAdminConnectionStatusFilter(event.target.value as 'all' | ConnectionStatus)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="revoked">Revoked</option>
              <option value="declined">Declined</option>
            </select>
          </Field>
        </div>
        <div className="space-y-3">
          {connectionOverviews.length === 0 ? (
            <EmptyState text="No homeowner-contractor connections have been created yet." />
          ) : filteredConnectionOverviews.length === 0 ? (
            <EmptyState text="No connections match those filters." />
          ) : (
            filteredConnectionOverviews.map(connection => (
              <div key={connection.connection_id} className="rounded-xl border border-slate-700 bg-slate-700 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-bold text-white">{connection.contractor_name || 'Unnamed contractor'}</p>
                    <p className="mt-1 text-sm text-slate-400">{connectionSourceLabel(connection.source)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      connection.status === 'active'
                        ? 'bg-green-900/30 text-green-400'
                        : connection.status === 'pending'
                          ? 'bg-amber-900/30 text-amber-400'
                          : connection.status === 'revoked'
                            ? 'bg-slate-700 text-slate-400'
                            : 'bg-red-900/30 text-red-400'
                    }`}>
                      {connection.status}
                    </span>
                    <span className="rounded-full bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-400">
                      {connection.event_count} event{connection.event_count === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <InfoBox label="Created" value={formatDateTime(connection.created_at)} />
                  <InfoBox label="Last updated" value={formatDateTime(connection.updated_at)} />
                  <InfoBox label="Connection ID" value={connection.connection_id.slice(0, 8)} />
                </div>
                <div className="mt-4">
                  <ConnectionHistory events={adminConnectionHistory[connection.connection_id] || []} />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
      )}

      {adminTab === 'referrals' && (
      <Card title="Referral and invite tracking" icon={<Link2 size={18} />}>
        <div className="space-y-3">
          {invites.length === 0 ? (
            <EmptyState text="No contractor invite links have been created yet." />
          ) : (
            invites.map(invite => {
              const contractor = contractors.find(item => item.id === invite.contractor_id);
              const draft = inviteDrafts[invite.id] || inviteDraftFromInvite(invite);
              const isSaving = savingInviteId === invite.id;
              const used = invite.status === 'used' || Boolean(invite.used_by_homeowner_id);

              return (
                <div key={invite.id} className="rounded-xl border border-slate-700 bg-slate-700 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-bold text-white">{contractor?.business_name || 'Unknown contractor'}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Invite code</p>
                      <p className="mt-1 font-mono text-sm font-bold text-slate-800">{invite.invite_code}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${used ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}`}>
                        {invite.status}
                      </span>
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-400">
                        {draft.reward_status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <InfoBox label="Created" value={formatDateTime(invite.created_at)} />
                    <InfoBox label="Used" value={formatDateTime(invite.used_at)} />
                    <InfoBox label="Homeowner account" value={invite.used_by_homeowner_id ? `Created (${invite.used_by_homeowner_id.slice(0, 8)})` : 'Not used yet'} />
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr_auto]">
                    <Field label="Reward status">
                      <select
                        className={inputClass()}
                        value={draft.reward_status}
                        onChange={event => updateInviteDraft(invite.id, { ...draft, reward_status: event.target.value as ReferralRewardStatus })}
                      >
                        {REFERRAL_REWARD_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </Field>
                    <Field label="Reward notes">
                      <input
                        className={inputClass()}
                        value={draft.reward_notes}
                        onChange={event => updateInviteDraft(invite.id, { ...draft, reward_notes: event.target.value })}
                        placeholder="Why this referral does or does not count"
                      />
                    </Field>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void saveInviteReward(invite)}
                        disabled={isSaving}
                        className={buttonClass('primary')}
                      >
                        <ClipboardCheck size={16} />
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
      )}

      {adminTab === 'support' && (
        <AdminSupportInbox
          inquiries={filteredSupportInquiries}
          profiles={profiles}
          statusFilter={supportStatusFilter}
          onStatusFilterChange={setSupportStatusFilter}
          search={supportSearch}
          onSearchChange={setSupportSearch}
          replyDrafts={adminSupportReplyDrafts}
          onReplyDraftChange={(inquiryId, body) => setAdminSupportReplyDrafts(current => ({ ...current, [inquiryId]: body }))}
          onReply={inquiry => void replyToSupportInquiryAsAdmin(inquiry)}
          onStatusChange={(inquiry, status) => void updateSupportInquiryStatus(inquiry, status)}
          savingInquiryId={savingSupportInquiryId}
        />
      )}

      {adminTab === 'reports' && (
        <div className="space-y-5">
          {reportsLoading && <Notice tone="info" text="Loading reports…" />}

          {/* Health metrics */}
          {reportHealth && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Homeowners', value: reportHealth.total_homeowners },
                  { label: 'Total contractors', value: reportHealth.total_contractors },
                  { label: 'Active contractors', value: reportHealth.active_contractors },
                  { label: 'Active connections', value: reportHealth.active_connections },
                  { label: 'Service requests', value: reportHealth.total_service_requests },
                  { label: 'Closed requests', value: reportHealth.closed_service_requests },
                  { label: 'Total reviews', value: reportHealth.total_reviews },
                  { label: 'Discover posts', value: reportHealth.total_posts },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-white">{value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* KPI row */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Estimated MRR</p>
                  <p className="mt-1 text-3xl font-bold text-white">
                    ${(reportHealth.estimated_mrr_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-400/70">Active + trialing · no Stripe yet</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Close rate</p>
                  <p className="mt-1 text-3xl font-bold text-white">
                    {reportHealth.total_service_requests > 0
                      ? `${Math.round((reportHealth.closed_service_requests / reportHealth.total_service_requests) * 100)}%`
                      : '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Closed ÷ total requests</p>
                </div>
                <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Platform avg rating</p>
                  <p className="mt-1 text-3xl font-bold text-white">
                    {reportHealth.platform_avg_rating !== null ? reportHealth.platform_avg_rating.toFixed(2) : '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-400/70">Across {reportHealth.total_reviews} reviews</p>
                </div>
              </div>
            </>
          )}

          {/* Revenue breakdown */}
          {reportRevenue.length > 0 && (
            <Card title="Revenue breakdown" icon={<Receipt size={18} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4">Subscription</th>
                      <th className="pb-2 pr-4">Account</th>
                      <th className="pb-2 pr-4 text-right">Contractors</th>
                      <th className="pb-2 text-right">Monthly revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {reportRevenue.map((row, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-4 font-semibold text-slate-200 capitalize">{row.subscription_status}</td>
                        <td className="py-2 pr-4 text-slate-400 capitalize">{row.account_status}</td>
                        <td className="py-2 pr-4 text-right text-slate-300">{row.contractor_count}</td>
                        <td className="py-2 text-right font-semibold text-white">
                          ${(row.total_monthly_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Growth — last 6 months */}
          {reportGrowth.length > 0 && (
            <Card title="Growth — last 6 months" icon={<Users size={18} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4">Month</th>
                      <th className="pb-2 pr-4 text-right">Homeowners</th>
                      <th className="pb-2 pr-4 text-right">Contractors</th>
                      <th className="pb-2 pr-4 text-right">Connections</th>
                      <th className="pb-2 text-right">Requests</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {reportGrowth.map((row, i) => (
                      <tr key={i} className={i === reportGrowth.length - 1 ? 'font-semibold text-white' : ''}>
                        <td className="py-2 pr-4 text-slate-300">{row.month}</td>
                        <td className="py-2 pr-4 text-right text-slate-300">{row.new_homeowners}</td>
                        <td className="py-2 pr-4 text-right text-slate-300">{row.new_contractors}</td>
                        <td className="py-2 pr-4 text-right text-slate-300">{row.new_connections}</td>
                        <td className="py-2 text-right text-slate-300">{row.new_service_requests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Contractor activity */}
          {reportActivity.length > 0 && (
            <Card title="Contractor activity" icon={<Building2 size={18} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-3">Business</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2 pr-3 text-right">$/mo</th>
                      <th className="pb-2 pr-3 text-right">Conn.</th>
                      <th className="pb-2 pr-3 text-right">Req.</th>
                      <th className="pb-2 pr-3 text-right">Closed</th>
                      <th className="pb-2 pr-3 text-right">Reviews</th>
                      <th className="pb-2 pr-3 text-right">Rating</th>
                      <th className="pb-2 text-right">Posts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {reportActivity.map(row => (
                      <tr key={row.contractor_id} className="hover:bg-slate-700/30">
                        <td className="py-2 pr-3 font-semibold text-white">{row.business_name || '—'}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.account_status === 'active' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-700 text-slate-400'
                          }`}>{row.account_status}</span>
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-300">
                          {row.monthly_price_cents > 0 ? `$${(row.monthly_price_cents / 100).toFixed(0)}` : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-300">{row.connection_count}</td>
                        <td className="py-2 pr-3 text-right text-slate-300">{row.request_count}</td>
                        <td className="py-2 pr-3 text-right text-slate-300">{row.closed_request_count}</td>
                        <td className="py-2 pr-3 text-right text-slate-300">{row.review_count}</td>
                        <td className="py-2 pr-3 text-right text-slate-300">
                          {row.avg_rating !== null ? row.avg_rating.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 text-right text-slate-300">{row.post_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-end">
                <button type="button" onClick={() => void loadReports()} className={buttonClass('secondary')}>
                  <RotateCcw size={14} /> Refresh
                </button>
              </div>
            </Card>
          )}

          {reportsLoaded && !reportsLoading && !reportHealth && (
            <EmptyState text="No report data available yet." />
          )}
        </div>
      )}
    </SidebarLayout>
  );
}

function PermissionPicker({
  permissions,
  onChange,
}: {
  permissions: SharingPermissions;
  onChange: (permissions: SharingPermissions) => void;
}) {
  const options: { key: keyof SharingPermissions; label: string; help: string }[] = [
    { key: 'share_contact', label: 'Contact info', help: 'Name, phone, and email.' },
    { key: 'share_home_overview', label: 'Home overview', help: 'General home profile details.' },
    { key: 'share_address', label: 'Address', help: 'Exact street address.' },
    { key: 'share_preferred_vendors', label: 'Preferred vendors', help: 'Vendor list you choose to share.' },
    { key: 'share_photos', label: 'Photos', help: 'Photos uploaded later.' },
  ];

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {options.map(option => (
        <label key={option.key} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-300 hover:bg-blue-50">
          <input
            type="checkbox"
            checked={permissions[option.key]}
            onChange={event => onChange({ ...permissions, [option.key]: event.target.checked })}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          <span>
            <span className="block text-sm font-bold text-slate-900">{option.label}</span>
            <span className="block text-xs text-slate-500">{option.help}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ConnectionHistory({ events }: { events: ConnectionAuditEvent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          {open ? 'Hide connection history' : 'Show connection history'}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {events.length} event{events.length === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-200 p-4">
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">No history has been recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map(event => (
                <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800">{connectionEventLabel(event.event_type)}</p>
                  <p className="shrink-0 text-xs font-medium text-slate-400">{formatDateTime(event.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceCategoryAdvisor({
  value,
  onChange,
  allowedCategories,
  onApply,
}: {
  value: string;
  onChange: (value: string) => void;
  allowedCategories: string[];
  onApply: (category: string) => void;
}) {
  const suggestions = suggestServiceCategories(value, allowedCategories);
  const best = suggestions[0];

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-950">Not sure who to contact?</p>
          <p className="mt-1 text-sm text-slate-600">
            Describe the problem and ServSync will suggest the most likely contractor type. You can still choose a different service type.
          </p>
        </div>
        {best && (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 shadow-sm">
            Best match: {best.category}
          </span>
        )}
      </div>
      <div className="mt-3">
        <Field label="Describe the issue">
          <textarea
            className={`${inputClass()} min-h-[88px] resize-y bg-white`}
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder="Example: Water is dripping under my kitchen sink and the cabinet floor is wet."
          />
        </Field>
      </div>
      {value.trim() && (
        <div className="mt-3">
          {suggestions.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              I do not see a confident match yet. Add a little more detail, or choose a service type manually.
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <div key={suggestion.category} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white px-3 py-2">
                  <div>
                    <p className="text-sm font-bold text-slate-950">
                      {index === 0 ? 'Recommended contractor type: ' : 'Other possible type: '}
                      {suggestion.category}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {suggestion.reasons.length > 0
                        ? `Why: ${suggestion.reasons.join(', ')}`
                        : 'Based on the description.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => onApply(suggestion.category)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                    Use this type
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SupportInboxPanel({
  title,
  description,
  inquiries,
  draft,
  onDraftChange,
  replyDrafts,
  onReplyDraftChange,
  onCreate,
  onReply,
  saving,
}: {
  title: string;
  description: string;
  inquiries: SupportInquiry[];
  draft: { category: SupportInquiryCategory; title: string; body: string };
  onDraftChange: (draft: { category: SupportInquiryCategory; title: string; body: string }) => void;
  replyDrafts: Record<string, string>;
  onReplyDraftChange: (inquiryId: string, body: string) => void;
  onCreate: () => void;
  onReply: (inquiry: SupportInquiry) => void;
  saving: boolean;
}) {
  const [supportView, setSupportView] = useState<'active' | 'resolved' | 'all'>('active');
  const activeInquiries = inquiries.filter(inquiry => !['resolved', 'closed'].includes(inquiry.status));
  const resolvedInquiries = inquiries.filter(inquiry => ['resolved', 'closed'].includes(inquiry.status));
  const displayedInquiries = supportView === 'active'
    ? activeInquiries
    : supportView === 'resolved'
      ? resolvedInquiries
      : inquiries;

  return (
    <div className="space-y-4">
      <Card title={title} icon={<MessageSquare size={18} />}>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-slate-950">Send ServSync a message</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
            <Field label="Type">
              <select
                className={inputClass()}
                value={draft.category}
                onChange={event => onDraftChange({ ...draft, category: event.target.value as SupportInquiryCategory })}
              >
                {SUPPORT_CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Short title">
              <input
                className={inputClass()}
                value={draft.title}
                onChange={event => onDraftChange({ ...draft, title: event.target.value })}
                placeholder="Example: Add saved filters to service requests"
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Details">
              <textarea
                className={`${inputClass()} min-h-[110px] resize-y`}
                value={draft.body}
                onChange={event => onDraftChange({ ...draft, body: event.target.value })}
                placeholder="Tell us what you want changed, what you expected, or what would make this easier."
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCreate} disabled={saving || !draft.title.trim() || !draft.body.trim()} className={buttonClass('primary')}>
              <Send size={15} />
              {saving ? 'Sending...' : 'Send to ServSync'}
            </button>
            <p className="text-xs text-slate-500">You will see the thread below after it is received.</p>
          </div>
        </div>
      </Card>

      <Card title="Your support conversations" icon={<MessageSquare size={18} />}>
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {[
            { id: 'active' as const, label: 'Active', count: activeInquiries.length },
            { id: 'resolved' as const, label: 'Resolved', count: resolvedInquiries.length },
            { id: 'all' as const, label: 'All', count: inquiries.length },
          ].map(option => {
            const active = supportView === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSupportView(option.id)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-950 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${active ? 'text-blue-50' : 'text-slate-500'}`}>{option.label}</p>
                <p className="mt-1 text-xl font-bold">{option.count}</p>
              </button>
            );
          })}
        </div>
        {inquiries.length === 0 ? (
          <EmptyState text="No support inquiries yet." />
        ) : displayedInquiries.length === 0 ? (
          <EmptyState text={`No ${supportView} support conversations.`} />
        ) : (
          <div className="space-y-3">
            {displayedInquiries.map(inquiry => {
              const messages = [...(inquiry.messages || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              const disabled = ['resolved', 'closed'].includes(inquiry.status);
              return (
                <div key={inquiry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-950">{inquiry.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${supportStatusClass(inquiry.status)}`}>
                          {supportStatusLabel(inquiry.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {supportCategoryLabel(inquiry.category)} · Opened {formatDateTime(inquiry.created_at)} · Updated {formatDateTime(inquiry.updated_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {messages.map(message => {
                      const admin = message.actor_role === 'platform_admin';
                      return (
                        <div key={message.id} className={`rounded-xl border px-3 py-2 ${admin ? 'border-blue-100 bg-blue-50' : message.message_type === 'status_update' ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                              {admin ? 'ServSync' : 'You'}{message.message_type === 'status_update' ? ' · Status' : ''}
                            </p>
                            <p className="text-xs text-slate-400">{formatDateTime(message.created_at)}</p>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4">
                    <Field label={disabled ? 'Conversation closed' : 'Reply'}>
                      <textarea
                        className={`${inputClass()} min-h-[82px] resize-y`}
                        value={replyDrafts[inquiry.id] || ''}
                        onChange={event => onReplyDraftChange(inquiry.id, event.target.value)}
                        disabled={disabled}
                        placeholder={disabled ? 'Start a new inquiry if you need more help.' : 'Add more details or reply to ServSync...'}
                      />
                    </Field>
                    {!disabled && (
                      <button type="button" onClick={() => onReply(inquiry)} disabled={saving || !(replyDrafts[inquiry.id] || '').trim()} className={`${buttonClass('secondary')} mt-2`}>
                        <Send size={14} />
                        Send reply
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function AdminSupportInbox({
  inquiries,
  profiles,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  replyDrafts,
  onReplyDraftChange,
  onReply,
  onStatusChange,
  savingInquiryId,
}: {
  inquiries: SupportInquiry[];
  profiles: Profile[];
  statusFilter: 'all' | SupportInquiryStatus;
  onStatusFilterChange: (status: 'all' | SupportInquiryStatus) => void;
  search: string;
  onSearchChange: (search: string) => void;
  replyDrafts: Record<string, string>;
  onReplyDraftChange: (inquiryId: string, body: string) => void;
  onReply: (inquiry: SupportInquiry) => void;
  onStatusChange: (inquiry: SupportInquiry, status: SupportInquiryStatus) => void;
  savingInquiryId: string | null;
}) {
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const statusCounts = inquiries.reduce<Record<string, number>>((counts, inquiry) => {
    counts[inquiry.status] = (counts[inquiry.status] || 0) + 1;
    return counts;
  }, {});

  return (
    <Card title="Support inbox" icon={<MessageSquare size={18} />}>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <Field label="Search">
          <input
            className={inputClass()}
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search title, user, category, message..."
          />
        </Field>
        <Field label="Status">
          <select className={inputClass()} value={statusFilter} onChange={event => onStatusFilterChange(event.target.value as 'all' | SupportInquiryStatus)}>
            <option value="all">All statuses</option>
            {SUPPORT_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label} ({statusCounts[option.value] || 0})</option>)}
          </select>
        </Field>
      </div>

      {inquiries.length === 0 ? (
        <EmptyState text="No support inquiries match those filters." />
      ) : (
        <div className="space-y-3">
          {inquiries.map(inquiry => {
            const requester = profileById.get(inquiry.requester_user_id);
            const messages = [...(inquiry.messages || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const saving = savingInquiryId === inquiry.id;
            return (
              <div key={inquiry.id} className="rounded-xl border border-slate-700 bg-slate-700 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-white">{inquiry.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${supportStatusClass(inquiry.status)}`}>
                        {supportStatusLabel(inquiry.status, 'admin')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-300">
                      {requester?.full_name || requester?.email || inquiry.requester_user_id.slice(0, 8)} · {inquiry.requester_role}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {supportCategoryLabel(inquiry.category)} · Opened {formatDateTime(inquiry.created_at)} · Updated {formatDateTime(inquiry.updated_at)}
                    </p>
                  </div>
                  <Field label="Status">
                    <select
                      className={inputClass()}
                      value={inquiry.status}
                      onChange={event => onStatusChange(inquiry, event.target.value as SupportInquiryStatus)}
                      disabled={saving}
                    >
                      {SUPPORT_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="mt-4 space-y-2">
                  {messages.map(message => (
                    <div key={message.id} className={`rounded-xl border px-3 py-2 ${message.actor_role === 'platform_admin' ? 'border-blue-700/50 bg-blue-900/20' : message.message_type === 'status_update' ? 'border-slate-600 bg-slate-800/60' : 'border-slate-600 bg-slate-800'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                          {message.actor_role === 'platform_admin' ? 'ServSync' : inquiry.requester_role}{message.message_type === 'status_update' ? ' · Status' : ''}
                        </p>
                        <p className="text-xs text-slate-500">{formatDateTime(message.created_at)}</p>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{message.body}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <Field label="Admin reply">
                    <textarea
                      className={`${inputClass()} min-h-[90px] resize-y`}
                      value={replyDrafts[inquiry.id] || ''}
                      onChange={event => onReplyDraftChange(inquiry.id, event.target.value)}
                      placeholder="Reply to the user or ask for more details..."
                    />
                  </Field>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => onReply(inquiry)} disabled={saving || !(replyDrafts[inquiry.id] || '').trim()} className={buttonClass('primary')}>
                      <Send size={15} />
                      {saving ? 'Sending...' : 'Send reply'}
                    </button>
                    <button type="button" onClick={() => onStatusChange(inquiry, 'in_progress')} disabled={saving} className={buttonClass('secondary')}>
                      Mark in progress
                    </button>
                    <button type="button" onClick={() => onStatusChange(inquiry, 'resolved')} disabled={saving} className={buttonClass('secondary')}>
                      Mark resolved
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ServiceRequestQuoteCard({
  quote,
  showActions,
  isUpdating,
  onAccept,
  onDecline,
}: {
  quote: ServiceRequestQuote;
  showActions: boolean;
  isUpdating: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const statusStyle: Record<QuoteStatus, string> = {
    pending:  'border-amber-200 bg-amber-50',
    accepted: 'border-emerald-200 bg-emerald-50',
    declined: 'border-slate-200 bg-slate-50',
  };
  const badgeStyle: Record<QuoteStatus, string> = {
    pending:  'bg-amber-100 text-amber-700',
    accepted: 'bg-emerald-100 text-emerald-700',
    declined: 'bg-slate-200 text-slate-600',
  };

  return (
    <div className={`rounded-xl border p-4 ${statusStyle[quote.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Quote</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">
            ${(quote.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {quote.scope && <p className="mt-1 text-sm text-slate-600">{quote.scope}</p>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeStyle[quote.status]}`}>
          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
        </span>
      </div>
      {showActions && quote.status === 'pending' && onAccept && onDecline && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onAccept} disabled={isUpdating} className={buttonClass('primary')}>
            <CheckCircle2 size={16} />
            {isUpdating ? 'Updating...' : 'Accept quote'}
          </button>
          <button type="button" onClick={onDecline} disabled={isUpdating} className={buttonClass('secondary')}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function ServiceRequestAppointmentCard({
  appointment,
  proposedByLabel,
  nextActionLabel,
}: {
  appointment: ServiceRequestAppointment;
  proposedByLabel?: string;
  nextActionLabel?: string;
}) {
  const statusStyle: Record<AppointmentStatus, string> = {
    proposed:  'border-amber-200 bg-amber-50',
    confirmed: 'border-emerald-200 bg-emerald-50',
    completed: 'border-slate-200 bg-slate-50',
    cancelled: 'border-slate-200 bg-slate-50',
  };
  const badgeStyle: Record<AppointmentStatus, string> = {
    proposed:  'bg-amber-100 text-amber-700',
    confirmed: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-slate-200 text-slate-600',
    cancelled: 'bg-slate-200 text-slate-600',
  };
  const statusLabel: Record<AppointmentStatus, string> = {
    proposed:  'Proposed',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <div className={`rounded-xl border p-4 ${statusStyle[appointment.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            <Calendar size={12} className="mr-1 inline" />
            {proposedByLabel ?? 'Appointment'}
          </p>
          <p className="mt-1 text-base font-bold text-slate-950">
            {new Date(appointment.proposed_at).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </p>
          {appointment.notes && <p className="mt-1 text-sm text-slate-600">{appointment.notes}</p>}
          {nextActionLabel && <p className="mt-2 text-sm font-semibold text-slate-700">{nextActionLabel}</p>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeStyle[appointment.status]}`}>
          {statusLabel[appointment.status]}
        </span>
      </div>
    </div>
  );
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <span key={s} className={`text-base ${s <= rating ? 'text-amber-400' : 'text-slate-600'}`}>★</span>
      ))}
    </div>
  );
}

function MediaThumbnails({ items }: { items: ServiceRequestMedia[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map(item => {
          const { data } = supabase!.storage.from('service-request-media').getPublicUrl(item.storage_path);
          const url = data.publicUrl;
          const isVideo = item.content_type.startsWith('video/');
          return isVideo ? (
            <video
              key={item.id}
              src={url}
              controls
              className="h-24 w-40 rounded-lg border border-slate-600 object-cover bg-slate-900"
            />
          ) : (
            <button key={item.id} type="button" onClick={() => setLightbox(url)} className="shrink-0">
              <img
                src={url}
                alt={item.file_name}
                className="h-24 w-24 rounded-lg border border-slate-600 object-cover"
              />
            </button>
          );
        })}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Full size" className="max-h-full max-w-full rounded-xl shadow-2xl" />
        </div>
      )}
    </>
  );
}

function ServiceRequestMessages({ messages, media }: { messages: ServiceRequestSummary['messages']; media: ServiceRequestMedia[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-slate-400">No messages recorded yet.</p>;
  }

  const mediaByMessage: Record<string, ServiceRequestMedia[]> = {};
  const rootMedia: ServiceRequestMedia[] = [];
  for (const item of media) {
    if (item.message_id) {
      (mediaByMessage[item.message_id] ??= []).push(item);
    } else {
      rootMedia.push(item);
    }
  }

  return (
    <div className="space-y-2">
      {rootMedia.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Attachments</p>
          <MediaThumbnails items={rootMedia} />
        </div>
      )}
      {messages.map(message => (
        <div key={message.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
              {message.actor_role === 'contractor' ? 'Contractor' : message.actor_role === 'homeowner' ? 'Homeowner' : 'ServSync'}
            </p>
            <p className="text-xs font-medium text-slate-400">{formatDateTime(message.created_at)}</p>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p>
          {mediaByMessage[message.id] && <MediaThumbnails items={mediaByMessage[message.id]} />}
        </div>
      ))}
    </div>
  );
}

function PermissionChips({ permissions }: { permissions: SharingPermissions }) {
  const labels: { key: keyof SharingPermissions; label: string }[] = [
    { key: 'share_contact', label: 'Contact' },
    { key: 'share_home_overview', label: 'Home overview' },
    { key: 'share_address', label: 'Address' },
    { key: 'share_preferred_vendors', label: 'Vendors' },
    { key: 'share_photos', label: 'Photos' },
  ];
  const shared = labels.filter(item => permissions?.[item.key]);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {shared.length === 0 ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">No data shared</span>
      ) : (
        shared.map(item => (
          <span key={item.key} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {item.label}
          </span>
        ))
      )}
    </div>
  );
}

function SharedField({ label, value, allowed }: { label: string; value?: string | null; allowed: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${allowed ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        {!allowed && <Lock size={13} className="text-slate-400" />}
      </div>
      <p className={`mt-1 text-sm font-semibold ${allowed ? 'text-slate-950' : 'text-slate-500'}`}>
        {allowed ? value || 'Not provided' : 'Not shared'}
      </p>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MetricButton({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </button>
  );
}

function NotificationBell({
  notifications,
  unreadCount,
  onMarkRead,
  onOpenNotification,
}: {
  notifications: AppNotification[];
  unreadCount?: number;
  onMarkRead: (ids: string[]) => void;
  onOpenNotification?: (notification: AppNotification) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 64, left: 16, width: 352, maxHeight: 560 });
  const unread = unreadCount ?? notifications.filter(n => !n.read_at).length;

  const updatePanelPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 16;
    const gap = 8;
    const width = Math.min(352, window.innerWidth - margin * 2);
    const preferredHeight = Math.min(560, window.innerHeight - margin * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }
    left = Math.max(margin, left);

    let top = rect.bottom + gap;
    if (top + preferredHeight > window.innerHeight - margin) {
      top = rect.top - preferredHeight - gap;
    }
    top = Math.max(margin, top);
    const maxHeight = Math.max(220, Math.min(preferredHeight, window.innerHeight - top - margin));

    setPanelPosition({ top, left, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  const handleOpen = () => {
    if (!open) updatePanelPosition();
    setOpen(o => !o);
  };

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.read_at) onMarkRead([notification.id]);
    if ((notification.request_id || notification.estimate_id || notification.support_inquiry_id || notification.type.includes('support')) && onOpenNotification) {
      onOpenNotification(notification);
      setOpen(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-slate-300 transition hover:bg-slate-700"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="fixed z-[80] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{
            top: panelPosition.top,
            left: panelPosition.left,
            width: panelPosition.width,
            maxHeight: panelPosition.maxHeight,
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-950">Notifications</p>
              {unread > 0 && <p className="text-xs text-slate-500">{unread} unread</p>}
            </div>
            <div className="flex items-center gap-2">
              {notifications.some(notification => !notification.read_at) && (
                <button
                  type="button"
                  onClick={() => onMarkRead(notifications.filter(notification => !notification.read_at).map(notification => notification.id))}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                >
                  Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-900"><X size={15} /></button>
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-slate-200 overflow-y-auto">
              {notifications.map(n => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-blue-50 ${n.read_at ? 'opacity-65' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {!n.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />}
                          <p className="text-sm font-semibold text-slate-950">{n.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${notificationCategoryClass(n.type)}`}>
                            {notificationCategoryLabel(n.type)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(n.created_at)}</p>
                      </div>
                      {(n.request_id || n.estimate_id || n.support_inquiry_id || n.type.includes('support')) && <ArrowRight size={14} className="mt-1 shrink-0 text-slate-400" />}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ContractorPublicProfilePage({
  slug,
  currentProfile,
}: {
  slug: string;
  currentProfile: Profile | null;
}) {
  const [data, setData] = useState<ContractorPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestDone, setRequestDone] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !slug) { setNotFound(true); setLoading(false); return; }
      const { data: result, error } = await supabase.rpc('servsync_get_public_contractor_profile', { p_slug: slug });
      if (error || !result) { setNotFound(true); setLoading(false); return; }
      const profile = result as ContractorPublicProfile;
      setData(profile);

      if (currentProfile?.role === 'homeowner') {
        const { data: conn } = await supabase
          .from('homeowner_contractor_connections')
          .select('status')
          .eq('homeowner_user_id', currentProfile.id)
          .eq('contractor_id', profile.contractor_id)
          .maybeSingle();
        if (conn) setConnectionStatus(conn.status as string);
      }
      setLoading(false);
    };
    void load();
  }, [slug, currentProfile?.id]);

  const requestConnection = async () => {
    if (!supabase || !data || !currentProfile) return;
    setRequesting(true);
    try {
      const { data: conn, error } = await supabase
        .from('homeowner_contractor_connections')
        .insert({ homeowner_user_id: currentProfile.id, contractor_id: data.contractor_id, status: 'pending', source: 'homeowner_request' })
        .select('id')
        .single();
      if (error) throw error;
      if (conn?.id) {
        await supabase.from('connection_audit_events').insert({
          connection_id: conn.id,
          actor_user_id: currentProfile.id,
          event_type: 'connection_requested',
          event_details: { contractor_id: data.contractor_id, source: 'public_profile' },
        });
      }
      setConnectionStatus('pending');
      setRequestDone(true);
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
        Loading profile…
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-base font-bold text-slate-950">Contractor not found</p>
        <p className="mt-1 text-sm text-slate-500">This profile link may be incorrect or the contractor may no longer be active.</p>
        <button type="button" onClick={() => updateRoute('home')} className={`${buttonClass('secondary')} mt-4`}>
          Back to home
        </button>
      </div>
    );
  }

  const location = [data.city, data.state].filter(Boolean).join(', ');
  const hasCredentials = data.license_number || data.insurance_status || data.bonded_status;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header card */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Contractor profile</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">{data.business_name}</h1>
            {location && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin size={14} />
                {location}
              </p>
            )}
            {data.categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.categories.map(c => (
                  <span key={c} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{c}</span>
                ))}
              </div>
            )}
          </div>

          {data.avg_rating !== null && (
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-center">
              <p className="text-3xl font-bold text-slate-950">{data.avg_rating.toFixed(1)}</p>
              <StarDisplay rating={Math.round(data.avg_rating)} />
              <p className="mt-1 text-xs text-slate-500">{data.review_count} {data.review_count === 1 ? 'review' : 'reviews'}</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-5 border-t border-slate-200 pt-5">
          {currentProfile?.role === 'homeowner' && !connectionStatus && !requestDone && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-950">Connect before requesting service</p>
              <p className="mt-1 text-sm text-blue-800">
                Send a connection request first. After the contractor accepts, you choose what home information to share.
              </p>
              <button type="button" onClick={() => void requestConnection()} disabled={requesting} className={`${buttonClass('primary')} mt-3`}>
                <Link2 size={16} />
                {requesting ? 'Sending request…' : `Request connection with ${data.business_name}`}
              </button>
            </div>
          )}
          {currentProfile?.role === 'homeowner' && (connectionStatus || requestDone) && (
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                connectionStatus === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {connectionStatus === 'active' ? 'Connected' : 'Connection request sent'}
              </span>
              <button type="button" onClick={() => updateRoute('homeowner')} className={buttonClass('secondary')}>
                Go to my portal
              </button>
            </div>
          )}
          {currentProfile?.role === 'contractor' && (
            <p className="text-xs text-slate-500">You're viewing this as a contractor. Homeowners can request a connection from this page.</p>
          )}
        </div>
      </section>

      {/* About + credentials */}
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        {data.business_summary && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">About</p>
            <p className="text-sm leading-6 text-slate-700">{data.business_summary}</p>
            {data.website_url && (
              <a href={data.website_url} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">
                Visit website →
              </a>
            )}
          </section>
        )}

        {hasCredentials && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Credentials</p>
            <div className="space-y-2 text-sm">
              {data.license_number && (
                <div className="flex items-center gap-2 text-slate-700">
                  <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
                  <span>Licensed · {data.license_number}</span>
                </div>
              )}
              {data.insurance_status && (
                <div className="flex items-center gap-2 text-slate-700">
                  <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
                  <span>Insured · {data.insurance_status}</span>
                </div>
              )}
              {data.bonded_status && (
                <div className="flex items-center gap-2 text-slate-700">
                  <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
                  <span>Bonded · {data.bonded_status}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Reviews */}
      {data.reviews.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Reviews ({data.review_count})
          </p>
          <div className="space-y-3">
            {data.reviews.map((review, i) => (
              <PublicReviewCard key={i} review={review} />
            ))}
          </div>
        </section>
      )}

      {data.reviews.length === 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-slate-500">No reviews yet. Completed ServSync work can add trust signals here over time.</p>
        </section>
      )}
    </div>
  );
}

function DiscoverFeed({
  perspective,
  userId,
  contractorId,
  connections,
  onConnectionRequested,
  onRequestService,
}: {
  perspective: 'homeowner' | 'contractor';
  userId: string;
  contractorId: string | null;
  connections: HomeownerConnection[];
  onConnectionRequested?: () => void | Promise<void>;
  onRequestService?: (contractorId: string, category: string) => void;
}) {
  const [feed, setFeed] = useState<DiscoverFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  const [postDraft, setPostDraft] = useState({ category: '', title: '', description: '', city: '', state: '' });
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [postFileInput, setPostFileInput] = useState<HTMLInputElement | null>(null);
  const [posting, setPosting] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [postNotice, setPostNotice] = useState('');
  const [postError, setPostError] = useState('');

  const [requestingContractorId, setRequestingContractorId] = useState<string | null>(null);
  const [localConnectionStatuses, setLocalConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const loadFeed = async () => {
    if (!supabase) return;
    setFeedLoading(true);
    try {
      const { data, error } = await supabase.rpc('servsync_discover_feed', {
        p_category: filterCategory || null,
        p_location: filterLocation || null,
      });
      if (error) throw error;
      setFeed((data || []) as DiscoverFeedItem[]);
    } catch {
      // silently show empty
    } finally {
      setFeedLoading(false);
    }
  };

  useEffect(() => { void loadFeed(); }, []);

  const kudosCounts = (reviews: PublicReview[]) => {
    const counts: Record<string, number> = {};
    reviews.forEach(r => r.kudos.forEach(k => { counts[k] = (counts[k] ?? 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const uploadPostPhotos = async (files: File[]): Promise<string[]> => {
    if (!supabase || files.length === 0) return [];
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `${userId}/posts/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('service-request-media')
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('service-request-media').getPublicUrl(storagePath);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const submitPost = async () => {
    if (!supabase) return;
    if (!postDraft.title.trim()) { setPostError('Add a title before posting.'); return; }
    setPosting(true);
    setPostError('');
    setPostNotice('');
    try {
      const photoUrls = await uploadPostPhotos(postFiles);
      const { error } = await supabase.rpc('servsync_create_contractor_post', {
        p_category: postDraft.category,
        p_title: postDraft.title.trim(),
        p_description: postDraft.description.trim(),
        p_photos: photoUrls,
        p_city: postDraft.city.trim(),
        p_state: postDraft.state.trim(),
      });
      if (error) throw error;
      setPostDraft({ category: '', title: '', description: '', city: '', state: '' });
      setPostFiles([]);
      setPostNotice('Post shared to the feed.');
      await loadFeed();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Unable to share post.');
    } finally {
      setPosting(false);
    }
  };

  const deletePost = async (postId: string) => {
    if (!supabase) return;
    setDeletingPostId(postId);
    try {
      await supabase.rpc('servsync_delete_contractor_post', { p_post_id: postId });
      setFeed(prev => prev.filter(p => p.post_id !== postId));
    } finally {
      setDeletingPostId(null);
    }
  };

  const requestConnection = async (item: DiscoverFeedItem) => {
    if (!supabase) return;
    setRequestingContractorId(item.contractor_id);
    setActionNotice('');
    setActionError('');
    try {
      const { error } = await supabase.from('homeowner_contractor_connections').insert({
        homeowner_user_id: userId,
        contractor_id: item.contractor_id,
        status: 'pending',
        source: 'homeowner_request',
      });
      if (error) throw error;
      const { data: connData } = await supabase
        .from('homeowner_contractor_connections')
        .select('id')
        .eq('homeowner_user_id', userId)
        .eq('contractor_id', item.contractor_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (connData?.id) {
        await supabase.from('connection_audit_events').insert({
          connection_id: connData.id,
          actor_user_id: userId,
          event_type: 'connection_requested',
          event_details: { contractor_id: item.contractor_id, source: 'discover' },
        });
      }
      setLocalConnectionStatuses(prev => ({ ...prev, [item.contractor_id]: 'pending' }));
      setActionNotice(`Connection request sent to ${item.business_name}.`);
      await onConnectionRequested?.();
    } catch (err) {
      setActionError(readableError(err, 'Unable to request that connection.'));
    } finally {
      setRequestingContractorId(null);
    }
  };

  const existingConnectionMap = connections.reduce<Record<string, ConnectionStatus>>((map, c) => {
    map[c.contractor_id] = c.status;
    return map;
  }, { ...localConnectionStatuses });

  const keywordTerms = normalizeText(filterKeyword).split(' ').filter(Boolean);
  const visibleFeed = keywordTerms.length === 0
    ? feed
    : feed.filter(item => {
      const searchableText = normalizeText([
        item.title,
        item.description,
        item.business_name,
        item.post_category,
        item.business_summary,
        item.contractor_city,
        item.contractor_state,
        item.categories.join(' '),
        item.reviews.map(review => [review.body, review.kudos.join(' ')].join(' ')).join(' '),
      ].join(' '));
      return keywordTerms.every(term => searchableText.includes(term));
    });

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Search work, contractor, keyword"
              value={filterKeyword}
              onChange={e => setFilterKeyword(e.target.value)}
            />
          </div>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {SERVICE_REQUEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative">
            <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="City or state"
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void loadFeed()}
            />
          </div>
          <button
            type="button"
            onClick={() => void loadFeed()}
            disabled={feedLoading}
            className={buttonClass('primary')}
          >
            {feedLoading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </div>
      {actionNotice && <Notice tone="success" text={actionNotice} />}
      {actionError && <Notice tone="error" text={actionError} />}

      {/* Contractor: share a job */}
      {perspective === 'contractor' && contractorId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-bold text-slate-950">Share a job to the feed</p>
          {postNotice && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{postNotice}</div>}
          {postError && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{postError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select className={inputClass()} value={postDraft.category} onChange={e => setPostDraft(d => ({ ...d, category: e.target.value }))}>
                <option value="">Select category</option>
                {SERVICE_REQUEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Title">
              <input className={inputClass()} placeholder="e.g. New roof installation" value={postDraft.title} onChange={e => setPostDraft(d => ({ ...d, title: e.target.value }))} />
            </Field>
            <Field label="City">
              <input className={inputClass()} placeholder="City of job" value={postDraft.city} onChange={e => setPostDraft(d => ({ ...d, city: e.target.value }))} />
            </Field>
            <Field label="State">
              <AutocompleteInput
                id="discover-post-state"
                value={postDraft.state}
                onChange={state => setPostDraft(d => ({ ...d, state }))}
                options={US_STATE_OPTIONS}
                placeholder="Start typing a state..."
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className={inputClass()} rows={3} placeholder="Describe the work, materials, results…" value={postDraft.description} onChange={e => setPostDraft(d => ({ ...d, description: e.target.value }))} />
              </Field>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={el => setPostFileInput(el)}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                setPostFiles(prev => [...prev, ...files]);
                e.target.value = '';
              }}
            />
            <button type="button" onClick={() => postFileInput?.click()} className={buttonClass('secondary')}>
              <Paperclip size={15} /> Add photos
            </button>
            {postFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {postFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {f.name}
                    <button type="button" onClick={() => setPostFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <button type="button" onClick={() => void submitPost()} disabled={posting} className={buttonClass('primary')}>
              {posting ? 'Sharing...' : 'Share to feed'}
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      {!feedLoading && visibleFeed.length === 0 && (
        <EmptyState text={feed.length === 0 ? 'No posts in the feed yet. Be the first to share a job!' : 'No posts match those filters yet.'} />
      )}

      {visibleFeed.map(item => {
        const isExpanded = expandedPostId === item.post_id;
        const isOwnPost = item.contractor_id === contractorId;
        const topKudos = kudosCounts(item.reviews).slice(0, 4);
        const existingStatus = existingConnectionMap[item.contractor_id];

        return (
          <div key={item.post_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Card header */}
            <div className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Contractor info */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-950">{item.business_name}</span>
                    {item.post_category && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{item.post_category}</span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={12} className="shrink-0" />
                    {[item.contractor_city, item.contractor_state].filter(Boolean).join(', ') || 'Location not listed'}
                    {item.categories.length > 0 && <span className="ml-2 text-slate-500">· {item.categories.slice(0,3).join(', ')}</span>}
                  </p>

                  {/* Post title */}
                  <p className="mt-2 text-base font-semibold text-slate-950">{item.title}</p>
                  {item.description && (
                    <p className="mt-1 text-sm text-slate-600 line-clamp-2">{item.description}</p>
                  )}

                  {/* Photo strip */}
                  {item.photos.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {item.photos.slice(0, 4).map((url, i) => (
                        <img key={i} src={url} alt="" className="h-24 w-24 shrink-0 rounded-xl border border-slate-200 object-cover" />
                      ))}
                    </div>
                  )}

                  {/* Kudos chips */}
                  {topKudos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {topKudos.map(([k, count]) => (
                        <span key={k} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {k} <span className="opacity-60">×{count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rating + actions */}
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {item.avg_rating !== null && (
                    <div className="flex items-center gap-1">
                      <StarDisplay rating={Math.round(item.avg_rating)} />
                      <span className="text-sm font-bold text-slate-950">{item.avg_rating.toFixed(1)}</span>
                    </div>
                  )}
                  {item.review_count > 0 && (
                    <p className="text-xs text-slate-500">{item.review_count} {item.review_count === 1 ? 'review' : 'reviews'}</p>
                  )}

                  {perspective === 'homeowner' && !existingStatus && (
                    <button
                      type="button"
                      disabled={requestingContractorId === item.contractor_id}
                      onClick={() => void requestConnection(item)}
                      className={buttonClass('primary')}
                    >
                      {requestingContractorId === item.contractor_id ? 'Sending...' : 'Request connection'}
                    </button>
                  )}
                  {perspective === 'homeowner' && existingStatus === 'active' && (
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Connected
                      </span>
                      <button
                        type="button"
                        onClick={() => onRequestService?.(item.contractor_id, item.post_category || item.categories[0] || 'General Maintenance')}
                        className={buttonClass('primary')}
                      >
                        Request service
                      </button>
                    </div>
                  )}
                  {perspective === 'homeowner' && existingStatus && existingStatus !== 'active' && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      Pending
                    </span>
                  )}
                  {isOwnPost && (
                    <button
                      type="button"
                      disabled={deletingPostId === item.post_id}
                      onClick={() => void deletePost(item.post_id)}
                      className="text-xs text-slate-500 transition-colors hover:text-red-500"
                    >
                      {deletingPostId === item.post_id ? 'Deleting…' : 'Delete post'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedPostId(isExpanded ? null : item.post_id)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
                  >
                    {isExpanded ? 'Less' : 'More'}
                    <ChevronDown size={13} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="space-y-4 border-t border-slate-200 px-5 pb-5 pt-4">
                {item.description && (
                  <p className="text-sm text-slate-700">{item.description}</p>
                )}
                {item.photos.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Photos</p>
                    <div className="flex flex-wrap gap-2">
                      {item.photos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt="" className="h-32 w-32 rounded-xl border border-slate-200 object-cover transition-opacity hover:opacity-90" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {item.business_summary && (
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">About {item.business_name}</p>
                    <p className="text-sm text-slate-700">{item.business_summary}</p>
                  </div>
                )}
                {item.reviews.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Recent reviews</p>
                    <div className="space-y-2">
                      {item.reviews.map((review, i) => (
                        <PublicReviewCard key={i} review={review} />
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-slate-500">Posted {new Date(item.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SidebarLayout({
  tabs,
  activeTab,
  onChange,
  actions,
  children,
  brand,
  profile,
  onSignOut,
}: {
  tabs: { id: string; label: string; icon: React.ReactNode; badge?: number; group?: string }[];
  activeTab: string;
  onChange: (id: string) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  brand: { name: string; subtitle: string };
  profile: Profile;
  onSignOut: () => Promise<void>;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeTabMeta = tabs.find(tab => tab.id === activeTab);
  const groupedTabs = tabs.reduce<Array<{ group: string; tabs: typeof tabs }>>((groups, tab) => {
    const groupName = tab.group || 'Navigation';
    const existing = groups.find(group => group.group === groupName);
    if (existing) {
      existing.tabs.push(tab);
    } else {
      groups.push({ group: groupName, tabs: [tab] });
    }
    return groups;
  }, []);

  const renderTabButton = (tab: (typeof tabs)[number]) => (
    <button
      key={tab.id}
      type="button"
      onClick={() => { onChange(tab.id); setMobileOpen(false); }}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
        activeTab === tab.id
          ? 'bg-blue-600 text-white'
          : 'text-slate-400 hover:bg-slate-700 hover:text-white'
      }`}
    >
      <span className="shrink-0 opacity-80">{tab.icon}</span>
      <span className="flex-1 truncate">{tab.label}</span>
      {tab.badge !== undefined && tab.badge > 0 && (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-bold text-white">
          {tab.badge > 99 ? '99+' : tab.badge}
        </span>
      )}
    </button>
  );

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col bg-slate-800 border-r border-slate-700">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700 shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shrink-0">
          <ShieldCheck size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white leading-tight text-sm truncate">{brand.name}</p>
          <p className="text-xs text-slate-400 truncate">{brand.subtitle}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groupedTabs.map(group => (
          <div key={group.group}>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {group.group}
            </p>
            <div className="space-y-0.5">
              {group.tabs.map(renderTabButton)}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-700 px-2 py-3 shrink-0 space-y-1">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-700 transition-colors group">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
            {(profile.full_name || profile.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate leading-tight">{profile.full_name || profile.email}</p>
            <p className="text-xs text-slate-400 capitalize truncate">{profile.role.replace('_', ' ')}</p>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="shrink-0 text-slate-400 hover:text-white transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex w-64 flex-col shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden shrink-0">
          <button type="button" onClick={() => setMobileOpen(true)} className="text-slate-600 hover:text-blue-700 transition-colors">
            <Menu size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-950 text-sm leading-tight">{brand.name}</p>
            <p className="text-xs text-slate-500 truncate">{activeTabMeta?.label || brand.subtitle}</p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">
            <div className="hidden items-center justify-between gap-4 md:flex">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">{activeTabMeta?.group || brand.subtitle}</p>
                <h1 className="mt-1 text-xl font-bold text-slate-950">{activeTabMeta?.label || brand.subtitle}</h1>
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}


function OverviewCard({
  icon,
  label,
  value,
  helper,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
        {icon}
      </div>
      <p className="mt-4 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </button>
  );
}


function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{icon}</div>
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AutocompleteInput({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <>
      <input
        className={inputClass()}
        list={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={id}>
        {options.map(option => <option key={option} value={option} />)}
      </datalist>
    </>
  );
}

function ServiceCategorySelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (categories: string[]) => void;
}) {
  const [customCategory, setCustomCategory] = useState('');
  const selectedLower = new Set(selected.map(category => category.toLowerCase()));
  const customSelected = selected.filter(category => !TRADE_OPTIONS.some(option => option.toLowerCase() === category.toLowerCase()));

  const setCategory = (category: string, checked: boolean) => {
    const cleaned = category.trim();
    if (!cleaned) return;
    if (checked) {
      if (selectedLower.has(cleaned.toLowerCase())) return;
      onChange([...selected, cleaned]);
      return;
    }
    onChange(selected.filter(item => item.toLowerCase() !== cleaned.toLowerCase()));
  };

  const addCustomCategory = () => {
    const cleaned = customCategory.trim();
    if (!cleaned) return;
    setCategory(cleaned, true);
    setCustomCategory('');
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TRADE_OPTIONS.map(category => (
          <label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-blue-500 hover:bg-blue-50">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
              checked={selectedLower.has(category.toLowerCase())}
              onChange={event => setCategory(category, event.target.checked)}
            />
            <span>{category}</span>
          </label>
        ))}
      </div>

      {customSelected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customSelected.map(category => (
            <button
              key={category}
              type="button"
              onClick={() => setCategory(category, false)}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              title="Remove custom service"
            >
              {category}
              <X size={12} />
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className={inputClass()}
          value={customCategory}
          onChange={event => setCustomCategory(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCustomCategory();
            }
          }}
          placeholder="Create a service category if it is not listed"
        />
        <button type="button" onClick={addCustomCategory} className={buttonClass('secondary')}>
          <Plus size={14} /> Add service
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Notice({ tone, text }: { tone: 'success' | 'error' | 'info'; text: string }) {
  const style = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  }[tone];

  return <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${style}`}>{text}</div>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-medium text-slate-500">
      {text}
    </div>
  );
}

function CalendarView({
  requests,
  perspective,
  onOpenRequest,
}: {
  requests: ServiceRequestSummary[];
  perspective: 'homeowner' | 'contractor';
  onOpenRequest?: (request: ServiceRequestSummary) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string | null>(todayKey);

  type ApptEntry = { request: ServiceRequestSummary; appointment: ServiceRequestAppointment };
  const apptMap: Record<string, ApptEntry[]> = {};
  const appointments: ApptEntry[] = [];
  for (const r of requests) {
    if (r.appointment) {
      const d = new Date(r.appointment.proposed_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!apptMap[key]) apptMap[key] = [];
      const entry = { request: r, appointment: r.appointment };
      apptMap[key].push(entry);
      appointments.push(entry);
    }
  }
  appointments.sort((a, b) => new Date(a.appointment.proposed_at).getTime() - new Date(b.appointment.proposed_at).getTime());
  Object.values(apptMap).forEach(dayEntries => {
    dayEntries.sort((a, b) => new Date(a.appointment.proposed_at).getTime() - new Date(b.appointment.proposed_at).getTime());
  });

  const upcoming = appointments.filter(({ appointment }) =>
    new Date(appointment.proposed_at).getTime() >= now.getTime()
    && !['cancelled', 'completed'].includes(appointment.status)
  );
  const proposedForMe = appointments.filter(({ appointment }) =>
    appointment.status === 'proposed' && appointment.proposed_by !== perspective
  );
  const confirmed = appointments.filter(({ appointment }) => appointment.status === 'confirmed');
  const completed = appointments.filter(({ appointment }) => appointment.status === 'completed');

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  };

  const appointmentStatusClass = (status: AppointmentStatus) => {
    if (status === 'confirmed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'completed') return 'border-blue-200 bg-blue-50 text-blue-800';
    if (status === 'cancelled') return 'border-red-200 bg-red-50 text-red-800';
    return 'border-amber-200 bg-amber-50 text-amber-800';
  };

  const appointmentDotClass = (status: AppointmentStatus) => {
    if (status === 'confirmed') return 'bg-emerald-500';
    if (status === 'completed') return 'bg-blue-500';
    if (status === 'cancelled') return 'bg-red-400';
    return 'bg-amber-500';
  };

  const statusLabel: Record<AppointmentStatus, string> = {
    proposed: 'Proposed',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  const renderAppointmentRow = ({ request, appointment }: ApptEntry, compact = false) => {
    const date = new Date(appointment.proposed_at);
    const otherParty = perspective === 'homeowner' ? request.contractor_name : (request.homeowner_name || 'Homeowner');
    const needsResponse = appointment.status === 'proposed' && appointment.proposed_by !== perspective;
    return (
      <button
        key={`${request.id}-${appointment.id}`}
        type="button"
        onClick={() => onOpenRequest?.(request)}
        className={`w-full rounded-xl border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 ${appointmentStatusClass(appointment.status)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${appointmentDotClass(appointment.status)}`} />
              <p className="font-semibold text-slate-950">{request.title}</p>
              {needsResponse && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  Needs response
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {otherParty} · {request.category} · {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
            {!compact && appointment.notes && <p className="mt-1 text-xs text-slate-600">{appointment.notes}</p>}
            <p className="mt-1 text-xs font-semibold text-slate-700">{appointmentNextActionText(appointment, perspective)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {statusLabel[appointment.status]}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoBox label="Upcoming" value={String(upcoming.length)} />
        <InfoBox label="Needs response" value={String(proposedForMe.length)} />
        <InfoBox label="Confirmed" value={String(confirmed.length)} />
        <InfoBox label="Completed" value={String(completed.length)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={prevMonth} className={buttonClass('secondary')}>Prev</button>
            <h3 className="text-lg font-bold text-slate-950">{MONTHS[month]} {year}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setYear(today.getFullYear());
                  setMonth(today.getMonth());
                  setSelectedDate(todayKey);
                }}
                className={buttonClass('secondary')}
              >
                Today
              </button>
              <button type="button" onClick={nextMonth} className={buttonClass('secondary')}>Next</button>
            </div>
          </div>

          <div className="grid grid-cols-7">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {Array.from({ length: totalCells }).map((_, i) => {
              const dayNum = i - firstDayOfWeek + 1;
              const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
              const dateKey = inMonth
                ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                : '';
              const dayAppts = dateKey ? (apptMap[dateKey] ?? []) : [];
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDate;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { if (inMonth) setSelectedDate(dateKey); }}
                  className={`min-h-[98px] p-1.5 text-left transition-colors ${inMonth ? 'bg-white hover:bg-blue-50' : 'bg-slate-50 opacity-50'} ${isSelected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                >
                  <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>
                    {inMonth ? dayNum : ''}
                  </div>
                  <div className="space-y-1">
                    {dayAppts.slice(0, 3).map(({ request, appointment }) => {
                      const time = new Date(appointment.proposed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      return (
                        <div key={`${request.id}-${appointment.id}`} className={`rounded border px-1 py-0.5 text-xs leading-tight ${appointmentStatusClass(appointment.status)}`}>
                          <span className="font-semibold">{time}</span>
                          <span className="block truncate">{request.title}</span>
                        </div>
                      );
                    })}
                    {dayAppts.length > 3 && (
                      <p className="text-xs font-semibold text-slate-500">+{dayAppts.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500" /> Proposed</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500" /> Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-blue-500" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-400" /> Cancelled</span>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-950">Selected day</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {selectedDate
                ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                : 'Choose a day on the calendar.'}
            </p>
            <div className="mt-3 space-y-2">
              {selectedDate && (apptMap[selectedDate] ?? []).length > 0 ? (
                (apptMap[selectedDate] ?? []).map(entry => renderAppointmentRow(entry, true))
              ) : (
                <EmptyState text="No appointments on this day." />
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-950">Needs response</p>
            <p className="mt-0.5 text-xs text-slate-500">Proposed appointment times waiting on you.</p>
            <div className="mt-3 space-y-2">
              {proposedForMe.length === 0 ? (
                <EmptyState text="No proposed times need your response." />
              ) : (
                proposedForMe.slice(0, 4).map(entry => renderAppointmentRow(entry, true))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-950">Upcoming</p>
            <p className="mt-0.5 text-xs text-slate-500">Next scheduled or proposed appointments.</p>
            <div className="mt-3 space-y-2">
              {upcoming.length === 0 ? (
                <EmptyState text="No upcoming appointments yet." />
              ) : (
                upcoming.slice(0, 5).map(entry => renderAppointmentRow(entry, true))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-amber-700 bg-amber-900/30 p-6 text-amber-300">
      <h1 className="text-2xl font-bold">Supabase is not connected</h1>
      <p className="mt-2 text-sm leading-6">
        Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project `.env` file, then restart the dev server.
      </p>
    </div>
  );
}
