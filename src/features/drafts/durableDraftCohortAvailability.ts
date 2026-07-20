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

const DISABLED_DURABLE_DRAFT_COHORT_AVAILABILITY: DurableDraftCohortAvailability = {
  status: 'disabled',
  canUseDurableDrafts: false,
  contractorId: null,
  sessionIdentity: null,
  checkedAt: null,
  errorKind: null,
};

function rpcRow(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.length === 1) return value[0];
    throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  }
  return value;
}

export function parseDurableDraftCohortEntitlement(
  value: unknown,
  expectedContractorId: string,
): DurableDraftCohortRpcRow | null {
  const row = rpcRow(value);
  if (row === null || row === undefined) return null;
  if (typeof row !== 'object') throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  const record = row as Record<string, unknown>;
  const fields = Object.keys(record).sort();
  if (
    fields.length !== 2
    || fields[0] !== 'can_use_durable_drafts'
    || fields[1] !== 'contractor_id'
    || record.contractor_id !== expectedContractorId
    || typeof record.can_use_durable_drafts !== 'boolean'
  ) {
    throw new Error('DRAFT_COHORT_RESPONSE_INVALID');
  }
  return {
    contractor_id: expectedContractorId,
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
  const result = await client.rpc('servsync_current_contractor_durable_draft_entitlement', {
    p_contractor_id: contractorId,
  });
  if (result.error) throw new Error('DRAFT_COHORT_RPC_FAILED');
  return parseDurableDraftCohortEntitlement(result.data, contractorId);
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
    const requestGeneration = ++generation.current;
    if (!client || !globalMasterEnabled || !contractorId || !sessionIdentity) {
      commit(DISABLED_DURABLE_DRAFT_COHORT_AVAILABILITY);
      return;
    }

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
    }
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
  }, []);

  return { availability, refresh };
}
