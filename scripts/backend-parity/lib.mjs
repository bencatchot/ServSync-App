import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const CATALOG_CATEGORIES = [
  'relations',
  'managedRelations',
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

const EXPECTED_ENVIRONMENTS = Object.freeze({
  production: Object.freeze({
    projectRef: 'uqgtheclhxqlnjpfmheq',
    projectName: 'ServSync Production',
    organizationId: 'bktpuodtbjodamwsmuce',
    role: 'supported-schema-reference',
  }),
  demo: Object.freeze({
    projectRef: 'bdytwgejqnlblhrnqxkp',
    projectName: 'ServSync Demo',
    organizationId: 'bktpuodtbjodamwsmuce',
    role: 'supported-schema-peer',
  }),
  sandbox: Object.freeze({
    projectRef: 'zpzdkoaubyjtsomccxya',
    projectName: 'ServSync Sandbox',
    organizationId: 'bktpuodtbjodamwsmuce',
    role: 'experimental-peer',
  }),
});

const ROLLOUT_STATUSES = new Set(['Applied', 'Pending', 'N/A', 'Intentionally deferred']);
const ENVIRONMENT_NAMES = ['sandbox', 'production', 'demo'];
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PROVEN_FORMAT_PREFIX = 'proven-format-v1\u001d';
const RAW_DEFINITION_PREFIX = 'raw-definition-v1\u001d';

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

function sameIdentity(actual, expected) {
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value);
}

function validateAdditionGroup(group, environmentName, identities) {
  if (!group?.id?.trim() || !group.reason?.trim()) {
    throw new Error(`Invalid intentional-addition group for ${environmentName}.`);
  }
  const selectors = group.selectors;
  if (!selectors
    || !Array.isArray(selectors.relationScopes)
    || !Array.isArray(selectors.functionScopes)
    || !Array.isArray(selectors.exactObjects)) {
    throw new Error(`Invalid selectors for ${environmentName} addition group ${group.id}.`);
  }

  const selectorCount = selectors.relationScopes.length
    + selectors.functionScopes.length
    + selectors.exactObjects.length;
  if (selectorCount === 0) {
    throw new Error(`Addition group ${group.id} must select at least one exact object or scope.`);
  }

  for (const [kind, values] of Object.entries(selectors)) {
    for (const value of values) {
      if (typeof value !== 'string' || !value.trim() || value.includes('*')) {
        throw new Error(`Addition group ${group.id} has an invalid ${kind} selector.`);
      }
      const identity = `${kind}:${value}`;
      if (identities.has(identity)) {
        throw new Error(`Intentional-addition selector is duplicated for ${environmentName}: ${identity}.`);
      }
      identities.add(identity);
      if (kind === 'exactObjects') {
        const separator = value.indexOf(':');
        if (separator < 1 || !CATALOG_CATEGORIES.includes(value.slice(0, separator))) {
          throw new Error(`Addition group ${group.id} has an invalid exact object selector.`);
        }
      }
    }
  }

  if (!group.expectedCounts || typeof group.expectedCounts !== 'object') {
    throw new Error(`Addition group ${group.id} is missing expected category counts.`);
  }
  for (const [category, count] of Object.entries(group.expectedCounts)) {
    if (!CATALOG_CATEGORIES.includes(category) || !Number.isInteger(count) || count < 0) {
      throw new Error(`Addition group ${group.id} has an invalid expected count for ${category}.`);
    }
  }
  if (!FINGERPRINT_PATTERN.test(group.expectedKeyFingerprint ?? '')
    || !FINGERPRINT_PATTERN.test(group.expectedCatalogFingerprint ?? '')) {
    throw new Error(`Addition group ${group.id} requires SHA-256 key and catalog fingerprints.`);
  }
}

