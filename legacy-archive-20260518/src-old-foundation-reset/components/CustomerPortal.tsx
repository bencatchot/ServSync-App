import { useEffect, useRef, useState } from 'react';
import { LogOut, Upload, X, ChevronDown, ChevronUp, Download, ExternalLink, Home, Save, ShieldCheck, SlidersHorizontal, UserX, Search, MapPin, BadgeCheck, PlusCircle, Star, Trash2, Pencil, CalendarDays } from 'lucide-react';
import { Appointment, Customer, ServiceRequest, RequestCategory, RequestPriority, RequestStatus, PortalUser, Finding, HvacType, RoofType, Vendor } from '../types';
import { PORTAL_USER, PORTAL_DEMO_PASSWORD, VENDOR_TYPES } from '../data';
import { supabase } from '../supabaseClient';

interface CustomerPortalProps {
  customers: Customer[];
  onNewRequest: (req: ServiceRequest, photoFile?: File | null) => void | Promise<void>;
  onExit: () => void;
  portalUserOverride?: PortalUser;
  onCreateHomeProfile?: (home: { name: string; address: string; owner: string; phone: string; email: string }) => Promise<void> | void;
  onUpdateHomeownerProfile?: (customer: Customer, profile: HomeownerProfileForm) => Promise<void> | void;
  onUpdateAppointment?: (appointment: Appointment) => Promise<void> | void;
  onRefreshData?: () => Promise<void> | void;
  onUpdateHomeDetails?: (customer: Customer, home: Customer['home']) => Promise<void> | void;
  onUpdateHomeownerVendors?: (customer: Customer, vendors: Vendor[]) => Promise<void> | void;
}

const CATEGORIES: RequestCategory[] = ['HVAC', 'Plumbing', 'Electrical', 'Appliance', 'Exterior', 'Interior', 'Pest/Landscaping', 'Other'];

const ROOF_TYPES: RoofType[] = ['Asphalt Shingles', 'Metal', 'Tile', 'Flat/TPO', 'Slate', 'Wood Shake', 'Other'];
const HVAC_TYPES: HvacType[] = ['Central Air/Gas Heat', 'Heat Pump', 'Mini-Split', 'Window Units', 'Radiant', 'Other'];

type ConnectionStatus = 'pending' | 'active' | 'declined' | 'revoked';
type SharingPermissions = {
  basic_profile: boolean;
  property_details: boolean;
  vendors: boolean;
  maintenance: boolean;
  service_requests: boolean;
  reports: boolean;
  photos: boolean;
  appointments: boolean;
  invoices: boolean;
};

type HomeConnection = {
  id: string;
  property_id: string;
  organization_id: string;
  status: ConnectionStatus;
  source: string;
  is_preferred?: boolean;
  permissions: SharingPermissions;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  revoked_at: string | null;
  contractor: {
    name: string;
    support_email: string;
    support_phone: string;
    website_url: string;
    service_categories: string[];
    service_zip_codes: string[];
    service_radius_miles: number;
    license_number: string;
    business_license_number: string;
    insured: boolean;
    bonded: boolean;
    years_in_business: string;
    google_reviews_url: string;
    testimonials_url: string;
    public_bio: string;
  };
};

type DirectoryContractor = {
  id: string;
  name: string;
  support_email: string;
  support_phone: string;
  website_url: string;
  service_categories: string[];
  service_zip_codes: string[];
  service_radius_miles: number;
  license_number: string;
  business_license_number: string;
  insured: boolean;
  bonded: boolean;
  years_in_business: string;
  google_reviews_url: string;
  testimonials_url: string;
  public_bio: string;
};

type RequestRouteSummary = {
  route_id: string;
  request_id: string;
  status: string;
  response_message: string;
  response_next_action: string;
  estimate_range: string;
  responded_at: string | null;
  homeowner_action: string;
  homeowner_action_at: string | null;
  quote_pdf_path: string;
  quote_file_name: string;
  quote_status: string;
  quote_uploaded_at: string | null;
  appointment_id: string | null;
  appointment: {
    id: string;
    status: string;
    scheduled_start: string;
    scheduled_end: string;
    time_window: string;
    customer_requested_start: string;
    customer_request_notes: string;
  } | null;
  created_at: string;
  updated_at: string;
  contractor: {
    name: string;
    support_email: string;
    support_phone: string;
  };
};

export type HomeownerProfileForm = {
  name: string;
  address: string;
  owner: string;
  phone: string;
  email: string;
};

const DEFAULT_PERMISSIONS: SharingPermissions = {
  basic_profile: true,
  property_details: false,
  vendors: false,
  maintenance: false,
  service_requests: false,
  reports: false,
  photos: false,
  appointments: false,
  invoices: false,
};

const PERMISSION_OPTIONS: { key: keyof SharingPermissions; label: string; description: string }[] = [
  { key: 'basic_profile', label: 'Basic profile', description: 'Home nickname, general homeowner name, and basic contact context.' },
  { key: 'property_details', label: 'Property details', description: 'Home systems, rooms, checklist structure, and general home information.' },
  { key: 'vendors', label: 'Vendors', description: 'Preferred service providers and account notes.' },
  { key: 'maintenance', label: 'Maintenance schedule', description: 'Upcoming and completed maintenance recommendations.' },
  { key: 'service_requests', label: 'Service requests', description: 'Requests and issue history submitted through the portal.' },
  { key: 'reports', label: 'Reports', description: 'Published report summaries and PDFs only.' },
  { key: 'photos', label: 'Photos', description: 'Photos attached to shared home details, reports, or requests.' },
  { key: 'appointments', label: 'Appointments', description: 'Shared scheduling and appointment history.' },
  { key: 'invoices', label: 'Invoices', description: 'Non-draft invoice history.' },
];

const CONTRACTOR_SEARCH_CATEGORIES = [
  '',
  'HVAC',
  'Plumbing',
  'Electrical',
  'Appliance',
  'Roofing',
  'Exterior',
  'Interior',
  'Pest/Landscaping',
  'Handyman',
  'Builder',
  'Other',
];


const CATEGORY_ICONS: Record<RequestCategory, string> = {
  'HVAC': '❄️',
  'Plumbing': '🔧',
  'Electrical': '⚡',
  'Appliance': '🫧',
  'Exterior': '🏡',
  'Interior': '🛋️',
  'Pest/Landscaping': '🌿',
  'Other': '📋',
};

function contractorMatchesRequestCategory(connection: HomeConnection, category: RequestCategory) {
  const categories = (connection.contractor.service_categories || []).map(item => item.toLowerCase());
  const haystack = categories.join(' ');
  if (category === 'HVAC') return haystack.includes('hvac');
  if (category === 'Plumbing') return haystack.includes('plumb');
  if (category === 'Electrical') return haystack.includes('electric');
  if (category === 'Appliance') return haystack.includes('appliance');
  if (category === 'Exterior') return ['roof', 'exterior', 'pressure', 'washing', 'landscape', 'lawn', 'pool', 'general contractor', 'handyman'].some(term => haystack.includes(term));
  if (category === 'Interior') return ['interior', 'paint', 'drywall', 'carpentry', 'cleaning', 'handyman', 'general contractor'].some(term => haystack.includes(term));
  if (category === 'Pest/Landscaping') return ['pest', 'landscape', 'lawn'].some(term => haystack.includes(term));
  return true;
}

function requestRouteTimeline(route: RequestRouteSummary) {
  const events = [
    { label: 'Sent to contractor', value: route.created_at },
    { label: `Contractor marked ${route.status}`, value: route.updated_at, show: route.status && route.status !== 'sent' },
    { label: 'Contractor responded', value: route.responded_at, show: Boolean(route.response_message) },
    { label: 'Quote attached', value: route.quote_uploaded_at, show: Boolean(route.quote_pdf_path) },
    { label: `Homeowner: ${route.homeowner_action}`, value: route.homeowner_action_at, show: Boolean(route.homeowner_action) },
    { label: `Quote ${route.quote_status.replace('_', ' ')}`, value: route.updated_at, show: ['accepted', 'changes_requested', 'declined'].includes(route.quote_status) },
  ];
  return events.filter(event => event.show !== false && event.value);
}

function formatShortDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_STYLES: Record<RequestStatus, React.CSSProperties> = {
  'Pending': { backgroundColor: '#f1f5f9', color: '#64748b' },
  'Scheduled': { backgroundColor: '#dbeafe', color: '#2563eb' },
  'In Progress': { backgroundColor: '#fef3c7', color: '#d97706' },
  'Completed': { backgroundColor: '#dcfce7', color: '#16a34a' },
};

const PRIORITY_STYLES: Record<RequestPriority, React.CSSProperties> = {
  'Low': { backgroundColor: '#f1f5f9', color: '#64748b' },
  'Medium': { backgroundColor: '#dbeafe', color: '#2563eb' },
  'Urgent': { backgroundColor: '#fee2e2', color: '#dc2626' },
};

