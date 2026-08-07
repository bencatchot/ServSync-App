import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  MAX_REPORT_PDF_BYTES,
  MAX_REPORT_REQUEST_BYTES,
  REQUEST_FREE_REPORT_RATE_LIMIT_ID,
  REQUEST_FREE_REPORT_SESSION_COOKIE,
  REQUEST_FREE_REPORT_SESSION_SECONDS,
  createRequestFreeFinalizedReportDeliveryHandler,
} from '../../api/request-free-finalized-report-delivery';
import {
  MAX_REPORT_EMAIL_REQUEST_BYTES,
  buildFinalizedReportDeliveryEmail,
  createSendFinalizedReportEmailHandler,
  type PreparedReportEmailDelivery,
  type ReportEmailAttempt,
} from '../../api/send-finalized-report-email';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const INSPECTION_ID = '11111111-1111-4111-8111-111111111111';
const LINK_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const STORAGE_ID = '44444444-4444-4444-8444-444444444444';
const VERSION_ID = '55555555-5555-4555-8555-555555555555';
const CONTRACTOR_ID = '66666666-6666-4666-8666-666666666666';
const TOKEN = 'a'.repeat(64);
const SESSION = 'b'.repeat(64);
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\nfixture report\n%%EOF');

function source(path: string) { return readFileSync(resolve(process.cwd(), path), 'utf8'); }
function between(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start); const endIndex = text.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0); expect(endIndex).toBeGreaterThan(startIndex);
  return text.slice(startIndex, endIndex);
}

const privateAccess = JSON.stringify({
  state: 'valid',
  report: {
    bucket_id: 'home-documents',
    storage_path: `contractor-field-work/${CONTRACTOR_ID}/${INSPECTION_ID}/77777777-7777-4777-8777-777777777777.pdf`,
    file_name: 'Fixture finalized report.pdf',
    storage_object_id: STORAGE_ID,
    storage_version: VERSION_ID,
    storage_etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
    storage_size_bytes: PDF_BYTES.byteLength,
  },
});

function gatewayFixture(options: { bootstrap?: string; session?: string; pdf?: Blob; rateLimited?: boolean; configurationError?: boolean } = {}) {
  const bootstrapCalls: Array<{ token: string; digest: string; previous: string | null }> = [];
  const sessionCalls: string[] = [];
  const downloadCalls: Array<{ bucket: string; path: string }> = [];
  return {
    bootstrapCalls, sessionCalls, downloadCalls,
    handler: createRequestFreeFinalizedReportDeliveryHandler({
      checkEntryRateLimit: async () => ({ rateLimited: options.rateLimited ?? false, configurationError: options.configurationError }),
      bootstrapReportSession: async (token, digest, previous) => { bootstrapCalls.push({ token, digest, previous }); return options.bootstrap ?? JSON.stringify({ state: 'invalid' }); },
      lookupReportSession: async digest => { sessionCalls.push(digest); return options.session ?? JSON.stringify({ state: 'unavailable' }); },
      downloadReport: async (bucket, path) => { downloadCalls.push({ bucket, path }); return options.pdf ?? new Blob([PDF_BYTES], { type: 'application/pdf' }); },
      generateSessionIdentifier: () => SESSION,
    }),
  };
}

