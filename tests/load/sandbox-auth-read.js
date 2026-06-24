import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import {
  assertReadOnlyRestTable,
  assertReadOnlyRpc,
  authProfileMode,
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
const profileMode = authProfileMode();

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
    profileMode,
    homeowners: profileMode === 'contractor' ? [] : credentials.homeowners.map(buildHomeownerSession),
    contractors: profileMode === 'homeowner' ? [] : credentials.contractors.map(buildContractorSession),
  };
}

function pickFromPool(pool) {
  return pool[(__VU + __ITER) % pool.length];
}

function readHomeownerBundle(session) {
  const token = session.accessToken;
  const userId = session.userId;

  supabaseGet(
    token,
    'homeowner_profiles',
    { select: 'user_id,display_name,city,state,zip_code,created_at,updated_at', user_id: `eq.${userId}`, limit: 1 },
    'homeowner-profile',
  );
  supabaseGet(
    token,
    'homes',
    { select: 'id,homeowner_user_id,nickname,city,state,zip_code,home_type,created_at,updated_at', homeowner_user_id: `eq.${userId}`, order: 'created_at.asc', limit: 25 },
    'homeowner-homes',
  );
  supabaseRpc(token, 'servsync_get_homeowner_connections', {}, 'homeowner-connections');
  supabaseRpc(token, 'servsync_homeowner_service_requests', {}, 'homeowner-service-requests');
  supabaseGet(
    token,
    'estimates',
    { select: 'id,contractor_id,homeowner_user_id,service_request_id,home_id,title,status,total_cents,created_at,updated_at', homeowner_user_id: `eq.${userId}`, status: 'neq.draft', order: 'updated_at.desc', limit: 25 },
    'homeowner-estimates',
  );
  supabaseGet(
    token,
    'invoices',
    { select: 'id,contractor_id,homeowner_user_id,service_request_id,estimate_id,home_id,invoice_number,title,status,total_cents,created_at,updated_at', homeowner_user_id: `eq.${userId}`, status: 'neq.draft', order: 'updated_at.desc', limit: 25 },
    'homeowner-invoices',
  );
  supabaseGet(token, 'home_reminders', { select: 'id,homeowner_user_id,home_id,title,due_on,status,created_at,updated_at', homeowner_user_id: `eq.${userId}`, order: 'due_on.asc', limit: 25 }, 'homeowner-reminders');
}

function readContractorBundle(session) {
  const token = session.accessToken;
  const userId = session.userId;
  const contractorId = session.contractorId;

  supabaseGet(
    token,
    'contractor_profiles',
    { select: 'id,owner_user_id,business_name,contact_name,city,state,zip_code,service_categories,account_status,created_at,updated_at', owner_user_id: `eq.${userId}`, limit: 1 },
    'contractor-profile',
  );
  supabaseRpc(token, 'servsync_current_contractor_profile', {}, 'contractor-current-profile');
  supabaseRpc(token, 'servsync_contractor_connected_homeowners', {}, 'contractor-connected-homeowners');
  supabaseRpc(token, 'servsync_contractor_service_requests', {}, 'contractor-service-requests');
  supabaseGet(
    token,
    'inspections',
    { select: 'id,contractor_id,homeowner_user_id,home_id,service_request_id,name,status,job_status,created_at,updated_at', contractor_id: `eq.${contractorId}`, order: 'created_at.desc', limit: 25 },
    'contractor-inspections',
  );
  supabaseGet(
    token,
    'estimates',
    { select: 'id,contractor_id,homeowner_user_id,service_request_id,inspection_id,home_id,title,status,total_cents,created_at,updated_at', contractor_id: `eq.${contractorId}`, order: 'updated_at.desc', limit: 25 },
    'contractor-estimates',
  );
  supabaseGet(
    token,
    'invoices',
    { select: 'id,contractor_id,homeowner_user_id,service_request_id,job_id,estimate_id,home_id,invoice_number,title,status,total_cents,created_at,updated_at', contractor_id: `eq.${contractorId}`, order: 'updated_at.desc', limit: 25 },
    'contractor-invoices',
  );
  supabaseGet(token, 'estimate_templates', { select: 'id,contractor_id,name,trade,created_at,updated_at', contractor_id: `eq.${contractorId}`, order: 'updated_at.desc', limit: 25 }, 'contractor-estimate-templates');
  supabaseGet(
    token,
    'contractor_saved_estimate_charges',
    { select: 'id,contractor_id,name,line_type,charge_type,amount_cents,active,sort_order,created_at,updated_at', contractor_id: `eq.${contractorId}`, order: 'created_at.asc', limit: 25 },
    'contractor-saved-charges',
  );
}

export default function sandboxAuthReadLoad(data) {
  const selectedProfile = data.profileMode === 'mixed'
    ? (__ITER + __VU) % 2 === 0 ? 'homeowner' : 'contractor'
    : data.profileMode;

  if (selectedProfile === 'homeowner') {
    readHomeownerBundle(pickFromPool(data.homeowners));
  } else {
    readContractorBundle(pickFromPool(data.contractors));
  }

  sleep(Number(__ENV.LOAD_TEST_SLEEP_SECONDS || '4'));
}
