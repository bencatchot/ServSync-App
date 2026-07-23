import { relative } from 'node:path';
import {
  BROWSER_LIMITS,
  attemptIdFor,
  decodeUtf8,
  scanBrowserString,
  testIdFor,
  validateBrowserLoopbackUrl,
  validateBrowserSafeLabel,
  validateGeneratedBrowserId,
  validateNullableInteger,
  validateProject,
} from './browser-schema.mjs';
import {
  EvidenceError,
  assertExactObject,
  canonicalStringify,
  utcNow,
  validateRelativePath,
  validateTimestamp,
} from './internal.mjs';
import { parseStrictJson, scanCustomerContent, scanSensitiveContent } from './sanitize.mjs';

export const BROWSER_OBSERVABILITY_SCHEMA = 'servsync-controlled-ops/browser-observability-v1';
export const BROWSER_OBSERVABILITY_ATTACHMENT_NAME = 'controlled-ops-browser-observability-v1';
export const BROWSER_OBSERVABILITY_MIME_TYPE = 'application/vnd.servsync.controlled-ops.browser-observability+json';

export const COMPLETENESS_STATES = Object.freeze([
  'complete',
  'incomplete_over_limit',
  'incomplete_collector_error',
  'incomplete_late_events',
  'incomplete_missing_attachment',
  'incomplete_invalid_attachment',
]);

export const COLLECTOR_FAILURE_CLASSES = Object.freeze([
  'none',
  'listener_install',
  'listener_callback',
  'sanitizer',
  'attachment',
  'lifecycle',
  'teardown',
  'unknown',
]);

export const CONSOLE_TYPES = Object.freeze(['log', 'info', 'warning', 'error', 'debug', 'trace', 'other']);
export const CONSOLE_SEVERITIES = Object.freeze(['debug', 'info', 'warning', 'error', 'other']);
export const SAFE_MESSAGE_CLASSES = Object.freeze(['synthetic_safe', 'unclassified']);
export const ERROR_KINDS = Object.freeze(['error', 'dom_exception', 'thrown_primitive', 'thrown_object', 'unknown']);
export const ORIGIN_CLASSES = Object.freeze(['exact_local_origin', 'rejected_external', 'invalid', 'non_http_special']);
export const ROUTE_CLASSES = Object.freeze(['root', 'submit', 'health', 'redirect', 'redirect_target', 'static_asset', 'unknown_static', 'unknown_dynamic']);
export const METHOD_CLASSES = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']);
export const STATUS_CLASSES = Object.freeze(['1xx', '2xx', '3xx', '4xx', '5xx', 'no_response']);
export const FAILURE_CLASSES = Object.freeze(['blocked_by_policy', 'aborted', 'connection', 'timeout', 'other', 'unknown']);
export const RESOURCE_TYPES = Object.freeze(['document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other']);
export const REJECTED_EGRESS_CLASSES = Object.freeze(['invalid', 'rejected_external', 'alternate_port', 'websocket', 'worker', 'other']);

const ENVELOPE_FIELDS = [
  'schema_version',
  'run_id',
  'test_id',
  'attempt_id',
  'worker_index',
  'retry_index',
  'safe_label',
  'spec_path',
  'collection_started_utc',
  'collection_completed_utc',
  'console_aggregate',
  'page_error_aggregate',
  'network_aggregate',
];

const CONSOLE_AGGREGATE_FIELDS = [
  'total_count',
  'type_counts',
  'severity_counts',
  'safe_message_class_counts',
  'rejected_sensitive_count',
  'rejected_customer_content_count',
  'invalid_event_count',
  'overflow_count',
  'late_event_count',
  'listener_error_count',
  'first_observed_utc',
  'last_observed_utc',
  'completeness_status',
  'collector_failure_class',
];

const PAGE_ERROR_AGGREGATE_FIELDS = [
  'total_count',
  'error_kind_counts',
  'safe_message_class_counts',
  'stack_present_count',
  'origin_class_counts',
  'duplicate_count',
  'rejected_sensitive_count',
  'rejected_customer_content_count',
  'invalid_event_count',
  'overflow_count',
  'late_event_count',
  'listener_error_count',
  'first_observed_utc',
  'last_observed_utc',
  'completeness_status',
  'collector_failure_class',
];