function getRoomFindings(customer: Customer): Finding[] {
  return Object.values(customer.findings).flat().filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site');
}

function getHealthScore(customer: Customer): { score: number; label: string; color: string; bg: string } {
  const allFindings = Object.values(customer.findings).flat();
  const urgent = allFindings.filter(f => f.status === 'Urgent').length;
  const issues = allFindings.filter(f => f.status === 'Needs Repair').length;
  if (urgent > 0) return { score: 60, label: 'Needs Attention', color: '#dc2626', bg: '#fee2e2' };
  if (issues > 1) return { score: 78, label: 'Fair', color: '#d97706', bg: '#fef3c7' };
  if (issues > 0) return { score: 88, label: 'Good', color: '#d97706', bg: '#fef3c7' };
  return { score: 96, label: 'Excellent', color: '#16a34a', bg: '#dcfce7' };
}

// ─── Login Screen ────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (user: PortalUser) => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (email === PORTAL_USER.email && password === PORTAL_DEMO_PASSWORD) {
      onLogin(PORTAL_USER);
    } else {
      setError('Invalid email or password. Try: sokafor@promail.com / demo1234');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#f0f7ff' }}>
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🛡️</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ServSync</h1>
          <p className="text-slate-500 text-sm mt-1">Building Trust with Quality Work</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${!isSignUp ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${isSignUp ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              Sign Up
            </button>
          </div>

          <div className="space-y-4">
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors" placeholder="Your name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Property Address</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors" placeholder="123 Main St, City, State" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                type="email"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors"
                placeholder="you@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input
                type="password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
              />
            </div>
            {isSignUp && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Confirm Password</label>
                <input type="password" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors" placeholder="••••••••" />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{error}</div>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors mt-2"
            >
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">Access your home maintenance portal — view reports and submit service requests.</p>

          {!isSignUp && (
            <p className="text-center text-xs text-slate-400 mt-2">Demo: sokafor@promail.com / demo1234</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Portal Home ─────────────────────────────────────────────────────────────

export default function CustomerPortal({ customers, onNewRequest, onExit, portalUserOverride, onCreateHomeProfile, onUpdateHomeownerProfile, onRefreshData, onUpdateHomeDetails, onUpdateHomeownerVendors }: CustomerPortalProps) {
  const [portalUser, setPortalUser] = useState<PortalUser | null>(portalUserOverride || null);
  const [requestTab, setRequestTab] = useState<'overview' | 'requests' | 'calendar' | 'profile' | 'home' | 'connections' | 'vendors' | 'reports' | 'invoices'>('overview');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: 'HVAC' as RequestCategory,
    room: '',
    description: '',
    priority: 'Medium' as RequestPriority,
  });
  const [selectedRouteConnectionIds, setSelectedRouteConnectionIds] = useState<string[]>([]);
  const [homeForm, setHomeForm] = useState<Customer['home'] | null>(null);
  const [homeSaveStatus, setHomeSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileForm, setProfileForm] = useState<HomeownerProfileForm | null>(null);
  const [profileSaveStatus, setProfileSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [connections, setConnections] = useState<HomeConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');
  const [savingConnectionId, setSavingConnectionId] = useState<string | null>(null);
  const [requestRoutes, setRequestRoutes] = useState<RequestRouteSummary[]>([]);
  const [liveRequests, setLiveRequests] = useState<ServiceRequest[] | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [savingHomeownerRouteActionId, setSavingHomeownerRouteActionId] = useState<string | null>(null);
  const [timeRequest, setTimeRequest] = useState<{ appointmentId: string; context: 'route' | 'next' } | null>(null);
  const [timeRequestDate, setTimeRequestDate] = useState('');
  const [timeRequestTime, setTimeRequestTime] = useState('09:00');

  const activePortalUser = portalUser || portalUserOverride;
  const customer = customers.find(c => c.id === activePortalUser?.customerId);

  const loadConnections = async (propertyId: string) => {
    setConnectionsLoading(true);
    setConnectionsError('');
    try {
      if (!supabase) {
        setConnections([]);
        return;
      }
      const { data, error } = await supabase.rpc('get_my_home_connections', { p_property_id: propertyId });
      if (error) throw error;
      setConnections((data || []) as HomeConnection[]);
    } catch (error) {
      setConnectionsError(error instanceof Error ? error.message : 'Unable to load contractor connections.');
    } finally {
      setConnectionsLoading(false);
    }
  };

  const loadRequestRoutes = async (propertyId: string) => {
    try {
      if (!supabase) {
        setRequestRoutes([]);
        return;
      }
      const { data, error } = await supabase.rpc('get_my_request_routes', { p_property_id: propertyId });
      if (error) throw error;
      setRequestRoutes((data || []) as RequestRouteSummary[]);
    } catch (error) {
      console.warn('Unable to load request routes:', error);
      setRequestRoutes([]);
    }
  };

  const loadLiveRequests = async (propertyId: string) => {
    try {
      if (!supabase) {
        setLiveRequests(null);
        return;
      }
      const { data, error } = await supabase
        .from('requests')
        .select('id,created_at,property_id,customer_name,category,room,description,priority,photo_url,status,contractor_notes,read')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setLiveRequests((data || []).map(row => ({
        id: row.id,
        customerId: row.property_id,
        customerName: row.customer_name,
        category: row.category as RequestCategory,
        room: row.room,
        description: row.description,
        priority: row.priority as RequestPriority,
        photoUrl: row.photo_url || undefined,
        status: row.status as RequestStatus,
        contractorNotes: row.contractor_notes,
        submittedAt: new Date(row.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        read: row.read,
      })));
    } catch (error) {
      console.warn('Unable to load live requests:', error);
      setLiveRequests(supabase ? [] : null);
    }
  };

  useEffect(() => {
    if (!customer?.id) {
      setConnections([]);
      setRequestRoutes([]);
      setLiveRequests(null);
      return;
    }
    void loadConnections(customer.id);
    void loadRequestRoutes(customer.id);
    void loadLiveRequests(customer.id);
  }, [customer?.id]);

  if (!portalUser && !portalUserOverride) {
    return <LoginScreen onLogin={setPortalUser} />;
  }

  if (!customer) {
    return (
      <HomeProfileSetup
        user={activePortalUser}
        onExit={onExit}
        onCreateHomeProfile={onCreateHomeProfile}
      />
    );
  }

  const updateConnectionPermissions = async (connection: HomeConnection, permissions: SharingPermissions, nextStatus?: ConnectionStatus) => {
    setSavingConnectionId(connection.id);
    setConnectionsError('');
    setConnectionNotice('');
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error } = await supabase.rpc('update_my_home_connection', {
        p_connection_id: connection.id,
        p_status: nextStatus || connection.status,
        p_permissions: permissions,
      });
      if (error) throw error;
      setConnectionNotice(nextStatus === 'revoked' ? 'Contractor access revoked.' : 'Sharing permissions saved.');
      await loadConnections(customer.id);
    } catch (error) {
      setConnectionsError(error instanceof Error ? error.message : 'Unable to update contractor connection.');
    } finally {
      setSavingConnectionId(null);
    }
  };

  const updateConnectionPreferred = async (connection: HomeConnection, isPreferred: boolean) => {
    setSavingConnectionId(connection.id);
    setConnectionsError('');
    setConnectionNotice('');
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error } = await supabase.rpc('set_my_home_connection_preferred', {
        p_connection_id: connection.id,
        p_is_preferred: isPreferred,
      });
      if (error) throw error;
      setConnectionNotice(isPreferred ? 'Preferred contractor saved.' : 'Preferred contractor removed.');
      await loadConnections(customer.id);
    } catch (error) {
      setConnectionsError(error instanceof Error ? error.message : 'Unable to update preferred contractor.');
    } finally {
      setSavingConnectionId(null);
    }
  };

  const updateHomeownerRouteAction = async (routeId: string, action: string) => {
    setSavingHomeownerRouteActionId(routeId);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error } = await supabase.rpc('update_my_request_route_action', {
        p_route_id: routeId,
        p_homeowner_action: action,
      });
      if (error) throw error;
      await loadRequestRoutes(customer.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to update request response.');
    } finally {
      setSavingHomeownerRouteActionId(null);
    }
  };

  const updateQuoteStatus = async (routeId: string, status: string) => {
    setSavingHomeownerRouteActionId(routeId);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error } = await supabase.rpc('update_my_request_quote_status', {
        p_route_id: routeId,
        p_quote_status: status,
      });
      if (error) throw error;
      await loadRequestRoutes(customer.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to update quote status.');
    } finally {
      setSavingHomeownerRouteActionId(null);
    }
  };

  const confirmRouteAppointment = async (appointmentId: string) => {
    setSavingHomeownerRouteActionId(appointmentId);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error } = await supabase.rpc('servsync_homeowner_confirm_appointment', { p_appointment_id: appointmentId });
      if (error) throw error;
      await loadRequestRoutes(customer.id);
      if (onRefreshData) await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to confirm appointment.');
    } finally {
      setSavingHomeownerRouteActionId(null);
    }
  };

  const openTimeRequest = (appointmentId: string, context: 'route' | 'next') => {
    setTimeRequest({ appointmentId, context });
    setTimeRequestDate('');
    setTimeRequestTime('09:00');
  };

  const submitTimeRequest = async () => {
    if (!timeRequest || !timeRequestDate) return;
    const requested = new Date(`${timeRequestDate}T${timeRequestTime}:00`).toISOString();
    const appointmentId = timeRequest.appointmentId;
    setSavingHomeownerRouteActionId(appointmentId);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error } = await supabase.rpc('servsync_homeowner_request_appointment_time', {
        p_appointment_id: appointmentId,
        p_requested_start: requested,
        p_notes: `Homeowner requested: ${new Date(requested).toLocaleString()}`,
      });
      if (error) throw error;
      await loadRequestRoutes(customer.id);
      if (onRefreshData) await onRefreshData();
      setTimeRequest(null);
      alert('Your requested time has been sent to the contractor. This does not confirm the appointment; the contractor still needs to approve or offer another time.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to request a new time.');
    } finally {
      setSavingHomeownerRouteActionId(null);
    }
  };

  const openQuotePdf = async (path: string) => {
    if (!path || !supabase) return;
    const { data, error } = await supabase.storage.from('quotes').createSignedUrl(path, 60 * 10);
    if (error) {
      alert(error.message);
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const health = getHealthScore(customer);
  const requests = supabase ? (liveRequests || []) : (customer.requests || []);
  const activeConnections = connections.filter(connection => connection.status === 'active');
  const matchingConnections = activeConnections
    .filter(connection => contractorMatchesRequestCategory(connection, form.category))
    .sort((a, b) => Number(Boolean(b.is_preferred)) - Number(Boolean(a.is_preferred)));

  const toggleRouteConnection = (connectionId: string) => {
    setSelectedRouteConnectionIds(prev => prev.includes(connectionId) ? prev.filter(id => id !== connectionId) : [...prev, connectionId]);
  };

  const handleSubmit = async () => {
    if (!form.description.trim() || isSubmitting) return;
    setSubmitError('');
    setIsSubmitting(true);
    const req: ServiceRequest = {
      id: crypto.randomUUID(),
      customerId: customer.id,
      customerName: customer.owner,
      category: form.category,
      room: form.room,
      description: form.description,
      priority: form.priority,
      photoUrl: photoPreview || undefined,
      status: 'Pending',
      contractorNotes: '',
      submittedAt: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      read: false,
    };
    try {
      await onNewRequest(req, photoFile);
      if (selectedRouteConnectionIds.length > 0 && supabase) {
        const { error } = await supabase.rpc('create_request_connection_routes', {
          p_request_id: req.id,
          p_connection_ids: selectedRouteConnectionIds,
        });
        if (error) throw error;
        await loadRequestRoutes(customer.id);
      }
      await loadLiveRequests(customer.id);
      setForm({ category: 'HVAC', room: '', description: '', priority: 'Medium' });
      setSelectedRouteConnectionIds([]);
      setPhotoPreview(null);
      setPhotoFile(null);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 5000);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhoto = (files: FileList | null) => {
    if (!files || !files[0]) return;
    setPhotoFile(files[0]);
    setPhotoPreview(URL.createObjectURL(files[0]));
  };

  const customerReports = [...(customer.reportLogs || [])]
    .filter(report => report.isPublished)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const liveFindings = getRoomFindings(customer);
  const routeAppointments = requestRoutes
    .map(route => route.appointment ? ({
      id: route.appointment.id,
      customerId: customer.id,
      title: `Service visit with ${route.contractor.name}`,
      status: route.appointment.status as Appointment['status'],
      visitType: 'Follow-up' as Appointment['visitType'],
      recommendedDate: route.appointment.scheduled_start ? route.appointment.scheduled_start.split('T')[0] : '',
      scheduledStart: route.appointment.scheduled_start || '',
      scheduledEnd: route.appointment.scheduled_end || '',
      durationMinutes: 60,
      timeWindow: route.appointment.time_window as Appointment['timeWindow'],
      internalNotes: '',
      customerNotes: route.response_message || '',
      customerRequestedStart: route.appointment.customer_requested_start || undefined,
      customerRequestNotes: route.appointment.customer_request_notes || '',
      source: 'Service request route',
      customerVisible: true,
      emailNotificationStatus: 'not_configured',
      smsNotificationStatus: 'not_configured',
      icsUid: route.appointment.id,
      syncStatus: 'not_synced',
      createdAt: route.created_at,
      updatedAt: route.updated_at,
    }) : null)
    .filter(Boolean) as Appointment[];
  const homeownerAppointments = Array.from(
    new Map(
      [...(customer.appointments || []), ...routeAppointments]
        .filter(appt => appt.customerVisible || routeAppointments.some(routeAppt => routeAppt.id === appt.id))
        .map(appt => [appt.id, appt])
    ).values()
  ).sort((a, b) => new Date(a.scheduledStart || a.recommendedDate || a.createdAt).getTime() - new Date(b.scheduledStart || b.recommendedDate || b.createdAt).getTime());
  const nextAppointment = [...(customer.appointments || [])]
    .filter(appt => appt.customerVisible && ['Recommended', 'Confirmed', 'Customer Requested', 'Cancelled'].includes(appt.status))
    .sort((a, b) => new Date(a.scheduledStart || a.recommendedDate).getTime() - new Date(b.scheduledStart || b.recommendedDate).getTime())[0];
  const refreshAfterAppointmentChange = async () => {
    if (onRefreshData) await onRefreshData();
  };
  const confirmAppointment = async () => {
    if (!nextAppointment) return;
    const { error } = await supabase.rpc('customer_confirm_appointment', { p_appointment_id: nextAppointment.id });
    if (error) {
      alert(error.message);
      return;
    }
    await refreshAfterAppointmentChange();
  };
  const cancelAppointment = async () => {
    if (!nextAppointment) return;
    const note = window.prompt('Cancellation note (optional)') || 'Customer cancelled appointment.';
    const { error } = await supabase.rpc('customer_cancel_appointment', { p_appointment_id: nextAppointment.id, p_notes: note });
    if (error) {
      alert(error.message);
      return;
    }
    await refreshAfterAppointmentChange();
  };
  const requestNewAppointmentTime = async () => {
    if (!nextAppointment) return;
    openTimeRequest(nextAppointment.id, 'next');
  };
  const appointmentDate = nextAppointment?.scheduledStart ? new Date(nextAppointment.scheduledStart).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  const editableHome = homeForm || customer.home;
  const editableProfile = profileForm || {
    name: customer.name,
    address: customer.address,
    owner: customer.owner,
    phone: customer.phone,
    email: customer.email,
  };
  const setEditableHome = (updates: Partial<Customer['home']>) => {
    setHomeForm(prev => ({ ...(prev || customer.home), ...updates }));
    setHomeSaveStatus('idle');
  };
  const setEditableProfile = (updates: Partial<HomeownerProfileForm>) => {
    setProfileForm(prev => ({
      ...(prev || {
        name: customer.name,
        address: customer.address,
        owner: customer.owner,
        phone: customer.phone,
        email: customer.email,
      }),
      ...updates,
    }));
    setProfileSaveStatus('idle');
  };
  const saveHomeownerProfile = async () => {
    if (!onUpdateHomeownerProfile || profileSaveStatus === 'saving') return;
    setProfileSaveStatus('saving');
    try {
      await onUpdateHomeownerProfile(customer, editableProfile);
      setProfileSaveStatus('saved');
      setTimeout(() => setProfileSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Homeowner profile update failed:', error);
      setProfileSaveStatus('error');
    }
  };
  const saveHomeDetails = async () => {
    if (!onUpdateHomeDetails || homeSaveStatus === 'saving') return;
    setHomeSaveStatus('saving');
    try {
      await onUpdateHomeDetails(customer, editableHome);
      setHomeSaveStatus('saved');
      setTimeout(() => setHomeSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Home detail update failed:', error);
      setHomeSaveStatus('error');
    }
  };
  const activeRequestCount = requests.filter(request => request.status !== 'Completed').length;
  const needsReviewCount = requestRoutes.filter(route =>
    (route.response_message && !route.homeowner_action) ||
    (route.quote_pdf_path && !['accepted', 'changes_requested', 'declined'].includes(route.quote_status)) ||
    (route.appointment && route.appointment.status !== 'Confirmed')
  ).length;
  const activeAppointmentCount = homeownerAppointments.filter(appointment => appointment.status !== 'Completed' && appointment.status !== 'Cancelled').length;
  const portalTabs = [
    { key: 'overview', label: 'Home' },
    { key: 'home', label: 'My Home' },
    { key: 'connections', label: 'My Contractors' },
    { key: 'profile', label: 'My Profile' },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-base">🛡️</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm leading-tight">ServSync</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 font-medium">{activePortalUser?.name}</span>
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <LogOut size={13} /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* My Property */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 text-sm mb-3">My Property</h2>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-800">{customer.name}</p>
              <p className="text-slate-500 text-sm">{customer.address}</p>
              <div className="flex flex-wrap gap-3 mt-2">
                <span className="text-xs text-slate-500">Plan: <span className="font-medium text-slate-700">{customer.plan}</span></span>
                {customer.lastVisit && (
                  <span className="text-xs text-slate-500">Last visit: <span className="font-medium text-slate-700">{customer.lastVisit}</span></span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-500">
                {customer.home.yearBuilt && <span className="bg-slate-100 rounded-full px-2.5 py-1">Built {customer.home.yearBuilt}</span>}
                {customer.home.sqft && <span className="bg-slate-100 rounded-full px-2.5 py-1">{customer.home.sqft} sq ft</span>}
                {customer.home.hvacType && <span className="bg-slate-100 rounded-full px-2.5 py-1">{customer.home.hvacType}</span>}
              </div>
            </div>
            <div className="text-center flex-shrink-0">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-4" style={{ borderColor: health.color, color: health.color, backgroundColor: health.bg }}>
                {health.score}
              </div>
              <p className="text-xs font-semibold mt-1" style={{ color: health.color }}>{health.label}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Home rating:</span> This score summarizes visible maintenance items from your reports. Urgent or open repair items lower the score; completed or passed items keep it higher. It is a maintenance planning guide, not a formal home inspection grade.
          </div>
        </div>

        <div className="sticky top-[57px] z-20 -mx-4 border-y border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {portalTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setRequestTab(tab.key)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${requestTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {requestTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setRequestTab('home')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200">
                <p className="text-xs font-semibold text-slate-500">Home profile</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{customer.home.sqft || '--'}</p>
                <p className="mt-1 text-xs text-slate-400">{customer.home.sqft ? 'Square feet saved' : 'Add home details'}</p>
              </button>
              <button onClick={() => setRequestTab('connections')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200">
                <p className="text-xs font-semibold text-slate-500">Connections</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{activeConnections.length}</p>
                <p className="mt-1 text-xs text-slate-400">Contractors connected</p>
              </button>
              <button onClick={() => setRequestTab('connections')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200">
                <p className="text-xs font-semibold text-slate-500">Find contractors</p>
                <p className="mt-2 text-2xl font-bold text-slate-900"><Search size={26} /></p>
                <p className="mt-1 text-xs text-slate-400">Search local businesses</p>
              </button>
              <button onClick={() => setRequestTab('profile')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200">
                <p className="text-xs font-semibold text-slate-500">My profile</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{customer.owner || 'Add owner'}</p>
                <p className="mt-1 text-xs text-slate-400">Contact and account info</p>
              </button>
            </div>
            <button onClick={() => setRequestTab('connections')} className="flex w-full items-center justify-between rounded-2xl bg-blue-600 px-4 py-4 text-left text-white">
              <div>
                <p className="text-sm font-bold">Manage contractor access</p>
                <p className="mt-0.5 text-xs text-blue-100">Choose which contractors you connect with and what each one can see.</p>
              </div>
              <PlusCircle size={20} />
            </button>
          </div>
        )}

        {/* Submit Request */}
        {requestTab === 'requests' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-1">Request Service or Report an Issue</h2>
          <p className="text-slate-500 text-xs mb-4">Choose the type of help you need, then send the request to a connected contractor or search for a new one.</p>

          {submitted && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-700 font-medium">
              Your request has been submitted! We'll review it before your next visit.
            </div>
          )}

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-600 font-medium">
              {submitError}
            </div>
          )}

          <div className="space-y-4">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">What do you need help with?</label>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setForm(f => ({ ...f, category: cat }));
                      setSelectedRouteConnectionIds([]);
                    }}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs font-medium transition-colors ${form.category === cat ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
                  >
                    <span className="text-base">{CATEGORY_ICONS[cat]}</span>
                    <span className="leading-tight text-center">{cat}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Send to contractor</p>
                  <p className="text-xs text-slate-500 mt-0.5">Matching current connections are shown first. You can choose one or more.</p>
                </div>
                <button
                  onClick={() => setRequestTab('connections')}
                  className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700"
                >
                  Find
                </button>
              </div>
              {matchingConnections.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {matchingConnections.slice(0, 4).map(connection => {
                    const selected = selectedRouteConnectionIds.includes(connection.id);
                    return (
                      <button
                        key={connection.id}
                        onClick={() => toggleRouteConnection(connection.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${selected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-800">{connection.contractor.name}</p>
                              {connection.is_preferred && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"><Star size={11} fill="currentColor" /> Preferred</span>}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{connection.contractor.service_categories?.slice(0, 3).join(', ') || 'Connected contractor'}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{selected ? 'Selected' : 'Select'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-white px-3 py-3 text-xs text-slate-500">
                  No connected contractors match {form.category}. Use Find to search the contractor directory, or submit the request without selecting a recipient.
                </div>
              )}
            </div>

            {/* Room */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Location / Room</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors"
                placeholder="e.g. Master bathroom, back yard..."
                value={form.room}
                onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
              <textarea
                rows={4}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors resize-none"
                placeholder="Describe what you're seeing or what you'd like us to check on your next visit..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Priority</label>
              <div className="flex gap-2">
                {(['Low', 'Medium', 'Urgent'] as RequestPriority[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className="flex-1 py-2 rounded-xl border text-sm font-semibold transition-all"
                    style={form.priority === p ? { ...PRIORITY_STYLES[p], borderColor: form.priority === p ? PRIORITY_STYLES[p].color as string : '#e2e8f0' } : { backgroundColor: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Photo */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Photo (optional)</label>
              {photoPreview ? (
                <div className="relative inline-block">
                  <img src={photoPreview} alt="preview" className="w-32 h-24 object-cover rounded-xl" />
                  <button onClick={() => { setPhotoPreview(null); setPhotoFile(null); }} className="absolute -top-1.5 -right-1.5 bg-slate-700 text-white rounded-full p-0.5">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => photoRef.current?.click()}
                  className="flex items-center gap-2 border border-dashed border-slate-300 text-slate-500 rounded-xl px-4 py-3 text-sm hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Upload size={15} /> Upload a photo
                </button>
              )}
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => handlePhoto(e.target.files)} />
            </div>

            <button
              onClick={() => { void handleSubmit(); }}
              disabled={!form.description.trim() || isSubmitting}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
        )}

        {/* History */}
        {requestTab !== 'overview' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="hidden">
            {(['requests', 'calendar', 'profile', 'home', 'connections', 'vendors', 'reports', 'invoices'] as const).map(t => (
              <button
                key={t}
                onClick={() => setRequestTab(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors capitalize ${requestTab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t === 'requests' ? 'Requests' : t === 'calendar' ? 'Calendar' : t === 'profile' ? 'Profile' : t === 'home' ? 'Home' : t === 'connections' ? 'Connections' : t === 'vendors' ? 'Vendors' : t === 'reports' ? 'Reports' : 'Invoices'}
              </button>
            ))}
          </div>

          {requestTab === 'calendar' && (
            <HomeownerCalendar
              appointments={homeownerAppointments}
              onConfirm={confirmRouteAppointment}
              onRequestNewTime={(appointmentId) => openTimeRequest(appointmentId, 'next')}
              savingAppointmentId={savingHomeownerRouteActionId}
            />
          )}

          {/* Service Requests Tab */}
          {requestTab === 'requests' && (
            <div className="divide-y divide-slate-100">
              {requests.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-8">No requests yet.</p>
              )}
              {[...requests].reverse().map(req => {
                const routesForRequest = requestRoutes.filter(route => route.request_id === req.id);
                const expanded = expandedRequestId === req.id;
                const needsReview = routesForRequest.some(route =>
                  (route.response_message && !route.homeowner_action) ||
                  (route.quote_pdf_path && !['accepted', 'changes_requested', 'declined'].includes(route.quote_status)) ||
                  (route.appointment && route.appointment.status !== 'Confirmed')
                );
                return (
                <div key={req.id} className="px-5 py-3">
                  <button
                    onClick={() => setExpandedRequestId(expanded ? null : req.id)}
                    className="flex w-full items-start gap-3 rounded-2xl px-1 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="text-xl flex-shrink-0 mt-0.5">{CATEGORY_ICONS[req.category]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-slate-700">{req.category}</span>
                        {req.room && <span className="text-xs text-slate-400">· {req.room}</span>}
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={PRIORITY_STYLES[req.priority]}>{req.priority}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={STATUS_STYLES[req.status]}>{req.status}</span>
                        {routesForRequest.length > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{routesForRequest.length} contractor{routesForRequest.length !== 1 ? 's' : ''}</span>}
                        {needsReview && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Needs review</span>}
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2">{req.description}</p>
                      <p className="text-xs text-slate-400 mt-1">{req.submittedAt}</p>
                    </div>
                    {expanded ? <ChevronUp size={16} className="mt-1 flex-shrink-0 text-slate-400" /> : <ChevronDown size={16} className="mt-1 flex-shrink-0 text-slate-400" />}
                  </button>
                    {expanded && (
                    <div className="pl-9">
                      {routesForRequest.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {routesForRequest.map(route => (
                            <div key={route.route_id} className="rounded-xl bg-blue-50 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-blue-700">{route.contractor.name}: {route.status}</span>
                                {route.response_next_action && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{route.response_next_action}</span>}
                                {route.estimate_range && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{route.estimate_range}</span>}
                                {route.homeowner_action && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">{route.homeowner_action}</span>}
                                {route.response_message && !route.homeowner_action && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Response needs review</span>}
                                {route.quote_pdf_path && !['accepted', 'changes_requested', 'declined'].includes(route.quote_status) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Quote pending</span>}
                              </div>
                              {route.response_message && (
                                <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-3 shadow-sm">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-bold text-slate-800">Contractor response</p>
                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                      Review needed
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm text-slate-700">{route.response_message}</p>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {route.response_next_action && (
                                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                                        <p className="text-xs font-semibold text-slate-500">Suggested next step</p>
                                        <p className="text-sm font-semibold text-slate-800">{route.response_next_action}</p>
                                      </div>
                                    )}
                                    {route.estimate_range && (
                                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                                        <p className="text-xs font-semibold text-slate-500">Rough estimate</p>
                                        <p className="text-sm font-semibold text-slate-800">{route.estimate_range}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {route.quote_pdf_path && (
                                <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold text-slate-700">{route.quote_file_name || 'Attached quote PDF'}</p>
                                      <p className="text-xs text-slate-400">Status: {route.quote_status || 'sent'}</p>
                                    </div>
                                    <button onClick={() => { void openQuotePdf(route.quote_pdf_path); }} className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700">Open Quote</button>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {['accepted', 'changes_requested', 'declined'].map(status => (
                                      <button
                                        key={status}
                                        onClick={() => { void updateQuoteStatus(route.route_id, status); }}
                                        disabled={savingHomeownerRouteActionId === route.route_id || route.quote_status === status}
                                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
                                      >
                                        {status === 'accepted' ? 'Accept Quote' : status === 'changes_requested' ? 'Request Changes' : 'Decline Quote'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {route.appointment && (
                                <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                                  <p className="text-xs font-semibold text-green-700">{route.appointment.status === 'Confirmed' ? 'Scheduled appointment' : 'Recommended appointment'}</p>
                                  <p className="mt-1 text-sm font-semibold text-slate-800">
                                    {route.appointment.scheduled_start ? new Date(route.appointment.scheduled_start).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time pending'}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">Status: {route.appointment.status}</p>
                                  {route.appointment.status === 'Confirmed' && <p className="mt-1 text-xs text-green-700">The contractor confirmed this appointment time.</p>}
                                  {route.appointment.customer_requested_start && <p className="mt-1 text-xs text-blue-700">You requested: {new Date(route.appointment.customer_requested_start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {route.appointment.status !== 'Confirmed' && (
                                      <button
                                        onClick={() => { if (route.appointment?.id) void confirmRouteAppointment(route.appointment.id); }}
                                        disabled={savingHomeownerRouteActionId === route.appointment.id}
                                        className="rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                      >
                                        Confirm Time
                                      </button>
                                    )}
                                    <button
                                      onClick={() => { if (route.appointment?.id) openTimeRequest(route.appointment.id, 'route'); }}
                                      disabled={savingHomeownerRouteActionId === route.appointment.id}
                                      className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"
                                    >
                                      Request Other Time
                                    </button>
                                  </div>
                                </div>
                              )}
                              <div className="mt-2 rounded-lg bg-white/80 px-3 py-2">
                                <p className="text-xs font-semibold text-slate-600">Activity</p>
                                <div className="mt-2 space-y-1">
                                  {requestRouteTimeline(route).map(event => (
                                    <div key={`${route.route_id}-${event.label}`} className="flex items-center justify-between gap-3 text-xs">
                                      <span className="text-slate-600">{event.label}</span>
                                      <span className="font-semibold text-slate-400">{formatShortDate(event.value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {route.response_message && (
                                <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-3">
                                  <p className="mb-2 text-xs font-semibold text-slate-600">Reply to this response</p>
                                  <div className="flex flex-wrap gap-2">
                                  {['Request Call', 'Request Visit', 'Accept Next Step', 'Not Interested'].map(action => (
                                    <button
                                      key={action}
                                      onClick={() => { void updateHomeownerRouteAction(route.route_id, action); }}
                                      disabled={savingHomeownerRouteActionId === route.route_id || route.homeowner_action === action}
                                      className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"
                                    >
                                      {action}
                                    </button>
                                  ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {req.contractorNotes && (
                        <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <p className="text-xs text-blue-600 font-semibold mb-0.5">Contractor Note</p>
                          <p className="text-xs text-blue-800">{req.contractorNotes}</p>
                        </div>
                      )}
                    </div>
                    )}
                </div>
                );
              })}
            </div>
          )}

          {requestTab === 'profile' && (
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <Home size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Homeowner Profile</p>
                  <p className="text-xs text-slate-500 mt-1">Update the contact and property identity information you control and may choose to share with contractors.</p>
                </div>
              </div>
              <PortalField label="Home nickname">
                <input className={portalInputClass} value={editableProfile.name} onChange={e => setEditableProfile({ name: e.target.value })} placeholder="My Home" />
              </PortalField>
              <PortalField label="Property address">
                <input className={portalInputClass} value={editableProfile.address} onChange={e => setEditableProfile({ address: e.target.value })} placeholder="123 Main St, City, State" />
              </PortalField>
              <div className="grid sm:grid-cols-2 gap-3">
                <PortalField label="Homeowner name">
                  <input className={portalInputClass} value={editableProfile.owner} onChange={e => setEditableProfile({ owner: e.target.value })} />
                </PortalField>
                <PortalField label="Phone">
                  <input className={portalInputClass} value={editableProfile.phone} onChange={e => setEditableProfile({ phone: e.target.value })} inputMode="tel" />
                </PortalField>
              </div>
              <PortalField label="Contact email">
                <input className={portalInputClass} value={editableProfile.email} onChange={e => setEditableProfile({ email: e.target.value })} inputMode="email" />
              </PortalField>
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                This email is used on your home profile. Changing your login email will be handled separately later with email confirmation.
              </div>
              {profileSaveStatus === 'saved' && <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700 font-medium">Profile saved.</div>}
              {profileSaveStatus === 'error' && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-medium">Unable to save profile. Please try again.</div>}
              <button onClick={() => { void saveHomeownerProfile(); }} disabled={profileSaveStatus === 'saving'} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
                <Save size={16} /> {profileSaveStatus === 'saving' ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          )}

          {/* Home Details Tab */}
          {requestTab === 'home' && (
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <Home size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Home Details</p>
                  <p className="text-xs text-slate-500 mt-1">Keep this information current so ServSync can prepare accurate maintenance recommendations.</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <PortalField label="Approx. square feet"><input className={portalInputClass} value={editableHome.sqft} onChange={e => setEditableHome({ sqft: e.target.value })} placeholder="e.g. 2400" inputMode="numeric" /></PortalField>
                <PortalField label="Year built"><input className={portalInputClass} value={editableHome.yearBuilt} onChange={e => setEditableHome({ yearBuilt: e.target.value })} placeholder="e.g. 1998" inputMode="numeric" /></PortalField>
                <PortalField label="Stories"><input className={portalInputClass} value={editableHome.stories} onChange={e => setEditableHome({ stories: e.target.value })} placeholder="e.g. 2" /></PortalField>
                <PortalField label="Garage"><input className={portalInputClass} value={editableHome.garage} onChange={e => setEditableHome({ garage: e.target.value })} placeholder="e.g. 2-car" /></PortalField>
              </div>
              <PortalField label="Pool">
                <div className="grid grid-cols-2 gap-2">
                  {['No', 'Yes'].map(value => {
                    const yes = value === 'Yes';
                    return <button key={value} onClick={() => setEditableHome({ pool: yes })} className={`py-2.5 rounded-xl border text-sm font-semibold ${editableHome.pool === yes ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}>{value}</button>;
                  })}
                </div>
              </PortalField>
              <div className="grid sm:grid-cols-2 gap-3">
                <PortalField label="Roof type"><select className={portalInputClass} value={editableHome.roofType} onChange={e => setEditableHome({ roofType: e.target.value as RoofType })}>{ROOF_TYPES.map(type => <option key={type}>{type}</option>)}</select></PortalField>
                <PortalField label="Roof age"><input className={portalInputClass} value={editableHome.roofAge} onChange={e => setEditableHome({ roofAge: e.target.value })} placeholder="e.g. 8 years or unsure" /></PortalField>
                <PortalField label="HVAC type"><select className={portalInputClass} value={editableHome.hvacType} onChange={e => setEditableHome({ hvacType: e.target.value as HvacType })}>{HVAC_TYPES.map(type => <option key={type}>{type}</option>)}</select></PortalField>
                <PortalField label="HVAC age"><input className={portalInputClass} value={editableHome.hvacAge} onChange={e => setEditableHome({ hvacAge: e.target.value })} placeholder="e.g. 5 years or unsure" /></PortalField>
              </div>
              <PortalField label="Notes for ServSync">
                <textarea className={`${portalInputClass} resize-none`} rows={4} value={editableHome.notes} onChange={e => setEditableHome({ notes: e.target.value })} placeholder="Gate code, pets, crawlspace location, concerns, etc." />
              </PortalField>
              {homeSaveStatus === 'saved' && <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700 font-medium">Home details saved.</div>}
              {homeSaveStatus === 'error' && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-medium">Unable to save home details. Please try again.</div>}
              <button onClick={() => { void saveHomeDetails(); }} disabled={homeSaveStatus === 'saving'} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
                <Save size={16} /> {homeSaveStatus === 'saving' ? 'Saving...' : 'Save Home Details'}
              </button>
            </div>
          )}

          {requestTab === 'connections' && (
            <ConnectionsPanel
              propertyId={customer.id}
              connections={connections}
              loading={connectionsLoading}
              error={connectionsError}
              notice={connectionNotice}
              savingConnectionId={savingConnectionId}
              onRefreshConnections={() => loadConnections(customer.id)}
              onUpdate={updateConnectionPermissions}
              onPreferredChange={updateConnectionPreferred}
            />
          )}

          {requestTab === 'vendors' && (
            <PreferredVendorsPanel
              vendors={customer.vendors || []}
              onSave={async vendors => {
                if (!onUpdateHomeownerVendors) return;
                await onUpdateHomeownerVendors(customer, vendors);
              }}
            />
          )}

          {/* Reports Tab */}
          {requestTab === 'reports' && (
            <div className="divide-y divide-slate-100">
              {customerReports.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-8">No reports available yet.</p>
              )}
              {customerReports.map(report => {
                const isExpanded = expandedReport === report.id;
                return (
                  <div key={report.id}>
                    <button
                      onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                      className="w-full px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{report.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {report.issueCount} issue{report.issueCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={report.urgentCount > 0 ? STATUS_STYLES['In Progress'] : { backgroundColor: '#dcfce7', color: '#16a34a' }}>
                            {report.urgentCount > 0 ? `${report.urgentCount} urgent` : 'Saved'}
                          </span>
                          {isExpanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-3 bg-slate-50/50">
                        <div className="grid grid-cols-4 gap-2">
                          <div className="bg-white rounded-xl p-3"><p className="text-xs text-slate-400">Issues</p><p className="text-sm font-bold text-slate-800">{report.issueCount}</p></div>
                          <div className="bg-white rounded-xl p-3"><p className="text-xs text-slate-400">Passed</p><p className="text-sm font-bold text-slate-800">{report.passCount}</p></div>
                          <div className="bg-white rounded-xl p-3"><p className="text-xs text-slate-400">Rooms</p><p className="text-sm font-bold text-slate-800">{report.roomCount}</p></div>
                          <div className="bg-white rounded-xl p-3"><p className="text-xs text-slate-400">Photos</p><p className="text-sm font-bold text-slate-800">{report.photoCount}</p></div>
                        </div>
                        {report.pdfUrl ? (
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => window.open(report.pdfUrl, '_blank', 'noopener,noreferrer')} className="flex items-center gap-1.5 bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold">
                              <ExternalLink size={14} /> Open PDF
                            </button>
                            <a href={report.pdfUrl} download={report.fileName || 'inspection-report.pdf'} className="flex items-center gap-1.5 border border-slate-200 text-slate-600 rounded-xl px-3 py-2 text-sm font-semibold bg-white">
                              <Download size={14} /> Download
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">PDF copy is not available for this older report.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Invoices Tab */}
          {requestTab === 'invoices' && (
            <div className="divide-y divide-slate-100">
              {(customer.invoices || []).filter(invoice => invoice.status !== 'Draft').length === 0 && (
                <p className="text-slate-400 text-sm text-center py-8">No invoices available yet.</p>
              )}
              {[...(customer.invoices || [])].filter(invoice => invoice.status !== 'Draft').reverse().map(invoice => {
                const subtotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
                const tax = Math.round(subtotal * (invoice.taxRate / 100) * 100) / 100;
                const total = subtotal + tax;
                return (
                  <div key={invoice.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{invoice.invoiceNumber}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{invoice.date} · Due {invoice.dueDate}</p>
                        <p className="text-xs text-slate-500 mt-1">Status: {invoice.status}</p>
                      </div>
                      <p className="text-lg font-bold text-slate-800">${total.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
        <footer className="text-center text-xs text-slate-400 pb-2">
          <a href="/#/privacy" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:text-blue-700">Privacy Policy</a> · <a href="/#/terms" className="text-blue-600 font-semibold hover:text-blue-700">Terms</a>
        </footer>
      </main>

      {timeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">Request another time</p>
                <p className="mt-1 text-xs text-slate-500">Pick a date and time to send to the contractor. Requested times are not guaranteed until confirmed.</p>
              </div>
              <button onClick={() => setTimeRequest(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50"><X size={16} /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <PortalField label="Date">
                <input type="date" value={timeRequestDate} onChange={event => setTimeRequestDate(event.target.value)} className={portalInputClass} />
              </PortalField>
              <PortalField label="Time">
                <input type="time" value={timeRequestTime} onChange={event => setTimeRequestTime(event.target.value)} className={portalInputClass} />
              </PortalField>
            </div>
            <button
              onClick={() => { void submitTimeRequest(); }}
              disabled={!timeRequestDate || savingHomeownerRouteActionId === timeRequest.appointmentId}
              className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingHomeownerRouteActionId === timeRequest.appointmentId ? 'Sending...' : 'Send Time Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionsPanel({
  propertyId,
  connections,
  loading,
  error,
  notice,
  savingConnectionId,
  onRefreshConnections,
  onUpdate,
  onPreferredChange,
}: {
  propertyId: string;
  connections: HomeConnection[];
  loading: boolean;
  error: string;
  notice: string;
  savingConnectionId: string | null;
  onRefreshConnections: () => Promise<void> | void;
  onUpdate: (connection: HomeConnection, permissions: SharingPermissions, nextStatus?: ConnectionStatus) => Promise<void>;
  onPreferredChange: (connection: HomeConnection, isPreferred: boolean) => Promise<void>;
}) {
  const activeConnections = connections.filter(connection => connection.status !== 'revoked' && connection.status !== 'declined');
  const connectedOrganizationIds = new Set(activeConnections.map(connection => connection.organization_id));
  const [showDirectory, setShowDirectory] = useState(false);
  const [contractorSearchCategory, setContractorSearchCategory] = useState('');
  const [contractorSearchZip, setContractorSearchZip] = useState('');
  const [directoryResults, setDirectoryResults] = useState<DirectoryContractor[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [connectingOrganizationId, setConnectingOrganizationId] = useState<string | null>(null);

  const searchContractors = async () => {
    setDirectoryError('');
    setDirectoryLoading(true);
    try {
      const { data, error: searchError } = await supabase.rpc('search_public_contractors', {
        p_category: contractorSearchCategory,
        p_zip: contractorSearchZip.trim(),
      });
      if (searchError) throw searchError;
      setDirectoryResults(Array.isArray(data) ? data as DirectoryContractor[] : []);
    } catch (err) {
      console.error(err);
      setDirectoryError('Unable to search contractors right now.');
    } finally {
      setDirectoryLoading(false);
    }
  };

  const connectToContractor = async (contractor: DirectoryContractor) => {
    setDirectoryError('');
    setConnectingOrganizationId(contractor.id);
    try {
      const { error: connectError } = await supabase.rpc('connect_my_home_to_contractor', {
        p_property_id: propertyId,
        p_organization_id: contractor.id,
      });
      if (connectError) throw connectError;
      await onRefreshConnections();
    } catch (err) {
      console.error(err);
      setDirectoryError(`Unable to connect with ${contractor.name}.`);
    } finally {
      setConnectingOrganizationId(null);
    }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-800 text-sm">Contractor Connections</p>
            <p className="text-xs text-slate-500 mt-1">You control which contractors can access your home information. You can change permissions or revoke access at any time.</p>
          </div>
        </div>
        <button
          onClick={() => setShowDirectory(prev => !prev)}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Search size={14} /> Find
        </button>
      </div>

      {notice && <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700 font-medium">{notice}</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-medium">{error}</div>}

      {showDirectory && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Find contractors</p>
            <p className="mt-1 text-xs text-slate-500">Search the ServSync contractor directory. Connecting starts with basic profile sharing only.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <PortalField label="Category">
              <select className={portalInputClass} value={contractorSearchCategory} onChange={e => setContractorSearchCategory(e.target.value)}>
                {CONTRACTOR_SEARCH_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category || 'Any category'}</option>
                ))}
              </select>
            </PortalField>
            <PortalField label="ZIP code">
              <input
                className={portalInputClass}
                value={contractorSearchZip}
                onChange={e => setContractorSearchZip(e.target.value)}
                placeholder="e.g. 36532"
                inputMode="numeric"
              />
            </PortalField>
            <button
              onClick={() => { void searchContractors(); }}
              disabled={directoryLoading}
              className="self-end rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {directoryLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
          {directoryError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{directoryError}</div>}
          <div className="space-y-3">
            {directoryResults.map(contractor => {
              const alreadyConnected = connectedOrganizationIds.has(contractor.id);
              return (
                <div key={contractor.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{contractor.name}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        {contractor.service_categories?.slice(0, 5).map(category => <span key={category} className="rounded-full bg-slate-100 px-2 py-0.5">{category}</span>)}
                        {contractor.insured && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-green-700"><BadgeCheck size={12} /> Insured</span>}
                        {contractor.bonded && <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">Bonded</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => { void connectToContractor(contractor); }}
                      disabled={alreadyConnected || connectingOrganizationId === contractor.id}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      <PlusCircle size={14} /> {alreadyConnected ? 'Connected' : connectingOrganizationId === contractor.id ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                  {contractor.public_bio && <p className="mt-2 text-sm text-slate-600">{contractor.public_bio}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    {contractor.service_zip_codes?.length > 0 && (
                      <span className="inline-flex items-center gap-1"><MapPin size={12} /> {contractor.service_zip_codes.slice(0, 4).join(', ')}</span>
                    )}
                    {contractor.service_radius_miles > 0 && <span>{contractor.service_radius_miles} mile radius</span>}
                    {contractor.years_in_business && <span>{contractor.years_in_business} in business</span>}
                    {contractor.license_number && <span>License on file</span>}
                    {contractor.google_reviews_url && <a className="font-semibold text-blue-600" href={contractor.google_reviews_url} target="_blank" rel="noreferrer">Reviews</a>}
                    {contractor.website_url && <a className="font-semibold text-blue-600" href={contractor.website_url} target="_blank" rel="noreferrer">Website</a>}
                  </div>
                </div>
              );
            })}
            {!directoryLoading && directoryResults.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">Search by category or ZIP to find contractors.</p>
            )}
          </div>
        </div>
      )}

      {loading && <p className="text-slate-400 text-sm text-center py-8">Loading contractor connections...</p>}

      {!loading && activeConnections.length === 0 && (
        <div className="text-center py-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <SlidersHorizontal size={22} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">No contractor connections yet.</p>
          <p className="mt-1 text-xs text-slate-400">When you connect with a contractor, their access permissions will appear here.</p>
        </div>
      )}

      <div className="space-y-4">
        {activeConnections.map(connection => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              saving={savingConnectionId === connection.id}
              onUpdate={onUpdate}
              onPreferredChange={onPreferredChange}
            />
        ))}
      </div>
    </div>
  );
}

function ConnectionCard({
  connection,
  saving,
  onUpdate,
  onPreferredChange,
}: {
  connection: HomeConnection;
  saving: boolean;
  onUpdate: (connection: HomeConnection, permissions: SharingPermissions, nextStatus?: ConnectionStatus) => Promise<void>;
  onPreferredChange: (connection: HomeConnection, isPreferred: boolean) => Promise<void>;
}) {
  const [draftPermissions, setDraftPermissions] = useState<SharingPermissions>({
    ...DEFAULT_PERMISSIONS,
    ...(connection.permissions || {}),
  });
  const [expanded, setExpanded] = useState(false);
  const contractor = connection.contractor;
  const statusLabel = connection.status === 'pending' ? 'Pending approval' : connection.status;
  const enabledPermissionCount = PERMISSION_OPTIONS.filter(option => draftPermissions[option.key]).length;

  useEffect(() => {
    setDraftPermissions({ ...DEFAULT_PERMISSIONS, ...(connection.permissions || {}) });
  }, [connection.id, connection.permissions]);

  const setPermission = (key: keyof SharingPermissions, value: boolean) => {
    setDraftPermissions(prev => ({ ...prev, [key]: value }));
  };

  const approveWithDraft = async () => {
    await onUpdate(connection, draftPermissions, 'active');
  };

  const revoke = async () => {
    const confirmed = window.confirm(`Revoke ${contractor.name}'s access to this home?`);
    if (!confirmed) return;
    await onUpdate(connection, draftPermissions, 'revoked');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 p-3">
        <button onClick={() => setExpanded(prev => !prev)} className="min-w-0 flex-1 text-left">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{contractor.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${connection.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {statusLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              {enabledPermissionCount} shared
            </span>
            {connection.is_preferred && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                <Star size={11} fill="currentColor" /> Preferred
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            {contractor.service_categories?.slice(0, 3).map(category => (
              <span key={category}>{category}</span>
            ))}
            {contractor.insured && <span>Insured</span>}
            {contractor.bonded && <span>Bonded</span>}
          </div>
        </button>
        <button onClick={() => setExpanded(prev => !prev)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={expanded ? 'Collapse connection' : 'Expand connection'}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          {(contractor.support_phone || contractor.support_email) && (
            <p className="text-xs text-slate-500">
              {contractor.support_phone}{contractor.support_phone && contractor.support_email ? ' · ' : ''}{contractor.support_email}
            </p>
          )}

          {contractor.public_bio && <p className="text-sm text-slate-600">{contractor.public_bio}</p>}

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {PERMISSION_OPTIONS.map(option => (
              <label key={option.key} className="flex items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
                <input
                  type="checkbox"
                  checked={draftPermissions[option.key]}
                  disabled={option.key === 'basic_profile' || saving}
                  onChange={e => setPermission(option.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-700">{option.label}</span>
                  <span className="block text-xs text-slate-400">{option.description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Sharing less information gives you more privacy, but contractors may be less likely to respond or provide accurate guidance without enough details.
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => { void onPreferredChange(connection, !connection.is_preferred); }}
              disabled={saving}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-60 ${connection.is_preferred ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Star size={15} fill={connection.is_preferred ? 'currentColor' : 'none'} /> {connection.is_preferred ? 'Preferred' : 'Make Preferred'}
            </button>
            <button
              onClick={() => { void (connection.status === 'pending' ? approveWithDraft() : onUpdate(connection, draftPermissions)); }}
              disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : connection.status === 'pending' ? 'Approve Connection' : 'Save Sharing Permissions'}
            </button>
            <button
              onClick={() => { void revoke(); }}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <UserX size={15} /> Revoke
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreferredVendorsPanel({
  vendors,
  onSave,
}: {
  vendors: Vendor[];
  onSave: (vendors: Vendor[]) => Promise<void>;
}) {
  const emptyForm: Vendor = { id: '', type: 'HVAC', company: '', phone: '', account: '', notes: '' };
  const [draftVendors, setDraftVendors] = useState<Vendor[]>(vendors);
  const [form, setForm] = useState<Vendor>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setDraftVendors(vendors);
  }, [vendors]);

  const setField = (key: keyof Vendor, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaveStatus('idle');
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveVendorToDraft = () => {
    if (!form.company.trim()) return;
    const nextVendor: Vendor = {
      ...form,
      id: editingId || crypto.randomUUID(),
      company: form.company.trim(),
      phone: form.phone.trim(),
      account: form.account.trim(),
      notes: form.notes.trim(),
    };
    setDraftVendors(prev => editingId ? prev.map(vendor => vendor.id === editingId ? nextVendor : vendor) : [...prev, nextVendor]);
    resetForm();
    setSaveStatus('idle');
  };

  const editVendor = (vendor: Vendor) => {
    setForm(vendor);
    setEditingId(vendor.id);
  };

  const removeVendor = (id: string) => {
    setDraftVendors(prev => prev.filter(vendor => vendor.id !== id));
    if (editingId === id) resetForm();
    setSaveStatus('idle');
  };

  const saveAll = async () => {
    setSaveStatus('saving');
    try {
      await onSave(draftVendors);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Preferred vendors save failed:', error);
      setSaveStatus('error');
    }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <Star size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-800 text-sm">Preferred Vendors</p>
          <p className="text-xs text-slate-500 mt-1">Keep your own list of preferred vendors, accounts, and notes. You choose whether this is shared with connected contractors.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <PortalField label="Type">
            <select className={portalInputClass} value={form.type} onChange={e => setField('type', e.target.value)}>
              {VENDOR_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </PortalField>
          <PortalField label="Company">
            <input className={portalInputClass} value={form.company} onChange={e => setField('company', e.target.value)} placeholder="Company name" />
          </PortalField>
          <PortalField label="Phone">
            <input className={portalInputClass} value={form.phone} onChange={e => setField('phone', e.target.value)} inputMode="tel" />
          </PortalField>
          <PortalField label="Account / contact">
            <input className={portalInputClass} value={form.account} onChange={e => setField('account', e.target.value)} placeholder="Account number or contact name" />
          </PortalField>
        </div>
        <PortalField label="Notes">
          <textarea className={`${portalInputClass} resize-none`} rows={3} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Warranty notes, preferred tech, gate instructions, etc." />
        </PortalField>
        <div className="flex gap-2">
          <button onClick={saveVendorToDraft} disabled={!form.company.trim()} className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {editingId ? 'Update Vendor' : 'Add Vendor'}
          </button>
          {editingId && <button onClick={resetForm} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button>}
        </div>
      </div>

      <div className="space-y-2">
        {draftVendors.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No preferred vendors yet.</p>
        ) : (
          draftVendors.map(vendor => (
            <div key={vendor.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{vendor.company}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{vendor.type}{vendor.phone ? ` · ${vendor.phone}` : ''}</p>
                  {vendor.account && <p className="text-xs text-slate-400 mt-1">{vendor.account}</p>}
                  {vendor.notes && <p className="text-sm text-slate-600 mt-2">{vendor.notes}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => editVendor(vendor)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Edit vendor"><Pencil size={14} /></button>
                  <button onClick={() => removeVendor(vendor.id)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50" aria-label="Remove vendor"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {saveStatus === 'saved' && <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700 font-medium">Preferred vendors saved.</div>}
      {saveStatus === 'error' && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-medium">Unable to save preferred vendors.</div>}
      <button onClick={() => { void saveAll(); }} disabled={saveStatus === 'saving'} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
        <Save size={16} /> {saveStatus === 'saving' ? 'Saving...' : 'Save Preferred Vendors'}
      </button>
    </div>
  );
}


function PortalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const portalInputClass = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors bg-white';

function HomeownerCalendar({
  appointments,
  onConfirm,
  onRequestNewTime,
  savingAppointmentId,
}: {
  appointments: Appointment[];
  onConfirm: (appointmentId: string) => Promise<void>;
  onRequestNewTime: (appointmentId: string) => void;
  savingAppointmentId: string | null;
}) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const month = new Date(`${selectedDate}T12:00:00`);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });

  const dateKey = (value: string) => value ? (value.includes('T') ? value.split('T')[0] : value) : '';
  const appointmentDate = (appointment: Appointment) => appointment.scheduledStart || appointment.recommendedDate || appointment.createdAt;
  const selectedAppointments = appointments.filter(appointment => dateKey(appointmentDate(appointment)) === selectedDate);
  const upcoming = appointments.filter(appointment => appointment.status !== 'Completed').slice(0, 6);

  const statusStyle: Record<string, string> = {
    Recommended: 'bg-amber-50 text-amber-700 border-amber-200',
    Confirmed: 'bg-green-50 text-green-700 border-green-200',
    'Customer Requested': 'bg-blue-50 text-blue-700 border-blue-200',
    Cancelled: 'bg-red-50 text-red-700 border-red-200',
    Completed: 'bg-slate-50 text-slate-500 border-slate-200',
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <CalendarDays size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-800 text-sm">Appointment Calendar</p>
          <p className="text-xs text-slate-500 mt-1">Track confirmed visits, contractor-proposed times, requested changes, cancellations, and completed appointments.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="px-2 py-2 text-center text-[11px] font-bold text-slate-400">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map(day => {
            const key = day.toISOString().split('T')[0];
            const dayItems = appointments.filter(appointment => dateKey(appointmentDate(appointment)) === key);
            const muted = day.getMonth() !== month.getMonth();
            return (
              <button
                key={key}
                onClick={() => setSelectedDate(key)}
                className={`min-h-16 border-r border-b border-slate-100 p-1.5 text-left ${selectedDate === key ? 'bg-blue-50' : muted ? 'bg-slate-50/60' : 'bg-white'}`}
              >
                <p className={`text-[11px] font-bold ${muted ? 'text-slate-300' : 'text-slate-600'}`}>{day.getDate()}</p>
                {dayItems.length > 0 && <div className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected day</p>
        {selectedAppointments.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">No appointments for this day.</p>
        ) : (
          selectedAppointments.map(appointment => (
            <AppointmentCard key={appointment.id} appointment={appointment} statusClass={statusStyle[appointment.status] || statusStyle.Recommended} onConfirm={onConfirm} onRequestNewTime={onRequestNewTime} saving={savingAppointmentId === appointment.id} />
          ))
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Upcoming</p>
        {upcoming.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">No upcoming appointments.</p>
        ) : (
          upcoming.map(appointment => (
            <AppointmentCard key={`upcoming-${appointment.id}`} appointment={appointment} statusClass={statusStyle[appointment.status] || statusStyle.Recommended} onConfirm={onConfirm} onRequestNewTime={onRequestNewTime} saving={savingAppointmentId === appointment.id} compact />
          ))
        )}
      </div>
    </div>
  );
}

function AppointmentCard({
  appointment,
  statusClass,
  onConfirm,
  onRequestNewTime,
  saving,
  compact = false,
}: {
  appointment: Appointment;
  statusClass: string;
  onConfirm: (appointmentId: string) => Promise<void>;
  onRequestNewTime: (appointmentId: string) => void;
  saving: boolean;
  compact?: boolean;
}) {
  const date = appointment.scheduledStart || appointment.recommendedDate || appointment.createdAt;
  const label = date ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: appointment.scheduledStart ? 'numeric' : undefined, minute: appointment.scheduledStart ? '2-digit' : undefined }) : 'Time TBD';
  const canRespond = ['Recommended', 'Customer Requested'].includes(appointment.status);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusClass}`}>{appointment.status}</span>
          <p className="mt-2 text-sm font-semibold text-slate-800">{appointment.title}</p>
          <p className="mt-1 text-xs text-slate-500">{label}</p>
          {appointment.status === 'Recommended' && <p className="mt-2 text-xs text-amber-700">The contractor proposed this time. You can accept it or request another time.</p>}
          {appointment.status === 'Customer Requested' && <p className="mt-2 text-xs text-blue-700">Your requested time is pending contractor confirmation. The official appointment time has not changed yet.</p>}
          {!compact && appointment.customerRequestNotes && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{appointment.customerRequestNotes}</p>}
        </div>
      </div>
      {canRespond && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => { void onConfirm(appointment.id); }} disabled={saving} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept Time</button>
          <button onClick={() => onRequestNewTime(appointment.id)} disabled={saving} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">Request Other Time</button>
        </div>
      )}
    </div>
  );
}

function HomeProfileSetup({
  user,
  onExit,
  onCreateHomeProfile,
}: {
  user?: PortalUser | null;
  onExit: () => void;
  onCreateHomeProfile?: (home: { name: string; address: string; owner: string; phone: string; email: string }) => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    name: 'My Home',
    address: '',
    owner: user?.name || '',
    phone: '',
    email: user?.email || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      if (!onCreateHomeProfile) throw new Error('Home profile setup is not available right now.');
      if (!form.address.trim()) throw new Error('Property address is required.');
      if (!form.owner.trim()) throw new Error('Homeowner name is required.');
      await onCreateHomeProfile({
        name: form.name.trim() || 'My Home',
        address: form.address.trim(),
        owner: form.owner.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create home profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-base">🛡️</span>
            </div>
            <p className="font-semibold text-slate-800 text-sm leading-tight">ServSync</p>
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Home size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Create Your Home Profile</h1>
              <p className="mt-1 text-sm text-slate-500">This home belongs to your ServSync account. You can connect contractors and choose what to share later.</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <PortalField label="Home Nickname">
              <input className={portalInputClass} value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="My Home" />
            </PortalField>
            <PortalField label="Property Address">
              <input className={portalInputClass} value={form.address} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="123 Main St, City, State" />
            </PortalField>
            <div className="grid sm:grid-cols-2 gap-3">
              <PortalField label="Homeowner Name">
                <input className={portalInputClass} value={form.owner} onChange={e => setForm(prev => ({ ...prev, owner: e.target.value }))} />
              </PortalField>
              <PortalField label="Phone">
                <input className={portalInputClass} value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} inputMode="tel" />
              </PortalField>
            </div>
            <PortalField label="Email">
              <input className={portalInputClass} value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} inputMode="email" />
            </PortalField>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}

            <button
              onClick={() => { void save(); }}
              disabled={saving}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving ? 'Creating home profile...' : 'Create Home Profile'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
