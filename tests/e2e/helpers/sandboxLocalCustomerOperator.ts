import { createClient } from '@supabase/supabase-js';
import { requiredEnv } from './env';
import { requireValidationTarget } from './validationTarget';

const SANDBOX_PROJECT_REF = 'zpzdkoaubyjtsomccxya';

function operatorClient() {
  const target = requireValidationTarget({ requireSupabaseEnv: true });
  if (target.targetName !== 'sandbox' || target.configuredProjectRef !== SANDBOX_PROJECT_REF) {
    throw new Error(`Local-customer operator tooling requires Sandbox ${SANDBOX_PROJECT_REF}.`);
  }

  return createClient(requiredEnv('TEST_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export async function deleteLocalCustomerFixtures(contactIds: string[]): Promise<void> {
  const ids = uniqueIds(contactIds);
  if (ids.length === 0) return;
  const client = operatorClient();
  const { error: deleteError } = await client.from('contractor_local_contacts').delete().in('id', ids);
  if (deleteError) throw new Error('Sandbox local-customer fixture cleanup failed.');
  const { data: survivors, error: verifyError } = await client
    .from('contractor_local_contacts')
    .select('id')
    .in('id', ids);
  if (verifyError || (survivors?.length ?? 0) !== 0) {
    throw new Error('Sandbox local-customer fixture cleanup could not be verified.');
  }
}

export async function setLocalContactClaimedAt(contactId: string, claimedAt: string | null): Promise<void> {
  const client = operatorClient();
  const { error } = await client
    .from('contractor_local_contacts')
    .update({ claimed_at: claimedAt })
    .eq('id', contactId);
  if (error) throw new Error('Sandbox local-customer claim-state setup failed.');
}

export async function setLocalHomeClaimedAt(homeId: string, claimedAt: string | null): Promise<void> {
  const client = operatorClient();
  const { error } = await client
    .from('contractor_local_homes')
    .update({ claimed_at: claimedAt })
    .eq('id', homeId);
  if (error) throw new Error('Sandbox local-property claim-state setup failed.');
}
