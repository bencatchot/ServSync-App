#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { loadMarketingContracts, validateMarketingPackage } from './marketing-package-contract.mjs';

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
  const content = path === '-'
    ? await readFile(0, 'utf8')
    : await readFile(path, 'utf8');
  try {
    return JSON.parse(content);
  } catch {
    fail('Marketing package is not valid JSON.');
  }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) fail('Usage: ingest-codex-marketing-package.mjs <package.json|->');

  const target = requiredEnvironment('SERVSYNC_MARKETING_TARGET');
  if (!(target in PROJECTS)) fail('SERVSYNC_MARKETING_TARGET must be sandbox, demo, or production.');
  if (target === 'production' && process.env.SERVSYNC_MARKETING_ALLOW_PRODUCTION !== 'true') {
    fail('Production ingestion requires separate authorization and SERVSYNC_MARKETING_ALLOW_PRODUCTION=true.');
  }
  if (target === 'demo' && process.env.SERVSYNC_MARKETING_ALLOW_DEMO !== 'true') {
    fail('Demo ingestion requires separate authorization and SERVSYNC_MARKETING_ALLOW_DEMO=true.');
  }

  const supabaseUrl = requiredEnvironment('SERVSYNC_MARKETING_SUPABASE_URL');
  const anonKey = requiredEnvironment('SERVSYNC_MARKETING_SUPABASE_ANON_KEY');
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (projectRef !== PROJECTS[target]) fail('Marketing target does not match the configured Supabase project.');

  const contracts = await loadMarketingContracts();
  const marketingPackage = validateMarketingPackage(await readInput(inputPath), contracts);
  const suppliedToken = process.env.SERVSYNC_MARKETING_ACCESS_TOKEN?.trim();
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(suppliedToken ? { global: { headers: { Authorization: `Bearer ${suppliedToken}` } } } : {}),
  });

  if (!suppliedToken) {
    const email = requiredEnvironment('SERVSYNC_MARKETING_ADMIN_EMAIL');
    const password = requiredEnvironment('SERVSYNC_MARKETING_ADMIN_PASSWORD');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) fail('Marketing platform-admin authentication failed.');
  }

  const { data: userData, error: userError } = await client.auth.getUser(suppliedToken);
  if (userError || !userData.user) fail('Marketing operator identity could not be verified.');
  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .limit(1);
  if (profileError || profiles?.[0]?.role !== 'platform_admin') fail('Marketing ingestion requires a platform-admin account.');

  const { data: receipt, error: ingestionError } = await client.rpc('servsync_ingest_internal_marketing_package', {
    p_preparation_request_id: marketingPackage.preparation_request_id,
    p_recipe_key: marketingPackage.recipe_key,
    p_truth_pack_version: marketingPackage.truth_pack_version,
    p_brief_summary: marketingPackage.brief_summary,
    p_items: marketingPackage.items,
  });
  if (ingestionError) fail(`Marketing ingestion failed (${ingestionError.code || 'server_error'}).`);
  if (!receipt || receipt.status !== 'draft' || receipt.item_count !== marketingPackage.items.length || !Array.isArray(receipt.content_ids)) {
    fail('Marketing ingestion returned an invalid receipt.');
  }

  const { data: drafts, error: listError } = await client.rpc('servsync_list_internal_marketing_content', { p_status: 'draft' });
  if (listError || !Array.isArray(drafts)) fail('Prepared Marketing drafts could not be verified.');
  const prepared = drafts.filter(item => receipt.content_ids.includes(item.content_id));
  if (
    prepared.length !== marketingPackage.items.length
    || prepared.some(item => (
      item.status !== 'draft'
      || item.preparation_source !== 'codex_assisted'
      || item.preparation_request_id !== marketingPackage.preparation_request_id
      || item.truth_pack_version !== marketingPackage.truth_pack_version
    ))
  ) {
    fail('Prepared Marketing drafts failed durable verification.');
  }

  if (!suppliedToken) await client.auth.signOut({ scope: 'local' });
  process.stdout.write(`${JSON.stringify({
    target,
    packageId: receipt.package_id,
    preparationRequestId: receipt.preparation_request_id,
    itemCount: receipt.item_count,
    contentIds: receipt.content_ids,
    replayed: receipt.replayed,
    status: receipt.status,
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Marketing ingestion failed.'}\n`);
  process.exitCode = 1;
});
