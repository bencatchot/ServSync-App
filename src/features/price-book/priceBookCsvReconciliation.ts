import type { EstimateLineType } from '../../types';

export const PRICE_BOOK_CSV_MAX_BYTES = 1024 * 1024;
export const PRICE_BOOK_CSV_MAX_ROWS = 500;
export const PRICE_BOOK_IMPORT_MAX_ROWS = PRICE_BOOK_CSV_MAX_ROWS;

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

export type PriceBookImportMappingConfidence = 'automatic' | 'review' | 'manual';

export type PriceBookImportMappingInsight = {
  field: PriceBookCsvField;
  header: string;
  confidence: PriceBookImportMappingConfidence;
  reason: string;
  detectedValues: string[];
  interpretations: string[];
};

export type PriceBookImportInterpretation = {
  mapping: PriceBookCsvMapping;
  insights: Partial<Record<PriceBookCsvField, PriceBookImportMappingInsight>>;
  ignoredHeaders: string[];
};

export type PriceBookTabularRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type PriceBookCsvRow = PriceBookTabularRow;

export type PriceBookImportAction = 'add' | 'update' | 'skip';
export type PriceBookImportMatchType = 'none' | 'external_id' | 'sku_suggestion' | 'exact_duplicate' | 'ambiguous';
export type PriceBookImportReconciliationStatus = 'new' | 'unchanged' | 'changed' | 'ambiguous' | 'invalid';

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
  reconciliation_status: PriceBookImportReconciliationStatus;
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
  rollback: null | {
    id: string;
    completed_at: string;
    restore_count: number;
    archive_count: number;
    unchanged_count: number;
  };
};

export type PriceBookImportRollbackPreviewRow = {
  original_batch_row_id: string;
  row_number: number;
  target_price_book_item_id: string | null;
  title: string;
  original_action: PriceBookImportAction;
  rollback_action: 'restore_fields' | 'archive_item' | 'no_change';
  restore_fields: string[];
  conflict_fields: string[];
  errors: string[];
  outcome: 'restored' | 'archived' | 'unchanged';
};

export type PriceBookImportRollbackPreview = {
  batch_id: string;
  source_id: string;
  original_filename: string;
  completed_at: string;
  already_rolled_back: boolean;
  rollback_id: string | null;
  rolled_back_at: string | null;
  can_rollback: boolean;
  counts: { restore: number; archive: number; unchanged: number; conflict: number };
  rows: PriceBookImportRollbackPreviewRow[];
};

export type PriceBookImportRollbackResult = {
  rollback_id: string;
  batch_id: string;
  status: 'completed';
  restore_count: number;
  archive_count: number;
  unchanged_count: number;
  idempotent: boolean;
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
  external_item_id: ['externalid', 'externalitemid', 'recordid', 'sourceid', 'sourceitemid', 'itemid', 'productid', 'serviceid'],
  title: ['title', 'item', 'itemname', 'name', 'service', 'servicename', 'product', 'productname', 'descriptionname'],
  customer_description: ['customerdescription', 'description', 'desc', 'customerdesc', 'servicedescription', 'itemdescription', 'productdescription', 'details'],
  internal_notes: ['internalnotes', 'internal_notes', 'notes', 'note', 'private_notes', 'privatenotes', 'internalnote'],
  trade: ['trade', 'tradetype', 'discipline', 'servicebusiness', 'servicetrade'],
  category: ['category', 'group', 'section', 'workcategory', 'itemcategory', 'servicecategory', 'productcategory'],
  subcategory: ['subcategory', 'sub_category', 'subgroup', 'subsection', 'worksubcategory', 'itemsubcategory', 'servicesubcategory', 'productsubcategory'],
  line_type: ['linetype', 'type', 'itemtype', 'servicetype', 'producttype', 'pricetype'],
  unit: ['unit', 'uom', 'measure', 'unitofmeasure', 'billingunit', 'priceunit'],
  default_unit_price: ['price', 'rate', 'amount', 'defaultprice', 'defaultunitprice', 'unitprice', 'sellprice', 'sellingprice', 'retail', 'retailprice', 'customerprice', 'flatrate', 'flatrateprice'],
  default_unit_price_cents: ['defaultunitpricecents', 'pricecents', 'amountcents', 'unitpricecents'],
  taxable: ['taxable', 'tax', 'istaxable', 'taxstatus'],
  labor_hours: ['laborhours', 'laborhrs', 'hours', 'hrs', 'estimatedhours', 'estimatedlabor', 'estimatedlaborhours', 'labortime', 'estimatedlabortime'],
  sku: ['sku', 'code', 'itemcode', 'servicecode', 'productcode', 'partnumber', 'catalogcode'],
  active: ['active', 'enabled', 'status'],
};

