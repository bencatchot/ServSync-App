#!/usr/bin/env node

import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EvidenceError, LIMITS, assertExactObject, canonicalStringify, compareStrings, safeError, sha256,
  utcNow, validateRelativePath, validateTimestamp,
} from './internal.mjs';

export const SANITIZER_SCHEMA = 'servsync-controlled-ops/sanitization-v2';
export const SANITIZER_VERSION = '2.0.0';

const DETECTORS = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['bearer_token', /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/i],
  ['authorization_header', /\bauthorization\s*[:=]/i],
  ['cookie', /\b(?:set-cookie|cookie)\s*[:=]/i],
  ['password', /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i],
  ['api_key', /\b(?:api[_-]?key|anon[_-]?key|service[_-]?role|bypass[_-]?(?:secret|value)|token)\s*[:=]\s*\S+/i],
  ['database_url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)?:?\/\/[^\s]+/i],
  ['uri_credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i],
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['phone', /(?:^|\s)(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?:\s|$)/],
  ['uuid', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['street_address', /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,40}\s(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|court|ct)(?:\s+(?:apt|unit|suite)\s*\w+)?\b/i],
  ['private_note', /\b(?:private[_ -]?note|customer description|estimate description|invoice description|job description|request description)\b/i],
  ['document_reference', /\b(?:photo|document|attachment)[_ -]?(?:url|path|name|reference)\b/i],
];

const SAFE_ENUMS = Object.freeze({
  status: new Set(['ok', 'passed', 'failed', 'completed', 'committed', 'rolled_back', 'ready', 'denied', 'clean', 'sanitized', 'started', 'interrupted']),
  result: new Set(['expected', 'observed', 'passed', 'failed', 'completed', 'denied', 'clean']),
  transaction: new Set(['committed', 'rolled_back']),
  classification: new Set(['passed', 'command_failed', 'harness_failed', 'sanitizer_failed', 'interrupted', 'capture_setup_failure', 'limit_exceeded']),
});
const INTEGER_FIELDS = new Set(['count', 'affected_rows', 'exit_code', 'retry_count']);
const TIMESTAMP_FIELDS = new Set(['timestamp', 'started_at', 'completed_at']);
const ALLOWED_FIELDS = new Set([...Object.keys(SAFE_ENUMS), ...INTEGER_FIELDS, ...TIMESTAMP_FIELDS, 'identifier_prefix']);

function entropyBitsPerCharacter(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function normalizeInput(input, maximumBytes = LIMITS.artifact_bytes) {
  const normalized = String(input).normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  if (Buffer.byteLength(normalized) > maximumBytes) throw new EvidenceError('INPUT_SIZE_LIMIT', 'Sanitizer input exceeds its configured size limit.');
  for (const line of normalized.split('\n')) if (Buffer.byteLength(line) > LIMITS.line_bytes) throw new EvidenceError('LINE_SIZE_LIMIT', 'Sanitizer input contains an oversized line.');
  return normalized;
}

export function scanSensitiveContent(input, { includeEntropy = true } = {}) {
  const text = normalizeInput(input);
  const findings = [];
  for (const [classification, pattern] of DETECTORS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
    if (matches) findings.push({ classification, count: matches.length, disposition: 'reject' });
  }
  if (includeEntropy) {
    const candidates = text.match(/[A-Za-z0-9_+/.=-]{24,}/g) ?? [];
    const suspicious = candidates.filter((candidate) => !/^[a-f0-9]{64}$/i.test(candidate) && !/^[A-Z][A-Z0-9_]{2,63}$/.test(candidate) && entropyBitsPerCharacter(candidate) >= 4.0);
    if (suspicious.length > 0) findings.push({ classification: 'high_entropy_value', count: suspicious.length, disposition: 'reject' });
  }
  return findings.sort((left, right) => compareStrings(left.classification, right.classification));
}

export function scanCustomerContent(input, { approvedSyntheticMarkers = [] } = {}) {
  let text = normalizeInput(input);
  for (const marker of approvedSyntheticMarkers) {
    if (!/^SYNTHETIC-[A-Z0-9-]{1,80}$/.test(marker)) throw new EvidenceError('INVALID_SYNTHETIC_MARKER', 'Synthetic marker approval is invalid.');
    text = text.replaceAll(marker, '<approved-synthetic-marker>');
  }
  const findings = scanSensitiveContent(text).filter(({ classification }) =>
    ['email', 'phone', 'uuid', 'street_address', 'private_note', 'document_reference'].includes(classification));
  if (/\b(?:customer|homeowner|resident|client)\s+(?:name|details?|contents?)\s*[:=]/i.test(text)) findings.push({ classification: 'customer_identity_or_content', count: 1, disposition: 'reject' });
  if (/\btest\b.{0,40}\b(?:street|customer|homeowner|private note|description)\b/i.test(text)) findings.push({ classification: 'test_label_not_sufficient', count: 1, disposition: 'reject' });
  return findings.sort((left, right) => compareStrings(left.classification, right.classification));
}

class StrictJsonParser {
  constructor(text) { this.text = text; this.index = 0; }
  error() { throw new EvidenceError('MALFORMED_JSON', 'JSON sanitization requires canonical duplicate-free JSON.'); }
  whitespace() { while (/\s/.test(this.text[this.index] ?? '')) this.index += 1; }
  parse() { this.whitespace(); const value = this.value(0); this.whitespace(); if (this.index !== this.text.length) this.error(); return value; }
  value(depth) {
    if (depth > LIMITS.json_depth) throw new EvidenceError('JSON_DEPTH_LIMIT', 'JSON nesting exceeds its configured limit.');
    const char = this.text[this.index];
    if (char === '{') return this.object(depth + 1);
    if (char === '[') return this.array(depth + 1);
    if (char === '"') return this.string();
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]]) if (this.text.startsWith(literal, this.index)) { this.index += literal.length; return value; }
    const match = this.text.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) this.error();
    this.index += match[0].length; const value = Number(match[0]); if (!Number.isFinite(value)) this.error(); return value;
  }
  string() {
    const start = this.index; this.index += 1; let escaped = false;
    while (this.index < this.text.length) {
      const char = this.text[this.index];
      if (!escaped && char === '"') { this.index += 1; try { return JSON.parse(this.text.slice(start, this.index)); } catch { this.error(); } }
      if (!escaped && char.charCodeAt(0) < 0x20) this.error();
      if (escaped && char === 'u' && !/^[0-9a-fA-F]{4}$/.test(this.text.slice(this.index + 1, this.index + 5))) this.error();
      escaped = !escaped && char === '\\'; if (char !== '\\') escaped = false; this.index += 1;
    }
    this.error();
  }
  object(depth) {
    this.index += 1; this.whitespace(); const output = {}; const keys = new Set(); let count = 0;
    if (this.text[this.index] === '}') { this.index += 1; return output; }
    while (true) {
      if (this.text[this.index] !== '"') this.error(); const key = this.string();
      if (keys.has(key)) throw new EvidenceError('DUPLICATE_JSON_KEY', 'JSON contains a duplicate object key.');
      keys.add(key); count += 1; if (count > LIMITS.json_object_fields) throw new EvidenceError('JSON_FIELD_LIMIT', 'JSON object field count exceeds its configured limit.');
      this.whitespace(); if (this.text[this.index] !== ':') this.error(); this.index += 1; this.whitespace(); output[key] = this.value(depth); this.whitespace();
      if (this.text[this.index] === '}') { this.index += 1; return output; }
      if (this.text[this.index] !== ',') this.error(); this.index += 1; this.whitespace();
    }
  }
  array(depth) {
    this.index += 1; this.whitespace(); const output = [];
    if (this.text[this.index] === ']') { this.index += 1; return output; }
    while (true) {
      if (output.length >= LIMITS.json_array_items) throw new EvidenceError('JSON_ARRAY_LIMIT', 'JSON array length exceeds its configured limit.');
      output.push(this.value(depth)); this.whitespace();
      if (this.text[this.index] === ']') { this.index += 1; return output; }
      if (this.text[this.index] !== ',') this.error(); this.index += 1; this.whitespace();
    }
  }
}

