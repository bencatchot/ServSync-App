import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertReadOnlyCatalogQuery,
  canonicalizeFunctionDefinition,
  compareCatalogs,
  fingerprintAdditionEntries,
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

const canonicalFunctionDefinition = `CREATE OR REPLACE FUNCTION public.list_customers()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query select id from public.customers;
end;
$function$
`;

function snapshot(overrides = {}) {
  return {
    snapshotVersion: 2,
    catalogSchema: 'public',
    relations: [entry('public.customers', 'public.customers', { rls_enabled: true, rls_forced: false })],
    managedRelations: [entry('storage.objects', 'storage.objects', {
      owner: 'supabase_storage_admin',
      relation_kind: 'r',
      persistence: 'p',
      rls_enabled: true,
      rls_forced: false,
    })],
    columns: [entry('public.customers.id', 'public.customers', { data_type: 'uuid', nullable: false })],
    constraints: [],
    indexes: [],
    triggers: [],
    policies: [entry('public.customers.read_own', 'public.customers', {
      command: 'r',
      using_expression: '(owner_id = auth.uid())',
    })],
    functions: [entry('public.list_customers()', 'public.list_customers()', {
      security_definer: true,
      return_type: 'SETOF uuid',
      definition: canonicalFunctionDefinition,
    })],
    functionGrants: [entry('public.list_customers()|authenticated|EXECUTE', 'public.list_customers()', {
      grantee: 'authenticated',
      privilege_type: 'EXECUTE',
      is_grantable: false,
    })],
    tableGrants: [],
    columnGrants: [],
    defaultAcls: [],
    ...overrides,
  };
}

function additionGroup(id, reason, selectors, additions) {
  const fingerprint = fingerprintAdditionEntries(additions);
  return {
    id,
    reason,
    selectors,
    expectedCounts: fingerprint.counts,
    expectedKeyFingerprint: fingerprint.keyFingerprint,
    expectedCatalogFingerprint: fingerprint.catalogFingerprint,
  };
}

function configWithGroups(demo = [], sandbox = []) {
  const config = structuredClone(parityConfig);
  config.intentionalAdditions = { demo, sandbox };
  return config;
}

function additionsBetween(reference, candidate) {
  const additions = [];
  for (const category of Object.keys(reference).filter(key => Array.isArray(reference[key]))) {
    const existing = new Set(reference[category].map(item => item.key));
    for (const item of candidate[category]) {
      if (!existing.has(item.key)) additions.push({ category, entry: item });
    }
  }
  return additions;
}

test('committed catalog query is a single read-only statement', async () => {
  const sql = await readFile(join(root, 'scripts', 'backend-parity', 'catalog-query.sql'), 'utf8');
  assert.doesNotThrow(() => assertReadOnlyCatalogQuery(sql));
  assert.match(sql, /n\.nspname = 'storage'[\s\S]+c\.relname = 'objects'/);
  assert.throws(() => assertReadOnlyCatalogQuery('select 1; drop table public.customers;'), /single WITH\/SELECT|exactly one|non-read-only/);
});

test('immutable environment identities reject duplicates and whole-block swaps', () => {
  assert.doesNotThrow(() => validateParityConfig(parityConfig));

  const duplicate = structuredClone(parityConfig);
  duplicate.environments.demo.projectRef = duplicate.environments.production.projectRef;
  assert.throws(() => validateParityConfig(duplicate), /immutable approved project identity|not unique/);

  for (const pair of [['production', 'demo'], ['production', 'sandbox']]) {
    const swapped = structuredClone(parityConfig);
    [swapped.environments[pair[0]], swapped.environments[pair[1]]] = [
      swapped.environments[pair[1]],
      swapped.environments[pair[0]],
    ];
    assert.throws(() => validateParityConfig(swapped), /immutable approved project identity/);
  }

  const wrongAuthority = structuredClone(parityConfig);
  wrongAuthority.authoritativeEnvironment = 'demo';
  assert.throws(() => validateParityConfig(wrongAuthority), /Production as the authority/);
});

test('intentional additions require exact selectors, reasons, counts, and fingerprints', () => {
  const reasonless = structuredClone(parityConfig);
  reasonless.intentionalAdditions.demo[0].reason = '';
  assert.throws(() => validateParityConfig(reasonless), /Invalid intentional-addition group/);

  const wildcard = structuredClone(parityConfig);
  wildcard.intentionalAdditions.demo[0].selectors.relationScopes[0] = 'public.demo_*';
  assert.throws(() => validateParityConfig(wildcard), /invalid relationScopes selector/);

  const badFingerprint = structuredClone(parityConfig);
  badFingerprint.intentionalAdditions.demo[0].expectedCatalogFingerprint = 'reviewed';
  assert.throws(() => validateParityConfig(badFingerprint), /requires SHA-256/);
});

