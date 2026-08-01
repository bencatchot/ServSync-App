import type { ContractorPriceBookItem, EstimateLineType } from '../../types';

export type PriceBookStatusView = 'active' | 'archived';
export type PriceBookTypeFilter = 'all' | EstimateLineType;

export type PriceBookFilters = {
  status: PriceBookStatusView;
  search: string;
  lineType: PriceBookTypeFilter;
  trade: string;
  category: string;
};

export const PRICE_BOOK_PAGE_SIZE = 25;

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLocaleLowerCase();
}

export function priceBookItemIsArchived(item: ContractorPriceBookItem) {
  return !item.active || Boolean(item.archived_at);
}

export function priceBookFilterOptions(items: ContractorPriceBookItem[], field: 'trade' | 'category') {
  const labels = new Map<string, string>();
  items.forEach(item => {
    const label = item[field].trim();
    if (!label) return;
    const key = normalize(label);
    if (!labels.has(key)) labels.set(key, label);
  });
  return [...labels.values()].sort((a, b) => a.localeCompare(b));
}

export function filterPriceBookItems(items: ContractorPriceBookItem[], filters: PriceBookFilters) {
  const search = normalize(filters.search);
  const trade = normalize(filters.trade);
  const category = normalize(filters.category);

  return items
    .filter(item => filters.status === 'archived' ? priceBookItemIsArchived(item) : !priceBookItemIsArchived(item))
    .filter(item => filters.lineType === 'all' || item.line_type === filters.lineType)
    .filter(item => !trade || normalize(item.trade) === trade)
    .filter(item => !category || normalize(item.category) === category)
    .filter(item => {
      if (!search) return true;
      return normalize([
        item.title,
        item.customer_description,
        item.internal_notes,
        item.trade,
        item.category,
        item.sku,
        item.unit,
      ].filter(Boolean).join(' ')).includes(search);
    })
    .sort((a, b) => a.title.localeCompare(b.title) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function priceBookPageCount(itemCount: number, pageSize = PRICE_BOOK_PAGE_SIZE) {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function priceBookPage<T>(items: T[], page: number, pageSize = PRICE_BOOK_PAGE_SIZE) {
  const pageCount = priceBookPageCount(items.length, pageSize);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    firstResult: items.length === 0 ? 0 : start + 1,
    lastResult: Math.min(start + pageSize, items.length),
  };
}
