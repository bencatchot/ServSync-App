import { configuredSupabaseUrl, supabase } from '../../supabaseClient';
import { DiscoverSafetyActions } from './DiscoverSafetyActions';
import { DiscoverSafetyAdminQueue, type DiscoverSafetyQueueItem, type DiscoverSafetyDecision } from './DiscoverSafetyAdminQueue';
import { blockDiscoverContractor, reportDiscoverPost, resolveDiscoverPhotos } from './discoverSafetyApi';
import type { DiscoverFeedItem } from '../../types';

export function DiscoverPostSafety({ post, afterBlock }: { post: Pick<DiscoverFeedItem, 'post_id' | 'contractor_id' | 'title'>; afterBlock: (contractorId: string) => void }) {
  return <DiscoverSafetyActions postId={post.post_id} contractorId={post.contractor_id} title={post.title} onReport={reportDiscoverPost} onBlock={async contractorId => {
    await blockDiscoverContractor(contractorId);
    afterBlock(contractorId);
  }} />;
}

async function loadQueue(): Promise<DiscoverSafetyQueueItem[]> {
  if (!supabase) throw new Error('Review queue unavailable.');
  const { data, error } = await supabase.rpc('servsync_list_discover_safety_queue');
  if (error || !Array.isArray(data)) throw new Error('Review queue unavailable.');
  const original = data as DiscoverSafetyQueueItem[];
  const signed = await resolveDiscoverPhotos(original);
  // An expired or unavailable signed image is not equivalent to a text-only post.
  // Retain the expected count so the queue disables approval until every photo loads.
  return signed.map((item, index) => {
    const missingCount = (original[index].photos?.length ?? 0) - (item.photos?.length ?? 0);
    return missingCount > 0 ? { ...item, photos: [...(item.photos ?? []), ...Array(missingCount).fill('unavailable')] } : item;
  });
}

async function decide(id: string, kind: 'post' | 'report', decision: DiscoverSafetyDecision, reason: string): Promise<void> {
  if (!supabase) throw new Error('Review decision unavailable.');
  const { data, error } = await supabase.rpc('servsync_decide_discover_safety_item', { p_id: id, p_kind: kind, p_decision: decision, p_reason: reason });
  if (error || data !== true) throw new Error('The decision could not be saved.');
}

export function ConnectedDiscoverSafetyAdmin() {
  return <DiscoverSafetyAdminQueue loadQueue={loadQueue} onDecide={decide} imageOrigin={configuredSupabaseUrl} />;
}