test('matching logical catalogs ignore category array order', () => {
  const reference = snapshot({
    columns: [
      entry('public.customers.name', 'public.customers', { data_type: 'text' }),
      entry('public.customers.id', 'public.customers', { data_type: 'uuid' }),
    ],
  });
  const candidate = { ...reference, columns: [...reference.columns].reverse() };
  assert.equal(compareCatalogs(reference, candidate, configWithGroups(), 'demo').unexplained.length, 0);
});

test('incomplete or duplicate snapshots fail rather than producing false parity', () => {
  const incomplete = snapshot();
  delete incomplete.managedRelations;
  assert.throws(() => compareCatalogs(snapshot(), incomplete, configWithGroups(), 'demo'), /missing managedRelations/);

  const duplicated = snapshot({ relations: [entry('public.customers'), entry('public.customers')] });
  assert.throws(() => compareCatalogs(snapshot(), duplicated, configWithGroups(), 'demo'), /duplicate relations key/);
});

test('missing and logically changed Production-supported objects fail', () => {
  const reference = snapshot();
  const cases = [
    snapshot({ functions: [] }),
    snapshot({ functionGrants: [entry('public.list_customers()|authenticated|EXECUTE', 'public.list_customers()', {
      grantee: 'authenticated', privilege_type: 'EXECUTE', is_grantable: true,
    })] }),
    snapshot({ policies: [entry('public.customers.read_own', 'public.customers', {
      command: 'r', using_expression: '(true)',
    })] }),
    snapshot({ columns: [entry('public.customers.id', 'public.customers', { data_type: 'text', nullable: false })] }),
    snapshot({ relations: [entry('public.customers', 'public.customers', { rls_enabled: false, rls_forced: false })] }),
    snapshot({ functions: [entry('public.list_customers()', 'public.list_customers()', {
      security_definer: true,
      return_type: 'SETOF uuid',
      definition: canonicalFunctionDefinition.replace('public.customers', 'public.other_customers'),
    })] }),
  ];
  for (const candidate of cases) {
    const result = compareCatalogs(reference, candidate, configWithGroups(), 'demo');
    assert.match(result.status, /^FAIL/);
    assert.ok(result.unexplained.length > 0);
  }
});

test('storage.objects RLS drift fails even when policies are unchanged', () => {
  const reference = snapshot();
  const candidate = snapshot({
    managedRelations: [entry('storage.objects', 'storage.objects', {
      owner: 'supabase_storage_admin',
      relation_kind: 'r',
      persistence: 'p',
      rls_enabled: false,
      rls_forced: false,
    })],
  });
  const result = compareCatalogs(reference, candidate, configWithGroups(), 'demo');
  assert.match(result.status, /^FAIL/);
  assert.deepEqual(result.unexplained[0].fields, ['rls_enabled']);
});

test('approved Demo scenario additions pass only at their exact fingerprint', () => {
  const reference = snapshot();
  const demoRelation = entry('public.demo_scenarios', 'public.demo_scenarios', { rls_enabled: true });
  const demoColumn = entry('public.demo_scenarios.id', 'public.demo_scenarios', { data_type: 'uuid' });
  const demoFunction = entry('public.servsync_demo_reset_registered_run(uuid)', 'public.servsync_demo_reset_registered_run(uuid)', {
    security_definer: true,
    definition: canonicalFunctionDefinition.replaceAll('list_customers', 'servsync_demo_reset_registered_run'),
  });
  const demoGrant = entry(
    'public.servsync_demo_reset_registered_run(uuid)|service_role|EXECUTE',
    'public.servsync_demo_reset_registered_run(uuid)',
    { grantee: 'service_role', privilege_type: 'EXECUTE', is_grantable: false },
  );
  const candidate = snapshot({
    relations: [...reference.relations, demoRelation],
    columns: [...reference.columns, demoColumn],
    functions: [...reference.functions, demoFunction],
    functionGrants: [...reference.functionGrants, demoGrant],
  });
  const additions = additionsBetween(reference, candidate);
  const group = additionGroup('demo-scenario-test', 'Reviewed Demo additions.', {
    relationScopes: ['public.demo_scenarios'],
    functionScopes: ['public.servsync_demo_reset_registered_run(uuid)'],
    exactObjects: [],
  }, additions);
  const result = compareCatalogs(reference, candidate, configWithGroups([group]), 'demo');
  assert.equal(result.unexplained.length, 0);
  assert.equal(result.intentional.length, additions.length);
  assert.equal(result.status, 'PASS WITH INTENTIONAL DIFFERENCES');
});

