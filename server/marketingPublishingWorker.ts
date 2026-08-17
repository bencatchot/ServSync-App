import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createFacebookPublishingAdapter,
  marketingPublishingProviders,
  sanitizeProviderFailure,
  type PublicationClaim,
} from './marketingPublishingProviders.js';
import { FacebookProviderError, type FacebookMarketingConfig } from './facebookMarketingConnection.js';

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

type WorkerClient = Pick<SupabaseClient, 'rpc' | 'storage'>;

async function workerRpc(client: WorkerClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`Worker RPC failed: ${name}`);
  return data;
}

export async function runMarketingPublishingWorker(client: WorkerClient, dependencies: {
  facebookConfig?: FacebookMarketingConfig | null;
  facebookFetcher?: typeof fetch;
} = {}) {
  const claimed = await workerRpc(client, 'servsync_claim_due_marketing_publications', { p_limit: 5 });
  const claims = Array.isArray(claimed) ? claimed as PublicationClaim[] : [];
  const result = { claimed: claims.length, published: 0, processing: 0, failed: 0 };
  const providers = {
    ...marketingPublishingProviders,
    facebook: createFacebookPublishingAdapter({
      config: dependencies.facebookConfig,
      fetcher: dependencies.facebookFetcher,
      getPageToken: async connectionId => workerRpc(client, 'servsync_private_get_marketing_facebook_page_token', {
        p_connection_id: connectionId,
      }) as Promise<string>,
      getManagedMedia: async claim => {
        const authorized = await workerRpc(client, 'servsync_prepare_marketing_publication_media', {
          p_publication_id: claim.publication_id,
          p_attempt_number: claim.attempt_number,
        });
        if (!authorized || typeof authorized !== 'object' || Array.isArray(authorized)) {
          throw new FacebookProviderError('content_validation', 'Managed Marketing media authorization failed.');
        }
        const media = authorized as Record<string, unknown>;
        const snapshot = claim.media_snapshot;
        if (!snapshot || media.asset_id !== snapshot.asset_id || media.pairing_id !== claim.media_pairing_id
          || media.storage_bucket !== snapshot.storage_bucket || media.storage_path !== snapshot.storage_path
          || media.mime_type !== snapshot.mime_type || media.sha256 !== snapshot.sha256
          || media.file_size_bytes !== snapshot.file_size_bytes) {
          throw new FacebookProviderError('content_validation', 'Managed Marketing media authorization did not match the immutable publication snapshot.');
        }
        const { data, error } = await client.storage.from('marketing-assets').download(String(media.storage_path));
        if (error || !data) throw new FacebookProviderError(
          'temporary_provider', 'Managed Marketing media could not be read.', true, false,
        );
        const bytes = new Uint8Array(await data.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (bytes.byteLength !== media.file_size_bytes || sha256 !== media.sha256) {
          throw new FacebookProviderError('content_validation', 'Managed Marketing media checksum validation failed.');
        }
        return {
          bytes,
          fileName: String(media.storage_path).split('/').at(-1) ?? '',
          mimeType: 'video/mp4' as const,
          assetId: String(media.asset_id),
          sha256,
        };
      },
    }),
  };

  for (const claim of claims) {
    const adapter = providers[claim.provider];
    const validationFailure = adapter ? adapter.validatePublication(claim) : {
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

    let prepared;
    try {
      prepared = await adapter.preparePublication(claim);
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
      continue;
    }

    try {
      if (claim.operation === 'reconcile') {
        const reconciliation = await adapter.reconcile(prepared);
        if (reconciliation.state === 'published') {
          await workerRpc(client, 'servsync_complete_marketing_publication', {
            p_publication_id: claim.publication_id,
            p_attempt_number: claim.attempt_number,
            p_provider_publication_id: claim.provider_publication_id,
            p_provider_metadata: { ...(claim.provider_metadata ?? {}), ...reconciliation.metadata },
          });
          result.published += 1;
        } else if ((claim.provider_reconciliation_count ?? 0) >= 7) {
          await workerRpc(client, 'servsync_fail_marketing_publication', {
            p_publication_id: claim.publication_id,
            p_attempt_number: claim.attempt_number,
            p_failure_category: 'provider_uncertain',
            p_failure_message: 'Facebook accepted the Video ID, but public confirmation remained pending after bounded reconciliation.',
            p_retry_eligible: false,
          });
          result.failed += 1;
        } else {
          await workerRpc(client, 'servsync_defer_marketing_provider_reconciliation', {
            p_publication_id: claim.publication_id,
            p_attempt_number: claim.attempt_number,
            p_provider_metadata: reconciliation.metadata,
          });
          result.processing += 1;
        }
        continue;
      }

      await workerRpc(client, 'servsync_mark_marketing_provider_request_started', {
        p_publication_id: claim.publication_id,
        p_attempt_number: claim.attempt_number,
      });
      const published = await adapter.publish(prepared);
      if (published.state === 'published') {
        await workerRpc(client, 'servsync_complete_marketing_publication', {
          p_publication_id: claim.publication_id,
          p_attempt_number: claim.attempt_number,
          p_provider_publication_id: published.providerPublicationId,
          p_provider_metadata: published.metadata,
        });
        result.published += 1;
      } else {
        await workerRpc(client, 'servsync_record_marketing_provider_acceptance', {
          p_publication_id: claim.publication_id,
          p_attempt_number: claim.attempt_number,
          p_provider_publication_id: published.providerPublicationId,
          p_provider_metadata: published.metadata,
        });
        const acceptedClaim = {
          ...claim,
          operation: 'reconcile' as const,
          provider_publication_id: published.providerPublicationId,
          provider_metadata: published.metadata,
          provider_reconciliation_count: 0,
        };
        const reconciliation = await adapter.reconcile({ ...prepared, claim: acceptedClaim });
        if (reconciliation.state === 'published') {
          await workerRpc(client, 'servsync_complete_marketing_publication', {
            p_publication_id: claim.publication_id,
            p_attempt_number: claim.attempt_number,
            p_provider_publication_id: published.providerPublicationId,
            p_provider_metadata: { ...published.metadata, ...reconciliation.metadata },
          });
          result.published += 1;
        } else {
          await workerRpc(client, 'servsync_defer_marketing_provider_reconciliation', {
            p_publication_id: claim.publication_id,
            p_attempt_number: claim.attempt_number,
            p_provider_metadata: reconciliation.metadata,
          });
          result.processing += 1;
        }
      }
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
