import { Download } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ContractorPriceBookItem } from '../../types';
import {
  createPriceBookXlsxBlob,
  priceBookExportFilename,
  priceBookItemsForExport,
  serializePriceBookCsv,
  type PriceBookExportItem,
  type PriceBookExportFormat,
  type PriceBookExportScope,
} from './priceBookExport';

const inputClass = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButtonClass = 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function PriceBookExportPanel({
  loadedItems,
  loadAllItems,
}: {
  loadedItems: ContractorPriceBookItem[];
  loadAllItems: () => Promise<PriceBookExportItem[]>;
}) {
  const [format, setFormat] = useState<PriceBookExportFormat>('csv');
  const [scope, setScope] = useState<PriceBookExportScope>('all');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const exportLockRef = useRef(false);
  const visibleCount = useMemo(
    () => priceBookItemsForExport(loadedItems, scope).length,
    [loadedItems, scope],
  );

  const exportPriceBook = async () => {
    if (exportLockRef.current || exporting || loadedItems.length === 0) return;
    exportLockRef.current = true;
    setExporting(true);
    setError('');
    try {
      const completeCatalog = await loadAllItems();
      const selectedItems = priceBookItemsForExport(completeCatalog, scope);
      if (selectedItems.length === 0) {
        throw new Error(scope === 'active' ? 'This Price Book has no active items to export.' : 'This Price Book has no items to export.');
      }
      const filename = priceBookExportFilename(format);
      if (format === 'csv') {
        downloadBlob(new Blob([serializePriceBookCsv(selectedItems)], { type: 'text/csv;charset=utf-8' }), filename);
      } else {
        downloadBlob(await createPriceBookXlsxBlob(selectedItems), filename);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to export this Price Book. No file was downloaded.');
    } finally {
      exportLockRef.current = false;
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="price-book-export-panel">
      <div>
        <h3 className="text-sm font-bold text-slate-950">Export Price Book</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Download a portable selling Price Book. Private cost, margin, internal notes, account IDs, and import history are excluded.
        </p>
      </div>

      {loadedItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" data-testid="price-book-export-empty">
          Add a Price Book item before creating an export.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">Format</span>
              <select className={inputClass} value={format} disabled={exporting} onChange={event => setFormat(event.target.value as PriceBookExportFormat)}>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (.xlsx)</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">Items</span>
              <select className={inputClass} value={scope} disabled={exporting} onChange={event => setScope(event.target.value as PriceBookExportScope)}>
                <option value="all">All items</option>
                <option value="active">Active items only</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              {visibleCount.toLocaleString()} item{visibleCount === 1 ? '' : 's'} currently loaded for this selection. ServSync verifies the complete catalog before downloading.
            </p>
            <button type="button" className={primaryButtonClass} disabled={exporting} onClick={() => void exportPriceBook()}>
              <Download size={16} />
              {exporting ? 'Preparing export...' : 'Download export'}
            </button>
          </div>
        </>
      )}
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
    </div>
  );
}
