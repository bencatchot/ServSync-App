import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lightbulb,
  Megaphone,
  Settings,
  Target,
  UserSearch,
  Users,
} from 'lucide-react';
import type { UserRole } from '../../types';
import {
  MARKETING_WORKSPACE_SECTIONS,
  canAccessInternalMarketing,
  type MarketingMetric,
  type MarketingOverviewData,
  type MarketingWorkspaceAudience,
  type MarketingWorkspaceSection,
} from './marketingDomain';
import {
  createMarketingContentAdapter,
  type MarketingContentItem,
  type MarketingContentRpcClient,
  type MarketingContentStatus,
} from './marketingContent';
import { MarketingContentWorkspace } from './MarketingContentWorkspace';
import { MarketingCreatePost } from './MarketingCreatePost';
import type { MarketingCreationClient } from './marketingCreation';
import { MarketingPublishingWorkspace } from './MarketingPublishingWorkspace';
import {
  createMarketingFacebookConnectionAdapter,
  marketingFacebookReturnStatus,
  type MarketingFacebookAuthClient,
} from './marketingFacebookConnection';
import {
  createMarketingPublishingAdapter,
  type MarketingPublication,
  type MarketingPublishingRpcClient,
  type MarketingPublishingState,
} from './marketingPublishing';
import {
  type MarketingMediaClient,
} from './marketingMedia';
import {
  createMarketingPlanningAdapter,
  type MarketingBusinessProfile,
  type MarketingPlan,
  type MarketingPlanCreateInput,
  type MarketingPlanningRpcClient,
  type MarketingPlanningState,
} from './marketingPlanning';
import { MarketingPlanningWorkspace } from './MarketingPlanningWorkspace';
import { MarketingUsagePanel } from './MarketingUsagePanel';
import type { MarketingUsageClient } from './marketingUsage';
import {
  createMarketingDirectionsAdapter,
  type MarketingDirection,
  type MarketingDirectionsRpcClient,
  type MarketingDirectionsState,
} from './marketingDirections';

const SECTION_PRESENTATION: Record<MarketingWorkspaceSection, { label: string; icon: typeof BarChart3 }> = {
  overview: { label: 'Overview', icon: BarChart3 },
  content: { label: 'Content', icon: FileText },
  campaigns: { label: 'Campaigns', icon: Megaphone },
  prospects: { label: 'Prospects', icon: UserSearch },
  growth: { label: 'Growth', icon: Target },
  settings: { label: 'Settings', icon: Settings },
};

const METRIC_ICONS: Record<MarketingMetric['id'], typeof BarChart3> = {
  published: CheckCircle2,
  website_visits: BarChart3,
  signups: Target,
  contractors: Users,
  homeowners: Users,
  invites: Megaphone,
};

const METRIC_ACCENTS: Record<MarketingMetric['id'], string> = {
  published: 'bg-emerald-50 text-emerald-700',
  website_visits: 'bg-blue-50 text-blue-700',
  signups: 'bg-amber-50 text-amber-700',
  contractors: 'bg-cyan-50 text-cyan-700',
  homeowners: 'bg-rose-50 text-rose-700',
  invites: 'bg-slate-100 text-slate-700',
};

const EMPTY_SECTION_COPY: Record<Exclude<MarketingWorkspaceSection, 'overview' | 'content' | 'campaigns' | 'settings'>, { title: string; body: string }> = {
  prospects: { title: 'No prospects yet', body: 'Prospecting and outreach are not enabled.' },
  growth: { title: 'Acquisition analytics are not connected', body: 'Growth reporting will remain unavailable until a real data source is approved.' },
};

function metricValue(metric: MarketingMetric) {
  if (metric.state === 'not_connected') return 'Not connected';
  if (metric.state === 'unavailable') return 'Unavailable';
  return String(metric.value ?? 0);
}

