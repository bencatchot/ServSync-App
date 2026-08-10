import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  analyzeMarketingDirectionInput,
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

const validDirection = {
  mode: 'owner_led',
  owner_input: 'Explain that customers can interact before creating an account, while a connected homeowner relationship provides ongoing value.',
  audience: 'hvac_contractors',
  objective: 'Help small HVAC contractors understand the two legitimate customer paths.',
  statement: 'Show HVAC contractors that ServSync supports immediate customer interactions and an optional longer-term connected homeowner relationship.',
  central_message: 'Customers can handle certain estimate, invoice, and report interactions without an account, while homeowners who connect can keep supported service activity organized around their home.',
  supporting_points: [
    'Both paths are legitimate choices.',
    'A connected homeowner account supports ongoing authenticated service experiences.',
  ],
  corrected_assumptions: [],
  recommendation_rationale: null,
};

const validV2Package = {
  preparation_request_id: '42000000-0000-4000-8000-000000000010',
  recipe_key: 'contractor_acquisition',
  truth_pack_version: 'servsync-marketing-truth-v2',
  marketing_direction: validDirection,
  items: [
    {
      title: 'A customer can review the estimate before joining ServSync',
      content_type: 'social_post',
      body: 'Send an eligible estimate through a secure link. If the homeowner later chooses to connect, supported service records can stay organized around the home.',
      channel_category: 'social',
      intended_audience: 'hvac_contractors',
      content_role: 'facebook_instagram_post',
    },
    {
      title: 'Two useful ways to serve a customer',
      content_type: 'social_post',
      body: 'A document-specific interaction can help with the work in front of you. A connected homeowner relationship can support the service relationship that follows.',
      channel_category: 'social',
      intended_audience: 'hvac_contractors',
      content_role: 'linkedin_post',
    },
  ],
};

test('Truth Pack and coordinated recipe contracts are internally consistent', async () => {
  const contracts = await loadMarketingContracts();
  const schema = JSON.parse(await readFile(new URL('config/marketing/codex-marketing-package.v2.schema.json', ROOT), 'utf8'));
  assert.doesNotThrow(() => validateMarketingContracts(contracts.truthPack, contracts.recipeSet));
  assert.equal(contracts.truthPack.truthPackVersion, 'servsync-marketing-truth-v2');
  assert.equal(contracts.recipeSet.recipeSetVersion, 'servsync-marketing-recipes-v2');
  assert.equal(contracts.recipeSet.recipes.length, 3);
  assert.ok(contracts.truthPack.unavailableOrRestrictedCapabilities.includes('Production online payments or Pay Online'));
  assert.match(contracts.truthPack.competitiveFramingPolicy.rule, /own merits/i);
  assert.match(contracts.truthPack.guestAndConnectedHomeownerTruth.plainLanguageSummary, /document-specific customer interactions/i);
  assert.equal(schema.properties.truth_pack_version.const, 'servsync-marketing-truth-v2');
  assert.deepEqual(schema.required, ['preparation_request_id', 'recipe_key', 'truth_pack_version', 'marketing_direction', 'items']);
});

test('the historical v1 package remains replay-valid without changing Package #1 semantics', async () => {
  const contracts = await loadMarketingContracts(undefined, 'servsync-marketing-truth-v1');
  const result = validateMarketingPackage(validPackage, contracts);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].content_role, 'facebook_instagram_post');
  assert.equal('status' in result, false);
  assert.equal('provider' in result, false);
});

