#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeParitySummary, validateRuntimeParity } from './lib.mjs';

const contract = JSON.parse(await readFile(resolve(process.cwd(), 'config/runtime-environment-parity.json'), 'utf8'));
const token = process.env.SERVSYNC_RUNTIME_PARITY_VERCEL_TOKEN?.trim();
const teamId = process.env.SERVSYNC_RUNTIME_PARITY_VERCEL_TEAM_ID?.trim() || contract.vercelTeamId;

function requiredToken() {
  if (!token) throw new Error('Missing SERVSYNC_RUNTIME_PARITY_VERCEL_TOKEN. No live runtime state was read.');
  return token;
}

function apiUrl(path) {
  const url = new URL(path, 'https://api.vercel.com');
  if (teamId) url.searchParams.set('teamId', teamId);
  return url;
}

async function getJson(path) {
  const response = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${requiredToken()}` },
  });
  if (!response.ok) throw new Error(`Read-only Vercel request failed with HTTP ${response.status} for ${new URL(path, 'https://api.vercel.com').pathname}.`);
  return response.json();
}

function targetsProduction(entry) {
  const targets = Array.isArray(entry.target) ? entry.target : [entry.target];
  return targets.includes('production') && !entry.gitBranch;
}

function selectedConfigKeys() {
  return new Set([
    'VITE_SUPABASE_URL',
    ...Object.keys(contract.workflowParityFlags),
    ...Object.keys(contract.intentionalDemoDifferences),
    ...contract.demoExternalEffects.falseOrAbsent,
  ]);
}

async function capture(name) {
  const expected = contract.environments[name];
  const alias = await getJson(`/v4/aliases/${encodeURIComponent(expected.alias)}`);
  const deploymentId = alias.deploymentId || alias.deployment?.id;
  if (!deploymentId) throw new Error(`${name}: active alias did not resolve to a deployment identity.`);
  const [deployment, project, envResponse] = await Promise.all([
    getJson(`/v13/deployments/${encodeURIComponent(deploymentId)}`),
    getJson(`/v9/projects/${encodeURIComponent(expected.vercelProjectId)}`),
    getJson(`/v10/projects/${encodeURIComponent(expected.vercelProjectId)}/env`),
  ]);
  const productionEntries = (envResponse.envs || []).filter(targetsProduction);
  const configuredKeys = [...new Set(productionEntries.map(entry => entry.key))].sort();
  const allowed = selectedConfigKeys();
  const values = {};
  for (const key of allowed) {
    const matches = productionEntries.filter(entry => entry.key === key);
    if (matches.length > 1) throw new Error(`${name}: ${key} has ambiguous Production-target definitions.`);
    if (matches.length === 1) {
      const entryId = matches[0].id;
      if (!entryId) throw new Error(`${name}: ${key} is missing its environment-variable identity.`);
      const decrypted = await getJson(`/v1/projects/${encodeURIComponent(expected.vercelProjectId)}/env/${encodeURIComponent(entryId)}`);
      values[key] = String(decrypted.value ?? '');
    }
  }
  return {
    alias: expected.alias,
    projectId: project.id,
    projectName: project.name,
    gitCommitSha: deployment.meta?.githubCommitSha || '',
    values,
    configuredKeys,
  };
}

export async function runLiveRuntimeParity() {
  const snapshots = {
    production: await capture('production'),
    demo: await capture('demo'),
  };
  const result = validateRuntimeParity(contract, snapshots);
  const summary = safeParitySummary(result);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLiveRuntimeParity().catch(error => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, note: 'No configuration values were logged.' })}\n`);
    process.exitCode = 1;
  });
}