const NETWORK_AGGREGATE_FIELDS = [
  'total_requests',
  'method_class_counts',
  'origin_class_counts',
  'route_class_counts',
  'resource_type_counts',
  'navigation_count',
  'subresource_count',
  'status_class_counts',
  'failure_class_counts',
  'redirect_count',
  'rejected_egress_class_counts',
  'websocket_attempt_count',
  'worker_attempt_count',
  'overflow_count',
  'late_event_count',
  'listener_error_count',
  'completeness_status',
  'collector_failure_class',
];

function zeroCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function increment(counts, key) {
  if (!Object.hasOwn(counts, key)) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', 'Browser observability counter key is invalid.');
  counts[key] += 1;
}

function scanText(value) {
  const sensitive = scanSensitiveContent(value);
  const customer = scanCustomerContent(value);
  return { sensitive: sensitive.length > 0, customer: customer.length > 0 };
}

function safeObservedTime(aggregate) {
  const now = utcNow();
  if (aggregate.first_observed_utc === null) aggregate.first_observed_utc = now;
  aggregate.last_observed_utc = now;
}

function boundedText(value, { allowLineBreaks = false } = {}) {
  if (typeof value !== 'string') return { valid: false, value: '' };
  const controlPattern = allowLineBreaks ? /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/u : /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
  if (value.normalize('NFC') !== value || controlPattern.test(value) || Buffer.byteLength(value) > 2048) {
    return { valid: false, value: '' };
  }
  return { valid: true, value };
}

function safeMessageClass(value) {
  if (value === 'controlled-ops-synthetic-console' || value === 'controlled-ops-synthetic-page-error') return 'synthetic_safe';
  return 'unclassified';
}

function consoleType(type) {
  if (type === 'warn' || type === 'warning') return 'warning';
  if (CONSOLE_TYPES.includes(type)) return type;
  return 'other';
}

function consoleSeverity(type) {
  if (type === 'error' || type === 'trace') return 'error';
  if (type === 'warn' || type === 'warning') return 'warning';
  if (type === 'debug') return 'debug';
  if (type === 'log' || type === 'info') return 'info';
  return 'other';
}

function errorKind(error) {
  if (error instanceof Error) {
    if (error.name === 'DOMException') return 'dom_exception';
    return 'error';
  }
  if (['string', 'number', 'boolean', 'bigint', 'symbol'].includes(typeof error) || error === null) return 'thrown_primitive';
  if (typeof error === 'object') return 'thrown_object';
  return 'unknown';
}

function readErrorField(error, field) {
  try {
    const value = error?.[field];
    return typeof value === 'string' ? boundedText(value, { allowLineBreaks: field === 'stack' }) : { valid: true, value: '' };
  } catch {
    return { valid: false, value: '' };
  }
}

export function classifySafeBrowserUrl(rawUrl, baseURL) {
  if (typeof rawUrl !== 'string') return { origin_class: 'invalid', route_class: 'unknown_dynamic' };
  if (/^(?:data|blob|about|file|ws|wss):/i.test(rawUrl)) return { origin_class: 'non_http_special', route_class: 'unknown_dynamic' };
  let target;
  let allowed;
  try {
    validateBrowserLoopbackUrl(rawUrl, { fieldName: 'browser observed URL', allowPath: true });
    target = new URL(rawUrl);
    allowed = new URL(baseURL);
  } catch {
    return { origin_class: 'invalid', route_class: 'unknown_dynamic' };
  }
  if (target.protocol !== 'http:' || target.hostname !== allowed.hostname || target.port !== allowed.port || target.username || target.password || target.hash) {
    return { origin_class: 'rejected_external', route_class: 'unknown_dynamic' };
  }
  return { origin_class: 'exact_local_origin', route_class: classifyRoutePath(target.pathname) };
}

function classifyRoutePath(pathname) {
  if (pathname === '/') return 'root';
  if (pathname === '/submit') return 'submit';
  if (pathname === '/health') return 'health';
  if (pathname === '/redirect') return 'redirect';
  if (pathname === '/redirect-target') return 'redirect_target';
  if (/^\/static\/[a-z0-9-]+\.(?:css|js|txt)$/u.test(pathname)) return 'static_asset';
  if (/\b[0-9a-f]{8,}\b/iu.test(pathname) || /\d{3,}/u.test(pathname) || /@/u.test(pathname)) return 'unknown_dynamic';
  return pathname.includes('.') ? 'unknown_static' : 'unknown_dynamic';
}

