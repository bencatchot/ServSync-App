#!/usr/bin/env node

import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceError, canonicalStringify, compareStrings, safeError, sha256, utcNow } from './internal.mjs';

const DETECTORS = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, 'reject'],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, 'reject'],
  ['bearer_token', /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i, 'reject'],
  ['authorization_header', /\bauthorization\s*[:=]/i, 'reject'],
  ['cookie', /\b(?:set-cookie|cookie)\s*:/i, 'reject'],
  ['password', /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i, 'reject'],
  ['api_key', /\b(?:api[_-]?key|anon[_-]?key|service[_-]?role|bypass[_-]?(?:secret|value))\s*[:=]\s*\S+/i, 'reject'],
  ['database_url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)?:?\/\/[^\s]+/i, 'reject'],
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, 'reject'],
  ['phone', /(?:^|\s)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?:\s|$)/, 'reject'],
  ['uuid', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'reject'],
  ['street_address', /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,40}\s(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|court|ct)\b/i, 'reject'],
  ['private_note', /\b(?:private[_ -]?note|customer description|estimate description|invoice description|job description|request description)\b/i, 'reject'],
  ['document_reference', /\b(?:photo|document|attachment)[_ -]?(?:url|path|name|reference)\b/i, 'reject'],
];

const SAFE_STATUS = new Set([
  'ok', 'passed', 'failed', 'complete', 'completed', 'committed', 'rolled_back', 'ready', 'denied',
  'true', 'false', 'none', 'empty', 'clean', 'sanitized', 'started', 'finished', 'expected', 'observed',
]);
const SAFE_KEYS = new Set([
  'status', 'result', 'count', 'affected_rows', 'exit_code', 'transaction', 'retry_count', 'timestamp',
  'started_at', 'completed_at', 'sha256', 'fingerprint', 'category', 'classification', 'marker', 'code',
]);
const JSON_KEYS = new Set([
  ...SAFE_KEYS, 'schema_version', 'operation_id', 'stage_id', 'event_id', 'sequence', 'expected_result',
  'observed_result', 'result_classification', 'command_category', 'target_classification', 'artifact_class',
]);

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

export function scanSensitiveContent(input) {
  const text = String(input).normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const findings = [];
  for (const [classification, pattern, disposition] of DETECTORS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
    if (matches) findings.push({ classification, count: matches.length, disposition });
  }
  const candidates = text.match(/[A-Za-z0-9_+/.=-]{32,}/g) ?? [];
  const suspicious = candidates.filter((candidate) => {
    if (/^[a-f0-9]{64}$/i.test(candidate)) return false;
    if (/^[A-Z][A-Z0-9_]{2,63}$/.test(candidate)) return false;
    return entropyBitsPerCharacter(candidate) >= 4.2;
  });
  if (suspicious.length > 0) findings.push({ classification: 'high_entropy_value', count: suspicious.length, disposition: 'reject' });
  return findings.sort((left, right) => compareStrings(left.classification, right.classification));
}

export function scanCustomerContent(input, { approvedSyntheticMarkers = [] } = {}) {
  let text = String(input).normalize('NFC');
  for (const marker of approvedSyntheticMarkers) {
    if (!/^SYNTHETIC-[A-Z0-9-]{1,80}$/.test(marker)) throw new EvidenceError('INVALID_SYNTHETIC_MARKER', 'Synthetic marker approval is invalid.');
    text = text.replaceAll(marker, '<approved-synthetic-marker>');
  }
  const findings = scanSensitiveContent(text).filter(({ classification }) =>
    ['email', 'phone', 'uuid', 'street_address', 'private_note', 'document_reference'].includes(classification));
  if (/\b(?:customer|homeowner|resident|client)\s+(?:name|details?|contents?)\s*[:=]/i.test(text)) {
    findings.push({ classification: 'customer_identity_or_content', count: 1, disposition: 'reject' });
  }
  if (/\btest\b.{0,40}\b(?:street|customer|homeowner|private note|description)\b/i.test(text)) {
    findings.push({ classification: 'test_label_not_sufficient', count: 1, disposition: 'reject' });
  }
  return findings.sort((left, right) => compareStrings(left.classification, right.classification));
}

