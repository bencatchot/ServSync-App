import type { EstimateLineType } from '../../types';

export const PRICE_BOOK_CSV_MAX_BYTES = 1024 * 1024;
export const PRICE_BOOK_CSV_MAX_ROWS = 500;

export type PriceBookCsvField =
  | 'external_item_id'
  | 'title'
  | 'customer_description'
  | 'internal_notes'
  | 'trade'
  | 'category'
  | 'subcategory'
  | 'line_type'
  | 'unit'
  | 'default_unit_price'
  | 'default_unit_price_cents'
  | 'taxable'
  | 'labor_hours'
  | 'sku'
  | 'active';

export type PriceBookCsvMapping = Partial<Record<PriceBookCsvField, string>>;

export type PriceBookCsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type PriceBookImportAction = 'add' | 'update' | 'skip';
export type PriceBookImportMatchType = 'none' | 'external_id' | 'sku_suggestion' | 'exact_duplicate' | 'ambiguous';

export type PriceBookNormalizedValues = Partial<{
  title: string;
  customer_description: string;
  internal_notes: string;
  trade: string;
  category: string;
  subcategory: string | null;
  line_type: EstimateLineType;
  unit: string | null;
  default_unit_price_cents: number | null;
  taxable: boolean;
  labor_hours: number | null;
  sku: string | null;
  active: boolean;
}>;

export type PriceBookImportRequestRow = {
  row_number: number;
  external_item_id: string | null;
  mapped_fields: string[];
  values: PriceBookNormalizedValues;
};

export type PriceBookLocalPreviewRow = {
  rowNumber: number;
  externalItemId: string | null;
  values: PriceBookNormalizedValues;
  requestRow: PriceBookImportRequestRow;
  errors: string[];
  warnings: string[];
};

export type PriceBookImportSource = {
  id: string;
  display_name: string;
  source_kind: 'file_upload';
  status: 'active' | 'archived';
  created_at: string;
};

export type PriceBookImportPreviewRow = {
  row_number: number;
  external_item_id: string | null;
  sku: string | null;
  row_fingerprint: string;
  mapped_fields: string[];
  match_type: PriceBookImportMatchType;
  match_confidence: 'none' | 'low' | 'medium' | 'high';
  target_item_id: string | null;
  target_updated_at: string | null;
  current_values: PriceBookNormalizedValues | null;
  incoming_values: PriceBookNormalizedValues;
  result_values: PriceBookNormalizedValues;
  changed_fields: string[];
  conflict_fields: string[];
  recommended_action: PriceBookImportAction;
  allowed_actions: PriceBookImportAction[];
  warnings: string[];
  errors: string[];
};

export type PriceBookImportPreview = {
  source: Pick<PriceBookImportSource, 'id' | 'display_name'>;
  rows: PriceBookImportPreviewRow[];
  counts: { add: number; update: number; skip: number; error: number };
};

export type PriceBookImportBatchResult = {
  batch_id: string;
  status: 'completed';
  source_id: string;
  row_count: number;
  add_count: number;
  update_count: number;
  skip_count: number;
  error_count: number;
  idempotent: boolean;
};

export type PriceBookImportBatchSummary = {
  id: string;
  source_id: string;
  source_name: string;
  status: 'completed';
  original_filename: string;
  file_size_bytes: number;
  row_count: number;
  add_count: number;
  update_count: number;
  skip_count: number;
  error_count: number;
  created_at: string;
  completed_at: string;
};

