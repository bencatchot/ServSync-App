import type { ContractorPriceBookItem, EstimateLineType } from '../../types';

export const PRICE_BOOK_EXPORT_MAX_ITEMS = 5000;
export const PRICE_BOOK_EXPORT_WORKSHEET_NAME = 'Price Book';

export const PRICE_BOOK_EXPORT_HEADERS = [
  'ServSync Item Reference',
  'SKU / Code',
  'Title',
  'Customer Description',
  'Trade',
  'Category',
  'Subcategory',
  'Item Type',
  'Unit',
  'Default Price',
  'Taxable',
  'Labor Hours',
  'Active',
] as const;

export type PriceBookExportScope = 'all' | 'active';
export type PriceBookExportFormat = 'csv' | 'xlsx';
export type PriceBookExportItem = Pick<ContractorPriceBookItem,
  | 'id'
  | 'title'
  | 'customer_description'
  | 'trade'
  | 'category'
  | 'subcategory'
  | 'line_type'
  | 'unit'
  | 'default_unit_price_cents'
  | 'taxable'
  | 'labor_hours'
  | 'sku'
  | 'active'
  | 'archived_at'
>;

export type PriceBookExportRow = {
  servsyncItemReference: string;
  sku: string;
  title: string;
  customerDescription: string;
  trade: string;
  category: string;
  subcategory: string;
  itemType: string;
  unit: string;
  defaultPrice: number | null;
  taxable: boolean;
  laborHours: number | null;
  active: boolean;
};

const LINE_TYPE_LABELS: Record<EstimateLineType, string> = {
  other: 'Service',
  labor: 'Labor',
  material: 'Material',
  fee: 'Fee',
};

export function priceBookPortableItemReference(itemId: string) {
  return `servsync-item:${itemId}`;
}

export function priceBookItemsForExport<T extends PriceBookExportItem>(items: T[], scope: PriceBookExportScope) {
  return scope === 'active'
    ? items.filter(item => item.active && !item.archived_at)
    : items;
}

export function priceBookExportRows(items: PriceBookExportItem[]): PriceBookExportRow[] {
  if (items.length > PRICE_BOOK_EXPORT_MAX_ITEMS) {
    throw new Error(`Price Book export supports up to ${PRICE_BOOK_EXPORT_MAX_ITEMS.toLocaleString()} items at a time.`);
  }
  return items.map(item => ({
    servsyncItemReference: priceBookPortableItemReference(item.id),
    sku: item.sku || '',
    title: item.title,
    customerDescription: item.customer_description,
    trade: item.trade,
    category: item.category,
    subcategory: item.subcategory || '',
    itemType: LINE_TYPE_LABELS[item.line_type],
    unit: item.unit || '',
    defaultPrice: item.default_unit_price_cents == null ? null : item.default_unit_price_cents / 100,
    taxable: item.taxable,
    laborHours: item.labor_hours,
    active: item.active && !item.archived_at,
  }));
}

export function priceBookExportRowValues(row: PriceBookExportRow): Array<string | number | boolean | null> {
  return [
    row.servsyncItemReference,
    row.sku,
    row.title,
    row.customerDescription,
    row.trade,
    row.category,
    row.subcategory,
    row.itemType,
    row.unit,
    row.defaultPrice,
    row.taxable,
    row.laborHours,
    row.active,
  ];
}

// Spreadsheet applications may evaluate these prefixes as formulas when opening CSV.
export function escapePriceBookCsvFormula(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | boolean | null) {
  const text = typeof value === 'string'
    ? escapePriceBookCsvFormula(value)
    : value === null
      ? ''
      : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializePriceBookCsv(items: PriceBookExportItem[]) {
  const rows = priceBookExportRows(items);
  const lines = [
    PRICE_BOOK_EXPORT_HEADERS.map(csvCell).join(','),
    ...rows.map(row => priceBookExportRowValues(row).map(csvCell).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function priceBookExportFilename(format: PriceBookExportFormat, date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `ServSync_Price_Book_${year}-${month}-${day}.${format}`;
}

export async function createPriceBookXlsxBlob(items: PriceBookExportItem[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const rows = priceBookExportRows(items);
  const header = PRICE_BOOK_EXPORT_HEADERS.map(value => ({
    value,
    type: String,
    fontWeight: 'bold' as const,
    backgroundColor: '#E2E8F0',
    textColor: '#0F172A',
    wrap: true,
  }));
  const data = [
    header,
    ...rows.map(row => priceBookExportRowValues(row).map((value, index) => {
      if (value === null) return { value: undefined };
      if (index === 9) return { value, type: Number, format: '$#,##0.00' };
      if (index === 11) return { value, type: Number, format: '0.00' };
      if (typeof value === 'boolean') return { value, type: Boolean };
      if (typeof value === 'number') return { value, type: Number };
      return { value, type: String, format: '@', wrap: index === 2 || index === 3 };
    })),
  ];
  return writeExcelFile(data, {
    sheet: PRICE_BOOK_EXPORT_WORKSHEET_NAME,
    stickyRowsCount: 1,
    columns: [
      { width: 48 }, { width: 18 }, { width: 30 }, { width: 44 }, { width: 16 },
      { width: 20 }, { width: 20 }, { width: 14 }, { width: 12 }, { width: 15 },
      { width: 11 }, { width: 13 }, { width: 10 },
    ],
  }).toBlob();
}
