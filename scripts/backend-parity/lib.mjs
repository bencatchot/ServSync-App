import { readFile } from 'node:fs/promises';

export const CATALOG_CATEGORIES = [
  'relations',
  'columns',
  'constraints',
  'indexes',
  'triggers',
  'policies',
  'functions',
  'functionGrants',
  'tableGrants',
  'columnGrants',
  'defaultAcls',
];

const ROLLOUT_STATUSES = new Set(['Applied', 'Pending', 'N/A', 'Intentionally deferred']);
const ENVIRONMENT_NAMES = ['sandbox', 'production', 'demo'];

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function assertReadOnlyCatalogQuery(sql) {
  const withoutComments = sql.replace(/--.*$/gm, '').trim();
  const statement = withoutComments.endsWith(';') ? withoutComments.slice(0, -1) : withoutComments;

  if (!/^with\b/i.test(statement) || !/\bselect\b/i.test(statement)) {
    throw new Error('Catalog query must be a single WITH/SELECT statement.');
  }
  if (statement.includes(';')) {
    throw new Error('Catalog query must contain exactly one statement.');
  }
  if (/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy|vacuum|analyze)\b/i.test(statement)) {
    throw new Error('Catalog query contains a non-read-only SQL keyword.');
  }
}

export function validateParityConfig(config) {
  if (config.schemaVersion !== 1 || config.authoritativeEnvironment !== 'production') {
    throw new Error('Parity config must use schemaVersion 1 with Production as the authority.');
  }
  if (JSON.stringify(config.catalogSchemas) !== JSON.stringify(['public'])) {
    throw new Error('Parity config and catalog query must remain scoped to the public application schema.');
  }
  if (JSON.stringify(config.additionalPolicySchemas) !== JSON.stringify(['storage'])) {
    throw new Error('Parity config must include storage policies without treating managed storage internals as app schema.');
  }

  const refs = new Set();
  for (const name of ENVIRONMENT_NAMES) {
    const environment = config.environments?.[name];
    if (!environment?.projectRef || !environment?.projectName || !environment?.organizationId) {
      throw new Error(`Missing fixed identity for ${name}.`);
    }
    if (refs.has(environment.projectRef)) {
      throw new Error(`Environment project refs are not unique: ${environment.projectRef}.`);
    }
    refs.add(environment.projectRef);
  }

  for (const environmentName of ['demo', 'sandbox']) {
    const rules = config.intentionalDifferences?.[environmentName];
    if (!rules) throw new Error(`Missing intentional-difference rules for ${environmentName}.`);
    const identities = new Set();
    for (const [ruleType, entries] of [
      ['relation', rules.relationFamilies],
      ['function', rules.functions],
      ['exact', rules.exactDifferences],
    ]) {
      if (!Array.isArray(entries)) throw new Error(`Invalid ${ruleType} rules for ${environmentName}.`);
      for (const entry of entries) {
        const identity = ruleType === 'exact' ? `${entry.category}:${entry.object}` : `${ruleType}:${entry.object}`;
        if (!entry.object?.trim() || !entry.reason?.trim() || identities.has(identity)) {
          throw new Error(`Invalid or duplicated ${environmentName} intentional difference: ${identity}.`);
        }
        if (ruleType === 'exact' && !CATALOG_CATEGORIES.includes(entry.category)) {
          throw new Error(`Unknown intentional-difference category: ${entry.category}.`);
        }
        identities.add(identity);
      }
    }
  }
}

