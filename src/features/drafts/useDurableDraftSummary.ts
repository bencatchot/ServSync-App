import { useEffect, useMemo, useState } from 'react';
import type { Inspection } from '../../types';
import { listContractorWorkDrafts, type DurableDraftSupabaseClient } from './durableDraftLaunchApi';
import type { DurableDraftCompatibilityCapabilities } from './durableDraftLaunchTypes';
import { durableDraftSafeMessage } from './durableDraftComposerIntegration';
import { durableDraftListRowsToPresentation, type DurableDraftListPresentation } from './durableDraftMappings';
import { durableDraftPrimaryListCount, durableDraftPrimaryListRows } from './durableDraftListSelectors';

export type DurableDraftSummaryState = {
  status: 'loading' | 'ready' | 'error';
  count: number;
  error: string;
};

export function useDurableDraftSummary({
  client,
  capabilities,
  capabilityLoading,
  capabilityError,
  legacyDrafts,
  enabled,
}: {
  client: DurableDraftSupabaseClient | null;
  capabilities: DurableDraftCompatibilityCapabilities;
  capabilityLoading: boolean;
  capabilityError: string;
  legacyDrafts: Inspection[];
  enabled: boolean;
}): DurableDraftSummaryState {
  const [rows, setRows] = useState<DurableDraftListPresentation[]>([]);
  const [state, setState] = useState<Omit<DurableDraftSummaryState, 'count'>>({
    status: 'loading',
    error: '',
  });

  useEffect(() => {
    let active = true;
    if (!enabled || capabilityLoading) {
      setRows([]);
      setState({ status: 'loading', error: '' });
      return () => { active = false; };
    }
    if (capabilityError) {
      setRows([]);
      setState({ status: 'error', error: capabilityError });
      return () => { active = false; };
    }
    if (!client || !capabilities.canReadDrafts || !capabilities.contractorId) {
      setRows([]);
      setState({ status: 'ready', error: '' });
      return () => { active = false; };
    }

    setState({ status: 'loading', error: '' });
    void listContractorWorkDrafts(client, { statuses: ['active', 'consumed'] })
      .then(listRows => {
        if (!active) return;
        setRows(durableDraftPrimaryListRows(durableDraftListRowsToPresentation(listRows)));
        setState({ status: 'ready', error: '' });
      })
      .catch(error => {
        if (!active) return;
        setRows([]);
        setState({ status: 'error', error: durableDraftSafeMessage(error, 'list') });
      });

    return () => { active = false; };
  }, [
    capabilities.canReadDrafts,
    capabilities.contractorId,
    capabilityError,
    capabilityLoading,
    client,
    enabled,
  ]);

  const count = useMemo(
    () => durableDraftPrimaryListCount(rows, legacyDrafts),
    [legacyDrafts, rows],
  );

  return { ...state, count };
}