function gatewayRequest(body: string, headers: HeadersInit = {}) {
  return new Request('https://servsync.example/api/request-free-finalized-report-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
}

function prepared(overrides: Partial<PreparedReportEmailDelivery> = {}): PreparedReportEmailDelivery {
  return {
    token: TOKEN, attempt_id: ATTEMPT_ID, delivery_link_id: LINK_ID, recipient_email: 'customer@example.com',
    expires_at: '2026-09-07T00:00:00.000Z', contractor_business_name: 'Fixture & Sons <Internal>',
    customer_display_name: 'Jamie Customer', report_title: 'Water heater inspection', property_label: '100 Test Street, Testville, IA', ...overrides,
  };
}

function attempt(overrides: Partial<ReportEmailAttempt> = {}): ReportEmailAttempt {
  return { id: ATTEMPT_ID, delivery_link_id: LINK_ID, recipient_email: 'customer@example.com', status: 'sent', attempted_at: '2026-08-07T12:00:00Z', sent_at: '2026-08-07T12:00:01Z', failed_at: null, failure_code: null, attempted_by_name: 'Fixture Owner', ...overrides };
}

function emailRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request('https://servsync.example/api/send-finalized-report-email', {
    method: 'POST', headers: { Authorization: 'Bearer caller-jwt', 'Content-Type': 'application/json', Origin: 'https://servsync.example', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function emailFixture(options: { provider?: { ok: true; id: string } | { ok: false; errorCode: 'provider_rejected' | 'provider_rate_limited' | 'provider_unavailable' }; recordFails?: boolean; configured?: boolean } = {}) {
  const prepareCalls: Array<Record<string, unknown>> = []; const messages: Array<Record<string, unknown>> = []; const recordCalls: Array<Record<string, unknown>> = [];
  return {
    prepareCalls, messages, recordCalls,
    handler: createSendFinalizedReportEmailHandler({
      configurationAvailable: () => options.configured ?? true,
      prepare: async (token, input) => { prepareCalls.push({ token, input }); return prepared(); },
      send: async message => { messages.push(message); return options.provider ?? { ok: true, id: 'resend-message-123' }; },
      record: async (attemptId, status, providerMessageId, failureCode) => {
        recordCalls.push({ attemptId, status, providerMessageId, failureCode });
        if (options.recordFails) throw new Error('record failed');
        return attempt({ status, sent_at: status === 'sent' ? '2026-08-07T12:00:01Z' : null, failed_at: status === 'failed' ? '2026-08-07T12:00:01Z' : null, failure_code: failureCode });
      },
      fromAddress: () => 'ServSync <noreply@servsync.app>', publicOrigin: () => 'https://servsync.example',
    }),
  };
}

test.describe('finalized report SQL and authorization boundary', () => {
  test('keeps all delivery state private and grants only the three narrow public RPCs', () => {
    const sql = source('servsync-finalized-report-external-email-delivery.sql');
    for (const table of ['finalized_report_delivery_links', 'finalized_report_delivery_sessions', 'finalized_report_delivery_rate_buckets', 'finalized_report_delivery_email_attempts']) {
      expect(sql).toContain(`alter table public.${table} force row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role;`);
    }
    expect(sql).toContain('grant execute on function public.servsync_list_finalized_report_delivery_links(uuid) to authenticated;');
    expect(sql).toContain('grant execute on function public.servsync_prepare_finalized_report_email_delivery(uuid, text, integer) to authenticated;');
    expect(sql).toContain('grant execute on function public.servsync_revoke_finalized_report_delivery_link(uuid) to authenticated;');
    expect(sql).toContain('grant execute on function public.servsync_bootstrap_finalized_report_delivery_session(text, text, text) to service_role;');
    expect(sql).not.toMatch(/grant execute on function public\.servsync_(?:bootstrap|lookup)_finalized_report_delivery_session[^;]+to (?:public|anon|authenticated)/i);
  });

  test('allows only Owner, active Admin, and active Office and derives every tenant binding', () => {
    const sql = source('servsync-finalized-report-external-email-delivery.sql');
    const role = between(sql, 'create function public.servsync_private_can_manage_finalized_report_delivery', 'create function public.servsync_private_current_report_delivery_contractor_id');
    const prepareSql = between(sql, 'create function public.servsync_prepare_finalized_report_email_delivery', 'create function public.servsync_revoke_finalized_report_delivery_link');
    expect(role).toContain('contractor.owner_user_id = auth.uid()'); expect(role).toContain("member.role in ('admin', 'office')"); expect(role).toContain("member.status = 'active'");
    expect(role).not.toMatch(/field_tech|viewer/);
    expect(prepareSql).not.toMatch(/p_contractor_id|p_local_contact_id|p_local_home_id|p_storage_path/);
    expect(prepareSql).toContain('servsync_private_current_report_delivery_contractor_id()');
  });

  test('binds one finalized local PDF fingerprint and revalidates lifecycle and storage drift on every access', () => {
    const sql = source('servsync-finalized-report-external-email-delivery.sql');
    for (const field of ['storage_object_id', 'storage_version', 'storage_etag', 'storage_size_bytes']) {
      expect(sql).toContain(`${field} is distinct from old.${field}`);
    }
    const state = between(sql, 'create function public.servsync_private_finalized_report_access_state', 'create function public.servsync_private_validate_finalized_report_delivery_link');
    for (const guard of ['v_inspection.status <> \'finalized\'', 'v_inspection.report_storage_path is distinct from p_link.storage_path', 'v_contact.claimed_at is not null', 'v_contact.archived_at is not null', 'v_home.home_id is not null', 'v_home.claimed_at is not null', 'v_home.archived_at is not null', "v_object.metadata ->> 'eTag'", "v_object.metadata ->> 'size'"]) expect(state).toContain(guard);
    expect(sql).not.toMatch(/insert into public\.(?:home_documents|notifications|home_maintenance_log)/i);
    expect(sql).not.toMatch(/update public\.inspections\s+set/i);
  });

  test('email history omits bearer, digest, path, storage fingerprint, and provider IDs', () => {
    const sql = source('servsync-finalized-report-external-email-delivery.sql');
    const metadata = between(sql, 'create function public.servsync_private_finalized_report_email_attempt_metadata', 'create function public.servsync_private_finalized_report_delivery_metadata');
    expect(metadata).toContain("'recipient_email'"); expect(metadata).toContain("'failure_code'");
    expect(metadata).not.toMatch(/provider_message_id|token_hash|storage_path|storage_etag|storage_version/);
  });
});

test.describe('request-free finalized report gateway', () => {
  test('accepts only strict POST JSON and stores only a digest-only 30-minute session', async () => {
    expect(MAX_REPORT_REQUEST_BYTES).toBe(1024); expect(MAX_REPORT_PDF_BYTES).toBe(20 * 1024 * 1024); expect(REQUEST_FREE_REPORT_RATE_LIMIT_ID).toBe('request-free-local-invoice-delivery');
    const fixture = gatewayFixture({ bootstrap: privateAccess });
    expect((await fixture.handler(new Request('https://servsync.example/api/request-free-finalized-report-delivery'))).status).toBe(405);
    for (const body of ['{', JSON.stringify({ token: 'bad' }), JSON.stringify({ token: TOKEN, extra: true }), JSON.stringify([])]) expect((await fixture.handler(gatewayRequest(body))).status).toBe(400);
    const response = await fixture.handler(gatewayRequest(JSON.stringify({ token: TOKEN })));
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('application/pdf');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${REQUEST_FREE_REPORT_SESSION_COOKIE}=${SESSION}`); expect(cookie).toContain(`Max-Age=${REQUEST_FREE_REPORT_SESSION_SECONDS}`); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).not.toContain(TOKEN);
    expect(fixture.bootstrapCalls[0]).toEqual({ token: TOKEN, digest: createHash('sha256').update(SESSION).digest('hex'), previous: null });
  });

  test('rejects malformed private payloads, storage replacement, oversized bytes, and non-PDF bytes', async () => {
    expect((await gatewayFixture({ bootstrap: JSON.stringify({ state: 'valid', report: { storage_path: 'foreign.pdf' } }) }).handler(gatewayRequest(JSON.stringify({ token: TOKEN })))).status).toBe(503);
    const replacement = gatewayFixture({ bootstrap: privateAccess, pdf: new Blob([PDF_BYTES, new Uint8Array([1])], { type: 'application/pdf' }) });
    expect((await replacement.handler(gatewayRequest(JSON.stringify({ token: TOKEN })))).headers.get('content-type')).toContain('application/json');
    const notPdfBytes = new Uint8Array(PDF_BYTES.byteLength); notPdfBytes.fill(120);
    const notPdf = gatewayFixture({ bootstrap: privateAccess, pdf: new Blob([notPdfBytes], { type: 'application/pdf' }) });
    expect((await notPdf.handler(gatewayRequest(JSON.stringify({ token: TOKEN })))).headers.get('content-type')).toContain('application/json');
  });

  test('fails closed for missing Firewall configuration and rate limiting', async () => {
    expect((await gatewayFixture({ configurationError: true }).handler(gatewayRequest('{}'))).status).toBe(503);
    expect((await gatewayFixture({ rateLimited: true }).handler(gatewayRequest('{}'))).status).toBe(429);
  });
});

test.describe('finalized report email handler', () => {
  const validBody = { inspection_id: INSPECTION_ID, recipient_email: ' Customer@Example.com ', expires_days: 30 };
  test('rejects cross-origin, unauthenticated, caller-supplied identity, oversized, and unconfigured requests', async () => {
    expect(MAX_REPORT_EMAIL_REQUEST_BYTES).toBe(2048);
    const fixture = emailFixture();
    expect((await fixture.handler(emailRequest(validBody, { Origin: 'https://attacker.example' }))).status).toBe(403);
    expect((await fixture.handler(emailRequest(validBody, { Authorization: '' }))).status).toBe(401);
    expect((await fixture.handler(emailRequest({ ...validBody, contractor_id: CONTRACTOR_ID }))).status).toBe(400);
    expect((await fixture.handler(emailRequest('x'.repeat(MAX_REPORT_EMAIL_REQUEST_BYTES + 1)))).status).toBe(413);
    expect((await emailFixture({ configured: false }).handler(emailRequest(validBody))).status).toBe(503);
    expect(fixture.prepareCalls).toHaveLength(0);
  });

  test('sends one escaped report link, records success, and never returns the bearer', async () => {
    const fixture = emailFixture(); const response = await fixture.handler(emailRequest(validBody)); const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200); expect(body.status).toBe('sent'); expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(fixture.prepareCalls).toEqual([{ token: 'caller-jwt', input: { inspection_id: INSPECTION_ID, recipient_email: 'customer@example.com', expires_days: 30 } }]);
    expect(fixture.messages[0].to).toEqual(['customer@example.com']); expect(String(fixture.messages[0].html)).toContain(`report-delivery?access=${TOKEN}`);
    expect(fixture.recordCalls).toEqual([{ attemptId: ATTEMPT_ID, status: 'sent', providerMessageId: 'resend-message-123', failureCode: null }]);
  });

  test('records provider failures without inventing success and exposes no provider payload', async () => {
    const fixture = emailFixture({ provider: { ok: false, errorCode: 'provider_rejected' } });
    const response = await fixture.handler(emailRequest(validBody)); const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(502); expect(body.status).toBe('failed'); expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(fixture.recordCalls[0]).toEqual({ attemptId: ATTEMPT_ID, status: 'failed', providerMessageId: null, failureCode: 'provider_rejected' });
    expect((await emailFixture({ recordFails: true }).handler(emailRequest(validBody))).status).toBe(503);
  });

  test('builds customer-safe branded content and preserves acknowledgment as out of scope', () => {
    const message = buildFinalizedReportDeliveryEmail(prepared({ contractor_business_name: 'Fixture & Sons <Internal>\r\nBcc: hidden@example.com' }), `https://servsync.example/#/report-delivery?access=${TOKEN}`, 'ServSync <noreply@servsync.app>');
    expect(message.subject).not.toMatch(/[\r\n]/); expect(message.html).toContain('View Report'); expect(message.html).toContain('Fixture &amp; Sons &lt;Internal&gt; Bcc: hidden@example.com');
    expect(message.text).toContain('does not acknowledge, approve, or sign'); expect(message.html).not.toMatch(/private notes|claim_token|invitation_token|customer history/i);
  });
});

test('contractor UI exposes report email only at the authorized finalized local report boundary', () => {
  const app = source('src/App.tsx'); const panel = source('src/features/reports/FinalizedReportDeliveryPanel.tsx'); const client = source('src/features/reports/finalizedReportDelivery.ts');
  expect(app).toContain('canManageFinalizedReportDelivery'); expect(app).toContain("activeInspection.status === 'finalized'"); expect(app).toContain('!activeInspection.homeowner_user_id');
  expect(panel).toContain('Editing it here does not change the Customer profile.'); expect(panel).toContain("busy === 'send' ? 'Sending...' :"); expect(panel).toContain('Each send rotates the secure link');
  expect(client).toContain("fetch('/api/send-finalized-report-email'"); expect(client).not.toMatch(/update\(['"]contractor_local_contacts|servsync_update_contractor_local_customer/i);
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`renders the document-scoped finalized PDF without overflow at ${viewport.name} size`, async ({ page }) => {
    const token = randomBytes(32).toString('hex'); const bodies: Array<Record<string, unknown>> = []; const consoleErrors: string[] = []; const failures: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); }); page.on('requestfailed', request => failures.push(request.url()));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/request-free-finalized-report-delivery', route => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': "inline; filename*=UTF-8''Fixture%20finalized%20report.pdf" }, body: Buffer.from(PDF_BYTES) });
    });
    await page.goto(`/#/report-delivery?access=${token}`);
    await expect(page.getByTestId('request-free-report-valid')).toBeVisible(); await expect(page.getByTestId('request-free-report-pdf')).toBeVisible();
    expect(page.url()).not.toContain(token); expect(bodies[0]).toEqual({ token });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(await page.evaluate(secret => ({ local: Object.values(localStorage).includes(secret), session: Object.values(sessionStorage).includes(secret), cookie: document.cookie.includes(secret), state: JSON.stringify(history.state).includes(secret) }), token)).toEqual({ local: false, session: false, cookie: false, state: false });
    expect(consoleErrors).toEqual([]);
    expect(failures.filter(url => !url.startsWith('blob:'))).toEqual([]);
  });
}
