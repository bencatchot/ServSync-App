import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { formatMoney } from '../../utils/format';

export type HomeownerRecordSection = 'needs_review' | 'agreement_offers' | 'open_invoices' | 'accepted' | 'agreements' | 'closed';

type Section = {
  id: HomeownerRecordSection;
  title: string;
  helper: string;
  count: number;
  totalCents: number;
  tone: 'attention' | 'invoice' | 'accepted' | 'closed';
};

type Props = {
  sections: Section[];
  selected: HomeownerRecordSection;
  onSelect: (section: HomeownerRecordSection) => void;
  scopeLabel: string;
  filtered: boolean;
  guidance: ReactNode;
  propertyControls: ReactNode;
  filters: ReactNode;
  children: ReactNode;
};

const tileChrome = (tone: Section['tone'], active: boolean) => {
  const tones = {
    attention: active
      ? 'border-amber-300 bg-amber-50 text-amber-950 ring-2 ring-amber-100'
      : 'border-amber-200 bg-white text-slate-800 hover:border-amber-300 hover:bg-amber-50/60',
    invoice: active
      ? 'border-blue-300 bg-blue-50 text-blue-950 ring-2 ring-blue-100'
      : 'border-blue-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60',
    accepted: active
      ? 'border-emerald-300 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-100'
      : 'border-emerald-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/60',
    closed: active
      ? 'border-slate-400 bg-slate-100 text-slate-950 ring-2 ring-slate-200'
      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50',
  };
  return `rounded-xl border p-3 text-left shadow-sm transition ${tones[tone]}`;
};

