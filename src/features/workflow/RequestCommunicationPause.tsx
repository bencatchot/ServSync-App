import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export function usePausedServiceRequests(client: SupabaseClient | null, viewerId: string, requests: { id: string }[]) {
  const [result, setResult] = useState<{ viewerId: string; ids: Set<string> }>();
  const list = useMemo(() => requests.map(request => request.id), [requests]);

  useEffect(() => {
    if (!client || !viewerId || list.length === 0) return;
    let active = true;
    void client.rpc('servsync_paused_request_messaging', { p_request_ids: list }).then(({ data, error }) => {
      if (active && !error) setResult({ viewerId, ids: new Set(Array.isArray(data) ? data : []) });
    });
    return () => { active = false; };
  }, [client, viewerId, list]);

  return result?.viewerId === viewerId ? result.ids : new Set<string>();
}

export function RequestCommunicationPausedNotice() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" role="status">
      <p>Replies, attachments, and shared notes are unavailable. You can still update appointments or close the request without a note.</p>
      <a className="font-semibold text-blue-700 underline" href="mailto:support@servsync.app">Contact ServSync support</a>
    </div>
  );
}
