import { resolve } from 'node:path';

export const CAPTURE_APP = 'https://servsync-demo.vercel.app';
export const CAPTURE_API = 'https://bdytwgejqnlblhrnqxkp.supabase.co';
export const CAPTURE_VIEWPORT = Object.freeze({ width: 1440, height: 1000 });
// Exact, reviewed query endpoints. No prefix-based permission to call arbitrary RPCs.
export const READ_RPCS = Object.freeze([
  'servsync_current_contractor_entitlements',
  'servsync_current_contractor_profile',
  'servsync_contractor_connected_homeowners',
  'servsync_contractor_team',
  'servsync_current_contractor_durable_draft_entitlement',
  'servsync_get_homeowner_connections',
  'servsync_homeowner_service_requests',
  'servsync_contractor_service_requests',
  'servsync_contractor_pending_connection_requests',
  'servsync_list_local_customer_summaries',
  'servsync_list_local_customer_historical_context',
  'servsync_list_archived_local_customers',
  'servsync_list_local_customer_claim_invites_v2',
  'servsync_list_my_home_membership_email_invites',
  'servsync_list_my_shared_home_address_shells',
  'servsync_list_my_shared_home_reminder_shells',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCaptureArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg === '--fictional-demo-confirmed') { options.fictionalDemoConfirmed = true; continue; }
    const match = arg.match(/^--(role|request-id|appointment-id|output-dir|login-timeout-seconds)=(.+)$/);
    if (!match || match[1] in options) throw new Error('Unsupported or duplicate capture option.');
    options[match[1]] = match[2];
  }
  if (!['homeowner', 'contractor'].includes(options.role)) throw new Error('Choose --role=homeowner or --role=contractor.');
  for (const field of ['request-id', 'appointment-id']) {
    if (!uuid.test(options[field] || '')) throw new Error(`A valid --${field} is required.`);
  }
  if (!options.fictionalDemoConfirmed) throw new Error('Confirm that the selected records are fictional with --fictional-demo-confirmed.');
  const timeoutSeconds = Number(options['login-timeout-seconds'] || 600);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 1800) throw new Error('Login timeout must be 30–1800 seconds.');
  return {
    role: options.role, requestId: options['request-id'], appointmentId: options['appointment-id'],
    outputDir: resolve(options['output-dir'] || 'demo-recordings/capture-only'), loginTimeoutMs: timeoutSeconds * 1000,
  };
}

/** Returns only an allow/deny decision; never includes credentials or request bodies in diagnostics. */
export function captureRequestDecision({ url: rawUrl, method, body, navigation = false }, phase = 'capture') {
  let url;
  try { url = new URL(rawUrl); } catch { return { allow: false, reason: 'invalid-url' }; }
  if (url.username || url.password || url.protocol !== 'https:') return { allow: false, reason: 'origin' };
  if (method === 'OPTIONS' && [CAPTURE_APP, CAPTURE_API].includes(url.origin)) return { allow: true };
  const read = ['GET', 'HEAD'].includes(method);
  if (navigation && url.origin !== CAPTURE_APP) return { allow: false, reason: 'navigation' };
  if (url.origin === CAPTURE_APP) {
    if (read && (url.pathname === '/' || /^\/assets\/[A-Za-z0-9_.\/-]+$/.test(url.pathname) ||
      /^\/(favicon\.(ico|svg)|manifest\.webmanifest|servsync[^/]*\.(png|svg)|logo[^/]*\.(png|svg))$/.test(url.pathname))) {
      return { allow: true };
    }
    return { allow: false, reason: 'app-endpoint' };
  }
  if (url.origin !== CAPTURE_API) return { allow: false, reason: 'external-origin' };
  if (read && url.pathname === '/auth/v1/user') return { allow: true };
  if (phase === 'login' && method === 'POST' && url.pathname === '/auth/v1/token' &&
      ['password', 'refresh_token'].includes(url.searchParams.get('grant_type'))) return { allow: true };
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
  if (rpc) {
    if (!READ_RPCS.includes(rpc)) return { allow: false, reason: 'rpc-not-reviewed' };
    if (read) return { allow: true };
    if (method !== 'POST') return { allow: false, reason: 'rpc-method' };
    // Invoke queries using PostgREST GET/read-only transactions, never forward an RPC POST.
    let args;
    try { args = JSON.parse(body || '{}'); } catch { return { allow: false, reason: 'rpc-arguments' }; }
    if (!args || Array.isArray(args) || typeof args !== 'object') return { allow: false, reason: 'rpc-arguments' };
    for (const [key, value] of Object.entries(args)) {
      if (!/^p_[a-z0-9_]+$/.test(key) || value === null || !['string', 'number', 'boolean'].includes(typeof value)) {
        return { allow: false, reason: 'rpc-arguments' };
      }
      if (url.searchParams.has(key)) return { allow: false, reason: 'rpc-arguments' };
      url.searchParams.set(key, String(value));
    }
    return { allow: true, method: 'GET', url: url.href, postData: '' };
  }
  if (read && /^\/rest\/v1\/[a-z][a-z0-9_]*$/.test(url.pathname)) return { allow: true };
  // Only existing image reads; no upload, signing, transformations, functions, realtime or provider traffic.
  if (read && /^\/storage\/v1\/object\/(public|authenticated)\//.test(url.pathname)) return { allow: true };
  return { allow: false, reason: 'write-or-unsupported-endpoint' };
}

export async function installCaptureGuard(context, phase = 'capture') {
  const counters = { allowed: 0, rewrittenReadRpcs: 0, denied: {}, deniedRpcNames: [], serverDenials: 0 };
  await context.route('**/*', async route => {
    const request = route.request();
    const decision = captureRequestDecision({ url: request.url(), method: request.method(), body: request.postData(), navigation: request.isNavigationRequest() }, phase);
    if (!decision.allow) {
      counters.denied[decision.reason] = (counters.denied[decision.reason] || 0) + 1;
      const name = new URL(request.url()).pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
      if (name && !counters.deniedRpcNames.includes(name)) counters.deniedRpcNames.push(name);
      return route.abort('blockedbyclient');
    }
    counters.allowed++;
    if (decision.method) {
      counters.rewrittenReadRpcs++;
      const headers = { ...request.headers() };
      delete headers['content-length']; delete headers['content-type'];
      return route.fallback({ method: decision.method, url: decision.url, postData: '', headers });
    }
    return route.fallback();
  });
  await context.routeWebSocket('**/*', socket => { counters.denied.websocket = (counters.denied.websocket || 0) + 1; socket.close(); });
  context.on('response', response => {
    // Authentication is a user-controlled handoff; a rejected login must not be automated/retried.
    if ([401, 403].includes(response.status())) counters.serverDenials++;
  });
  return counters;
}

export function assertCaptureRecord(records, options) {
  const record = Array.isArray(records) ? records.find(item => item.id === options.requestId) : null;
  if (!record || !/fictional|demo test/i.test(JSON.stringify([record.description, record.messages]))) {
    throw new Error('Selected request was not returned as an explicitly fictional Demo record.');
  }
  if (record.appointment?.id !== options.appointmentId || record.appointment?.status !== 'confirmed') {
    throw new Error('Selected request does not have the expected confirmed appointment.');
  }
  return record;
}
