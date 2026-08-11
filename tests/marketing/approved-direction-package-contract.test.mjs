import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadApprovedDirectionPackageContracts,
  validateApprovedDirectionPackage,
  validateApprovedDirectionPackageEnvelope,
} from '../../scripts/marketing/approved-direction-package-contract.mjs';

const roles = [
  ['contractor_benefit', 'small_contractors', 'social_post'],
  ['local_contractor_connection', 'homeowners', 'social_post'],
  ['feature_highlight', 'small_contractors', 'social_post'],
  ['homeowner_benefit', 'homeowners', 'social_post'],
  ['problem_solution_post', 'small_contractors', 'social_post'],
  ['short_video_concept', 'small_contractors', 'other'],
];

const directions = roles.map(([contentRole, audienceKey], index) => ({
  direction_id: `51000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  source_plan_id: '51000000-0000-4000-8000-000000000100',
  source_plan_revision: 3,
  source_plan_item_index: index + 1,
  audience_key: audienceKey,
  topic: ['Invoices', 'Contractor discovery and profiles', 'Deposits and manual payments', 'Home History', 'Jobs', 'Product demonstrations'][index],
  content_role: contentRole,
  truth_pack_version: 'servsync-marketing-truth-v3',
  direction_status: 'approved',
  revision_number: index % 2 === 0 ? 2 : 3,
}));

const source = {
  accepted_plan: {
    plan_id: '51000000-0000-4000-8000-000000000100',
    revision_number: 3,
    item_count: 6,
  },
  directions,
};

const validPackage = {
  preparation_request_id: '51000000-0000-4000-8000-000000000200',
  source_plan_id: source.accepted_plan.plan_id,
  source_plan_revision: 3,
  truth_pack_version: 'servsync-marketing-truth-v3',
  preparation_contract_key: 'approved_direction_plan_v1',
  items: directions.map((direction, index) => ({
    direction_id: direction.direction_id,
    direction_revision: direction.revision_number,
    title: [
      'The invoice should still make sense later',
      'Useful details before a homeowner connects',
      'Requesting a deposit stays deliberate',
      'A completed report when memory gets fuzzy',
      'Carry the agreed work into the job',
      'Demo: one request tied to one home',
    ][index],
    content_type: roles[index][2],
    body: `A specific public-facing story for approved Direction ${index + 1}, written in plain language with one bounded ServSync interaction.`,
    channel_category: 'social',
    intended_audience: direction.audience_key,
    content_role: direction.content_role,
  })),
};

test('approved-Direction package schema and six-item contract are exact', async () => {
  const [contracts, schema] = await Promise.all([
    loadApprovedDirectionPackageContracts(),
    readFile(new URL('../../config/marketing/codex-approved-direction-package.v1.schema.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const result = validateApprovedDirectionPackage(validPackage, contracts, source);
  assert.equal(validateApprovedDirectionPackageEnvelope(validPackage, contracts), true);
  assert.equal(result.items.length, 6);
  assert.equal(result.preparation_contract_key, 'approved_direction_plan_v1');
  assert.deepEqual(result.items.map(item => item.content_role), roles.map(role => role[0]));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.items.maxItems, 7);
});

test('draft, stale, wrong-Plan, missing, duplicate, and role-substituted Directions fail closed', async () => {
  const contracts = await loadApprovedDirectionPackageContracts();
  const cases = [
    { source: { ...source, directions: source.directions.map((item, index) => index === 0 ? { ...item, direction_status: 'draft' } : item) }, package: validPackage },
    { source, package: { ...validPackage, items: validPackage.items.map((item, index) => index === 0 ? { ...item, direction_revision: 1 } : item) } },
    { source, package: { ...validPackage, source_plan_id: '51000000-0000-4000-8000-000000000999' } },
    { source: { ...source, directions: source.directions.slice(0, 5) }, package: validPackage },
    { source, package: { ...validPackage, items: validPackage.items.map((item, index) => index === 1 ? { ...item, direction_id: validPackage.items[0].direction_id } : item) } },
    { source, package: { ...validPackage, items: validPackage.items.map((item, index) => index === 0 ? { ...item, content_role: 'feature_highlight' } : item) } },
  ];
  for (const candidate of cases) {
    assert.throws(() => validateApprovedDirectionPackage(candidate.package, contracts, candidate.source));
  }
});

test('malformed packages, unsafe claims, internal prose, and recent exact repetition fail closed', async () => {
  const contracts = await loadApprovedDirectionPackageContracts();
  const first = validPackage.items[0];
  for (const candidate of [
    { ...validPackage, extra: true },
    { ...validPackage, items: validPackage.items.slice(0, 5) },
    { ...validPackage, items: validPackage.items.map((item, index) => index === 0 ? { ...item, content_type: 'other' } : item) },
    { ...validPackage, items: validPackage.items.map((item, index) => index === 0 ? { ...item, body: 'Guaranteed results for every contractor.' } : item) },
    { ...validPackage, items: validPackage.items.map((item, index) => index === 0 ? { ...item, body: 'This customer-facing workflow keeps the work context eligible.' } : item) },
  ]) {
    assert.throws(() => validateApprovedDirectionPackage(candidate, contracts, source));
  }
  assert.throws(() => validateApprovedDirectionPackage(validPackage, contracts, source, [{ title: first.title, body: 'Different body' }]));
  assert.throws(() => validateApprovedDirectionPackage(validPackage, contracts, source, [{ title: 'Different title', body: first.body }]));
});

test('validation returns content only and cannot carry status, approval, schedule, or publication authority', async () => {
  const contracts = await loadApprovedDirectionPackageContracts();
  const result = validateApprovedDirectionPackage(validPackage, contracts, source);
  assert.equal('status' in result, false);
  assert.equal('approval' in result, false);
  assert.equal('schedule' in result, false);
  assert.equal('publish' in result, false);
  assert.equal('provider' in result, false);
});

test('operator validates before authentication and uses only guarded Marketing RPCs', async () => {
  const sourceText = await readFile(new URL('../../scripts/marketing/ingest-approved-direction-marketing-package.mjs', import.meta.url), 'utf8');
  assert.ok(sourceText.indexOf('validateApprovedDirectionPackageEnvelope(input, contracts)') < sourceText.indexOf('createClient('));
  assert.match(sourceText, /servsync_get_internal_marketing_directions/);
  assert.match(sourceText, /servsync_list_internal_marketing_content/);
  assert.match(sourceText, /servsync_ingest_internal_marketing_direction_package/);
  assert.doesNotMatch(sourceText, /\.from\(['"]marketing_(?:content|direction|plan)/);
  assert.doesNotMatch(sourceText, /service[_-]?role/i);
  assert.match(sourceText, /SERVSYNC_MARKETING_ALLOW_PRODUCTION/);
});
