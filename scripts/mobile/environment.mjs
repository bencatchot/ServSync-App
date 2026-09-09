export const DEMO_WEB_ORIGIN = 'https://servsync-demo.vercel.app';
export const DEMO_SUPABASE_URL = 'https://bdytwgejqnlblhrnqxkp.supabase.co';

// Match the current hosted Demo workflow. Account eligibility remains server-owned.
export const MOBILE_DEMO_WORK_FLAGS = Object.freeze({
  VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED: 'true',
  VITE_DRAFT_JOB_UI_ENABLED: 'true',
  VITE_CONTRACTOR_WORK_UI_ENABLED: 'true',
});

export function mobileDemoWorkDefines(env) {
  for (const [name, value] of Object.entries(MOBILE_DEMO_WORK_FLAGS)) {
    if (env[name] !== undefined && env[name] !== value) {
      throw new Error(`Mobile Demo requires ${name}=true to match the hosted Work workflow.`);
    }
  }
  return Object.fromEntries(Object.entries(MOBILE_DEMO_WORK_FLAGS)
    .map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)]));
}

export function assertMobileDemoEnvironment(env) {
  if (env.VITE_SUPABASE_URL !== DEMO_SUPABASE_URL) {
    throw new Error('Mobile prototype requires the approved ServSync Demo Supabase URL.');
  }
  const key = env.VITE_SUPABASE_ANON_KEY || '';
  let claims;
  try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { /* Reject below. */ }
  const publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  const demoAnonJwt = claims?.role === 'anon' && claims?.ref === 'bdytwgejqnlblhrnqxkp';
  if (!publicKey && !demoAnonJwt) {
    throw new Error('Mobile prototype requires the Demo public anonymous key, never a privileged key.');
  }
}
