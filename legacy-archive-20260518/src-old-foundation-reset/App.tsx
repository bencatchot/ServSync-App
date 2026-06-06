import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import BuildChecklist from './components/BuildChecklist';
import RunInspection from './components/RunInspection';
import RoomReport from './components/RoomReport';
import WorkTracker from './components/WorkTracker';
import Calendar from './components/Calendar';
import CustomerPortal, { HomeownerProfileForm } from './components/CustomerPortal';
import CustomerOnboarding from './components/CustomerOnboarding';
import Settings from './components/Settings';
import AuthScreen from './components/AuthScreen';
import LegalPage from './components/LegalPage';
import LandingPage from './components/LandingPage';
import PlatformAdmin from './components/PlatformAdmin';
import ContractorSetup from './components/ContractorSetup';
import ConnectedHomeowners from './components/ConnectedHomeowners';
import { Customer, Page, ServiceRequest, QBSettings, Vendor, Finding, Photo, Invoice, ReportLog, ReportSnapshot, AppProfile, MaintenanceScheduleItem, Appointment } from './types';
import { supabase, supabaseConfigured } from './supabaseClient';
import { DEFAULT_ROOMS } from './data';

interface Toast {
  id: string;
  customerName: string;
  category: string;
}

const REPORT_PUBLISHED_MARKER = '[Published to Customer]';
const REPORT_DRAFT_MARKER = '[Internal Draft]';

function markReportPublished(notes: string) {
  return `${REPORT_PUBLISHED_MARKER} ${cleanReportNotes(notes)}`.trim();
}

function markReportDraft(notes: string) {
  return `${REPORT_DRAFT_MARKER} ${cleanReportNotes(notes)}`.trim();
}

function cleanReportNotes(notes: string) {
  return notes.replace(REPORT_PUBLISHED_MARKER, '').replace(REPORT_DRAFT_MARKER, '').trim();
}

function reportIsPublished(notes: string) {
  if (notes.includes(REPORT_DRAFT_MARKER)) return false;
  if (notes.includes(REPORT_PUBLISHED_MARKER)) return true;
  return true;
}

interface PropertyRow {
  id: string;
  created_at: string;
  organization_id: string | null;
  name: string;
  address: string;
  owner: string;
  phone: string;
  email: string;
  plan: Customer['plan'];
  home_sqft: string | null;
  home_year_built: string | null;
  home_stories: string | null;
  home_garage: string | null;
  home_pool: boolean | null;
  home_roof_type: Customer['home']['roofType'] | null;
  home_roof_age: string | null;
  home_hvac_type: Customer['home']['hvacType'] | null;
  home_hvac_age: string | null;
  home_notes: string | null;
  last_visit: string | null;
  score: number | null;
  is_active: boolean | null;
}

interface VendorRow {
  id: string;
  created_at: string;
  property_id: string;
  type: Vendor['type'];
  company: string;
  phone: string;
  account: string;
  notes: string;
}


interface OnboardingCustomerRow {
  id: string;
  name: string;
  address: string;
  owner: string;
  phone: string;
  email: string;
  plan: Customer['plan'];
  home_sqft: string | null;
  home_year_built: string | null;
  home_stories: string | null;
  home_garage: string | null;
  home_pool: boolean | null;
  home_roof_type: Customer['home']['roofType'] | null;
  home_roof_age: string | null;
  home_hvac_type: Customer['home']['hvacType'] | null;
  home_hvac_age: string | null;
  home_notes: string | null;
  is_active: boolean | null;
  vendors?: Array<{
    id: string;
    type: Vendor['type'];
    company: string;
    phone: string;
    account: string;
    notes: string;
  }>;
}

interface RoomRow {
  id: string;
  created_at: string;
  property_id: string;
  name: string;
  sort_order: number | null;
}

interface ChecklistItemRow {
  id: string;
  created_at: string;
  room_id: string;
  item_text: string;
  sort_order: number | null;
}

interface FindingRow {
  id: string;
  created_at: string;
  property_id: string;
  room_id: string;
  item_key: string;
  title: string;
  status: Finding['status'];
  priority: Finding['priority'];
  description: string;
  action: string;
  due: string;
  quote_status: Finding['quoteStatus'];
}

interface PhotoRow {
  id: string;
  created_at: string;
  property_id: string;
  room_id: string;
  url: string;
  caption: string;
}

interface RequestRow {
  id: string;
  created_at: string;
  property_id: string;
  customer_name: string;
  category: ServiceRequest['category'];
  room: string;
  description: string;
  priority: ServiceRequest['priority'];
  photo_url: string | null;
  status: ServiceRequest['status'];
  contractor_notes: string;
  read: boolean;
}


interface ReportLogRow {
  id: string;
  created_at: string;
  property_id: string;
  title: string;
  issue_count: number | null;
  urgent_count: number | null;
  pass_count: number | null;
  room_count: number | null;
  photo_count: number | null;
  notes: string | null;
  snapshot: ReportSnapshot | null;
  pdf_url: string | null;
  pdf_path: string | null;
  file_name: string | null;
}

interface MaintenanceScheduleRow {
  id: string;
  created_at: string;
  property_id: string;
  title: string;
  room: string;
  source: MaintenanceScheduleItem['source'];
  priority: MaintenanceScheduleItem['priority'];
  cadence_type: MaintenanceScheduleItem['cadenceType'];
  frequency: string;
  next_due_date: string | null;
  next_due_visit: string;
  status: MaintenanceScheduleItem['status'];
  notes: string;
  created_from_finding_id: string | null;
  completed_at: string | null;
}

interface AppointmentRow {
  id: string; created_at: string; updated_at: string; property_id: string | null; title: string;
  status: Appointment['status']; visit_type: Appointment['visitType']; recommended_date: string | null;
  scheduled_start: string | null; scheduled_end: string | null; duration_minutes: number | null;
  time_window: Appointment['timeWindow']; internal_notes: string | null; customer_notes: string | null;
  customer_requested_start: string | null; customer_request_notes: string | null; source: string | null;
  source_schedule_item_id: string | null; customer_visible: boolean | null; email_notification_status: string | null;
  sms_notification_status: string | null; last_notification_sent_at: string | null; google_calendar_event_id: string | null;
  outlook_calendar_event_id: string | null; ics_uid: string | null; sync_status: string | null;
}

interface InvoiceRow {
  id: string;
  created_at: string;
  property_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number | null;
  tax_amount: number | null;
  total: number | null;
  line_items: Invoice['lineItems'];
  tax_rate: number;
  notes: string;
  status: Invoice['status'];
}

function friendlyError(error: unknown): string {
  console.error('Supabase error full details:', error);
  console.error('Supabase error JSON:', JSON.stringify(error, null, 2));
  const message = error instanceof Error ? error.message : JSON.stringify(error) || 'Unknown error';
  return `Something went wrong while syncing with Supabase. ${message}`;
}