export function validateParityConfig(config) {
  if (config.schemaVersion !== 2 || config.authoritativeEnvironment !== 'production') {
    throw new Error('Parity config must use schemaVersion 2 with Production as the authority.');
  }
  if (JSON.stringify(config.catalogSchemas) !== JSON.stringify(['public'])) {
    throw new Error('Parity config and catalog query must remain scoped to the public application schema.');
  }
  if (JSON.stringify(config.managedRelationSecurity) !== JSON.stringify(['storage.objects'])
    || JSON.stringify(config.additionalPolicySchemas) !== JSON.stringify(['storage'])) {
    throw new Error('Parity config must include bounded storage.objects security and storage policies.');
  }

  const refs = new Set();
  for (const name of ENVIRONMENT_NAMES) {
    const environment = config.environments?.[name];
    if (!sameIdentity(environment, EXPECTED_ENVIRONMENTS[name])) {
      throw new Error(`${name} must retain its immutable approved project identity and role.`);
    }
    if (refs.has(environment.projectRef)) {
      throw new Error(`Environment project refs are not unique: ${environment.projectRef}.`);
    }
    refs.add(environment.projectRef);
  }

  for (const environmentName of ['demo', 'sandbox']) {
    const rules = config.intentionalAdditions?.[environmentName];
    if (!Array.isArray(rules)) {
      throw new Error(`Missing intentional-addition groups for ${environmentName}.`);
    }
    const ids = new Set();
    const selectors = new Set();
    for (const group of rules) {
      if (ids.has(group.id)) {
        throw new Error(`Intentional-addition group id is duplicated for ${environmentName}: ${group.id}.`);
      }
      ids.add(group.id);
      validateAdditionGroup(group, environmentName, selectors);
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

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function readQuoted(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === quote) {
      if (source[index + 1] === quote) {
        index += 2;
        continue;
      }
      return { end: index + 1 };
    }
    if (quote === "'" && source[index] === '\\') return null;
    index += 1;
  }
  return null;
}

function readDollarQuoted(source, start) {
  let delimiter = '$$';
  if (!source.startsWith(delimiter, start)) {
    const delimiterEnd = source.indexOf('$', start + 1);
    if (delimiterEnd < 0) return null;
    const tag = source.slice(start + 1, delimiterEnd);
    if (!/^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*$/u.test(tag)) return null;
    delimiter = `$${tag}$`;
  }
  const end = source.indexOf(delimiter, start + delimiter.length);
  if (end < 0) return null;
  return { delimiter, end: end + delimiter.length };
}

function normalizeProvenFormatting(source) {
  const parts = [];
  let index = 0;
  let pendingSeparator = null;

  const markSeparator = hasNewline => {
    if (hasNewline || pendingSeparator === null) pendingSeparator = hasNewline ? '\n' : ' ';
  };
  const append = value => {
    if (parts.length > 0 && pendingSeparator !== null) parts.push(pendingSeparator);
    pendingSeparator = null;
    parts.push(value);
  };

  while (index < source.length) {
    const character = source[index];
    if (/[ \t\f\r\n]/.test(character)) {
      let hasNewline = false;
      while (index < source.length && /[ \t\f\r\n]/.test(source[index])) {
        hasNewline ||= source[index] === '\r' || source[index] === '\n';
        index += 1;
      }
      markSeparator(hasNewline);
      continue;
    }
    if (source.startsWith('--', index)) {
      const end = source.indexOf('\n', index + 2);
      markSeparator(end >= 0);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < source.length && depth > 0) {
        if (source.startsWith('/*', cursor)) {
          depth += 1;
          cursor += 2;
        } else if (source.startsWith('*/', cursor)) {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      if (depth !== 0) return null;
      markSeparator(/[\r\n]/.test(source.slice(index, cursor)));
      index = cursor;
      continue;
    }
    if (character === "'" || character === '"') {
      const quoted = readQuoted(source, index, character);
      if (!quoted) return null;
      append(source.slice(index, quoted.end));
      index = quoted.end;
      continue;
    }
    if (character === '$') {
      const quoted = readDollarQuoted(source, index);
      if (quoted) {
        append(source.slice(index, quoted.end));
        index = quoted.end;
        continue;
      }
    }
    append(character);
    index += 1;
  }
  return parts.join('');
}

export function canonicalizeFunctionDefinition(definition) {
  const bodyStart = /^AS[ \t]+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)[ \t]*$/im.exec(definition);
  if (!bodyStart) {
    const normalized = normalizeProvenFormatting(definition);
    return normalized === null
      ? `${RAW_DEFINITION_PREFIX}${definition}`
      : `${PROVEN_FORMAT_PREFIX}${normalized}`;
  }

  const delimiter = bodyStart[1];
  const opening = bodyStart.index + bodyStart[0].lastIndexOf(delimiter);
  const bodyOffset = opening + delimiter.length;
  const closing = definition.indexOf(delimiter, bodyOffset);
  if (closing < 0) return `${RAW_DEFINITION_PREFIX}${definition}`;

  const prefix = definition.slice(0, opening);
  const body = definition.slice(bodyOffset, closing);
  const suffix = definition.slice(closing + delimiter.length);
  const normalized = [prefix, body, suffix].map(normalizeProvenFormatting);
  if (normalized.some(value => value === null)) return `${RAW_DEFINITION_PREFIX}${definition}`;
  return `${PROVEN_FORMAT_PREFIX}${normalized.join('\u001e')}`;
}

function comparableFunctionDefinition(entry) {
  if (entry.language && !['sql', 'plpgsql'].includes(entry.language)) {
    return `${RAW_DEFINITION_PREFIX}${entry.definition ?? ''}`;
  }
  return canonicalizeFunctionDefinition(entry.definition ?? '');
}

function normalizedEntry(category, entry) {
  if (category !== 'functions' || typeof entry.definition !== 'string') return stableValue(entry);
  return stableValue({
    ...entry,
    definition: comparableFunctionDefinition(entry),
  });
}

function entryComparison(category, left, right) {
  const logicalEquivalent = stableJson(normalizedEntry(category, left)) === stableJson(normalizedEntry(category, right));
  const exactEquivalent = stableJson(left) === stableJson(right);
  return {
    logicalEquivalent,
    formatOnly: category === 'functions' && logicalEquivalent && !exactEquivalent,
  };
}

function changedFields(category, left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(field => {
      if (category === 'functions' && field === 'definition') {
        return comparableFunctionDefinition(left) !== comparableFunctionDefinition(right);
      }
      return stableJson(left[field]) !== stableJson(right[field]);
    })
    .sort();
}

function validateSnapshot(snapshot, label) {
  if (snapshot.snapshotVersion !== 2 || snapshot.catalogSchema !== 'public') {
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

function matchesAdditionGroup(group, category, entry) {
  return group.selectors.relationScopes.includes(entry.scope)
    || group.selectors.functionScopes.includes(entry.scope)
    || group.selectors.exactObjects.includes(`${category}:${entry.key}`);
}

export function fingerprintAdditionEntries(entries) {
  const ordered = [...entries].sort((left, right) => {
    const categoryOrder = CATALOG_CATEGORIES.indexOf(left.category) - CATALOG_CATEGORIES.indexOf(right.category);
    return categoryOrder || left.entry.key.localeCompare(right.entry.key);
  });
  const counts = {};
  for (const { category } of ordered) counts[category] = (counts[category] ?? 0) + 1;
  const keys = ordered.map(({ category, entry }) => `${category}:${entry.key}`);
  const catalog = ordered.map(({ category, entry }) => ({ category, entry: normalizedEntry(category, entry) }));
  return {
    counts,
    keyFingerprint: sha256(stableJson(keys)),
    catalogFingerprint: sha256(stableJson(catalog)),
  };
}

function expectedCountsEqual(expected, actual) {
  const normalizedExpected = Object.fromEntries(Object.entries(expected).filter(([, count]) => count > 0));
  return stableJson(normalizedExpected) === stableJson(actual);
}

export function compareCatalogs(reference, candidate, config, candidateEnvironment) {
  const unexplained = [];
  const intentional = [];
  const formatOnly = [];
  const counts = {};
  const additions = [];
  const claimedAdditionGroups = new Map();

  validateParityConfig(config);
  validateSnapshot(reference, 'reference');
  validateSnapshot(candidate, 'candidate');

  for (const category of CATALOG_CATEGORIES) {
    const referenceEntries = reference[category];
    const candidateEntries = candidate[category];
    const referenceByKey = new Map(referenceEntries.map(entry => [entry.key, entry]));
    const candidateByKey = new Map(candidateEntries.map(entry => [entry.key, entry]));
    let matching = 0;

    for (const [key, expected] of referenceByKey) {
      const actual = candidateByKey.get(key);
      if (!actual) {
        unexplained.push({ category, object: key, kind: 'missing' });
        continue;
      }
      const comparison = entryComparison(category, expected, actual);
      if (!comparison.logicalEquivalent) {
        unexplained.push({
          category,
          object: key,
          kind: 'logical-drift',
          fields: changedFields(category, expected, actual),
        });
      } else {
        matching += 1;
        if (comparison.formatOnly) {
          formatOnly.push({ category, object: key, kind: 'definition-format-drift', fields: ['definition'] });
        }
      }
    }

    for (const [key, entry] of candidateByKey) {
      if (!referenceByKey.has(key)) additions.push({ category, entry });
    }

    counts[category] = {
      reference: referenceEntries.length,
      candidate: candidateEntries.length,
      matching,
    };
  }

  const approvedEntries = new Set();
  for (const group of config.intentionalAdditions[candidateEnvironment] ?? []) {
    const selected = additions.filter(({ category, entry }) => matchesAdditionGroup(group, category, entry));
    for (const selectedEntry of selected) {
      const identity = `${selectedEntry.category}:${selectedEntry.entry.key}`;
      const claimedBy = claimedAdditionGroups.get(identity);
      if (claimedBy) {
        throw new Error(`Intentional addition ${identity} is ambiguously selected by ${claimedBy} and ${group.id}.`);
      }
      claimedAdditionGroups.set(identity, group.id);
    }
    const actual = fingerprintAdditionEntries(selected);
    const valid = expectedCountsEqual(group.expectedCounts, actual.counts)
      && group.expectedKeyFingerprint === actual.keyFingerprint
      && group.expectedCatalogFingerprint === actual.catalogFingerprint;
    if (!valid) {
      unexplained.push({
        category: 'intentionalAdditionGroups',
        object: group.id,
        kind: 'fingerprint-mismatch',
        reason: group.reason,
        expected: {
          counts: group.expectedCounts,
          keyFingerprint: group.expectedKeyFingerprint,
          catalogFingerprint: group.expectedCatalogFingerprint,
        },
        actual,
      });
      for (const selectedEntry of selected) approvedEntries.add(selectedEntry);
      continue;
    }
    for (const selectedEntry of selected) {
      approvedEntries.add(selectedEntry);
      intentional.push({
        category: selectedEntry.category,
        object: selectedEntry.entry.key,
        kind: 'approved-addition',
        reason: group.reason,
        group: group.id,
      });
    }
  }

  for (const addition of additions) {
    if (!approvedEntries.has(addition)) {
      unexplained.push({ category: addition.category, object: addition.entry.key, kind: 'unapproved-addition' });
    }
  }

  let status = 'PASS — supported schema parity';
  if (unexplained.length > 0) status = `FAIL — unexplained Production/${candidateEnvironment} drift`;
  else if (candidateEnvironment === 'sandbox' && intentional.length > 0) status = 'PASS WITH APPROVED SANDBOX EXPERIMENTS';
  else if (intentional.length > 0) status = 'PASS WITH INTENTIONAL DIFFERENCES';
  else if (formatOnly.length > 0) status = 'PASS WITH DEFINITION-FORMAT DIFFERENCES';

  return { status, counts, unexplained, intentional, formatOnly };
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
