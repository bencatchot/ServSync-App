import type { SupabaseClient } from '@supabase/supabase-js';
import type { Inspection } from '../../types';
import type { createPrivateExpenseRenderer } from '../expenses/mountPrivateExpenses';
import { TradeSectionJobPanel } from '../trade-sections/TradeSectionJobPanel';
import { DURABLE_TRADE_SECTIONS_UI_ENABLED, shouldMountTradeSectionJobPanel, type TradeSectionContractorRole } from '../trade-sections/tradeSectionAvailability';
import { inspectionJobStatus } from './status';

export function ContractorJobSupplement({job,client,contractorId,role,renderExpenses}:{
  job:Inspection;
  client:SupabaseClient|null;
  contractorId:string|undefined;
  role:TradeSectionContractorRole;
  renderExpenses:ReturnType<typeof createPrivateExpenseRenderer>;
}) {
  const jobStatus=inspectionJobStatus(job);
  return <>
    {renderExpenses('job',job.id,job.contractor_id)}
    {client && contractorId && shouldMountTradeSectionJobPanel({
      enabled:DURABLE_TRADE_SECTIONS_UI_ENABLED,role,jobStatus,recordStatus:job.status,
    }) && <TradeSectionJobPanel client={client} contractorId={contractorId} jobId={job.id} jobStatus={jobStatus}
      recordStatus={job.status} role={role} enabled={DURABLE_TRADE_SECTIONS_UI_ENABLED}/>}
  </>;
}
