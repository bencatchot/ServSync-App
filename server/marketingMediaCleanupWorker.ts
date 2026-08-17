import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SERVSYNC_PROJECT_REFS } from './marketingPublishingWorker.js';

function projectRefFromUrl(value: string) {
  try {
    return new URL(value).hostname.split('.')[0] ?? '';
  } catch {
    return '';
  }
}

export function resolveMarketingMediaCleanupConfig(environment: NodeJS.ProcessEnv = process.env) {
  const supabaseUrl = environment.SUPABASE_URL?.trim() ?? '';
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const expectedProjectRef = environment.SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey || !SERVSYNC_PROJECT_REFS.has(expectedProjectRef)) return null;
  if (projectRefFromUrl(supabaseUrl) !== expectedProjectRef) return null;
  return { supabaseUrl, serviceRoleKey, expectedProjectRef };
}

export type MarketingMediaPurgeClaim = {
  asset_id: string;
  claim_token: string;
  storage_bucket: string;
  storage_path: string;
};

export type MarketingAbandonedUploadPurgeClaim = {
  intake_id: string;
  claim_token: string;
  source_bucket: string;
  source_path: string;
  poster_bucket: string;
  poster_path: string;
};

type CleanupClient = Pick<SupabaseClient, 'rpc' | 'storage'>;

async function cleanupRpc(client: CleanupClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`Marketing media cleanup RPC failed: ${name}`);
  return data;
}

export async function runMarketingMediaCleanupWorker(client: CleanupClient) {
  const claimed = await cleanupRpc(client, 'servsync_claim_marketing_media_purges', { p_limit: 5 });
  const claims = Array.isArray(claimed) ? claimed as MarketingMediaPurgeClaim[] : [];
  const remaining = Math.max(0, 5 - claims.length);
  const abandoned = remaining > 0
    ? await cleanupRpc(client, 'servsync_claim_abandoned_marketing_upload_purges', { p_limit: remaining })
    : [];
  const abandonedClaims = Array.isArray(abandoned) ? abandoned as MarketingAbandonedUploadPurgeClaim[] : [];
  const result = { claimed: claims.length + abandonedClaims.length, purged: 0, failed: 0 };

  for (const claim of claims) {
    try {
      if (!claim.asset_id || !claim.claim_token || claim.storage_bucket !== 'marketing-assets'
        || !claim.storage_path || claim.storage_path.includes('..')) {
        throw new Error('Invalid exact-object purge claim.');
      }
      const { error } = await client.storage.from(claim.storage_bucket).remove([claim.storage_path]);
      if (error) throw new Error('Exact managed-media deletion failed.');
      await cleanupRpc(client, 'servsync_complete_marketing_media_purge', {
        p_asset_id: claim.asset_id,
        p_claim_token: claim.claim_token,
        p_storage_bucket: claim.storage_bucket,
        p_storage_path: claim.storage_path,
      });
      result.purged += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Marketing media cleanup failed.';
      try {
        await cleanupRpc(client, 'servsync_fail_marketing_media_purge', {
          p_asset_id: claim.asset_id,
          p_claim_token: claim.claim_token,
          p_reason: reason.slice(0, 500),
        });
      } finally {
        result.failed += 1;
      }
    }
  }

  for (const claim of abandonedClaims) {
    try {
      const paths = [claim.source_path, claim.poster_path];
      if (!claim.intake_id || !claim.claim_token || claim.source_bucket !== 'marketing-assets'
        || claim.poster_bucket !== 'marketing-assets' || paths.some(path => !path || path.includes('..'))) {
        throw new Error('Invalid abandoned-upload purge claim.');
      }
      const { error } = await client.storage.from('marketing-assets').remove(paths);
      if (error) throw new Error('Exact abandoned-upload deletion failed.');
      await cleanupRpc(client, 'servsync_complete_abandoned_marketing_upload_purge', {
        p_intake_id: claim.intake_id,
        p_claim_token: claim.claim_token,
      });
      result.purged += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Abandoned Marketing upload cleanup failed.';
      try {
        await cleanupRpc(client, 'servsync_fail_abandoned_marketing_upload_purge', {
          p_intake_id: claim.intake_id,
          p_claim_token: claim.claim_token,
          p_reason: reason.slice(0, 500),
        });
      } finally {
        result.failed += 1;
      }
    }
  }
  return result;
}

export function createMarketingMediaCleanupClient(config: NonNullable<ReturnType<typeof resolveMarketingMediaCleanupConfig>>) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
