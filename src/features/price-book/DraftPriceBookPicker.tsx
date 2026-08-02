import { BookOpen, ChevronDown, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContractorPriceBookItem, EstimateLineType } from '../../types';
import { formatMoney } from '../../utils/format';
import type { WorkComposerLineDraft } from '../work-composer/types';
import { priceBookItemToEstimateLineDraft } from './priceBookEstimateLineSnapshot';
import {
  filterPriceBookItems,
  priceBookFilterOptions,
  type PriceBookLoadState,
  type PriceBookTypeFilter,
} from './priceBookView';

const TYPE_FILTERS: Array<{ value: PriceBookTypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'fee', label: 'Fee' },
  { value: 'other', label: 'Service / Other' },
];

const LINE_TYPE_LABELS: Record<EstimateLineType, string> = {
  labor: 'Labor',
  material: 'Material',
  fee: 'Fee',
  other: 'Service / Other',
};

function priceLabel(item: ContractorPriceBookItem) {
  return item.default_unit_price_cents === null || item.default_unit_price_cents === undefined
    ? 'Price Required'
    : formatMoney(item.default_unit_price_cents);
}

function loadStateCopy(loadState: PriceBookLoadState, loadError: string) {
  if (loadState === 'loading') return 'Loading Price Book items...';
  if (loadState === 'error') return loadError || 'Price Book items could not be loaded.';
  if (loadState === 'idle') return 'Price Book is not ready yet.';
  return '';
}

export function DraftPriceBookPicker({
  items,
  loadState,
  loadError = '',
  disabled = false,
  onAddLine,
}: {
  items: ContractorPriceBookItem[];
  loadState: PriceBookLoadState;
  loadError?: string;
  disabled?: boolean;
  onAddLine: (line: WorkComposerLineDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [lineType, setLineType] = useState<PriceBookTypeFilter>('all');
  const [trade, setTrade] = useState('');
  const [category, setCategory] = useState('');
  const [addedTitle, setAddedTitle] = useState('');
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const addingItemIdRef = useRef<string | null>(null);
  const resetTimer = useRef<number | null>(null);
  const ready = loadState === 'ready';
  const activeItems = useMemo(() => filterPriceBookItems(items, {
    status: 'active',
    search: '',
    lineType: 'all',
    trade: '',
    category: '',
    subcategory: '',
  }), [items]);
  const trades = useMemo(() => priceBookFilterOptions(activeItems, 'trade'), [activeItems]);
  const categories = useMemo(() => priceBookFilterOptions(activeItems, 'category'), [activeItems]);
  const filteredItems = useMemo(() => filterPriceBookItems(items, {
    status: 'active',
    search,
    lineType,
    trade,
    category,
    subcategory: '',
  }), [category, items, lineType, search, trade]);
  const pickerDisabled = disabled || !ready;
  const stateCopy = loadStateCopy(loadState, loadError);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  useEffect(() => {
    if (!ready) setOpen(false);
  }, [ready]);

  const addItem = (item: ContractorPriceBookItem) => {
    if (pickerDisabled || addingItemIdRef.current) return;
    addingItemIdRef.current = item.id;
    setAddingItemId(item.id);
    onAddLine(priceBookItemToEstimateLineDraft(item));
    setAddedTitle(item.title);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      addingItemIdRef.current = null;
      setAddingItemId(null);
      resetTimer.current = null;
    }, 250);
  };

  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3" data-testid="durable-draft-price-book">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="shrink-0 text-blue-700" />
            <h3 className="text-sm font-bold text-slate-950">Price Book</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {ready
              ? `${activeItems.length} active item${activeItems.length === 1 ? '' : 's'} available. Add one as a fresh editable Draft line.`
              : stateCopy}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          data-testid="durable-draft-price-book-toggle"
          disabled={pickerDisabled}
          aria-expanded={open}
          aria-controls="durable-draft-price-book-picker"
          onClick={() => setOpen(current => !current)}
        >
          <Search size={15} />
          Browse items
          <ChevronDown size={15} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>
      </div>

      {!ready && loadState === 'error' ? (
        <p className="mt-2 text-xs font-semibold text-red-700" role="alert" data-testid="durable-draft-price-book-error">{stateCopy}</p>
      ) : null}

      {open && ready ? (
        <div id="durable-draft-price-book-picker" className="mt-3 rounded-xl border border-blue-100 bg-white p-3" data-testid="durable-draft-price-book-picker">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search Price Book</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search title, description, trade, category, SKU..."
              />
            </div>
          </label>

          <div className="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label="Filter Price Book items">
            <label className="block text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Type</span>
              <select className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900" value={lineType} onChange={event => setLineType(event.target.value as PriceBookTypeFilter)}>
                {TYPE_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Trade</span>
              <select className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900" value={trade} onChange={event => setTrade(event.target.value)}>
                <option value="">All trades</option>
                {trades.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Category</span>
              <select className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900" value={category} onChange={event => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>

          {addedTitle ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" role="status" data-testid="durable-draft-price-book-feedback">
              Added {addedTitle}. Review and edit the new Draft line before saving.
            </p>
          ) : null}

          {activeItems.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500" data-testid="durable-draft-price-book-empty">
              No active Price Book items are available.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500" data-testid="durable-draft-price-book-no-results">
              No active Price Book items match these filters.
            </div>
          ) : (
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1" data-testid="durable-draft-price-book-results">
              {filteredItems.map(item => (
                <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">{item.title}</p>
                    {item.customer_description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.customer_description}</p> : null}
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {LINE_TYPE_LABELS[item.line_type]} / {item.unit || 'each'} / {priceLabel(item)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    data-testid="durable-draft-price-book-add"
                    disabled={Boolean(addingItemId)}
                    onClick={() => addItem(item)}
                  >
                    <Plus size={15} />
                    {addingItemId === item.id ? 'Adding...' : 'Add item'}
                  </button>
                </article>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Copies title, customer description, type, unit, optional price, and optional labor hours only. Price Book records and private metadata stay unchanged.
          </p>
        </div>
      ) : null}
    </section>
  );
}
