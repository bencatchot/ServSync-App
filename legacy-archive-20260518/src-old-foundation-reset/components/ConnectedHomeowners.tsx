import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Home, Lock, Mail, Phone, RefreshCw, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { Customer, Page } from '../types';
import { supabase } from '../supabaseClient';

type SharingPermissions = {
  basic_profile: boolean;
  property_details: boolean;
  vendors: boolean;
  photos: boolean;
};

type ConnectedHome = {
  connection_id: string;
  property_id: string;
  homeowner_user_id: string;
  status: 'active' | 'pending' | 'revoked' | 'declined';
  source: string;
  permissions: Partial<SharingPermissions> & Record<string, boolean | undefined>;
  created_at: string;
  updated_at: string;
  property: {
    name: string;
    address: string;
    owner: string;
    phone: string;
    email: string;
    plan: string;
    home_sqft: string;
    home_year_built: string;
    home_hvac_type: string;
    home_roof_type: string;
  };
};

interface ConnectedHomeownersProps {
  customers: Customer[];
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: Page) => void;
  onRefreshData?: () => Promise<void> | void;
}

const DEFAULT_PERMISSIONS: SharingPermissions = {
  basic_profile: true,
  property_details: false,
  vendors: false,
  photos: false,
};

const PERMISSION_LABELS: { key: keyof SharingPermissions; label: string }[] = [
  { key: 'basic_profile', label: 'Basic Profile' },
  { key: 'property_details', label: 'Home Details' },
  { key: 'vendors', label: 'Preferred Vendors' },
  { key: 'photos', label: 'Photos' },
];

function formatShortDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function normalizePermissions(permissions?: ConnectedHome['permissions']): SharingPermissions {
  return {
    ...DEFAULT_PERMISSIONS,
    ...(permissions || {}),
  };
}

function normalizeHome(home: ConnectedHome): ConnectedHome {
  return {
    ...home,
    permissions: normalizePermissions(home.permissions),
    property: {
      name: '',
      address: '',
      owner: '',
      phone: '',
      email: '',
      plan: '',
      home_sqft: '',
      home_year_built: '',
      home_hvac_type: '',
      home_roof_type: '',
      ...(home.property || {}),
    },
  };
}

