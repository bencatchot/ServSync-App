import { useMemo, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, Home, Phone, ShieldCheck, Users } from 'lucide-react';
import { Customer, HvacType, RoofType, Vendor, VendorType } from '../types';
import { supabase, supabaseConfigured } from '../supabaseClient';
import AuthScreen from './AuthScreen';

interface CustomerOnboardingProps {
  customer: Customer | null;
  onSubmit: (customer: Customer) => Promise<void> | void;
  onExit: () => void;
}

const ROOF_TYPES: RoofType[] = ['Asphalt Shingles', 'Metal', 'Tile', 'Flat/TPO', 'Slate', 'Wood Shake', 'Other'];
const HVAC_TYPES: HvacType[] = ['Central Air/Gas Heat', 'Heat Pump', 'Mini-Split', 'Window Units', 'Radiant', 'Other'];

type VendorForm = {
  type: VendorType;
  label: string;
  company: string;
  phone: string;
  account: string;
  notes: string;
};

const VENDOR_PROMPTS: { type: VendorType; label: string; hint: string }[] = [
  { type: 'HVAC', label: 'Heating & Air', hint: 'Company that services your AC/heating' },
  { type: 'Plumber', label: 'Plumber', hint: 'Preferred plumber, if you have one' },
  { type: 'Electrician', label: 'Electrician', hint: 'Preferred electrician, if you have one' },
  { type: 'Pest Control', label: 'Pest Control', hint: 'Pest/termite company' },
  { type: 'Landscape/Lawn', label: 'Lawn Care', hint: 'Lawn or landscape company' },
  { type: 'Roofing', label: 'Roofer', hint: 'Roofing company, if known' },
];

