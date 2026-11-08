import { useEffect, useRef } from 'react';
import { buttonClass } from '../../ui/buttonClass';
import { appHashRoute } from '../../appLinks';
import type { PublicProjectReference } from './projectInquiry';

export function ProjectReference({ project, loading, error, onRemove, onRetry, disabled = false, focusOnSelection = false }: {
  project?: PublicProjectReference | null;
  loading?: boolean;
  error?: string;
  onRemove: () => void;
  onRetry?: () => void;
  disabled?: boolean;
  focusOnSelection?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusOnSelection) section.current?.focus();
  }, [focusOnSelection, project?.postId]);
  return <section ref={section} tabIndex={-1} aria-label="Public post reference" className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
    <p className="font-semibold">Ask about similar work</p>
    {loading && <p role="status">Checking public post…</p>}
    {error && <p role="alert">{error}</p>}
    {project && <>
      <a className="block break-words font-semibold text-blue-800 underline" href={appHashRoute('profile', { slug: project.slug, post: project.postId })} target="_blank" rel="noopener noreferrer">{project.title}</a>
      <p className="text-xs text-slate-600">Posted {new Date(project.postedAt).toLocaleDateString()} · Opens in a new tab</p>
      <p>This contractor-shared post will be referenced with your message when you send.</p>
    </>}
    <div className="flex flex-wrap gap-2">
      {error && onRetry && <button type="button" className={buttonClass('secondary')} onClick={onRetry} disabled={disabled}>Retry public post</button>}
      <button type="button" className={buttonClass('secondary')} onClick={onRemove} disabled={disabled}>Remove post reference</button>
    </div>
  </section>;
}