test('approved scopes reject unexpected security and structural child objects', () => {
  const reference = snapshot();
  const baseCandidate = snapshot({
    relations: [...reference.relations, entry('public.demo_scenarios', 'public.demo_scenarios', { rls_enabled: true })],
    columns: [...reference.columns, entry('public.demo_scenarios.id', 'public.demo_scenarios', { data_type: 'uuid' })],
    tableGrants: [entry('public.demo_scenarios|service_role|SELECT', 'public.demo_scenarios', {
      grantee: 'service_role', privilege_type: 'SELECT', is_grantable: false,
    })],
  });
  const group = additionGroup('demo-scenario-test', 'Reviewed Demo additions.', {
    relationScopes: ['public.demo_scenarios'], functionScopes: [], exactObjects: [],
  }, additionsBetween(reference, baseCandidate));
  const config = configWithGroups([group]);
  assert.equal(compareCatalogs(reference, baseCandidate, config, 'demo').unexplained.length, 0);

  const cases = [
    snapshot({
      ...baseCandidate,
      tableGrants: [...baseCandidate.tableGrants, entry('public.demo_scenarios|anon|SELECT', 'public.demo_scenarios', {
        grantee: 'anon', privilege_type: 'SELECT', is_grantable: false,
      })],
    }),
    snapshot({
      ...baseCandidate,
      tableGrants: [entry('public.demo_scenarios|service_role|SELECT', 'public.demo_scenarios', {
        grantee: 'service_role', privilege_type: 'SELECT', is_grantable: true,
      })],
    }),
    snapshot({
      ...baseCandidate,
      columns: [...baseCandidate.columns, entry('public.demo_scenarios.secret', 'public.demo_scenarios', { data_type: 'text' })],
    }),
    snapshot({
      ...baseCandidate,
      triggers: [entry('public.demo_scenarios.unreviewed_trigger', 'public.demo_scenarios', { definition: 'EXECUTE FUNCTION public.unreviewed()' })],
    }),
    snapshot({
      ...baseCandidate,
      relations: [reference.relations[0], entry('public.demo_scenarios', 'public.demo_scenarios', { rls_enabled: false })],
    }),
    snapshot({
      ...baseCandidate,
      policies: [entry('public.demo_scenarios.anon_read', 'public.demo_scenarios', { roles: ['anon'], using_expression: 'true' })],
    }),
  ];
  for (const candidate of cases) {
    const result = compareCatalogs(reference, candidate, config, 'demo');
    assert.match(result.status, /^FAIL/);
    assert.ok(result.unexplained.some(finding => finding.kind === 'fingerprint-mismatch'));
  }
});

test('an intentional-addition selector never masks changed Production-supported objects', () => {
  const reference = snapshot();
  const strictGroup = additionGroup('strict-shared-test', 'Would only approve additions.', {
    relationScopes: ['public.customers'],
    functionScopes: ['public.list_customers()'],
    exactObjects: [],
  }, []);
  const candidate = snapshot({
    functions: [entry('public.list_customers()', 'public.list_customers()', {
      security_definer: true,
      return_type: 'SETOF uuid',
      definition: canonicalFunctionDefinition.replace('select id', 'select owner_id'),
    })],
  });
  const result = compareCatalogs(reference, candidate, configWithGroups([strictGroup]), 'demo');
  assert.match(result.status, /^FAIL/);
  assert.equal(result.unexplained[0].kind, 'logical-drift');
});

test('unapproved Demo and Sandbox additions fail instead of becoming implicit exceptions', () => {
  const reference = snapshot();
  const candidate = snapshot({ relations: [...reference.relations, entry('public.unapproved_experiment')] });
  for (const environment of ['demo', 'sandbox']) {
    const result = compareCatalogs(reference, candidate, configWithGroups(), environment);
    assert.match(result.status, /^FAIL/);
    assert.equal(result.unexplained[0].kind, 'unapproved-addition');
  }
});

