export const DEMO_WEB_ORIGIN = 'https://servsync-demo.vercel.app';
export const DEMO_SUPABASE_URL = 'https://bdytwgejqnlblhrnqxkp.supabase.co';

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