test('unknown fields, malformed values, recipe conflicts, and duplicate roles fail closed', async () => {
  const contracts = await loadMarketingContracts(undefined, 'servsync-marketing-truth-v1');
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
  const contracts = await loadMarketingContracts(undefined, 'servsync-marketing-truth-v1');
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

test('owner-led Marketing Direction becomes the durable package brief without approval authority', async () => {
  const contracts = await loadMarketingContracts();
  const result = validateMarketingPackage(validV2Package, contracts);
  assert.equal(result.brief_summary, validDirection.statement);
  assert.equal(result.marketing_direction.owner_input, validDirection.owner_input);
  assert.equal(result.marketing_direction.audience, 'hvac_contractors');
  assert.equal(result.items.length, 2);
  assert.equal('status' in result, false);
  assert.equal('provider' in result, false);
  assert.equal('approval' in result, false);
});

test('recommended direction requires no invented owner input and an inspectable rationale', async () => {
  const contracts = await loadMarketingContracts();
  const recommended = {
    ...validV2Package,
    preparation_request_id: '42000000-0000-4000-8000-000000000011',
    marketing_direction: {
      ...validDirection,
      mode: 'recommended',
      owner_input: null,
      recommendation_rationale: 'This angle distinguishes immediate document review from the optional ongoing homeowner relationship without relying on competitor claims.',
    },
  };
  assert.doesNotThrow(() => validateMarketingPackage(recommended, contracts));
  assert.throws(() => validateMarketingPackage({
    ...recommended,
    marketing_direction: { ...recommended.marketing_direction, recommendation_rationale: null },
  }, contracts));
  assert.throws(() => validateMarketingPackage({
    ...recommended,
    marketing_direction: { ...recommended.marketing_direction, owner_input: 'Invented owner direction' },
  }, contracts));
});

test('unsupported competitor assumptions must be corrected while valid owner intent is preserved', async () => {
  const contracts = await loadMarketingContracts();
  const unsafeInput = "Tell contractors they won't have to force customers to download an app anymore.";
  assert.deepEqual(analyzeMarketingDirectionInput(unsafeInput), ['competitor_app_download_requirement']);
  assert.throws(() => validateMarketingPackage({
    ...validV2Package,
    marketing_direction: { ...validDirection, owner_input: unsafeInput },
  }, contracts));

  const corrected = {
    ...validV2Package,
    marketing_direction: {
      ...validDirection,
      owner_input: unsafeInput,
      corrected_assumptions: [{
        code: 'competitor_app_download_requirement',
        correction: 'No competitor app-download requirement is established; describe the two ServSync customer paths on their own merits.',
      }],
    },
  };
  const result = validateMarketingPackage(corrected, contracts);
  assert.match(result.marketing_direction.statement, /immediate customer interactions/i);
  assert.match(result.marketing_direction.statement, /connected homeowner relationship/i);
  assert.equal(result.marketing_direction.corrected_assumptions[0].code, 'competitor_app_download_requirement');
});

test('direction analysis identifies the bounded competitor-assumption classes', () => {
  assert.deepEqual(analyzeMarketingDirectionInput('Competitors require homeowners to create accounts.'), ['competitor_account_requirement']);
  assert.deepEqual(analyzeMarketingDirectionInput('Other software makes every customer buy a subscription.'), ['competitor_subscription_requirement']);
  assert.deepEqual(analyzeMarketingDirectionInput('Unlike competitors, ServSync is less fragmented.'), ['competitor_inferiority']);
});

test('unsupported competitor contrast is rejected from direction and prepared copy', async () => {
  const contracts = await loadMarketingContracts();
  assert.throws(() => validateMarketingPackage({
    ...validV2Package,
    marketing_direction: {
      ...validDirection,
      statement: 'Unlike other software, ServSync gives customers a better way to review estimates.',
    },
  }, contracts));
  assert.throws(() => validateMarketingPackage({
    ...validV2Package,
    items: [{
      ...validV2Package.items[0],
      title: 'Send an estimate without forcing an account signup',
    }],
  }, contracts));
});

test('the package stays focused on one direction and recipe roles remain deliberately distinct', async () => {
  const contracts = await loadMarketingContracts();
  const result = validateMarketingPackage(validV2Package, contracts);
  assert.ok(result.items.every(item => item.intended_audience === result.marketing_direction.audience));
  const recipe = contracts.recipeSet.recipes.find(candidate => candidate.key === 'contractor_acquisition');
  const purposes = recipe.items.map(item => item.directionPurpose);
  assert.equal(new Set(purposes).size, recipe.items.length);
  assert.match(purposes.join(' '), /realistic contractor\/customer moment/i);
  assert.match(purposes.join(' '), /business philosophy or relationship value/i);
  assert.match(purposes.join(' '), /specific current ServSync interaction/i);
});

test('prescribed v2 fixtures use public language rather than internal implementation terminology', async () => {
  const serialized = JSON.stringify(validV2Package);
  assert.doesNotMatch(serialized, /Not connected Customer|eligible customer|customer-facing|work context|practical foundation|organized workflow/);
  assert.doesNotMatch(serialized, /\b(?:Estimate|Job|Invoice|Customer|Homeowner)\b/);
});

test('v2 direction shape, audience conflicts, and uncorrected assumptions fail closed', async () => {
  const contracts = await loadMarketingContracts();
  const cases = [
    { ...validV2Package, brief_summary: 'unsupported duplicate direction' },
    { ...validV2Package, marketing_direction: { ...validDirection, unknown: true } },
    { ...validV2Package, marketing_direction: { ...validDirection, mode: 'owner_led', owner_input: null } },
    { ...validV2Package, marketing_direction: { ...validDirection, mode: 'recommended', recommendation_rationale: null } },
    { ...validV2Package, items: [{ ...validV2Package.items[0], intended_audience: 'small_contractors' }] },
  ];
  for (const candidate of cases) assert.throws(() => validateMarketingPackage(candidate, contracts));
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
  assert.match(contract, /unsupported competitor contrast/);
});
