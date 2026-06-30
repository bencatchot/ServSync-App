import { expect, test } from '@playwright/test';
import {
  buildHomeAccessInviteEmail,
  handleHomeAccessInviteEmailRequest,
  type PreparedHomeAccessInviteDelivery,
} from '../../supabase/functions/send-home-access-invite-email/index.ts';

const VALID_INVITE_ID = '11111111-1111-4111-8111-111111111111';

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
  body: Record<string, unknown> | null;
};

function envFor(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    HOME_ACCESS_INVITE_EMAIL_ENABLED: 'false',
    APP_URL: 'https://servsync.app',
    ...overrides,
  };

  return (name: string) => values[name];
}

function authedRequest(body: Record<string, unknown>, method = 'POST') {
  return new Request('https://servsync.app/functions/v1/send-home-access-invite-email', {
    method,
    headers: {
      Authorization: 'Bearer caller-jwt',
      'Content-Type': 'application/json',
      Origin: 'https://servsync.app',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function preparedPayload(overrides: Partial<PreparedHomeAccessInviteDelivery> = {}): PreparedHomeAccessInviteDelivery {
  return {
    delivery_enabled: false,
    route_hint: 'home-access-invite',
    invite_id: VALID_INVITE_ID,
    home_id: '22222222-2222-4222-8222-222222222222',
    invited_email: 'invitee@example.invalid',
    role: 'viewer',
    home_display_label: 'Lake House',
    city: 'Fairhope',
    state: 'AL',
    inviter_display_label: 'A homeowner',
    expires_at: '2026-07-30T00:00:00.000Z',
    delivery_status: 'disabled',
    delivery_attempt_count: 1,
    ...overrides,
  };
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function mockFetch(respond: (call: FetchCall, index: number) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : null;
    const call = { url, init, body };
    calls.push(call);
    return await respond(call, calls.length - 1);
  }) as typeof fetch;

  return { calls, fetcher };
}

test.describe('home access invite email edge function scaffold', () => {
  test('rejects unsupported methods, missing auth, and invalid invite ids before RPC calls', async () => {
    const { calls, fetcher } = mockFetch(() => {
      throw new Error('fetch should not be called for invalid requests');
    });

    const getResponse = await handleHomeAccessInviteEmailRequest(authedRequest({}, 'GET'), {
      env: envFor(),
      fetch: fetcher,
    });
    expect(getResponse.status).toBe(405);

    const missingAuth = await handleHomeAccessInviteEmailRequest(new Request('https://servsync.app/functions/v1/send-home-access-invite-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_id: VALID_INVITE_ID }),
    }), {
      env: envFor(),
      fetch: fetcher,
    });
    expect(missingAuth.status).toBe(401);

    const invalidInvite = await handleHomeAccessInviteEmailRequest(authedRequest({ invite_id: 'not-a-uuid' }), {
      env: envFor(),
      fetch: fetcher,
    });
    expect(invalidInvite.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test('uses trusted prepare RPC data and returns generic disabled response without provider calls', async () => {
    const { calls, fetcher } = mockFetch(() => {
      return new Response(JSON.stringify(preparedPayload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await handleHomeAccessInviteEmailRequest(
      authedRequest({
        invite_id: VALID_INVITE_ID,
        invited_email: 'attacker@example.invalid',
        role: 'admin',
        address_line1: '123 Browser Supplied St',
      }),
      { env: envFor(), fetch: fetcher },
    );

    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body).toEqual({ ok: true, delivery_enabled: false });
    expect(JSON.stringify(body)).not.toContain('invitee@example.invalid');
    expect(JSON.stringify(body)).not.toContain('attacker@example.invalid');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/rest/v1/rpc/servsync_prepare_home_access_invite_delivery');
    expect(calls[0].body).toEqual({ p_invite_id: VALID_INVITE_ID });
  });

  test('builds email content only from sanitized delivery fields', () => {
    const email = buildHomeAccessInviteEmail({
      ...preparedPayload({
        role: 'member',
        inviter_display_label: 'Taylor Homeowner',
        home_display_label: 'Oak Cottage',
        city: 'Mobile',
        state: 'AL',
      }),
      address_line1: '123 Private Street',
      zip_code: '36602',
      service_requests: 'repair request',
      contractor_details: 'contractor data',
      financial_data: 'invoice total',
      storage_path: 'home-documents/private.pdf',
      home_history: 'private timeline',
    } as PreparedHomeAccessInviteDelivery);

    const rendered = `${email.subject}\n${email.text}\n${email.html}`;
    expect(rendered).toContain('ServSync Home Access invitation');
    expect(rendered).toContain('Taylor Homeowner');
    expect(rendered).toContain('Oak Cottage');
    expect(rendered).toContain('Mobile, AL');
    expect(rendered).toContain('member');
    expect(rendered).not.toContain('123 Private Street');
    expect(rendered).not.toContain('36602');
    expect(rendered).not.toContain('repair request');
    expect(rendered).not.toContain('contractor data');
    expect(rendered).not.toContain('invoice total');
    expect(rendered).not.toContain('home-documents/private.pdf');
    expect(rendered).not.toContain('private timeline');
  });

  test('does not call provider when enabled but internal result recording is not configured', async () => {
    const { calls, fetcher } = mockFetch((_, index) => {
      expect(index).toBe(0);
      return new Response(JSON.stringify(preparedPayload({ delivery_enabled: true, delivery_status: 'prepared' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await handleHomeAccessInviteEmailRequest(authedRequest({ invite_id: VALID_INVITE_ID }), {
      env: envFor({
        HOME_ACCESS_INVITE_EMAIL_ENABLED: 'true',
        RESEND_API_KEY: 'resend-test-key',
        EMAIL_FROM: 'ServSync <noreply@servsync.app>',
        SUPABASE_SERVICE_ROLE_KEY: '',
      }),
      fetch: fetcher,
    });

    expect(response.status).toBe(503);
    expect(await responseJson(response)).toEqual({
      ok: false,
      delivery_enabled: true,
      status: 'unable_to_send',
    });
    expect(calls).toHaveLength(1);
  });

  test('records sent result through service-role RPC after mocked provider success', async () => {
    const { calls, fetcher } = mockFetch((call, index) => {
      if (index === 0) {
        return new Response(JSON.stringify(preparedPayload({ delivery_enabled: true, delivery_status: 'prepared' })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (index === 1) {
        expect(call.url).toBe('https://api.resend.com/emails');
        expect(call.body?.to).toEqual(['invitee@example.invalid']);
        expect(String(call.body?.html)).not.toContain('address_line1');
        expect(String(call.body?.html)).not.toContain('zip_code');
        return new Response(JSON.stringify({ id: 'resend-message-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await handleHomeAccessInviteEmailRequest(authedRequest({ invite_id: VALID_INVITE_ID }), {
      env: envFor({
        HOME_ACCESS_INVITE_EMAIL_ENABLED: 'true',
        RESEND_API_KEY: 'resend-test-key',
        EMAIL_FROM: 'ServSync <noreply@servsync.app>',
      }),
      fetch: fetcher,
    });

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      ok: true,
      delivery_enabled: true,
      status: 'request_accepted',
    });
    expect(calls).toHaveLength(3);
    expect(calls[2].url).toContain('/rest/v1/rpc/servsync_record_home_access_invite_delivery_result');
    expect(calls[2].body).toEqual({
      p_invite_id: VALID_INVITE_ID,
      p_delivery_status: 'sent',
      p_provider_message_id: 'resend-message-123',
      p_error_code: null,
    });
  });

  test('records safe failure code and keeps provider errors out of browser response', async () => {
    const { calls, fetcher } = mockFetch((call, index) => {
      if (index === 0) {
        return new Response(JSON.stringify(preparedPayload({ delivery_enabled: true, delivery_status: 'prepared' })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (index === 1) {
        expect(call.url).toBe('https://api.resend.com/emails');
        return new Response(JSON.stringify({ message: 'raw provider failure with secret-ish details' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await handleHomeAccessInviteEmailRequest(authedRequest({ invite_id: VALID_INVITE_ID }), {
      env: envFor({
        HOME_ACCESS_INVITE_EMAIL_ENABLED: 'true',
        RESEND_API_KEY: 'resend-test-key',
        EMAIL_FROM: 'ServSync <noreply@servsync.app>',
      }),
      fetch: fetcher,
    });

    expect(response.status).toBe(502);
    const body = await responseJson(response);
    expect(body).toEqual({
      ok: false,
      delivery_enabled: true,
      status: 'unable_to_send',
    });
    expect(JSON.stringify(body)).not.toContain('raw provider failure');
    expect(calls).toHaveLength(3);
    expect(calls[2].body).toEqual({
      p_invite_id: VALID_INVITE_ID,
      p_delivery_status: 'failed',
      p_provider_message_id: null,
      p_error_code: 'provider_unavailable',
    });
  });
});
