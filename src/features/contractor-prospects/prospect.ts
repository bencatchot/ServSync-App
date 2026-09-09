import { supabase } from '../../supabaseClient';

export type ProspectDetails = {
  business_name: string; contact_name: string; email: string; phone: string;
  website_url: string; logo_url: string; city: string; state: string; zip_code: string;
  business_summary: string; service_categories: string[]; service_zip_codes: string[];
};
export type PublicProspect = { id: string; slug: string; claim_status?: 'unclaimed' | 'claimed'; details: Partial<ProspectDetails> };
export type AdminProspect = PublicProspect & {
  details: ProspectDetails; revision: number; published: boolean; invited_email: string | null;
  expires_at: string | null; claimed_at: string | null; status: 'draft' | 'pending' | 'expired' | 'revoked' | 'claimed';
};
export type ClaimReview = PublicProspect & { revision: number; published?: boolean };
export const UNCLAIMED_COPY = 'This business hasn’t claimed its ServSync profile yet and cannot receive requests.';
export const blankProspect = (): ProspectDetails => ({
  business_name: '', contact_name: '', email: '', phone: '', website_url: '', logo_url: '',
  city: '', state: '', zip_code: '', business_summary: '', service_categories: [], service_zip_codes: [],
});
export const prospectInput = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100';
export const prospectButton = 'inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50';
export function prospectError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unable to complete this action. Please try again.';
}
export function prospectUnavailable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'PGRST202');
}
export async function prospectRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('ServSync is unavailable.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
