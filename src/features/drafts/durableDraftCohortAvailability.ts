import { useCallback, useEffect, useRef, useState } from 'react';

export const DURABLE_DRAFT_COHORT_REFRESH_TTL_MS = 60_000;

export type DurableDraftCohortAvailability =
  | {
      status: 'disabled';
      canUseDurableDrafts: false;
      contractorId: null;
      sessionIdentity: null;
      checkedAt: null;
      errorKind: null;
    }
  | {
      status: 'loading';
      canUseDurableDrafts: false;
      contractorId: string;
      sessionIdentity: string;
      checkedAt: null;
      errorKind: null;
    }
  | {
      status: 'resolved';
      canUseDurableDrafts: boolean;
      contractorId: string;
      sessionIdentity: string;
      checkedAt: number;
      errorKind: null;
    }
  | {
      status: 'error';
      canUseDurableDrafts: false;
      contractorId: string;
      sessionIdentity: string;
      checkedAt: number;
      errorKind: 'rpc' | 'response';
    };

type DurableDraftCohortRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type DurableDraftCohortRpcRow = {
  contractor_id: string;
  can_use_durable_drafts: boolean;
};

type InFlightEntitlementRequest = {
  client: DurableDraftCohortRpcClient;
  contractorId: string;
  sessionIdentity: string;
  generation: number;
  promise: Promise<void>;
};

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DISABLED_DURABLE_DRAFT_COHORT_AVAILABILITY: DurableDraftCohortAvailability = {
  status: 'disabled',
  canUseDurableDrafts: false,
  contractorId: null,
  sessionIdentity: null,
  checkedAt: null,
  errorKind: null,
};

export function normalizeDurableDraftCohortUuid(value: unknown): string | null {
  return typeof value === 'string' && CANONICAL_UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function rpcRow(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 1) {
    if (Array.isArray(value) && value.length === 0) return null;
    throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  }
  return value[0];
}

export function parseDurableDraftCohortEntitlement(
  value: unknown,
  expectedContractorId: unknown,
): DurableDraftCohortRpcRow | null {
  const normalizedExpectedContractorId = normalizeDurableDraftCohortUuid(expectedContractorId);
  if (!normalizedExpectedContractorId) throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  const row = rpcRow(value);
  if (row === null || row === undefined) return null;
  if (typeof row !== 'object') throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  const record = row as Record<string, unknown>;
  const fields = Object.keys(record).sort();
  const normalizedReturnedContractorId = normalizeDurableDraftCohortUuid(record.contractor_id);
  if (
    fields.length !== 2
    || fields[0] !== 'can_use_durable_drafts'
    || fields[1] !== 'contractor_id'
    || !normalizedReturnedContractorId
    || normalizedReturnedContractorId !== normalizedExpectedContractorId
    || typeof record.can_use_durable_drafts !== 'boolean'
  ) {
    throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  }
  return {
    contractor_id: normalizedExpectedContractorId,
    can_use_durable_drafts: record.can_use_durable_drafts,
  };
}

export function isGlobalDurableDraftMasterEnabled(input: {
  sharedDraftComposerEnabled: boolean;
  draftJobUiEnabled: boolean;
  contractorWorkUiEnabled: boolean;
  demoPresentationActive: boolean;
}) {
  return input.sharedDraftComposerEnabled
    && input.draftJobUiEnabled
    && input.contractorWorkUiEnabled
    && !input.demoPresentationActive;
}

export function canSeeDurableDraftWorkflow(input: {
  globalMasterEnabled: boolean;
  availability: DurableDraftCohortAvailability;
  activeContractorId: string | null;
  activeSessionIdentity: string | null;
  validContractorContext: boolean;
  demoPresentationActive: boolean;
}) {
  return input.globalMasterEnabled
    && input.validContractorContext
    && !input.demoPresentationActive
    && input.availability.status === 'resolved'
    && input.availability.canUseDurableDrafts
    && input.availability.contractorId === input.activeContractorId
    && input.availability.sessionIdentity === input.activeSessionIdentity;
}

