import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertReadOnlyCatalogQuery,
  compareCatalogs,
  formatRolloutStatus,
  readJson,
  validateParityConfig,
  validateRolloutLedger,
} from '../../scripts/backend-parity/lib.mjs';

const root = process.cwd();
const parityConfig = await readJson(join(root, 'config', 'backend-environment-parity.json'));
const rolloutLedger = await readJson(join(root, 'config', 'backend-environment-rollouts.json'));

function entry(key, scope = key, details = {}) {
  return { key, scope, ...details };
}

function snapshot(overrides = {}) {
  return {
    snapshotVersion: 1,
    catalogSchema: 'public',
    relations: [entry('public.customers', 'public.customers', { rls_enabled: true })],
    columns: [entry('public.customers.id', 'public.customers', { data_type: 'uuid', nullable: false })],
    constraints: [],
    indexes: [],
    triggers: [],
    policies: [entry('public.customers.read_own', 'public.customers', { command: 'r', using_expression: '(owner_id = auth.uid())' })],
    functions: [entry('public.list_customers()', 'public.list_customers()', { security_definer: true, return_type: 'SETOF uuid' })],
    functionGrants: [entry('public.list_customers()|authenticated|EXECUTE', 'public.list_customers()', { grantee: 'authenticated', privilege_type: 'EXECUTE', is_grantable: false })],
    tableGrants: [],
    columnGrants: [],
    defaultAcls: [],
    ...overrides,
  };
}

test('committed catalog query is a single read-only statement', async () => {
  const sql = await readFile(join(root, 'scripts', 'backend-parity', 'catalog-query.sql'), 'utf8');
  assert.doesNotThrow(() => assertReadOnlyCatalogQuery(sql));
  assert.throws(() => assertReadOnlyCatalogQuery('select 1; drop table public.customers;'), /single WITH\/SELECT|exactly one|non-read-only/);
});

test('fixed environment identities cannot be duplicated or swapped', () => {
  assert.doesNotThrow(() => validateParityConfig(parityConfig));
  const swapped = structuredClone(parityConfig);
  swapped.environments.demo.projectRef = swapped.environments.production.projectRef;
  assert.throws(() => validateParityConfig(swapped), /not unique/);
});

test('intentional differences require exact unique objects and review reasons', () => {
  const reasonless = structuredClone(parityConfig);
  reasonless.intentionalDifferences.demo.functions[0].reason = '';
  assert.throws(() => validateParityConfig(reasonless), /Invalid or duplicated/);

  const duplicated = structuredClone(parityConfig);
  duplicated.intentionalDifferences.demo.relationFamilies.push(
    structuredClone(duplicated.intentionalDifferences.demo.relationFamilies[0]),
  );
  assert.throws(() => validateParityConfig(duplicated), /Invalid or duplicated/);
});

test('matching logical catalogs ignore array order', () => {
  const reference = snapshot({
    columns: [
      entry('public.customers.name', 'public.customers', { data_type: 'text' }),
      entry('public.customers.id', 'public.customers', { data_type: 'uuid' }),
    ],
  });
  const candidate = { ...reference, columns: [...reference.columns].reverse() };
  assert.equal(compareCatalogs(reference, candidate, parityConfig, 'demo').unexplained.length, 0);
});

test('incomplete or duplicate snapshots fail rather than producing false parity', () => {
  const incomplete = snapshot();
  delete incomplete.defaultAcls;
  assert.throws(() => compareCatalogs(snapshot(), incomplete, parityConfig, 'demo'), /missing defaultAcls/);

  const duplicated = snapshot({ relations: [entry('public.customers'), entry('public.customers')] });
  assert.throws(() => compareCatalogs(snapshot(), duplicated, parityConfig, 'demo'), /duplicate relations key/);
});

test('representative missing and changed supported objects fail', () => {
  const reference = snapshot();
  const cases = [
    snapshot({ functions: [] }),
    snapshot({ functionGrants: [entry('public.list_customers()|authenticated|EXECUTE', 'public.list_customers()', { grantee: 'authenticated', privilege_type: 'EXECUTE', is_grantable: true })] }),
    snapshot({ policies: [] }),
    snapshot({ columns: [entry('public.customers.id', 'public.customers', { data_type: 'text', nullable: false })] }),
    snapshot({ relations: [entry('public.customers', 'public.customers', { rls_enabled: false })] }),
  ];
  for (const candidate of cases) {
    const result = compareCatalogs(reference, candidate, parityConfig, 'demo');
    assert.match(result.status, /^FAIL/);
    assert.ok(result.unexplained.length > 0);
  }
});

test('an unexpected Demo table fails with its dependent catalog objects', () => {
  const reference = snapshot();
  const candidate = snapshot({
    relations: [...reference.relations, entry('public.unreviewed_demo_table')],
    columns: [...reference.columns, entry('public.unreviewed_demo_table.id', 'public.unreviewed_demo_table', { data_type: 'uuid' })],
  });
  const result = compareCatalogs(reference, candidate, parityConfig, 'demo');
  assert.equal(result.unexplained.length, 2);
  assert.match(result.status, /^FAIL/);
});

test('reviewed Demo-only relation families and exact functions are intentional', () => {
  const reference = snapshot();
  const candidate = snapshot({
    relations: [...reference.relations, entry('public.demo_scenarios')],
    columns: [...reference.columns, entry('public.demo_scenarios.id', 'public.demo_scenarios', { data_type: 'uuid' })],
    functions: [...reference.functions, entry('public.servsync_demo_reset_registered_run(uuid)')],
    functionGrants: [...reference.functionGrants, entry(
      'public.servsync_demo_reset_registered_run(uuid)|postgres|EXECUTE',
      'public.servsync_demo_reset_registered_run(uuid)',
      { grantee: 'postgres', privilege_type: 'EXECUTE', is_grantable: true },
    )],
  });
  const result = compareCatalogs(reference, candidate, parityConfig, 'demo');
  assert.equal(result.unexplained.length, 0);
  assert.equal(result.intentional.length, 4);
  assert.equal(result.status, 'PASS WITH INTENTIONAL DIFFERENCES');
});

test('Sandbox-only additions remain visible without masking supported-object drift', () => {
  const reference = snapshot();
  const additive = snapshot({ relations: [...reference.relations, entry('public.experimental_foundation')] });
  const additiveResult = compareCatalogs(reference, additive, parityConfig, 'sandbox');
  assert.equal(additiveResult.unexplained.length, 0);
  assert.equal(additiveResult.experimental.length, 1);
  assert.equal(additiveResult.status, 'PASS WITH SANDBOX-ONLY/EXPERIMENTAL DIFFERENCES');

  const drifted = { ...additive, policies: [] };
  assert.match(compareCatalogs(reference, drifted, parityConfig, 'sandbox').status, /^FAIL/);
});

test('rollout ledger requires every environment, status, and reason', () => {
  assert.doesNotThrow(() => validateRolloutLedger(rolloutLedger));
  assert.match(formatRolloutStatus(rolloutLedger), /\| Foundation \/ migration \| Sandbox \| Production \| Demo \|/);
  const invalid = structuredClone(rolloutLedger);
  delete invalid.foundations[0].environments.demo;
  assert.throws(() => validateRolloutLedger(invalid), /Invalid demo rollout state/);
});