export default function ConnectedHomeowners({
  customers,
  onRefreshData,
  onSelectCustomer: _onSelectCustomer,
  onNavigate: _onNavigate,
}: ConnectedHomeownersProps) {
  const [homes, setHomes] = useState<ConnectedHome[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null);

  const loadHomes = async () => {
    setLoading(true);
    setError('');
    try {
      if (!supabase) {
        setHomes([]);
        return;
      }

      const { data, error: homesError } = await supabase.rpc('get_contractor_connected_homes');
      if (homesError) throw homesError;

      setHomes(((data || []) as ConnectedHome[]).map(normalizeHome));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load connected homeowners.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHomes();
  }, []);

  const refreshConnections = async () => {
    setRefreshing(true);
    try {
      await loadHomes();
      await onRefreshData?.();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Homeowner connections</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Connected Homeowners</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              This page now shows only the profile connection and the information each homeowner has chosen to share.
              The older work-order tools are shelved while the new foundation is rebuilt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshConnections()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
          Loading homeowner connections...
        </div>
      ) : homes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto text-blue-500" size={36} />
          <h2 className="mt-3 text-lg font-bold text-slate-900">No homeowner connections yet</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
            A homeowner will appear here after they approve a connection and choose what they want to share.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {homes.map(home => {
            const permissions = normalizePermissions(home.permissions);
            const customer = customers.find(item => item.id === home.property_id);
            const sharedCount = PERMISSION_LABELS.filter(option => permissions[option.key]).length;
            const isExpanded = expandedConnectionId === home.connection_id;

            return (
              <article key={home.connection_id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedConnectionId(isExpanded ? null : home.connection_id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-slate-900">{home.property.name || home.property.owner || 'Homeowner'}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        home.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : home.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {home.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {home.property.owner || 'Homeowner'} · {sharedCount} shared · Connected {formatShortDate(home.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-slate-500">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </button>

                {isExpanded && (
                  <ConnectedHomeDetail
                    home={home}
                    customer={customer}
                    permissions={permissions}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ConnectedHomeDetail({
  home,
  customer,
  permissions,
}: {
  home: ConnectedHome;
  customer?: Customer;
  permissions: SharingPermissions;
}) {
  const sharedLabels = PERMISSION_LABELS.filter(option => permissions[option.key]);

  return (
    <div className="border-t border-slate-100 px-5 py-5">
      <div className="grid gap-3 md:grid-cols-3">
        <InfoTile
          icon={<UserRound size={16} />}
          label="Homeowner"
          value={permissions.basic_profile ? home.property.owner || 'Shared homeowner' : 'Not shared'}
          locked={!permissions.basic_profile}
        />
        <InfoTile
          icon={<Mail size={16} />}
          label="Email"
          value={permissions.basic_profile ? home.property.email || 'Not provided' : 'Not shared'}
          locked={!permissions.basic_profile}
        />
        <InfoTile
          icon={<Phone size={16} />}
          label="Phone"
          value={permissions.basic_profile ? home.property.phone || 'Not provided' : 'Not shared'}
          locked={!permissions.basic_profile}
        />
      </div>

      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 text-blue-600" size={18} />
          <div>
            <p className="text-sm font-bold text-slate-900">Shared by homeowner</p>
            {sharedLabels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {sharedLabels.map(option => (
                  <span key={option.key} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                    {option.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-600">No details are shared yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <PermissionSection
          allowed={permissions.property_details}
          title="Home Details"
          icon={<Home size={16} />}
          lockedText="The homeowner has not shared home details with your business."
        >
          <div className="space-y-2 text-sm">
            <DetailLine label="Property" value={home.property.name || customer?.name || 'Not provided'} />
            <DetailLine label="Address" value={home.property.address || customer?.address || 'Not provided'} />
            <DetailLine label="Plan" value={home.property.plan || customer?.plan || 'Not provided'} />
            <DetailLine label="Square Feet" value={home.property.home_sqft || customer?.home.sqft || 'Not provided'} />
            <DetailLine label="Year Built" value={home.property.home_year_built || customer?.home.yearBuilt || 'Not provided'} />
            <DetailLine label="HVAC" value={home.property.home_hvac_type || customer?.home.hvacType || 'Not provided'} />
            <DetailLine label="Roof" value={home.property.home_roof_type || customer?.home.roofType || 'Not provided'} />
          </div>
        </PermissionSection>

        <PermissionSection
          allowed={permissions.vendors}
          title="Preferred Vendors"
          icon={<SlidersHorizontal size={16} />}
          lockedText="The homeowner has not shared preferred vendors with your business."
        >
          {customer?.vendors?.length ? (
            <div className="space-y-2">
              {customer.vendors.map(vendor => (
                <div key={vendor.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">{vendor.company || vendor.type}</p>
                  <p className="text-xs text-slate-500">{vendor.type}{vendor.phone ? ` · ${vendor.phone}` : ''}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDetail text="No preferred vendors are available." />
          )}
        </PermissionSection>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 text-slate-500" size={17} />
          <div>
            <p className="text-sm font-bold text-slate-900">Foundation reset in progress</p>
            <p className="mt-1 text-sm text-slate-600">
              The older operational tools are intentionally hidden here until they are rebuilt on top of the new
              homeowner/contractor connection model.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  locked = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  locked?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {locked ? <Lock size={14} /> : icon}
        {label}
      </div>
      <p className={`mt-2 truncate text-sm font-bold ${locked ? 'text-slate-400' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function PermissionSection({
  allowed,
  title,
  icon,
  lockedText,
  children,
}: {
  allowed: boolean;
  title: string;
  icon: React.ReactNode;
  lockedText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</span>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        {!allowed && <Lock size={16} className="text-slate-400" />}
      </div>
      {allowed ? children : <EmptyDetail text={lockedText} />}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function EmptyDetail({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm font-medium text-slate-500">
      {text}
    </div>
  );
}
