import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
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

export function HomeownerRecordsLayout({ sections, selected, onSelect, scopeLabel, filtered, guidance, propertyControls, filters, children }: Props) {
  const [editingFilters, setEditingFilters] = useState(false);
  const activeSection = sections.find(section => section.id === selected)!;
  return (
    <div className="homeowner-records-layout grid min-w-0 gap-2 md:gap-5">
      <div className="flex min-w-0 items-end gap-2 md:hidden">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Section</span>
          <select
            aria-controls="homeowner-record-results"
            className="min-h-11 w-full rounded-lg border border-blue-400 bg-blue-50 px-2 text-base font-semibold text-blue-950"
            value={selected}
            onChange={event => {
              onSelect(event.target.value as HomeownerRecordSection);
              setEditingFilters(false);
            }}
          >
            {sections.map(section => <option key={section.id} value={section.id}>{section.title} ({section.count})</option>)}
          </select>
        </label>
        <button
          type="button"
          aria-expanded={editingFilters}
          aria-controls="homeowner-record-filters"
          onClick={() => setEditingFilters(open => !open)}
          className="flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-2 text-sm font-semibold text-slate-800"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {editingFilters ? 'Done' : filtered ? 'Filters on' : 'Filters'}
        </button>
      </div>
      <p className="break-words text-xs text-slate-600 md:hidden">Property: {scopeLabel}</p>
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
      <div
        key={selected}
        id="homeowner-record-results"
        role="region"
        aria-label={activeSection.title}
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
