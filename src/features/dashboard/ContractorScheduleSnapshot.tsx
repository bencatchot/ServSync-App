import { Calendar, ChevronRight, RotateCcw } from 'lucide-react';

export type ContractorScheduleSnapshotDay = {
  key: string;
  isToday: boolean;
  label: string;
  dateLabel: string;
};

export type ContractorScheduleSnapshotItem = {
  id: string;
  title: string;
  meta: string;
  timeLabel: string;
  statusLabel: string;
  tone: 'amber' | 'emerald' | 'sky' | 'violet';
  onOpen: () => void;
};

type ContractorScheduleSnapshotProps = {
  days: ContractorScheduleSnapshotDay[];
  itemsByDay: Record<string, ContractorScheduleSnapshotItem[]>;
  weekLabel: string;
  isCurrentWeek: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onOpenCalendar: () => void;
};

const toneClass = (tone: ContractorScheduleSnapshotItem['tone']) => ({
  amber: 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100',
  emerald: 'border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100',
  sky: 'border-sky-200 bg-sky-50 hover:border-sky-300 hover:bg-sky-100',
  violet: 'border-violet-200 bg-violet-50 hover:border-violet-300 hover:bg-violet-100',
}[tone]);

const statusClass = (tone: ContractorScheduleSnapshotItem['tone']) => ({
  amber: 'text-amber-800',
  emerald: 'text-emerald-800',
  sky: 'text-sky-800',
  violet: 'text-violet-800',
}[tone]);

export function ContractorScheduleSnapshot({
  days,
  itemsByDay,
  weekLabel,
  isCurrentWeek,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  onOpenCalendar,
}: ContractorScheduleSnapshotProps) {
  const itemCount = days.reduce((total, day) => total + (itemsByDay[day.key]?.length ?? 0), 0);
  const populatedDays = days.filter(day => (itemsByDay[day.key]?.length ?? 0) > 0);
  const emptyDayCount = days.length - populatedDays.length;

  return (
    <div className="space-y-3" data-testid="contractor-schedule-snapshot" data-schedule-count={itemCount}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">Week of {weekLabel}</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">Appointments, scheduled work, and calendar events for this week.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-700" onClick={onPreviousWeek} aria-label="Previous week">
            <ChevronRight size={16} className="rotate-180" />
          </button>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-700" onClick={onNextWeek} aria-label="Next week">
            <ChevronRight size={16} />
          </button>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={onThisWeek} disabled={isCurrentWeek}>
            <RotateCcw size={15} />
            This week
          </button>
          <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {itemCount} scheduled
          </span>
        </div>
      </div>

      {itemCount === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="contractor-schedule-empty">
          <div>
            <p className="text-sm font-semibold text-slate-800">Nothing scheduled this week.</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">New appointments and scheduled work will appear here.</p>
          </div>
          <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700" onClick={onOpenCalendar}>
            <Calendar size={16} />
            Open calendar
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white" data-testid="contractor-schedule-days">
            {populatedDays.map(day => {
              const items = itemsByDay[day.key] ?? [];
              return (
                <div key={day.key} className={`grid gap-3 p-3 md:grid-cols-[150px_1fr] ${day.isToday ? 'bg-blue-50/50' : ''}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-slate-950">{day.label}</p>
                      {day.isToday ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-blue-700">Today</span> : null}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">{day.dateLabel}</p>
                  </div>
                  <div className="space-y-2">
                    {items.map(item => (
                      <button key={item.id} type="button" onClick={item.onOpen} className={`w-full rounded-lg border p-2.5 text-left transition ${toneClass(item.tone)}`}>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{item.meta} · {item.timeLabel}</p>
                          </div>
                          <span className={`w-fit shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold ${statusClass(item.tone)}`}>{item.statusLabel}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">{emptyDayCount > 0 ? `${emptyDayCount} other day${emptyDayCount === 1 ? '' : 's'} have no scheduled items.` : 'Every day this week has scheduled work.'}</p>
            <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700" onClick={onOpenCalendar}>
              <Calendar size={16} />
              Open full calendar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
