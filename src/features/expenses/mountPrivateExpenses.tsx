import type { SupabaseClient } from '@supabase/supabase-js';
import type { TradeSectionContractorRole } from '../trade-sections/tradeSectionAvailability';
import { DurableExpenseDrawer } from './DurableExpenseDrawer';

export function createPrivateExpenseRenderer(client:SupabaseClient|null, workspaceId:string|undefined, userId:string, role:TradeSectionContractorRole, backendUrl:string|undefined) {
  // Review only. Both guards fail closed for a production or hosted Preview build.
  const enabled = import.meta.env.DEV && import.meta.env.VITE_SERVSYNC_DEV_JOB_EXPENSES === 'true'
    && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/.test(backendUrl ?? '');
  const manager = role==='owner'||role==='admin'||role==='office';
  return (kind:'estimate'|'job',id:string,contractorId:string) =>
    enabled && client && workspaceId===contractorId && (manager||(kind==='job'&&role==='field_tech'))
      ? <DurableExpenseDrawer key={`${userId}:${contractorId}:${kind}:${id}`} client={client} scope={{kind,id}} />
      : null;
}