export const PRICE_BOOK_CSV_FIELDS: Array<{
  key: PriceBookCsvField;
  label: string;
  required?: boolean;
  helper: string;
}> = [
  { key: 'external_item_id', label: 'External item ID', helper: 'Stable item ID from this source. Strongly recommended for repeat imports.' },
  { key: 'title', label: 'Title', required: true, helper: 'Item name or service title.' },
  { key: 'customer_description', label: 'Customer description', helper: 'Customer-safe description.' },
  { key: 'internal_notes', label: 'Internal notes', helper: 'Private contractor notes.' },
  { key: 'trade', label: 'Trade', helper: 'HVAC, plumbing, electrical, etc.' },
  { key: 'category', label: 'Category', helper: 'Service, repair, material, or your own grouping.' },
  { key: 'subcategory', label: 'Subcategory', helper: 'Optional grouping beneath category.' },
  { key: 'line_type', label: 'Line type', helper: 'labor, material, fee, or other.' },
  { key: 'unit', label: 'Unit', helper: 'Each, hour, job, lot, etc.' },
  { key: 'default_unit_price', label: 'Default price', helper: 'Dollar price such as $95.00. Blank means Price Required.' },
  { key: 'default_unit_price_cents', label: 'Default price cents', helper: 'Integer cents if your export uses cents.' },
  { key: 'taxable', label: 'Taxable', helper: 'true/false, yes/no, y/n, or 1/0.' },
  { key: 'labor_hours', label: 'Labor hours', helper: 'Optional non-negative number.' },
  { key: 'sku', label: 'SKU / code', helper: 'Optional item code.' },
  { key: 'active', label: 'Active', helper: 'Optional true/false. Blank defaults active for new items.' },
];

export const PRICE_BOOK_CSV_FIELD_ALIASES: Record<PriceBookCsvField, string[]> = {
  external_item_id: ['externalid', 'external_id', 'externalitemid', 'external_item_id', 'recordid', 'record_id', 'sourceitemid', 'source_item_id'],
  title: ['title', 'item', 'itemname', 'item_name', 'name', 'service', 'servicename', 'service_name'],
  customer_description: ['customerdescription', 'customer_description', 'description', 'desc', 'customerdesc', 'customer_desc'],
  internal_notes: ['internalnotes', 'internal_notes', 'notes', 'note', 'private_notes', 'privatenotes', 'internalnote'],
  trade: ['trade', 'trade_type', 'tradetype', 'discipline'],
  category: ['category', 'group', 'section', 'work_category', 'workcategory'],
  subcategory: ['subcategory', 'sub_category', 'subgroup', 'sub_group', 'subsection', 'sub_section', 'work_subcategory', 'worksubcategory'],
  line_type: ['line_type', 'linetype', 'type', 'item_type', 'itemtype'],
  unit: ['unit', 'uom', 'measure', 'unit_of_measure', 'unitofmeasure'],
  default_unit_price: ['price', 'rate', 'amount', 'default_price', 'defaultprice', 'default_unit_price', 'defaultunitprice', 'unit_price', 'unitprice'],
  default_unit_price_cents: ['default_unit_price_cents', 'defaultunitpricecents', 'price_cents', 'pricecents', 'amount_cents', 'amountcents'],
  taxable: ['taxable', 'tax', 'is_taxable', 'istaxable'],
  labor_hours: ['labor_hours', 'laborhours', 'hours', 'hrs', 'estimated_hours', 'estimatedhours'],
  sku: ['sku', 'code', 'item_code', 'itemcode', 'part_number', 'partnumber'],
  active: ['active', 'enabled', 'status'],
};

export const PRICE_BOOK_SAMPLE_CSV = [
  'external_id,title,description,notes,trade,category,subcategory,line_type,unit,price,taxable,labor_hours,sku,active',
  'SVC-001,"Standard service call","Initial visit and basic diagnostic review","Confirm scope before use",HVAC,Service,Diagnostics,fee,visit,$95.00,yes,,SVC-001,true',
  'LAB-001,"Hourly labor","Labor billed by hour","Adjust hours before use",General,Labor,,labor,hour,85,true,1,LAB-001,true',
  'PERMIT,"Permit coordination","Permit or inspection coordination when needed","Confirm local requirements",General,Fees,Permits,fee,each,,no,,PERMIT,true',
].join('\n');

export function normalizePriceBookCsvHeader(value: string) {
  return value.toLowerCase().replace(/^\uFEFF/, '').replace(/[^a-z0-9]+/g, '');
}

