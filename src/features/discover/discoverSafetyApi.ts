import { configuredSupabaseUrl, supabase } from '../../supabaseClient';

const BUCKET = 'discover-media';
export const DISCOVER_BLOCK_EVENT = 'servsync:discover-account-blocked';
const PHOTO_TTL_SECONDS = 120;
const MAX_PHOTOS = 6;
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PHOTO_KEY = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/posts\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;
export type DiscoverSafetyReportReason = 'spam' | 'inappropriate' | 'harassment' | 'privacy' | 'other';

function isSignedDiscoverPhoto(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === new URL(configuredSupabaseUrl).origin &&
      url.pathname.startsWith('/storage/v1/object/sign/discover-media/') &&
      PHOTO_KEY.test(decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/discover-media/'.length))) &&
      Boolean(url.searchParams.get('token'));
  } catch {
    return false;
  }
}

/** No old public URLs are used. The storage service decides per object if this session may sign it. */
export async function resolveDiscoverPhotos<T extends { photos?: string[] | null }>(rows: T[]): Promise<T[]> {
  const allKeys = [...new Set(rows.flatMap(row => (row.photos ?? []).slice(0, MAX_PHOTOS).filter(key => PHOTO_KEY.test(key))))];
  const signed = new Map<string, string>();
  if (supabase) {
    for (let i = 0; i < allKeys.length; i += 50) {
      const paths = allKeys.slice(i, i + 50);
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, PHOTO_TTL_SECONDS);
      for (const item of data ?? []) {
        if (typeof item.path === 'string' && paths.includes(item.path) && !item.error &&
            typeof item.signedUrl === 'string' && isSignedDiscoverPhoto(item.signedUrl)) {
          signed.set(item.path, item.signedUrl);
        }
      }
    }
  }
  return rows.map(row => ({
    ...row,
    photos: (row.photos ?? []).slice(0, MAX_PHOTOS).flatMap(key => {
      const url = signed.get(key);
      return url ? [url] : [];
    }),
  }));
}

export async function uploadDiscoverReviewPhotos(owner: string, files: File[]): Promise<string[]> {
  if (!supabase || !UUID.test(owner)) throw new Error('Photo upload is unavailable.');
  if (files.length > MAX_PHOTOS) throw new Error('Choose up to six photos.');
  const photos = files.map(file => {
    const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[contentType];
    if (!extension || file.size <= 0 || file.size > MAX_BYTES) throw new Error('Use JPG, PNG, or WebP files up to 8 MB each.');
    return { file, contentType, extension };
  });
  const names: string[] = [];
  for (const { file, contentType, extension } of photos) {
    const key = `${owner}/posts/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(BUCKET).upload(key, file, { contentType, upsert: false });
    if (error) throw new Error('A photo could not be uploaded. Check your connection and try again.');
    names.push(key);
  }
  return names;
}

export async function reportDiscoverPost(postId: string, reason: DiscoverSafetyReportReason): Promise<string> {
  if (!supabase || !UUID.test(postId)) throw new Error('Reporting is unavailable.');
  const { data, error } = await supabase.rpc('servsync_report_discover_post', { p_post_id: postId, p_reason: reason });
  if (error || typeof data !== 'string' || !UUID.test(data)) throw new Error('The report could not be sent.');
  return data;
}

export async function blockDiscoverContractor(contractorId: string): Promise<void> {
  if (!supabase || !UUID.test(contractorId)) throw new Error('Blocking is unavailable.');
  const { data, error } = await supabase.rpc('servsync_block_discover_contractor', { p_contractor_id: contractorId });
  if (error || data !== true) throw new Error('The account could not be blocked.');
  window.dispatchEvent(new CustomEvent(DISCOVER_BLOCK_EVENT, { detail: contractorId }));
}

export type DiscoverModerationStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export async function attachOwnDiscoverModeration<T extends { post_id: string }>(rows: T[]): Promise<(T & { moderation_status: DiscoverModerationStatus })[]> {
  if (!supabase || rows.length === 0) return [];
  const { data, error } = await supabase.rpc('servsync_my_discover_post_statuses');
  if (error || !Array.isArray(data)) throw new Error('Post statuses could not be loaded.');
  const statuses = new Map(data.filter(row =>
    row && typeof row.post_id === 'string' && ['pending', 'approved', 'rejected', 'removed'].includes(row.moderation_status)
  ).map(row => [row.post_id as string, row.moderation_status as DiscoverModerationStatus]));
  return rows.map(row => ({ ...row, moderation_status: statuses.get(row.post_id) ?? 'pending' }));
}