const phoneQuery = '(max-width: 767px)';
function subscribePhoneLayout(update: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
const isPhoneLayout = () => window.matchMedia(phoneQuery).matches;

function SectionTabs({ sections, selected, onSelect }: Pick<Props, 'sections' | 'selected' | 'onSelect'>) {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [focusTarget, setFocusTarget] = useState<HomeownerRecordSection | null>(null);
  const updateWheel = useCallback(() => {
    const list = strip.current;
    if (!list || !list.clientWidth) return;
    const slots = Array.from(list.children) as HTMLElement[];
    const position = list.scrollLeft / slots[0].getBoundingClientRect().width;
    const front = Math.max(0, Math.min(slots.length - 1, Math.round(position)));
    const start = list.scrollLeft <= 1;
    const end = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
    slots.forEach((slot, index) => {
      const offset = Math.max(-1.5, Math.min(1.5, index - position));
      slot.style.setProperty('--wheel-turn', offset.toFixed(3));
      slot.style.setProperty('--wheel-depth', Math.abs(offset).toFixed(3));
      const layer = index === front ? slots.length + 1 : slots.length - Math.round(Math.abs(index - position));
      slot.style.zIndex = String(layer);
      slot.toggleAttribute('data-front', index === front);
    });
    setEdges(previous => previous.start === start && previous.end === end ? previous : { start, end });
  }, []);

  const centerTab = useCallback((button: HTMLButtonElement) => {
    const list = strip.current!;
    // Measure the stable slot, not the rotating button. Only this strip moves.
    const slot = button.parentElement!;
    list.scrollLeft = slot.offsetLeft - (list.clientWidth - slot.offsetWidth) / 2;
    updateWheel();
  }, [updateWheel]);

  useLayoutEffect(() => {
    const list = strip.current!;
    const selectedButton = list.querySelector<HTMLButtonElement>('[aria-selected="true"]')!;
    function alignSelection() {
      centerTab(selectedButton);
    }
    alignSelection();
    const observer = new ResizeObserver(alignSelection);
    observer.observe(list);
    return () => observer.disconnect();
  }, [centerTab, selected]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = (index + 1) % sections.length; break;
      case 'ArrowLeft': next = (index + sections.length - 1) % sections.length; break;
      case 'Home': next = 0; break;
      case 'End': next = sections.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const button = strip.current!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    button.focus({ preventScroll: true });
    setFocusTarget(sections[next].id);
    centerTab(button);
  }

  const arrowStyle = 'flex min-h-11 w-7 shrink-0 items-center justify-center rounded-lg text-slate-700 disabled:text-slate-300 focus-visible:outline-blue-700';
  function scrollTabs(direction: number) {
    const list = strip.current!;
    const slotWidth = list.firstElementChild!.getBoundingClientRect().width;
    list.scrollLeft = (Math.round(list.scrollLeft / slotWidth) + direction) * slotWidth;
    updateWheel();
  }
  return (
    <div className="-mx-2 flex min-w-0 items-stretch rounded-xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        aria-label="Scroll sections left"
        aria-controls="homeowner-record-tabs"
        disabled={edges.start}
        className={arrowStyle}
        onClick={() => scrollTabs(-1)}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <div
        id="homeowner-record-tabs"
        ref={strip}
        role="tablist"
        aria-label="Record sections"
        onScroll={updateWheel}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocusTarget(null);
        }}
        className="homeowner-wheel-strip relative isolate flex min-w-0 flex-1 items-stretch overflow-x-auto overscroll-x-contain"
      >
        {sections.map((section, index) => {
          const active = section.id === selected;
          return (
            <div key={section.id} role="presentation" className="homeowner-wheel-slot">
              <button
                type="button"
                role="tab"
                id={`record-tab-${section.id}`}
                aria-selected={active}
                aria-controls={`record-panel-${section.id}`}
                tabIndex={(focusTarget ?? selected) === section.id ? 0 : -1}
                onKeyDown={event => navigate(event, index)}
                onClick={event => {
                  setFocusTarget(section.id);
                  centerTab(event.currentTarget);
                  onSelect(section.id);
                }}
                className="homeowner-wheel-tab"
              >
                <span>{section.title}</span>
                <span className="homeowner-wheel-count">{section.count}</span>
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Scroll sections right"
        aria-controls="homeowner-record-tabs"
        disabled={edges.end}
        className={arrowStyle}
        onClick={() => scrollTabs(1)}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export function HomeownerRecordsLayout({ sections, selected, onSelect, scopeLabel, filtered, guidance, propertyControls, filters, children }: Props) {
  const [editingFilters, setEditingFilters] = useState(false);
  const phone = useSyncExternalStore(subscribePhoneLayout, isPhoneLayout, () => false);
  const activeSection = sections.find(section => section.id === selected)!;
  return (
    <div className="homeowner-records-layout grid min-w-0 gap-2 md:gap-5">
      <div className="flex min-w-0 items-center justify-between gap-2 md:hidden">
        <p className="min-w-0 break-words text-xs text-slate-600">Property: {scopeLabel}</p>
        <button
          type="button"
          aria-expanded={editingFilters}
          aria-controls="homeowner-record-filters"
          onClick={() => setEditingFilters(open => !open)}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 text-sm font-semibold text-slate-800"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {editingFilters ? 'Done' : filtered ? 'Filters on' : 'Filters'}
        </button>
      </div>
      {phone && <SectionTabs sections={sections} selected={selected} onSelect={section => {
        onSelect(section);
        setEditingFilters(false);
      }} />}
      <div id="homeowner-record-filters" className={`homeowner-record-filters md:contents ${editingFilters ? 'flex flex-col gap-2' : 'hidden'}`}>
        <div className="order-last md:order-none">{guidance}</div>
        {propertyControls}
        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {sections.map(tile => {
            const active = tile.id === selected;
            return (
              <button
                key={tile.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(tile.id)}
                className={tileChrome(tile.tone, active)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold">{tile.title}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-500">{tile.helper}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-slate-800 shadow-sm">
                    {tile.count}
                  </span>
                </div>
                <p className="mt-2 break-words text-base font-bold sm:text-lg">{formatMoney(tile.totalCents)}</p>
              </button>
            );
          })}
        </div>
        {filters}
      </div>
      {phone && sections.filter(section => section.id !== selected).map(section => (
        <div key={section.id} id={`record-panel-${section.id}`} role="tabpanel" aria-labelledby={`record-tab-${section.id}`} hidden />
      ))}
      <div
        key={selected}
        id={`record-panel-${selected}`}
        role={phone ? 'tabpanel' : 'region'}
        aria-labelledby={phone ? `record-tab-${selected}` : undefined}
        aria-label={phone ? undefined : activeSection.title}
        tabIndex={0}
        className={`homeowner-record-results min-w-0 md:block ${editingFilters ? 'hidden' : ''}`}
      >
        {children}
        {activeSection.count > 0 && !filtered && (
          <p className="mt-3 text-right text-sm font-semibold text-slate-700 md:hidden">
            Section total: {formatMoney(activeSection.totalCents)}
          </p>
        )}
      </div>
    </div>
  );
}
