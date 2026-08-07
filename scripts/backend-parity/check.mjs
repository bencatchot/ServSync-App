#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_CATEGORIES,
  assertReadOnlyCatalogQuery,
  compareCatalogs,
  readJson,
  validateParityConfig,
} from './lib.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, '..', '..');
const configPath = join(repositoryRoot, 'config', 'backend-environment-parity.json');
const queryPath = join(scriptDirectory, 'catalog-query.sql');
const requested = process.argv.includes('--demo-only') ? ['demo']
  : process.argv.includes('--sandbox-only') ? ['sandbox']
    : ['demo', 'sandbox'];
const verbose = process.argv.includes('--verbose');

function fail(message) {
  console.error(`Backend parity check failed safely: ${message}`);
  process.exitCode = 1;
}

async function managementRequest(path, token, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`https://api.supabase.com${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!response.ok) throw new Error(`Supabase Management API returned HTTP ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyEnvironmentIdentity(name, expected, token) {
  const project = await managementRequest(`/v1/projects/${expected.projectRef}`, token);
  if (project.id !== expected.projectRef
    || project.name !== expected.projectName
    || project.organization_id !== expected.organizationId) {
    throw new Error(`${name} identity did not match the fixed project ref, name, and organization.`);
  }
  if (project.status !== 'ACTIVE_HEALTHY') {
    throw new Error(`${name} project is not ACTIVE_HEALTHY.`);
  }
  return project;
}

async function captureSnapshot(name, environment, token, sql) {
  await verifyEnvironmentIdentity(name, environment, token);
  const response = await managementRequest(`/v1/projects/${environment.projectRef}/database/query`, token, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });
  const snapshot = response?.[0]?.snapshot;
  if (!snapshot || snapshot.snapshotVersion !== 2) {
    throw new Error(`${name} returned an invalid catalog snapshot.`);
  }
  return snapshot;
}

function printResult(candidateName, result) {
  console.log(`\nProduction vs ${candidateName}`);
  console.log(result.status);
  console.log('| Category | Production | Candidate | Matching |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const category of CATALOG_CATEGORIES) {
    const count = result.counts[category];
    console.log(`| ${category} | ${count.reference} | ${count.candidate} | ${count.matching} |`);
  }

  for (const [label, findings, defaultLimit] of [
    ['Approved intentional additions', result.intentional, 12],
    ['Definition-format', result.formatOnly, Number.POSITIVE_INFINITY],
    ['Unexplained', result.unexplained, Number.POSITIVE_INFINITY],
  ]) {
    if (findings.length === 0) continue;
    console.log(`\n${label}${label.endsWith('additions') ? '' : ' differences'} (${findings.length}):`);
    const shown = verbose ? findings : findings.slice(0, defaultLimit);
    for (const finding of shown) {
      const fields = finding.fields?.length ? ` [fields: ${finding.fields.join(', ')}]` : '';
      console.log(`- ${finding.category}: ${finding.kind} ${finding.object}${fields}${finding.reason ? ` — ${finding.reason}` : ''}`);
      if (finding.kind === 'fingerprint-mismatch') {
        console.log(`  expected counts/key/catalog: ${JSON.stringify(finding.expected.counts)} / ${finding.expected.keyFingerprint} / ${finding.expected.catalogFingerprint}`);
        console.log(`  actual counts/key/catalog: ${JSON.stringify(finding.actual.counts)} / ${finding.actual.keyFingerprint} / ${finding.actual.catalogFingerprint}`);
      }
    }
    if (shown.length < findings.length) {
      console.log(`- … ${findings.length - shown.length} more; rerun with --verbose for the complete list.`);
    }
  }
}

try {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required and is never printed.');

  const [config, sql] = await Promise.all([readJson(configPath), readFile(queryPath, 'utf8')]);
  validateParityConfig(config);
  assertReadOnlyCatalogQuery(sql);

  const production = await captureSnapshot('production', config.environments.production, token, sql);
  let failed = false;
  for (const candidateName of requested) {
    const candidate = await captureSnapshot(candidateName, config.environments[candidateName], token, sql);
    const result = compareCatalogs(production, candidate, config, candidateName);
    printResult(candidateName, result);
    failed ||= result.unexplained.length > 0;
  }
  if (failed) process.exitCode = 2;
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
