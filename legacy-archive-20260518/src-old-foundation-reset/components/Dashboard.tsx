import { useEffect, useState } from 'react';
import { ArrowRight, Home, Lock, RefreshCw, ShieldCheck, SlidersHorizontal, UserPlus, Users } from 'lucide-react';
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
  };
};

interface DashboardProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  onSelectCustomer: (id: string) => void;
  onNavigate: (page: Page) => void;
}

const DEFAULT_PERMISSIONS: SharingPermissions = {
  basic_profile: true,
  property_details: false,
  vendors: false,
  photos: false,
};

function normalizePermissions(permissions?: ConnectedHome['permissions']): SharingPermissions {
  return {
    ...DEFAULT_PERMISSIONS,
    ...(permissions || {}),
  };
}

function formatShortDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Dashboard({
  customers: _customers,
  selectedCustomerId: _selectedCustomerId,
  onSelectCustomer: _onSelectCustomer,
  onNavigate,
}: DashboardProps) {
  const [homes, setHomes] = useState<ConnectedHome[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadConnections = async () => {
    setLoading(true);
    setError('');
    try {
      if (!supabase) {
        setHomes([]);
        return;
      }

      const { data, error: homesError } = await supabase.rpc('get_contractor_connected_homes');
      if (homesError) throw homesError;
      setHomes((data || []) as ConnectedHome[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load contractor dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  const refreshDashboard = async () => {
    setRefreshing(true);
    try {
      await loadConnections();
    } finally {
      setRefreshing(false);
    }
  };

  const activeConnections = homes.filter(home => home.status === 'active');
  const pendingConnections = homes.filter(home => home.status === 'pending');
  const sharedHomeDetails = activeConnections.filter(home => normalizePermissions(home.permissions).property_details);
  const sharedVendors = activeConnections.filter(home => normalizePermissions(home.permissions).vendors);

  const statCards = [
    {
      label: 'Connected Homeowners',
      value: activeConnections.length,
      helper: 'Approved relationships',
      icon: Users,
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      onClick: () => onNavigate('connected'),
    },
    {
      label: 'Pending Connections',
      value: pendingConnections.length,
      helper: 'Waiting on homeowner approval',
      icon: UserPlus,
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      onClick: () => onNavigate('connected'),
    },
    {
      label: 'Home Details Shared',
      value: sharedHomeDetails.length,
      helper: 'Homeowner-approved access',
      icon: Home,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      onClick: () => onNavigate('connected'),
    },
    {
      label: 'Vendor Lists Shared',
      value: sharedVendors.length,
      helper: 'Preferred vendor access',
      icon: SlidersHorizontal,
      color: 'text-indigo-700',
      bg: 'bg-indigo-50',
      onClick: () => onNavigate('connected'),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Contractor workspace</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              This dashboard is now focused on the new ServSync foundation: homeowner connections and homeowner-approved sharing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshDashboard()}
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, helper, icon: Icon, color, bg, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className={`rounded-xl ${bg} p-3 ${color}`}>
                <Icon size={22} />
              </div>
              <ArrowRight size={17} className="text-slate-300" />
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-900">{loading ? '-' : value}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Recent homeowner connections</h2>
            <p className="mt-1 text-xs text-slate-500">Only homeowner-approved connections appear here.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="px-5 py-8 text-sm font-semibold text-slate-500">Loading connections...</div>
            ) : activeConnections.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">
                No approved homeowner connections yet.
              </div>
            ) : (
              activeConnections.slice(0, 6).map(home => {
                const permissions = normalizePermissions(home.permissions);
                const sharedCount = Object.values(permissions).filter(Boolean).length;

                return (
                  <button
                    key={home.connection_id}
                    type="button"
                    onClick={() => onNavigate('connected')}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {home.property?.name || home.property?.owner || 'Homeowner'}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {home.property?.owner || 'Homeowner'} · {sharedCount} shared · Connected {formatShortDate(home.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Foundation reset</h2>
              <p className="mt-2 text-sm text-slate-600">
                The contractor workspace is being narrowed back to profile, connection, and permission basics before rebuilding tools like requests,
                scheduling, quoting, inspections, and reports.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 text-slate-500" size={17} />
              <div>
                <p className="text-sm font-bold text-slate-900">No homeowner search</p>
                <p className="mt-1 text-sm text-slate-600">
                  Contractors only see homeowners who approved a connection. Search and solicitation tools are intentionally not part of this foundation.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
