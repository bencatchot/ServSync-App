import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  MARKETING_CHANNEL_CATEGORIES,
  MARKETING_CONTENT_STATUSES,
  MARKETING_CONTENT_TYPES,
  type MarketingChannelCategory,
  type MarketingContentItem,
  type MarketingContentStatus,
  type MarketingContentType,
} from './marketingContent';

const STATUS_LABELS: Record<MarketingContentStatus, string> = {
  idea: 'Idea',
  draft: 'Draft',
  needs_approval: 'Needs approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

const TYPE_LABELS: Record<MarketingContentType, string> = {
  social_post: 'Social post',
  email: 'Email copy',
  website_copy: 'Website copy',
  other: 'Other',
};

const CHANNEL_LABELS: Record<MarketingChannelCategory, string> = {
  social: 'Social',
  email: 'Email',
  website: 'Website',
  other: 'Other',
};

const STATUS_STYLES: Record<MarketingContentStatus, string> = {
  idea: 'bg-slate-100 text-slate-700',
  draft: 'bg-blue-50 text-blue-700',
  needs_approval: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
};

const AUDIENCE_LABELS: Record<NonNullable<MarketingContentItem['intendedAudience']>, string> = {
  small_contractors: 'Small contractors',
  hvac_contractors: 'HVAC contractors',
  plumbers: 'Plumbers',
  electricians: 'Electricians',
  carpentry_contractors: 'Carpentry contractors',
  lawn_landscaping_contractors: 'Lawn care and landscaping contractors',
  pressure_washing_contractors: 'Pressure washing contractors',
  handyman_contractors: 'Handyman and general maintenance contractors',
  homeowners: 'Homeowners',
};

const ROLE_LABELS: Record<NonNullable<MarketingContentItem['contentRole']>, string> = {
  facebook_instagram_post: 'Facebook / Instagram post',
  linkedin_post: 'LinkedIn post',
  educational_post: 'Educational post',
  feature_highlight: 'Feature highlight',
  short_video_concept: 'Short-video concept',
  problem_solution_post: 'Problem / solution post',
  local_contractor_connection: 'Local-contractor connection',
  feature_announcement: 'Feature announcement',
  contractor_benefit: 'Contractor benefit',
  homeowner_benefit: 'Homeowner benefit',
};

function recipeLabel(value: string | null) {
  if (!value) return 'Prepared package';
  if (value === 'approved_direction_plan_v1') return 'Approved Direction plan';
  return value.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

type ContentFormValue = {
  title: string;
  contentType: MarketingContentType;
  body: string;
  channelCategory: MarketingChannelCategory | null;
};

type Props = {
  items: MarketingContentItem[];
  loading: boolean;
  loadError: string | null;
  focusRequest: { id: string | null; status: MarketingContentStatus | 'all'; token: number } | null;
  onReload: () => Promise<void>;
  onCreate: (value: ContentFormValue) => Promise<string>;
  onUpdate: (item: MarketingContentItem, value: ContentFormValue) => Promise<void>;
  onTransition: (
    item: MarketingContentItem,
    toStatus: Exclude<MarketingContentStatus, 'idea'>,
    reason?: string,
  ) => Promise<void>;
};

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function auditLabel(timestamp: string | null, actorName: string | null) {
  if (!timestamp) return 'Not recorded';
  return actorName ? `${formatDate(timestamp)} by ${actorName}` : formatDate(timestamp);
}

function itemForm(item: MarketingContentItem): ContentFormValue {
  return {
    title: item.title,
    contentType: item.contentType,
    body: item.body,
    channelCategory: item.channelCategory,
  };
}

function emptyForm(): ContentFormValue {
  return { title: '', contentType: 'social_post', body: '', channelCategory: null };
}

function ContentFields({
  value,
  disabled,
  onChange,
}: {
  value: ContentFormValue;
  disabled: boolean;
  onChange: (value: ContentFormValue) => void;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <label className="block min-w-0 text-sm font-semibold text-slate-800">
        Internal title
        <input
          value={value.title}
          disabled={disabled}
          maxLength={160}
          onChange={event => onChange({ ...value, title: event.target.value })}
          className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-50"
          placeholder="Name this content"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0 text-sm font-semibold text-slate-800">
          Content type
          <select
            value={value.contentType}
            disabled={disabled}
            onChange={event => onChange({ ...value, contentType: event.target.value as MarketingContentType })}
            className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
          >
            {MARKETING_CONTENT_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
          </select>
        </label>

        <label className="block min-w-0 text-sm font-semibold text-slate-800">
          Intended channel
          <select
            value={value.channelCategory ?? ''}
            disabled={disabled}
            onChange={event => onChange({
              ...value,
              channelCategory: event.target.value ? event.target.value as MarketingChannelCategory : null,
            })}
            className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
          >
            <option value="">Not chosen</option>
            {MARKETING_CHANNEL_CATEGORIES.map(channel => (
              <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block min-w-0 text-sm font-semibold text-slate-800">
        Content
        <textarea
          value={value.body}
          disabled={disabled}
          maxLength={10000}
          rows={10}
          onChange={event => onChange({ ...value, body: event.target.value })}
          className="mt-1.5 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 disabled:bg-slate-50"
          placeholder="Write the content to review"
        />
        <span className="mt-1 block text-right text-xs font-normal text-slate-500">{value.body.length.toLocaleString()} / 10,000</span>
      </label>
    </div>
  );
}

function StatusBadge({ status }: { status: MarketingContentStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function MarketingContentWorkspace(props: Props) {
  const [filter, setFilter] = useState<MarketingContentStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ContentFormValue>(emptyForm);
  const [reviewReason, setReviewReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(
    () => props.items.filter(item => filter === 'all' || item.status === filter),
    [filter, props.items],
  );
  const selected = props.items.find(item => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!props.focusRequest) return;
    setFilter(props.focusRequest.status);
    setSelectedId(props.focusRequest.id);
    setCreating(false);
  }, [props.focusRequest]);

  useEffect(() => {
    if (!selected) return;
    setForm(itemForm(selected));
    setReviewReason('');
    setActionError(null);
  }, [selected?.id, selected?.revisionNumber]);

  useEffect(() => {
    if (selectedId && !selected && !props.loading) setSelectedId(null);
  }, [props.loading, selected, selectedId]);

  const persistedForm = selected ? itemForm(selected) : null;
  const dirty = persistedForm !== null && JSON.stringify(form) !== JSON.stringify(persistedForm);
  const editable = selected?.status === 'idea' || selected?.status === 'draft';

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'ServSync could not complete that action.');
    } finally {
      setBusy(false);
    }
  };

  const beginCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setForm(emptyForm());
    setReviewReason('');
    setActionError(null);
  };

  const create = () => runAction(async () => {
    if (!form.title.trim()) throw new Error('Add an internal title before creating this idea.');
    const id = await props.onCreate(form);
    setCreating(false);
    setSelectedId(id);
  });

  const update = () => {
    if (!selected) return;
    void runAction(async () => {
      if (!form.title.trim()) throw new Error('Internal title is required.');
      await props.onUpdate(selected, form);
    });
  };

  const transition = (toStatus: Exclude<MarketingContentStatus, 'idea'>, reason?: string) => {
    if (!selected) return;
    void runAction(async () => {
      if (dirty) throw new Error('Save the current edits before changing status.');
      if (toStatus === 'needs_approval' && !selected.body.trim()) throw new Error('Add content before submitting for approval.');
      if (((toStatus === 'draft' && selected.status === 'needs_approval') || toStatus === 'rejected')
        && (reason?.trim().length ?? 0) < 3) {
        throw new Error('Add a review reason of at least 3 characters.');
      }
      await props.onTransition(selected, toStatus, reason);
      setReviewReason('');
    });
  };

  return (
    <section data-testid="marketing-content-workspace" className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Content</h2>
          <p className="mt-1 text-sm text-slate-500">Review manual ideas and Codex-prepared drafts, then submit only ready work for approval.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            title="Reload content"
            aria-label="Reload content"
            disabled={props.loading || busy}
            onClick={() => void props.onReload()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={beginCreate}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={17} aria-hidden="true" />
            Create content
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Content status" className="flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200 pb-2">
        {(['all', ...MARKETING_CONTENT_STATUSES] as const).map(status => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => setFilter(status)}
            className={`min-h-10 shrink-0 rounded-md px-3 text-xs font-bold ${
              filter === status ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {status === 'all' ? 'All' : STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {props.loadError && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {props.loadError}
        </div>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(15rem,0.75fr)_minmax(0,1.5fr)]">
        <div className="min-w-0" data-testid="marketing-content-list">
          {props.loading ? (
            <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading content...
            </div>
          ) : filtered.length === 0 ? (
            <div className="min-h-36 border-y border-dashed border-slate-200 px-3 py-8 text-center">
              <FileText size={22} className="mx-auto text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {props.items.length === 0 ? 'No marketing content yet' : 'No content matches this status'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {props.items.length === 0 ? 'Create the first honest internal content idea.' : 'Choose another status to continue.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setSelectedId(item.id); setCreating(false); }}
                  data-testid={`marketing-content-item-${item.id}`}
                  className={`flex w-full min-w-0 items-center gap-3 px-2 py-3 text-left hover:bg-slate-50 ${selectedId === item.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-bold text-slate-900">{item.title}</p>
                      <StatusBadge status={item.status} />
                      {item.preparationSource === 'codex_assisted' && (
                        <span
                          data-testid="marketing-codex-source-badge"
                          className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800"
                        >
                          <Sparkles size={12} aria-hidden="true" /> Codex-prepared
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {item.contentRole ? ROLE_LABELS[item.contentRole] : TYPE_LABELS[item.contentType]} · Updated {formatDate(item.updatedAt)}
                    </p>
                  </div>
                  <ChevronRight size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" data-testid="marketing-content-detail">
          {creating ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-950">New content idea</h3>
                <p className="mt-1 text-sm text-slate-500">Creating content starts an internal idea. Nothing is published or scheduled.</p>
              </div>
              <ContentFields value={form} disabled={busy} onChange={setForm} />
              {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setCreating(false)} className="min-h-11 rounded-md px-4 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="button" disabled={busy} onClick={() => void create()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
                  Create idea
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-bold text-slate-950">{selected.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">Revision {selected.revisionNumber} · Updated {formatDate(selected.updatedAt)}</p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <ContentFields value={form} disabled={!editable || busy} onChange={setForm} />

              <dl className="grid gap-3 border-y border-slate-200 py-4 text-xs sm:grid-cols-3">
                <div><dt className="font-semibold text-slate-500">Created</dt><dd className="mt-1 text-slate-800">{auditLabel(selected.createdAt, selected.createdByName)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Submitted</dt><dd className="mt-1 text-slate-800">{auditLabel(selected.submittedAt, selected.submittedByName)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Reviewed</dt><dd className="mt-1 text-slate-800">{auditLabel(selected.reviewedAt, selected.reviewedByName)}</dd></div>
              </dl>

              {selected.preparationSource !== 'manual' && (
                <div data-testid="marketing-preparation-provenance" className="border-y border-cyan-200 bg-cyan-50 px-3 py-3 text-sm text-cyan-950">
                  <div className="flex items-center gap-2 font-bold">
                    <Sparkles size={16} aria-hidden="true" />
                    {selected.preparationSource === 'codex_assisted' ? 'Codex-prepared draft' : 'AI-prepared draft'}
                  </div>
                  <p className="mt-1 leading-5">
                    {recipeLabel(selected.preparationRecipeKey)}
                    {selected.intendedAudience ? ` · ${AUDIENCE_LABELS[selected.intendedAudience]}` : ''}
                    {selected.contentRole ? ` · ${ROLE_LABELS[selected.contentRole]}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-cyan-800">
                    Prepared {formatDate(selected.preparedAt)} · {selected.truthPackVersion}
                  </p>
                  {selected.strategicSource === 'approved_direction' && (
                    <div data-testid="marketing-direction-lineage" className="mt-3 border-t border-cyan-200 pt-3">
                      <p className="font-bold">From the approved {selected.sourceDirectionTopic} Direction</p>
                      <p className="mt-1 text-xs leading-5 text-cyan-800">
                        Plan item {selected.sourcePlanItemIndex} · Direction revision {selected.sourceDirectionRevision} · Approved
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selected.reviewNote && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Review reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{selected.reviewNote}</p>
                </div>
              )}

              {selected.status === 'needs_approval' && (
                <label className="block text-sm font-semibold text-slate-800">
                  Return or rejection reason
                  <textarea
                    value={reviewReason}
                    disabled={busy}
                    maxLength={1000}
                    rows={3}
                    onChange={event => setReviewReason(event.target.value)}
                    className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                    placeholder="Explain the decision"
                  />
                </label>
              )}

              {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                {editable && dirty && (
                  <button type="button" disabled={busy} onClick={update} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Save size={17} aria-hidden="true" /> Save changes
                  </button>
                )}
                {selected.status === 'idea' && (
                  <button type="button" disabled={busy || dirty} onClick={() => transition('draft')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                    <FileText size={17} aria-hidden="true" /> Start draft
                  </button>
                )}
                {selected.status === 'draft' && (
                  <button type="button" disabled={busy || dirty || !selected.body.trim()} onClick={() => transition('needs_approval')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                    <Send size={17} aria-hidden="true" /> Submit for approval
                  </button>
                )}
                {selected.status === 'needs_approval' && (
                  <>
                    <button type="button" disabled={busy || reviewReason.trim().length < 3} onClick={() => transition('draft', reviewReason)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      <RotateCcw size={17} aria-hidden="true" /> Return to draft
                    </button>
                    <button type="button" disabled={busy || reviewReason.trim().length < 3} onClick={() => transition('rejected', reviewReason)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                      <XCircle size={17} aria-hidden="true" /> Reject
                    </button>
                    <button type="button" disabled={busy} onClick={() => transition('approved')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                      <Check size={17} aria-hidden="true" /> Approve
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center border-y border-dashed border-slate-200 px-4 text-center">
              <FileText size={24} className="text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Select content to review</p>
              <p className="mt-1 text-sm text-slate-500">Choose an item from the queue or create a new idea.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
