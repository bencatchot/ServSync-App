import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  marketingPublishingProviders,
  sanitizeProviderFailure,
  type PublicationClaim,
} from './marketingPublishingProviders.js';

export const SERVSYNC_PROJECT_REFS = new Set([
  'zpzdkoaubyjtsomccxya',
  'bdytwgejqnlblhrnqxkp',
  'uqgtheclhxqlnjpfmheq',
]);

function projectRefFromUrl(value: string) {
  try {
    return new URL(value).hostname.split('.')[0] ?? '';
  } catch {
    return '';
  }
}

export function resolveMarketingPublishingConfig(environment: NodeJS.ProcessEnv = process.env) {
  const supabaseUrl = environment.SUPABASE_URL?.trim() ?? '';
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const expectedProjectRef = environment.SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey || !SERVSYNC_PROJECT_REFS.has(expectedProjectRef)) return null;
  if (projectRefFromUrl(supabaseUrl) !== expectedProjectRef) return null;
  return { supabaseUrl, serviceRoleKey, expectedProjectRef };
}

type WorkerClient = Pick<SupabaseClient, 'rpc'>;

async function workerRpc(client: WorkerClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`Worker RPC failed: ${name}`);
  return data;
}

export async function runMarketingPublishingWorker(client: WorkerClient) {
  const claimed = await workerRpc(client, 'servsync_claim_due_marketing_publications', { p_limit: 5 });
  const claims = Array.isArray(claimed) ? claimed as PublicationClaim[] : [];
  const result = { claimed: claims.length, published: 0, failed: 0 };

  for (const claim of claims) {
    const adapter = marketingPublishingProviders[claim.provider];
    const validationFailure = adapter?.validatePublication(claim) ?? {
      category: 'unsupported' as const,
      message: 'The publication provider is unsupported.',
      retryEligible: false,
      requestStarted: false,
    };
    if (validationFailure) {
      await workerRpc(client, 'servsync_fail_marketing_publication', {
        p_publication_id: claim.publication_id,
        p_attempt_number: claim.attempt_number,
        p_failure_category: validationFailure.category,
        p_failure_message: validationFailure.message,
        p_retry_eligible: validationFailure.retryEligible,
      });
      result.failed += 1;
      continue;
    }

    try {
      await workerRpc(client, 'servsync_mark_marketing_provider_request_started', {
        p_publication_id: claim.publication_id,
        p_attempt_number: claim.attempt_number,
      });
      const published = await adapter.publishText(claim);
      await workerRpc(client, 'servsync_complete_marketing_publication', {
        p_publication_id: claim.publication_id,
        p_attempt_number: claim.attempt_number,
        p_provider_publication_id: published.providerPublicationId,
        p_provider_metadata: published.metadata,
      });
      result.published += 1;
    } catch (error) {
      const failure = sanitizeProviderFailure(error);
      await workerRpc(client, 'servsync_fail_marketing_publication', {
        p_publication_id: claim.publication_id,
        p_attempt_number: claim.attempt_number,
        p_failure_category: failure.category,
        p_failure_message: failure.message,
        p_retry_eligible: failure.retryEligible,
      });
      result.failed += 1;
    }
  }
  return result;
}

export function createMarketingPublishingClient(config: NonNullable<ReturnType<typeof resolveMarketingPublishingConfig>>) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
