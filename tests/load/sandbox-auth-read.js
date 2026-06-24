import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import {
  assertReadOnlyRestTable,
  assertReadOnlyRpc,
  loadSandboxCredentials,
  requireLoadTestAllowed,
  requireSandboxAnonKey,
  requireSandboxAuthReadOnly,
  requireSandboxSupabaseRef,
  sandboxAuthReadThresholds,
  sandboxBaseUrl,
  stageProfile,
} from './helpers/loadGuards.js';

requireLoadTestAllowed('sandbox-auth');
requireSandboxAuthReadOnly();
const baseUrl = sandboxBaseUrl();
const supabaseUrl = requireSandboxSupabaseRef();
const anonKey = requireSandboxAnonKey();
const credentials = loadSandboxCredentials();

export const options = {
  stages: stageProfile(),
  thresholds: sandboxAuthReadThresholds,
};

function authHeaders(token) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
  };
}

function jsonHeaders(token) {
  return {
    ...authHeaders(token),
    'Content-Type': 'application/json',
  };
}

function queryString(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function checkReadResponse(response, label) {
  return check(response, {
    [`${label} returned 2xx`]: res => res.status >= 200 && res.status < 300,
    [`${label} did not redirect`]: res => res.status < 300,
  });
}

function signInCredential(credential, role, index) {
  const response = http.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email: credential.email,
      password: credential.password,
    }),
    {
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      tags: {
        scenario: 'sandbox-auth-read',
        auth_role: role,
        endpoint: 'auth-token',
      },
    },
  );

  if (response.status !== 200) {
    fail(`Sandbox ${role} credential #${index + 1} could not sign in. Status: ${response.status}.`);
  }

  let body;
  try {
    body = response.json();
  } catch (_error) {
    fail(`Sandbox ${role} credential #${index + 1} sign-in did not return JSON.`);
  }

  if (!body?.access_token || !body?.user?.id) {
    fail(`Sandbox ${role} credential #${index + 1} sign-in returned an incomplete session.`);
  }

  return {
    accessToken: body.access_token,
    userId: body.user.id,
  };
}

function supabaseGet(token, table, params, tag) {
  assertReadOnlyRestTable(table);
  const query = queryString(params);
  const response = http.get(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: authHeaders(token),
    tags: {
      scenario: 'sandbox-auth-read',
      endpoint_type: 'rest',
      table,
      tag,
    },
  });
  checkReadResponse(response, tag);
  return response;
}

function supabaseRpc(token, rpcName, body, tag) {
  assertReadOnlyRpc(rpcName);
  const response = http.post(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, JSON.stringify(body || {}), {
    headers: jsonHeaders(token),
    tags: {
      scenario: 'sandbox-auth-read',
      endpoint_type: 'rpc',
      rpc: rpcName,
      tag,
    },
  });
  checkReadResponse(response, tag);
  return response;
}

function firstRow(response) {
  try {
    const parsed = response.json();
    return Array.isArray(parsed) ? parsed[0] : null;
  } catch (_error) {
    return null;
  }
}

function buildHomeownerSession(credential, index) {
  const session = signInCredential(credential, 'homeowner', index);
  return {
    ...session,
    role: 'homeowner',
  };
}

function buildContractorSession(credential, index) {
  const session = signInCredential(credential, 'contractor', index);
  const profileResponse = supabaseGet(
    session.accessToken,
    'contractor_profiles',
    {
      select: 'id',
      owner_user_id: `eq.${session.userId}`,
      limit: 1,
    },
    'contractor-profile-id-setup',
  );
  let contractorId = firstRow(profileResponse)?.id || '';

  if (!contractorId) {
    const fallbackResponse = supabaseRpc(
      session.accessToken,
      'servsync_current_contractor_profile',
      {},
      'current-contractor-profile-setup',
    );
    const fallbackData = firstRow(fallbackResponse);
    contractorId = fallbackData?.id || fallbackData?.contractor_id || '';
  }

  if (!contractorId) {
    fail(`Sandbox contractor credential #${index + 1} does not have a readable contractor profile.`);
  }

  return {
    ...session,
    role: 'contractor',
    contractorId,
  };
}

