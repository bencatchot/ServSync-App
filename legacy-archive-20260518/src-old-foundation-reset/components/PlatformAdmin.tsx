import { useEffect, useMemo, useState } from 'react';
import { Building2, Copy, CreditCard, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { AppProfile } from '../types';
import { supabase } from '../supabaseClient';

interface PlatformAdminProps {
  profile: AppProfile;
  onSignOut: () => void;
}

type ContractorStatus = 'active' | 'inactive' | 'paused' | 'deleted';
type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

type Organization = {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  support_email: string;
  support_phone: string;
  website_url: string;
  plan_name: string;
  monthly_price_cents: number;
  account_status: ContractorStatus;
  subscription_status: SubscriptionStatus;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  slug: string;
  owner_email: string;
  support_email: string;
  support_phone: string;
  website_url: string;
  plan_name: string;
  monthly_price: string;
  account_status: ContractorStatus;
  subscription_status: SubscriptionStatus;
};

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  owner_email: '',
  support_email: '',
  support_phone: '',
  website_url: '',
  plan_name: 'Starter',
  monthly_price: '199',
  account_status: 'active',
  subscription_status: 'trialing',
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusClass(status: string) {
  if (status === 'active') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'trialing') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'paused' || status === 'past_due') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function formFromOrg(org: Organization): FormState {
  return {
    name: org.name,
    slug: org.slug,
    owner_email: org.owner_email || '',
    support_email: org.support_email || '',
    support_phone: org.support_phone || '',
    website_url: org.website_url || '',
    plan_name: org.plan_name || 'Starter',
    monthly_price: String((org.monthly_price_cents || 0) / 100),
    account_status: org.account_status || 'active',
    subscription_status: org.subscription_status || 'trialing',
  };
}