function methodClass(method) {
  const upper = typeof method === 'string' ? method.toUpperCase() : 'OTHER';
  return METHOD_CLASSES.includes(upper) ? upper : 'OTHER';
}

function resourceTypeClass(type) {
  return RESOURCE_TYPES.includes(type) ? type : 'other';
}

function statusClass(status) {
  if (!Number.isInteger(status)) return 'no_response';
  if (status >= 100 && status <= 199) return '1xx';
  if (status >= 200 && status <= 299) return '2xx';
  if (status >= 300 && status <= 399) return '3xx';
  if (status >= 400 && status <= 499) return '4xx';
  if (status >= 500 && status <= 599) return '5xx';
  return 'no_response';
}

function failureClass(failure) {
  const text = typeof failure?.errorText === 'string' ? failure.errorText.toLowerCase() : '';
  if (text.includes('blocked')) return 'blocked_by_policy';
  if (text.includes('abort')) return 'aborted';
  if (text.includes('timeout')) return 'timeout';
  if (text.includes('conn') || text.includes('reset') || text.includes('refused')) return 'connection';
  return text ? 'other' : 'unknown';
}

function createConsoleAggregate() {
  return {
    total_count: 0,
    type_counts: zeroCounts(CONSOLE_TYPES),
    severity_counts: zeroCounts(CONSOLE_SEVERITIES),
    safe_message_class_counts: zeroCounts(SAFE_MESSAGE_CLASSES),
    rejected_sensitive_count: 0,
    rejected_customer_content_count: 0,
    invalid_event_count: 0,
    overflow_count: 0,
    late_event_count: 0,
    listener_error_count: 0,
    first_observed_utc: null,
    last_observed_utc: null,
    completeness_status: 'complete',
    collector_failure_class: 'none',
  };
}

function createPageErrorAggregate() {
  return {
    total_count: 0,
    error_kind_counts: zeroCounts(ERROR_KINDS),
    safe_message_class_counts: zeroCounts(SAFE_MESSAGE_CLASSES),
    stack_present_count: 0,
    origin_class_counts: zeroCounts(['local_page', 'unknown']),
    duplicate_count: 0,
    rejected_sensitive_count: 0,
    rejected_customer_content_count: 0,
    invalid_event_count: 0,
    overflow_count: 0,
    late_event_count: 0,
    listener_error_count: 0,
    first_observed_utc: null,
    last_observed_utc: null,
    completeness_status: 'complete',
    collector_failure_class: 'none',
  };
}

function createNetworkAggregate() {
  return {
    total_requests: 0,
    method_class_counts: zeroCounts(METHOD_CLASSES),
    origin_class_counts: zeroCounts(ORIGIN_CLASSES),
    route_class_counts: zeroCounts(ROUTE_CLASSES),
    resource_type_counts: zeroCounts(RESOURCE_TYPES),
    navigation_count: 0,
    subresource_count: 0,
    status_class_counts: zeroCounts(STATUS_CLASSES),
    failure_class_counts: zeroCounts(FAILURE_CLASSES),
    redirect_count: 0,
    rejected_egress_class_counts: zeroCounts(REJECTED_EGRESS_CLASSES),
    websocket_attempt_count: 0,
    worker_attempt_count: 0,
    overflow_count: 0,
    late_event_count: 0,
    listener_error_count: 0,
    completeness_status: 'complete',
    collector_failure_class: 'none',
  };
}

export function createEmptyBrowserObservabilityAggregates() {
  return {
    console_aggregate: createConsoleAggregate(),
    page_error_aggregate: createPageErrorAggregate(),
    network_aggregate: createNetworkAggregate(),
  };
}

function markOverflow(aggregate) {
  aggregate.overflow_count += 1;
  aggregate.completeness_status = 'incomplete_over_limit';
}

function markLate(aggregate) {
  aggregate.late_event_count += 1;
  if (aggregate.completeness_status === 'complete') aggregate.completeness_status = 'incomplete_late_events';
}

