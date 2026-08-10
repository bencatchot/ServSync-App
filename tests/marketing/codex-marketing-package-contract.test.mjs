import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadMarketingContracts,
  validateMarketingContracts,
  validateMarketingPackage,
} from '../../scripts/marketing/marketing-package-contract.mjs';

const ROOT = new URL('../..', import.meta.url);

const validPackage = {
  preparation_request_id: '41000000-0000-4000-8000-000000000010',
  recipe_key: 'contractor_acquisition',
  truth_pack_version: 'servsync-marketing-truth-v1',
  brief_summary: 'Prepare distinct Estimate workflow content for small HVAC contractors.',
  items: [
    {
      title: 'Keep Estimate follow-up organized',
      content_type: 'social_post',
      body: 'Keep an Estimate tied to the Customer and the work it describes.',
      channel_category: 'social',
      intended_audience: 'hvac_contractors',
      content_role: 'facebook_instagram_post',
    },
    {
      title: 'A clearer request-to-Estimate path',
      content_type: 'social_post',
      body: 'ServSync keeps the service request and the next contractor action connected.',
      channel_category: 'social',
      intended_audience: 'hvac_contractors',
      content_role: 'linkedin_post',
    },
  ],
};

test('Truth Pack and coordinated recipe contracts are internally consistent', async () => {
  const contracts = await loadMarketingContracts();
  assert.doesNotThrow(() => validateMarketingContracts(contracts.truthPack, contracts.recipeSet));
  assert.equal(contracts.truthPack.truthPackVersion, 'servsync-marketing-truth-v1');
  assert.equal(contracts.recipeSet.recipes.length, 3);
  assert.ok(contracts.truthPack.unavailableOrRestrictedCapabilities.includes('Production online payments or Pay Online'));
});

test('a valid bounded package normalizes without gaining status or provider authority', async () => {
  const contracts = await loadMarketingContracts();
  const result = validateMarketingPackage(validPackage, contracts);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].content_role, 'facebook_instagram_post');
  assert.equal('status' in result, false);
  assert.equal('provider' in result, false);
});

test('unknown fields, malformed values, recipe conflicts, and duplicate roles fail closed', async () => {
  const contracts = await loadMarketingContracts();
  const cases = [
    { ...validPackage, status: 'approved' },
    { ...validPackage, preparation_request_id: 'not-a-uuid' },
    { ...validPackage, truth_pack_version: 'future-truth' },
    { ...validPackage, items: [] },
    { ...validPackage, items: [...validPackage.items, { ...validPackage.items[0], title: 'Another title', body: 'Another body.' }] },
    { ...validPackage, items: [{ ...validPackage.items[0], content_type: 'other' }] },
    { ...validPackage, items: [{ ...validPackage.items[0], intended_audience: 'homeowners' }] },
    { ...validPackage, items: [{ ...validPackage.items[0], unknown: true }] },
  ];
  for (const candidate of cases) {
    assert.throws(() => validateMarketingPackage(candidate, contracts));
  }
});

test('secret-like material and bounded prohibited claim classes are rejected', async () => {
  const contracts = await loadMarketingContracts();
  for (const body of [
    'Use OPENAI_API_KEY for this draft.',
    'Guaranteed results for every contractor.',
    'Trusted by 500 contractors.',
    'Save 25% on every job.',
    'Now with QuickBooks integration.',
  ]) {
    assert.throws(() => validateMarketingPackage({
      ...validPackage,
      items: [{ ...validPackage.items[0], body }],
    }, contracts));
  }
});

test('the operator remains authenticated, target-guarded, and free of direct Marketing table writes', async () => {
  const operator = await readFile(new URL('scripts/marketing/ingest-codex-marketing-package.mjs', ROOT), 'utf8');
  assert.match(operator, /SERVSYNC_MARKETING_ACCESS_TOKEN/);
  assert.match(operator, /signInWithPassword/);
  assert.match(operator, /profiles/);
  assert.match(operator, /platform_admin/);
  assert.match(operator, /servsync_ingest_internal_marketing_package/);
  assert.match(operator, /SERVSYNC_MARKETING_ALLOW_PRODUCTION/);
  assert.match(operator, /SERVSYNC_MARKETING_ALLOW_DEMO/);
  assert.doesNotMatch(operator, /service[_ -]?role/i);
  assert.doesNotMatch(operator, /from\(['"]marketing_(?:content|workspace|preparation)/);
  assert.doesNotMatch(operator, /\.insert\(|\.update\(|\.delete\(/);
});

test('the documented validator command has a fail-closed CLI entry point', async () => {
  const contract = await readFile(new URL('scripts/marketing/marketing-package-contract.mjs', ROOT), 'utf8');
  assert.match(contract, /pathToFileURL\(process\.argv\[1\]\)/);
  assert.match(contract, /valid: true/);
  assert.match(contract, /process\.exitCode = 1/);
});
