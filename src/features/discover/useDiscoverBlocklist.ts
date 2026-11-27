import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { DISCOVER_BLOCK_EVENT } from './discoverSafetyApi';

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
type Snapshot = { viewerId: string; blocked: Set<string> | null };

export function useDiscoverBlocklist(viewerId: string) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ viewerId, blocked: null });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    const receive = (event: Event) => {
      const id: unknown = (event as CustomEvent).detail;
      if (!isUuid(id)) return;
      setSnapshot(current => current.viewerId === viewerId && current.blocked
        ? { viewerId, blocked: new Set([...current.blocked, id]) }
        : current);
      retry();
    };
    window.addEventListener(DISCOVER_BLOCK_EVENT, receive);
    return () => window.removeEventListener(DISCOVER_BLOCK_EVENT, receive);
  }, [retry, viewerId]);

  useEffect(() => {
    const client = supabase;
    let current = true;
    void (async () => {
      try {
        if (!client) throw new Error();
        const { data, error } = await client.rpc('servsync_list_blocked_discover_contractor_ids');
        if (error || !Array.isArray(data) || !data.every(isUuid)) throw new Error();
        if (current) setSnapshot({ viewerId, blocked: new Set(data) });
      } catch {
        if (current) setSnapshot({ viewerId, blocked: null });
      }
    })();
    return () => { current = false; };
  }, [revision, viewerId]);

  return { blocked: viewerId === snapshot.viewerId ? snapshot.blocked : null, retry };
}