const REVIEW_HEADER_ALIASES: Partial<Record<PriceBookCsvField, string[]>> = {
  title: ['descriptionname'],
  line_type: ['type'],
  default_unit_price: ['amount', 'rate'],
  active: ['status'],
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

function representativeValues(rows: PriceBookTabularRow[], header: string) {
  return Array.from(new Set(rows.map(row => row.values[header]?.trim()).filter((value): value is string => Boolean(value)))).slice(0, 4);
}

function allNonBlankValues(rows: PriceBookTabularRow[], header: string) {
  return rows.map(row => row.values[header]?.trim()).filter((value): value is string => Boolean(value));
}

function interpretationLabel(field: PriceBookCsvField, rawValue: string) {
  if (field === 'line_type') {
    const parsed = parseLineType(rawValue);
    return parsed.value && parsed.value !== rawValue.trim().toLowerCase() ? `${rawValue} -> ${parsed.value}` : '';
  }
  if (field === 'active' || field === 'taxable') {
    const parsed = parseBoolean(rawValue, field === 'active' ? 'Active' : 'Taxable');
    if (parsed.value === null || parsed.error) return '';
    const canonical = parsed.value ? 'true' : 'false';
    return rawValue.trim().toLowerCase() !== canonical ? `${rawValue} -> ${canonical}` : '';
  }
  if (field === 'default_unit_price') {
    const parsed = parseDollarPrice(rawValue);
    if (parsed.error || parsed.value === null) return '';
    const canonical = `$${(parsed.value / 100).toFixed(2)}`;
    return rawValue.trim() !== canonical ? `${rawValue} -> ${canonical}` : '';
  }
  return '';
}

export function interpretPriceBookImport(headers: string[], rows: PriceBookTabularRow[]): PriceBookImportInterpretation {
  const mapping = autoMapPriceBookCsvHeaders(headers);
  const normalizedHeaders = new Map(headers.map(header => [header, normalizePriceBookCsvHeader(header)]));

  const statusHeader = mapping.active;
  if (statusHeader && normalizedHeaders.get(statusHeader) === 'status') {
    const values = allNonBlankValues(rows, statusHeader);
    if (values.length > 0 && values.every(value => Boolean(parseBoolean(value, 'Active').error))) delete mapping.active;
  }
  const typeHeader = mapping.line_type;
  if (typeHeader && REVIEW_HEADER_ALIASES.line_type?.includes(normalizedHeaders.get(typeHeader) || '')) {
    const values = allNonBlankValues(rows, typeHeader);
    if (values.length > 0 && values.every(value => Boolean(parseLineType(value).error))) delete mapping.line_type;
  }

  // A source SKU is stable within the selected catalog source and can safely provide repeat-import identity.
  if (!mapping.external_item_id && mapping.sku) mapping.external_item_id = mapping.sku;

  const insights = PRICE_BOOK_CSV_FIELDS.reduce<PriceBookImportInterpretation['insights']>((next, field) => {
    const header = mapping[field.key];
    if (!header) return next;
    const normalizedHeader = normalizedHeaders.get(header) || '';
    const detectedValues = representativeValues(rows, header);
    const interpretations = detectedValues.map(value => interpretationLabel(field.key, value)).filter(Boolean);
    const usesSkuAsIdentity = field.key === 'external_item_id' && header === mapping.sku && !PRICE_BOOK_CSV_FIELD_ALIASES.external_item_id.includes(normalizedHeader);
    const reviewAlias = REVIEW_HEADER_ALIASES[field.key]?.includes(normalizedHeader) || false;
    const confidence: PriceBookImportMappingConfidence = usesSkuAsIdentity || reviewAlias || interpretations.length > 0 ? 'review' : 'automatic';
    next[field.key] = {
      field: field.key,
      header,
      confidence,
      reason: usesSkuAsIdentity
        ? 'SKU/code will also provide stable repeat-import identity within this catalog source.'
        : interpretations.length > 0
          ? 'ServSync recognized this column and will normalize the listed source values.'
          : reviewAlias
            ? 'ServSync inferred this mapping from a general source heading. Review before import.'
            : 'ServSync recognized this source heading.',
      detectedValues,
      interpretations,
    };
    return next;
  }, {});

  const usedHeaders = new Set(Object.values(mapping));
  return { mapping, insights, ignoredHeaders: headers.filter(header => !usedHeaders.has(header)) };
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

export function priceBookTabularRowsFromParsed(
  parsedRows: string[][],
  formatLabel: 'CSV' | 'XLSX',
): { headers: string[]; rows: PriceBookTabularRow[] } {
  const firstNonBlankRowIndex = parsedRows.findIndex(row => row.some(cell => cell.trim()));
  if (firstNonBlankRowIndex < 0) throw new Error(`This ${formatLabel} worksheet appears to be empty.`);
  const headers = parsedRows[firstNonBlankRowIndex].map((header, index) => header.trim() || `Column ${index + 1}`);
  const normalizedHeaders = headers.map(normalizePriceBookCsvHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error(`${formatLabel} headers must be unique so every mapped field is deterministic.`);
  }
  const dataRows = parsedRows.slice(firstNonBlankRowIndex + 1)
    .map((row, index) => ({ row, rowNumber: firstNonBlankRowIndex + index + 2 }))
    .filter(({ row }) => row.some(cell => cell.trim()));
  if (dataRows.length === 0) throw new Error(`This ${formatLabel} worksheet has headers but no item rows.`);
  if (dataRows.length > PRICE_BOOK_IMPORT_MAX_ROWS) throw new Error(`${formatLabel} imports are limited to ${PRICE_BOOK_IMPORT_MAX_ROWS} item rows.`);
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

export function priceBookCsvRowsFromParsed(parsedRows: string[][]) {
  return priceBookTabularRowsFromParsed(parsedRows, 'CSV');
}

function csvValue(row: PriceBookCsvRow, mapping: PriceBookCsvMapping, field: PriceBookCsvField) {
  const header = mapping[field];
  return header ? row.values[header]?.trim() || '' : '';
}

function parseDollarPrice(value: string) {
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned) return { value: null as number | null };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { value: null, error: 'Default price must be blank, zero, or a positive amount.' };
  const [whole, fractional = ''] = cleaned.split('.');
  const cents = (BigInt(whole) * 100n) + BigInt(fractional.padEnd(2, '0'));
  return cents <= 2147483647n ? { value: Number(cents) } : { value: null, error: 'Default price is too large.' };
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
  const trimmed = value.replace(/,/g, '').trim();
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
  if (['labor', 'labour'].includes(normalized)) return { value: 'labor' as EstimateLineType };
  if (['material', 'materials', 'part', 'parts', 'equipment', 'product'].includes(normalized)) return { value: 'material' as EstimateLineType };
  if (['fee', 'charge', 'trip charge', 'trip fee'].includes(normalized)) return { value: 'fee' as EstimateLineType };
  if (['other', 'service', 'service item', 'repair', 'diagnostic', 'misc', 'miscellaneous'].includes(normalized)) return { value: 'other' as EstimateLineType };
  return { value: null, error: 'Line type is not recognized. Use labor, material, fee, other, or a common equivalent such as service, part, or charge.' };
}

export function buildPriceBookImportRows(rows: PriceBookCsvRow[], mapping: PriceBookCsvMapping): PriceBookLocalPreviewRow[] {
  const repeatedExternalIds = new Map<string, number>();
  rows.forEach(row => {
    const externalId = csvValue(row, mapping, 'external_item_id').toLowerCase();
    if (externalId) repeatedExternalIds.set(externalId, (repeatedExternalIds.get(externalId) || 0) + 1);
  });

  const normalizedRows = rows.map(row => {
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

  const repeatedUnidentifiedRows = new Map<string, number>();
  normalizedRows.forEach(row => {
    if (row.externalItemId) return;
    const signature = JSON.stringify({
      mappedFields: [...row.requestRow.mapped_fields].sort(),
      values: row.requestRow.values,
    });
    repeatedUnidentifiedRows.set(signature, (repeatedUnidentifiedRows.get(signature) || 0) + 1);
  });

  return normalizedRows.map(row => {
    if (row.externalItemId) return row;
    const signature = JSON.stringify({
      mappedFields: [...row.requestRow.mapped_fields].sort(),
      values: row.requestRow.values,
    });
    if ((repeatedUnidentifiedRows.get(signature) || 0) < 2) return row;
    return {
      ...row,
      errors: [...row.errors, 'This exact row is repeated without an external item ID.'],
    };
  });
}

export function sanitizePriceBookImportFilename(filename: string) {
  return filename.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'price-book.csv';
}

export async function sha256Hex(value: string | ArrayBuffer) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
