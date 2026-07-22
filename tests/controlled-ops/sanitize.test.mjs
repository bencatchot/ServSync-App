import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeContent, scanCustomerContent, scanSensitiveContent } from '../../scripts/controlled-ops/sanitize.mjs';

test('allowlisted line and strict JSON output sanitize deterministically', () => {
  const lines = sanitizeContent('status=ok\r\ncount=1\r\n');
  assert.equal(lines.output, 'status=ok\ncount=1\n');
  const json = sanitizeContent('{"count":1,"status":"ok"}', { mode: 'json' });
  assert.equal(json.output, '{"count":1,"status":"ok"}\n');
  assert.throws(() => sanitizeContent('{"unknown":"ok"}', { mode: 'json' }), /unknown field/i);
  assert.throws(() => sanitizeContent('{"status":', { mode: 'json' }), /valid JSON/i);
});

test('secret classes and high-entropy values are rejected without retaining matches', () => {
  const samples = [
    `authorization: Bearer ${['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0In0', 'signature-value'].join('.')}`,
    'password=correct-horse-battery-staple',
    'api_key=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
    ['postgresql:', '', 'operator:secret@database.example.invalid/app'].join('/'),
    'value=Kj7mQp9xV2nL4sR8tY6uI3oP5aD1fG0hJ9kLmN2b',
  ];
  for (const sample of samples) {
    assert.throws(() => sanitizeContent(sample), (error) => error.code === 'SANITIZATION_REJECTED' && !error.message.includes(sample));
  }
  assert.ok(scanSensitiveContent(samples.join('\n')).length >= samples.length);
});

test('customer content rejects email, phone, UUID, address, notes, and test-label bypasses', () => {
  const samples = [
    'person@example.test',
    '312-555-0199',
    '123e4567-e89b-12d3-a456-426614174000',
    '123 Test Street',
    'private note: do not share',
    'test customer details: Example Person',
  ];
  for (const sample of samples) assert.ok(scanCustomerContent(sample).length > 0, sample);
});

test('synthetic markers require explicit approval and exact syntax', () => {
  const marker = 'SYNTHETIC-CONTROLLED-OPS-1';
  assert.equal(scanCustomerContent(marker, { approvedSyntheticMarkers: [marker] }).length, 0);
  assert.throws(() => scanCustomerContent('test person', { approvedSyntheticMarkers: ['test person'] }), /invalid/i);
});

test('SHA-256 fingerprints and safe prefixes are permitted', () => {
  const fingerprint = 'a'.repeat(64);
  assert.equal(sanitizeContent(`sha256=${fingerprint}\nfingerprint=deadbeef…\n`).summary.passed, true);
});