export function setup() {
  return {
    appBaseUrl: baseUrl,
    homeowners: credentials.homeowners.map(buildHomeownerSession),
    contractors: credentials.contractors.map(buildContractorSession),
  };
}

function pickFromPool(pool) {
  return pool[(__VU + __ITER) % pool.length];
}

function readHomeownerBundle(session) {
  const token = session.accessToken;
  const userId = session.userId;

  supabaseGet(token, 'homeowner_profiles', { select: '*', user_id: `eq.${userId}`, limit: 1 }, 'homeowner-profile');
  supabaseGet(token, 'homes', { select: '*', homeowner_user_id: `eq.${userId}`, order: 'created_at.asc' }, 'homeowner-homes');
  supabaseRpc(token, 'servsync_get_homeowner_connections', {}, 'homeowner-connections');
  supabaseGet(
    token,
    'contractor_profiles',
    {
      select: 'id,business_name,contact_name,service_categories,city,state,zip_code,public_profile_enabled,account_status',
      public_profile_enabled: 'eq.true',
      account_status: 'eq.active',
      order: 'business_name.asc',
      limit: 50,
    },
    'public-contractor-directory',
  );
  supabaseGet(
    token,
    'homeowner_contractor_invite_leads',
    { select: 'id,business_name,location,trade_category,homeowner_status,created_at,updated_at', order: 'created_at.desc', limit: 50 },
    'homeowner-invite-leads',
  );
  supabaseRpc(token, 'servsync_homeowner_service_requests', {}, 'homeowner-service-requests');
  supabaseGet(
    token,
    'estimates',
    { select: '*', homeowner_user_id: `eq.${userId}`, status: 'neq.draft', order: 'updated_at.desc', limit: 50 },
    'homeowner-estimates',
  );
  supabaseGet(
    token,
    'invoices',
    { select: '*', homeowner_user_id: `eq.${userId}`, status: 'neq.draft', order: 'updated_at.desc', limit: 50 },
    'homeowner-invoices',
  );
  supabaseGet(token, 'notifications', { select: '*', user_id: `eq.${userId}`, order: 'created_at.desc', limit: 50 }, 'homeowner-notifications');
  supabaseGet(
    token,
    'home_maintenance_log',
    { select: '*', homeowner_user_id: `eq.${userId}`, order: 'performed_at.desc', limit: 50 },
    'homeowner-history',
  );
  supabaseGet(token, 'home_reminders', { select: '*', homeowner_user_id: `eq.${userId}`, order: 'due_on.asc', limit: 50 }, 'homeowner-reminders');
  supabaseGet(
    token,
    'home_documents',
    {
      select: 'id,home_id,homeowner_user_id,file_name,file_type,file_size_bytes,upload_source,created_at',
      homeowner_user_id: `eq.${userId}`,
      order: 'created_at.desc',
      limit: 50,
    },
    'homeowner-document-metadata',
  );
  supabaseGet(
    token,
    'support_inquiries',
    { select: 'id,requester_user_id,status,category,subject,updated_at,created_at', requester_user_id: `eq.${userId}`, order: 'updated_at.desc', limit: 25 },
    'homeowner-support-inquiries',
  );
}

