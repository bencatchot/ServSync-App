import { Archive, ChevronLeft, ChevronRight, Download, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  PriceBookCsvField,
  PriceBookCsvMapping,
  PriceBookCsvRow,
  PriceBookImportAction,
  PriceBookImportBatchResult,
  PriceBookImportBatchSummary,
  PriceBookImportRollbackPreview,
  PriceBookImportRollbackResult,
  PriceBookImportPreview,
  PriceBookImportRequestRow,
  PriceBookImportSource,
  PriceBookNormalizedValues,
} from './priceBookCsvReconciliation';
import {
  PRICE_BOOK_CSV_FIELDS,
  PRICE_BOOK_CSV_MAX_BYTES,
  PRICE_BOOK_SAMPLE_CSV,
  autoMapPriceBookCsvHeaders,
  buildPriceBookImportRows,
  parsePriceBookCsv,
  priceBookCsvRowsFromParsed,
  sanitizePriceBookImportFilename,
  sha256Hex,
} from './priceBookCsvReconciliation';
import {
  PRICE_BOOK_XLSX_MAX_BYTES,
  parsePriceBookXlsxWorkbook,
  type PriceBookXlsxWorksheet,
} from './priceBookXlsxImport';

const inputClass = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500';
const primaryButtonClass = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const PREVIEW_PAGE_SIZE = 25;

const REVIEW_FIELDS: Array<{ key: keyof PriceBookNormalizedValues; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'customer_description', label: 'Customer description' },
  { key: 'internal_notes', label: 'Internal notes' },
  { key: 'trade', label: 'Trade' },
  { key: 'category', label: 'Category' },
  { key: 'subcategory', label: 'Subcategory' },
  { key: 'line_type', label: 'Line type' },
  { key: 'unit', label: 'Unit' },
  { key: 'default_unit_price_cents', label: 'Price' },
  { key: 'taxable', label: 'Taxable' },
  { key: 'labor_hours', label: 'Labor hours' },
  { key: 'sku', label: 'SKU / code' },
  { key: 'active', label: 'Active' },
];