export function parseStrictJson(input) {
  const normalized = normalizeInput(input, LIMITS.json_input_bytes);
  return new StrictJsonParser(normalized).parse();
}

function validateField(key, value) {
  if (!ALLOWED_FIELDS.has(key)) throw new EvidenceError('UNKNOWN_STRUCTURED_FIELD', 'Structured output contains an unknown field.');
  if (SAFE_ENUMS[key]) {
    if (typeof value !== 'string' || !SAFE_ENUMS[key].has(value)) throw new EvidenceError('UNSAFE_STRUCTURED_VALUE', 'Structured output contains a non-enumerated value.');
  } else if (INTEGER_FIELDS.has(key)) {
    if (!Number.isInteger(value) || value < 0 || (key === 'exit_code' && value > 255)) throw new EvidenceError('UNSAFE_STRUCTURED_VALUE', 'Structured output contains an invalid integer.');
  } else if (TIMESTAMP_FIELDS.has(key)) validateTimestamp(value, key);
  else if (key === 'identifier_prefix' && (typeof value !== 'string' || !/^[a-f0-9]{8}$/.test(value))) throw new EvidenceError('UNSAFE_STRUCTURED_VALUE', 'Identifier prefix must be exactly eight lowercase hexadecimal characters.');
}

function sanitizeLines(text) {
  const output = [];
  for (const line of text.split('\n')) {
    if (line === '') { output.push(line); continue; }
    if (SAFE_ENUMS.status.has(line)) { output.push(line); continue; }
    const match = line.match(/^([a-z_][a-z0-9_]*)=(.*)$/);
    if (!match) throw new EvidenceError('UNRESTRICTED_OUTPUT', 'Plain output contains a non-allowlisted line.');
    const key = match[1]; let value = match[2];
    if (INTEGER_FIELDS.has(key)) {
      if (!/^\d+$/.test(value)) throw new EvidenceError('UNSAFE_STRUCTURED_VALUE', 'Plain output contains an invalid integer.');
      value = Number.parseInt(value, 10);
    }
    validateField(key, value); output.push(`${key}=${match[2]}`);
  }
  return output.join('\n');
}

function validateStrictObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EvidenceError('UNSAFE_STRUCTURED_VALUE', 'Structured output must be one flat object.');
  for (const [key, child] of Object.entries(value)) validateField(key, child);
}

export function sanitizeContent(input, { mode = 'lines', approvedSyntheticMarkers = [] } = {}) {
  const normalized = normalizeInput(input);
  const findings = [...scanSensitiveContent(normalized), ...scanCustomerContent(normalized, { approvedSyntheticMarkers })]
    .filter((finding, index, all) => all.findIndex((candidate) => candidate.classification === finding.classification) === index)
    .sort((left, right) => compareStrings(left.classification, right.classification));
  if (findings.length > 0) {
    const error = new EvidenceError('SANITIZATION_REJECTED', 'Output failed the default-deny sanitization policy.'); error.findings = findings; throw error;
  }
  let output;
  if (mode === 'json') {
    const parsed = parseStrictJson(normalized); validateStrictObject(parsed);
    output = `${canonicalStringify(parsed)}\n`;
    if (normalized !== output && normalized !== output.slice(0, -1)) throw new EvidenceError('NONCANONICAL_JSON', 'Structured output is not canonically serialized.');
  } else if (mode === 'lines') output = sanitizeLines(normalized);
  else throw new EvidenceError('INVALID_SANITIZE_MODE', 'Unknown sanitization mode.');
  return { output, finding_counts: {} };
}

