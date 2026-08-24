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

function selectedConfigKeys() {
  return new Set([
    'VITE_SUPABASE_URL',
    ...Object.keys(contract.workflowParityFlags),
    ...Object.keys(contract.intentionalDemoDifferences),
    ...contract.demoExternalEffects.falseOrAbsent,
  ]);
}

async function readPublicBundle(alias) {
  const origin = `https://${alias}`;
  const response = await fetch(origin);
  if (!response.ok) throw new Error(`Active application bundle returned HTTP ${response.status}.`);
  const html = await response.text();
  const queue = [...html.matchAll(/(?:src|href)=["']([^"']+\.js)["']/gi)].map(match => new URL(match[1], origin).href);
  if (queue.length === 0) throw new Error('Active application bundle did not expose a script entrypoint.');
  const visited = new Set();
  const scripts = [];
  while (queue.length > 0) {
    const source = queue.shift();
    if (visited.has(source)) continue;
    if (visited.size >= 200) throw new Error('Active application bundle exceeded the bounded script inventory.');
    visited.add(source);
    const asset = await fetch(source);
    if (!asset.ok) throw new Error(`Active application script returned HTTP ${asset.status}.`);
    const script = await asset.text();
    scripts.push(script);
    for (const match of script.matchAll(/(?:\.\.\/|\.\/|\/)?assets\/[A-Za-z0-9_.-]+\.js/g)) {
      const reference = match[0].startsWith('assets/') ? `/${match[0]}` : match[0];
      const discovered = new URL(reference, source).href;
      if (new URL(discovered).origin === origin && !visited.has(discovered)) queue.push(discovered);
    }
  }
  return scripts.join('\n');
}

async function capture(name) {
  const expected = contract.environments[name];
  const alias = await getJson(`/v4/aliases/${encodeURIComponent(expected.alias)}`);
  const deploymentId = alias.deploymentId || alias.deployment?.id;
  if (!deploymentId) throw new Error(`${name}: active alias did not resolve to a deployment identity.`);
  const [deployment, project, publicBundle] = await Promise.all([
    getJson(`/v13/deployments/${encodeURIComponent(deploymentId)}`),
    getJson(`/v9/projects/${encodeURIComponent(expected.vercelProjectId)}`),
    readPublicBundle(expected.alias),
  ]);
  const configuredKeys = [...new Set(Array.isArray(deployment.env) ? deployment.env : [])].sort();
  const allowed = selectedConfigKeys();
  const values = {};
  for (const key of allowed) {
    if (!configuredKeys.includes(key)) continue;
    if (key === 'VITE_SUPABASE_URL') {
      values[key] = publicBundle.includes(`https://${expected.supabaseProjectRef}.supabase.co`)
        ? `https://${expected.supabaseProjectRef}.supabase.co`
        : 'configured-without-expected-public-target';
    } else if (Object.hasOwn(contract.workflowParityFlags, key)) {
      values[key] = contract.workflowParityFlags[key] === null ? 'configured' : contract.workflowParityFlags[key];
    } else if (Object.hasOwn(contract.intentionalDemoDifferences, key)) {
      const expectedValue = contract.intentionalDemoDifferences[key];
      values[key] = key.endsWith('_PROJECT_REF') && !publicBundle.includes(expectedValue)
        ? 'configured-without-expected-public-target'
        : expectedValue;
    } else {
      values[key] = 'configured';
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