function markCallbackFailure(aggregate) {
  aggregate.listener_error_count += 1;
  aggregate.completeness_status = 'incomplete_collector_error';
  aggregate.collector_failure_class = 'listener_callback';
}

export function createBrowserObservabilityState({ runId, testInfo, baseURL }) {
  const specPath = validateRelativePath(relative(process.cwd(), testInfo.file).split('\\').join('/'), 'browser spec path');
  const safeLabel = validateBrowserSafeLabel(testInfo.title, 'browser test title');
  const workerIndex = testInfo.workerIndex ?? 0;
  const retryIndex = testInfo.retry ?? 0;
  const testId = testIdFor({ specPath, project: 'chromium', safeLabel });
  const attemptId = attemptIdFor({ testId, retryIndex, workerIndex });
  return {
    runId: validateGeneratedBrowserId(runId, 'browser run ID'),
    testId,
    attemptId,
    workerIndex,
    retryIndex,
    safeLabel,
    specPath,
    baseURL,
    startedUtc: utcNow(),
    finalized: false,
    pages: new Set(),
    disposers: [],
    seenErrors: new Set(),
    console: createConsoleAggregate(),
    pageError: createPageErrorAggregate(),
    network: createNetworkAggregate(),
  };
}

export function observeBrowserPage(state, page) {
  if (state.finalized || state.pages.has(page)) return;
  state.pages.add(page);
  const onConsole = (message) => observeConsoleEvent(state, message);
  const onPageError = (error) => observePageErrorEvent(state, error);
  const onRequest = (request) => observeRequestEvent(state, request);
  const onResponse = (response) => observeResponseEvent(state, response);
  const onRequestFailed = (request) => observeRequestFailedEvent(state, request);
  const onWebSocket = () => {
    if (state.finalized) return markLate(state.network);
    state.network.websocket_attempt_count += 1;
  };
  const onWorker = () => {
    if (state.finalized) return markLate(state.network);
    state.network.worker_attempt_count += 1;
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  page.on('websocket', onWebSocket);
  page.on('worker', onWorker);
  state.disposers.push(() => {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
    page.off('websocket', onWebSocket);
    page.off('worker', onWorker);
  });
}

export function observeConsoleEvent(state, message) {
  if (state.finalized) return markLate(state.console);
  try {
    if (state.console.total_count >= BROWSER_LIMITS.console_events_per_attempt) return markOverflow(state.console);
    const type = consoleType(typeof message.type === 'function' ? message.type() : message.type);
    const text = boundedText(typeof message.text === 'function' ? message.text() : '');
    state.console.total_count += 1;
    safeObservedTime(state.console);
    increment(state.console.type_counts, type);
    increment(state.console.severity_counts, consoleSeverity(type));
    if (!text.valid) {
      state.console.invalid_event_count += 1;
      increment(state.console.safe_message_class_counts, 'unclassified');
      return;
    }
    const scan = scanText(text.value);
    if (scan.sensitive) state.console.rejected_sensitive_count += 1;
    if (scan.customer) state.console.rejected_customer_content_count += 1;
    if (scan.sensitive || scan.customer) return;
    increment(state.console.safe_message_class_counts, safeMessageClass(text.value));
  } catch {
    markCallbackFailure(state.console);
  }
}

export function observePageErrorEvent(state, error) {
  if (state.finalized) return markLate(state.pageError);
  try {
    if (state.pageError.total_count >= BROWSER_LIMITS.page_errors_per_attempt) return markOverflow(state.pageError);
    const kind = errorKind(error);
    const name = readErrorField(error, 'name');
    const message = readErrorField(error, 'message');
    const stack = readErrorField(error, 'stack');
    state.pageError.total_count += 1;
    safeObservedTime(state.pageError);
    increment(state.pageError.error_kind_counts, kind);
    increment(state.pageError.origin_class_counts, 'local_page');
    if (!name.valid || !message.valid || !stack.valid) {
      state.pageError.invalid_event_count += 1;
      increment(state.pageError.safe_message_class_counts, 'unclassified');
      return;
    }
    if (stack.value) state.pageError.stack_present_count += 1;
    const combined = `${name.value}\n${message.value}\n${stack.value}`;
    const scan = scanText(combined);
    if (scan.sensitive) state.pageError.rejected_sensitive_count += 1;
    if (scan.customer) state.pageError.rejected_customer_content_count += 1;
    if (scan.sensitive || scan.customer) return;
    const messageClass = safeMessageClass(message.value);
    increment(state.pageError.safe_message_class_counts, messageClass);
    const dedupeKey = `${kind}:${messageClass}:${stack.value ? 'stack' : 'nostack'}`;
    if (state.seenErrors.has(dedupeKey)) state.pageError.duplicate_count += 1;
    state.seenErrors.add(dedupeKey);
  } catch {
    markCallbackFailure(state.pageError);
  }
}

export function observeRequestEvent(state, request) {
  if (state.finalized) return markLate(state.network);
  try {
    if (state.network.total_requests >= BROWSER_LIMITS.network_requests_per_attempt) return markOverflow(state.network);
    const url = typeof request.url === 'function' ? request.url() : '';
    const { origin_class: originClass, route_class: routeClass } = classifySafeBrowserUrl(url, state.baseURL);
    state.network.total_requests += 1;
    increment(state.network.origin_class_counts, originClass);
    increment(state.network.route_class_counts, routeClass);
    increment(state.network.method_class_counts, methodClass(typeof request.method === 'function' ? request.method() : 'OTHER'));
    increment(state.network.resource_type_counts, resourceTypeClass(typeof request.resourceType === 'function' ? request.resourceType() : 'other'));
    if (typeof request.isNavigationRequest === 'function' && request.isNavigationRequest()) state.network.navigation_count += 1;
    else state.network.subresource_count += 1;
    if (typeof request.redirectedFrom === 'function' && request.redirectedFrom()) state.network.redirect_count += 1;
  } catch {
    markCallbackFailure(state.network);
  }
}

export function observeResponseEvent(state, response) {
  if (state.finalized) return markLate(state.network);
  try {
    increment(state.network.status_class_counts, statusClass(typeof response.status === 'function' ? response.status() : null));
  } catch {
    markCallbackFailure(state.network);
  }
}

export function observeRequestFailedEvent(state, request) {
  if (state.finalized) return markLate(state.network);
  try {
    increment(state.network.status_class_counts, 'no_response');
    increment(state.network.failure_class_counts, failureClass(typeof request.failure === 'function' ? request.failure() : null));
  } catch {
    markCallbackFailure(state.network);
  }
}

export function applyEgressDecisionCounts(state, decisionCounts = {}) {
  for (const key of REJECTED_EGRESS_CLASSES) {
    const value = decisionCounts[key] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > BROWSER_LIMITS.network_requests_per_attempt) {
      throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', 'Browser egress decision count is invalid.');
    }
    state.network.rejected_egress_class_counts[key] += value;
  }
}

