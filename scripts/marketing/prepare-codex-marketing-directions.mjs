#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { validateMarketingDirectionPreparation } from './marketing-direction-preparation-contract.mjs';

const PROJECTS = {
  sandbox: 'zpzdkoaubyjtsomccxya',
  demo: 'bdytwgejqnlblhrnqxkp',
  production: 'uqgtheclhxqlnjpfmheq',
};

function fail(message) {
  throw new Error(message);
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

async function readInput(path) {
  const content = path === '-' ? await readFile(0, 'utf8') : await readFile(path, 'utf8');
  try {
    return JSON.parse(content);
  } catch {
    fail('Marketing Direction preparation is not valid JSON.');
  }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) fail('Usage: prepare-codex-marketing-directions.mjs <directions.json|->');

  const input = await readInput(inputPath);
  const preparation = await validateMarketingDirectionPreparation(input);
  const target = requiredEnvironment('SERVSYNC_MARKETING_TARGET');
  if (!(target in PROJECTS)) fail('SERVSYNC_MARKETING_TARGET must be sandbox, demo, or production.');
  if (target === 'production' && process.env.SERVSYNC_MARKETING_ALLOW_PRODUCTION !== 'true') {
    fail('Production Direction preparation requires separate authorization and SERVSYNC_MARKETING_ALLOW_PRODUCTION=true.');
  }
  if (target === 'demo' && process.env.SERVSYNC_MARKETING_ALLOW_DEMO !== 'true') {
    fail('Demo Direction preparation requires separate authorization and SERVSYNC_MARKETING_ALLOW_DEMO=true.');
  }

  const supabaseUrl = requiredEnvironment('SERVSYNC_MARKETING_SUPABASE_URL');
  const anonKey = requiredEnvironment('SERVSYNC_MARKETING_SUPABASE_ANON_KEY');
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (projectRef !== PROJECTS[target]) fail('Marketing target does not match the configured Supabase project.');

  const suppliedToken = process.env.SERVSYNC_MARKETING_ACCESS_TOKEN?.trim();
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(suppliedToken ? { global: { headers: { Authorization: `Bearer ${suppliedToken}` } } } : {}),
  });

  try {
    if (!suppliedToken) {
      const email = requiredEnvironment('SERVSYNC_MARKETING_ADMIN_EMAIL');
      const password = requiredEnvironment('SERVSYNC_MARKETING_ADMIN_PASSWORD');
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) fail('Marketing platform-admin authentication failed.');
    }

    const { data: userData, error: userError } = await client.auth.getUser(suppliedToken);
    if (userError || !userData.user) fail('Marketing operator identity could not be verified.');
    const { data: profiles, error: profileError } = await client.from('profiles').select('role').eq('id', userData.user.id).limit(1);
    if (profileError || profiles?.[0]?.role !== 'platform_admin') fail('Marketing Direction preparation requires a platform-admin account.');

    const { data: before, error: beforeError } = await client.rpc('servsync_get_internal_marketing_directions', {});
    if (beforeError || !before?.accepted_plan) fail('Accepted Marketing Plan could not be verified.');
    if (
      before.accepted_plan.plan_id !== preparation.source_plan_id
      || before.accepted_plan.revision_number !== preparation.source_plan_revision
      || before.accepted_plan.item_count !== preparation.directions.length
    ) fail('Direction preparation does not match the current accepted Marketing Plan.');

    const { data: receipt, error: prepareError } = await client.rpc('servsync_prepare_internal_marketing_directions', {
      p_preparation_request_id: preparation.preparation_request_id,
      p_plan_id: preparation.source_plan_id,
      p_expected_plan_revision: preparation.source_plan_revision,
      p_truth_pack_version: preparation.truth_pack_version,
      p_preparation_source: preparation.preparation_source,
      p_direction_mode: preparation.direction_mode,
      p_owner_input: preparation.owner_input,
      p_directions: preparation.directions,
    });
    if (prepareError) fail(`Marketing Direction preparation failed (${prepareError.code || 'server_error'}).`);
    if (
      !receipt
      || receipt.source_plan_id !== preparation.source_plan_id
      || receipt.source_plan_revision !== preparation.source_plan_revision
      || receipt.direction_count !== preparation.directions.length
      || !Array.isArray(receipt.direction_ids)
    ) fail('Marketing Direction preparation returned an invalid receipt.');

    const { data: after, error: afterError } = await client.rpc('servsync_get_internal_marketing_directions', {});
    if (afterError || !Array.isArray(after?.directions)) fail('Prepared Marketing Directions could not be verified.');
    const prepared = after.directions.filter(direction => receipt.direction_ids.includes(direction.direction_id));
    if (
      prepared.length !== preparation.directions.length
      || prepared.some(direction => (
        direction.source_plan_id !== preparation.source_plan_id
        || direction.source_plan_revision !== preparation.source_plan_revision
        || direction.direction_status !== 'draft'
        || direction.preparation_source !== 'codex_assisted'
        || direction.truth_pack_version !== preparation.truth_pack_version
      ))
    ) fail('Prepared Marketing Directions failed durable verification.');

    process.stdout.write(`${JSON.stringify({
      target,
      preparationRequestId: receipt.preparation_request_id,
      sourcePlanId: receipt.source_plan_id,
      sourcePlanRevision: receipt.source_plan_revision,
      directionCount: receipt.direction_count,
      directionIds: receipt.direction_ids,
      replayed: receipt.replayed,
      status: receipt.status,
    })}\n`);
  } finally {
    if (!suppliedToken) await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Marketing Direction preparation failed.'}\n`);
  process.exitCode = 1;
});
