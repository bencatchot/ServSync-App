import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LocalInvoiceDeliveryLinkMetadata,
  RequestFreeInvoiceDeliveryLookup,
} from '../../types';

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

type DeliveryMutationResult = {
  link: LocalInvoiceDeliveryLinkMetadata;
  token: string;
};

function requireResult<T>(data: unknown, fallback: string): T {
  if (!data || typeof data !== 'object') throw new Error(fallback);
  return data as T;
}

function requireOneTimeToken(data: unknown) {
  const result = requireResult<DeliveryMutationResult>(data, 'ServSync did not return the new delivery link.');
  if (!TOKEN_PATTERN.test(result.token ?? '')) {
    throw new Error('ServSync did not return a valid one-time delivery link.');
  }
  return result;
}

export async function listLocalInvoiceDeliveryLinks(client: SupabaseClient, invoiceId: string) {
  const { data, error } = await client.rpc('servsync_list_local_invoice_delivery_links', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data as LocalInvoiceDeliveryLinkMetadata[];
}

export async function createLocalInvoiceDeliveryLink(
  client: SupabaseClient,
  invoiceId: string,
  expiresDays: number,
) {
  const { data, error } = await client.rpc('servsync_create_local_invoice_delivery_link', {
    p_invoice_id: invoiceId,
    p_expires_days: expiresDays,
  });
  if (error) throw error;
  return requireOneTimeToken(data);
}

export async function rotateLocalInvoiceDeliveryLink(
  client: SupabaseClient,
  linkId: string,
  expiresDays: number,
) {
  const { data, error } = await client.rpc('servsync_rotate_local_invoice_delivery_link', {
    p_link_id: linkId,
    p_expires_days: expiresDays,
  });
  if (error) throw error;
  return requireOneTimeToken(data);
}

export async function revokeLocalInvoiceDeliveryLink(client: SupabaseClient, linkId: string) {
  const { data, error } = await client.rpc('servsync_revoke_local_invoice_delivery_link', {
    p_link_id: linkId,
  });
  if (error) throw error;
  return requireResult<LocalInvoiceDeliveryLinkMetadata>(data, 'ServSync did not confirm the link revocation.');
}

export async function lookupRequestFreeInvoice(client: SupabaseClient, token: string) {
  if (!TOKEN_PATTERN.test(token)) {
    return { state: 'invalid' } satisfies RequestFreeInvoiceDeliveryLookup;
  }
  const { data, error } = await client.rpc('servsync_lookup_local_invoice_delivery', {
    p_token: token,
  });
  if (error) throw new Error('Invoice lookup is temporarily unavailable.');
  return requireResult<RequestFreeInvoiceDeliveryLookup>(data, 'Invoice lookup is temporarily unavailable.');
}