function isSafeScalar(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean' || value === null) return true;
  if (typeof value !== 'string') return false;
  return SAFE_STATUS.has(value) || /^\d+$/.test(value) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    /^[a-f0-9]{64}$/.test(value) || /^[a-f0-9]{8}\u2026$/.test(value) || /^SYNTHETIC-[A-Z0-9-]{1,80}$/.test(value) ||
    /^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/.test(value);
}

function validateStructuredValue(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateStructuredValue(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!JSON_KEYS.has(key)) throw new EvidenceError('UNKNOWN_STRUCTURED_FIELD', `Structured output contains an unknown field at ${path}.`);
      validateStructuredValue(child, `${path}.${key}`);
    }
    return;
  }
  if (!isSafeScalar(value)) throw new EvidenceError('UNSAFE_STRUCTURED_VALUE', `Structured output contains an unsafe value at ${path}.`);
}

function sanitizeLines(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line === '') continue;
    if (SAFE_STATUS.has(line)) continue;
    const match = line.match(/^([a-z_][a-z0-9_]*?)=(.*)$/i);
    if (!match || !SAFE_KEYS.has(match[1]) || !isSafeScalar(match[2])) {
      throw new EvidenceError('UNRESTRICTED_OUTPUT', 'Plain output contains a non-allowlisted line.');
    }
  }
  return lines.join('\n');
}

export function sanitizeContent(input, { mode = 'lines', approvedSyntheticMarkers = [] } = {}) {
  const normalized = String(input).normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const secretFindings = scanSensitiveContent(normalized);
  const customerFindings = scanCustomerContent(normalized, { approvedSyntheticMarkers });
  const findings = [...secretFindings, ...customerFindings]
    .filter((finding, index, all) => all.findIndex((candidate) => candidate.classification === finding.classification) === index)
    .sort((left, right) => compareStrings(left.classification, right.classification));
  if (findings.length > 0) {
    const error = new EvidenceError('SANITIZATION_REJECTED', 'Output failed the default-deny sanitization policy.');
    error.findings = findings;
    throw error;
  }

  let output;
  if (mode === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(normalized);
    } catch {
      throw new EvidenceError('MALFORMED_JSON', 'JSON sanitization requires valid JSON.');
    }
    validateStructuredValue(parsed);
    output = `${canonicalStringify(parsed)}\n`;
  } else if (mode === 'lines') {
    output = sanitizeLines(normalized);
  } else {
    throw new EvidenceError('INVALID_SANITIZE_MODE', 'Unknown sanitization mode.');
  }
  return {
    output,
    summary: {
      schema_version: 'servsync-controlled-ops/sanitization-v1',
      passed: true,
      mode,
      input_sha256: sha256(normalized),
      output_sha256: sha256(output),
      finding_counts: {},
    },
  };
}

function parseCli(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new EvidenceError('INVALID_ARGUMENTS', 'Sanitizer arguments are invalid.');
    options[key.slice(2)] = value;
  }
  return options;
}

function main() {
  const options = parseCli(process.argv.slice(2));
  if (!options.input || !options.output || !options.summary) throw new EvidenceError('INVALID_ARGUMENTS', 'Input, output, and summary paths are required.');
  const result = sanitizeContent(readFileSync(options.input, 'utf8'), { mode: options.mode ?? 'lines' });
  writeFileSync(options.output, result.output, { mode: 0o600, flag: 'wx' });
  chmodSync(options.output, 0o600);
  writeFileSync(options.summary, `${canonicalStringify({ ...result.summary, sanitized_at: utcNow() })}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(options.summary, 0o600);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    const safe = safeError(error);
    process.stderr.write(`${basename(process.argv[1])}: ${safe.code}: ${safe.message}\n`);
    process.exitCode = 92;
  }
}