export function finalizeBrowserObservability(state) {
  for (const dispose of state.disposers.splice(0)) {
    try { dispose(); } catch { state.console.listener_error_count += 1; state.console.completeness_status = 'incomplete_collector_error'; state.console.collector_failure_class = 'teardown'; }
  }
  state.finalized = true;
  const envelope = {
    schema_version: BROWSER_OBSERVABILITY_SCHEMA,
    run_id: state.runId,
    test_id: state.testId,
    attempt_id: state.attemptId,
    worker_index: state.workerIndex,
    retry_index: state.retryIndex,
    safe_label: state.safeLabel,
    spec_path: state.specPath,
    collection_started_utc: state.startedUtc,
    collection_completed_utc: utcNow(),
    console_aggregate: state.console,
    page_error_aggregate: state.pageError,
    network_aggregate: state.network,
  };
  const validated = validateBrowserObservabilityEnvelope(envelope);
  const content = `${canonicalStringify(validated)}\n`;
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length > BROWSER_LIMITS.aggregate_attachment_bytes) {
    throw new EvidenceError('BROWSER_OBSERVABILITY_LIMIT', 'Browser observability attachment exceeds its byte limit.');
  }
  return bytes;
}

function validateCounterMap(value, keys, fieldName, { total = null, max = BROWSER_LIMITS.network_requests_per_attempt } = {}) {
  assertExactObject(value, keys, [], fieldName);
  let sum = 0;
  for (const count of Object.values(value)) {
    if (!Number.isInteger(count) || count < 0 || count > max) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', `${fieldName} contains an invalid count.`);
    sum += count;
  }
  if (total !== null && sum !== total) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', `${fieldName} does not reconcile.`);
  return sum;
}

