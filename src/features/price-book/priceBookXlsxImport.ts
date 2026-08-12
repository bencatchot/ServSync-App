import { strFromU8, unzipSync } from 'fflate';
import type { PriceBookTabularRow } from './priceBookCsvReconciliation';
import { priceBookTabularRowsFromParsed } from './priceBookCsvReconciliation';

export const PRICE_BOOK_XLSX_MAX_BYTES = 1024 * 1024;
export const PRICE_BOOK_XLSX_MAX_COLUMNS = 50;
export const PRICE_BOOK_XLSX_MAX_WORKSHEETS = 20;
export const PRICE_BOOK_XLSX_MAX_ARCHIVE_ENTRIES = 300;
export const PRICE_BOOK_XLSX_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

export type PriceBookXlsxWorksheet = {
  name: string;
  hidden: boolean;
  headers: string[];
  rows: PriceBookTabularRow[];
  error: string;
};

type XlsxCell = string | boolean | Date | null;

class PriceBookXlsxImportError extends Error {}

function xlsxError(message: string): never {
  throw new PriceBookXlsxImportError(message);
}

function workbookSheetVisibility(bytes: Uint8Array) {
  let entryCount = 0;
  let uncompressedBytes = 0;
  const workbookOnly = unzipSync(bytes, {
    filter: file => {
      entryCount += 1;
      uncompressedBytes += file.originalSize;
      const normalizedName = file.name.replace(/\\/g, '/').toLowerCase();
      if (entryCount > PRICE_BOOK_XLSX_MAX_ARCHIVE_ENTRIES) {
        xlsxError(`XLSX workbooks can contain up to ${PRICE_BOOK_XLSX_MAX_ARCHIVE_ENTRIES} archive entries.`);
      }
      if (uncompressedBytes > PRICE_BOOK_XLSX_MAX_UNCOMPRESSED_BYTES) {
        xlsxError('This XLSX workbook expands beyond the 20 MB safety limit.');
      }
      if (normalizedName.endsWith('/vbaproject.bin') || normalizedName === 'vbaproject.bin') {
        xlsxError('Macro-enabled workbooks are not supported. Upload a plain .xlsx workbook.');
      }
      return normalizedName === 'xl/workbook.xml';
    },
  });
  const workbookXml = workbookOnly['xl/workbook.xml'];
  if (!workbookXml) xlsxError('This XLSX workbook is missing required worksheet metadata.');

  const document = new DOMParser().parseFromString(strFromU8(workbookXml), 'application/xml');
  if (document.querySelector('parsererror')) xlsxError('This XLSX workbook has invalid worksheet metadata.');
  const sheets = Array.from(document.getElementsByTagNameNS('*', 'sheet')).map(sheet => ({
    name: sheet.getAttribute('name') || '',
    hidden: ['hidden', 'veryHidden'].includes(sheet.getAttribute('state') || ''),
  })).filter(sheet => sheet.name);
  if (sheets.length === 0) xlsxError('This XLSX workbook has no worksheets.');
  if (sheets.length > PRICE_BOOK_XLSX_MAX_WORKSHEETS) {
    xlsxError(`XLSX workbooks can contain up to ${PRICE_BOOK_XLSX_MAX_WORKSHEETS} worksheets.`);
  }
  if (new Set(sheets.map(sheet => sheet.name)).size !== sheets.length) {
    xlsxError('This XLSX workbook contains ambiguous duplicate worksheet names.');
  }
  return new Map(sheets.map(sheet => [sheet.name, sheet.hidden]));
}

export function normalizePriceBookXlsxCell(value: XlsxCell) {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.trim();
  throw new Error('This XLSX workbook contains an unsupported cell value.');
}

function worksheetFromData(name: string, hidden: boolean, data: XlsxCell[][]): PriceBookXlsxWorksheet {
  const normalized = data.map(row => row.map(normalizePriceBookXlsxCell));
  const meaningfulColumnCount = normalized.reduce((maximum, row) => {
    let lastMeaningful = 0;
    row.forEach((cell, index) => { if (cell) lastMeaningful = index + 1; });
    return Math.max(maximum, lastMeaningful);
  }, 0);
  if (meaningfulColumnCount > PRICE_BOOK_XLSX_MAX_COLUMNS) {
    return { name, hidden, headers: [], rows: [], error: `XLSX worksheets can contain up to ${PRICE_BOOK_XLSX_MAX_COLUMNS} meaningful columns.` };
  }
  if (meaningfulColumnCount === 0) return { name, hidden, headers: [], rows: [], error: 'This worksheet is empty.' };
  try {
    const firstMeaningfulRow = normalized.find(row => row.some(cell => cell));
    const completeHeader = Array.from(
      { length: meaningfulColumnCount },
      (_, index) => firstMeaningfulRow?.[index] || '',
    );
    if (completeHeader.some(header => !header)) {
      throw new Error('XLSX headers cannot be blank when their column contains data.');
    }
    const parsed = priceBookTabularRowsFromParsed(normalized, 'XLSX');
    return { name, hidden, headers: parsed.headers, rows: parsed.rows, error: '' };
  } catch (error) {
    return { name, hidden, headers: [], rows: [], error: error instanceof Error ? error.message : 'This worksheet is not a usable table.' };
  }
}

export async function parsePriceBookXlsxWorkbook(arrayBuffer: ArrayBuffer): Promise<PriceBookXlsxWorksheet[]> {
  if (arrayBuffer.byteLength === 0) xlsxError('This XLSX workbook is empty.');
  if (arrayBuffer.byteLength > PRICE_BOOK_XLSX_MAX_BYTES) xlsxError('XLSX files can be up to 1 MB.');
  try {
    const visibility = workbookSheetVisibility(new Uint8Array(arrayBuffer));
    const { default: readExcelFile } = await import('read-excel-file/browser');
    const workbook = await readExcelFile<string>(arrayBuffer, { parseNumber: value => value, trim: false });
    if (workbook.length !== visibility.size || workbook.some(sheet => !visibility.has(sheet.sheet))) {
      xlsxError('This XLSX workbook has inconsistent worksheet metadata.');
    }
    return workbook.map(sheet => worksheetFromData(
      sheet.sheet,
      visibility.get(sheet.sheet) as boolean,
      sheet.data as XlsxCell[][],
    ));
  } catch (error) {
    if (error instanceof PriceBookXlsxImportError) throw error;
    xlsxError('Unable to read this XLSX workbook safely. Confirm it is a valid, unprotected .xlsx file.');
  }
}
