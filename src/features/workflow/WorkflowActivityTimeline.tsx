import { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Circle, ClipboardList, FileText, Receipt } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

export type WorkflowActivityTimelineEvent = {
  id: string;
  dedupeKey?: string;
  label: string;
  timestamp: string | null | undefined;
  detail?: string | null;
  tone?: 'blue' | 'emerald' | 'amber' | 'slate' | 'red';
  icon?: 'request' | 'appointment' | 'estimate' | 'job' | 'invoice' | 'report';
};

type WorkflowActivityTimelineProps = {
  events: WorkflowActivityTimelineEvent[];
  title?: string;
  helper?: string;
  className?: string;
};

const INITIAL_EVENT_COUNT = 5;

function eventTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function eventToneClass(tone: WorkflowActivityTimelineEvent['tone']) {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'amber':
      return 'border-amber-100 bg-amber-50 text-amber-700';
    case 'red':
      return 'border-red-100 bg-red-50 text-red-700';
    case 'blue':
      return 'border-blue-100 bg-blue-50 text-blue-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-500';
  }
}

function EventIcon({ icon, size = 14 }: { icon: WorkflowActivityTimelineEvent['icon']; size?: number }) {
  switch (icon) {
    case 'appointment':
      return <Calendar size={size} />;
    case 'estimate':
      return <ClipboardList size={size} />;
    case 'invoice':
      return <Receipt size={size} />;
    case 'report':
      return <FileText size={size} />;
    case 'job':
      return <CheckCircle2 size={size} />;
    case 'request':
    default:
      return <Circle size={size} />;
  }
}

export function WorkflowActivityTimeline({
  events,
  title = 'Activity',
  helper = 'Major workflow updates for this request and related job.',
  className = '',
}: WorkflowActivityTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const normalizedEvents = useMemo(() => {
    const seen = new Set<string>();
    return events
      .map(event => ({ event, time: eventTime(event.timestamp) }))
      .filter((entry): entry is { event: WorkflowActivityTimelineEvent; time: number } => entry.time !== null)
      .sort((a, b) => b.time - a.time)
      .filter(({ event, time }) => {
        const key = event.dedupeKey || `${event.id}:${event.label}:${time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ event }) => event);
  }, [events]);
  const visibleEvents = showAll ? normalizedEvents : normalizedEvents.slice(0, INITIAL_EVENT_COUNT);

  return (
    <section data-testid="workflow-activity-timeline" className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">System updates</span>
      </div>

      <div className="mt-4 space-y-2">
        {normalizedEvents.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No major activity yet.
          </p>
        )}
        {visibleEvents.map(event => (
          <div key={event.id} data-testid="workflow-activity-event" className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${eventToneClass(event.tone)}`}>
              <EventIcon icon={event.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">{event.label}</p>
                <p className="text-xs font-medium text-slate-400">{formatDateTime(event.timestamp)}</p>
              </div>
              {event.detail && <p className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      {normalizedEvents.length > INITIAL_EVENT_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(current => !current)}
          className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          {showAll ? 'Show less' : `Show ${normalizedEvents.length - INITIAL_EVENT_COUNT} more`}
        </button>
      )}
    </section>
  );
}
