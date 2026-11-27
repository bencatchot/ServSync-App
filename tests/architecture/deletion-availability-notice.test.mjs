import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const notice = readFileSync(new URL('../../src/features/privacy/DeletionAvailabilityNotice.tsx', import.meta.url), 'utf8');

test('deletion notice distinguishes the iOS receipt path from web and signed-out help', () => {
  assert.match(notice, /iPhone or iPad app.*Privacy &amp; Data → Delete my account.*request reference/);
  assert.match(notice, /on the web.*Privacy &amp; Data Requests.*Open Support Request/);
  assert.match(notice, /cannot sign in.*mailto:support@servsync\.app/);
  assert.doesNotMatch(notice, /not available yet|aren.t available yet/i);
});
