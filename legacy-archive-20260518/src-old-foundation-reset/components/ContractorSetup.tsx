import { useEffect, useMemo, useState } from 'react';
import { Briefcase, CheckCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';

type SetupOrganization = {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  support_email: string;
  account_status: string;
  subscription_status: string;
};

function getPasswordChecks(password: string) {
  return [
    { label: 'At least 8 characters', passed: password.length >= 8 },
    { label: 'One uppercase letter', passed: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', passed: /[a-z]/.test(password) },
    { label: 'One number', passed: /\d/.test(password) },
  ];
}

export default function ContractorSetup({ organizationId }: { organizationId: string | null }) {
  const [organization, setOrganization] = useState<SetupOrganization | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const passwordChecks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordReady = passwordChecks.every(check => check.passed);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (!organizationId) throw new Error('Setup link is missing an organization.');
        if (!supabase) throw new Error('Supabase is not connected.');
        const { data, error: rpcError } = await supabase.rpc('get_contractor_setup_organization', { p_organization_id: organizationId });
        if (rpcError) throw rpcError;
        if (!data) throw new Error('Contractor setup link not found.');
        if (!mounted) return;
        const org = data as SetupOrganization;
        setOrganization(org);
        setEmail(org.owner_email || org.support_email || '');
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load contractor setup.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [organizationId]);

  const submit = async () => {
    setError('');
    if (!organization) return;
    if (!fullName.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (!passwordReady) { setError('Please create a stronger password.'); return; }
    if (password !== confirmPassword) { setError('Please make sure both passwords match.'); return; }

    setSaving(true);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      await supabase.auth.signOut();

      const signUpRes = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role: 'contractor',
            member_role: 'owner',
            organization_id: organization.id,
            full_name: fullName.trim(),
          },
        },
      });

      if (signUpRes.error) {
        const message = signUpRes.error.message.toLowerCase();
        const alreadyRegistered = message.includes('already registered') || message.includes('already exists') || message.includes('user already');
        if (!alreadyRegistered) throw signUpRes.error;

        const signInRes = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInRes.error) throw new Error('This email already has an account. Sign in with the existing password or reset the password before continuing.');
      }

      const sessionRes = await supabase.auth.getSession();
      if (sessionRes.data.session?.user.id) {
        const linkRes = await supabase.rpc('setup_contractor_account', {
          p_organization_id: organization.id,
          p_full_name: fullName.trim(),
        });
        if (linkRes.error) throw linkRes.error;
      }

      setDone(true);
      await supabase.auth.signOut();
      window.setTimeout(() => {
        window.location.replace(`${window.location.origin}${window.location.pathname}#/contractor-login?created=1`);
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to finish contractor setup.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !organization) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-2xl p-6 max-w-md text-center">
          <p className="font-bold text-red-700">Setup link unavailable</p>
          <p className="text-sm text-slate-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Briefcase size={34} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Set Up Contractor Account</h1>
          <p className="text-sm text-slate-500 mt-1">{organization?.name}</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-4">
          {done && (
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700">
              <CheckCircle size={18} />
              <span>Account setup complete. Redirecting to contractor login...</span>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Your name</span>
            <input className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={fullName} onChange={e => setFullName(e.target.value)} />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Email</span>
            <input className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Create password</span>
            <input className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={password} onChange={e => setPassword(e.target.value)} type="password" />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">Password requirements</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {passwordChecks.map(check => (
                <div key={check.label} className={`flex items-center gap-2 text-xs ${check.passed ? 'text-green-700' : 'text-slate-500'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${check.passed ? 'bg-green-100 text-green-700' : 'bg-white border border-slate-200 text-slate-300'}`}>
                    {check.passed ? '✓' : ''}
                  </span>
                  {check.label}
                </div>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Confirm password</span>
            <input className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type="password" />
            {confirmPassword.length > 0 && (
              <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-700' : 'text-red-600'}`}>
                {passwordsMatch ? 'Passwords match.' : 'Passwords do not match yet.'}
              </p>
            )}
          </label>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}

          <button onClick={() => { void submit(); }} disabled={saving || done} className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
            {saving ? 'Creating account...' : 'Create Contractor Account'}
          </button>

          <p className="text-xs text-slate-400 text-center">
            <ShieldCheck size={12} className="inline mr-1" />
            This account will be linked to {organization?.name}.
          </p>
        </div>
      </div>
    </div>
  );
}
