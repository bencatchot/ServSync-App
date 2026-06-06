import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Building2, Check, CreditCard, KeyRound, MapPin, RefreshCw, Save, ShieldCheck, Star, Unlink, Users, X } from 'lucide-react';
import { AppProfile, ContractorOrganization, QBSettings } from '../types';
import { supabase, supabaseConfigured } from '../supabaseClient';

interface SettingsProps {
  profile: AppProfile | null;
  qbSettings: QBSettings;
  onUpdateQB: (settings: QBSettings) => void;
}

type SettingsTab = 'profile' | 'team' | 'integrations' | 'security';

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  owner_email: string | null;
  support_email: string | null;
  support_phone: string | null;
  website_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  timezone: string | null;
  plan_name: string | null;
  monthly_price_cents: number | null;
  account_status: ContractorOrganization['accountStatus'] | null;
  subscription_status: ContractorOrganization['subscriptionStatus'] | null;
  service_categories?: string[] | null;
  service_zip_codes?: string[] | null;
  service_radius_miles?: number | null;
  license_number?: string | null;
  business_license_number?: string | null;
  insured?: boolean | null;
  bonded?: boolean | null;
  years_in_business?: string | null;
  google_reviews_url?: string | null;
  testimonials_url?: string | null;
  public_bio?: string | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type TeamMember = {
  userId: string;
  role: string;
  email: string;
  fullName: string;
  createdAt: string;
};

type BusinessForm = {
  name: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  brandColor: string;
  timezone: string;
};

type PublicProfileForm = {
  serviceCategories: string[];
  serviceZipCodes: string;
  serviceRadiusMiles: string;
  licenseNumber: string;
  businessLicenseNumber: string;
  insured: boolean;
  bonded: boolean;
  yearsInBusiness: string;
  googleReviewsUrl: string;
  testimonialsUrl: string;
  publicBio: string;
};

type SecurityForm = {
  fullName: string;
  newPassword: string;
};

const DEFAULT_BUSINESS_FORM: BusinessForm = {
  name: '',
  supportEmail: '',
  supportPhone: '',
  websiteUrl: '',
  brandColor: '#2563eb',
  timezone: 'America/Chicago',
};

const SERVICE_CATEGORIES = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'Roofing',
  'Appliance Repair',
  'Pest Control',
  'Landscape/Lawn',
  'Pool Service',
  'Locksmith',
  'Cleaning Service',
  'Pressure Washing',
  'Painting',
  'Drywall',
  'Carpentry',
  'Decks',
  'Handyman',
  'Home Inspection',
  'General Contractor',
  'Other',
];

const DEFAULT_PUBLIC_PROFILE_FORM: PublicProfileForm = {
  serviceCategories: [],
  serviceZipCodes: '',
  serviceRadiusMiles: '25',
  licenseNumber: '',
  businessLicenseNumber: '',
  insured: false,
  bonded: false,
  yearsInBusiness: '',
  googleReviewsUrl: '',
  testimonialsUrl: '',
  publicBio: '',
};