export async function loadDurableDraftCohortEntitlement(
  client: DurableDraftCohortRpcClient,
  contractorId: string,
): Promise<DurableDraftCohortRpcRow | null> {
  const normalizedContractorId = normalizeDurableDraftCohortUuid(contractorId);
  if (!normalizedContractorId) throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  const result = await client.rpc('servsync_current_contractor_durable_draft_entitlement', {
    p_contractor_id: normalizedContractorId,
  });
  if (result.error) throw new Error('DRAFT_COHORT_RPC_FAILED');
  return parseDurableDraftCohortEntitlement(result.data, normalizedContractorId);
}

export function useDurableDraftCohortAvailability(input: {
  client: DurableDraftCohortRpcClient | null;
  contractorId: string | null;
  sessionIdentity: string | null;
  globalMasterEnabled: boolean;
  now?: () => number;
  refreshTtlMs?: number;
}) {
  const now = input.now ?? Date.now;
  const refreshTtlMs = input.refreshTtlMs ?? DURABLE_DRAFT_COHORT_REFRESH_TTL_MS;
  const generation = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef<InFlightEntitlementRequest | null>(null);
  const stateRef = useRef<DurableDraftCohortAvailability>(DISABLED_DURABLE_DRAFT_COHORT_AVAILABILITY);
  const [availability, setAvailability] = useState<DurableDraftCohortAvailability>(
    DISABLED_DURABLE_DRAFT_COHORT_AVAILABILITY,
  );

  const commit = useCallback((next: DurableDraftCohortAvailability) => {
    if (!mounted.current) return;
    stateRef.current = next;
    setAvailability(next);
  }, []);

  const refresh = useCallback(async () => {
    const { client, contractorId, globalMasterEnabled, sessionIdentity } = input;
    if (!client || !globalMasterEnabled || !contractorId || !sessionIdentity) {
      generation.current += 1;
      inFlight.current = null;
      commit(DISABLED_DURABLE_DRAFT_COHORT_AVAILABILITY);
      return;
    }

    const currentInFlight = inFlight.current;
    if (
      currentInFlight
      && currentInFlight.client === client
      && currentInFlight.contractorId === contractorId
      && currentInFlight.sessionIdentity === sessionIdentity
      && currentInFlight.generation === generation.current
    ) {
      return currentInFlight.promise;
    }

    const requestGeneration = ++generation.current;

    const current = stateRef.current;
    const refreshingResolvedContext = current.status === 'resolved'
      && current.contractorId === contractorId
      && current.sessionIdentity === sessionIdentity;
    if (!refreshingResolvedContext) {
      commit({
        status: 'loading',
        canUseDurableDrafts: false,
        contractorId,
        sessionIdentity,
        checkedAt: null,
        errorKind: null,
      });
    }

    let request: InFlightEntitlementRequest | null = null;
    const promise = (async () => {
      try {
        const entitlement = await loadDurableDraftCohortEntitlement(client, contractorId);
        if (!mounted.current || generation.current !== requestGeneration) return;
        commit({
          status: 'resolved',
          canUseDurableDrafts: entitlement?.can_use_durable_drafts === true,
          contractorId,
          sessionIdentity,
          checkedAt: now(),
          errorKind: null,
        });
      } catch (error) {
        if (!mounted.current || generation.current !== requestGeneration) return;
        commit({
          status: 'error',
          canUseDurableDrafts: false,
          contractorId,
          sessionIdentity,
          checkedAt: now(),
          errorKind: error instanceof Error && error.message === 'DRAFT_COHORT_RESPONSE_INVALID'
            ? 'response'
            : 'rpc',
        });
      } finally {
        if (request && inFlight.current === request) inFlight.current = null;
      }
    })();
    request = {
      client,
      contractorId,
      sessionIdentity,
      generation: requestGeneration,
      promise,
    };
    inFlight.current = request;
    return promise;
  }, [commit, input.client, input.contractorId, input.globalMasterEnabled, input.sessionIdentity, now]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const refreshIfStale = () => {
      const current = stateRef.current;
      if (current.status === 'loading' || current.status === 'disabled') return;
      if (now() - current.checkedAt < refreshTtlMs) return;
      void refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [now, refresh, refreshTtlMs]);

  useEffect(() => () => {
    mounted.current = false;
    generation.current += 1;
    inFlight.current = null;
  }, []);

  return { availability, refresh };
}