function readContractorBundle(session) {
  const token = session.accessToken;
  const userId = session.userId;
  const contractorId = session.contractorId;

  supabaseGet(token, 'contractor_profiles', { select: '*', owner_user_id: `eq.${userId}`, limit: 1 }, 'contractor-profile');
  supabaseRpc(token, 'servsync_current_contractor_profile', {}, 'contractor-current-profile');
  supabaseRpc(token, 'servsync_contractor_connected_homeowners', {}, 'contractor-connected-homeowners');
  supabaseRpc(token, 'servsync_contractor_service_requests', {}, 'contractor-service-requests');
  supabaseGet(token, 'notifications', { select: '*', user_id: `eq.${userId}`, order: 'created_at.desc', limit: 50 }, 'contractor-notifications');
  supabaseGet(
    token,
    'support_inquiries',
    { select: 'id,requester_user_id,status,category,subject,updated_at,created_at', requester_user_id: `eq.${userId}`, order: 'updated_at.desc', limit: 25 },
    'contractor-support-inquiries',
  );
  supabaseGet(token, 'contractor_invites', { select: '*', contractor_id: `eq.${contractorId}`, order: 'created_at.desc', limit: 50 }, 'contractor-invites');
  supabaseRpc(token, 'servsync_contractor_pending_connection_requests', {}, 'contractor-pending-connections');
  supabaseRpc(token, 'servsync_contractor_team', {}, 'contractor-team');
  supabaseGet(token, 'contractor_service_areas', { select: '*', contractor_id: `eq.${contractorId}`, order: 'created_at.asc', limit: 50 }, 'contractor-service-areas');
  supabaseGet(token, 'inspection_templates', { select: '*', contractor_id: `eq.${contractorId}`, order: 'created_at.desc', limit: 50 }, 'contractor-inspection-templates');
  supabaseGet(token, 'inspections', { select: '*', contractor_id: `eq.${contractorId}`, order: 'created_at.desc', limit: 50 }, 'contractor-inspections');
  supabaseGet(token, 'contractor_visit_events', { select: '*', contractor_id: `eq.${contractorId}`, order: 'scheduled_at.asc', limit: 50 }, 'contractor-visit-events');
  supabaseGet(token, 'contractor_calendar_events', { select: '*', contractor_id: `eq.${contractorId}`, order: 'starts_at.asc', limit: 50 }, 'contractor-calendar-events');
  supabaseGet(
    token,
    'contractor_calendar_event_job_links',
    { select: '*', contractor_id: `eq.${contractorId}`, order: 'occurrence_starts_at.asc', limit: 50 },
    'contractor-calendar-job-links',
  );
  supabaseGet(
    token,
    'contractor_calendar_event_occurrence_exclusions',
    { select: '*', contractor_id: `eq.${contractorId}`, order: 'occurrence_starts_at.asc', limit: 50 },
    'contractor-calendar-exclusions',
  );
  supabaseGet(token, 'contractor_local_contacts', { select: '*', contractor_id: `eq.${contractorId}`, order: 'created_at.desc', limit: 50 }, 'contractor-local-contacts');
  supabaseGet(token, 'estimates', { select: '*', contractor_id: `eq.${contractorId}`, order: 'updated_at.desc', limit: 50 }, 'contractor-estimates');
  supabaseGet(token, 'invoices', { select: '*', contractor_id: `eq.${contractorId}`, order: 'updated_at.desc', limit: 50 }, 'contractor-invoices');
  supabaseGet(token, 'estimate_templates', { select: '*', contractor_id: `eq.${contractorId}`, order: 'updated_at.desc', limit: 50 }, 'contractor-estimate-templates');
  supabaseGet(
    token,
    'contractor_saved_estimate_charges',
    { select: 'id,contractor_id,name,description,line_type,charge_type,amount_cents,default_quantity,unit,active,sort_order,created_at,updated_at', contractor_id: `eq.${contractorId}`, order: 'created_at.asc', limit: 50 },
    'contractor-saved-charges',
  );
}

export default function sandboxAuthReadLoad(data) {
  const homeowner = pickFromPool(data.homeowners);
  const contractor = pickFromPool(data.contractors);

  readHomeownerBundle(homeowner);
  readContractorBundle(contractor);

  sleep(Number(__ENV.LOAD_TEST_SLEEP_SECONDS || '4'));
}
