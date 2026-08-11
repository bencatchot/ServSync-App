import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateMarketingDirectionPreparation } from '../../scripts/marketing/marketing-direction-preparation-contract.mjs';

const fixtureUrl = new URL('../fixtures/accepted-plan-marketing-directions-v1.json', import.meta.url);

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('validates the exact six-item accepted-plan Direction fixture', async () => {
  const result = await validateMarketingDirectionPreparation(await fixture());
  assert.equal(result.source_plan_id, '4e390d96-03f0-4342-9a13-3e8119383024');
  assert.equal(result.source_plan_revision, 3);
  assert.equal(result.truth_pack_version, 'servsync-marketing-truth-v3');
  assert.equal(result.preparation_source, 'codex_assisted');
  assert.equal(result.direction_mode, 'recommended');
  assert.equal(result.owner_input, null);
  assert.equal(result.directions.length, 6);
  assert.deepEqual(result.directions.map(item => item.plan_item_index), [1, 2, 3, 4, 5, 6]);
  assert.ok(result.directions.every(item => item.statement.length >= 80));
});

test('rejects unsupported capability grounding and unsafe claims', async () => {
  const unsupported = await fixture();
  unsupported.directions[0].truth_capability_keys = ['online_payments'];
  await assert.rejects(() => validateMarketingDirectionPreparation(unsupported), /unsupported Truth capability/);

  const unsafe = await fixture();
  unsafe.directions[0].statement = `${unsafe.directions[0].statement} Guaranteed to save 25%.`;
  await assert.rejects(() => validateMarketingDirectionPreparation(unsafe), /prohibited or unsupported claim/);
});

test('rejects missing, reordered, generic, and malformed Direction items', async () => {
  const reordered = await fixture();
  [reordered.directions[0], reordered.directions[1]] = [reordered.directions[1], reordered.directions[0]];
  await assert.rejects(() => validateMarketingDirectionPreparation(reordered), /accepted Plan item order/);

  const generic = await fixture();
  generic.directions[0].statement = 'Talk about invoices.';
  await assert.rejects(() => validateMarketingDirectionPreparation(generic), /80-500 characters/);

  const malformed = await fixture();
  malformed.directions[0].provider_secret = 'not allowed';
  await assert.rejects(() => validateMarketingDirectionPreparation(malformed), /missing or unsupported fields/);
});

test('preserves the owner-led versus recommended boundary', async () => {
  const inventedOwnerInput = await fixture();
  inventedOwnerInput.owner_input = 'An owner thought that was never supplied.';
  await assert.rejects(() => validateMarketingDirectionPreparation(inventedOwnerInput), /must not invent owner input/);

  const missingRationale = await fixture();
  missingRationale.directions[0].recommendation_rationale = null;
  await assert.rejects(() => validateMarketingDirectionPreparation(missingRationale), /requires a rationale/);
});