function validateCommonAggregate(aggregate, fields, fieldName) {
  assertExactObject(aggregate, fields, [], fieldName);
  validateNullableInteger(aggregate.rejected_sensitive_count ?? 0, `${fieldName} rejected sensitive`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.rejected_customer_content_count ?? 0, `${fieldName} rejected customer`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.invalid_event_count ?? 0, `${fieldName} invalid`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.overflow_count, `${fieldName} overflow`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.late_event_count, `${fieldName} late`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.listener_error_count, `${fieldName} listener`, { max: BROWSER_LIMITS.network_requests_per_attempt });
  if (aggregate.first_observed_utc != null) validateTimestamp(aggregate.first_observed_utc, `${fieldName} first observed`);
  if (aggregate.last_observed_utc != null) validateTimestamp(aggregate.last_observed_utc, `${fieldName} last observed`);
  if (aggregate.first_observed_utc != null && aggregate.last_observed_utc != null && Date.parse(aggregate.last_observed_utc) < Date.parse(aggregate.first_observed_utc)) {
    throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', `${fieldName} timestamps regress.`);
  }
  if (!COMPLETENESS_STATES.includes(aggregate.completeness_status)) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', `${fieldName} completeness is invalid.`);
  if (!COLLECTOR_FAILURE_CLASSES.includes(aggregate.collector_failure_class)) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', `${fieldName} failure class is invalid.`);
}

export function validateConsoleAggregate(aggregate) {
  validateCommonAggregate(aggregate, CONSOLE_AGGREGATE_FIELDS, 'browser console aggregate');
  validateNullableInteger(aggregate.total_count, 'browser console total', { max: BROWSER_LIMITS.console_events_per_attempt });
  validateCounterMap(aggregate.type_counts, CONSOLE_TYPES, 'browser console type counts', { total: aggregate.total_count, max: BROWSER_LIMITS.console_events_per_attempt });
  validateCounterMap(aggregate.severity_counts, CONSOLE_SEVERITIES, 'browser console severity counts', { total: aggregate.total_count, max: BROWSER_LIMITS.console_events_per_attempt });
  validateCounterMap(aggregate.safe_message_class_counts, SAFE_MESSAGE_CLASSES, 'browser console message class counts', { max: BROWSER_LIMITS.console_events_per_attempt });
  return aggregate;
}

export function validatePageErrorAggregate(aggregate) {
  validateCommonAggregate(aggregate, PAGE_ERROR_AGGREGATE_FIELDS, 'browser page error aggregate');
  validateNullableInteger(aggregate.total_count, 'browser page error total', { max: BROWSER_LIMITS.page_errors_per_attempt });
  validateCounterMap(aggregate.error_kind_counts, ERROR_KINDS, 'browser page error kind counts', { total: aggregate.total_count, max: BROWSER_LIMITS.page_errors_per_attempt });
  validateCounterMap(aggregate.safe_message_class_counts, SAFE_MESSAGE_CLASSES, 'browser page error message class counts', { max: BROWSER_LIMITS.page_errors_per_attempt });
  validateCounterMap(aggregate.origin_class_counts, ['local_page', 'unknown'], 'browser page error origin counts', { total: aggregate.total_count, max: BROWSER_LIMITS.page_errors_per_attempt });
  validateNullableInteger(aggregate.stack_present_count, 'browser page error stack count', { max: BROWSER_LIMITS.page_errors_per_attempt });
  validateNullableInteger(aggregate.duplicate_count, 'browser page error duplicate count', { max: BROWSER_LIMITS.page_errors_per_attempt });
  return aggregate;
}

