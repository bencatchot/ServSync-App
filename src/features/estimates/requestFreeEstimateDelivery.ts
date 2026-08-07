import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LocalEstimateDeliveryLinkMetadata,
  RequestFreeEstimateDeliveryLookup,
} from '../../types';

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

type DeliveryMutationResult = {
  link: LocalEstimateDeliveryLinkMetadata;
  token: string;
};

function requireResult<T>(data: unknown, fallback: string): T {
  if (!data || typeof data !== 'object') throw new Error(fallback);
  return data as T;
}

function requireOneTimeToken(data: unknown) {
  const result = requireResult<DeliveryMutationResult>(data, 'ServSync did not return the new Estimate link.');
  if (!TOKEN_PATTERN.test(result.token ?? '')) {
    throw new Error('ServSync did not return a valid one-time Estimate link.');
  }
  return result;
}

export async function listLocalEstimateDeliveryLinks(client: SupabaseClient, estimateId: string) {
  const { data, error } = await client.rpc('servsync_list_local_estimate_delivery_links', {
    p_estimate_id: estimateId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as LocalEstimateDeliveryLinkMetadata[] : [];
}

export async function createLocalEstimateDeliveryLink(
  client: SupabaseClient,
  estimateId: string,
  expiresDays: number,
) {
  const { data, error } = await client.rpc('servsync_create_local_estimate_delivery_link', {
    p_estimate_id: estimateId,
    p_expires_days: expiresDays,
  });
  if (error) throw error;
  return requireOneTimeToken(data);
}

export async function rotateLocalEstimateDeliveryLink(
  client: SupabaseClient,
  linkId: string,
  expiresDays: number,
) {
  const { data, error } = await client.rpc('servsync_rotate_local_estimate_delivery_link', {
    p_link_id: linkId,
    p_expires_days: expiresDays,
  });
  if (error) throw error;
  return requireOneTimeToken(data);
}

export async function revokeLocalEstimateDeliveryLink(client: SupabaseClient, linkId: string) {
  const { data, error } = await client.rpc('servsync_revoke_local_estimate_delivery_link', {
    p_link_id: linkId,
  });
  if (error) throw error;
  return requireResult<LocalEstimateDeliveryLinkMetadata>(data, 'ServSync did not confirm the Estimate-link revocation.');
}

export async function lookupRequestFreeEstimate(
  token: string | null,
  options: { request?: typeof fetch; signal?: AbortSignal } = {},
) {
  const request = options.request ?? fetch;
  const response = await request('/api/request-free-local-estimate-delivery', {
    method: 'POST',
    body: token === null ? '{}' : JSON.stringify({ token }),
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    referrerPolicy: 'no-referrer',
    signal: options.signal,
  });
  if (response.status === 429) {
    return { state: 'rate_limited' } satisfies RequestFreeEstimateDeliveryLookup;
  }
  if (!response.ok) throw new Error('Estimate lookup is temporarily unavailable.');
  const data: unknown = await response.json();
  return requireResult<RequestFreeEstimateDeliveryLookup>(data, 'Estimate lookup is temporarily unavailable.');
}
