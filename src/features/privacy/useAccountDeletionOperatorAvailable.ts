import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';

export function useAccountDeletionOperatorAvailable(accountId: string) {
  const [allowed, setAllowed] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const c = new AbortController();
    void supabase.rpc('servsync_closure_operator_available').abortSignal(c.signal).then(({ data, error }) => {
      if (!c.signal.aborted) setAllowed(!error && data === true ? accountId : null);
    });
    return () => c.abort();
  }, [accountId]);
  return allowed === accountId;
}