export function autoMapPriceBookCsvHeaders(headers: string[]): PriceBookCsvMapping {
  const normalizedHeaders = headers.map(header => ({ header, normalized: normalizePriceBookCsvHeader(header) }));
  return PRICE_BOOK_CSV_FIELDS.reduce<PriceBookCsvMapping>((mapping, field) => {
    const matched = normalizedHeaders.find(candidate => PRICE_BOOK_CSV_FIELD_ALIASES[field.key].includes(candidate.normalized));
    if (matched) mapping[field.key] = matched.header;
    return mapping;
  }, {});
}

export function parsePriceBookCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const normalizedText = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const next = normalizedText[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (inQuotes) throw new Error('CSV has an unterminated quoted value.');
  row.push(cell);
  rows.push(row);
  return rows;
}

export function priceBookCsvRowsFromParsed(parsedRows: string[][]): { headers: string[]; rows: PriceBookCsvRow[] } {
  const firstNonBlankRowIndex = parsedRows.findIndex(row => row.some(cell => cell.trim()));
  if (firstNonBlankRowIndex < 0) throw new Error('This CSV appears to be empty.');
  const headers = parsedRows[firstNonBlankRowIndex].map((header, index) => header.trim() || `Column ${index + 1}`);
  const normalizedHeaders = headers.map(normalizePriceBookCsvHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('CSV headers must be unique so every mapped field is deterministic.');
  }
  const dataRows = parsedRows.slice(firstNonBlankRowIndex + 1)
    .map((row, index) => ({ row, rowNumber: firstNonBlankRowIndex + index + 2 }))
    .filter(({ row }) => row.some(cell => cell.trim()));
  if (dataRows.length === 0) throw new Error('This CSV has headers but no item rows.');
  if (dataRows.length > PRICE_BOOK_CSV_MAX_ROWS) throw new Error(`CSV imports are limited to ${PRICE_BOOK_CSV_MAX_ROWS} item rows.`);
  return {
    headers,
    rows: dataRows.map(({ row, rowNumber }) => ({
      rowNumber,
      values: headers.reduce<Record<string, string>>((values, header, index) => {
        values[header] = row[index]?.trim() || '';
        return values;
      }, {}),
    })),
  };
}

function csvValue(row: PriceBookCsvRow, mapping: PriceBookCsvMapping, field: PriceBookCsvField) {
  const header = mapping[field];
  return header ? row.values[header]?.trim() || '' : '';
}

function parseDollarPrice(value: string) {
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned) return { value: null as number | null };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { value: null, error: 'Default price must be blank, zero, or a positive amount.' };
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? { value: Math.round(amount * 100) } : { value: null, error: 'Default price is invalid.' };
}

function parseCents(value: string) {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return { value: null as number | null };
  if (!/^\d+$/.test(cleaned)) return { value: null, error: 'Default price cents must be a non-negative whole number.' };
  const amount = Number(cleaned);
  return Number.isSafeInteger(amount) && amount <= 2147483647
    ? { value: amount }
    : { value: null, error: 'Default price cents is too large.' };
}

function parseOptionalNumber(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return { value: null as number | null };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { value: null, error: `${label} must be a non-negative number with at most two decimals.` };
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? { value: amount } : { value: null, error: `${label} is invalid.` };
}

function parseBoolean(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return { value: null as boolean | null };
  if (['true', 'yes', 'y', '1', 'active', 'enabled'].includes(normalized)) return { value: true };
  if (['false', 'no', 'n', '0', 'inactive', 'disabled', 'archived'].includes(normalized)) return { value: false };
  return { value: null, error: `${label} must be true/false, yes/no, y/n, or 1/0.` };
}

function parseLineType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return { value: null as EstimateLineType | null };
  if (normalized === 'labor' || normalized === 'material' || normalized === 'fee' || normalized === 'other') return { value: normalized as EstimateLineType };
  return { value: null, error: 'Line type must be labor, material, fee, or other.' };
}