function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 6000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3 pointer-events-auto max-w-sm w-full animate-slide-in">
      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">!</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">New request from {toast.customerName}</p>
        <p className="text-xs text-slate-500 mt-0.5">{toast.category}</p>
      </div>
      <button onClick={() => onDismiss(toast.id)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

function isPortalMode(): boolean {
  return window.location.hash.startsWith('#/portal') || window.location.pathname.includes('/portal');
}

function isOnboardingMode(): boolean {
  return window.location.hash.startsWith('#/onboarding') || window.location.pathname.includes('/onboarding');
}

function isContractorSetupMode(): boolean {
  return window.location.hash.startsWith('#/contractor-setup') || window.location.pathname.includes('/contractor-setup');
}

function isLoginMode(): boolean {
  return window.location.hash.startsWith('#/login') ||
    window.location.hash.startsWith('#/homeowner-login') ||
    window.location.hash.startsWith('#/homeowner-signup') ||
    window.location.hash.startsWith('#/contractor-login') ||
    window.location.pathname.includes('/login');
}

function isPlatformMode(): boolean {
  return window.location.hash.startsWith('#/platform') || window.location.pathname.includes('/platform');
}

type LoginPath = 'homeowner' | 'contractor' | 'platform';

function getLoginPath(): LoginPath {
  if (window.location.hash.startsWith('#/homeowner-login') || window.location.hash.startsWith('#/homeowner-signup') || window.location.hash.startsWith('#/login')) return 'homeowner';
  if (window.location.hash.startsWith('#/platform') || window.location.pathname.includes('/platform')) return 'platform';
  return 'contractor';
}

function getAuthMode(): 'signin' | 'signup' {
  return window.location.hash.startsWith('#/homeowner-signup') ? 'signup' : 'signin';
}

const LEGAL_PAGE_TYPES = ['privacy', 'terms', 'service-terms', 'inspection-disclaimer', 'emergency-notice', 'communications-consent', 'photo-consent', 'billing-terms', 'portal-notice'] as const;
type LegalPageType = typeof LEGAL_PAGE_TYPES[number];

function getLegalPageType(): LegalPageType | null {
  const hashMatch = window.location.hash.match(/^#\/(privacy|terms|service-terms|inspection-disclaimer|emergency-notice|communications-consent|photo-consent|billing-terms|portal-notice)/);
  if (hashMatch && LEGAL_PAGE_TYPES.includes(hashMatch[1] as LegalPageType)) return hashMatch[1] as LegalPageType;
  const pathMatch = window.location.pathname.match(/^\/(privacy|terms|service-terms|inspection-disclaimer|emergency-notice|communications-consent|photo-consent|billing-terms|portal-notice)/);
  if (pathMatch && LEGAL_PAGE_TYPES.includes(pathMatch[1] as LegalPageType)) return pathMatch[1] as LegalPageType;
  return null;
}

function getHashParam(name: string): string | null {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get(name);
}

const APP_PAGES: Page[] = ['dashboard', 'connected', 'settings'];
const INSPECTION_CLOSED_STORAGE_KEY = 'closed-inspection-ids';

function loadClosedInspectionIds() {
  try {
    return JSON.parse(localStorage.getItem(INSPECTION_CLOSED_STORAGE_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function getPageFromHash(): Page {
  const match = window.location.hash.match(/^#\/app\/([^?]+)/);
  const page = match?.[1] as Page | undefined;
  return page && APP_PAGES.includes(page) ? page : 'dashboard';
}

function navigateToPage(page: Page) {
  const nextHash = `#/app/${page}`;
  if (window.location.hash !== nextHash) window.location.hash = nextHash;
}


function customerFromOnboardingRow(row: OnboardingCustomerRow): Customer {
  return {
    id: row.id,
    name: row.name || 'Home Profile',
    address: row.address || '',
    owner: row.owner || '',
    phone: row.phone || '',
    email: row.email || '',
    plan: row.plan || 'No active plan',
    home: {
      sqft: row.home_sqft || '',
      yearBuilt: row.home_year_built || '',
      stories: row.home_stories || '',
      garage: row.home_garage || '',
      pool: row.home_pool ?? false,
      roofType: row.home_roof_type || 'Asphalt Shingles',
      roofAge: row.home_roof_age || '',
      hvacType: row.home_hvac_type || 'Central Air/Gas Heat',
      hvacAge: row.home_hvac_age || '',
      notes: row.home_notes || '',
    },
    vendors: (row.vendors || []).map(vendor => ({
      id: vendor.id,
      type: vendor.type,
      company: vendor.company || '',
      phone: vendor.phone || '',
      account: vendor.account || '',
      notes: vendor.notes || '',
    })),
    rooms: [],
    checklist: {},
    findings: {},
    photos: {},
    requests: [],
    invoices: [],
    reportLogs: [],
    maintenanceSchedule: [],
    appointments: [],
    isActive: row.is_active ?? true,
  };
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>(() => getPageFromHash());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [standaloneAppointments, setStandaloneAppointments] = useState<Appointment[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [closedInspectionIds, setClosedInspectionIds] = useState<string[]>(() => loadClosedInspectionIds());
  const [portalMode, setPortalMode] = useState(isPortalMode);
  const [onboardingMode, setOnboardingMode] = useState(isOnboardingMode);
  const [contractorSetupMode, setContractorSetupMode] = useState(isContractorSetupMode);
  const [loginMode, setLoginMode] = useState(isLoginMode);
  const [platformMode, setPlatformMode] = useState(isPlatformMode);
  const [loginPath, setLoginPath] = useState<LoginPath>(() => getLoginPath());
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(() => getAuthMode());
  const [legalPageType, setLegalPageType] = useState<LegalPageType | null>(() => getLegalPageType());
  const [onboardingCustomerId, setOnboardingCustomerId] = useState<string | null>(() => getHashParam('customer'));
  const [contractorSetupOrgId, setContractorSetupOrgId] = useState<string | null>(() => getHashParam('org'));
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | undefined>(() => getHashParam('created') ? 'Account created successfully. Please sign in with the email and password you just set up.' : undefined);
  const [showPostOnboardingLogin, setShowPostOnboardingLogin] = useState(false);
  const ensuringAppointmentRecommendations = useRef(false);
  const [qbSettings, setQbSettings] = useState<QBSettings>({
    connected: false,
    accountName: '',
    lastSync: '',
  });

  const setInspectionClosedForCustomer = (customerId: string, closed: boolean) => {
    setClosedInspectionIds(prev => {
      const next = closed ? Array.from(new Set([...prev, customerId])) : prev.filter(id => id !== customerId);
      localStorage.setItem(INSPECTION_CLOSED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const selectedInspectionClosed = selectedCustomerId ? closedInspectionIds.includes(selectedCustomerId) : false;


  const loadProfile = useCallback(async (id: string) => {
    if (!supabaseConfigured || !supabase) {
      return {
        id,
        email: 'demo@servsync.app',
        fullName: 'Demo Admin',
        role: 'admin',
        propertyId: null,
        activeOrganizationId: null,
      } as AppProfile;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,role,property_id,active_organization_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      email: data.email || '',
      fullName: data.full_name || '',
      role: data.role,
      propertyId: data.property_id,
      activeOrganizationId: data.active_organization_id || null,
    } as AppProfile;
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setUserId('demo-admin');
      setProfile({
        id: 'demo-admin',
        email: 'demo@servsync.app',
        fullName: 'Demo Admin',
        role: 'admin',
        propertyId: null,
        activeOrganizationId: null,
      });
      setAuthReady(true);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const id = data.session?.user.id || null;
      setUserId(id);
      if (id) {
        setAuthNotice(undefined);
        setShowPostOnboardingLogin(false);
        setLoginMode(false);
        try { setProfile(await loadProfile(id)); }
        catch (error) { setErrorMessage(friendlyError(error)); }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id || null;
      setUserId(id);
      if (id) {
        setAuthNotice(undefined);
        setShowPostOnboardingLogin(false);
        setLoginMode(false);
      }
      if (!id) {
        setErrorMessage(null);
        setProfile(null);
        setAuthReady(true);
        setCustomers([]);
        return;
      }
      void loadProfile(id)
        .then(setProfile)
        .catch(error => setErrorMessage(friendlyError(error)))
        .finally(() => setAuthReady(true));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    const handleHash = () => {
      const portal = isPortalMode();
      const onboarding = isOnboardingMode();
      const contractorSetup = isContractorSetupMode();
      const login = isLoginMode();
      const platform = isPlatformMode();
      const legal = getLegalPageType();
      setPortalMode(portal);
      setOnboardingMode(onboarding);
      setContractorSetupMode(contractorSetup);
      setLoginMode(login);
      setPlatformMode(platform);
      setLoginPath(getLoginPath());
      setAuthMode(getAuthMode());
      setLegalPageType(legal);
      setOnboardingCustomerId(getHashParam('customer'));
      setContractorSetupOrgId(getHashParam('org'));
      if (!portal && !onboarding && !contractorSetup && !login && !platform && !legal) setCurrentPage(getPageFromHash());
      if (login && getHashParam('created')) {
        setAuthNotice('Account created successfully. Please sign in with the email and password you just set up.');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleNavigate = useCallback((page: Page) => {
    setCurrentPage(page);
    navigateToPage(page);
  }, []);

  const loadOnboardingCustomer = useCallback(async (propertyId: string) => {
    if (!supabaseConfigured || !supabase) {
      setCustomers([]);
      setSelectedCustomerId(null);
      setErrorMessage('Supabase is not connected. Live homeowner data cannot be loaded.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.rpc('get_onboarding_customer', { p_property_id: propertyId });
      if (error) throw error;
      if (!data) {
        setCustomers([]);
        setSelectedCustomerId(null);
        return;
      }
      const customer = customerFromOnboardingRow(data as OnboardingCustomerRow);
      setCustomers([customer]);
      setSelectedCustomerId(customer.id);
    } catch (error) {
      setCustomers([]);
      setSelectedCustomerId(null);
      setErrorMessage(friendlyError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const ensureRoomsForProperty = useCallback(async (propertyId: string) => {
    if (!supabaseConfigured || !supabase) return false;

    const roomCheck = await supabase.from('rooms').select('id').eq('property_id', propertyId);
    if (roomCheck.error) throw roomCheck.error;
    if ((roomCheck.data || []).length > 0) return false;

    const defaultRows = DEFAULT_ROOMS.map((name, index) => ({
      property_id: propertyId,
      name,
      sort_order: index,
    }));
    const insertRes = await supabase.from('rooms').insert(defaultRows);
    if (insertRes.error) throw insertRes.error;
    return true;
  }, []);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (!supabaseConfigured || !supabase) {
        setCustomers([]);
        setSelectedCustomerId(null);
        setStandaloneAppointments([]);
        setErrorMessage('Supabase is not connected. Live ServSync data cannot be loaded.');
        return;
      }

      const [propertiesRes, vendorsRes, roomsRes, checklistRes, findingsRes, photosRes, requestsRes, invoicesRes, reportLogsRes, scheduleRes, appointmentsRes] = await Promise.all([
        supabase
          .from('properties')
          .select('id,created_at,organization_id,name,address,owner,email,phone,plan,home_sqft,home_year_built,home_stories,home_garage,home_pool,home_roof_type,home_roof_age,home_hvac_type,home_hvac_age,home_notes,last_visit,score,is_active'),
        supabase.from('vendors').select('id,created_at,property_id,type,company,phone,account,notes'),
        supabase.from('rooms').select('id,created_at,property_id,name,sort_order'),
        supabase.from('checklist_items').select('id,created_at,room_id,item_text,sort_order'),
        supabase.from('findings').select('id,created_at,room_id,property_id,item_key,title,status,priority,description,action,due,quote_status'),
        supabase.from('photos').select('id,created_at,room_id,property_id,url,caption'),
        supabase.from('requests').select('id,created_at,property_id,customer_name,category,room,description,priority,photo_url,status,contractor_notes,read'),
        supabase.from('invoices').select('id,created_at,property_id,invoice_number,invoice_date,due_date,status,subtotal,tax_rate,tax_amount,total,notes,line_items'),
        supabase.from('report_logs').select('id,created_at,property_id,title,issue_count,urgent_count,pass_count,room_count,photo_count,notes,snapshot,pdf_url,pdf_path,file_name').order('created_at', { ascending: false }),
        supabase.from('maintenance_schedule').select('id,created_at,property_id,title,room,source,priority,cadence_type,frequency,next_due_date,next_due_visit,status,notes,created_from_finding_id,completed_at').order('created_at', { ascending: false }),
        supabase.from('appointments').select('id,created_at,updated_at,property_id,title,status,visit_type,recommended_date,scheduled_start,scheduled_end,duration_minutes,time_window,internal_notes,customer_notes,customer_requested_start,customer_request_notes,source,source_schedule_item_id,customer_visible,email_notification_status,sms_notification_status,last_notification_sent_at,google_calendar_event_id,outlook_calendar_event_id,ics_uid,sync_status').order('recommended_date', { ascending: true }),
      ]);

      if (propertiesRes.error) throw propertiesRes.error;
      if (vendorsRes.error) throw vendorsRes.error;
      if (roomsRes.error) throw roomsRes.error;
      if (checklistRes.error) throw checklistRes.error;
      if (findingsRes.error) throw findingsRes.error;
      if (photosRes.error) throw photosRes.error;
      if (requestsRes.error) throw requestsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      const reportLogsTableMissing = reportLogsRes.error && ['42P01', 'PGRST205', 'PGRST204'].includes((reportLogsRes.error as { code?: string }).code || '');
      const scheduleTableMissing = scheduleRes.error && ['42P01', 'PGRST205', 'PGRST204'].includes((scheduleRes.error as { code?: string }).code || '');
      const appointmentsTableMissing = appointmentsRes.error && ['42P01', 'PGRST205', 'PGRST204'].includes((appointmentsRes.error as { code?: string }).code || '');
      if (reportLogsRes.error && !reportLogsTableMissing) throw reportLogsRes.error;
      if (scheduleRes.error && !scheduleTableMissing) throw scheduleRes.error;
      if (appointmentsRes.error && !appointmentsTableMissing) throw appointmentsRes.error;

      let properties = (propertiesRes.data || []) as PropertyRow[];
      if (profile?.role === 'customer' && profile.propertyId) {
        properties = properties.filter(property => property.id === profile.propertyId);
      }
      const vendors = (vendorsRes.data || []) as VendorRow[];
      let rooms = (roomsRes.data || []) as RoomRow[];
      const checklistItems = (checklistRes.data || []) as ChecklistItemRow[];
      const findings = (findingsRes.data || []) as FindingRow[];
      const photos = (photosRes.data || []) as PhotoRow[];
      const requests = (requestsRes.data || []) as RequestRow[];
      const invoices = (invoicesRes.data || []) as InvoiceRow[];
      const reportLogs = reportLogsTableMissing ? [] : (reportLogsRes.data || []) as ReportLogRow[];
      const scheduleItems = scheduleTableMissing ? [] : (scheduleRes.data || []) as MaintenanceScheduleRow[];
      let appointmentRows = appointmentsTableMissing ? [] : (appointmentsRes.data || []) as AppointmentRow[];
      const shouldLoadContractorCalendar = Boolean(
        profile?.activeOrganizationId &&
        profile.role !== 'customer' &&
        profile.role !== 'platform_admin'
      );
      if (!appointmentsTableMissing && shouldLoadContractorCalendar && supabase) {
        const contractorCalendarRes = await supabase.rpc('get_contractor_calendar_appointments');
        const rpcMissing = contractorCalendarRes.error && ['42883', 'PGRST202', 'PGRST205'].includes((contractorCalendarRes.error as { code?: string }).code || '');
        if (contractorCalendarRes.error && !rpcMissing) throw contractorCalendarRes.error;
        if (!contractorCalendarRes.error) {
          const appointmentById = new Map<string, AppointmentRow>();
          appointmentRows.forEach(row => appointmentById.set(row.id, row));
          ((contractorCalendarRes.data || []) as AppointmentRow[]).forEach(row => appointmentById.set(row.id, row));
          appointmentRows = Array.from(appointmentById.values());
        }
      }

      const missingRoomsPropertyIds = properties
        .filter(property => {
          if (rooms.some(room => room.property_id === property.id)) return false;
          if (profile?.role === 'platform_admin') return true;
          if (profile?.role === 'customer') return property.id === profile.propertyId;
          return Boolean(profile?.activeOrganizationId && property.organization_id === profile.activeOrganizationId);
        })
        .map(property => property.id);
      if (missingRoomsPropertyIds.length > 0) {
        const defaultRows = missingRoomsPropertyIds.flatMap(propertyId =>
          DEFAULT_ROOMS.map((name, index) => ({
            property_id: propertyId,
            name,
            sort_order: index,
          }))
        );
        const createdRoomsRes = await supabase
          .from('rooms')
          .insert(defaultRows)
          .select('id,created_at,property_id,name,sort_order');
        if (createdRoomsRes.error) throw createdRoomsRes.error;
        rooms = [...rooms, ...((createdRoomsRes.data || []) as RoomRow[])];
      }

      const roomById = new Map<string, RoomRow>();
      rooms.forEach(room => roomById.set(room.id, room));

      const hydrated = properties.map((property): Customer => {
        const propertyRooms = rooms.filter(room => room.property_id === property.id);
        const roomNames = propertyRooms.map(room => room.name);

        const checklist: Record<string, string[]> = {};
        propertyRooms.forEach(room => {
          checklist[room.name] = checklistItems.filter(item => item.room_id === room.id).map(item => item.item_text);
        });

        const findingsByRoom: Record<string, Finding[]> = {};
        findings
          .filter(finding => finding.property_id === property.id)
          .forEach(finding => {
            const roomName = roomById.get(finding.room_id)?.name || 'Unknown Room';
            if (!findingsByRoom[roomName]) findingsByRoom[roomName] = [];
            findingsByRoom[roomName].push({
              id: finding.id,
              itemKey: finding.item_key,
              title: finding.title,
              room: roomName,
              status: finding.status,
              priority: finding.priority,
              description: finding.description,
              action: finding.action,
              due: finding.due,
              quoteStatus: finding.quote_status,
            });
          });

        const photosByRoom: Record<string, Photo[]> = {};
        photos
          .filter(photo => photo.property_id === property.id)
          .forEach(photo => {
            const roomName = roomById.get(photo.room_id)?.name;
            if (!roomName) return;
            if (!photosByRoom[roomName]) photosByRoom[roomName] = [];
            photosByRoom[roomName].push({ id: photo.id, url: photo.url, caption: photo.caption });
          });

        return {
          id: property.id,
          name: property.name,
          address: property.address,
          owner: property.owner,
          phone: property.phone,
          email: property.email,
          plan: property.plan,
          home: {
            sqft: property.home_sqft || '',
            yearBuilt: property.home_year_built || '',
            stories: property.home_stories || '',
            garage: property.home_garage || '',
            pool: property.home_pool ?? false,
            roofType: property.home_roof_type || 'Asphalt Shingles',
            roofAge: property.home_roof_age || '',
            hvacType: property.home_hvac_type || 'Central Air/Gas Heat',
            hvacAge: property.home_hvac_age || '',
            notes: property.home_notes || '',
          },
          vendors: vendors
            .filter(vendor => vendor.property_id === property.id)
            .map(vendor => ({
              id: vendor.id,
              type: vendor.type,
              company: vendor.company,
              phone: vendor.phone,
              account: vendor.account,
              notes: vendor.notes,
            })),
          rooms: roomNames,
          checklist,
          findings: findingsByRoom,
          photos: photosByRoom,
          requests: requests
            .filter(request => request.property_id === property.id)
            .map(request => ({
              id: request.id,
              customerId: property.id,
              customerName: request.customer_name,
              category: request.category,
              room: request.room,
              description: request.description,
              priority: request.priority,
              photoUrl: request.photo_url || undefined,
              status: request.status,
              contractorNotes: request.contractor_notes,
              submittedAt: new Date(request.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
              read: request.read,
            })),
          invoices: invoices
            .filter(invoice => invoice.property_id === property.id)
            .map(invoice => ({
              id: invoice.id,
              invoiceNumber: invoice.invoice_number,
              customerId: property.id,
              date: invoice.invoice_date,
              dueDate: invoice.due_date,
              lineItems: invoice.line_items || [],
              taxRate: invoice.tax_rate || 0,
              notes: invoice.notes || '',
              status: invoice.status,
            })),
          reportLogs: reportLogs
            .filter(log => log.property_id === property.id)
            .map(log => ({
              id: log.id,
              customerId: property.id,
              createdAt: log.created_at,
              title: log.title,
              issueCount: log.issue_count || 0,
              urgentCount: log.urgent_count || 0,
              passCount: log.pass_count || 0,
              roomCount: log.room_count || 0,
              photoCount: log.photo_count || 0,
              notes: cleanReportNotes(log.notes || ''),
              snapshot: log.snapshot || undefined,
              pdfUrl: log.pdf_url || undefined,
              pdfPath: log.pdf_path || undefined,
              fileName: log.file_name || undefined,
              isPublished: reportIsPublished(log.notes || ''),
            })),
          maintenanceSchedule: scheduleItems
            .filter(item => item.property_id === property.id)
            .map(item => ({
              id: item.id,
              customerId: property.id,
              title: item.title,
              room: item.room,
              source: item.source,
              priority: item.priority,
              cadenceType: item.cadence_type,
              frequency: item.frequency,
              nextDueDate: item.next_due_date || '',
              nextDueVisit: item.next_due_visit,
              status: item.status,
              notes: item.notes || '',
              createdFromFindingId: item.created_from_finding_id || undefined,
              createdAt: item.created_at,
              completedAt: item.completed_at || undefined,
            })),
          appointments: appointmentRows
            .filter(item => item.property_id === property.id)
            .map(item => ({
              id: item.id, customerId: property.id, title: item.title, status: item.status, visitType: item.visit_type,
              recommendedDate: item.recommended_date || '', scheduledStart: item.scheduled_start || '', scheduledEnd: item.scheduled_end || '',
              durationMinutes: item.duration_minutes || 60, timeWindow: item.time_window || 'Morning', internalNotes: item.internal_notes || '', customerNotes: item.customer_notes || '',
              customerRequestedStart: item.customer_requested_start || undefined, customerRequestNotes: item.customer_request_notes || '', source: item.source || 'Monthly recommendation',
              sourceScheduleItemId: item.source_schedule_item_id || undefined, customerVisible: item.customer_visible ?? false,
              emailNotificationStatus: item.email_notification_status || 'not_configured', smsNotificationStatus: item.sms_notification_status || 'not_configured',
              lastNotificationSentAt: item.last_notification_sent_at || undefined, googleCalendarEventId: item.google_calendar_event_id || undefined,
              outlookCalendarEventId: item.outlook_calendar_event_id || undefined, icsUid: item.ics_uid || item.id, syncStatus: item.sync_status || 'not_synced',
              createdAt: item.created_at, updatedAt: item.updated_at,
            })),
          lastVisit: property.last_visit || undefined,
          isActive: property.is_active ?? true,
        };
      });

      const hydratedCustomerIds = new Set(hydrated.map(customer => customer.id));
      setStandaloneAppointments(appointmentRows
        .filter(item => !item.property_id || !hydratedCustomerIds.has(item.property_id))
        .map(item => ({
          id: item.id, customerId: item.property_id || undefined, title: item.title, status: item.status, visitType: item.visit_type, recommendedDate: item.recommended_date || '',
          scheduledStart: item.scheduled_start || '', scheduledEnd: item.scheduled_end || '', durationMinutes: item.duration_minutes || 60, timeWindow: item.time_window || 'Custom',
          internalNotes: item.internal_notes || '', customerNotes: item.customer_notes || '', customerRequestedStart: item.customer_requested_start || undefined,
          customerRequestNotes: item.customer_request_notes || '', source: item.source || 'Manual', sourceScheduleItemId: item.source_schedule_item_id || undefined, customerVisible: false,
          emailNotificationStatus: item.email_notification_status || 'not_configured', smsNotificationStatus: item.sms_notification_status || 'not_configured',
          lastNotificationSentAt: item.last_notification_sent_at || undefined, googleCalendarEventId: item.google_calendar_event_id || undefined, outlookCalendarEventId: item.outlook_calendar_event_id || undefined,
          icsUid: item.ics_uid || item.id, syncStatus: item.sync_status || 'not_synced', createdAt: item.created_at, updatedAt: item.updated_at,
        })));
      setCustomers(hydrated);
      if (hydrated.length > 0) {
        setSelectedCustomerId(prev => prev && hydrated.some(c => c.id === prev) ? prev : hydrated[0].id);
      } else {
        setSelectedCustomerId(null);
      }
    } catch (error) {
      setErrorMessage(friendlyError(error));
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (onboardingMode) {
      if (onboardingCustomerId) void loadOnboardingCustomer(onboardingCustomerId);
      else {
        setCustomers([]);
        setSelectedCustomerId(null);
        setIsLoading(false);
      }
      return;
    }
    if (!onboardingMode && !contractorSetupMode && !userId) { setIsLoading(false); return; }
    if (contractorSetupMode) { setIsLoading(false); return; }
    if (userId && !profile) return;
    void loadCustomers();
  }, [contractorSetupMode, loadCustomers, loadOnboardingCustomer, onboardingCustomerId, onboardingMode, profile, userId]);

  useEffect(() => {
    if ((currentPage !== 'inspection' && currentPage !== 'checklist') || !selectedCustomerId) return;
    let mounted = true;
    void (async () => {
      try {
        const created = await ensureRoomsForProperty(selectedCustomerId);
        if (created && mounted) {
          await loadCustomers();
        }
      } catch (error) {
        if (mounted) setErrorMessage(friendlyError(error));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentPage, selectedCustomerId, ensureRoomsForProperty, loadCustomers]);

  const persistCustomer = async (customer: Customer) => {
    if (!supabaseConfigured || !supabase) return;

    const propertyPayload = {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      owner: customer.owner,
      phone: customer.phone,
      email: customer.email,
      plan: customer.plan,
      home_sqft: customer.home.sqft,
      home_year_built: customer.home.yearBuilt,
      home_stories: customer.home.stories,
      home_garage: customer.home.garage,
      home_pool: customer.home.pool,
      home_roof_type: customer.home.roofType,
      home_roof_age: customer.home.roofAge,
      home_hvac_type: customer.home.hvacType,
      home_hvac_age: customer.home.hvacAge,
      home_notes: customer.home.notes,
      last_visit: customer.lastVisit || null,
      score: null,
      is_active: customer.isActive,
    };

    const propertyRes = await supabase.from('properties').upsert(propertyPayload).select('id').single();
    if (propertyRes.error) throw propertyRes.error;

    await supabase.from('vendors').delete().eq('property_id', customer.id);
    if (customer.vendors.length > 0) {
      const vendorRows = customer.vendors.map(vendor => ({
        id: vendor.id,
        property_id: customer.id,
        type: vendor.type,
        company: vendor.company,
        phone: vendor.phone,
        account: vendor.account,
        notes: vendor.notes,
      }));
      const vendorInsert = await supabase.from('vendors').insert(vendorRows);
      if (vendorInsert.error) throw vendorInsert.error;
    }

    await supabase.from('rooms').delete().eq('property_id', customer.id);
    let savedRooms: RoomRow[] = [];
    if (customer.rooms.length > 0) {
      const roomsToInsert = customer.rooms.map((name, index) => ({ property_id: customer.id, name, sort_order: index }));
      const roomInsert = await supabase.from('rooms').insert(roomsToInsert).select('id,created_at,property_id,name,sort_order');
      if (roomInsert.error) throw roomInsert.error;
      savedRooms = (roomInsert.data || []) as RoomRow[];
    }
    const roomIdByName = new Map(savedRooms.map(room => [room.name, room.id]));

    await supabase.from('findings').delete().eq('property_id', customer.id);
    const findingRows = Object.entries(customer.findings).flatMap(([roomName, roomFindings]) => {
      const roomId = roomIdByName.get(roomName);
      if (!roomId) return [];
      return roomFindings.map(finding => ({
        id: finding.id,
        property_id: customer.id,
        room_id: roomId,
        item_key: finding.itemKey,
        title: finding.title,
        status: finding.status,
        priority: finding.priority,
        description: finding.description,
        action: finding.action,
        due: finding.due,
        quote_status: finding.quoteStatus,
      }));
    });
    if (findingRows.length > 0) {
      const findingUpsert = await supabase.from('findings').upsert(findingRows, { onConflict: 'id' });
      if (findingUpsert.error) throw findingUpsert.error;
    }

    // Photos are managed directly by upload/delete functions — skip here

    const roomIds = savedRooms.map(room => room.id);
    if (roomIds.length > 0) {
      await supabase.from('checklist_items').delete().in('room_id', roomIds);
      const checklistRows = Object.entries(customer.checklist).flatMap(([roomName, items]) => {
        const roomId = roomIdByName.get(roomName);
        if (!roomId) return [];
        return items.map((item, index) => ({ room_id: roomId, item_text: item, sort_order: index }));
      });
      if (checklistRows.length > 0) {
        const checklistInsert = await supabase.from('checklist_items').insert(checklistRows);
        if (checklistInsert.error) throw checklistInsert.error;
      }
    }

    // Service requests are owned by the homeowner request workflow.
    // Do not rewrite them during broad customer saves, or stale in-memory
    // requests can be restored after test data is cleared.

    await supabase.from('invoices').delete().eq('property_id', customer.id);
    if (customer.invoices.length > 0) {
      const invoiceRows = customer.invoices.map(invoice => ({
        id: invoice.id,
        property_id: customer.id,
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.date,
        due_date: invoice.dueDate,
        subtotal: invoice.lineItems.reduce((sum, item) => sum + item.amount, 0),
        tax_amount: Math.round(invoice.lineItems.reduce((sum, item) => sum + item.amount, 0) * (invoice.taxRate / 100) * 100) / 100,
        total:
          invoice.lineItems.reduce((sum, item) => sum + item.amount, 0) +
          (Math.round(invoice.lineItems.reduce((sum, item) => sum + item.amount, 0) * (invoice.taxRate / 100) * 100) / 100),
        line_items: invoice.lineItems,
        tax_rate: invoice.taxRate,
        notes: invoice.notes,
        status: invoice.status,
      }));
      const invoiceInsert = await supabase.from('invoices').insert(invoiceRows);
      if (invoiceInsert.error) throw invoiceInsert.error;
    }
  };

  const updateCustomer = async (updated: Customer) => {
    const snapshot = customers;
    setErrorMessage(null);
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
    try {
      await persistCustomer(updated);
    } catch (error) {
      setCustomers(snapshot);
      setErrorMessage(friendlyError(error));
    }
  };

  const deleteCustomer = async (customerId: string) => {
    setErrorMessage(null);
    const snapshot = customers;
    setCustomers(prev => prev.filter(c => c.id !== customerId));
    setSelectedCustomerId(prev => prev === customerId ? (customers.find(c => c.id !== customerId)?.id || null) : prev);
    try {
      if (!supabaseConfigured || !supabase) return;

      const roomRes = await supabase.from('rooms').select('id').eq('property_id', customerId);
      if (roomRes.error) throw roomRes.error;
      const roomIds = (roomRes.data || []).map(room => room.id);
      if (roomIds.length > 0) {
        const checklistDelete = await supabase.from('checklist_items').delete().in('room_id', roomIds);
        if (checklistDelete.error) throw checklistDelete.error;
      }
      await supabase.from('profiles').update({ property_id: null }).eq('property_id', customerId);
      await supabase.from('photos').delete().eq('property_id', customerId);
      await supabase.from('findings').delete().eq('property_id', customerId);
      await supabase.from('requests').delete().eq('property_id', customerId);
      await supabase.from('invoices').delete().eq('property_id', customerId);
      await supabase.from('vendors').delete().eq('property_id', customerId);
      await supabase.from('report_logs').delete().eq('property_id', customerId);
      await supabase.from('rooms').delete().eq('property_id', customerId);
      const propertyDelete = await supabase.from('properties').delete().eq('id', customerId);
      if (propertyDelete.error) throw propertyDelete.error;
      await loadCustomers();
    } catch (error) {
      setCustomers(snapshot);
      setErrorMessage(friendlyError(error));
    }
  };

  const addCustomer = async (customer: Customer) => {
    const withDefaults = {
      ...customer,
      requests: customer.requests || [],
      invoices: customer.invoices || [],
      reportLogs: customer.reportLogs || [],
      maintenanceSchedule: customer.maintenanceSchedule || [],
      appointments: customer.appointments || [],
      isActive: customer.isActive ?? true,
      rooms: customer.rooms.length > 0 ? customer.rooms : DEFAULT_ROOMS,
      checklist: customer.checklist || {},
      findings: customer.findings || {},
      photos: customer.photos || {},
    };
    setErrorMessage(null);
    setCustomers(prev => [...prev, withDefaults]);
    setSelectedCustomerId(withDefaults.id);
    try {
      await persistCustomer(withDefaults);
      if (!supabaseConfigured || !supabase) return;
      await loadCustomers();
    } catch (error) {
      setCustomers(prev => prev.filter(c => c.id !== withDefaults.id));
      setErrorMessage(friendlyError(error));
    }
  };

  const createHomeownerHomeProfile = async (home: { name: string; address: string; owner: string; phone: string; email: string }) => {
    setErrorMessage(null);
    try {
      if (!supabaseConfigured || !supabase) {
        const demoHome: Customer = {
          id: crypto.randomUUID(),
          name: home.name || 'My Home',
          address: home.address,
          owner: home.owner,
          phone: home.phone,
          email: home.email,
          plan: 'No active plan',
          home: {
            sqft: '',
            yearBuilt: '',
            stories: '',
            garage: '',
            pool: false,
            roofType: 'Asphalt Shingles',
            roofAge: '',
            hvacType: 'Central Air/Gas Heat',
            hvacAge: '',
            notes: '',
          },
          vendors: [],
          rooms: DEFAULT_ROOMS,
          checklist: {},
          findings: {},
          photos: {},
          requests: [],
          invoices: [],
          reportLogs: [],
          maintenanceSchedule: [],
          appointments: [],
          isActive: true,
        };
        setCustomers([demoHome]);
        setSelectedCustomerId(demoHome.id);
        return;
      }

      const propertyId = crypto.randomUUID();
      const { error } = await supabase.rpc('create_homeowner_owned_property', {
        p_id: propertyId,
        p_name: home.name || 'My Home',
        p_address: home.address,
        p_owner: home.owner,
        p_phone: home.phone,
        p_email: home.email,
      });
      if (error) throw error;

      await ensureRoomsForProperty(propertyId);
      const pendingContractorOrgId = localStorage.getItem('servsync_pending_contractor_org_id');
      if (pendingContractorOrgId) {
        const connectionRes = await supabase.rpc('create_my_home_connection_from_invite', {
          p_property_id: propertyId,
          p_organization_id: pendingContractorOrgId,
        });
        if (connectionRes.error) throw connectionRes.error;
        localStorage.removeItem('servsync_pending_contractor_org_id');
      }
      if (userId) setProfile(await loadProfile(userId));
      await loadCustomers();
    } catch (error) {
      setErrorMessage(friendlyError(error));
      throw error;
    }
  };


  const addUploadedPhotosToCustomer = (customerId: string, room: string, uploaded: Photo[]) => {
    if (uploaded.length === 0) return;
    setCustomers(prev => prev.map(c => {
      if (c.id !== customerId) return c;
      return {
        ...c,
        photos: {
          ...c.photos,
          [room]: [...(c.photos[room] || []), ...uploaded],
        },
      };
    }));
  };

  const uploadInspectionPhotos = async (customerId: string, room: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    try {
      if (!supabaseConfigured || !supabase) {
        addUploadedPhotosToCustomer(customerId, room, Array.from(files).map(file => ({
          id: crypto.randomUUID(),
          url: URL.createObjectURL(file),
          caption: file.name,
        })));
        return;
      }

      const roomRes = await supabase
        .from('rooms')
        .select('id')
        .eq('property_id', customerId)
        .eq('name', room)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (roomRes.error) throw roomRes.error;
      if (!roomRes.data?.id) throw new Error(`Room not found: ${room}`);

      const uploaded: Photo[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop() || 'jpg';
        const objectPath = `${customerId}/${room}/${crypto.randomUUID()}.${ext}`;
        const uploadRes = await supabase.storage.from('photos').upload(objectPath, file, { upsert: false });
        if (uploadRes.error) throw uploadRes.error;
        const { data: publicData } = supabase.storage.from('photos').getPublicUrl(objectPath);
        const newPhoto: Photo = {
          id: crypto.randomUUID(),
          url: publicData.publicUrl,
          caption: file.name,
        };
        const insertRes = await supabase.from('photos').insert({
          id: newPhoto.id,
          property_id: customerId,
          room_id: roomRes.data.id,
          url: newPhoto.url,
          caption: newPhoto.caption,
        });
        if (insertRes.error) throw insertRes.error;
        uploaded.push(newPhoto);
      }

      addUploadedPhotosToCustomer(customerId, room, uploaded);
    } catch (error) {
      setErrorMessage(friendlyError(error));
    }
  };

  const deleteInspectionPhoto = async (customerId: string, room: string, photoId: string) => {
    try {
      if (supabaseConfigured && supabase) {
        const deleteRes = await supabase.from('photos').delete().eq('id', photoId);
        if (deleteRes.error) throw deleteRes.error;
      }
      setCustomers(prev => prev.map(c => {
        if (c.id !== customerId) return c;
        return {
          ...c,
          photos: {
            ...c.photos,
            [room]: (c.photos[room] || []).filter(photo => photo.id !== photoId),
          },
        };
      }));
    } catch (error) {
      setErrorMessage(friendlyError(error));
    }
  };

  const createFinding = async (customerId: string, roomName: string, itemKey: string, status: Finding['status']) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return null;
    try {
      const finding: Finding = {
        id: crypto.randomUUID(),
        itemKey,
        title: itemKey,
        room: roomName,
        status,
        priority: status === 'Urgent' ? 'Urgent' : status === 'Needs Repair' ? 'High' : status === 'Fixed On Site' ? 'Low' : status === 'Monitor' ? 'Medium' : 'Low',
        description: '',
        action: '',
        due: '',
        quoteStatus: 'Not Sent',
      };

      if (!supabaseConfigured || !supabase) {
        setCustomers(prev => prev.map(c => {
          if (c.id !== customerId) return c;
          const roomFindings = c.findings[roomName] || [];
          const existing = roomFindings.find(f => f.itemKey === itemKey);
          if (existing) return c;
          return {
            ...c,
            findings: {
              ...c.findings,
              [roomName]: [...roomFindings, finding],
            },
          };
        }));
        return finding;
      }

      const roomRes = await supabase
        .from('rooms')
        .select('id')
        .eq('property_id', customerId)
        .eq('name', roomName)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (roomRes.error) throw roomRes.error;
      let roomId = roomRes.data?.id;
      if (!roomId) {
        const sortOrder = customer.rooms.indexOf(roomName);
        const createRoomRes = await supabase
          .from('rooms')
          .insert({
            property_id: customerId,
            name: roomName,
            sort_order: sortOrder >= 0 ? sortOrder : DEFAULT_ROOMS.length,
          })
          .select('id')
          .limit(1)
          .maybeSingle();
        if (createRoomRes.error) throw createRoomRes.error;
        roomId = createRoomRes.data?.id;
        if (!roomId) throw new Error(`Unable to create room "${roomName}" in Supabase.`);
      }

      const insertRes = await supabase.from('findings').insert({
        id: finding.id,
        room_id: roomId,
        property_id: customerId,
        item_key: finding.itemKey,
        title: finding.title,
        status: finding.status,
        priority: finding.priority,
        description: finding.description,
        action: finding.action,
        due: finding.due,
        quote_status: finding.quoteStatus,
      });
      if (insertRes.error) throw insertRes.error;

      setCustomers(prev => prev.map(c => {
        if (c.id !== customerId) return c;
        const roomFindings = c.findings[roomName] || [];
        const existing = roomFindings.find(f => f.itemKey === itemKey);
        if (existing) return c;
        return {
          ...c,
          findings: {
            ...c.findings,
            [roomName]: [...roomFindings, finding],
          },
        };
      }));

      return finding;
    } catch (error) {
      setErrorMessage(friendlyError(error));
      return null;
    }
  };

  const updateFindingById = async (customerId: string, findingId: string, updates: Partial<Finding>) => {
    const dbPayload: Record<string, unknown> = {};
    if (updates.status !== undefined) dbPayload.status = updates.status;
    if (updates.priority !== undefined) dbPayload.priority = updates.priority;
    if (updates.description !== undefined) dbPayload.description = updates.description;
    if (updates.action !== undefined) dbPayload.action = updates.action;
    if (updates.due !== undefined) dbPayload.due = updates.due;
    if (updates.quoteStatus !== undefined) dbPayload.quote_status = updates.quoteStatus;
    if (updates.title !== undefined) dbPayload.title = updates.title;
    if (updates.itemKey !== undefined) dbPayload.item_key = updates.itemKey;

    try {
      if (supabaseConfigured && supabase) {
        const updateRes = await supabase.from('findings').update(dbPayload).eq('id', findingId);
        if (updateRes.error) throw updateRes.error;
      }

      setCustomers(prev => prev.map(c => {
        if (c.id !== customerId) return c;
        const updatedFindings: Customer['findings'] = {};
        Object.entries(c.findings).forEach(([roomName, roomFindings]) => {
          updatedFindings[roomName] = roomFindings.map(f => f.id === findingId ? { ...f, ...updates } : f);
        });
        return { ...c, findings: updatedFindings };
      }));
    } catch (error) {
      setErrorMessage(friendlyError(error));
    }
  };

  const addReportLog = async (customerId: string, log: Omit<ReportLog, 'customerId'>) => {
    const entry: ReportLog = { ...log, customerId, isPublished: log.isPublished ?? false };
    setCustomers(prev => prev.map(c => {
      if (c.id !== customerId) return c;
      return { ...c, reportLogs: [entry, ...(c.reportLogs || [])] };
    }));

    try {
      if (!supabaseConfigured || !supabase) return;

      const insertRes = await supabase.from('report_logs').insert({
        id: entry.id,
        property_id: customerId,
        created_at: entry.createdAt,
        title: entry.title,
        issue_count: entry.issueCount,
        urgent_count: entry.urgentCount,
        pass_count: entry.passCount,
        room_count: entry.roomCount,
        photo_count: entry.photoCount,
        notes: entry.isPublished ? markReportPublished(entry.notes) : markReportDraft(entry.notes),
        snapshot: entry.snapshot || null,
        pdf_url: entry.pdfUrl || null,
        pdf_path: entry.pdfPath || null,
        file_name: entry.fileName || null,
      });
      if (insertRes.error) throw insertRes.error;
    } catch (error) {
      const code = (error as { code?: string }).code || '';
      if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') {
        setErrorMessage('Report could not be saved permanently because Supabase needs the updated report_logs SQL. Run the latest supabase-report-logs.sql before finalizing inspections.');
        throw error;
      }
      setErrorMessage(friendlyError(error));
      throw error;
    }
  };

  const nextVisitDateForPlan = (plan: Customer['plan']) => {
    const date = new Date();
    const days = plan.includes('Quarterly') ? 90 : plan.includes('Biannually') ? 180 : plan.includes('Monthly') ? 30 : 30;
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  const scheduleTitleForFinding = (finding: Finding) => {
    if (finding.status === 'Urgent') return `Urgent follow-up: ${finding.title}`;
    if (finding.status === 'Fixed On Site') return `Follow-up: Recheck ${finding.title}`;
    if (finding.status === 'Needs Repair') return `Follow-up: ${finding.title}`;
    return `Monitor: ${finding.title}`;
  };

  const scheduleSourceForFinding = (finding: Finding): MaintenanceScheduleItem['source'] => {
    if (finding.status === 'Fixed On Site') return 'Fixed On Site Recheck';
    return 'Inspection Follow-up';
  };

  const createScheduleFromInspection = async (customer: Customer) => {
    const candidates = Object.entries(customer.findings).flatMap(([room, roomFindings]) =>
      roomFindings
        .filter(finding => finding.status !== 'Pass')
        .map(finding => ({ room, finding }))
    );
    if (candidates.length === 0) return { scheduleItems: [] as MaintenanceScheduleItem[], checklistAdditions: {} as Record<string, string[]> };

    const now = new Date().toISOString();
    const scheduleItems: MaintenanceScheduleItem[] = candidates.map(({ room, finding }) => ({
      id: crypto.randomUUID(),
      customerId: customer.id,
      title: scheduleTitleForFinding(finding),
      room,
      source: scheduleSourceForFinding(finding),
      priority: finding.priority,
      cadenceType: 'both',
      frequency: finding.status === 'Urgent' ? 'ASAP / next visit' : 'Next visit',
      nextDueDate: finding.status === 'Urgent' ? new Date().toISOString().split('T')[0] : nextVisitDateForPlan(customer.plan),
      nextDueVisit: 'Next visit',
      status: finding.status === 'Urgent' ? 'Due' : 'Upcoming',
      notes: finding.status === 'Fixed On Site'
        ? `Auto-created from inspection. Recheck the on-site repair. ${finding.description || ''}`.trim()
        : `Auto-created from inspection. ${finding.description || finding.action || ''}`.trim(),
      createdFromFindingId: finding.id,
      createdAt: now,
    }));

    const checklistAdditions = scheduleItems.reduce<Record<string, string[]>>((acc, item) => {
      const label = `Auto Follow-up: ${item.title.replace(/^Follow-up: /, '').replace(/^Monitor: /, '').replace(/^Urgent follow-up: /, '')}`;
      acc[item.room] = [...(acc[item.room] || []), label];
      return acc;
    }, {});

    try {
      if (!supabaseConfigured || !supabase) {
        return { scheduleItems, checklistAdditions };
      }

      const insertRes = await supabase.from('maintenance_schedule').insert(scheduleItems.map(item => ({
        id: item.id,
        property_id: customer.id,
        created_at: item.createdAt,
        title: item.title,
        room: item.room,
        source: item.source,
        priority: item.priority,
        cadence_type: item.cadenceType,
        frequency: item.frequency,
        next_due_date: item.nextDueDate || null,
        next_due_visit: item.nextDueVisit,
        status: item.status,
        notes: item.notes,
        created_from_finding_id: item.createdFromFindingId || null,
        completed_at: item.completedAt || null,
      })));
      if (insertRes.error) throw insertRes.error;
    } catch (error) {
      const code = (error as { code?: string }).code || '';
      if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') {
        setErrorMessage('Inspection was filed, but the maintenance scheduler table is not installed yet. Run supabase-maintenance-schedule.sql to save scheduler reminders.');
      } else {
        throw error;
      }
    }

    return { scheduleItems, checklistAdditions };
  };

  const addChecklistFollowUps = async (customerId: string, additions: Record<string, string[]>) => {
    const entries = Object.entries(additions).filter(([, items]) => items.length > 0);
    if (entries.length === 0) return;
    if (!supabaseConfigured || !supabase) return;

    const roomsRes = await supabase.from('rooms').select('id,name').eq('property_id', customerId);
    if (roomsRes.error) throw roomsRes.error;
    const roomIdByName = new Map((roomsRes.data || []).map(room => [room.name, room.id]));
    const rows = entries.flatMap(([room, items]) => {
      const roomId = roomIdByName.get(room);
      if (!roomId) return [];
      return items.map((item, index) => ({ room_id: roomId, item_text: item, sort_order: 1000 + index }));
    });
    if (rows.length > 0) {
      const insertRes = await supabase.from('checklist_items').insert(rows);
      if (insertRes.error) throw insertRes.error;
    }
  };

  const clearCurrentInspection = async (customerId: string) => {
    const snapshot = customers;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    const visitDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    try {
      const { scheduleItems, checklistAdditions } = await createScheduleFromInspection(customer);
      await addChecklistFollowUps(customerId, checklistAdditions);

      if (supabaseConfigured && supabase) {
        const findingDelete = await supabase.from('findings').delete().eq('property_id', customerId);
        if (findingDelete.error) throw findingDelete.error;
        const photoDelete = await supabase.from('photos').delete().eq('property_id', customerId);
        if (photoDelete.error) throw photoDelete.error;
        const propertyUpdate = await supabase.from('properties').update({ last_visit: visitDate }).eq('id', customerId);
        if (propertyUpdate.error) throw propertyUpdate.error;
      }

      setCustomers(prev => prev.map(c => {
        if (c.id !== customerId) return c;
        const nextChecklist = { ...c.checklist };
        Object.entries(checklistAdditions).forEach(([room, items]) => {
          nextChecklist[room] = Array.from(new Set([...(nextChecklist[room] || []), ...items]));
        });
        return {
          ...c,
          findings: {},
          photos: {},
          checklist: nextChecklist,
          maintenanceSchedule: [...scheduleItems, ...(c.maintenanceSchedule || [])],
          lastVisit: visitDate,
        };
      }));
    } catch (error) {
      setCustomers(snapshot);
      setErrorMessage(friendlyError(error));
      throw error;
    }
  };

  const updateReportLogVisibility = async (customerId: string, reportId: string, publish: boolean) => {
    const snapshot = customers;
    const customer = customers.find(c => c.id === customerId);
    const report = customer?.reportLogs.find(log => log.id === reportId);
    if (!report) return;
    const updatedNotes = publish ? markReportPublished(report.notes) : markReportDraft(report.notes);

    setCustomers(prev => prev.map(c => {
      if (c.id !== customerId) return c;
      return {
        ...c,
        reportLogs: (c.reportLogs || []).map(log => log.id === reportId
          ? { ...log, isPublished: publish, notes: cleanReportNotes(updatedNotes) }
          : log
        ),
      };
    }));

    try {
      if (!supabaseConfigured || !supabase) return;

      const updateRes = await supabase.from('report_logs').update({ notes: updatedNotes }).eq('id', reportId).eq('property_id', customerId);
      if (updateRes.error) throw updateRes.error;
    } catch (error) {
      setCustomers(snapshot);
      setErrorMessage(friendlyError(error));
    }
  };

  const nextMonthlyDate = (customer: Customer) => {
    const base = customer.lastVisit ? new Date(customer.lastVisit) : new Date();
    if (Number.isNaN(base.getTime())) base.setTime(Date.now());
    base.setDate(base.getDate() + 30);
    return base.toISOString().split('T')[0];
  };

  const ensureAppointmentRecommendations = async () => {
    if (ensuringAppointmentRecommendations.current) return;
    ensuringAppointmentRecommendations.current = true;
    const activeCustomers = customers.filter(c => c.isActive !== false);
    try {
      const activeStatuses: Appointment['status'][] = ['Recommended', 'Confirmed', 'Customer Requested', 'Cancelled'];
      const customerIdsWithActiveAppointment = new Set(
        activeCustomers.flatMap(customer =>
          (customer.appointments || [])
            .filter(appt => activeStatuses.includes(appt.status))
            .map(() => customer.id)
        )
      );

      if (supabaseConfigured && supabase && activeCustomers.length > 0) {
        const existingRes = await supabase
          .from('appointments')
          .select('property_id,status')
          .in('property_id', activeCustomers.map(customer => customer.id))
          .in('status', activeStatuses);
        if (existingRes.error) throw existingRes.error;
        (existingRes.data || []).forEach(row => {
          if (row.property_id) customerIdsWithActiveAppointment.add(row.property_id);
        });
      }

      const toCreate = activeCustomers.filter(customer => !customerIdsWithActiveAppointment.has(customer.id));
      if (toCreate.length === 0) return;

      const now = new Date().toISOString();
      const newAppointments: Appointment[] = toCreate.map(customer => {
        const recommendedDate = nextMonthlyDate(customer);
        return {
          id: crypto.randomUUID(), customerId: customer.id, title: `Monthly inspection — ${customer.name}`,
          status: 'Recommended', visitType: 'Inspection', recommendedDate, scheduledStart: '', scheduledEnd: '', durationMinutes: 60,
          timeWindow: 'Morning', internalNotes: `Auto-recommended from last visit: ${customer.lastVisit || 'not recorded'}.`, customerNotes: 'Recommended monthly home maintenance inspection.',
          customerRequestNotes: '', source: 'Monthly recommendation', customerVisible: false, emailNotificationStatus: 'not_configured', smsNotificationStatus: 'not_configured',
          icsUid: crypto.randomUUID(), syncStatus: 'not_synced', createdAt: now, updatedAt: now,
        };
      });

      if (!supabaseConfigured || !supabase) {
        setCustomers(prev => prev.map(c => {
          const additions = newAppointments.filter(a => a.customerId === c.id && !(c.appointments || []).some(existing => activeStatuses.includes(existing.status)));
          return additions.length > 0 ? { ...c, appointments: [...additions, ...(c.appointments || [])] } : c;
        }));
        return;
      }

      const insertRes = await supabase.from('appointments').insert(newAppointments.map(appt => ({
        id: appt.id, organization_id: profile?.activeOrganizationId || null, property_id: appt.customerId, created_at: appt.createdAt, updated_at: appt.updatedAt, title: appt.title,
        status: appt.status, visit_type: appt.visitType, recommended_date: appt.recommendedDate || null, scheduled_start: appt.scheduledStart || null,
        scheduled_end: appt.scheduledEnd || null, duration_minutes: appt.durationMinutes, time_window: appt.timeWindow,
        internal_notes: appt.internalNotes, customer_notes: appt.customerNotes, customer_requested_start: appt.customerRequestedStart || null,
        customer_request_notes: appt.customerRequestNotes, source: appt.source, source_schedule_item_id: appt.sourceScheduleItemId || null,
        customer_visible: appt.customerVisible, email_notification_status: appt.emailNotificationStatus, sms_notification_status: appt.smsNotificationStatus,
        last_notification_sent_at: appt.lastNotificationSentAt || null, google_calendar_event_id: appt.googleCalendarEventId || null,
        outlook_calendar_event_id: appt.outlookCalendarEventId || null, ics_uid: appt.icsUid, sync_status: appt.syncStatus,
      })));
      if (insertRes.error) throw insertRes.error;
      setCustomers(prev => prev.map(c => {
        const additions = newAppointments.filter(a => a.customerId === c.id && !(c.appointments || []).some(existing => activeStatuses.includes(existing.status)));
        return additions.length > 0 ? { ...c, appointments: [...additions, ...(c.appointments || [])] } : c;
      }));
    } catch (error) {
      if ((error as { code?: string })?.code === '42501') {
        console.warn('Skipping automatic appointment recommendations because RLS blocked this background insert.', error);
        return;
      }
      setErrorMessage(friendlyError(error));
    } finally {
      ensuringAppointmentRecommendations.current = false;
    }
  };

  const appointmentToRow = (appointment: Appointment) => ({
    id: appointment.id, organization_id: profile?.activeOrganizationId || null, property_id: appointment.customerId || null, created_at: appointment.createdAt, updated_at: appointment.updatedAt,
    title: appointment.title, status: appointment.status, visit_type: appointment.visitType, recommended_date: appointment.recommendedDate || null,
    scheduled_start: appointment.scheduledStart || null, scheduled_end: appointment.scheduledEnd || null, duration_minutes: appointment.durationMinutes,
    time_window: appointment.timeWindow, internal_notes: appointment.internalNotes, customer_notes: appointment.customerNotes,
    customer_requested_start: appointment.customerRequestedStart || null, customer_request_notes: appointment.customerRequestNotes, source: appointment.source,
    source_schedule_item_id: appointment.sourceScheduleItemId || null, customer_visible: appointment.customerVisible,
    email_notification_status: appointment.emailNotificationStatus, sms_notification_status: appointment.smsNotificationStatus,
    last_notification_sent_at: appointment.lastNotificationSentAt || null, google_calendar_event_id: appointment.googleCalendarEventId || null,
    outlook_calendar_event_id: appointment.outlookCalendarEventId || null, ics_uid: appointment.icsUid, sync_status: appointment.syncStatus,
  });

  const createAppointment = async (appointment: Appointment) => {
    try {
      if (supabaseConfigured && supabase) {
        const insertRes = await supabase.from('appointments').insert(appointmentToRow(appointment));
        if (insertRes.error) throw insertRes.error;
      }
      const customerExists = Boolean(appointment.customerId && customers.some(c => c.id === appointment.customerId));
      if (customerExists) {
        setCustomers(prev => prev.map(c => c.id === appointment.customerId ? { ...c, appointments: [appointment, ...(c.appointments || [])] } : c));
      } else {
        setStandaloneAppointments(prev => [appointment, ...prev]);
      }
    } catch (error) {
      setErrorMessage(friendlyError(error));
    }
  };

  const updateAppointment = async (appointment: Appointment) => {
    const customerSnapshot = customers;
    const standaloneSnapshot = standaloneAppointments;
    setCustomers(prev => prev.map(c => ({ ...c, appointments: (c.appointments || []).filter(a => a.id !== appointment.id) })));
    setStandaloneAppointments(prev => prev.filter(a => a.id !== appointment.id));
    const customerExists = Boolean(appointment.customerId && customers.some(c => c.id === appointment.customerId));
    if (customerExists) {
      setCustomers(prev => prev.map(c => c.id === appointment.customerId ? { ...c, appointments: [appointment, ...(c.appointments || [])] } : c));
    } else {
      setStandaloneAppointments(prev => [appointment, ...prev]);
    }
    try {
      if (supabaseConfigured && supabase) {
        const shouldUseContractorWorkflow = Boolean(
          appointment.customerId &&
          profile?.activeOrganizationId &&
          profile.role !== 'customer' &&
          profile.role !== 'platform_admin'
        );
        if (shouldUseContractorWorkflow) {
          const workflowRes = await supabase.rpc('contractor_update_appointment_schedule', {
            p_appointment_id: appointment.id,
            p_scheduled_start: appointment.scheduledStart || appointment.recommendedDate,
            p_status: appointment.status,
            p_time_window: appointment.timeWindow,
            p_customer_note: appointment.customerNotes,
            p_internal_note: appointment.internalNotes,
          });
          const workflowMissing = workflowRes.error && ['42883', 'PGRST202', 'PGRST205'].includes((workflowRes.error as { code?: string }).code || '');
          if (workflowRes.error && !workflowMissing) throw workflowRes.error;
          if (workflowMissing) {
            const updateRes = await supabase.from('appointments').update(appointmentToRow({ ...appointment, updatedAt: new Date().toISOString() })).eq('id', appointment.id);
            if (updateRes.error) throw updateRes.error;
          }
        } else {
          const updateRes = await supabase.from('appointments').update(appointmentToRow({ ...appointment, updatedAt: new Date().toISOString() })).eq('id', appointment.id);
          if (updateRes.error) throw updateRes.error;
        }
      }
    } catch (error) {
      setCustomers(customerSnapshot);
      setStandaloneAppointments(standaloneSnapshot);
      setErrorMessage(friendlyError(error));
    }
  };

  const selectCustomerAndNavigate = (customerId: string, page: Page) => {
    setSelectedCustomerId(customerId);
    handleNavigate(page);
  };

  const saveCustomerOnboarding = async (updated: Customer) => {
    setErrorMessage(null);
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
    try {
      if (!supabaseConfigured || !supabase) return;

      const propertyRes = await supabase.from('properties').update({
        owner: updated.owner,
        phone: updated.phone,
        email: updated.email,
        home_sqft: updated.home.sqft,
        home_year_built: updated.home.yearBuilt,
        home_stories: updated.home.stories,
        home_garage: updated.home.garage,
        home_pool: updated.home.pool,
        home_roof_type: updated.home.roofType,
        home_roof_age: updated.home.roofAge,
        home_hvac_type: updated.home.hvacType,
        home_hvac_age: updated.home.hvacAge,
        home_notes: updated.home.notes,
      }).eq('id', updated.id);
      if (propertyRes.error) throw propertyRes.error;

      if (updated.vendors.length > 0) {
        const vendorRows = updated.vendors.map(vendor => ({
          id: vendor.id,
          property_id: updated.id,
          type: vendor.type,
          company: vendor.company,
          phone: vendor.phone,
          account: vendor.account,
          notes: vendor.notes,
        }));
        const vendorUpsert = await supabase.from('vendors').upsert(vendorRows, { onConflict: 'id' });
        if (vendorUpsert.error) throw vendorUpsert.error;
      }
      await loadCustomers();
    } catch (error) {
      setErrorMessage(friendlyError(error));
      throw error;
    }
  };

  const updateCustomerHomeDetails = async (customer: Customer, home: Customer['home']) => {
    setErrorMessage(null);
    const updated = { ...customer, home };
    setCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));
    try {
      if (!supabaseConfigured || !supabase) return;

      const propertyRes = await supabase.from('properties').update({
        home_sqft: home.sqft,
        home_year_built: home.yearBuilt,
        home_stories: home.stories,
        home_garage: home.garage,
        home_pool: home.pool,
        home_roof_type: home.roofType,
        home_roof_age: home.roofAge,
        home_hvac_type: home.hvacType,
        home_hvac_age: home.hvacAge,
        home_notes: home.notes,
      }).eq('id', customer.id);
      if (propertyRes.error) throw propertyRes.error;
      await loadCustomers();
    } catch (error) {
      setErrorMessage(friendlyError(error));
      await loadCustomers();
      throw error;
    }
  };

  const updateHomeownerProfile = async (customer: Customer, homeownerProfile: HomeownerProfileForm) => {
    setErrorMessage(null);
    const updated: Customer = {
      ...customer,
      name: homeownerProfile.name,
      address: homeownerProfile.address,
      owner: homeownerProfile.owner,
      phone: homeownerProfile.phone,
      email: homeownerProfile.email,
    };
    setCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));
    try {
      if (!supabaseConfigured || !supabase) return;

      const { error } = await supabase.rpc('update_my_homeowner_profile', {
        p_property_id: customer.id,
        p_name: homeownerProfile.name,
        p_address: homeownerProfile.address,
        p_owner: homeownerProfile.owner,
        p_phone: homeownerProfile.phone,
        p_email: homeownerProfile.email,
      });
      if (error) throw error;
      if (userId) setProfile(await loadProfile(userId));
      await loadCustomers();
    } catch (error) {
      setErrorMessage(friendlyError(error));
      await loadCustomers();
      throw error;
    }
  };

  const updateHomeownerVendors = async (customer: Customer, vendors: Vendor[]) => {
    setErrorMessage(null);
    const updated = { ...customer, vendors };
    setCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));
    try {
      if (!supabaseConfigured || !supabase) return;

      const propertyRes = await supabase
        .from('properties')
        .select('organization_id')
        .eq('id', customer.id)
        .maybeSingle();
      if (propertyRes.error) throw propertyRes.error;
      const organizationId = propertyRes.data?.organization_id;

      const deleteRes = await supabase.from('vendors').delete().eq('property_id', customer.id);
      if (deleteRes.error) throw deleteRes.error;

      if (vendors.length > 0) {
        const vendorRows = vendors.map(vendor => ({
          id: vendor.id,
          organization_id: organizationId,
          property_id: customer.id,
          type: vendor.type,
          company: vendor.company,
          phone: vendor.phone,
          account: vendor.account,
          notes: vendor.notes,
        }));
        const insertRes = await supabase.from('vendors').insert(vendorRows);
        if (insertRes.error) throw insertRes.error;
      }

      await loadCustomers();
    } catch (error) {
      setErrorMessage(friendlyError(error));
      await loadCustomers();
      throw error;
    }
  };

  const handleNewRequest = async (req: ServiceRequest, photoFile?: File | null) => {
    const customer = customers.find(c => c.id === req.customerId);
    if (!customer) throw new Error('Customer record not found for this request.');

    const snapshot = customers;
    let requestToSave = req;
    setErrorMessage(null);

    try {
      if (photoFile) {
        if (supabaseConfigured && supabase) {
          const ext = photoFile.name.split('.').pop() || 'jpg';
          const objectPath = `customer-requests/${customer.id}/${req.id}/${crypto.randomUUID()}.${ext}`;
          const uploadRes = await supabase.storage.from('photos').upload(objectPath, photoFile, { upsert: false });
          if (uploadRes.error) throw uploadRes.error;
          const { data: publicData } = supabase.storage.from('photos').getPublicUrl(objectPath);
          requestToSave = { ...req, photoUrl: publicData.publicUrl };
        } else {
          requestToSave = { ...req, photoUrl: URL.createObjectURL(photoFile) };
        }
      }

      const updated: Customer = { ...customer, requests: [...(customer.requests || []), requestToSave] };
      setCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));

      if (supabaseConfigured && supabase) {
        const requestInsert = await supabase.rpc('create_customer_request', {
          p_id: requestToSave.id,
          p_property_id: customer.id,
          p_customer_name: requestToSave.customerName,
          p_category: requestToSave.category,
          p_room: requestToSave.room,
          p_description: requestToSave.description,
          p_priority: requestToSave.priority,
          p_photo_url: requestToSave.photoUrl || null,
          p_status: requestToSave.status,
          p_contractor_notes: requestToSave.contractorNotes,
          p_read: requestToSave.read,
        });

        if (requestInsert.error) throw requestInsert.error;
      }
    } catch (error) {
      setCustomers(snapshot);
      setErrorMessage(friendlyError(error));
      throw new Error(friendlyError(error));
    }

    setToasts(prev => [...prev, {
      id: crypto.randomUUID(),
      customerName: requestToSave.customerName,
      category: requestToSave.category,
    }]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleSignOut = async () => {
    setErrorMessage(null);
    setCustomers([]);
    setProfile(null);
    setUserId(null);
    setCurrentPage('dashboard');
    window.location.hash = '';
    if (supabase) await supabase.auth.signOut();
  };

  if (legalPageType) {
    return <LegalPage type={legalPageType} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading properties from Supabase...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && customers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
        <div className="max-w-lg bg-white border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-lg font-semibold text-red-700">Unable to load your data.</p>
          <p className="text-sm text-slate-600 mt-2">{errorMessage}</p>
          <button
            onClick={() => { void loadCustomers(); }}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!authReady && !onboardingMode && !contractorSetupMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (contractorSetupMode) {
    return <ContractorSetup organizationId={contractorSetupOrgId} />;
  }

  if (loginMode || showPostOnboardingLogin) {
    const path = showPostOnboardingLogin ? 'homeowner' : loginPath;
    return (
      <AuthScreen
        path={path}
        mode={authMode}
        notice={authNotice}
        onSignedIn={() => {
          if (path === 'platform') window.location.replace(`${window.location.origin}${window.location.pathname}#/platform`);
          else if (path === 'contractor') window.location.replace(`${window.location.origin}${window.location.pathname}#/app/dashboard`);
          else window.location.replace(`${window.location.origin}${window.location.pathname}`);
        }}
      />
    );
  }

  if (!userId && platformMode) {
    return (
      <AuthScreen
        path="platform"
        notice={authNotice}
        onSignedIn={() => window.location.replace(`${window.location.origin}${window.location.pathname}#/platform`)}
      />
    );
  }

  if (!userId && portalMode) {
    return (
      <AuthScreen
        path="homeowner"
        notice="Please sign in to access your homeowner portal."
        onSignedIn={() => window.location.replace(`${window.location.origin}${window.location.pathname}`)}
      />
    );
  }

  if (!userId && !onboardingMode) {
    return (
      <LandingPage
        onHomeownerLogin={() => { window.location.hash = '#/homeowner-login'; }}
        onHomeownerSignup={() => { window.location.hash = '#/homeowner-signup'; }}
        onContractorLogin={() => { window.location.hash = '#/contractor-login'; }}
      />
    );
  }

  if (profile?.role === 'platform_admin') {
    if (!platformMode) {
      window.location.hash = '#/platform';
    }
    return <PlatformAdmin profile={profile} onSignOut={() => { void handleSignOut(); }} />;
  }

  if (platformMode) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md p-6 text-center">
          <p className="font-semibold text-slate-800">Page not found</p>
          <button onClick={() => { window.location.hash = '#/contractor-login'; }} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Continue</button>
        </div>
      </div>
    );
  }

  if (profile?.role === 'customer' && !onboardingMode) {
    const customer = customers.find(c => c.id === profile.propertyId);
    if (customer?.isActive === false) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md p-6 text-center">
            <p className="font-semibold text-slate-800">Account inactive</p>
            <p className="text-sm text-slate-500 mt-2">Please contact your contractor if you need access to this homeowner portal.</p>
            <button onClick={() => { if (supabase) void supabase.auth.signOut(); }} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Sign Out</button>
          </div>
        </div>
      );
    }
    return (
      <CustomerPortal
        customers={customers}
        portalUserOverride={{ id: profile.id, name: profile.fullName || profile.email, email: profile.email, customerId: profile.propertyId || '' }}
        onNewRequest={handleNewRequest}
        onCreateHomeProfile={createHomeownerHomeProfile}
        onUpdateHomeownerProfile={updateHomeownerProfile}
        onUpdateAppointment={updateAppointment}
        onRefreshData={loadCustomers}
        onUpdateHomeDetails={updateCustomerHomeDetails}
        onUpdateHomeownerVendors={updateHomeownerVendors}
        onExit={() => {
          setErrorMessage(null);
          setCustomers([]);
          setProfile(null);
          setUserId(null);
          window.location.hash = '';
          if (supabase) void supabase.auth.signOut();
        }}
      />
    );
  }

  if (onboardingMode) {
    const onboardingCustomer = customers.find(c => c.id === onboardingCustomerId) || null;
    return (
      <CustomerOnboarding
        customer={onboardingCustomer}
        onSubmit={saveCustomerOnboarding}
        onExit={() => {
          const loginUrl = `${window.location.origin}${window.location.pathname}#/homeowner-login?created=1`;
          setOnboardingMode(false);
          setPortalMode(false);
          setLoginMode(true);
          setOnboardingCustomerId(null);
          setProfile(null);
          setUserId(null);
          setAuthNotice('Account created successfully. Please sign in with the email and password you just set up.');
          setShowPostOnboardingLogin(true);
          if (!supabase) {
            window.location.replace(loginUrl);
            return;
          }
          void supabase.auth.signOut().finally(() => {
            window.location.replace(loginUrl);
          });
        }}
      />
    );
  }

  if (portalMode) {
    return <AuthScreen path="homeowner" notice="Please sign in to access your homeowner portal." onSignedIn={() => window.location.replace('/')} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={setSelectedCustomerId}
            onNavigate={handleNavigate}
          />
        );
      case 'customers':
        return (
          <Customers
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={setSelectedCustomerId}
            onAddCustomer={addCustomer}
            onUpdateCustomer={updateCustomer}
            onDeleteCustomer={deleteCustomer}
            onNavigate={handleNavigate}
            qbSettings={qbSettings}
            onUpdateReportLogVisibility={updateReportLogVisibility}
          />
        );
      case 'connected':
        return (
          <ConnectedHomeowners
            customers={customers}
            onSelectCustomer={setSelectedCustomerId}
            onNavigate={handleNavigate}
            onRefreshData={loadCustomers}
          />
        );
      case 'checklist':
        return (
          <BuildChecklist
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onUpdateCustomer={updateCustomer}
          />
        );
      case 'inspection':
        return (
          <RunInspection
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onUploadPhotos={uploadInspectionPhotos}
            onDeletePhoto={deleteInspectionPhoto}
            onCreateFinding={createFinding}
            onUpdateFinding={updateFindingById}
            onAddUploadedPhotos={addUploadedPhotosToCustomer}
            onUpdateCustomer={updateCustomer}
            isInspectionLocked={selectedInspectionClosed}
          />
        );
      case 'report':
        return (
          <RoomReport
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            qbSettings={qbSettings}
            onUpdateCustomer={updateCustomer}
            onAddReportLog={addReportLog}
            onClearCurrentInspection={clearCurrentInspection}
            isInspectionClosed={selectedInspectionClosed}
            onSetInspectionClosed={setInspectionClosedForCustomer}
          />
        );
      case 'calendar':
        return (
          <Calendar
            customers={customers}
            appointments={[...customers.flatMap(c => c.appointments || []), ...standaloneAppointments]}
            onEnsureRecommendations={ensureAppointmentRecommendations}
            onUpdateAppointment={updateAppointment}
            onCreateAppointment={createAppointment}
            onSelectCustomer={selectCustomerAndNavigate}
          />
        );
      case 'tracker':
        return (
          <WorkTracker
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onUpdateCustomer={updateCustomer}
            qbSettings={qbSettings}
          />
        );
      case 'settings':
        return (
          <Settings
            profile={profile}
            qbSettings={qbSettings}
            onUpdateQB={setQbSettings}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} onSignOut={() => { void handleSignOut(); }} />
      <main className="flex-1 overflow-hidden" style={{ minHeight: '100vh' }}>
        {errorMessage && (
          <div className="mx-6 mt-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        {renderPage()}
      </main>

      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(toast => (
            <ToastNotification key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </div>
      )}

      <div className="fixed bottom-4 left-0 w-60 px-4 text-center z-10">
        <button
          onClick={() => { window.location.hash = '#/homeowner-login'; setLoginMode(true); setLoginPath('homeowner'); }}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
        >
          Homeowner Login
        </button>
      </div>
    </div>
  );
}