export function createSanitizationSummary({ mode, artifactPath, output, generatedAt = utcNow() }) {
  validateRelativePath(artifactPath, 'artifact path'); validateTimestamp(generatedAt, 'sanitization timestamp');
  const base = {
    schema_version: SANITIZER_SCHEMA, scanner_version: SANITIZER_VERSION, mode, artifact_path: artifactPath,
    artifact_sha256: sha256(output), byte_length: Buffer.byteLength(output), secret_scan: 'passed', customer_content_scan: 'passed', finding_counts: {},
  };
  return { ...base, summary_hash: sha256(canonicalStringify(base)), generated_utc: generatedAt };
}

export function verifySanitizationSummary(summary, { artifactPath, output }) {
  assertExactObject(summary, [
    'schema_version', 'scanner_version', 'mode', 'artifact_path', 'artifact_sha256', 'byte_length', 'secret_scan',
    'customer_content_scan', 'finding_counts', 'summary_hash', 'generated_utc',
  ], [], 'sanitization summary');
  if (summary.schema_version !== SANITIZER_SCHEMA || summary.scanner_version !== SANITIZER_VERSION || !['lines', 'json'].includes(summary.mode)) throw new EvidenceError('INVALID_SANITIZATION_SUMMARY', 'Sanitization summary version or mode is invalid.');
  validateTimestamp(summary.generated_utc, 'sanitization timestamp');
  const base = { ...summary }; delete base.summary_hash; delete base.generated_utc;
  if (summary.artifact_path !== artifactPath || summary.artifact_sha256 !== sha256(output) || summary.byte_length !== Buffer.byteLength(output) || summary.secret_scan !== 'passed' || summary.customer_content_scan !== 'passed' || Object.keys(summary.finding_counts).length !== 0 || summary.summary_hash !== sha256(canonicalStringify(base))) {
    throw new EvidenceError('SANITIZATION_SUMMARY_MISMATCH', 'Sanitization summary is not bound to the retained artifact.');
  }
  const rescanned = sanitizeContent(output, { mode: summary.mode });
  if (rescanned.output !== output) throw new EvidenceError('SANITIZATION_SUMMARY_MISMATCH', 'Retained artifact does not satisfy its recorded sanitizer policy.');
  return true;
}

export function createFingerprintRecord(sourceArtifact, sourceBytes) {
  const source = validateRelativePath(sourceArtifact, 'fingerprint source');
  return { schema_version: 'servsync-controlled-ops/fingerprint-v1', algorithm: 'sha256', source_artifact: source, source_sha256: sha256(sourceBytes), generated_by: SANITIZER_VERSION };
}

export function verifyFingerprintRecord(record, sourceBytes) {
  assertExactObject(record, ['schema_version', 'algorithm', 'source_artifact', 'source_sha256', 'generated_by'], [], 'fingerprint record');
  return record.schema_version === 'servsync-controlled-ops/fingerprint-v1' && record.algorithm === 'sha256' && record.generated_by === SANITIZER_VERSION && record.source_sha256 === sha256(sourceBytes);
}

function parseCli(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index]; const value = arguments_[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new EvidenceError('INVALID_ARGUMENTS', 'Sanitizer arguments are invalid.');
    options[key.slice(2)] = value;
  }
  return options;
}

function main() {
  const options = parseCli(process.argv.slice(2));
  if (!options.input || !options.output || !options.summary || !options['artifact-path']) throw new EvidenceError('INVALID_ARGUMENTS', 'Input, output, summary, and artifact path are required.');
  if (statSync(options.input).size > LIMITS.json_input_bytes) throw new EvidenceError('INPUT_SIZE_LIMIT', 'Sanitizer input exceeds its configured size limit.');
  const result = sanitizeContent(readFileSync(options.input, 'utf8'), { mode: options.mode ?? 'lines' });
  writeFileSync(options.output, result.output, { mode: 0o600, flag: 'wx' }); chmodSync(options.output, 0o600);
  const summary = createSanitizationSummary({ mode: options.mode ?? 'lines', artifactPath: options['artifact-path'], output: result.output });
  writeFileSync(options.summary, `${canonicalStringify(summary)}\n`, { mode: 0o600, flag: 'wx' }); chmodSync(options.summary, 0o600);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (error) { const safe = safeError(error); process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`); process.exitCode = 92; }
}