function MarketingMetricCard({ metric }: { metric: MarketingMetric }) {
  const Icon = METRIC_ICONS[metric.id];
  return (
    <article
      data-testid={`marketing-metric-${metric.id}`}
      className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${METRIC_ACCENTS[metric.id]}`}>
        <Icon size={17} aria-hidden="true" />
      </div>
      <p className={`mt-3 font-bold text-slate-950 ${metric.value === null ? 'text-sm leading-5' : 'text-xl'}`}>
        {metricValue(metric)}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-700">{metric.label}</p>
      <p className="mt-1 text-xs leading-4 text-slate-500">{metric.helper}</p>
    </article>
  );
}

function OperatingPanel({
  title,
  icon,
  emptyTitle,
  emptyBody,
  testId,
}: {
  title: string;
  icon: ReactNode;
  emptyTitle: string;
  emptyBody: string;
  testId: string;
}) {
  return (
    <section data-testid={testId} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
      </div>
      <div className="mt-4 min-h-[8rem] rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
        <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
        <p className="mt-1 text-sm leading-5 text-slate-500">{emptyBody}</p>
      </div>
    </section>
  );
}

function ApprovalPanel({
  items,
  loading,
  error,
  onOpen,
}: {
  items: MarketingContentItem[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string | null) => void;
}) {
  return (
    <section data-testid="marketing-needs-approval" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700" aria-hidden="true">
            <CheckCircle2 size={17} />
          </span>
          <h2 className="text-sm font-bold text-slate-950">Needs Your Approval</h2>
        </div>
        {!loading && !error && <span className="text-sm font-bold text-slate-700">{items.length}</span>}
      </div>
      {loading ? (
        <div className="mt-4 min-h-[8rem] border-y border-dashed border-slate-200 px-3 py-5 text-sm text-slate-500">
          Loading approval queue...
        </div>
      ) : error ? (
        <div className="mt-4 min-h-[8rem] border-y border-rose-200 bg-rose-50 px-3 py-5 text-sm text-rose-800">
          Approval queue unavailable.
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 min-h-[8rem] rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
          <p className="text-sm font-semibold text-slate-700">Nothing waiting for approval</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">Submitted content will appear here for a decision.</p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {items.slice(0, 3).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className="flex min-h-12 w-full min-w-0 items-center gap-2 py-2 text-left hover:text-blue-700"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
              <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={() => onOpen(null)} className="min-h-11 w-full text-left text-sm font-bold text-blue-700 hover:text-blue-800">
            View approval queue
          </button>
        </div>
      )}
    </section>
  );
}

function MarketingOverview({
  data,
  approvalItems,
  contentLoading,
  contentError,
  onOpenApproval,
  publications,
}: {
  data: MarketingOverviewData;
  approvalItems: MarketingContentItem[];
  contentLoading: boolean;
  contentError: string | null;
  onOpenApproval: (id: string | null) => void;
  publications: MarketingPublication[];
}) {
  const publishedCount = publications.filter(item => item.status === 'published').length;
  return (
    <div data-testid="marketing-overview" className="space-y-5">
      <section aria-label="Marketing performance summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {data.metrics.map(metric => <MarketingMetricCard key={metric.id} metric={metric.id === 'published' ? {
          ...metric,
          value: publishedCount,
          state: 'available',
          helper: 'Published from this workspace.',
        } : metric} />)}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <ApprovalPanel
          items={approvalItems}
          loading={contentLoading}
          error={contentError}
          onOpen={onOpenApproval}
        />
        <section data-testid="marketing-upcoming" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><CalendarDays size={17} /></span><h2 className="text-sm font-bold text-slate-950">Upcoming</h2></div>
          {publications.filter(item => item.status === 'scheduled').length === 0 ? <div className="mt-4 min-h-[8rem] rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5"><p className="text-sm font-semibold text-slate-700">Nothing scheduled</p><p className="mt-1 text-sm text-slate-500">Approved content still requires a separate publication decision.</p></div> : <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{publications.filter(item => item.status === 'scheduled').slice(0, 3).map(item => <div key={item.id} className="py-3"><p className="text-sm font-bold text-slate-800">{item.snapshot.title}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.scheduledAt).toLocaleString()}</p></div>)}</div>}
        </section>
        <OperatingPanel
          title="Recommended Next Action"
          icon={<Lightbulb size={17} />}
          emptyTitle="No recommendation available"
          emptyBody="Recommendations require approved marketing data and workflows."
          testId="marketing-recommended-action"
        />
      </div>
    </div>
  );
}

function MarketingFoundationState({ section }: { section: Exclude<MarketingWorkspaceSection, 'overview' | 'content' | 'campaigns' | 'settings'> }) {
  const copy = EMPTY_SECTION_COPY[section];
  const Icon = SECTION_PRESENTATION[section].icon;
  return (
    <section
      data-testid={`marketing-section-${section}`}
      className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center shadow-sm"
    >
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden="true">
        <Icon size={20} />
      </span>
      <h2 className="mt-3 text-base font-bold text-slate-950">{copy.title}</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-500">{copy.body}</p>
    </section>
  );
}

export function MarketingWorkspace({
  audience,
  overview,
  content,
  createPost,
  planning,
  publishing,
  settingsUsage,
}: {
  audience: MarketingWorkspaceAudience;
  overview: MarketingOverviewData;
  content: {
    items: MarketingContentItem[];
    createdContentId: string | null;
    loading: boolean;
    error: string | null;
    onReload: () => Promise<void>;
    onCreate: Parameters<typeof MarketingContentWorkspace>[0]['onCreate'];
    onUpdate: Parameters<typeof MarketingContentWorkspace>[0]['onUpdate'];
    onTransition: Parameters<typeof MarketingContentWorkspace>[0]['onTransition'];
    onPublish: Parameters<typeof MarketingContentWorkspace>[0]['onPublish'];
  };
  createPost: ReactNode;
  planning: Parameters<typeof MarketingPlanningWorkspace>[0] | null;
  publishing: Omit<Parameters<typeof MarketingPublishingWorkspace>[0], 'contentItems' | 'selectedContentId' | 'onSelectContent' | 'onReturnForRevision'> & { selectedContentId: string | null; onSelectContent: (content: MarketingContentItem) => void };
  settingsUsage: ReactNode;
}) {
  const [section, setSection] = useState<MarketingWorkspaceSection>(() => (
    marketingFacebookReturnStatus(window.location.search) ? 'campaigns' : 'overview'
  ));
  const [contentFocus, setContentFocus] = useState<{
    id: string | null;
    status: MarketingContentStatus | 'all';
    token: number;
  } | null>(null);
  const approvalItems = content.items.filter(item => item.status === 'needs_approval');

  useEffect(() => {
    if (!content.createdContentId) return;
    setContentFocus({ id: content.createdContentId, status: 'draft', token: Date.now() });
  }, [content.createdContentId]);

  const openApproval = (id: string | null) => {
    setContentFocus({ id, status: 'needs_approval', token: Date.now() });
    setSection('content');
  };

  return (
    <div data-testid="marketing-workspace" data-marketing-audience={audience.kind} className="min-w-0 space-y-4">
      <nav aria-label="Marketing workspace" className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
        <div role="tablist" aria-label="Marketing destinations" className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          {MARKETING_WORKSPACE_SECTIONS.map(item => {
            const presentation = SECTION_PRESENTATION[item];
            const Icon = presentation.icon;
            const selected = section === item;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSection(item)}
                data-testid={`marketing-nav-${item}`}
                className={`flex min-h-[48px] min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition sm:text-sm ${
                  selected ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <Icon size={16} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{presentation.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {section === 'overview'
        ? (
          <MarketingOverview
            data={overview}
            approvalItems={approvalItems}
            contentLoading={content.loading}
            contentError={content.error}
            onOpenApproval={openApproval}
            publications={publishing.state?.publications ?? []}
          />
        )
        : section === 'content'
          ? (
            <div className="space-y-4">
              {createPost}
              <MarketingContentWorkspace
                approvalPolicy={audience.kind === 'internal' ? 'direct_owner' : 'team_review'}
                items={content.items}
                loading={content.loading}
                loadError={content.error}
                focusRequest={contentFocus}
                onReload={content.onReload}
                onCreate={content.onCreate}
                onUpdate={content.onUpdate}
                onTransition={content.onTransition}
                onPublish={item => { content.onPublish(item); setSection('campaigns'); }}
              />
            </div>
          )
          : section === 'campaigns'
            ? <MarketingPublishingWorkspace
                {...publishing}
                contentItems={content.items}
                onReturnForRevision={item => {
                  setContentFocus({ id: item.id, status: 'approved', token: Date.now() });
                  setSection('content');
                }}
              />
          : section === 'settings'
            ? <div className="space-y-5">{settingsUsage}{planning && <MarketingPlanningWorkspace {...planning} />}</div>
            : <MarketingFoundationState section={section} />}
    </div>
  );
}

function AuthorizedMarketingWorkspace({
  overview,
  client,
  contractorId,
  planningEnabled,
}: {
  overview: MarketingOverviewData;
  client: MarketingContentRpcClient & MarketingPlanningRpcClient & MarketingDirectionsRpcClient & MarketingPublishingRpcClient & MarketingFacebookAuthClient & MarketingMediaClient & MarketingUsageClient & MarketingCreationClient;
  contractorId: string | null;
  planningEnabled: boolean;
}) {
  const adapter = useMemo(() => createMarketingContentAdapter(client, contractorId), [client, contractorId]);
  const planningAdapter = useMemo(() => createMarketingPlanningAdapter(client), [client]);
  const directionsAdapter = useMemo(() => createMarketingDirectionsAdapter(client), [client]);
  const publishingAdapter = useMemo(() => createMarketingPublishingAdapter(client, contractorId), [client, contractorId]);
  const facebookAdapter = useMemo(() => createMarketingFacebookConnectionAdapter(client, contractorId), [client, contractorId]);
  const [items, setItems] = useState<MarketingContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planningState, setPlanningState] = useState<MarketingPlanningState | null>(null);
  const [planningLoading, setPlanningLoading] = useState(true);
  const [planningSaving, setPlanningSaving] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [directionsState, setDirectionsState] = useState<MarketingDirectionsState | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(true);
  const [directionsSaving, setDirectionsSaving] = useState(false);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const [publishingState, setPublishingState] = useState<MarketingPublishingState | null>(null);
  const [publishingLoading, setPublishingLoading] = useState(true);
  const [publishingSaving, setPublishingSaving] = useState(false);
  const [publishingError, setPublishingError] = useState<string | null>(null);
  const [previewContentId, setPreviewContentId] = useState<string | null>(null);
  const [createdContentId, setCreatedContentId] = useState<string | null>(null);
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await adapter.list('all'));
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : 'ServSync could not load marketing content.');
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => { void load(); }, [load]);

  const loadPlanning = useCallback(async (showLoading = true) => {
    if (!planningEnabled) {
      setPlanningLoading(false);
      return;
    }
    if (showLoading) setPlanningLoading(true);
    setPlanningError(null);
    try {
      setPlanningState(await planningAdapter.get());
    } catch (loadError) {
      setPlanningState(null);
      setPlanningError(loadError instanceof Error ? loadError.message : 'ServSync could not load Marketing planning.');
    } finally {
      setPlanningLoading(false);
    }
  }, [planningAdapter, planningEnabled]);

  useEffect(() => { void loadPlanning(); }, [loadPlanning]);

  const loadDirections = useCallback(async (showLoading = true) => {
    if (!planningEnabled) {
      setDirectionsLoading(false);
      return;
    }
    if (showLoading) setDirectionsLoading(true);
    setDirectionsError(null);
    try {
      setDirectionsState(await directionsAdapter.get());
    } catch (loadError) {
      setDirectionsState(null);
      setDirectionsError(loadError instanceof Error ? loadError.message : 'ServSync could not load Marketing Directions.');
    } finally {
      setDirectionsLoading(false);
    }
  }, [directionsAdapter, planningEnabled]);

  useEffect(() => { void loadDirections(); }, [loadDirections]);

  const loadPublishing = useCallback(async () => {
    setPublishingLoading(true);
    setPublishingError(null);
    try { setPublishingState(await publishingAdapter.get()); }
    catch (loadError) { setPublishingState(null); setPublishingError(loadError instanceof Error ? loadError.message : 'ServSync could not load publishing.'); }
    finally { setPublishingLoading(false); }
  }, [publishingAdapter]);

  useEffect(() => { void loadPublishing(); }, [loadPublishing]);

  const withPlanningSave = async (operation: () => Promise<unknown>) => {
    setPlanningSaving(true);
    try {
      await operation();
      await loadPlanning(false);
    } finally {
      setPlanningSaving(false);
    }
  };

  const withDirectionSave = async (operation: () => Promise<unknown>) => {
    setDirectionsSaving(true);
    try {
      await operation();
      await loadDirections(false);
    } finally {
      setDirectionsSaving(false);
    }
  };

  const content = {
    items,
    createdContentId,
    loading,
    error,
    onReload: load,
    onCreate: async (value: {
      title: string;
      contentType: MarketingContentItem['contentType'];
      body: string;
      channelCategory: MarketingContentItem['channelCategory'];
    }) => {
      const receipt = await adapter.create({
        ...value,
        clientRequestId: crypto.randomUUID(),
      });
      await load();
      return receipt.contentId;
    },
    onUpdate: async (item: MarketingContentItem, value: {
      title: string;
      contentType: MarketingContentItem['contentType'];
      body: string;
      channelCategory: MarketingContentItem['channelCategory'];
    }) => {
      await adapter.update({
        ...value,
        contentId: item.id,
        expectedRevision: item.revisionNumber,
      });
      await load();
    },
    onTransition: async (
      item: MarketingContentItem,
      toStatus: Exclude<MarketingContentStatus, 'idea'>,
      reason?: string,
    ) => {
      await adapter.transition({
        contentId: item.id,
        expectedRevision: item.revisionNumber,
        toStatus,
        reason,
      });
      await load();
    },
    onPublish: (item: MarketingContentItem) => {
      setPreviewContentId(item.id);
      void loadPublishing();
    },
  };

  const planning = {
    state: planningState,
    loading: planningLoading,
    error: planningError,
    saving: planningSaving,
    onReload: () => loadPlanning(true),
    onSaveProfile: (profile: MarketingBusinessProfile) => withPlanningSave(() => planningAdapter.saveProfile(profile)),
    onCreatePlan: (input: MarketingPlanCreateInput) => withPlanningSave(() => planningAdapter.createPlan(input)),
    onUpdatePlan: (plan: MarketingPlan) => withPlanningSave(() => planningAdapter.updatePlan(plan)),
    onAcceptPlan: (plan: MarketingPlan) => withPlanningSave(() => planningAdapter.acceptPlan(plan)),
    directions: {
      state: directionsState,
      loading: directionsLoading,
      error: directionsError,
      saving: directionsSaving,
      onReload: () => loadDirections(true),
      onUpdate: (direction: MarketingDirection) => withDirectionSave(() => directionsAdapter.update(direction)),
      onApprove: (direction: MarketingDirection) => withDirectionSave(() => directionsAdapter.approve(direction)),
    },
  };

  const publishing = {
    state: publishingState,
    loading: publishingLoading,
    error: publishingError,
    saving: publishingSaving,
    selectedContentId: previewContentId,
    onSelectContent: (item: MarketingContentItem) => setPreviewContentId(item.id),
    onReload: loadPublishing,
    onPrepare: async (selectedContent: MarketingContentItem, pairingId: string | null) => {
      const connection = publishingState?.providers.find(item => item.provider === 'facebook');
      if (!connection) throw new Error('Connect Facebook before preparing this post.');
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        const result = await publishingAdapter.preparePackage({
          requestId: crypto.randomUUID(),
          contentId: selectedContent.id,
          contentRevision: selectedContent.revisionNumber,
          pairingId,
          provider: 'facebook',
          connectionId: connection.id,
        });
        if (!result.packageId) throw new Error('ServSync could not confirm the prepared post.');
        await loadPublishing();
        return result.packageId;
      } finally {
        setPublishingSaving(false);
      }
    },
    onPreview: async (item: import('./marketingPublishing').MarketingPublicationPackage) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        await publishingAdapter.recordPreview(item.id, item.fingerprint);
        const assetId = typeof item.mediaSnapshot?.asset_id === 'string' ? item.mediaSnapshot.asset_id : null;
        const url = assetId ? await publishingAdapter.mediaUrl(assetId) : null;
        await loadPublishing();
        return url;
      } finally {
        setPublishingSaving(false);
      }
    },
    onApprove: async (item: import('./marketingPublishing').MarketingPublicationPackage) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try { await publishingAdapter.approvePackage(item.id, item.fingerprint); await loadPublishing(); }
      finally { setPublishingSaving(false); }
    },
    onAuthorize: async (item: import('./marketingPublishing').MarketingPublicationPackage, mode: import('./marketingPublishing').MarketingPublicationMode, scheduledAt: string | null, timezone: string) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        await publishingAdapter.authorize({
          requestId: crypto.randomUUID(), packageId: item.id, fingerprint: item.fingerprint,
          mode, scheduledAt, timezone,
        });
        await loadPublishing();
      } finally { setPublishingSaving(false); }
    },
    onPairMedia: async (selectedContent: MarketingContentItem, asset: import('./marketingPublishing').MarketingQueueAsset) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        await publishingAdapter.pairMedia({
          pairingId: crypto.randomUUID(), contentId: selectedContent.id,
          contentRevision: selectedContent.revisionNumber, assetId: asset.id,
          claim: 'Selected as the exact media for this approved post.',
        });
        await loadPublishing();
      } finally { setPublishingSaving(false); }
    },
    onReviewMedia: async (pairing: import('./marketingPublishing').MarketingQueuePairing, decision: 'approved' | 'rejected') => {
      setPublishingSaving(true);
      setPublishingError(null);
      try { await publishingAdapter.reviewMedia(pairing.id, decision); await loadPublishing(); }
      finally { setPublishingSaving(false); }
    },
    onCancel: async (publication: MarketingPublication) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        await publishingAdapter.cancel(publication.id);
        await loadPublishing();
      } catch (saveError) {
        setPublishingError(saveError instanceof Error ? saveError.message : 'ServSync could not cancel the publication.');
      } finally {
        setPublishingSaving(false);
      }
    },
    onRetry: async (publication: MarketingPublication) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        await publishingAdapter.retry(publication.id);
        await loadPublishing();
      } catch (saveError) {
        setPublishingError(saveError instanceof Error ? saveError.message : 'ServSync could not retry the publication.');
      } finally {
        setPublishingSaving(false);
      }
    },
    onPrepareReplacement: async (publication: MarketingPublication) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        await publishingAdapter.prepareReplacement(publication.id);
        await loadPublishing();
      } catch (saveError) {
        setPublishingError(saveError instanceof Error ? saveError.message : 'ServSync could not prepare the replacement.');
        throw saveError;
      } finally {
        setPublishingSaving(false);
      }
    },
    onRetireMedia: async (asset: import('./marketingPublishing').MarketingQueueAsset, item?: import('./marketingPublishing').MarketingPublicationPackage) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try {
        await publishingAdapter.retireMedia(asset.id);
        if (item) setPreviewContentId(current => current === item.contentId ? null : current);
        await Promise.all([loadPublishing(), load()]);
        setUsageRefreshKey(current => current + 1);
      } catch (saveError) {
        await Promise.all([loadPublishing(), load()]);
        throw saveError;
      } finally {
        setPublishingSaving(false);
      }
    },
    onReschedule: async (publication: MarketingPublication, scheduledAt: string, timezone: string) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try { await publishingAdapter.reschedule(publication.id, scheduledAt, timezone); await loadPublishing(); }
      finally { setPublishingSaving(false); }
    },
    onConnectFacebook: async () => {
      setPublishingSaving(true);
      setPublishingError(null);
      try { await facebookAdapter.start(); }
      catch (saveError) {
        setPublishingError(saveError instanceof Error ? saveError.message : 'ServSync could not start Facebook authorization.');
        setPublishingSaving(false);
      }
    },
    onSelectFacebookPage: async (sessionId: string, pageId: string) => {
      setPublishingSaving(true);
      setPublishingError(null);
      try { await facebookAdapter.selectPage(sessionId, pageId); await loadPublishing(); }
      catch (saveError) { setPublishingError(saveError instanceof Error ? saveError.message : 'ServSync could not connect the Facebook Page.'); }
      finally { setPublishingSaving(false); }
    },
    onRecheckFacebook: async () => {
      setPublishingSaving(true);
      setPublishingError(null);
      try { await facebookAdapter.recheck(); await loadPublishing(); }
      catch (saveError) { setPublishingError(saveError instanceof Error ? saveError.message : 'ServSync could not recheck Facebook.'); }
      finally { setPublishingSaving(false); }
    },
    onDisconnectFacebook: async () => {
      setPublishingSaving(true);
      setPublishingError(null);
      try { await facebookAdapter.disconnect(); await loadPublishing(); }
      catch (saveError) { setPublishingError(saveError instanceof Error ? saveError.message : 'ServSync could not disconnect Facebook.'); }
      finally { setPublishingSaving(false); }
    },
  };

  return <>
    <MarketingWorkspace
      audience={contractorId ? { kind: 'contractor', contractorId } : { kind: 'internal' }}
      overview={overview}
      content={content}
      createPost={<MarketingCreatePost client={client} contractorId={contractorId} onCreated={async id => {
        await load();
        setCreatedContentId(id);
      }} />}
      planning={planningEnabled ? planning : null}
      publishing={publishing}
      settingsUsage={<MarketingUsagePanel client={client} contractorId={contractorId} platformControls={contractorId === null} refreshKey={usageRefreshKey} />}
    />
  </>;
}

export function InternalMarketingWorkspace({
  role,
  overview,
  client,
}: {
  role: UserRole | null | undefined;
  overview: MarketingOverviewData;
  client: MarketingContentRpcClient & MarketingPlanningRpcClient & MarketingDirectionsRpcClient & MarketingPublishingRpcClient & MarketingFacebookAuthClient & MarketingMediaClient & MarketingUsageClient & MarketingCreationClient;
}) {
  if (!canAccessInternalMarketing(role)) return null;
  return <AuthorizedMarketingWorkspace overview={overview} client={client} contractorId={null} planningEnabled />;
}

export function ContractorMarketingWorkspace({
  contractorId,
  overview,
  client,
}: {
  contractorId: string;
  overview: MarketingOverviewData;
  client: MarketingContentRpcClient & MarketingPlanningRpcClient & MarketingDirectionsRpcClient & MarketingPublishingRpcClient & MarketingFacebookAuthClient & MarketingMediaClient & MarketingUsageClient & MarketingCreationClient;
}) {
  return <AuthorizedMarketingWorkspace overview={overview} client={client} contractorId={contractorId} planningEnabled={false} />;
}
