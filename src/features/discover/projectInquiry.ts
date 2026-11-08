import type { SupabaseClient } from '@supabase/supabase-js';
import { appHashRoute } from '../../appLinks';

// Only public identifiers travel through authentication/property setup. Never
// persist a homeowner's message, property selection, permissions, or media here.
export type PublicProjectReference = {
  postId: string;
  contractorId: string;
  slug: string;
  title: string;
  postedAt: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const projectUnavailable = 'This public post is no longer available for this contractor. Remove the reference to continue, or return to their profile and choose a current post.';

export async function loadPublicProject(client: SupabaseClient, contractorId: string, slug: string, postId: string): Promise<PublicProjectReference> {
  if (!uuid.test(postId) || !uuid.test(contractorId) || !slug || slug.length > 200) throw new Error(projectUnavailable);
  const profile = await client.rpc('servsync_get_public_contractor_profile', { p_slug: slug });
  if (profile.error) throw new Error('The public post could not be checked. Please retry before sending.');
  if (profile.data?.contractor_id !== contractorId) throw new Error(projectUnavailable);
  // Filter the public projection itself, not the six most recent profile cards
  // and never contractor_posts/private job tables.
  const result = await client.rpc('servsync_discover_feed', {
    p_category: null, p_location: null, p_radius_miles: null, p_search_lat: null, p_search_lng: null,
  }).eq('contractor_id', contractorId).eq('post_id', postId).limit(1);
  if (result.error) throw new Error('The public post could not be checked. Please retry before sending.');
  const post = result.data?.[0];
  if (!post || post.post_id !== postId || post.contractor_id !== contractorId || typeof post.title !== 'string' || typeof post.created_at !== 'string') throw new Error(projectUnavailable);
  return { postId, contractorId, slug, title: post.title.replace(/\s+/g, ' ').trim().slice(0, 160), postedAt: post.created_at };
}

export function projectReferenceText(project: PublicProjectReference) {
  // Relative, same-app link and exact ID. No untrusted URL, photos, address, or
  // claim that this contractor-authored update verifies completed work.
  return `Public post referenced by homeowner: ${project.title}\n${appHashRoute('profile', { slug: project.slug, post: project.postId })}`;
}

export async function appendPublicProject(client: SupabaseClient, text: string, project: PublicProjectReference | undefined, contractorId: string) {
  if (!project) return text;
  if (project.contractorId !== contractorId) throw new Error('The public post belongs to a different contractor. Remove the reference before sending.');
  const current = await loadPublicProject(client, contractorId, project.slug, project.postId);
  if (current.title !== project.title || current.postedAt !== project.postedAt) throw new Error('This public post changed. Remove the reference and choose the updated post before sending.');
  return [text, projectReferenceText(current)].filter(Boolean).join('\n\n');
}