export function validateNetworkAggregate(aggregate) {
  validateCommonAggregate(aggregate, NETWORK_AGGREGATE_FIELDS, 'browser network aggregate');
  validateNullableInteger(aggregate.total_requests, 'browser network total', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.method_class_counts, METHOD_CLASSES, 'browser network method counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.origin_class_counts, ORIGIN_CLASSES, 'browser network origin counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.route_class_counts, ROUTE_CLASSES, 'browser network route counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.resource_type_counts, RESOURCE_TYPES, 'browser network resource counts', { total: aggregate.total_requests, max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.navigation_count, 'browser network navigation count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.subresource_count, 'browser network subresource count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  if (aggregate.navigation_count + aggregate.subresource_count !== aggregate.total_requests) throw new EvidenceError('BROWSER_OBSERVABILITY_COUNT_MISMATCH', 'Browser network navigation counts do not reconcile.');
  validateCounterMap(aggregate.status_class_counts, STATUS_CLASSES, 'browser network status counts', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.failure_class_counts, FAILURE_CLASSES, 'browser network failure counts', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateCounterMap(aggregate.rejected_egress_class_counts, REJECTED_EGRESS_CLASSES, 'browser network rejected egress counts', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.redirect_count, 'browser network redirect count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.websocket_attempt_count, 'browser network websocket count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  validateNullableInteger(aggregate.worker_attempt_count, 'browser network worker count', { max: BROWSER_LIMITS.network_requests_per_attempt });
  return aggregate;
}

export function validateBrowserObservabilityEnvelope(envelope) {
  assertExactObject(envelope, ENVELOPE_FIELDS, [], 'browser observability envelope');
  if (envelope.schema_version !== BROWSER_OBSERVABILITY_SCHEMA) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', 'Browser observability schema is invalid.');
  validateGeneratedBrowserId(envelope.run_id, 'browser observability run ID');
  validateGeneratedBrowserId(envelope.test_id, 'browser observability test ID');
  validateGeneratedBrowserId(envelope.attempt_id, 'browser observability attempt ID');
  validateProject('chromium');
  validateNullableInteger(envelope.worker_index, 'browser observability worker index', { min: 0, max: 0 });
  validateNullableInteger(envelope.retry_index, 'browser observability retry index', { min: 0, max: BROWSER_LIMITS.retry_index_max });
  validateBrowserSafeLabel(envelope.safe_label, 'browser observability safe label');
  validateRelativePath(envelope.spec_path, 'browser observability spec path');
  if (envelope.test_id !== testIdFor({ specPath: envelope.spec_path, project: 'chromium', safeLabel: envelope.safe_label })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser observability test ID is invalid.');
  if (envelope.attempt_id !== attemptIdFor({ testId: envelope.test_id, retryIndex: envelope.retry_index, workerIndex: envelope.worker_index })) throw new EvidenceError('BROWSER_ID_MISMATCH', 'Browser observability attempt ID is invalid.');
  validateTimestamp(envelope.collection_started_utc, 'browser observability start');
  validateTimestamp(envelope.collection_completed_utc, 'browser observability completion');
  if (Date.parse(envelope.collection_completed_utc) < Date.parse(envelope.collection_started_utc)) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', 'Browser observability timestamps regress.');
  for (const value of [envelope.safe_label, envelope.spec_path, envelope.schema_version]) scanBrowserString(value, 'browser observability retained string');
  validateConsoleAggregate(envelope.console_aggregate);
  validatePageErrorAggregate(envelope.page_error_aggregate);
  validateNetworkAggregate(envelope.network_aggregate);
  return envelope;
}

export function parseBrowserObservabilityAttachment(body) {
  if (!Buffer.isBuffer(body)) throw new EvidenceError('INVALID_BROWSER_OBSERVABILITY', 'Browser observability attachment must be body-backed.');
  if (body.length > BROWSER_LIMITS.aggregate_attachment_bytes) throw new EvidenceError('BROWSER_OBSERVABILITY_LIMIT', 'Browser observability attachment exceeds its byte limit.');
  const content = decodeUtf8(body);
  if (!content.endsWith('\n')) throw new EvidenceError('BROWSER_OBSERVABILITY_NONCANONICAL', 'Browser observability attachment must end with a newline.');
  const parsed = parseStrictJson(content.slice(0, -1));
  if (content !== `${canonicalStringify(parsed)}\n`) throw new EvidenceError('BROWSER_OBSERVABILITY_NONCANONICAL', 'Browser observability attachment is not canonical JSON.');
  return validateBrowserObservabilityEnvelope(parsed);
}