type PriceBookImportApi = {
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
  listBatches: () => Promise<PriceBookImportBatchSummary[]>;
  previewRollback: (batchId: string) => Promise<PriceBookImportRollbackPreview>;
  executeRollback: (batchId: string, idempotencyKey: string) => Promise<PriceBookImportRollbackResult>;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function valueLabel(field: keyof PriceBookNormalizedValues, value: unknown) {
  if (field === 'default_unit_price_cents') {
    if (value === null || value === undefined) return 'Price Required';
    return `$${(Number(value) / 100).toFixed(2)}`;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'Blank';
  return String(value);
}

function actionLabel(action: PriceBookImportAction) {
  if (action === 'add') return 'Add new item';
  if (action === 'update') return 'Update matched item';
  return 'Skip row';
}

function matchLabel(matchType: PriceBookImportPreview['rows'][number]['match_type']) {
  if (matchType === 'external_id') return 'Stable external ID match';
  if (matchType === 'sku_suggestion') return 'Possible SKU match';
  if (matchType === 'exact_duplicate') return 'Possible duplicate';
  if (matchType === 'ambiguous') return 'Ambiguous';
  return 'New item';
}

function reconciliationStatusLabel(status: PriceBookImportPreview['rows'][number]['reconciliation_status']) {
  if (status === 'new') return 'New';
  if (status === 'unchanged') return 'Unchanged';
  if (status === 'changed') return 'Changed';
  if (status === 'ambiguous') return 'Ambiguous';
  return 'Invalid';
}

export function PriceBookCsvReconciliationPanel({
  api,
  onCompleted,
  onRollbackCompleted,
}: {
  api: PriceBookImportApi;
  onCompleted: (result: PriceBookImportBatchResult) => Promise<void>;
  onRollbackCompleted: (result: PriceBookImportRollbackResult) => Promise<void>;
}) {
  const [sources, setSources] = useState<PriceBookImportSource[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [loadingSources, setLoadingSources] = useState(true);
  const [creatingSource, setCreatingSource] = useState(false);
  const [filename, setFilename] = useState('');
  const [fileKind, setFileKind] = useState<'csv' | 'xlsx' | ''>('');
  const [fileHash, setFileHash] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [worksheets, setWorksheets] = useState<PriceBookXlsxWorksheet[]>([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<PriceBookCsvRow[]>([]);
  const [mapping, setMapping] = useState<PriceBookCsvMapping>({});
  const [preview, setPreview] = useState<PriceBookImportPreview | null>(null);
  const [actions, setActions] = useState<Record<string, PriceBookImportAction>>({});
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [history, setHistory] = useState<PriceBookImportBatchSummary[]>([]);
  const [rollbackPreview, setRollbackPreview] = useState<PriceBookImportRollbackPreview | null>(null);
  const [previewingRollbackId, setPreviewingRollbackId] = useState<string | null>(null);
  const [executingRollback, setExecutingRollback] = useState(false);
  const [rollbackIdempotencyKey, setRollbackIdempotencyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const executeLockRef = useRef(false);
  const rollbackLockRef = useRef(false);

  const localRows = useMemo(() => buildPriceBookImportRows(rows, mapping), [rows, mapping]);
  const blockedLocalRows = localRows.filter(row => row.errors.length > 0);
  const requestRows = localRows.map(row => row.requestRow);
  const pageCount = preview ? Math.max(1, Math.ceil(preview.rows.length / PREVIEW_PAGE_SIZE)) : 1;
  const previewRows = preview?.rows.slice((previewPage - 1) * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE) || [];

  const loadPrivateLists = async () => {
    setLoadingSources(true);
    try {
      const [nextSources, nextHistory] = await Promise.all([api.listSources(), api.listBatches()]);
      setSources(nextSources);
      setHistory(nextHistory);
      setSourceId(current => current || nextSources[0]?.id || '');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load private import sources.');
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    void loadPrivateLists();
    // API callbacks are stable for the mounted Price Book workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearPreview = () => {
    setPreview(null);
    setActions({});
    setIdempotencyKey('');
    setPreviewPage(1);
    setNotice('');
  };

  const clearFile = () => {
    setFilename('');
    setFileKind('');
    setFileHash('');
    setFileSize(0);
    setWorksheets([]);
    setSelectedWorksheet('');
    setHeaders([]);
    setRows([]);
    setMapping({});
    clearPreview();
    setError('');
  };

  const applyTabularRows = (nextHeaders: string[], nextRows: PriceBookCsvRow[]) => {
    setHeaders(nextHeaders);
    setRows(nextRows);
    setMapping(autoMapPriceBookCsvHeaders(nextHeaders));
    clearPreview();
  };

  const selectWorksheet = (name: string) => {
    setSelectedWorksheet(name);
    const worksheet = worksheets.find(candidate => candidate.name === name && !candidate.hidden && !candidate.error);
    if (worksheet) applyTabularRows(worksheet.headers, worksheet.rows);
    else {
      setHeaders([]);
      setRows([]);
      setMapping({});
      clearPreview();
    }
  };

  const previewRollback = async (batchId: string) => {
    if (previewingRollbackId || executingRollback) return;
    setPreviewingRollbackId(batchId);
    setRollbackPreview(null);
    setRollbackIdempotencyKey('');
    setError('');
    setNotice('');
    try {
      const nextPreview = await api.previewRollback(batchId);
      setRollbackPreview(nextPreview);
      setRollbackIdempotencyKey(crypto.randomUUID());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to preview this import rollback.');
    } finally {
      setPreviewingRollbackId(null);
    }
  };

  const executeRollback = async () => {
    if (!rollbackPreview?.can_rollback || !rollbackIdempotencyKey || rollbackLockRef.current) return;
    if (!window.confirm('Roll back this completed import? Updated fields will be restored and items added by the import will be archived.')) return;
    rollbackLockRef.current = true;
    setExecutingRollback(true);
    setError('');
    setNotice('');
    try {
      const result = await api.executeRollback(rollbackPreview.batch_id, rollbackIdempotencyKey);
      setNotice(`Rollback complete: ${result.restore_count} restored, ${result.archive_count} archived, ${result.unchanged_count} unchanged.`);
      setRollbackPreview(null);
      setRollbackIdempotencyKey('');
      await onRollbackCompleted(result);
      await loadPrivateLists();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to roll back this import. Preview it again before retrying.');
    } finally {
      rollbackLockRef.current = false;
      setExecutingRollback(false);
    }
  };

  const createSource = async () => {
    const displayName = newSourceName.trim();
    if (!displayName || creatingSource) return;
    setCreatingSource(true);
    setError('');
    try {
      const source = await api.createSource(displayName);
      setSources(current => [...current, source].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setSourceId(source.id);
      setNewSourceName('');
      clearPreview();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create this import source.');
    } finally {
      setCreatingSource(false);
    }
  };

  const loadFile = async (file: File | null) => {
    clearFile();
    if (!file) return;
    const normalizedName = file.name.toLowerCase();
    const nextFileKind = normalizedName.endsWith('.csv') ? 'csv' : normalizedName.endsWith('.xlsx') ? 'xlsx' : '';
    if (!nextFileKind) {
      setError('Upload a supported .csv or .xlsx file. Legacy .xls, macro-enabled, and other spreadsheet formats are not supported.');
      return;
    }
    const maximumBytes = nextFileKind === 'csv' ? PRICE_BOOK_CSV_MAX_BYTES : PRICE_BOOK_XLSX_MAX_BYTES;
    if (file.size > maximumBytes) {
      setError(`${nextFileKind.toUpperCase()} files can be up to 1 MB.`);
      return;
    }
    try {
      setFilename(sanitizePriceBookImportFilename(file.name));
      setFileKind(nextFileKind);
      setFileSize(file.size);
      if (nextFileKind === 'csv') {
        const text = await file.text();
        const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv(text));
        setFileHash(await sha256Hex(text));
        applyTabularRows(parsed.headers, parsed.rows);
        return;
      }
      const bytes = await file.arrayBuffer();
      const parsedWorksheets = await parsePriceBookXlsxWorkbook(bytes);
      const selectableWorksheets = parsedWorksheets.filter(worksheet => !worksheet.hidden && !worksheet.error);
      if (selectableWorksheets.length === 0) {
        const firstVisibleError = parsedWorksheets.find(worksheet => !worksheet.hidden)?.error;
        throw new Error(firstVisibleError || 'This XLSX workbook has no visible worksheet containing a usable table.');
      }
      setFileHash(await sha256Hex(bytes));
      setWorksheets(parsedWorksheets);
      if (selectableWorksheets.length === 1) {
        setSelectedWorksheet(selectableWorksheets[0].name);
        applyTabularRows(selectableWorksheets[0].headers, selectableWorksheets[0].rows);
      }
    } catch (nextError) {
      setFilename('');
      setFileKind('');
      setFileHash('');
      setFileSize(0);
      setWorksheets([]);
      setSelectedWorksheet('');
      setError(nextError instanceof Error ? nextError.message : `Unable to parse this ${nextFileKind.toUpperCase()} file.`);
    }
  };

  const updateMapping = (field: PriceBookCsvField, header: string) => {
    setMapping(current => {
      const next = { ...current };
      if (header) next[field] = header;
      else delete next[field];
      return next;
    });
    clearPreview();
  };

  const previewImport = async () => {
    if (!sourceId || rows.length === 0 || blockedLocalRows.length > 0 || previewing) return;
    setPreviewing(true);
    setError('');
    setNotice('');
    try {
      const nextPreview = await api.preview(sourceId, requestRows);
      setPreview(nextPreview);
      setActions(Object.fromEntries(nextPreview.rows.map(row => [String(row.row_number), row.recommended_action])));
      setIdempotencyKey(crypto.randomUUID());
      setPreviewPage(1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to reconcile this CSV.');
    } finally {
      setPreviewing(false);
    }
  };

  const executeImport = async () => {
    if (!preview || !idempotencyKey || executing || executeLockRef.current) return;
    const counts = Object.values(actions).reduce<Record<PriceBookImportAction, number>>((next, action) => {
      next[action] += 1;
      return next;
    }, { add: 0, update: 0, skip: 0 });
    if (!window.confirm(`Apply this import as one transaction? Add ${counts.add}, update ${counts.update}, skip ${counts.skip}.`)) return;
    executeLockRef.current = true;
    setExecuting(true);
    setError('');
    setNotice('');
    try {
      const result = await api.execute({ sourceId, rows: requestRows, actions, idempotencyKey, filename, fileSha256: fileHash, fileSizeBytes: fileSize, mapping });
      setNotice(`Import complete: ${result.add_count} added, ${result.update_count} updated, ${result.skip_count} skipped.`);
      await onCompleted(result);
      const nextHistory = await api.listBatches();
      setHistory(nextHistory);
      setFilename('');
      setFileKind('');
      setFileHash('');
      setFileSize(0);
      setWorksheets([]);
      setSelectedWorksheet('');
      setHeaders([]);
      setRows([]);
      setMapping({});
      setPreview(null);
      setActions({});
      setIdempotencyKey('');
      setPreviewPage(1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The import result could not be confirmed. Retry this preview; ServSync will reuse the same idempotency key.');
    } finally {
      executeLockRef.current = false;
      setExecuting(false);
    }
  };

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([PRICE_BOOK_SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'servsync-price-book-repeat-import-sample.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="space-y-4" data-testid="price-book-reconciliation-import">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="text-sm font-bold text-slate-950">Repeat-import reconciliation</h3>
        <p className="mt-1 text-xs leading-5 text-emerald-950">
          Select a stable source for this catalog. ServSync matches external IDs within that source, preserves unmapped fields and conflicting manual edits, and applies confirmed actions as one transaction. Uploaded CSV and XLSX files are not retained.
        </p>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</div> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="price-book-import-source-heading">
        <h4 id="price-book-import-source-heading" className="text-sm font-bold text-slate-950">1. Select catalog source</h4>
        <p className="mt-1 text-xs leading-5 text-slate-500">Reuse the same source for repeat files. Renaming a file does not create a new catalog identity.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Existing source">
            <select className={inputClass} value={sourceId} disabled={loadingSources || previewing || executing} onChange={event => { setSourceId(event.target.value); clearPreview(); }}>
              <option value="">Select a source</option>
              {sources.map(source => <option key={source.id} value={source.id}>{source.display_name}</option>)}
            </select>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Create source</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={inputClass} value={newSourceName} maxLength={120} disabled={creatingSource || executing} onChange={event => setNewSourceName(event.target.value)} placeholder="2026 master catalog" />
              <button type="button" className={secondaryButtonClass} disabled={!newSourceName.trim() || creatingSource || executing} onClick={() => void createSource()}>{creatingSource ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="price-book-import-file-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 id="price-book-import-file-heading" className="text-sm font-bold text-slate-950">2. Upload and map CSV or XLSX</h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">Up to 1 MB and 500 item rows. XLSX uses one visible worksheet and cached values only. Blank prices remain Price Required; explicit zero remains $0.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={downloadSample}><Download size={16} />Sample CSV</button>
            <label className={`${primaryButtonClass} cursor-pointer`}><Upload size={16} />Choose CSV or XLSX<input key={filename || 'empty-file'} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={executing} onChange={event => void loadFile(event.target.files?.[0] || null)} /></label>
          </div>
        </div>

        {fileKind === 'xlsx' && worksheets.length > 0 ? (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3" data-testid="price-book-xlsx-worksheet-selection">
            <Field label="Worksheet">
              <select className={inputClass} value={selectedWorksheet} disabled={previewing || executing} onChange={event => selectWorksheet(event.target.value)}>
                <option value="">Select a worksheet</option>
                {worksheets.filter(worksheet => !worksheet.hidden).map(worksheet => (
                  <option key={worksheet.name} value={worksheet.name} disabled={Boolean(worksheet.error)}>
                    {worksheet.name}{worksheet.error ? ` (unavailable: ${worksheet.error})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {selectedWorksheet
                ? `Using ${selectedWorksheet}. Changing worksheets clears mapping and reconciliation preview state.`
                : 'Choose the one worksheet to map. No rows are sent for reconciliation until a worksheet is selected.'}
              {worksheets.some(worksheet => worksheet.hidden) ? ` ${worksheets.filter(worksheet => worksheet.hidden).length} hidden worksheet${worksheets.filter(worksheet => worksheet.hidden).length === 1 ? ' was' : 's were'} ignored.` : ''}
            </p>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-bold text-slate-950">{filename}</p><p className="text-xs text-slate-500">{rows.length} rows; {blockedLocalRows.length} blocked before server preview.</p></div>
              <button type="button" className={secondaryButtonClass} disabled={executing} onClick={clearFile}>Clear file</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PRICE_BOOK_CSV_FIELDS.map(field => (
                <Field key={field.key} label={`${field.label}${field.required ? ' *' : ''}`}>
                  <select className={inputClass} value={mapping[field.key] || ''} disabled={previewing || executing} onChange={event => updateMapping(field.key, event.target.value)}>
                    <option value="">Do not import</option>
                    {headers.map(header => <option key={`${field.key}-${header}`} value={header}>{header}</option>)}
                  </select>
                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{field.helper}</span>
                </Field>
              ))}
            </div>
            {blockedLocalRows.length > 0 ? (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Resolve {blockedLocalRows.length} blocked row{blockedLocalRows.length === 1 ? '' : 's'} before server preview. {blockedLocalRows.slice(0, 3).map(row => `Row ${row.rowNumber}: ${row.errors.join(' ')}`).join(' ')}
              </div>
            ) : null}
            <button type="button" className={primaryButtonClass} disabled={!sourceId || !mapping.title || blockedLocalRows.length > 0 || previewing || executing} onClick={() => void previewImport()}>
              {previewing ? 'Reconciling...' : 'Preview reconciliation'}
            </button>
          </div>
        ) : null}
      </section>

      {preview ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="price-book-import-review-heading">
          <h4 id="price-book-import-review-heading" className="text-sm font-bold text-slate-950">3. Review Add, Update, and Skip</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">Updates are available only for an exact mapping or a single confirmed suggestion. Conflicting manual edits remain unchanged.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Reconciliation counts">
            {(['add', 'update', 'skip', 'error'] as const).map(key => <div key={key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{key}</p><p className="mt-1 text-lg font-bold text-slate-950">{preview.counts[key]}</p></div>)}
          </div>
          <div className="mt-4 space-y-3">
            {previewRows.map(row => (
              <article key={row.row_number} className="rounded-xl border border-slate-200 p-3" data-testid="price-book-import-review-row">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><p className="text-xs font-bold uppercase text-slate-500">Row {row.row_number} · {reconciliationStatusLabel(row.reconciliation_status)} · {matchLabel(row.match_type)}</p><h5 className="mt-1 truncate font-bold text-slate-950">{valueLabel('title', row.incoming_values.title)}</h5><p className="mt-1 text-xs font-semibold text-slate-600">{valueLabel('default_unit_price_cents', row.incoming_values.default_unit_price_cents)}</p></div>
                  <label className="text-xs font-bold text-slate-700">Action<select className={`${inputClass} mt-1`} value={actions[String(row.row_number)]} disabled={executing} onChange={event => setActions(current => ({ ...current, [String(row.row_number)]: event.target.value as PriceBookImportAction }))}>{row.allowed_actions.map(action => <option key={action} value={action}>{actionLabel(action)}</option>)}</select></label>
                </div>
                {row.errors.length > 0 ? <div className="mt-2 text-xs text-red-700">{row.errors.join(' ')}</div> : null}
                {row.warnings.length > 0 ? <div className="mt-2 text-xs text-amber-700">{row.warnings.join(' ')}</div> : null}
                <details className="mt-3 rounded-lg bg-slate-50">
                  <summary className="min-h-[44px] cursor-pointer px-3 py-3 text-sm font-bold text-slate-700">Compare mapped fields</summary>
                  <div className="space-y-2 border-t border-slate-200 p-3 text-xs">
                    {REVIEW_FIELDS.filter(field => row.mapped_fields.includes(field.key)).map(field => (
                      <div key={field.key} className="grid gap-1 rounded-lg bg-white p-2 sm:grid-cols-[120px_1fr_1fr_1fr]">
                        <span className="font-bold text-slate-700">{field.label}</span>
                        <span><span className="font-semibold text-slate-500">Current:</span> {valueLabel(field.key, row.current_values?.[field.key])}</span>
                        <span><span className="font-semibold text-slate-500">Incoming:</span> {valueLabel(field.key, row.incoming_values[field.key])}</span>
                        <span><span className="font-semibold text-slate-500">Result:</span> {valueLabel(field.key, row.result_values[field.key])}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>
          {pageCount > 1 ? <nav className="mt-3 flex items-center justify-between gap-3" aria-label="Import preview pages"><button type="button" className={secondaryButtonClass} disabled={previewPage === 1 || executing} onClick={() => setPreviewPage(value => value - 1)}><ChevronLeft size={16} />Previous</button><span className="text-sm font-semibold text-slate-600">Page {previewPage} of {pageCount}</span><button type="button" className={secondaryButtonClass} disabled={previewPage === pageCount || executing} onClick={() => setPreviewPage(value => value + 1)}>Next<ChevronRight size={16} /></button></nav> : null}
          <div className="mt-4 flex justify-end"><button type="button" className={primaryButtonClass} disabled={executing} onClick={() => void executeImport()}>{executing ? 'Applying transaction...' : 'Confirm and apply import'}</button></div>
        </section>
      ) : null}

      {history.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="min-h-[48px] cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">Recent import history</summary>
          <div className="space-y-2 border-t border-slate-200 p-4">
            {history.map(batch => (
              <div key={batch.id} className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950">{batch.source_name} · {batch.original_filename || 'File import'}</p>
                  <p className="mt-1">{batch.add_count} added · {batch.update_count} updated · {batch.skip_count} skipped · {new Date(batch.completed_at).toLocaleString()}</p>
                  {batch.rollback ? <p className="mt-1 font-semibold text-emerald-700">Rolled back {new Date(batch.rollback.completed_at).toLocaleString()}</p> : null}
                </div>
                {batch.rollback ? null : (
                  <button type="button" className={secondaryButtonClass} disabled={Boolean(previewingRollbackId) || executingRollback} onClick={() => void previewRollback(batch.id)}>
                    <RotateCcw size={16} />{previewingRollbackId === batch.id ? 'Checking...' : 'Preview rollback'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {rollbackPreview ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-labelledby="price-book-rollback-heading" data-testid="price-book-rollback-preview">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 id="price-book-rollback-heading" className="text-sm font-bold text-slate-950">Review import rollback</h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">Only unchanged imported fields can be restored. Added items are archived and retained in history.</p>
            </div>
            <button type="button" className={secondaryButtonClass} disabled={executingRollback} onClick={() => setRollbackPreview(null)}>Close</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Rollback counts">
            {(['restore', 'archive', 'unchanged', 'conflict'] as const).map(key => <div key={key} className="rounded-lg bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">{key}</p><p className="mt-1 text-lg font-bold text-slate-950">{rollbackPreview.counts[key]}</p></div>)}
          </div>
          <div className="mt-3 space-y-2">
            {rollbackPreview.rows.map(row => (
              <div key={row.original_batch_row_id} className="rounded-lg border border-amber-200 bg-white p-3 text-xs" data-testid="price-book-rollback-row">
                <div className="flex items-start gap-2">
                  {row.rollback_action === 'archive_item' ? <Archive size={15} className="mt-0.5 text-amber-700" /> : <RotateCcw size={15} className="mt-0.5 text-slate-500" />}
                  <div><p className="font-bold text-slate-950">Row {row.row_number} · {row.title}</p><p className="mt-1 text-slate-600">{row.rollback_action === 'restore_fields' ? `Restore ${row.restore_fields.join(', ')}` : row.rollback_action === 'archive_item' ? 'Archive imported item' : 'No Price Book change'}</p></div>
                </div>
                {row.errors.length > 0 ? <p className="mt-2 font-semibold text-red-700">{row.errors.join(' ')}</p> : null}
              </div>
            ))}
          </div>
          {rollbackPreview.can_rollback ? (
            <div className="mt-4 flex justify-end"><button type="button" className={primaryButtonClass} disabled={executingRollback} onClick={() => void executeRollback()}><RotateCcw size={16} />{executingRollback ? 'Rolling back...' : 'Confirm rollback'}</button></div>
          ) : (
            <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">This batch cannot be rolled back until the listed conflicts are resolved through normal Price Book management.</div>
          )}
        </section>
      ) : null}
    </div>
  );
}
