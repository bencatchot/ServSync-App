import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
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

const EMPTY_SECTION_COPY: Record<Exclude<MarketingWorkspaceSection, 'overview'>, { title: string; body: string }> = {
  content: { title: 'No marketing content yet', body: 'Content work will appear here when it is created.' },
  campaigns: { title: 'No campaigns yet', body: 'Campaign planning is not connected in this foundation.' },
  prospects: { title: 'No prospects yet', body: 'Prospecting and outreach are not enabled.' },
  growth: { title: 'Acquisition analytics are not connected', body: 'Growth reporting will remain unavailable until a real data source is approved.' },
  settings: { title: 'No marketing integrations configured', body: 'Publishing and analytics connections are not enabled.' },
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

function MarketingOverview({ data }: { data: MarketingOverviewData }) {
  return (
    <div data-testid="marketing-overview" className="space-y-5">
      <section aria-label="Marketing performance summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {data.metrics.map(metric => <MarketingMetricCard key={metric.id} metric={metric} />)}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <OperatingPanel
          title="Needs Your Approval"
          icon={<CheckCircle2 size={17} />}
          emptyTitle="Nothing waiting for approval"
          emptyBody="Review items will appear here when an approval workflow exists."
          testId="marketing-needs-approval"
        />
        <OperatingPanel
          title="Upcoming"
          icon={<CalendarDays size={17} />}
          emptyTitle="Nothing scheduled"
          emptyBody="Scheduled marketing work will appear here when publishing is enabled."
          testId="marketing-upcoming"
        />
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

function MarketingFoundationState({ section }: { section: Exclude<MarketingWorkspaceSection, 'overview'> }) {
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
}: {
  audience: MarketingWorkspaceAudience;
  overview: MarketingOverviewData;
}) {
  const [section, setSection] = useState<MarketingWorkspaceSection>('overview');

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
        ? <MarketingOverview data={overview} />
        : <MarketingFoundationState section={section} />}
    </div>
  );
}

export function InternalMarketingWorkspace({
  role,
  overview,
}: {
  role: UserRole | null | undefined;
  overview: MarketingOverviewData;
}) {
  if (!canAccessInternalMarketing(role)) return null;
  return <MarketingWorkspace audience={{ kind: 'internal' }} overview={overview} />;
}