export function validateRolloutLedger(ledger) {
  if (ledger.schemaVersion !== 1 || ledger.authoritativeEnvironment !== 'production') {
    throw new Error('Rollout ledger must use schemaVersion 1 with Production as the authority.');
  }

  const ids = new Set();
  for (const foundation of ledger.foundations ?? []) {
    if (!foundation.id || ids.has(foundation.id)) {
      throw new Error(`Rollout foundation id is missing or duplicated: ${foundation.id ?? '<missing>'}.`);
    }
    ids.add(foundation.id);
    for (const environmentName of ENVIRONMENT_NAMES) {
      const state = foundation.environments?.[environmentName];
      if (!state || !ROLLOUT_STATUSES.has(state.status) || !state.reason?.trim()) {
        throw new Error(`Invalid ${environmentName} rollout state for ${foundation.id}.`);
      }
    }
  }
  return ledger;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function equivalent(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function changedFields(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(field => !equivalent(left[field], right[field]))
    .sort();
}

function intentionalReason(config, environmentName, category, entry) {
  const rules = config.intentionalDifferences?.[environmentName] ?? {};
  const exact = (rules.exactDifferences ?? []).find(rule => rule.category === category && rule.object === entry.key);
  if (exact) return exact.reason;

  const relation = (rules.relationFamilies ?? []).find(rule => rule.object === entry.scope);
  if (relation) return relation.reason;

  const fn = (rules.functions ?? []).find(rule => rule.object === entry.scope);
  if (fn) return fn.reason;

  return null;
}

function validateSnapshot(snapshot, label) {
  if (snapshot.snapshotVersion !== 1 || snapshot.catalogSchema !== 'public') {
    throw new Error(`Unsupported ${label} catalog snapshot contract.`);
  }
  for (const category of CATALOG_CATEGORIES) {
    if (!Array.isArray(snapshot[category])) {
      throw new Error(`${label} catalog snapshot is missing ${category}.`);
    }
    const keys = new Set();
    for (const entry of snapshot[category]) {
      if (!entry?.key || !entry?.scope || keys.has(entry.key)) {
        throw new Error(`${label} catalog snapshot has an invalid or duplicate ${category} key.`);
      }
      keys.add(entry.key);
    }
  }
}

export function compareCatalogs(reference, candidate, config, candidateEnvironment) {
  const unexplained = [];
  const intentional = [];
  const experimental = [];
  const counts = {};

  validateSnapshot(reference, 'reference');
  validateSnapshot(candidate, 'candidate');

  for (const category of CATALOG_CATEGORIES) {
    const referenceEntries = reference[category] ?? [];
    const candidateEntries = candidate[category] ?? [];
    const referenceByKey = new Map(referenceEntries.map(entry => [entry.key, entry]));
    const candidateByKey = new Map(candidateEntries.map(entry => [entry.key, entry]));
    let matching = 0;

    for (const [key, expected] of referenceByKey) {
      const actual = candidateByKey.get(key);
      if (!actual) {
        unexplained.push({ category, object: key, kind: 'missing' });
      } else if (!equivalent(expected, actual)) {
        const reason = intentionalReason(config, candidateEnvironment, category, actual);
        const finding = { category, object: key, kind: 'different', fields: changedFields(expected, actual), reason };
        if (reason) intentional.push(finding);
        else unexplained.push(finding);
      } else {
        matching += 1;
      }
    }

    for (const [key, entry] of candidateByKey) {
      if (referenceByKey.has(key)) continue;
      const reason = intentionalReason(config, candidateEnvironment, category, entry);
      const finding = { category, object: key, kind: 'additional', reason };
      if (reason) intentional.push(finding);
      else if (candidateEnvironment === 'sandbox') experimental.push(finding);
      else unexplained.push(finding);
    }

    counts[category] = {
      reference: referenceEntries.length,
      candidate: candidateEntries.length,
      matching,
    };
  }

  let status = 'PASS — supported schema parity';
  if (unexplained.length > 0) status = 'FAIL — unexplained Production/' + candidateEnvironment + ' drift';
  else if (candidateEnvironment === 'sandbox' && (experimental.length > 0 || intentional.length > 0)) status = 'PASS WITH SANDBOX-ONLY/EXPERIMENTAL DIFFERENCES';
  else if (intentional.length > 0) status = 'PASS WITH INTENTIONAL DIFFERENCES';

  return { status, counts, unexplained, intentional, experimental };
}

export function formatRolloutStatus(ledger) {
  validateRolloutLedger(ledger);
  const lines = [
    '| Foundation / migration | Sandbox | Production | Demo |',
    '| --- | --- | --- | --- |',
  ];
  for (const foundation of ledger.foundations) {
    lines.push(`| ${foundation.id} | ${foundation.environments.sandbox.status} | ${foundation.environments.production.status} | ${foundation.environments.demo.status} |`);
  }
  return lines.join('\n');
}