export default function PlatformAdmin({ profile, onSignOut }: PlatformAdminProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const activeCount = useMemo(() => organizations.filter(org => org.account_status === 'active').length, [organizations]);
  const mrr = useMemo(() => organizations
    .filter(org => org.account_status === 'active' && org.subscription_status === 'active')
    .reduce((sum, org) => sum + (org.monthly_price_cents || 0), 0), [organizations]);

  const loadOrganizations = async () => {
    setError('');
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { data, error: queryError } = await supabase
        .from('organizations')
        .select('id,name,slug,owner_email,support_email,support_phone,website_url,plan_name,monthly_price_cents,account_status,subscription_status,created_at,updated_at')
        .neq('account_status', 'deleted')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setOrganizations((data || []) as Organization[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load contractors.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrganizations();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError('');
    setNotice('');
  };

  const openEdit = (org: Organization) => {
    setEditing(org);
    setForm(formFromOrg(org));
    setShowForm(true);
    setError('');
    setNotice('');
  };

  const setField = (field: keyof FormState, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'name' && (!prev.slug || prev.slug === slugify(prev.name))) {
        next.slug = slugify(value);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      if (!form.name.trim()) throw new Error('Contractor name is required.');
      if (!form.slug.trim()) throw new Error('Slug is required.');
      const monthlyPrice = Math.max(0, Math.round(Number(form.monthly_price || 0) * 100));
      const payload = {
        name: form.name.trim(),
        slug: slugify(form.slug),
        owner_email: form.owner_email.trim(),
        support_email: form.support_email.trim(),
        support_phone: form.support_phone.trim(),
        website_url: form.website_url.trim(),
        plan_name: form.plan_name.trim() || 'Starter',
        monthly_price_cents: monthlyPrice,
        account_status: form.account_status,
        subscription_status: form.subscription_status,
        updated_at: new Date().toISOString(),
      };

      if (editing) {
        const { error: updateError } = await supabase.from('organizations').update(payload).eq('id', editing.id);
        if (updateError) throw updateError;
        setNotice('Contractor updated.');
      } else {
        const { error: insertError } = await supabase.from('organizations').insert(payload);
        if (insertError) throw insertError;
        setNotice('Contractor created.');
      }
      setShowForm(false);
      await loadOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save contractor.');
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async (org: Organization) => {
    if (!window.confirm(`Mark ${org.name} as deleted? This hides it from the admin list without removing history.`)) return;
    setError('');
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ account_status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', org.id);
      if (updateError) throw updateError;
      setNotice(`${org.name} was marked deleted.`);
      await loadOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete contractor.');
    }
  };

  const copySetupLink = async (org: Organization) => {
    const link = `${window.location.origin}${window.location.pathname}#/contractor-setup?org=${org.id}`;
    await navigator.clipboard.writeText(link);
    setNotice('Contractor setup link copied.');
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="font-bold text-slate-900">ServSync Admin</p>
              <p className="text-xs text-slate-500">{profile.email}</p>
            </div>
          </div>
          <button onClick={onSignOut} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Sign Out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Contractor Accounts</h1>
            <p className="mt-1 text-sm text-slate-500">Create and manage contractor tenants, subscriptions, and setup links.</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus size={16} /> Add Contractor
          </button>
        </div>

        {(error || notice) && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
            {error || notice}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <Building2 className="text-blue-600" size={24} />
            <p className="mt-4 text-2xl font-bold text-slate-900">{organizations.length}</p>
            <p className="text-sm text-slate-500">Visible contractors</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <Users className="text-emerald-600" size={24} />
            <p className="mt-4 text-2xl font-bold text-slate-900">{activeCount}</p>
            <p className="text-sm text-slate-500">Active accounts</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <CreditCard className="text-indigo-600" size={24} />
            <p className="mt-4 text-2xl font-bold text-slate-900">{dollars(mrr)}</p>
            <p className="text-sm text-slate-500">Active monthly revenue</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="font-bold text-slate-900">Contractors</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading contractors...</div>
          ) : organizations.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No contractors yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {organizations.map(org => (
                <div key={org.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
                  <div>
                    <p className="font-bold text-slate-900">{org.name}</p>
                    <p className="text-xs text-slate-500">/{org.slug} · Owner: {org.owner_email || 'Not set'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs font-bold capitalize ${statusClass(org.account_status)}`}>{org.account_status}</span>
                    <span className={`rounded-full border px-2 py-1 text-xs font-bold capitalize ${statusClass(org.subscription_status)}`}>{org.subscription_status.replace('_', ' ')}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{org.plan_name || 'Starter'} · {dollars(org.monthly_price_cents || 0)}/mo</p>
                    <p className="text-xs text-slate-500">{org.support_email || 'No support email'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button onClick={() => { void copySetupLink(org); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      <Copy size={13} className="mr-1 inline" /> Setup Link
                    </button>
                    <button onClick={() => openEdit(org)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Edit</button>
                    <button onClick={() => { void softDelete(org); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="font-bold text-slate-900">{editing ? 'Edit Contractor' : 'Add Contractor'}</p>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">x</button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-500">Contractor name</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.name} onChange={e => setField('name', e.target.value)} />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Slug</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.slug} onChange={e => setField('slug', e.target.value)} />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Owner email</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.owner_email} onChange={e => setField('owner_email', e.target.value)} inputMode="email" />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Support email</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.support_email} onChange={e => setField('support_email', e.target.value)} inputMode="email" />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Support phone</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.support_phone} onChange={e => setField('support_phone', e.target.value)} />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Website</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.website_url} onChange={e => setField('website_url', e.target.value)} />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Plan</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.plan_name} onChange={e => setField('plan_name', e.target.value)} />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Monthly price</span>
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.monthly_price} onChange={e => setField('monthly_price', e.target.value)} inputMode="decimal" />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Account status</span>
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.account_status} onChange={e => setField('account_status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500">Subscription status</span>
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.subscription_status} onChange={e => setField('subscription_status', e.target.value)}>
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="canceled">Canceled</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { void save(); }} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Contractor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
