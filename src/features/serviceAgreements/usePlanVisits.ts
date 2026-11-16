import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceAgreement } from '../../types';
import type { PlanVisit, PlanWithVisits } from './visits';

class PlanActorChanged extends Error {}
export async function assertPlanActor(client: SupabaseClient, actorId: string) {
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== actorId) throw new PlanActorChanged('Account changed. Reopen Service Plans in your current account.');
}

export function usePlanVisits(client: SupabaseClient, actorId: string, contractorId?: string, sharedPlan?: ServiceAgreement) {
  const scope = `${actorId}:${contractorId ?? ''}:${sharedPlan?.id ?? ''}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const [state, setState] = useState<{ scope: string; items: PlanWithVisits[]; loading: boolean; error: string }>({ scope, items: [], loading: true, error: '' });
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState(previous => ({ scope, items: previous.scope === scope ? previous.items : [], loading: true, error: '' }));
    try {
      await assertPlanActor(client, actorId);
      let plans = sharedPlan ? [sharedPlan] : [];
      if (contractorId) {
        const { data, error } = await client.from('service_agreements').select('*').eq('contractor_id', contractorId).order('created_at', { ascending: false });
        if (error) throw error;
        plans = data ?? [];
      }
      const items = await Promise.all(plans.map(async plan => {
        const { data, error } = await client.rpc('servsync_get_plan_visits', { p_agreement_id: plan.id });
        if (error) throw error;
        return { plan, visits: (data ?? []) as PlanVisit[] };
      }));
      if (request === generation.current && scope === currentScope.current) setState({ scope, items, loading: false, error: '' });
    } catch (failure) {
      const clear = failure instanceof PlanActorChanged || (failure && typeof failure === 'object' && 'code' in failure && failure.code === '42501');
      if (request === generation.current && scope === currentScope.current) setState(previous => ({ scope,
        items: !clear && previous.scope === scope ? previous.items : [], loading: false,
        error: clear ? 'Visit access changed. Reopen Service Plans in your current account.' : 'Visit tracking could not be refreshed. Any displayed progress is from the last successful load. Your edits are kept. Retry; tracking may not be available in this environment yet.' }));
    }
  }, [client, actorId, scope, contractorId, sharedPlan]);
  useEffect(() => {
    const invalidate = () => { ++generation.current; };
    void reload();
    const refresh = () => void reload();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== actorId) {
        ++generation.current;
        setState({ scope, items: [], loading: false, error: 'Account changed. Reopen Service Plans in your current account.' });
      }
    });
    window.addEventListener('focus', refresh);
    window.addEventListener('servsync:plan-visits-changed', refresh);
    return () => {
      invalidate();
      data.subscription.unsubscribe();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('servsync:plan-visits-changed', refresh);
    };
  }, [client, actorId, reload, scope]);
  return { ...(state.scope === scope ? state : { items: [], loading: true, error: '' }), reload };
}