function StepHeader({ step }: { step: number }) {
  const labels = ['Contact', 'Home', 'Vendors', 'Review'];
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        {labels.map((label, index) => {
          const active = index === step;
          const complete = index < step;
          return (
            <div key={label} className="flex flex-col items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${active ? 'bg-blue-600 text-white' : complete ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {complete ? '✓' : index + 1}
              </div>
              <span className={`text-xs mt-1 ${active ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>{label}</span>
            </div>
          );
        })}
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${((step + 1) / labels.length) * 100}%` }} />
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputClass = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white';

function getPasswordChecks(password: string) {
  return [
    { label: 'At least 8 characters', passed: password.length >= 8 },
    { label: 'One uppercase letter', passed: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', passed: /[a-z]/.test(password) },
    { label: 'One number', passed: /\d/.test(password) },
  ];
}

function passwordIsReady(password: string) {
  return getPasswordChecks(password).every(check => check.passed);
}

export default function CustomerOnboarding({ customer, onSubmit, onExit }: CustomerOnboardingProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authError, setAuthError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const [contact, setContact] = useState({
    owner: customer?.owner || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    password: '',
    confirmPassword: '',
  });

  const [home, setHome] = useState({
    sqft: customer?.home.sqft || '',
    yearBuilt: customer?.home.yearBuilt || '',
    stories: customer?.home.stories || '',
    garage: customer?.home.garage || '',
    pool: customer?.home.pool ?? false,
    roofType: customer?.home.roofType || 'Asphalt Shingles' as RoofType,
    roofAge: customer?.home.roofAge || '',
    hvacType: customer?.home.hvacType || 'Central Air/Gas Heat' as HvacType,
    hvacAge: customer?.home.hvacAge || '',
    notes: customer?.home.notes || '',
  });

  const [vendors, setVendors] = useState<VendorForm[]>(() =>
    VENDOR_PROMPTS.map(prompt => {
      const existing = customer?.vendors.find(v => v.type === prompt.type);
      return {
        type: prompt.type,
        label: prompt.label,
        company: existing?.company || '',
        phone: existing?.phone || '',
        account: existing?.account || '',
        notes: existing?.notes || '',
      };
    })
  );

  const completedVendorCount = useMemo(() => vendors.filter(v => v.company.trim() || v.phone.trim()).length, [vendors]);
  const passwordChecks = useMemo(() => getPasswordChecks(contact.password), [contact.password]);
  const passwordReady = useMemo(() => passwordChecks.every(check => check.passed), [passwordChecks]);
  const passwordsMatch = contact.confirmPassword.length > 0 && contact.password === contact.confirmPassword;

  if (saved) {
    return (
      <AuthScreen
        notice="Account created successfully. Please sign in with the email and password you just set up."
        onSignedIn={() => { window.location.replace('/'); }}
      />
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-md text-center">
          <p className="font-semibold text-slate-800">Onboarding link not found</p>
          <p className="text-sm text-slate-500 mt-2">Please ask ServSync to send you a fresh onboarding link.</p>
        </div>
      </div>
    );
  }

  const updateVendor = (type: VendorType, field: keyof VendorForm, value: string) => {
    setVendors(prev => prev.map(v => v.type === type ? { ...v, [field]: value } : v));
  };

  const nextStep = () => {
    setAuthError('');
    setSubmitError('');
    if (step === 0) {
      if (!contact.email.trim()) {
        setSubmitError('Please enter your email before continuing.');
        return;
      }
      if (!passwordReady) {
        setSubmitError('Please create a stronger password before continuing.');
        return;
      }
      if (contact.password !== contact.confirmPassword) {
        setSubmitError('Please make sure both passwords match before continuing.');
        return;
      }
    }
    setStep(s => Math.min(3, s + 1));
  };

  const submit = async () => {
    const existingByType = new Map(customer.vendors.map(v => [v.type, v]));
    const submittedVendors: Vendor[] = vendors
      .filter(v => v.company.trim() || v.phone.trim() || v.account.trim() || v.notes.trim())
      .map(v => ({
        id: existingByType.get(v.type)?.id || crypto.randomUUID(),
        type: v.type,
        company: v.company.trim(),
        phone: v.phone.trim(),
        account: v.account.trim(),
        notes: v.notes.trim(),
      }));

    const untouchedVendors = customer.vendors.filter(v => !VENDOR_PROMPTS.some(prompt => prompt.type === v.type));

    setAuthError('');
    setSubmitError('');
    if (!contact.email.trim()) { setSubmitError('Please go back to Contact and enter your email.'); setStep(0); return; }
    if (!passwordIsReady(contact.password)) { setSubmitError('Please go back to Contact and create a stronger password.'); setStep(0); return; }
    if (contact.password !== contact.confirmPassword) { setSubmitError('Please go back to Contact and make sure both passwords match.'); setStep(0); return; }
    if (!supabaseConfigured || !supabase) {
      setSubmitError('Supabase is not connected yet. Please check the app environment settings.');
      return;
    }

    setSaving(true);
    try {
      const updatedCustomer = {
        ...customer,
        owner: contact.owner.trim() || customer.owner,
        phone: contact.phone.trim() || customer.phone,
        email: contact.email.trim() || customer.email,
        home,
        vendors: [...untouchedVendors, ...submittedVendors],
      };

      const completeRes = await supabase.rpc('complete_customer_onboarding', {
        p_property_id: updatedCustomer.id,
        p_owner: updatedCustomer.owner,
        p_phone: updatedCustomer.phone,
        p_email: updatedCustomer.email,
        p_home_sqft: updatedCustomer.home.sqft,
        p_home_year_built: updatedCustomer.home.yearBuilt,
        p_home_stories: updatedCustomer.home.stories,
        p_home_garage: updatedCustomer.home.garage,
        p_home_pool: updatedCustomer.home.pool,
        p_home_roof_type: updatedCustomer.home.roofType,
        p_home_roof_age: updatedCustomer.home.roofAge,
        p_home_hvac_type: updatedCustomer.home.hvacType,
        p_home_hvac_age: updatedCustomer.home.hvacAge,
        p_home_notes: updatedCustomer.home.notes,
        p_vendors: updatedCustomer.vendors,
      });
      if (completeRes.error) throw completeRes.error;

      const signUpRes = await supabase.auth.signUp({
        email: contact.email.trim(),
        password: contact.password,
        options: {
          data: {
            role: 'customer',
            property_id: customer.id,
            full_name: contact.owner.trim() || customer.owner,
          },
        },
      });

      if (signUpRes.error) {
        const message = signUpRes.error.message.toLowerCase();
        const alreadyRegistered = message.includes('already registered') || message.includes('already exists') || message.includes('user already');
        if (!alreadyRegistered) throw signUpRes.error;

        const signInRes = await supabase.auth.signInWithPassword({
          email: contact.email.trim(),
          password: contact.password,
        });
        if (signInRes.error) throw new Error('Your home information was saved, but this email already has an account. Please sign in with the existing password or ask for a password reset.');
      }

      sessionStorage.setItem('onboardingComplete', '1');
      await supabase.auth.signOut();
      window.location.replace(`${window.location.origin}/#/login?created=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong while submitting. Please try again.';
      setSubmitError(message);
      setAuthError(message);
    } finally {
      setSaving(false);
    }
  };



  return (
    <div className="min-h-screen bg-blue-50 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={30} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome to ServSync</h1>
          <p className="text-slate-500 text-sm mt-1">A few simple questions help us take better care of your home.</p>
          <p className="text-xs text-slate-400 mt-2">For: <span className="font-semibold text-slate-600">{customer.name}</span></p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7">
          <StepHeader step={step} />

          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Phone className="text-blue-600" size={22} />
                <div>
                  <h2 className="font-bold text-slate-800">Best contact information</h2>
                  <p className="text-sm text-slate-500">So we know who to call or email.</p>
                </div>
              </div>
              <Field label="Your name"><input className={inputClass} value={contact.owner} onChange={e => setContact(f => ({ ...f, owner: e.target.value }))} placeholder="Full name" /></Field>
              <Field label="Best phone number"><input className={inputClass} value={contact.phone} onChange={e => setContact(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" inputMode="tel" /></Field>
              <Field label="Email"><input className={inputClass} value={contact.email} onChange={e => setContact(f => ({ ...f, email: e.target.value }))} placeholder="Email address" inputMode="email" /></Field>
              <Field label="Create a password" hint="You'll use this to view your reports and invoices later.">
                <input className={inputClass} value={contact.password} onChange={e => setContact(f => ({ ...f, password: e.target.value }))} placeholder="Password" type="password" />
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
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
              </Field>
              <Field label="Confirm password">
                <input className={inputClass} value={contact.confirmPassword} onChange={e => setContact(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Confirm password" type="password" />
                {contact.confirmPassword.length > 0 && (
                  <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-700' : 'text-red-600'}`}>
                    {passwordsMatch ? 'Passwords match.' : 'Passwords do not match yet.'}
                  </p>
                )}
              </Field>
              {authError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{authError}</div>}
              {submitError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{submitError}</div>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Home className="text-blue-600" size={22} />
                <div>
                  <h2 className="font-bold text-slate-800">Home details</h2>
                  <p className="text-sm text-slate-500">It’s okay to leave anything blank if you’re not sure.</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Approx. square feet"><input className={inputClass} value={home.sqft} onChange={e => setHome(f => ({ ...f, sqft: e.target.value }))} placeholder="e.g. 2400" inputMode="numeric" /></Field>
                <Field label="Year built"><input className={inputClass} value={home.yearBuilt} onChange={e => setHome(f => ({ ...f, yearBuilt: e.target.value }))} placeholder="e.g. 1998" inputMode="numeric" /></Field>
                <Field label="Stories"><input className={inputClass} value={home.stories} onChange={e => setHome(f => ({ ...f, stories: e.target.value }))} placeholder="e.g. 2" /></Field>
                <Field label="Garage"><input className={inputClass} value={home.garage} onChange={e => setHome(f => ({ ...f, garage: e.target.value }))} placeholder="e.g. 2-car" /></Field>
              </div>
              <Field label="Pool?">
                <div className="grid grid-cols-2 gap-2">
                  {['No', 'Yes'].map(value => {
                    const yes = value === 'Yes';
                    return <button key={value} onClick={() => setHome(f => ({ ...f, pool: yes }))} className={`py-3 rounded-xl border text-base font-semibold ${home.pool === yes ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}>{value}</button>;
                  })}
                </div>
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Roof type"><select className={inputClass} value={home.roofType} onChange={e => setHome(f => ({ ...f, roofType: e.target.value as RoofType }))}>{ROOF_TYPES.map(type => <option key={type}>{type}</option>)}</select></Field>
                <Field label="Roof age"><input className={inputClass} value={home.roofAge} onChange={e => setHome(f => ({ ...f, roofAge: e.target.value }))} placeholder="e.g. 8 years or unsure" /></Field>
                <Field label="HVAC type"><select className={inputClass} value={home.hvacType} onChange={e => setHome(f => ({ ...f, hvacType: e.target.value as HvacType }))}>{HVAC_TYPES.map(type => <option key={type}>{type}</option>)}</select></Field>
                <Field label="HVAC age"><input className={inputClass} value={home.hvacAge} onChange={e => setHome(f => ({ ...f, hvacAge: e.target.value }))} placeholder="e.g. 5 years or unsure" /></Field>
              </div>
              <Field label="Anything else we should know?" hint="Examples: gate code, pets, crawlspace location, special concerns.">
                <textarea className={`${inputClass} resize-none`} rows={4} value={home.notes} onChange={e => setHome(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Users className="text-blue-600" size={22} />
                <div>
                  <h2 className="font-bold text-slate-800">Preferred vendors</h2>
                  <p className="text-sm text-slate-500">Only fill in companies you already use. Blank is perfectly fine.</p>
                </div>
              </div>
              {vendors.map((vendor, index) => {
                const prompt = VENDOR_PROMPTS.find(p => p.type === vendor.type);
                return (
                  <div key={vendor.type} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                    <p className="font-semibold text-slate-800">{index + 1}. {vendor.label}</p>
                    <p className="text-xs text-slate-400 mb-3">{prompt?.hint}</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input className={inputClass} value={vendor.company} onChange={e => updateVendor(vendor.type, 'company', e.target.value)} placeholder="Company name" />
                      <input className={inputClass} value={vendor.phone} onChange={e => updateVendor(vendor.type, 'phone', e.target.value)} placeholder="Phone" inputMode="tel" />
                      <input className={inputClass} value={vendor.account} onChange={e => updateVendor(vendor.type, 'account', e.target.value)} placeholder="Account # (optional)" />
                      <input className={inputClass} value={vendor.notes} onChange={e => updateVendor(vendor.type, 'notes', e.target.value)} placeholder="Notes (optional)" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-slate-800 text-lg">Review & submit</h2>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
                <p><span className="font-semibold text-slate-700">Name:</span> {contact.owner || '—'}</p>
                <p><span className="font-semibold text-slate-700">Phone:</span> {contact.phone || '—'}</p>
                <p><span className="font-semibold text-slate-700">Email:</span> {contact.email || '—'}</p>
                <p><span className="font-semibold text-slate-700">Home:</span> {home.sqft || '—'} sq ft · Built {home.yearBuilt || '—'} · {home.stories || '—'} stories</p>
                <p><span className="font-semibold text-slate-700">Vendors added:</span> {completedVendorCount}</p>
              </div>
              <p className="text-sm text-slate-500">Tap submit once. ServSync will review this information and add it to your customer profile.</p>
              <p className="text-xs text-slate-400">By submitting, you confirm the information provided is accurate to the best of your knowledge and agree to the <a href="/#/privacy" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:text-blue-700">Privacy Policy</a>, <a href="/#/terms" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:text-blue-700">Terms of Use</a>, <a href="/#/service-terms" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:text-blue-700">Service Terms</a>, <a href="/#/communications-consent" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:text-blue-700">Electronic Communications Consent</a>, and <a href="/#/photo-consent" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:text-blue-700">Photo/Media Consent</a>.</p>
              {submitError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{submitError}</div>}
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 0 ? (
              <button onClick={() => setStep(s => Math.max(0, s - 1))} className="flex-1 flex items-center justify-center gap-2 border border-slate-200 text-slate-600 rounded-xl py-3 font-semibold hover:bg-slate-50 transition-colors"><ChevronLeft size={18} /> Back</button>
            ) : (
              <button onClick={onExit} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-3 font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
            )}
            {step < 3 ? (
              <button onClick={nextStep} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition-colors">Next <ChevronRight size={18} /></button>
            ) : (
              <button onClick={() => { void submit(); }} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">{saving ? 'Submitting...' : 'Submit'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
