import bundleText from '../../../public/legal/servsync-2026-10-01-v1.json?raw';

export type LegalRoute = 'terms' | 'privacy' | 'acceptable-use' | 'contractor-agreement';
export type PublicSignupRole = 'homeowner' | 'contractor';
export type SignupContext = 'standard' | 'contractor_invitation' | 'local_customer_claim';
export type PolicyBundle = {
  bundleId: string;
  preparedOn: string;
  effectiveDate: string | null;
  releaseReady: boolean;
  operator: string | null;
  privacyEmail: string | null;
  pages: Record<LegalRoute, { title: string; sections: Array<{ title: string; body: string }> }>;
  assent: Record<PublicSignupRole, string>;
};
export const POLICY_BUNDLE = JSON.parse(bundleText) as PolicyBundle;
export const LEGAL_PAGES = POLICY_BUNDLE.pages;
export const POLICY_ARCHIVE_URL = `/legal/${POLICY_BUNDLE.bundleId}.json`;

export function legalSignupMetadata(role: PublicSignupRole, context: SignupContext, accepted: boolean) {
  if (!accepted) throw new Error('Please review and accept the platform terms and acknowledge the Privacy Policy.');
  return {
    bundle_id: POLICY_BUNDLE.bundleId,
    terms_agreed: true,
    privacy_acknowledged: true,
    acceptable_use_agreed: true,
    contractor_agreed: role === 'contractor',
    us_adult_confirmed: true,
    context,
  };
}

// The database independently validates the same version during Auth insertion.
// This preflight makes an uninstalled/inactive release fail clearly, not silently
// create an account that lacks durable evidence. No client timestamp is trusted.
export async function requireCurrentLegalBundle(client: {
  rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
}) {
  const { data, error } = await client.rpc('servsync_current_legal_bundle');
  const expectedHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bundleText))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const current = data as { bundle_id?: unknown; policy_sha256?: unknown } | null;
  if (error || current?.bundle_id !== POLICY_BUNDLE.bundleId || current?.policy_sha256 !== expectedHash) {
    throw new Error('Account creation is temporarily unavailable while our policy version is updated. Reload and review the policies before trying again. Existing users can still sign in.');
  }
}
