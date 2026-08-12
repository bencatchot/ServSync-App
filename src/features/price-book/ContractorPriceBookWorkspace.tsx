import { AlertTriangle, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ContractorPriceBookItem, EstimateLineType } from '../../types';
import { formatMoney } from '../../utils/format';
import {
  filterPriceBookItems,
  priceBookFilterOptions,
  priceBookItemIsArchived,
  priceBookPage,
  type PriceBookLoadState,
  type PriceBookStatusView,
  type PriceBookTypeFilter,
} from './priceBookView';
import { derivePriceBookMargin, formatGrossMarginPercent, formatSignedMoney } from './priceBookMargin';

export type ContractorPriceBookItemDraft = {
  title: string;
  customer_description: string;
  internal_notes: string;
  trade: string;
  category: string;
  subcategory: string;
  line_type: EstimateLineType;
  unit: string;
  default_unit_price: string;
  internal_cost: string;
  taxable: boolean;
  labor_hours: string;
  sku: string;
  active: boolean;
};

export type ContractorPriceBookBulkChanges = Partial<Pick<
  ContractorPriceBookItem,
  'trade' | 'category' | 'subcategory' | 'line_type' | 'active' | 'archived_at'
>>;

type PriceBookBulkAction = 'trade' | 'category' | 'subcategory' | 'line_type' | 'archive' | 'restore';

export type { PriceBookLoadState } from './priceBookView';

const TYPE_FILTERS: Array<{ value: PriceBookTypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'other', label: 'Service' },
  { value: 'fee', label: 'Fee' },
];

const LINE_TYPE_LABELS: Record<EstimateLineType, string> = {
  labor: 'Labor',
  material: 'Material',
  fee: 'Fee',
  other: 'Service',
};

const inputClass = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButtonClass = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function countByStatus(items: ContractorPriceBookItem[], status: PriceBookStatusView) {
  return items.filter(item => status === 'archived' ? priceBookItemIsArchived(item) : !priceBookItemIsArchived(item)).length;
}

function priceLabel(item: ContractorPriceBookItem) {
  return item.default_unit_price_cents === null || item.default_unit_price_cents === undefined
    ? 'Price Required'
    : formatMoney(item.default_unit_price_cents);
}

function marginLabel(item: ContractorPriceBookItem) {
  if (item.internal_cost_cents === null || item.internal_cost_cents === undefined) {
    return 'Cost not set';
  }
  const margin = derivePriceBookMargin(item.default_unit_price_cents, item.internal_cost_cents);
  if (!margin) return `Cost ${formatMoney(item.internal_cost_cents)} · Margin unavailable`;
  return `Cost ${formatMoney(item.internal_cost_cents)} · ${formatSignedMoney(margin.grossProfitCents)} profit · ${formatGrossMarginPercent(margin.grossMarginPercent)}`;
}