export function buildPriceBookImportRows(rows: PriceBookCsvRow[], mapping: PriceBookCsvMapping): PriceBookLocalPreviewRow[] {
  const repeatedExternalIds = new Map<string, number>();
  rows.forEach(row => {
    const externalId = csvValue(row, mapping, 'external_item_id').toLowerCase();
    if (externalId) repeatedExternalIds.set(externalId, (repeatedExternalIds.get(externalId) || 0) + 1);
  });

  return rows.map(row => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const values: PriceBookNormalizedValues = {};
    const mappedFields: string[] = [];
    const externalItemId = csvValue(row, mapping, 'external_item_id') || null;
    const title = csvValue(row, mapping, 'title');

    if (!mapping.title) errors.push('Map the required Title column.');
    if (!title) errors.push('Title is required.');
    if (title.length > 200) errors.push('Title must be 200 characters or fewer.');
    values.title = title;
    mappedFields.push('title');

    const textFields: Array<Exclude<PriceBookCsvField, 'external_item_id' | 'title' | 'line_type' | 'default_unit_price' | 'default_unit_price_cents' | 'taxable' | 'labor_hours' | 'active'>> = [
      'customer_description', 'internal_notes', 'trade', 'category', 'subcategory', 'unit', 'sku',
    ];
    textFields.forEach(field => {
      if (!mapping[field]) return;
      const value = csvValue(row, mapping, field);
      if (!value) return;
      mappedFields.push(field);
      if (field === 'subcategory' || field === 'unit' || field === 'sku') values[field] = value;
      else values[field] = value;
    });

    const lineType = parseLineType(csvValue(row, mapping, 'line_type'));
    if (lineType.error) errors.push(lineType.error);
    if (mapping.line_type && lineType.value) {
      mappedFields.push('line_type');
      values.line_type = lineType.value;
    }

    if (mapping.default_unit_price || mapping.default_unit_price_cents) {
      const centsCell = csvValue(row, mapping, 'default_unit_price_cents');
      const parsedPrice = centsCell ? parseCents(centsCell) : parseDollarPrice(csvValue(row, mapping, 'default_unit_price'));
      if (parsedPrice.error) errors.push(parsedPrice.error);
      mappedFields.push('default_unit_price_cents');
      values.default_unit_price_cents = parsedPrice.value;
    }

    const taxable = parseBoolean(csvValue(row, mapping, 'taxable'), 'Taxable');
    if (taxable.error) errors.push(taxable.error);
    if (mapping.taxable && taxable.value !== null) {
      mappedFields.push('taxable');
      values.taxable = taxable.value;
    }

    const active = parseBoolean(csvValue(row, mapping, 'active'), 'Active');
    if (active.error) errors.push(active.error);
    if (mapping.active && active.value !== null) {
      mappedFields.push('active');
      values.active = active.value;
    }

    const laborHours = parseOptionalNumber(csvValue(row, mapping, 'labor_hours'), 'Labor hours');
    if (laborHours.error) errors.push(laborHours.error);
    if (mapping.labor_hours && laborHours.value !== null) {
      mappedFields.push('labor_hours');
      values.labor_hours = laborHours.value;
    }

    if (externalItemId && externalItemId.length > 200) errors.push('External item ID must be 200 characters or fewer.');
    if (externalItemId && (repeatedExternalIds.get(externalItemId.toLowerCase()) || 0) > 1) errors.push('External item ID is repeated in this file.');
    if (!externalItemId) warnings.push('No external item ID. Repeat imports can warn about duplicates but cannot update this row automatically.');

    return {
      rowNumber: row.rowNumber,
      externalItemId,
      values,
      errors,
      warnings,
      requestRow: {
        row_number: row.rowNumber,
        external_item_id: externalItemId,
        mapped_fields: Array.from(new Set(mappedFields)),
        values,
      },
    };
  });
}

export function sanitizePriceBookImportFilename(filename: string) {
  return filename.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'price-book.csv';
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
