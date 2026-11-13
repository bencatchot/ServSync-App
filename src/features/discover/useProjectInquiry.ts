import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { appHashRoute } from '../../appLinks';
import { loadPublicProject, type PublicProjectReference } from './projectInquiry';

export function useProjectInquiry(slug: string, contractorId?: string) {
  const [postId, setPostId] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('post') || '');
  const [project, setProject] = useState<PublicProjectReference | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setProject(null); setError(''); setLoading(Boolean(postId && contractorId));
    if (postId && contractorId) {
      void (async () => {
        try {
          if (!supabase) throw new Error('Public post lookup is unavailable.');
          const result = await loadPublicProject(supabase, contractorId, slug, postId);
          if (current) setProject(result);
        } catch (err) {
          if (current) setError(err instanceof Error ? err.message : 'Public post lookup is unavailable.');
        } finally { if (current) setLoading(false); }
      })();
    }
    return () => { current = false; };
  }, [slug, contractorId, postId, attempt]);
  const select = (id: string) => {
    setProject(null); setError(''); setLoading(Boolean(id)); setPostId(id); setAttempt(value => value + 1);
    const mode = new URLSearchParams(window.location.hash.split('?')[1]).get('mode');
    // No hashchange/remount: preserve sign-in inputs and any open form text.
    window.history.replaceState(null, '', appHashRoute('profile', { slug, post: id, intent: id ? 'connect' : undefined, mode }));
  };
  // Do not expose a previous response during contractor or post changes.
  const verified = project?.postId === postId && project.contractorId === contractorId && project.slug === slug ? project : null;
  return { postId, project: verified, error, loading, select, remove: () => select(''), retry: () => setAttempt(value => value + 1), ready: !postId || Boolean(verified && !loading && !error) };
}
