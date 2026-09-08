import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpenInvoice } from '../../src/features/invoices/recordStatus.ts';
import { createPreparationSession, DraftPreparationError } from '../../src/features/marketing/preparationSession.ts';
import { hasCaptionVerificationIssue, publicationReviewUrl } from '../../src/features/marketing/publicationOutcome.ts';
import type { MarketingPublication } from '../../src/features/marketing/marketingPublishing.ts';

test('invoice counts distinguish every billing lifecycle status', () => {
  for (const status of ['sent', 'viewed', 'overdue', 'partially_paid'] as const) assert.equal(isOpenInvoice({ status }), true);
  for (const status of ['draft', 'paid', 'void'] as const) assert.equal(isOpenInvoice({ status }), false);
});

test('uncertain draft preparation reuses upload and exact request identity', async () => {
  const session = createPreparationSession(); const source = {}; let uploads = 0;
  const ids: string[] = [];
  const acquire = async () => { uploads++; return 'asset-1'; };
  const generate = async (asset: string | null, id: string) => {
    assert.equal(asset, 'asset-1'); ids.push(id);
    if (ids.length === 1) throw new Error('connection interrupted');
    return 'content-1';
  };
  await assert.rejects(session.prepare(source, 'A brief', acquire, generate));
  assert.equal(await session.prepare(source, 'A brief', acquire, generate), 'content-1');
  assert.equal(await session.prepare(source, 'A brief', acquire, generate), 'content-1');
  assert.equal(uploads, 1); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
});

test('confirmed no-post failure allows a fresh request while preserving the asset', async () => {
  const session = createPreparationSession(); const source = {}; const ids: string[] = []; let uploads = 0;
  const acquire = async () => { uploads++; return 'asset-1'; };
  const generate = async (_asset: string | null, id: string) => {
    ids.push(id);
    if (ids.length === 1) throw new DraftPreparationError('No post created', true);
    return 'content-1';
  };
  await assert.rejects(session.prepare(source, 'A brief', acquire, generate));
  await session.prepare(source, 'A brief', acquire, generate);
  assert.equal(uploads, 1); assert.notEqual(ids[0], ids[1]);
});

test('different sources cannot replay another source content even with identical brief', async () => {
  const session = createPreparationSession(); const ids: string[] = [];
  const generate = async (_asset: string | null, id: string) => { ids.push(id); return id; };
  await session.prepare({}, 'A brief', async () => null, generate);
  await session.prepare({}, 'A brief', async () => null, generate);
  assert.notEqual(ids[0], ids[1]);
});

test('a failed upload can retry acquisition without registering an empty asset', async () => {
  const session = createPreparationSession(); const source = {};
  await assert.rejects(session.prepare(source, 'A brief', async () => { throw new Error('upload failed'); }, async () => 'unused'));
  assert.equal(session.hasAsset(source), false);
  assert.equal(await session.prepare(source, 'A brief', async () => 'asset-2', async asset => asset!), 'asset-2');
});

const publication = (overrides: Partial<MarketingPublication> = {}) => ({
  provider: 'facebook', status: 'failed', failureCategory: 'content_validation',
  providerPublicationId: '123456789', providerPermalink: null,
  failureMessage: 'Facebook did not preserve the exact approved public message.', ...overrides,
} as MarketingPublication);

test('caption review requires the specific post-upload evidence and never upgrades unknown failure', () => {
  assert.equal(hasCaptionVerificationIssue(publication()), true);
  assert.equal(hasCaptionVerificationIssue(publication({ providerPublicationId: null })), false);
  assert.equal(hasCaptionVerificationIssue(publication({ failureCategory: 'provider_uncertain' })), false);
  assert.equal(hasCaptionVerificationIssue(publication({ failureMessage: 'Some other validation error' })), false);
});

test('provider review links reject untrusted protocols and unrelated hosts', () => {
  assert.equal(publicationReviewUrl(publication()), 'https://www.facebook.com/123456789');
  assert.equal(publicationReviewUrl(publication({ providerPermalink: 'javascript:alert(1)', providerPublicationId: null })), null);
  assert.equal(publicationReviewUrl(publication({ providerPermalink: 'https://facebook.com.evil.test/', providerPublicationId: 'bad' })), null);
  assert.equal(publicationReviewUrl(publication({ providerPermalink: 'https://www.facebook.com/watch/?v=123456789' })), 'https://www.facebook.com/watch/?v=123456789');
});
