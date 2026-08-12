import type {
  PriceBookImportAction,
  PriceBookImportBatchResult,
  PriceBookImportPreview,
  PriceBookImportRequestRow,
  PriceBookImportSource,
  PriceBookCsvMapping,
} from './priceBookCsvReconciliation';
import { sha256Hex } from './priceBookCsvReconciliation';

export const BASIC_PRICE_BOOK_STARTER_SOURCE_NAME = 'ServSync basic contractor starter';
export const BASIC_PRICE_BOOK_STARTER_VERSION = 'servsync-basic-contractor-v1';
export const BASIC_PRICE_BOOK_STARTER_IDEMPOTENCY_KEY = 'f0240000-0000-4000-8000-000000000001';

const STARTER_ITEMS = [
  { key: 'service-call', title: 'Service call', lineType: 'other', unit: 'each' },
  { key: 'diagnostic-labor', title: 'Diagnostic labor', lineType: 'labor', unit: 'hour' },
  { key: 'standard-labor', title: 'Standard labor', lineType: 'labor', unit: 'hour' },
  { key: 'helper-labor', title: 'Helper labor', lineType: 'labor', unit: 'hour' },
  { key: 'after-hours-service', title: 'After-hours service', lineType: 'other', unit: 'each' },
  { key: 'travel-charge', title: 'Travel / trip charge', lineType: 'fee', unit: 'each' },
  { key: 'permit-fee', title: 'Permit / administrative fee', lineType: 'fee', unit: 'each' },
  { key: 'replacement-part', title: 'Common replacement part', lineType: 'material', unit: 'each' },
  { key: 'repair-material', title: 'Common repair material', lineType: 'material', unit: 'each' },
  { key: 'equipment-rental', title: 'Equipment rental', lineType: 'other', unit: 'day' },
  { key: 'disposal-fee', title: 'Disposal fee', lineType: 'fee', unit: 'each' },
  { key: 'misc-service', title: 'Miscellaneous service', lineType: 'other', unit: 'each' },
] as const;

const STARTER_MAPPING: PriceBookCsvMapping = {
  external_item_id: 'External ID',
  title: 'Title',
  line_type: 'Item type',
  unit: 'Unit',
};

export type PriceBookStarterCatalogApi = {
  listSources: () => Promise<PriceBookImportSource[]>;
  createSource: (displayName: string) => Promise<PriceBookImportSource>;
  preview: (sourceId: string, rows: PriceBookImportRequestRow[]) => Promise<PriceBookImportPreview>;
  execute: (input: {
    sourceId: string;
    rows: PriceBookImportRequestRow[];
    actions: Record<string, PriceBookImportAction>;
    idempotencyKey: string;
    filename: string;
    fileSha256: string;
    fileSizeBytes: number;
    mapping: PriceBookCsvMapping;
  }) => Promise<PriceBookImportBatchResult>;
};

export type PriceBookStarterCatalogResult = PriceBookImportBatchResult & {
  itemCount: number;
};

export function basicPriceBookStarterRows(): PriceBookImportRequestRow[] {
  return STARTER_ITEMS.map((item, index) => ({
    row_number: index + 1,
    external_item_id: `${BASIC_PRICE_BOOK_STARTER_VERSION}:${item.key}`,
    mapped_fields: ['title', 'line_type', 'unit'],
    values: {
      title: item.title,
      line_type: item.lineType,
      unit: item.unit,
    },
  }));
}

async function resolveStarterSource(api: PriceBookStarterCatalogApi) {
  const findSource = (sources: PriceBookImportSource[]) => sources.find(
    source => source.display_name.toLocaleLowerCase() === BASIC_PRICE_BOOK_STARTER_SOURCE_NAME.toLocaleLowerCase(),
  );
  const existing = findSource(await api.listSources());
  if (existing) return existing;
  try {
    return await api.createSource(BASIC_PRICE_BOOK_STARTER_SOURCE_NAME);
  } catch {
    const concurrent = findSource(await api.listSources());
    if (concurrent) return concurrent;
    throw new Error('ServSync could not prepare the starter catalog source. No Price Book items were added.');
  }
}

export async function createBasicPriceBookStarterCatalog(
  api: PriceBookStarterCatalogApi,
): Promise<PriceBookStarterCatalogResult> {
  const rows = basicPriceBookStarterRows();
  const source = await resolveStarterSource(api);
  const preview = await api.preview(source.id, rows);
  if (preview.rows.length !== rows.length) {
    throw new Error('The starter catalog preview was incomplete. No Price Book items were added.');
  }

  const actions = preview.rows.reduce<Record<string, PriceBookImportAction>>((next, row) => {
    const mayAdd = row.match_type === 'none'
      && row.reconciliation_status === 'new'
      && row.errors.length === 0
      && row.allowed_actions.includes('add');
    next[String(row.row_number)] = mayAdd ? 'add' : 'skip';
    return next;
  }, {});
  const artifact = JSON.stringify({ version: BASIC_PRICE_BOOK_STARTER_VERSION, rows });
  const result = await api.execute({
    sourceId: source.id,
    rows,
    actions,
    idempotencyKey: BASIC_PRICE_BOOK_STARTER_IDEMPOTENCY_KEY,
    filename: `${BASIC_PRICE_BOOK_STARTER_VERSION}.csv`,
    fileSha256: await sha256Hex(artifact),
    fileSizeBytes: new TextEncoder().encode(artifact).byteLength,
    mapping: STARTER_MAPPING,
  });
  if (
    result.row_count !== rows.length
    || result.error_count !== 0
    || result.update_count !== 0
    || result.add_count + result.skip_count !== rows.length
  ) {
    throw new Error('The starter catalog result could not be verified. Refresh Price Book before trying again.');
  }
  return { ...result, itemCount: rows.length };
}
