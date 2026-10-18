import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAPTURE_APP, CAPTURE_API, READ_RPCS, parseCaptureArgs, captureRequestDecision, installCaptureGuard, assertCaptureRecord } from '../../scripts/demo/recorder/capture-only-policy.mjs';

const requestId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const args = ['--role=homeowner', `--request-id=${requestId}`, `--appointment-id=${appointmentId}`, '--fictional-demo-confirmed'];
const decide = (path, method = 'GET', body, phase = 'capture') => captureRequestDecision({ url: CAPTURE_API + path, method, body }, phase);

test('capture-only accepts exact existing records, rejects arbitrary origins and credential options', () => {
  assert.equal(parseCaptureArgs(args).requestId, requestId);
  for (const option of ['--url=https://servsync.app', '--password=secret', '--storage-state=existing.json', '--seed', '--role=contractor']) {
    assert.throws(() => parseCaptureArgs([...args, option]));
  }
  assert.throws(() => parseCaptureArgs(args.slice(0, -1)));
  assert.throws(() => parseCaptureArgs([...args, '--login-timeout-seconds=86400']));
});

test('all data writes, provider endpoints and unreviewed RPCs fail closed', () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.equal(decide('/rest/v1/service_requests', method).allow, false);
  for (const name of ['servsync_create_service_request', 'servsync_accept_service_request_appointment_window', 'servsync_mark_workflow_thread_read', 'servsync_send_workflow_message', 'servsync_list_invented_write']) {
    for (const method of ['POST', 'GET', 'HEAD']) assert.equal(decide(`/rest/v1/rpc/${name}`, method, '{}').allow, false);
  }
  for (const path of ['/functions/v1/anything', '/storage/v1/object/sign/private/a', '/auth/v1/signup', '/auth/v1/recover', '/auth/v1/admin/users']) {
    for (const method of ['GET', 'POST']) assert.equal(decide(path, method).allow, false);
  }
});

test('queries are GET/HEAD only; reviewed RPC POST becomes GET with scalar arguments', () => {
  assert.equal(decide('/rest/v1/service_requests?select=id').allow, true);
  for (const rpc of READ_RPCS) {
    const result = decide(`/rest/v1/rpc/${rpc}`, 'POST', '{}');
    assert.equal(result.allow, true); assert.equal(result.method, 'GET'); assert.equal(result.postData, '');
  }
  const result = decide('/rest/v1/rpc/servsync_current_contractor_entitlements', 'POST', JSON.stringify({ p_contractor_id: requestId }));
  assert.equal(new URL(result.url).searchParams.get('p_contractor_id'), requestId);
  for (const body of ['[]', 'null', '{', '{"p_ids":[1]}', '{"p_id":null}', '{"arbitrary":"x"}']) {
    assert.equal(decide('/rest/v1/rpc/servsync_current_contractor_entitlements', 'POST', body).allow, false);
  }
});

test('login is separated from capture; account creation/recovery and capture token writes blocked', () => {
  assert.equal(decide('/auth/v1/token?grant_type=password', 'POST', '{}', 'login').allow, true);
  assert.equal(decide('/auth/v1/token?grant_type=refresh_token', 'POST', '{}', 'login').allow, true);
  assert.equal(decide('/auth/v1/token?grant_type=password', 'POST').allow, false);
  assert.equal(decide('/auth/v1/token?grant_type=pkce', 'POST', '{}', 'login').allow, false);
  assert.equal(decide('/auth/v1/user', 'PUT', '{}', 'login').allow, false);
});

test('navigation, deceptive hosts, file playback, external traffic and app APIs are blocked', () => {
  for (const url of ['file:///tmp/movie.mp4', 'http://127.0.0.1:8000', 'https://servsync.app/', CAPTURE_APP + '.evil.test/', 'https://evil.test/', 'https://user:password@servsync-demo.vercel.app/']) {
    assert.equal(captureRequestDecision({ url, method: 'GET' }).allow, false);
  }
  assert.equal(captureRequestDecision({ url: CAPTURE_API + '/rest/v1/service_requests', method: 'GET', navigation: true }).allow, false);
  assert.equal(captureRequestDecision({ url: CAPTURE_APP + '/api/write', method: 'GET' }).allow, false);
  assert.equal(captureRequestDecision({ url: CAPTURE_APP + '/#/homeowner', method: 'GET', navigation: true }).allow, true);
});

test('guard aborts denied requests before forwarding and strips POST entity headers', async () => {
  let handler, websocketHandler;
  const context = { route: async (_glob, callback) => { handler = callback; }, routeWebSocket: async (_glob, callback) => { websocketHandler = callback; }, on() {} };
  const counters = await installCaptureGuard(context);
  let forwarded = 0, aborted = 0, override;
  const route = (url, method, body) => ({ request: () => ({ url: () => url, method: () => method, postData: () => body, isNavigationRequest: () => false, headers: () => ({ 'content-type': 'application/json', 'content-length': '2', authorization: 'test-only-placeholder' }) }), abort: async () => aborted++, fallback: async value => { forwarded++; override = value; } });
  await handler(route(CAPTURE_API + '/rest/v1/service_requests', 'POST', '{}'));
  assert.equal(aborted, 1); assert.equal(forwarded, 0);
  await handler(route(CAPTURE_API + '/rest/v1/rpc/servsync_homeowner_service_requests', 'POST', '{}'));
  assert.equal(forwarded, 1); assert.equal(override.method, 'GET'); assert.equal(override.headers['content-length'], undefined);
  assert.equal(override.headers.authorization, 'test-only-placeholder');
  let closed = false; websocketHandler({ close() { closed = true; } }); assert.equal(closed, true);
  assert.equal(JSON.stringify(counters).includes('placeholder'), false);
});

test('proof requires exact fictional request and confirmed appointment lineage', () => {
  const options = parseCaptureArgs(args);
  const record = { id: requestId, description: 'Fictional Demo test only', appointment: { id: appointmentId, status: 'confirmed' } };
  assert.equal(assertCaptureRecord([record], options), record);
  assert.throws(() => assertCaptureRecord([{ ...record, description: 'Real customer request' }], options));
  assert.throws(() => assertCaptureRecord([{ ...record, appointment: { id: appointmentId, status: 'proposed' } }], options));
  assert.throws(() => assertCaptureRecord([{ ...record, id: appointmentId }], options));
});

test('capture entrypoint stays separate from seeding, credential files, persistent sessions and playback', async () => {
  const source = await readFile(new URL('../../scripts/demo/capture-existing-demo.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['seed-demo-scenario', 'runDemoCommand', 'loadKnownLocalEnv', 'launchPersistentContext', 'connectOverCDP', 'getDisplayMedia', 'getUserMedia', 'DEMO_HOMEOWNER_PASSWORD', 'file://']) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /recordVideo: \{ dir: staging, size: CAPTURE_VIEWPORT \}/);
  assert.match(source, /storageState\(\)/);
  assert.doesNotMatch(source, /storageState\(\{\s*path/);
});
