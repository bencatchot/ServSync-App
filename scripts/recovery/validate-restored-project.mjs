#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReadOnlyCatalogQuery, CATALOG_CATEGORIES } from '../backend-parity/lib.mjs';

export const PROTECTED_PROJECT_REFS = new Set([
  'uqgtheclhxqlnjpfmheq',
  'bdytwgejqnlblhrnqxkp',
  'zpzdkoaubyjtsomccxya',
]);

export function assertRecoveryTarget(project, expectedProjectRef) {
  if (!expectedProjectRef || project?.id !== expectedProjectRef) {
    throw new Error('Recovery target identity did not match the exact requested project ref.');
  }
  if (PROTECTED_PROJECT_REFS.has(expectedProjectRef)) {
    throw new Error('Recovery validation refuses Production, Demo, and Sandbox project refs.');
  }
  if (!project.name?.startsWith('servsync-recovery-drill-')) {
    throw new Error('Recovery target name must use the servsync-recovery-drill- prefix.');
  }
  if (project.status !== 'ACTIVE_HEALTHY') {
    throw new Error('Recovery target is not ACTIVE_HEALTHY.');
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

export function catalogSummary(snapshot) {
  if (snapshot?.snapshotVersion !== 2) throw new Error('Catalog snapshot contract is invalid.');
  const counts = {};
  for (const category of CATALOG_CATEGORIES) {
    if (!Array.isArray(snapshot[category])) throw new Error(`Catalog snapshot is missing ${category}.`);
    counts[category] = snapshot[category].length;
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(stableValue(snapshot))).digest('hex');
  return { fingerprint, counts };
}

export function validationStatus(result) {
  const relationshipIssues = Object.values(result.relationshipViolations ?? {}).reduce((sum, value) => sum + Number(value), 0);
  const financialIssues = Object.values(result.financialViolations ?? {}).reduce((sum, value) => sum + Number(value), 0);
  return relationshipIssues === 0 && financialIssues === 0 ? 'PASS' : 'PASS_WITH_FINDINGS';
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : '';
}

async function managementRequest(path, token, init = {}) {
  const response = await fetch(`https://api.supabase.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase Management API returned HTTP ${response.status}.`);
  return response.json();
}

async function run() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required and is never printed.');
  const projectRef = argumentValue('--project-ref');
  if (!projectRef) throw new Error('--project-ref is required.');

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = join(scriptDirectory, '..', '..');
  const [project, catalogSql, validationSql] = await Promise.all([
    managementRequest(`/v1/projects/${projectRef}`, token),
    readFile(join(repositoryRoot, 'scripts', 'backend-parity', 'catalog-query.sql'), 'utf8'),
    readFile(join(scriptDirectory, 'recovery-validation-query.sql'), 'utf8'),
  ]);
  assertRecoveryTarget(project, projectRef);
  assertReadOnlyCatalogQuery(catalogSql);
  assertReadOnlyCatalogQuery(validationSql);

  const [catalogResponse, validationResponse] = await Promise.all([
    managementRequest(`/v1/projects/${projectRef}/database/query`, token, {
      method: 'POST', body: JSON.stringify({ query: catalogSql }),
    }),
    managementRequest(`/v1/projects/${projectRef}/database/query`, token, {
      method: 'POST', body: JSON.stringify({ query: validationSql }),
    }),
  ]);
  const catalog = catalogSummary(catalogResponse?.[0]?.snapshot);
  const validation = validationResponse?.[0]?.result;
  if (!validation?.counts || !validation?.relationshipViolations || !validation?.financialViolations) {
    throw new Error('Recovery integrity query returned an invalid result.');
  }

  console.log(JSON.stringify({
    status: validationStatus(validation),
    target: { projectRef: project.id, name: project.name, region: project.region, health: project.status },
    catalog,
    integrity: validation,
    note: 'Storage rows are metadata only. Object-byte recovery requires a separate authenticated check.',
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(`Recovery validation failed safely: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