export function ContractorPriceBookWorkspace({
  items,
  contractorSaved,
  canManage,
  loadState,
  loadError,
  draft,
  setDraft,
  formOpen,
  editingItemId,
  savingItem,
  togglingItemId,
  csvTools,
  exportTools,
  onBack,
  onRetry,
  onOpenAddForm,
  onCancelForm,
  onSave,
  onEdit,
  onToggleActive,
  onBulkUpdate,
}: {
  items: ContractorPriceBookItem[];
  contractorSaved: boolean;
  canManage: boolean;
  loadState: PriceBookLoadState;
  loadError: string;
  draft: ContractorPriceBookItemDraft;
  setDraft: Dispatch<SetStateAction<ContractorPriceBookItemDraft>>;
  formOpen: boolean;
  editingItemId: string | null;
  savingItem: boolean;
  togglingItemId: string | null;
  csvTools?: ReactNode;
  exportTools?: ReactNode;
  onBack: () => void;
  onRetry: () => void;
  onOpenAddForm: () => void;
  onCancelForm: () => void;
  onSave: () => void;
  onEdit: (item: ContractorPriceBookItem) => void;
  onToggleActive: (item: ContractorPriceBookItem) => void;
  onBulkUpdate: (itemIds: string[], changes: ContractorPriceBookBulkChanges, actionLabel: string) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<PriceBookStatusView>('active');
  const [csvToolsMounted, setCsvToolsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [lineType, setLineType] = useState<PriceBookTypeFilter>('all');
  const [trade, setTrade] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [page, setPage] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<PriceBookBulkAction | ''>('');
  const [bulkValue, setBulkValue] = useState('');
  const [applyingBulkAction, setApplyingBulkAction] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const statusItems = useMemo(
    () => items.filter(item => status === 'archived' ? priceBookItemIsArchived(item) : !priceBookItemIsArchived(item)),
    [items, status],
  );
  const trades = useMemo(() => priceBookFilterOptions(statusItems, 'trade'), [statusItems]);
  const tradeItems = useMemo(
    () => statusItems.filter(item => !trade || item.trade.trim().toLocaleLowerCase() === trade.trim().toLocaleLowerCase()),
    [statusItems, trade],
  );
  const categories = useMemo(() => priceBookFilterOptions(tradeItems, 'category'), [tradeItems]);
  const categoryItems = useMemo(
    () => tradeItems.filter(item => !category || item.category.trim().toLocaleLowerCase() === category.trim().toLocaleLowerCase()),
    [tradeItems, category],
  );
  const subcategories = useMemo(() => priceBookFilterOptions(categoryItems, 'subcategory'), [categoryItems]);
  const filteredItems = useMemo(
    () => filterPriceBookItems(items, { status, search, lineType, trade, category, subcategory }),
    [items, status, search, lineType, trade, category, subcategory],
  );
  const paged = useMemo(() => priceBookPage(filteredItems, page), [filteredItems, page]);
  const filtersActive = Boolean(search.trim() || lineType !== 'all' || trade || category || subcategory);
  const canMutate = contractorSaved && canManage && loadState === 'ready';
  const currentPageIds = useMemo(() => paged.items.map(item => item.id), [paged.items]);
  const selectedCurrentPageCount = currentPageIds.filter(id => selectedIds.has(id)).length;
  const allCurrentPageSelected = currentPageIds.length > 0 && selectedCurrentPageCount === currentPageIds.length;

  useEffect(() => {
    setPage(1);
  }, [status, search, lineType, trade, category, subcategory]);

  useEffect(() => {
    if (trade && !trades.includes(trade)) setTrade('');
    if (category && !categories.includes(category)) setCategory('');
    if (subcategory && !subcategories.includes(subcategory)) setSubcategory('');
  }, [trade, category, subcategory, trades, categories, subcategories]);

  useEffect(() => {
    setSelectedIds(new Set());
    setBulkAction('');
    setBulkValue('');
  }, [items, status, search, lineType, trade, category, subcategory, page]);

  useEffect(() => {
    setSelectedIds(current => {
      const visible = new Set(currentPageIds);
      const next = new Set([...current].filter(id => visible.has(id)));
      return next.size === current.size && [...next].every(id => current.has(id)) ? current : next;
    });
  }, [currentPageIds]);

  useEffect(() => {
    setAdvancedOpen(Boolean(editingItemId));
  }, [editingItemId]);

  useEffect(() => {
    if (!formOpen) return;
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      titleRef.current?.focus({ preventScroll: true });
    });
  }, [formOpen, editingItemId]);

  const clearFilters = () => {
    setSearch('');
    setLineType('all');
    setTrade('');
    setCategory('');
    setSubcategory('');
  };

  const setStatusView = (nextStatus: PriceBookStatusView) => {
    setStatus(nextStatus);
    clearFilters();
  };

  const toggleItemSelection = (itemId: string, checked: boolean) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const toggleCurrentPageSelection = (checked: boolean) => {
    setSelectedIds(checked ? new Set(currentPageIds) : new Set());
  };

  const applyBulkAction = async () => {
    const itemIds = currentPageIds.filter(id => selectedIds.has(id));
    if (!bulkAction || itemIds.length === 0 || applyingBulkAction) return;

    let changes: ContractorPriceBookBulkChanges;
    let actionLabel: string;
    if (bulkAction === 'archive') {
      changes = { active: false, archived_at: new Date().toISOString() };
      actionLabel = 'archive';
    } else if (bulkAction === 'restore') {
      changes = { active: true, archived_at: null };
      actionLabel = 'restore';
    } else if (bulkAction === 'line_type') {
      changes = { line_type: bulkValue as EstimateLineType };
      actionLabel = `change type to ${LINE_TYPE_LABELS[bulkValue as EstimateLineType]}`;
    } else {
      const normalizedValue = bulkValue.trim();
      changes = { [bulkAction]: bulkAction === 'subcategory' && !normalizedValue ? null : normalizedValue };
      actionLabel = bulkValue.trim() ? `change ${bulkAction} to "${bulkValue.trim()}"` : `clear ${bulkAction}`;
    }

    if (!window.confirm(`Apply ${actionLabel} to ${itemIds.length} selected current-page item${itemIds.length === 1 ? '' : 's'}?`)) return;
    setApplyingBulkAction(true);
    try {
      const succeeded = await onBulkUpdate(itemIds, changes, actionLabel);
      if (succeeded) {
        setSelectedIds(new Set());
        setBulkAction('');
        setBulkValue('');
      }
    } finally {
      setApplyingBulkAction(false);
    }
  };

  const bulkValueRequired = bulkAction === 'line_type';

  return (
    <section data-testid="contractor-price-book-workspace" className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Private contractor library</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Price Book</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-blue-950">
              Keep reusable labor, materials, services, and fees organized for faster estimating. Adding an item to an estimate creates an editable copy; this library never changes an existing document.
            </p>
          </div>
          <button type="button" onClick={onBack} className={secondaryButtonClass}>
            <ArrowLeft size={16} />
            Back to Jobs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2" aria-label="Price Book totals">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{countByStatus(items, 'active')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Archived</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{countByStatus(items, 'archived')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price Required</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{items.filter(item => !priceBookItemIsArchived(item) && item.default_unit_price_cents == null).length}</p>
        </div>
      </div>

      {!contractorSaved ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Save the business profile once before adding Price Book items.</div>
      ) : !canManage ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          You can view Price Book items, but only the contractor owner, admin, or office role can change them.
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-950">Items</h3>
            <p className="mt-1 text-sm text-slate-600">Search and filter the reusable pricing your team can use.</p>
          </div>
          {canMutate ? (
            <button type="button" disabled={applyingBulkAction} onClick={onOpenAddForm} className={primaryButtonClass}>
              <Plus size={16} />
              Add Item
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Price Book item status">
          {(['active', 'archived'] as const).map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              disabled={applyingBulkAction}
              aria-selected={status === value}
              onClick={() => setStatusView(value)}
              className={`${status === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'} min-h-[42px] rounded-lg px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`}
            >
              {value === 'active' ? `Active (${countByStatus(items, 'active')})` : `Archived (${countByStatus(items, 'archived')})`}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-700" htmlFor="price-book-search">Search Price Book</label>
          <div className="relative mt-1.5">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="price-book-search"
              type="search"
              className={`${inputClass} pl-10`}
              value={search}
              disabled={applyingBulkAction}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search item name, trade, category, subcategory, SKU, or notes"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filter Price Book by type">
          {TYPE_FILTERS.map(option => (
            <button
              key={option.value}
              type="button"
              disabled={applyingBulkAction}
              aria-pressed={lineType === option.value}
              onClick={() => setLineType(option.value)}
              className={`${lineType === option.value ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700'} min-h-[40px] shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Trade">
            <select className={inputClass} value={trade} disabled={applyingBulkAction} onChange={event => setTrade(event.target.value)}>
              <option value="">All trades</option>
              {trades.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select className={inputClass} value={category} disabled={applyingBulkAction} onChange={event => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="Subcategory">
            <select className={inputClass} value={subcategory} disabled={applyingBulkAction} onChange={event => setSubcategory(event.target.value)}>
              <option value="">All subcategories</option>
              {subcategories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
        </div>

        {filtersActive ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>{filteredItems.length} matching item{filteredItems.length === 1 ? '' : 's'}</span>
            <button type="button" disabled={applyingBulkAction} onClick={clearFilters} className="min-h-[40px] font-bold text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Clear filters</button>
          </div>
        ) : null}

        <div className="mt-4" aria-live="polite">
          {loadState === 'loading' || loadState === 'idle' ? (
            <div data-testid="price-book-loading" className="space-y-2" role="status">
              <p className="text-sm font-semibold text-slate-600">Loading Price Book items...</p>
              {[0, 1, 2].map(value => <div key={value} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : loadState === 'error' ? (
            <div data-testid="price-book-load-error" role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="font-bold text-amber-950">Price Book items could not be loaded.</p>
                  <p className="mt-1 text-sm text-amber-900">{loadError || 'Try loading the contractor workspace again.'}</p>
                </div>
              </div>
              <button type="button" onClick={onRetry} className={`${secondaryButtonClass} mt-3`}>Try again</button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div data-testid="price-book-empty-state" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="font-bold text-slate-950">
                {filtersActive
                  ? `No ${status} items match these filters.`
                  : status === 'archived'
                    ? 'No archived Price Book items.'
                    : 'Your Price Book is empty.'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {filtersActive
                  ? 'Clear or adjust the filters to see more items.'
                  : status === 'archived'
                    ? 'Archived items will appear here and can be restored.'
                    : canManage
                      ? 'Add the labor, materials, services, and fees you reuse most often.'
                      : 'No active items are available for this contractor account.'}
              </p>
              {!filtersActive && status === 'active' && canMutate ? (
                <button type="button" onClick={onOpenAddForm} className={`${primaryButtonClass} mt-4`}><Plus size={16} />Add your first item</button>
              ) : null}
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Showing {paged.firstResult}–{paged.lastResult} of {filteredItems.length}
              </p>
              {canMutate ? (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="price-book-bulk-controls">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex min-h-[40px] items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        disabled={applyingBulkAction}
                        checked={allCurrentPageSelected}
                        aria-checked={selectedCurrentPageCount > 0 && !allCurrentPageSelected ? 'mixed' : allCurrentPageSelected}
                        onChange={event => toggleCurrentPageSelection(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      Select this page ({currentPageIds.length})
                    </label>
                    <p className="text-xs font-medium text-slate-500">
                      {selectedCurrentPageCount} selected. Selection is current-page only and clears when the view changes.
                    </p>
                  </div>

                  {selectedCurrentPageCount > 0 ? (
                    <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" data-testid="price-book-bulk-action-form">
                      <label className="text-xs font-bold text-slate-700">
                        Bulk action
                        <select
                          className={`${inputClass} mt-1`}
                          value={bulkAction}
                          disabled={applyingBulkAction}
                          onChange={event => {
                            const nextAction = event.target.value as PriceBookBulkAction | '';
                            setBulkAction(nextAction);
                            setBulkValue(nextAction === 'line_type' ? 'material' : '');
                          }}
                        >
                          <option value="">Choose action</option>
                          <option value="trade">Change trade</option>
                          <option value="category">Change category</option>
                          <option value="subcategory">Change subcategory</option>
                          <option value="line_type">Change item type</option>
                          {status === 'active' ? <option value="archive">Archive selected</option> : <option value="restore">Restore selected</option>}
                        </select>
                      </label>

                      {bulkAction === 'line_type' ? (
                        <label className="text-xs font-bold text-slate-700">
                          New item type
                          <select className={`${inputClass} mt-1`} value={bulkValue} disabled={applyingBulkAction} onChange={event => setBulkValue(event.target.value)}>
                            {TYPE_FILTERS.filter(option => option.value !== 'all').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                      ) : bulkAction === 'trade' || bulkAction === 'category' || bulkAction === 'subcategory' ? (
                        <label className="text-xs font-bold text-slate-700">
                          New {bulkAction}
                          <input
                            className={`${inputClass} mt-1`}
                            value={bulkValue}
                            disabled={applyingBulkAction}
                            onChange={event => setBulkValue(event.target.value)}
                            placeholder="Leave blank to clear"
                          />
                        </label>
                      ) : <div />}

                      <button
                        type="button"
                        disabled={!bulkAction || (bulkValueRequired && !bulkValue) || applyingBulkAction}
                        onClick={() => void applyBulkAction()}
                        className={`${primaryButtonClass} self-end`}
                      >
                        {applyingBulkAction ? 'Applying...' : `Apply to ${selectedCurrentPageCount}`}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200" data-testid="price-book-item-list">
                {paged.items.map(item => {
                  const archived = priceBookItemIsArchived(item);
                  return (
                    <article key={item.id} data-testid="price-book-item-row" className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {canMutate ? (
                          <label className="flex min-h-[40px] shrink-0 items-center" aria-label={`Select ${item.title}`}>
                            <input
                              type="checkbox"
                              disabled={applyingBulkAction}
                              aria-label={`Select ${item.title}`}
                              checked={selectedIds.has(item.id)}
                              onChange={event => toggleItemSelection(item.id, event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            />
                          </label>
                        ) : null}
                        <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="min-w-0 truncate text-sm font-bold text-slate-950">{item.title}</h4>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{LINE_TYPE_LABELS[item.line_type]}</span>
                          {archived ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Archived</span> : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{[item.trade, item.category, item.subcategory].filter(Boolean).join(' · ') || 'Uncategorized'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <div className="text-right">
                          <p className={`${item.default_unit_price_cents == null ? 'text-amber-700' : 'text-slate-950'} text-sm font-bold`}>{priceLabel(item)}</p>
                          {canManage ? <p className={`${(derivePriceBookMargin(item.default_unit_price_cents, item.internal_cost_cents)?.grossProfitCents ?? 0) < 0 ? 'text-amber-700' : 'text-slate-500'} mt-0.5 text-xs`} data-testid="price-book-margin-summary">{marginLabel(item)}</p> : null}
                          <p className="mt-0.5 text-xs text-slate-500">{item.unit || 'No unit'}</p>
                        </div>
                        {canMutate ? (
                          <div className="flex gap-2">
                            <button type="button" disabled={applyingBulkAction} onClick={() => onEdit(item)} className={secondaryButtonClass}>Edit</button>
                            <button
                              type="button"
                              disabled={applyingBulkAction || togglingItemId === item.id}
                              onClick={() => onToggleActive(item)}
                              className={secondaryButtonClass}
                            >
                              {togglingItemId === item.id ? 'Updating...' : archived ? 'Restore' : 'Archive'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {paged.pageCount > 1 ? (
                <nav className="mt-3 flex items-center justify-between gap-3" aria-label="Price Book pages">
                  <button type="button" disabled={applyingBulkAction || paged.page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className={secondaryButtonClass}><ChevronLeft size={16} />Previous</button>
                  <span className="text-sm font-semibold text-slate-600">Page {paged.page} of {paged.pageCount}</span>
                  <button type="button" disabled={applyingBulkAction || paged.page === paged.pageCount} onClick={() => setPage(value => Math.min(paged.pageCount, value + 1))} className={secondaryButtonClass}>Next<ChevronRight size={16} /></button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>

      {canMutate && formOpen ? (
        <div ref={formRef} data-testid="price-book-item-form" className="scroll-mt-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-950">{editingItemId ? 'Edit Price Book Item' : 'Add Price Book Item'}</h3>
              <p className="mt-1 text-sm text-slate-600">Only the item name is required. Leave the price blank when it must be set in the estimate.</p>
            </div>
            <button type="button" onClick={onCancelForm} className={secondaryButtonClass}>Cancel</button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Item name *">
              <input ref={titleRef} className={inputClass} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Service call" />
            </Field>
            <Field label="Selling price">
              <input className={inputClass} inputMode="decimal" value={draft.default_unit_price} onChange={event => setDraft(current => ({ ...current, default_unit_price: event.target.value }))} placeholder="Blank = Price Required" />
            </Field>
            <Field label="Internal cost">
              <input className={inputClass} inputMode="decimal" value={draft.internal_cost} onChange={event => setDraft(current => ({ ...current, internal_cost: event.target.value }))} placeholder="Optional private cost" />
            </Field>
            <Field label="Unit">
              <input className={inputClass} value={draft.unit} onChange={event => setDraft(current => ({ ...current, unit: event.target.value }))} placeholder="each" />
            </Field>
            <Field label="Type">
              <select className={inputClass} value={draft.line_type} onChange={event => setDraft(current => ({ ...current, line_type: event.target.value as EstimateLineType }))}>
                {TYPE_FILTERS.filter(option => option.value !== 'all').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </div>

          <fieldset className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-bold text-slate-800">Organization</legend>
            <p className="mb-3 text-xs leading-5 text-slate-500">Use contractor-created values in the order trade, category, then subcategory. Any level may be left blank.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Trade">
                <input className={inputClass} value={draft.trade} onChange={event => setDraft(current => ({ ...current, trade: event.target.value }))} placeholder="HVAC, plumbing..." />
              </Field>
              <Field label="Category">
                <input className={inputClass} value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} placeholder="Service, repair..." />
              </Field>
              <Field label="Subcategory">
                <input className={inputClass} value={draft.subcategory} onChange={event => setDraft(current => ({ ...current, subcategory: event.target.value }))} placeholder="Diagnostics, fixtures..." />
              </Field>
            </div>
          </fieldset>

          <details open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)} className="mt-4 rounded-xl border border-slate-200 bg-white">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
              Advanced Options
              <ChevronDown size={17} className={`${advancedOpen ? 'rotate-180' : ''} transition-transform`} />
            </summary>
            <div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Labor hours">
                <input className={inputClass} inputMode="decimal" value={draft.labor_hours} onChange={event => setDraft(current => ({ ...current, labor_hours: event.target.value }))} placeholder="Optional" />
              </Field>
              <Field label="SKU / code">
                <input className={inputClass} value={draft.sku} onChange={event => setDraft(current => ({ ...current, sku: event.target.value }))} placeholder="Optional" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-h-[44px] items-center gap-2 self-end rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={draft.taxable} onChange={event => setDraft(current => ({ ...current, taxable: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600" />Taxable
                </label>
                <label className="flex min-h-[44px] items-center gap-2 self-end rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={draft.active} onChange={event => setDraft(current => ({ ...current, active: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600" />Active
                </label>
              </div>
              <div className="sm:col-span-2">
                <Field label="Customer description">
                  <textarea className={inputClass} rows={3} value={draft.customer_description} onChange={event => setDraft(current => ({ ...current, customer_description: event.target.value }))} placeholder="Optional customer-safe description" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Internal notes">
                  <textarea className={inputClass} rows={3} value={draft.internal_notes} onChange={event => setDraft(current => ({ ...current, internal_notes: event.target.value }))} placeholder="Private contractor note" />
                </Field>
              </div>
            </div>
          </details>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancelForm} className={secondaryButtonClass}>Cancel</button>
            <button type="button" disabled={savingItem} onClick={onSave} className={primaryButtonClass}>
              {savingItem ? 'Saving...' : editingItemId ? 'Save Item' : 'Add Item'}
            </button>
          </div>
        </div>
      ) : null}

      {exportTools ? (
        <details className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="price-book-export-tools">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            Export Price Book
            <ChevronDown size={17} />
          </summary>
          <div className="border-t border-slate-200 p-4">{exportTools}</div>
        </details>
      ) : null}

      {canMutate && csvTools ? (
        <details
          className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          data-testid="price-book-import-tools"
          onToggle={event => {
            if (event.currentTarget.open) setCsvToolsMounted(true);
          }}
        >
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            Import from CSV or XLSX
            <ChevronDown size={17} />
          </summary>
          {csvToolsMounted ? <div className="border-t border-slate-200 p-4">{csvTools}</div> : null}
        </details>
      ) : null}
    </section>
  );
}
