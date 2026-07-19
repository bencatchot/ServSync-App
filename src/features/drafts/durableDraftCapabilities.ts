import {
  normalizeDurableDraftError,
  type DurableDraftSupabaseClient,
} from './durableDraftLaunchApi';
import type { DurableDraftCompatibilityCapabilities } from './durableDraftLaunchTypes';

type CapabilityClient = DurableDraftSupabaseClient & {
  auth: {
    getUser: () => PromiseLike<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
};

type CurrentContractorProfile = {
  id: string;
  owner_user_id: string;
};

export type DurableDraftCompatibilityChecks = {
  contractorId: string | null;
  currentUserId: string | null;
  contractorOwnerUserId: string | null;
  canAccessContractor: boolean;
  canManageBilling: boolean;
  canWriteJobs: boolean;
};

// These are current compatibility boundaries, not permanent employee-role policy.
export function capabilitiesFromCompatibilityChecks(
  checks: DurableDraftCompatibilityChecks,
): DurableDraftCompatibilityCapabilities {
  const hasTenantContext = Boolean(checks.contractorId && checks.currentUserId);
  if (!hasTenantContext) {
    return {
      contractorId: null,
      canReadDrafts: false,
      canPersistDraft: false,
      canImportLegacyDraft: false,
      canLaunchJob: false,
      canLaunchEstimate: false,
    };
  }

  return {
    contractorId: checks.contractorId,
    canReadDrafts: checks.canAccessContractor,
    canPersistDraft: checks.canManageBilling || checks.canWriteJobs,
    canImportLegacyDraft: checks.canManageBilling,
    canLaunchJob: checks.canWriteJobs,
    canLaunchEstimate: checks.contractorOwnerUserId === checks.currentUserId,
  };
}

async function capabilityRpc(
  client: DurableDraftSupabaseClient,
  functionName: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) throw normalizeDurableDraftError(result.error, 'capability', result.status);
    return result.data;
  } catch (error) {
    throw normalizeDurableDraftError(error, 'capability');
  }
}

function currentContractorProfile(value: unknown): CurrentContractorProfile | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.owner_user_id === 'string'
    ? { id: record.id, owner_user_id: record.owner_user_id }
    : null;
}

async function currentUserId(client: CapabilityClient): Promise<string | null> {
  try {
    const result = await client.auth.getUser();
    if (result.error) throw normalizeDurableDraftError(result.error, 'capability');
    return result.data.user?.id ?? null;
  } catch (error) {
    throw normalizeDurableDraftError(error, 'capability');
  }
}

export async function loadDurableDraftCapabilities(
  client: CapabilityClient,
): Promise<DurableDraftCompatibilityCapabilities> {
  const [userId, profileData] = await Promise.all([
    currentUserId(client),
    capabilityRpc(client, 'servsync_current_contractor_profile'),
  ]);
  const profile = currentContractorProfile(profileData);

  // A platform administrator without the existing tenant context remains fail-closed.
  if (!userId || !profile) {
    return capabilitiesFromCompatibilityChecks({
      contractorId: null,
      currentUserId: userId,
      contractorOwnerUserId: null,
      canAccessContractor: false,
      canManageBilling: false,
      canWriteJobs: false,
    });
  }

  const helperArgs = { p_contractor_id: profile.id };
  const [canAccess, canManageBilling, canWriteJobs] = await Promise.all([
    capabilityRpc(client, 'current_user_can_access_contractor', helperArgs),
    capabilityRpc(client, 'current_user_can_manage_contractor_billing', helperArgs),
    capabilityRpc(client, 'current_user_can_write_contractor_jobs', helperArgs),
  ]);

  return capabilitiesFromCompatibilityChecks({
    contractorId: profile.id,
    currentUserId: userId,
    contractorOwnerUserId: profile.owner_user_id,
    canAccessContractor: canAccess === true,
    canManageBilling: canManageBilling === true,
    canWriteJobs: canWriteJobs === true,
  });
}