function mapOrganization(row: OrganizationRow): ContractorOrganization {
  return {
    id: row.id,
    name: row.name || '',
    slug: row.slug || '',
    ownerEmail: row.owner_email || '',
    supportEmail: row.support_email || '',
    supportPhone: row.support_phone || '',
    websiteUrl: row.website_url || '',
    logoUrl: row.logo_url || null,
    brandColor: row.brand_color || '#2563eb',
    timezone: row.timezone || 'America/Chicago',
    planName: row.plan_name || 'Starter',
    monthlyPriceCents: row.monthly_price_cents || 0,
    accountStatus: row.account_status || 'active',
    subscriptionStatus: row.subscription_status || 'trialing',
    serviceCategories: row.service_categories || [],
    serviceZipCodes: row.service_zip_codes || [],
    serviceRadiusMiles: row.service_radius_miles || 25,
    licenseNumber: row.license_number || '',
    businessLicenseNumber: row.business_license_number || '',
    insured: row.insured || false,
    bonded: row.bonded || false,
    yearsInBusiness: row.years_in_business || '',
    googleReviewsUrl: row.google_reviews_url || '',
    testimonialsUrl: row.testimonials_url || '',
    publicBio: row.public_bio || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function businessFormFromOrg(org: ContractorOrganization): BusinessForm {
  return {
    name: org.name,
    supportEmail: org.supportEmail,
    supportPhone: org.supportPhone,
    websiteUrl: org.websiteUrl,
    brandColor: org.brandColor || '#2563eb',
    timezone: org.timezone || 'America/Chicago',
  };
}

function publicProfileFormFromOrg(org: ContractorOrganization): PublicProfileForm {
  return {
    serviceCategories: org.serviceCategories || [],
    serviceZipCodes: (org.serviceZipCodes || []).join(', '),
    serviceRadiusMiles: String(org.serviceRadiusMiles || 25),
    licenseNumber: org.licenseNumber || '',
    businessLicenseNumber: org.businessLicenseNumber || '',
    insured: org.insured || false,
    bonded: org.bonded || false,
    yearsInBusiness: org.yearsInBusiness || '',
    googleReviewsUrl: org.googleReviewsUrl || '',
    testimonialsUrl: org.testimonialsUrl || '',
    publicBio: org.publicBio || '',
  };
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusClass(status: string) {
  if (status === 'active') return 'border-green-200 bg-green-50 text-green-700';
  if (status === 'trialing') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'paused' || status === 'past_due') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-red-200 bg-red-50 text-red-700';
}

const inputClass = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function QBConnectModal({ onConnect, onClose }: { onConnect: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-sm" style={{ backgroundColor: '#16a34a' }}>QB</div>
            <h3 className="font-semibold text-slate-800">Connect QuickBooks Online</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">You'll be redirected to QuickBooks to authorize ServSync to access your account. This allows you to:</p>
          <ul className="space-y-2">
            {[
              'Sync customers from your property list',
              'Create and send invoices directly from findings',
              'Track invoice status and payment in real time',
            ].map(item => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                <Check size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
            You will be redirected to QuickBooks' secure login page. ServSync does not store your QuickBooks credentials.
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
            <button
              onClick={() => { onConnect(); onClose(); }}
              className="flex-1 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
              style={{ backgroundColor: '#16a34a' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#15803d')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#16a34a')}
            >
              Continue to QuickBooks Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Settings({ profile, qbSettings, onUpdateQB }: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [showQBModal, setShowQBModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [organization, setOrganization] = useState<ContractorOrganization | null>(null);
  const [businessForm, setBusinessForm] = useState<BusinessForm>(DEFAULT_BUSINESS_FORM);
  const [publicProfileForm, setPublicProfileForm] = useState<PublicProfileForm>(DEFAULT_PUBLIC_PROFILE_FORM);
  const [securityForm, setSecurityForm] = useState<SecurityForm>({ fullName: profile?.fullName || '', newPassword: '' });
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingPublicProfile, setSavingPublicProfile] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const organizationId = profile?.activeOrganizationId || null;

  const isManager = useMemo(() => {
    if (!profile) return false;
    return profile.role === 'admin' || profile.role === 'contractor';
  }, [profile]);

  const loadAccount = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!profile) throw new Error('No signed-in profile was found.');

      if (!supabaseConfigured || !supabase) {
        const demoOrg: ContractorOrganization = {
          id: 'demo-org',
          name: 'Demo Contractor',
          slug: 'demo-contractor',
          ownerEmail: profile.email,
          supportEmail: profile.email,
          supportPhone: '',
          websiteUrl: '',
          logoUrl: null,
          brandColor: '#2563eb',
          timezone: 'America/Chicago',
          planName: 'Starter',
          monthlyPriceCents: 19900,
          accountStatus: 'active',
          subscriptionStatus: 'trialing',
          serviceCategories: ['Handyman', 'Home Inspection'],
          serviceZipCodes: ['36532'],
          serviceRadiusMiles: 25,
          licenseNumber: '',
          businessLicenseNumber: '',
          insured: false,
          bonded: false,
          yearsInBusiness: '',
          googleReviewsUrl: '',
          testimonialsUrl: '',
          publicBio: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setOrganization(demoOrg);
        setBusinessForm(businessFormFromOrg(demoOrg));
        setPublicProfileForm(publicProfileFormFromOrg(demoOrg));
        setSecurityForm({ fullName: profile.fullName || '', newPassword: '' });
        setTeamMembers([{ userId: profile.id, role: 'owner', email: profile.email, fullName: profile.fullName || 'Demo Admin', createdAt: demoOrg.createdAt }]);
        return;
      }

      if (!organizationId) throw new Error('This account is not linked to a contractor organization yet.');

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id,name,slug,owner_email,support_email,support_phone,website_url,logo_url,brand_color,timezone,plan_name,monthly_price_cents,account_status,subscription_status,service_categories,service_zip_codes,service_radius_miles,license_number,business_license_number,insured,bonded,years_in_business,google_reviews_url,testimonials_url,public_bio,created_at,updated_at')
        .eq('id', organizationId)
        .maybeSingle();
      if (orgError) throw orgError;
      if (!orgData) throw new Error('Contractor organization was not found.');

      const nextOrg = mapOrganization(orgData as OrganizationRow);
      setOrganization(nextOrg);
      setBusinessForm(businessFormFromOrg(nextOrg));
      setPublicProfileForm(publicProfileFormFromOrg(nextOrg));
      setSecurityForm({ fullName: profile.fullName || '', newPassword: '' });

      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('organization_id,user_id,role,created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });
      if (membersError) throw membersError;

      const memberRows = (members || []) as MemberRow[];
      const userIds = memberRows.map(member => member.user_id);
      let profileRows: { id: string; email: string | null; full_name: string | null }[] = [];
      if (userIds.length) {
        const { data: profileData, error: profilesError } = await supabase
          .from('profiles')
          .select('id,email,full_name')
          .in('id', userIds);
        if (profilesError) throw profilesError;
        profileRows = profileData || [];
      }

      setTeamMembers(memberRows.map(member => {
        const memberProfile = profileRows.find(row => row.id === member.user_id);
        return {
          userId: member.user_id,
          role: member.role,
          email: memberProfile?.email || '',
          fullName: memberProfile?.full_name || '',
          createdAt: member.created_at,
        };
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load contractor account.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, profile]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const handleConnect = () => {
    onUpdateQB({ connected: true, accountName: organization?.name || 'Contractor Account', lastSync: new Date().toLocaleString() });
  };

  const handleDisconnect = () => {
    onUpdateQB({ connected: false, accountName: '', lastSync: '' });
  };

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      onUpdateQB({ ...qbSettings, lastSync: new Date().toLocaleString() });
    }, 1500);
  };

  const saveBusiness = async () => {
    setSavingBusiness(true);
    setError('');
    setNotice('');
    try {
      if (!organization) throw new Error('Contractor organization was not loaded.');
      if (!businessForm.name.trim()) throw new Error('Company name is required.');

      if (!supabaseConfigured || !supabase) {
        const nextOrg = {
          ...organization,
          name: businessForm.name.trim(),
          supportEmail: businessForm.supportEmail.trim(),
          supportPhone: businessForm.supportPhone.trim(),
          websiteUrl: businessForm.websiteUrl.trim(),
          brandColor: businessForm.brandColor || '#2563eb',
          timezone: businessForm.timezone || 'America/Chicago',
          updatedAt: new Date().toISOString(),
        };
        setOrganization(nextOrg);
        setNotice('Business profile saved.');
        return;
      }

      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          name: businessForm.name.trim(),
          support_email: businessForm.supportEmail.trim(),
          support_phone: businessForm.supportPhone.trim(),
          website_url: businessForm.websiteUrl.trim(),
          brand_color: businessForm.brandColor || '#2563eb',
          timezone: businessForm.timezone || 'America/Chicago',
          updated_at: new Date().toISOString(),
        })
        .eq('id', organization.id);
      if (updateError) throw updateError;
      setNotice('Business profile saved.');
      await loadAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save business profile.');
    } finally {
      setSavingBusiness(false);
    }
  };

  const saveSecurity = async () => {
    setSavingSecurity(true);
    setError('');
    setNotice('');
    try {
      if (!profile) throw new Error('No signed-in profile was found.');

      if (securityForm.newPassword && securityForm.newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters.');
      }

      if (!supabaseConfigured || !supabase) {
        setNotice('Account details saved.');
        setSecurityForm(prev => ({ ...prev, newPassword: '' }));
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: securityForm.fullName.trim() })
        .eq('id', profile.id);
      if (profileError) throw profileError;

      if (securityForm.newPassword) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: securityForm.newPassword });
        if (passwordError) throw passwordError;
      }

      setNotice(securityForm.newPassword ? 'Account details and password saved.' : 'Account details saved.');
      setSecurityForm(prev => ({ ...prev, newPassword: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save account details.');
    } finally {
      setSavingSecurity(false);
    }
  };

  const toggleServiceCategory = (category: string) => {
    setPublicProfileForm(prev => ({
      ...prev,
      serviceCategories: prev.serviceCategories.includes(category)
        ? prev.serviceCategories.filter(item => item !== category)
        : [...prev.serviceCategories, category],
    }));
  };

  const savePublicProfile = async () => {
    setSavingPublicProfile(true);
    setError('');
    setNotice('');
    try {
      if (!organization) throw new Error('Contractor organization was not loaded.');

      const radius = Math.max(0, Math.round(Number(publicProfileForm.serviceRadiusMiles || 0)));
      const serviceZipCodes = parseCsv(publicProfileForm.serviceZipCodes);
      if (publicProfileForm.serviceCategories.length === 0) {
        throw new Error('Choose at least one service category.');
      }

      if (!supabaseConfigured || !supabase) {
        setOrganization({
          ...organization,
          serviceCategories: publicProfileForm.serviceCategories,
          serviceZipCodes,
          serviceRadiusMiles: radius,
          licenseNumber: publicProfileForm.licenseNumber.trim(),
          businessLicenseNumber: publicProfileForm.businessLicenseNumber.trim(),
          insured: publicProfileForm.insured,
          bonded: publicProfileForm.bonded,
          yearsInBusiness: publicProfileForm.yearsInBusiness.trim(),
          googleReviewsUrl: publicProfileForm.googleReviewsUrl.trim(),
          testimonialsUrl: publicProfileForm.testimonialsUrl.trim(),
          publicBio: publicProfileForm.publicBio.trim(),
          updatedAt: new Date().toISOString(),
        });
        setNotice('Public contractor profile saved.');
        return;
      }

      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          service_categories: publicProfileForm.serviceCategories,
          service_zip_codes: serviceZipCodes,
          service_radius_miles: radius,
          license_number: publicProfileForm.licenseNumber.trim(),
          business_license_number: publicProfileForm.businessLicenseNumber.trim(),
          insured: publicProfileForm.insured,
          bonded: publicProfileForm.bonded,
          years_in_business: publicProfileForm.yearsInBusiness.trim(),
          google_reviews_url: publicProfileForm.googleReviewsUrl.trim(),
          testimonials_url: publicProfileForm.testimonialsUrl.trim(),
          public_bio: publicProfileForm.publicBio.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', organization.id);
      if (updateError) throw updateError;
      setNotice('Public contractor profile saved.');
      await loadAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save public contractor profile.');
    } finally {
      setSavingPublicProfile(false);
    }
  };

  const copySetupLink = async () => {
    if (!organization) return;
    const link = `${window.location.origin}${window.location.pathname}#/contractor-setup?org=${organization.id}`;
    await navigator.clipboard.writeText(link);
    setNotice('Contractor setup link copied.');
  };

  const copyHomeownerInviteLink = async () => {
    if (!organization) return;
    const link = `${window.location.origin}${window.location.pathname}#/homeowner-signup?connect=${organization.id}`;
    await navigator.clipboard.writeText(link);
    setNotice('Homeowner invite link copied.');
  };

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'profile', label: 'Contractor Profile' },
    { id: 'team', label: 'Team' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'security', label: 'Login & Security' },
  ];

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Contractor Account</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage your contractor profile, team, integrations, and login details.</p>
      </div>

      {(error || notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {error || notice}
        </div>
      )}

      {organization && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <Building2 className="text-blue-600" size={24} />
            <p className="mt-3 text-sm font-semibold text-slate-900">{organization.name}</p>
            <p className="text-xs text-slate-500">/{organization.slug}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <ShieldCheck className="text-green-600" size={24} />
            <p className="mt-3 text-sm font-semibold text-slate-900">Account Status</p>
            <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(organization.accountStatus)}`}>
              {organization.accountStatus}
            </span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <CreditCard className="text-slate-700" size={24} />
            <p className="mt-3 text-sm font-semibold text-slate-900">{organization.planName}</p>
            <p className="text-xs text-slate-500">{money(organization.monthlyPriceCents)}/mo · {organization.subscriptionStatus.replace('_', ' ')}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading contractor account...
        </div>
      )}

      {!loading && <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>}

      {tab === 'profile' && !loading && (
        <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-800">Contractor Profile</h2>
              <p className="text-sm text-slate-500 mt-1">This is the public-facing contractor information homeowners will see across ServSync.</p>
            </div>
            <button
              onClick={() => { void saveBusiness().then(() => savePublicProfile()); }}
              disabled={savingBusiness || savingPublicProfile || !isManager}
              className="flex items-center gap-2 bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              <Save size={15} /> {savingBusiness || savingPublicProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Company Name</label>
              <input
                className={inputClass}
                value={businessForm.name}
                onChange={e => setBusinessForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Support Email</label>
              <input
                className={inputClass}
                value={businessForm.supportEmail}
                onChange={e => setBusinessForm(prev => ({ ...prev, supportEmail: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Support Phone</label>
              <input
                className={inputClass}
                value={businessForm.supportPhone}
                onChange={e => setBusinessForm(prev => ({ ...prev, supportPhone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Website</label>
              <input
                className={inputClass}
                value={businessForm.websiteUrl}
                onChange={e => setBusinessForm(prev => ({ ...prev, websiteUrl: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Brand Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="h-11 w-14 rounded-xl border border-slate-200 bg-white p-1"
                  value={businessForm.brandColor}
                  onChange={e => setBusinessForm(prev => ({ ...prev, brandColor: e.target.value }))}
                  aria-label="Brand color"
                />
                <input
                  className={inputClass}
                  value={businessForm.brandColor}
                  onChange={e => setBusinessForm(prev => ({ ...prev, brandColor: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Timezone</label>
              <select
                className={inputClass}
                value={businessForm.timezone}
                onChange={e => setBusinessForm(prev => ({ ...prev, timezone: e.target.value }))}
              >
                <option value="America/Chicago">Central</option>
                <option value="America/New_York">Eastern</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
                <option value="America/Phoenix">Arizona</option>
              </select>
            </div>
          </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Homeowners may use this information to decide who receives requests. License, insurance, bonding, reviews, and service area will help build trust.
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <BadgeCheck size={18} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-800">Service Categories</h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {SERVICE_CATEGORIES.map(category => {
                  const active = publicProfileForm.serviceCategories.includes(category);
                  return (
                    <label key={category} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium cursor-pointer ${active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleServiceCategory(category)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      {category}
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={18} className="text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-800">Service Area</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">ZIP Codes</label>
                    <input
                      className={inputClass}
                      value={publicProfileForm.serviceZipCodes}
                      onChange={e => setPublicProfileForm(prev => ({ ...prev, serviceZipCodes: e.target.value }))}
                      placeholder="36532, 36526, 36527"
                    />
                    <p className="text-xs text-slate-400 mt-1">Separate ZIP codes with commas.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Service Radius</label>
                    <input
                      className={inputClass}
                      value={publicProfileForm.serviceRadiusMiles}
                      onChange={e => setPublicProfileForm(prev => ({ ...prev, serviceRadiusMiles: e.target.value }))}
                      inputMode="numeric"
                      placeholder="25"
                    />
                    <p className="text-xs text-slate-400 mt-1">Miles from your service ZIPs or business location.</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={18} className="text-green-600" />
                  <h3 className="text-sm font-semibold text-slate-800">Credentials</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Trade License Number</label>
                    <input
                      className={inputClass}
                      value={publicProfileForm.licenseNumber}
                      onChange={e => setPublicProfileForm(prev => ({ ...prev, licenseNumber: e.target.value }))}
                      placeholder="Optional but recommended"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Business License Number</label>
                    <input
                      className={inputClass}
                      value={publicProfileForm.businessLicenseNumber}
                      onChange={e => setPublicProfileForm(prev => ({ ...prev, businessLicenseNumber: e.target.value }))}
                      placeholder="Optional but recommended"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer ${publicProfileForm.insured ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                      <input type="checkbox" checked={publicProfileForm.insured} onChange={e => setPublicProfileForm(prev => ({ ...prev, insured: e.target.checked }))} />
                      Insured
                    </label>
                    <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer ${publicProfileForm.bonded ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                      <input type="checkbox" checked={publicProfileForm.bonded} onChange={e => setPublicProfileForm(prev => ({ ...prev, bonded: e.target.checked }))} />
                      Bonded
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Years in Business</label>
                    <input
                      className={inputClass}
                      value={publicProfileForm.yearsInBusiness}
                      onChange={e => setPublicProfileForm(prev => ({ ...prev, yearsInBusiness: e.target.value }))}
                      placeholder="e.g. 12"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Star size={18} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Reviews & Testimonials</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Google Reviews URL</label>
                    <input
                      className={inputClass}
                      value={publicProfileForm.googleReviewsUrl}
                      onChange={e => setPublicProfileForm(prev => ({ ...prev, googleReviewsUrl: e.target.value }))}
                      placeholder="https://g.page/..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Website Testimonials URL</label>
                    <input
                      className={inputClass}
                      value={publicProfileForm.testimonialsUrl}
                      onChange={e => setPublicProfileForm(prev => ({ ...prev, testimonialsUrl: e.target.value }))}
                      placeholder="https://example.com/reviews"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Public Bio</label>
                <textarea
                  className={`${inputClass} min-h-[140px] resize-none`}
                  value={publicProfileForm.publicBio}
                  onChange={e => setPublicProfileForm(prev => ({ ...prev, publicBio: e.target.value }))}
                  placeholder="Tell homeowners what you do, what areas you serve, and what makes your company trustworthy."
                />
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'team' && !loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-800">Team</h2>
              <p className="text-sm text-slate-500 mt-1">Current users linked to this contractor account.</p>
            </div>
            <button
              onClick={copySetupLink}
              disabled={!organization}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              Copy Owner Setup Link
            </button>
            <button
              onClick={copyHomeownerInviteLink}
              disabled={!organization}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Copy Homeowner Invite Link
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamMembers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400">No team members found.</td>
                  </tr>
                ) : teamMembers.map(member => (
                  <tr key={member.userId}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <Users size={16} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{member.fullName || member.email || 'Unnamed user'}</p>
                          <p className="text-xs text-slate-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
                        {member.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(member.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Staff invitations and role changes are the next team-management step. For now, ServSync Admin creates contractor accounts and the setup link connects the owner.
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {tab === 'integrations' && !loading && (
        <div className="space-y-4">
          {/* QuickBooks Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* QB Logo */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-base flex-shrink-0" style={{ backgroundColor: '#16a34a' }}>
                  QB
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800">QuickBooks Online</h3>
                    {qbSettings.connected ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>Connected</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Not Connected</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">Sync customers and create invoices directly from your inspection findings.</p>

                  {qbSettings.connected && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-slate-500">Account: <span className="font-medium text-slate-700">{qbSettings.accountName}</span></p>
                      <p className="text-xs text-slate-500">Last sync: <span className="font-medium text-slate-700">{qbSettings.lastSync || 'Never'}</span></p>
                    </div>
                  )}
                </div>
              </div>

              {qbSettings.connected ? (
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                    style={{ backgroundColor: '#16a34a' }}
                    onMouseEnter={e => !syncing && (e.currentTarget.style.backgroundColor = '#15803d')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#16a34a')}
                  >
                    <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Unlink size={12} /> Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowQBModal(true)}
                  className="flex-shrink-0 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={{ backgroundColor: '#16a34a' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#15803d')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#16a34a')}
                >
                  Connect QuickBooks
                </button>
              )}
            </div>
          </div>

          {/* Placeholder integrations */}
          {[
            { name: 'Stripe Payments', desc: 'Accept credit card payments directly from invoices.' },
            { name: 'Google Calendar', desc: 'Sync visit schedules and inspection appointments.' },
          ].map(item => (
            <div key={item.name} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between opacity-60">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-slate-800 text-sm">{item.name}</h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Coming Soon</span>
                </div>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'security' && !loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-slate-800">Login & Security</h2>
            <p className="text-sm text-slate-500 mt-1">Update your contractor login details. Email changes should be handled carefully later with confirmation.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
              <input
                className={inputClass}
                value={securityForm.fullName}
                onChange={e => setSecurityForm(prev => ({ ...prev, fullName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input className={`${inputClass} bg-slate-50 text-slate-500`} value={profile?.email || ''} readOnly />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">New Password</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  className={`${inputClass} pl-9`}
                  value={securityForm.newPassword}
                  onChange={e => setSecurityForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="Leave blank to keep current password"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">Use at least 8 characters. Stronger passwords are recommended for contractor accounts.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={saveSecurity}
              disabled={savingSecurity}
              className="bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {savingSecurity ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {showQBModal && (
        <QBConnectModal onConnect={handleConnect} onClose={() => setShowQBModal(false)} />
      )}
    </div>
  );
}