test('fingerprinted Project Collaboration additions remain approved Sandbox experiments', () => {
  const reference = snapshot();
  const candidate = snapshot({
    relations: [...reference.relations, entry('public.projects', 'public.projects', { rls_enabled: true })],
    columns: [...reference.columns, entry('public.projects.id', 'public.projects', { data_type: 'uuid' })],
    functions: [...reference.functions, entry('public.servsync_create_project(uuid)', 'public.servsync_create_project(uuid)', {
      security_definer: true,
      definition: canonicalFunctionDefinition.replaceAll('list_customers', 'servsync_create_project'),
    })],
  });
  const group = additionGroup('project-test', 'Reviewed Project Collaboration experiment.', {
    relationScopes: ['public.projects'],
    functionScopes: ['public.servsync_create_project(uuid)'],
    exactObjects: [],
  }, additionsBetween(reference, candidate));
  const result = compareCatalogs(reference, candidate, configWithGroups([], [group]), 'sandbox');
  assert.equal(result.unexplained.length, 0);
  assert.equal(result.status, 'PASS WITH APPROVED SANDBOX EXPERIMENTS');
});

test('function comments and formatting are separated from logical definition drift', () => {
  const reference = snapshot();
  const formatted = canonicalFunctionDefinition
    .replace('begin\n  return query', 'begin\n  -- formatting-only note\n\n  return    query')
    .replace('select id from', 'select id\nfrom');
  assert.equal(canonicalizeFunctionDefinition(canonicalFunctionDefinition), canonicalizeFunctionDefinition(formatted));
  const result = compareCatalogs(reference, snapshot({
    functions: [entry('public.list_customers()', 'public.list_customers()', {
      security_definer: true,
      return_type: 'SETOF uuid',
      definition: formatted,
    })],
  }), configWithGroups(), 'demo');
  assert.equal(result.unexplained.length, 0);
  assert.equal(result.formatOnly.length, 1);
  assert.equal(result.status, 'PASS WITH DEFINITION-FORMAT DIFFERENCES');

  const meaningfulStringChange = canonicalFunctionDefinition
    .replace('select id from public.customers', "select 'customer  label'::uuid from public.customers");
  const differentStringChange = meaningfulStringChange.replace('customer  label', 'customer label');
  assert.notEqual(
    canonicalizeFunctionDefinition(meaningfulStringChange),
    canonicalizeFunctionDefinition(differentStringChange),
  );
});

test('function canonicalization preserves PostgreSQL operator and literal boundaries', () => {
  const definition = body => canonicalFunctionDefinition.replace(
    'return query select id from public.customers;',
    body,
  );
  const canonical = body => canonicalizeFunctionDefinition(definition(body));

  assert.notEqual(canonical('return 1 ## 2;'), canonical('return 1 # # 2;'));
  assert.equal(canonical("return payload->>'name';"), canonical("return payload ->> 'name';"));
  assert.equal(canonical('return 1##2;'), canonical('return 1 ## 2;'));
  assert.equal(canonical('return 1+2;'), canonical('return 1 + 2;'));
  assert.notEqual(canonical("return payload->>'name';"), canonical("return payload#>>'{name}';"));
  assert.equal(canonical('return 1 /* layout */ + 2;'), canonical('return 1+2;'));
  assert.notEqual(canonical("return 'a  b';"), canonical("return 'a b';"));
  assert.notEqual(canonical('return "Customer Name";'), canonical('return "customer name";'));
  assert.notEqual(canonical('return $value$a  b$value$;'), canonical('return $value$a b$value$;'));
  assert.notEqual(canonical('return 1_000;'), canonical('return 1 _000;'));
  assert.notEqual(canonical('return 1000;'), canonical('return 1001;'));

  const operatorBoundaryDrift = compareCatalogs(snapshot(), snapshot({
    functions: [entry('public.list_customers()', 'public.list_customers()', {
      security_definer: true,
      return_type: 'SETOF uuid',
      definition: definition('return 1 # # 2;'),
    })],
  }), configWithGroups(), 'demo');
  assert.match(operatorBoundaryDrift.status, /^FAIL/);
  assert.equal(operatorBoundaryDrift.unexplained[0].kind, 'logical-drift');
});

test('rollout ledger remains descriptive and requires every environment, status, and reason', () => {
  assert.doesNotThrow(() => validateRolloutLedger(rolloutLedger));
  assert.match(formatRolloutStatus(rolloutLedger), /\| Foundation \/ migration \| Sandbox \| Production \| Demo \|/);
  const invalid = structuredClone(rolloutLedger);
  delete invalid.foundations[0].environments.demo;
  assert.throws(() => validateRolloutLedger(invalid), /Invalid demo rollout state/);

  const manuallyApplied = structuredClone(rolloutLedger);
  manuallyApplied.foundations[0].environments.demo = { status: 'Applied', reason: 'Manual ledger entry.' };
  assert.doesNotThrow(() => validateRolloutLedger(manuallyApplied));
  const liveDrift = compareCatalogs(snapshot(), snapshot({ functions: [] }), configWithGroups(), 'demo');
  assert.match(liveDrift.status, /^FAIL/);
});
