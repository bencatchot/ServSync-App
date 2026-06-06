import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';
import type { UserRole } from '../types';

type LoginPath = 'homeowner' | 'contractor' | 'platform';
type AuthMode = 'signin' | 'signup';

function roleMatchesPath(role: UserRole, path: LoginPath) {
  if (path === 'homeowner') return role === 'customer';
  if (path === 'contractor') return role === 'admin' || role === 'contractor';
  return role === 'platform_admin';
}

const COPY: Record<LoginPath, { title: string; subtitle: string; helper: string }> = {
  homeowner: {
    title: 'Homeowner Login',
    subtitle: 'Sign in to view your home profile, reports, requests, invoices, and appointments.',
    helper: 'You can sign in, create your own homeowner account, or use an invite link from a contractor.',
  },
  contractor: {
    title: 'Contractor Login',
    subtitle: 'Sign in to manage homeowners, inspections, reports, requests, and schedules.',
    helper: 'Contractor accounts are created by ServSync or your company administrator.',
  },
  platform: {
    title: 'ServSync Admin',
    subtitle: 'Internal platform access for managing contractor accounts.',
    helper: 'This page is for authorized ServSync administrators only.',
  },
};

export default function AuthScreen({
  notice,
  onSignedIn,
  path = 'contractor',
  mode = 'signin',
}: {
  notice?: string;
  onSignedIn?: () => void;
  path?: LoginPath;
  mode?: AuthMode;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>(mode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const copy = COPY[path];
  const referralCode = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('ref') ||
    new URLSearchParams((window.location.hash.split('?')[1] || '')).get('code') ||
    '';
  const contractorInviteOrgId = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('connect') || '';
  const isHomeownerSignup = path === 'homeowner' && authMode === 'signup';

  useEffect(() => {
    setAuthMode(mode);
  }, [mode]);

  const signIn = async () => {
    setError('');
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (path === 'homeowner' && contractorInviteOrgId) {
        localStorage.setItem('servsync_pending_contractor_org_id', contractorInviteOrgId);
      }
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Unable to verify this account.');
      const profileRes = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (profileRes.error) throw profileRes.error;
      const role = profileRes.data?.role as UserRole | undefined;
      if (!role || !roleMatchesPath(role, path)) {
        await supabase.auth.signOut();
        throw new Error(`This account does not have access to the ${copy.title}.`);
      }
      if (onSignedIn) {
        onSignedIn();
      } else {
        window.location.replace('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {
    setError('');
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase is not connected.');
      if (path !== 'homeowner') throw new Error('Public signup is only available for homeowner accounts right now.');
      if (!fullName.trim()) throw new Error('Full name is required.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      if (password !== confirmPassword) throw new Error('Passwords do not match.');
      if (contractorInviteOrgId) {
        localStorage.setItem('servsync_pending_contractor_org_id', contractorInviteOrgId);
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: 'customer',
            referral_code: referralCode || undefined,
          },
        },
      });
      if (error) throw error;

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      if (onSignedIn) {
        onSignedIn();
      } else {
        window.location.replace('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    if (isHomeownerSignup) void signUp();
    else void signIn();
  };

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShieldCheck size={34} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ServSync</h1>
          <p className="text-sm font-semibold text-slate-700 mt-1">{copy.title}</p>
          <p className="text-sm text-slate-500 mt-1">{copy.subtitle}</p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-4">
          {notice && <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700">{notice}</div>}
          {path === 'homeowner' && (
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setAuthMode('signin')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${authMode === 'signin' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                Sign In
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${authMode === 'signup' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                Create Account
              </button>
            </div>
          )}
          {isHomeownerSignup && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
              <input className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
            <input className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={password} onChange={e => setPassword(e.target.value)} type="password" onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
            {isHomeownerSignup && <p className="mt-1 text-xs text-slate-400">Use at least 8 characters.</p>}
          </div>
          {isHomeownerSignup && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Confirm Password</label>
              <input className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type="password" onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
            </div>
          )}
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{error}</div>}
          <button onClick={submit} disabled={loading || !email || !password || (isHomeownerSignup && (!fullName || !confirmPassword))} className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
            {loading ? (isHomeownerSignup ? 'Creating account...' : 'Signing in...') : (isHomeownerSignup ? 'Create Account' : 'Sign In')}
          </button>
          <p className="text-xs text-slate-400 text-center">{copy.helper}</p>
          <p className="text-xs text-slate-400 text-center">
            <a href="/#/privacy" className="text-blue-600 font-semibold hover:text-blue-700">Privacy Policy</a> · <a href="/#/terms" className="text-blue-600 font-semibold hover:text-blue-700">Terms</a>
          </p>
        </div>
      </div>
    </div>
  );
}
