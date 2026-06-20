import jsPDF from 'jspdf';

import { supabase } from '../supabaseClient';
import type {
  Estimate,
  EstimateLineItem,
  EstimateLineSupplyStatus,
  FindingStatus,
  Inspection,
  InspectionRoomData,
  InspectionRoomFinding,
  Invoice,
  InvoiceLineItem,
  LegacyEstimateLineType,
} from '../types';

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeEstimateLineType(lineType: LegacyEstimateLineType | string | null | undefined) {
  if (lineType === 'labor' || lineType === 'material' || lineType === 'fee' || lineType === 'other') return lineType;
  if (lineType === 'equipment') return 'material';
  return 'other';
}

const ESTIMATE_LINE_SUPPLY_STATUS_LABELS: Record<EstimateLineSupplyStatus, string> = {
  contractor_supplied: 'Contractor supplied',
  customer_supplied: 'Customer supplied',
  to_be_confirmed: 'Supply status to be confirmed',
};

function normalizeEstimateLineSupplyStatus(value: string | null | undefined): EstimateLineSupplyStatus | '' {
  if (value === 'contractor_supplied' || value === 'customer_supplied' || value === 'to_be_confirmed') return value;
  return '';
}

type StructuredLineDisplay = {
  description?: string | null;
  line_title?: string | null;
  customer_description?: string | null;
  model_spec?: string | null;
  supply_status?: EstimateLineSupplyStatus | string | null;
};

function lineDisplayTitle(line: StructuredLineDisplay) {
  return line.line_title?.trim() || line.description?.trim() || 'Line item';
}

function lineCustomerDescription(line: { customer_description?: string | null }) {
  return line.customer_description?.trim() || '';
}

function lineModelSpec(line: { model_spec?: string | null }) {
  return line.model_spec?.trim() || '';
}

function lineSupplyStatusLabel(line: { supply_status?: EstimateLineSupplyStatus | string | null }) {
  const status = normalizeEstimateLineSupplyStatus(line.supply_status || '');
  return status ? ESTIMATE_LINE_SUPPLY_STATUS_LABELS[status] : '';
}

function lineDisplayDetailRows(line: StructuredLineDisplay) {
  return [
    lineCustomerDescription(line),
    lineModelSpec(line) ? `Model/spec: ${lineModelSpec(line)}` : '',
    lineSupplyStatusLabel(line),
  ].filter(Boolean);
}

function normalizeEstimateLaborMode(value: string | null | undefined) {
  return value === 'line_specific' ? 'line_specific' : 'job_total';
}

function formatLaborHours(value: number) {
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function persistedLineCanShowLaborHours(line: Pick<EstimateLineItem | InvoiceLineItem, 'line_type'>) {
  const type = normalizeEstimateLineType(line.line_type);
  return type === 'material' || type === 'other';
}

function customerLineDisplayDetailRows(
  line: StructuredLineDisplay & Pick<EstimateLineItem | InvoiceLineItem, 'line_type' | 'labor_hours'>,
  record?: Pick<Estimate | Invoice, 'labor_mode'>,
) {
  const rows = lineDisplayDetailRows(line);
  const laborHours = typeof line.labor_hours === 'number' && line.labor_hours > 0 ? line.labor_hours : 0;
  if (record && normalizeEstimateLaborMode(record.labor_mode) === 'line_specific' && laborHours > 0 && persistedLineCanShowLaborHours(line)) {
    rows.push(`Labor hours: ${formatLaborHours(laborHours)}`);
  }
  return rows;
}

function estimateDocumentLabel(estimate: Pick<Estimate, 'title' | 'scope' | 'notes'>) {
  const haystack = normalizeText(`${estimate.title || ''} ${estimate.scope || ''} ${estimate.notes || ''}`);
  if (/\b(invoice|completed work|payment due|paid|final invoice|billable work)\b/.test(haystack)) return 'Invoice';
  return 'Estimate';
}

const ESTIMATE_LINE_TYPE_LABELS = {
  labor: 'Labor',
  material: 'Material',
  fee: 'Fee',
  other: 'Other',
} as const;

function estimateLineTypeLabel(lineType: LegacyEstimateLineType | string | null | undefined) {
  return ESTIMATE_LINE_TYPE_LABELS[normalizeEstimateLineType(lineType)];
}

function homeownerFindingDescription(finding: InspectionRoomFinding): string {
  const source = (finding.notes || finding.action || finding.title || '').trim().replace(/\s+/g, ' ');
  if (!source) return finding.title;
  const trimmed = source.length > 120 ? `${source.slice(0, 117).trim()}...` : source;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function buildValueAddText(rooms: InspectionRoomData[]): string {
  const fixedCount = rooms.flatMap(room => room.findings).filter(finding => finding.status === 'Fixed On Site').length;
  if (fixedCount === 0) return '';
  return `${fixedCount} item${fixedCount !== 1 ? 's were' : ' was'} corrected during this visit. These completed fixes document work performed on site and may help the homeowner track maintenance needs over time.`;
}

function persistedLineIsUnpriced(line: Pick<EstimateLineItem | InvoiceLineItem, 'unit_price_cents'>) {
  return line.unit_price_cents === null || line.unit_price_cents === undefined;
}

function estimateLineBucket(lineType: LegacyEstimateLineType | string | null | undefined) {
  const type = normalizeEstimateLineType(lineType);
  if (type === 'fee') return 'fee';
  if (type === 'labor') return 'labor';
  if (type === 'material' || type === 'other') return 'material';
  return 'other';
}

function persistedLineTotalCents(line: Pick<EstimateLineItem | InvoiceLineItem, 'quantity' | 'unit_price_cents'>) {
  const unitPriceCents = line.unit_price_cents;
  if (unitPriceCents === null || unitPriceCents === undefined) return 0;
  return Math.round(Number(line.quantity || 0) * unitPriceCents);
}

function persistedLineBucketTotal(lines: Array<EstimateLineItem | InvoiceLineItem> = [], bucket: 'material' | 'labor' | 'fee') {
  return lines.reduce((sum, line) => estimateLineBucket(line.line_type) === bucket ? sum + persistedLineTotalCents(line) : sum, 0);
}

function persistedOtherLineTotal(lines: Array<EstimateLineItem | InvoiceLineItem> = []) {
  const lineSubtotal = lines.reduce((sum, line) => sum + persistedLineTotalCents(line), 0);
  return Math.max(0, lineSubtotal - persistedLineBucketTotal(lines, 'material') - persistedLineBucketTotal(lines, 'labor') - persistedLineBucketTotal(lines, 'fee'));
}

function persistedSchemaLaborHours(record: Pick<Estimate | Invoice, 'labor_mode' | 'job_labor_hours' | 'line_items'>) {
  const mode = normalizeEstimateLaborMode(record.labor_mode);
  if (mode === 'line_specific') {
    return (record.line_items ?? []).reduce((sum, line) => {
      if (!persistedLineCanShowLaborHours(line)) return sum;
      return sum + (typeof line.labor_hours === 'number' && line.labor_hours > 0 ? line.labor_hours : 0);
    }, 0);
  }
  return typeof record.job_labor_hours === 'number' && record.job_labor_hours > 0 ? record.job_labor_hours : 0;
}

function persistedSchemaLaborTotalCents(record: Pick<Estimate | Invoice, 'labor_mode' | 'labor_rate_cents' | 'job_labor_hours' | 'line_items' | 'labor_total_cents'>) {
  if (typeof record.labor_total_cents === 'number') {
    return Math.max(0, record.labor_total_cents - persistedLineBucketTotal(record.line_items ?? [], 'labor'));
  }
  const rate = record.labor_rate_cents;
  if (rate === null || rate === undefined) return 0;
  return Math.round(persistedSchemaLaborHours(record) * rate);
}

function persistedFinancialBreakdown(record: Pick<Estimate | Invoice, 'subtotal_cents' | 'total_cents' | 'labor_mode' | 'labor_rate_cents' | 'job_labor_hours' | 'material_total_cents' | 'labor_total_cents' | 'fee_total_cents' | 'other_total_cents' | 'tax_cents' | 'line_items'>) {
  const lines = record.line_items ?? [];
  const materialTotalCents = record.material_total_cents ?? persistedLineBucketTotal(lines, 'material');
  const laborTotalCents = record.labor_total_cents ?? (persistedLineBucketTotal(lines, 'labor') + persistedSchemaLaborTotalCents(record));
  const feeTotalCents = record.fee_total_cents ?? persistedLineBucketTotal(lines, 'fee');
  const otherTotalCents = record.other_total_cents ?? persistedOtherLineTotal(lines);
  const taxCents = record.tax_cents ?? 0;
  const subtotalCents = record.subtotal_cents ?? materialTotalCents + laborTotalCents + feeTotalCents + otherTotalCents;
  return {
    materialTotalCents,
    laborTotalCents,
    feeTotalCents,
    otherTotalCents,
    taxCents,
    subtotalCents,
    totalCents: record.total_cents,
    laborHours: persistedSchemaLaborHours(record),
  };
}

function unpricedLineCount(lines: Array<Pick<EstimateLineItem | InvoiceLineItem, 'unit_price_cents'>> = []) {
  return lines.filter(persistedLineIsUnpriced).length;
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function persistedLinePriceLabel(line: Pick<EstimateLineItem | InvoiceLineItem, 'unit_price_cents'>) {
  const unitPriceCents = line.unit_price_cents;
  return unitPriceCents === null || unitPriceCents === undefined ? 'Price to be confirmed' : formatMoney(unitPriceCents);
}

function persistedLineTotalLabel(line: Pick<EstimateLineItem | InvoiceLineItem, 'quantity' | 'unit_price_cents'>) {
  return persistedLineIsUnpriced(line) ? 'Price to be confirmed' : formatMoney(persistedLineTotalCents(line));
}

function invoiceStatusLabel(status: Invoice['status']) {
  return status.replace(/_/g, ' ');
}

function estimateStatusLabel(status: Estimate['status']) {
  const labels: Record<Estimate['status'], string> = {
    draft: 'Draft',
    sent: 'Sent to homeowner',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
    revised: 'Revised',
  };
  return labels[status] ?? status;
}

type PdfImageAsset = {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
};

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image.'));
    reader.readAsDataURL(blob);
  });
}

function imageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 });
    image.onerror = () => reject(new Error('Unable to load logo image.'));
    image.src = dataUrl;
  });
}

function pdfSafeImageAssetFromBlob(blob: Blob): Promise<PdfImageAsset | null> {
  return new Promise(resolve => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const maxSide = 1400;
        const naturalW = image.naturalWidth || image.width || 1;
        const naturalH = image.naturalHeight || image.height || 1;
        const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
        const width = Math.max(1, Math.round(naturalW * scale));
        const height = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.84), format: 'JPEG', width, height });
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

async function loadPdfImageAsset(url?: string | null, options?: { normalizeForPdf?: boolean }): Promise<PdfImageAsset | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (options?.normalizeForPdf) {
      const normalized = await pdfSafeImageAssetFromBlob(blob);
      if (normalized) return normalized;
    }
    const dataUrl = await dataUrlFromBlob(blob);
    const size = await imageSizeFromDataUrl(dataUrl);
    const mime = (blob.type || dataUrl.slice(5, dataUrl.indexOf(';'))).toLowerCase();
    if (mime.includes('webp') || (!mime.includes('png') && !mime.includes('jpeg') && !mime.includes('jpg'))) {
      return pdfSafeImageAssetFromBlob(blob);
    }
    const format: PdfImageAsset['format'] = mime.includes('jpeg') || mime.includes('jpg') ? 'JPEG' : 'PNG';
    return { dataUrl, format, width: size.width, height: size.height };
  } catch {
    return null;
  }
}

function inspectionMediaStoragePath(value: string) {
  if (!value.startsWith('http')) return value;
  const marker = '/storage/v1/object/public/inspection-media/';
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return '';
  return decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0]);
}

async function loadInspectionPdfPhotoAsset(photo: string): Promise<PdfImageAsset | null> {
  const storagePath = inspectionMediaStoragePath(photo);
  if (storagePath && supabase) {
    const { data, error } = await supabase.storage
      .from('inspection-media')
      .createSignedUrl(storagePath, 60 * 15);
    if (!error && data?.signedUrl) return loadPdfImageAsset(data.signedUrl, { normalizeForPdf: true });
  }
  return photo.startsWith('http') ? loadPdfImageAsset(photo, { normalizeForPdf: true }) : null;
}

function drawPdfLogo(pdf: jsPDF, image: PdfImageAsset, x: number, y: number, boxW: number, boxH: number) {
  const padding = 2;
  const maxW = Math.max(1, boxW - padding * 2);
  const maxH = Math.max(1, boxH - padding * 2);
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  pdf.addImage(image.dataUrl, image.format, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

function drawPdfImageCover(pdf: jsPDF, image: PdfImageAsset, x: number, y: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / image.width, boxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  pdf.addImage(image.dataUrl, image.format, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

// PDF generation for job reports. Internal inspection names remain until the schema is renamed.
export async function generateInspectionPdf(
  inspection: Inspection,
  contractorName: string,
  homeownerName: string,
  homeAddress: string,
  contractorLogoUrl?: string | null,
  options?: {
    includeSummary?: boolean;
    includeValueAdd?: boolean;
    valueAddText?: string;
  },
): Promise<{ blob: Blob; fileName: string }> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 0;

  const BLUE   = [37, 99, 235]   as const;
  const DARK   = [30, 41, 59]    as const;
  const GRAY   = [100, 116, 139] as const;
  const LIGHT  = [248, 250, 252] as const;
  const WHITE  = [255, 255, 255] as const;
  const BORDER = [226, 232, 240] as const;

  const STATUS_PDF: Record<FindingStatus, { bg: readonly number[]; text: readonly number[] }> = {
    'Pass':         { bg: [220, 252, 231], text: [22, 163, 74] },
    'Monitor':      { bg: [219, 234, 254], text: [37, 99, 235] },
    'Fixed On Site':{ bg: [237, 233, 254], text: [109, 40, 217] },
    'Needs Repair': { bg: [254, 243, 199], text: [217, 119, 6] },
    'Urgent':       { bg: [254, 226, 226], text: [220, 38, 38] },
  };

  function checkPageBreak(needed: number) {
    if (y + needed > pageH - 16) { pdf.addPage(); y = 16; }
  }
  function setFill(c: readonly number[]) { pdf.setFillColor(c[0], c[1], c[2]); }
  function setTxt(c: readonly number[]) { pdf.setTextColor(c[0], c[1], c[2]); }
  function drawRect(x: number, yy: number, w: number, h: number, fill: readonly number[], r = 3) {
    setFill(fill); pdf.roundedRect(x, yy, w, h, r, r, 'F');
  }
  function txt(s: string, x: number, yy: number, c: readonly number[], size: number, bold = false, align: 'left'|'center'|'right' = 'left', maxW?: number) {
    setTxt(c); pdf.setFontSize(size); pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    if (maxW) { const lines = pdf.splitTextToSize(s, maxW); pdf.text(lines, x, yy, { align }); }
    else pdf.text(s, x, yy, { align });
  }
  function sectionLine(yy: number) {
    pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); pdf.setLineWidth(0.2);
    pdf.line(margin, yy, pageW - margin, yy);
  }

  const allFindings = inspection.rooms_with_findings.flatMap(r => r.findings);
  const findingsWithRoom = inspection.rooms_with_findings.flatMap(r => r.findings.map(f => ({ ...f, room: r.room })));
  const urgentCount = allFindings.filter(f => f.status === 'Urgent').length;
  const needsRepairCount = allFindings.filter(f => f.status === 'Needs Repair').length;
  const monitorCount = allFindings.filter(f => f.status === 'Monitor').length;
  const fixedCount = allFindings.filter(f => f.status === 'Fixed On Site').length;
  const passCount = allFindings.filter(f => f.status === 'Pass').length;
  const issueCount = urgentCount + needsRepairCount;
  const attentionGroups: Array<{ status: FindingStatus; title: string; findings: Array<InspectionRoomFinding & { room: string }> }> = [
    { status: 'Urgent', title: 'Urgent Items', findings: findingsWithRoom.filter(f => f.status === 'Urgent') },
    { status: 'Needs Repair', title: 'Needs Repair', findings: findingsWithRoom.filter(f => f.status === 'Needs Repair') },
    { status: 'Monitor', title: 'Monitor', findings: findingsWithRoom.filter(f => f.status === 'Monitor') },
  ];
  const fixedValueFindings = findingsWithRoom.filter(f => f.status === 'Fixed On Site');
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const contractorLogo = await loadPdfImageAsset(contractorLogoUrl);
  const uniquePhotoPaths = Array.from(new Set(allFindings.flatMap(f => f.photos ?? []).filter(Boolean)));
  const photoAssetEntries = await Promise.all(uniquePhotoPaths.map(async photo => [photo, await loadInspectionPdfPhotoAsset(photo)] as const));
  const photoAssets = new Map(photoAssetEntries.filter((entry): entry is readonly [string, PdfImageAsset] => Boolean(entry[1])));
  const includeSummary = options?.includeSummary ?? true;
  const includeValueAdd = options?.includeValueAdd ?? true;
  const valueAddText = options?.valueAddText?.trim() || buildValueAddText(inspection.rooms_with_findings);

  function photosForFinding(finding: InspectionRoomFinding) {
    return (finding.photos ?? [])
      .map(photo => photoAssets.get(photo))
      .filter((asset): asset is PdfImageAsset => Boolean(asset));
  }
  function photoRowHeight(finding: InspectionRoomFinding) {
    return photosForFinding(finding).length > 0 ? 25 : 0;
  }
  function drawFindingPhotos(finding: InspectionRoomFinding, x: number, yy: number, maxW: number) {
    const assets = photosForFinding(finding).slice(0, 3);
    if (assets.length === 0) return 0;
    const gap = 2.5;
    const thumbW = Math.min(34, (maxW - gap * (assets.length - 1)) / assets.length);
    const thumbH = 22;
    assets.forEach((asset, index) => {
      const px = x + index * (thumbW + gap);
      drawRect(px, yy, thumbW, thumbH, WHITE, 1.5);
      drawPdfImageCover(pdf, asset, px + 0.8, yy + 0.8, thumbW - 1.6, thumbH - 1.6);
      pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      pdf.roundedRect(px, yy, thumbW, thumbH, 1.5, 1.5, 'S');
    });
    if ((finding.photos ?? []).length > assets.length) {
      txt(`+${(finding.photos ?? []).length - assets.length} more`, x + assets.length * (thumbW + gap), yy + 13, GRAY, 7);
    }
    return thumbH + 3;
  }

  // Header
  drawRect(0, 0, pageW, 44, BLUE, 0);
  txt(contractorName, margin, 13, WHITE, 16, true);
  txt('Job Report', margin, 20, [147, 197, 253], 8);
  const statusLabel = urgentCount > 0 ? `${urgentCount} URGENT` : issueCount > 0 ? `${issueCount} ISSUES` : 'ALL CLEAR';
  const statusBg = urgentCount > 0 ? STATUS_PDF['Urgent'].bg : issueCount > 0 ? STATUS_PDF['Needs Repair'].bg : STATUS_PDF['Pass'].bg;
  const statusTxt = urgentCount > 0 ? STATUS_PDF['Urgent'].text : issueCount > 0 ? STATUS_PDF['Needs Repair'].text : STATUS_PDF['Pass'].text;
  if (contractorLogo) {
    const logoW = 38;
    const logoH = 19;
    const logoX = pageW - margin - logoW;
    drawRect(logoX, 6, logoW, logoH, WHITE, 2);
    drawPdfLogo(pdf, contractorLogo, logoX, 6, logoW, logoH);
    txt('Powered by ServSync', logoX + logoW / 2, 29.5, [219, 234, 254], 5.5, false, 'center');
    drawRect(pageW - margin - 36, 32, 36, 8, statusBg, 2);
    txt(statusLabel, pageW - margin - 18, 37.5, statusTxt, 7, true, 'center');
  } else {
    drawRect(pageW - margin - 36, 8, 36, 8, statusBg, 2);
    txt(statusLabel, pageW - margin - 18, 13.5, statusTxt, 7, true, 'center');
  }
  y = 50;

  // Property info
  txt(homeownerName, margin, y, DARK, 15, true); y += 6;
  if (homeAddress) { txt(homeAddress, margin, y, GRAY, 9); y += 5; }
  txt(`Job: ${inspection.name}`, margin, y, GRAY, 8); y += 5;
  txt(`Prepared: ${today}`, margin, y, GRAY, 8); y += 9;

  // Stats row
  const boxW = (contentW - 10) / 5;
  const stats = [
    { label: 'Urgent',    value: String(urgentCount),    ...STATUS_PDF['Urgent'] },
    { label: 'Repair',    value: String(needsRepairCount), ...STATUS_PDF['Needs Repair'] },
    { label: 'Monitor',   value: String(monitorCount),   ...STATUS_PDF['Monitor'] },
    { label: 'Fixed',     value: String(fixedCount),     ...STATUS_PDF['Fixed On Site'] },
    { label: 'Pass',      value: String(passCount),      ...STATUS_PDF['Pass'] },
  ];
  stats.forEach((s, i) => {
    const bx = margin + i * (boxW + 2.5);
    drawRect(bx, y, boxW, 16, s.bg, 2);
    txt(s.value, bx + boxW / 2, y + 7, s.text, 12, true, 'center');
    txt(s.label.toUpperCase(), bx + boxW / 2, y + 13, s.text, 6, false, 'center');
  });
  y += 22;
  sectionLine(y); y += 8;

  // Professional summary
  if (includeSummary && inspection.summary) {
    txt('INSPECTION SUMMARY', margin, y, GRAY, 8, true); y += 5;
    const summaryLines = pdf.splitTextToSize(inspection.summary, contentW - 6);
    const summaryH = summaryLines.length * 4.5 + 10;
    checkPageBreak(summaryH + 4);
    drawRect(margin, y, contentW, summaryH, LIGHT, 2);
    txt(inspection.summary, margin + 3, y + 7, DARK, 8, false, 'left', contentW - 6);
    y += summaryH + 8;
    sectionLine(y); y += 8;
  }

  // Top-of-report attention items, so homeowners do not have to search the full report.
  const attentionCount = urgentCount + needsRepairCount + monitorCount;
  if (attentionCount > 0) {
    txt('ITEMS NEEDING ATTENTION', margin, y, GRAY, 8, true); y += 5;
    for (const group of attentionGroups) {
      if (group.findings.length === 0) continue;
      const sc = STATUS_PDF[group.status];
      const groupHeaderH = 9;
      checkPageBreak(groupHeaderH + 8);
      drawRect(margin, y, contentW, groupHeaderH, sc.bg, 2);
      txt(`${group.title.toUpperCase()} (${group.findings.length})`, margin + 4, y + 6, sc.text, 8, true);
      y += groupHeaderH + 3;

      for (const f of group.findings) {
        const description = homeownerFindingDescription(f);
        const descriptionLines = pdf.splitTextToSize(description, contentW - 16);
        const actionLines = f.action ? pdf.splitTextToSize(`Action: ${f.action}`, contentW - 16) : [];
        const dueLines = f.due ? pdf.splitTextToSize(`Due: ${f.due}`, contentW - 16) : [];
        const cardH = 11 + descriptionLines.length * 4.2 + actionLines.length * 4.2 + dueLines.length * 4.2 + photoRowHeight(f);
        checkPageBreak(cardH + 3);
        pdf.setFillColor(sc.text[0], sc.text[1], sc.text[2]);
        pdf.rect(margin, y, 2, cardH, 'F');
        drawRect(margin + 2, y, contentW - 2, cardH, LIGHT, 0);
        txt(`${f.room}: ${f.title}`, margin + 6, y + 5.5, DARK, 8, true, 'left', contentW - 42);
        drawRect(pageW - margin - 32, y + 1.5, 32, 6.5, sc.bg, 2);
        txt(f.status, pageW - margin - 16, y + 6.3, sc.text, 6.5, true, 'center');
        let yOff = 11;
        txt(description, margin + 6, y + yOff, GRAY, 7.6, false, 'left', contentW - 16);
        yOff += descriptionLines.length * 4.2;
        if (f.action) {
          txt(`Action: ${f.action}`, margin + 6, y + yOff, BLUE, 7.2, false, 'left', contentW - 16);
          yOff += actionLines.length * 4.2;
        }
        if (f.due) {
          txt(`Due: ${f.due}`, margin + 6, y + yOff, STATUS_PDF['Needs Repair'].text, 7.2, false, 'left', contentW - 16);
          yOff += dueLines.length * 4.2;
        }
        if (photosForFinding(f).length > 0) {
          drawFindingPhotos(f, margin + 6, y + yOff + 1, contentW - 16);
        }
        y += cardH + 3;
      }
      y += 2;
    }
    sectionLine(y); y += 8;
  }

  if (includeValueAdd && fixedValueFindings.length > 0) {
    const sc = STATUS_PDF['Fixed On Site'];
    txt('VALUE DELIVERED ON SITE', margin, y, sc.text, 8, true); y += 5;
    const intro = valueAddText;
    const introLines = pdf.splitTextToSize(intro, contentW - 8);
    const boxH = 10 + introLines.length * 4.3;
    checkPageBreak(boxH + 8);
    drawRect(margin, y, contentW, boxH, sc.bg, 2);
    txt(intro, margin + 4, y + 7, sc.text, 8, false, 'left', contentW - 8);
    y += boxH + 4;
    for (const f of fixedValueFindings.slice(0, 5)) {
      const description = homeownerFindingDescription(f);
      const lines = pdf.splitTextToSize(description, contentW - 12);
      const rowH = 7 + lines.length * 4.2;
      checkPageBreak(rowH + 2);
      pdf.setFillColor(sc.text[0], sc.text[1], sc.text[2]);
      pdf.rect(margin, y, 2, rowH, 'F');
      drawRect(margin + 2, y, contentW - 2, rowH, LIGHT, 0);
      txt(`${f.room}: ${description}`, margin + 6, y + 5.5, DARK, 7.7, false, 'left', contentW - 12);
      y += rowH + 2;
    }
    if (fixedValueFindings.length > 5) {
      txt(`+ ${fixedValueFindings.length - 5} additional fixed item${fixedValueFindings.length - 5 !== 1 ? 's' : ''} shown in the room sections.`, margin + 4, y + 3.5, GRAY, 7.2);
      y += 7;
    }
    sectionLine(y); y += 8;
  }

  // Room sections
  for (const roomData of inspection.rooms_with_findings) {
    if (roomData.findings.length === 0) continue;
    const nonPassFindings = roomData.findings.filter(f => f.status !== 'Pass');
    const passFindings = roomData.findings.filter(f => f.status === 'Pass');
    const hasUrgent = roomData.findings.some(f => f.status === 'Urgent');

    checkPageBreak(20);
    drawRect(margin, y, contentW, 12, DARK, 2);
    txt(roomData.room.toUpperCase(), margin + 4, y + 8, WHITE, 10, true);
    const rBadgeLabel = hasUrgent ? 'URGENT' : nonPassFindings.length > 0 ? 'HAS ISSUES' : 'CLEAR';
    const rBadgeBg = hasUrgent ? STATUS_PDF['Urgent'].bg : nonPassFindings.length > 0 ? STATUS_PDF['Needs Repair'].bg : STATUS_PDF['Pass'].bg;
    const rBadgeTxt = hasUrgent ? STATUS_PDF['Urgent'].text : nonPassFindings.length > 0 ? STATUS_PDF['Needs Repair'].text : STATUS_PDF['Pass'].text;
    drawRect(pageW - margin - 32, y + 2, 32, 8, rBadgeBg, 2);
    txt(rBadgeLabel, pageW - margin - 16, y + 7.5, rBadgeTxt, 7, true, 'center');
    y += 14;
    txt(`${roomData.findings.length} items  ·  ${passFindings.length} passed  ·  ${nonPassFindings.length} need attention`, margin, y, GRAY, 8);
    y += 7;

    if (nonPassFindings.length > 0) {
      txt('FINDINGS', margin, y, GRAY, 7, true); y += 5;
      for (const f of nonPassFindings) {
        const sc = STATUS_PDF[f.status];
        const notesLines = f.notes ? pdf.splitTextToSize(f.notes, contentW - 10).length : 0;
        const actionLine = f.action ? 1 : 0;
        const dueLine = f.due ? 1 : 0;
        const fH = 10 + notesLines * 4.5 + (actionLine + dueLine) * 5 + 8 + photoRowHeight(f);
        checkPageBreak(fH);
        pdf.setFillColor(sc.text[0], sc.text[1], sc.text[2]);
        pdf.rect(margin, y, 2, fH, 'F');
        drawRect(margin + 2, y, contentW - 2, fH, LIGHT, 0);
        txt(f.title, margin + 6, y + 6, DARK, 9, true, 'left', contentW - 40);
        drawRect(pageW - margin - 32, y + 1, 32, 7, sc.bg, 2);
        txt(f.status, pageW - margin - 16, y + 6, sc.text, 7, true, 'center');
        let yOff = 12;
        if (f.notes) {
          txt(f.notes, margin + 6, y + yOff, GRAY, 8, false, 'left', contentW - 10);
          yOff += notesLines * 4.5;
        }
        if (f.action) {
          txt(`Action: ${f.action}`, margin + 6, y + yOff, [37, 99, 235], 7.5, false, 'left', contentW - 10);
          yOff += 5;
        }
        if (f.due) {
          txt(`Due: ${f.due}`, margin + 6, y + yOff, [217, 119, 6], 7.5, false, 'left', contentW - 10);
          yOff += 5;
        }
        if (photosForFinding(f).length > 0) {
          drawFindingPhotos(f, margin + 6, y + yOff, contentW - 10);
        }
        y += fH + 3;
      }
    }

    if (passFindings.length > 0) {
      checkPageBreak(12);
      txt('PASSED', margin, y, GRAY, 7, true); y += 5;
      for (const f of passFindings) {
        const notesLines = f.notes ? pdf.splitTextToSize(f.notes, contentW - 10).length : 0;
        const documentedH = f.notes || photosForFinding(f).length > 0
          ? 10 + notesLines * 4.5 + photoRowHeight(f) + 4
          : 8;
        checkPageBreak(documentedH + 2);
        pdf.setFillColor(STATUS_PDF['Pass'].text[0], STATUS_PDF['Pass'].text[1], STATUS_PDF['Pass'].text[2]);
        pdf.rect(margin, y, 2, documentedH, 'F');
        drawRect(margin + 2, y, contentW - 2, documentedH, LIGHT, 0);
        txt(f.title, margin + 6, y + 5.5, DARK, 8, false, 'left', contentW - 40);
        drawRect(pageW - margin - 18, y + 1, 18, 6, STATUS_PDF['Pass'].bg, 2);
        txt('Pass', pageW - margin - 9, y + 5.5, STATUS_PDF['Pass'].text, 7, true, 'center');
        let yOff = 11;
        if (f.notes) {
          txt(f.notes, margin + 6, y + yOff, GRAY, 7.5, false, 'left', contentW - 10);
          yOff += notesLines * 4.5;
        }
        if (photosForFinding(f).length > 0) {
          drawFindingPhotos(f, margin + 6, y + yOff, contentW - 10);
        }
        y += documentedH + 3;
      }
      y += 3;
    }

    y += 4;
    sectionLine(y); y += 8;
  }

  // Footer
  checkPageBreak(28);
  drawRect(margin, pageH - 28, contentW, 10, LIGHT, 2);
  txt('This report is based on limited job observations and accessible conditions at the time of service. It is not a code inspection, engineering report, or guarantee of hidden conditions unless explicitly stated by the contractor. Items marked Urgent or Needs Repair should be addressed by a qualified professional.', margin + 2, pageH - 24, GRAY, 6.2, false, 'left', contentW - 4);
  drawRect(0, pageH - 14, pageW, 14, DARK, 0);
  txt(`${contractorName}  ·  ServSync`, pageW / 2, pageH - 6, [148, 163, 184], 7, false, 'center');

  const safeName = homeownerName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `${safeName}-Field-Work-${dateStr}.pdf`;
  pdf.save(fileName);
  return { blob: pdf.output('blob'), fileName };
}


function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'servsync';
}

export type InvoicePdfContext = {
  contractorName: string;
  contractorLogoUrl?: string | null;
  contractorEmail?: string;
  contractorPhone?: string;
  contractorAddress?: string;
  customerName: string;
  customerAddress?: string;
  serviceLabel?: string;
};

export async function createEstimatePdf(
  estimate: Estimate,
  context: { contractorName: string; customerName: string; customerAddress?: string; contractorLogoUrl?: string | null },
) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 18;
  const contractorLogo = await loadPdfImageAsset(context.contractorLogoUrl);
  const documentLabel = estimateDocumentLabel(estimate);

  const addPageIfNeeded = (height = 12) => {
    if (y + height <= pageH - margin) return;
    pdf.addPage();
    y = margin;
  };
  const addWrappedText = (text: string, x: number, maxW: number, fontSize = 10, lineGap = 5) => {
    if (!text.trim()) return;
    pdf.setFontSize(fontSize);
    const lines = pdf.splitTextToSize(text, maxW);
    lines.forEach((line: string) => {
      addPageIfNeeded(lineGap);
      pdf.text(line, x, y);
      y += lineGap;
    });
  };
  const sectionTitle = (title: string) => {
    addPageIfNeeded(10);
    y += 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(title, margin, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
  };
  const moneyRow = (label: string, amount: number, bold = false, helper?: string) => {
    addPageIfNeeded(7);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(bold ? 12 : 10);
    pdf.setTextColor(15, 23, 42);
    pdf.text(helper ? `${label} (${helper})` : label, pageW - margin - 70, y);
    pdf.text(formatMoney(amount), pageW - margin, y, { align: 'right' });
    y += bold ? 7 : 6;
  };

  pdf.setFillColor(0, 120, 255);
  pdf.rect(0, 0, pageW, 42, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(documentLabel, margin, 18);
  pdf.setFontSize(10);
  pdf.text(context.contractorName || 'Contractor', margin, 27);
  if (contractorLogo) {
    const logoW = 38;
    const logoH = 20;
    const logoX = pageW - margin - logoW;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(logoX, 7, logoW, logoH, 2, 2, 'F');
    drawPdfLogo(pdf, contractorLogo, logoX, 7, logoW, logoH);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    pdf.setTextColor(219, 234, 254);
    pdf.text('Powered by ServSync', logoX + logoW / 2, 32, { align: 'center' });
  }

  y = 52;
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  addWrappedText(estimate.title || documentLabel, margin, contentW - 45, 16, 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Status: ${estimateStatusLabel(estimate.status)}`, margin, y);
  pdf.text(`Updated: ${new Date(estimate.updated_at).toLocaleDateString('en-US')}`, margin, y + 5);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42);
  pdf.text(formatMoney(estimate.total_cents), pageW - margin, y, { align: 'right' });
  y += 14;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  sectionTitle('Customer');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  addWrappedText(context.customerName || 'Customer', margin, contentW, 10, 5);
  if (context.customerAddress) addWrappedText(context.customerAddress, margin, contentW, 10, 5);

  if (estimate.scope) {
    sectionTitle('Scope of Work');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(estimate.scope, margin, contentW, 10, 5);
  }

  sectionTitle('Line Items');
  const lines = [...(estimate.line_items || [])].sort((a, b) => a.sort_order - b.sort_order);
  const totals = persistedFinancialBreakdown(estimate);
  const estimateUnpricedCount = unpricedLineCount(lines);
  if (lines.length === 0) {
    addWrappedText('No line items listed.', margin, contentW, 10, 5);
  } else {
    lines.forEach(line => {
      const detailRows = customerLineDisplayDetailRows(line, estimate);
      const rowH = 18 + detailRows.length * 4;
      addPageIfNeeded(rowH);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(margin, y - 4, contentW, rowH - 3, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(pdf.splitTextToSize(lineDisplayTitle(line), contentW - 52)[0] || 'Line item', margin + 3, y);
      pdf.text(persistedLineTotalLabel(line), pageW - margin - 3, y, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${estimateLineTypeLabel(line.line_type)} · ${line.quantity} ${line.unit} @ ${persistedLinePriceLabel(line)}`, margin + 3, y + 5);
      detailRows.forEach((detail, index) => {
        pdf.text(pdf.splitTextToSize(detail, contentW - 9)[0] || detail, margin + 3, y + 10 + index * 4);
      });
      y += rowH;
    });
  }

  if (estimateUnpricedCount > 0) {
    addPageIfNeeded(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(146, 64, 14);
    addWrappedText('Estimate total does not include items marked "Price to be confirmed."', margin, contentW, 9, 4);
  }

  addPageIfNeeded(44);
  pdf.setDrawColor(226, 232, 240);
  pdf.line(pageW - margin - 72, y, pageW - margin, y);
  y += 7;
  moneyRow('Material total', totals.materialTotalCents);
  moneyRow('Labor total', totals.laborTotalCents, false, totals.laborHours > 0 ? `${formatLaborHours(totals.laborHours)} hrs` : undefined);
  moneyRow('Subtotal', totals.subtotalCents);
  moneyRow('Fees', totals.feeTotalCents);
  moneyRow('Tax', totals.taxCents);
  moneyRow('Total', totals.totalCents, true);

  if (estimate.notes) {
    sectionTitle('Notes / Exclusions');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(estimate.notes, margin, contentW, 10, 5);
  }

  if (estimate.terms) {
    sectionTitle('Terms');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(estimate.terms, margin, contentW, 10, 5);
  }

  const fileName = `${safeFileName(`${context.contractorName}-${estimate.title}`)}.pdf`;
  return { blob: pdf.output('blob'), fileName };
}

export async function downloadEstimatePdf(
  estimate: Estimate,
  context: { contractorName: string; customerName: string; customerAddress?: string; contractorLogoUrl?: string | null },
) {
  const { blob, fileName } = await createEstimatePdf(estimate, context);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function invoiceBalanceDueCents(invoice: Pick<Invoice, 'status' | 'total_cents' | 'amount_paid_cents'>) {
  if (invoice.status === 'void') return 0;
  return Math.max(0, invoice.total_cents - invoice.amount_paid_cents);
}

export async function createInvoicePdf(invoice: Invoice, context: InvoicePdfContext) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 18;
  const contractorLogo = await loadPdfImageAsset(context.contractorLogoUrl);
  const balanceDue = invoiceBalanceDueCents(invoice);

  const formatPdfDate = (value?: string | null) => {
    if (!value) return 'Not specified';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const addPageIfNeeded = (height = 12) => {
    if (y + height <= pageH - margin) return;
    pdf.addPage();
    y = margin;
  };
  const addWrappedText = (text: string, x: number, maxW: number, fontSize = 10, lineGap = 5) => {
    if (!text.trim()) return;
    pdf.setFontSize(fontSize);
    const lines = pdf.splitTextToSize(text, maxW);
    lines.forEach((line: string) => {
      addPageIfNeeded(lineGap);
      pdf.text(line, x, y);
      y += lineGap;
    });
  };
  const sectionTitle = (title: string) => {
    addPageIfNeeded(10);
    y += 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(title, margin, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
  };
  const moneyRow = (label: string, amount: number, bold = false) => {
    addPageIfNeeded(7);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(bold ? 12 : 10);
    pdf.setTextColor(15, 23, 42);
    pdf.text(label, pageW - margin - 58, y);
    pdf.text(formatMoney(amount), pageW - margin, y, { align: 'right' });
    y += bold ? 7 : 6;
  };

  pdf.setFillColor(2, 19, 45);
  pdf.rect(0, 0, pageW, 45, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('Invoice', margin, 18);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(context.contractorName || 'Contractor', margin, 27);
  const contractorContact = [context.contractorPhone, context.contractorEmail, context.contractorAddress].filter(Boolean).join(' · ');
  if (contractorContact) {
    pdf.setFontSize(8);
    pdf.setTextColor(219, 234, 254);
    pdf.text(pdf.splitTextToSize(contractorContact, 105)[0] || '', margin, 34);
  }
  if (contractorLogo) {
    const logoW = 38;
    const logoH = 20;
    const logoX = pageW - margin - logoW;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(logoX, 7, logoW, logoH, 2, 2, 'F');
    drawPdfLogo(pdf, contractorLogo, logoX, 7, logoW, logoH);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    pdf.setTextColor(219, 234, 254);
    pdf.text('Powered by ServSync', logoX + logoW / 2, 32, { align: 'center' });
  }

  y = 55;
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  addWrappedText(invoice.title || 'Invoice', margin, contentW - 60, 16, 7);
  const amountLabel = invoice.status === 'paid' ? 'Paid' : invoice.status === 'void' ? 'Void' : 'Amount Due';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(amountLabel, pageW - margin, 55, { align: 'right' });
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42);
  pdf.text(formatMoney(balanceDue), pageW - margin, 63, { align: 'right' });
  y = Math.max(y, 73);

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  const metaRows = [
    ['Invoice #', invoice.invoice_number || 'Not assigned'],
    ['Status', invoiceStatusLabel(invoice.status)],
    ['Issued', formatPdfDate(invoice.issued_at)],
    ['Due', formatPdfDate(invoice.due_at)],
  ];
  pdf.setFontSize(9);
  metaRows.forEach(([label, value], index) => {
    const colW = contentW / 4;
    const x = margin + index * colW;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, x, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(15, 23, 42);
    pdf.text(pdf.splitTextToSize(value, colW - 4)[0] || value, x, y + 5);
  });
  y += 17;

  sectionTitle('Bill To');
  pdf.setTextColor(51, 65, 85);
  addWrappedText(context.customerName || 'Customer', margin, contentW, 10, 5);
  if (context.customerAddress || context.serviceLabel) {
    addWrappedText(context.serviceLabel || context.customerAddress || '', margin, contentW, 10, 5);
  }

  if (invoice.scope) {
    sectionTitle('Description');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(invoice.scope, margin, contentW, 10, 5);
  }

  sectionTitle('Line Items');
  const lines = [...(invoice.line_items || [])].sort((a, b) => a.sort_order - b.sort_order);
  const totals = persistedFinancialBreakdown(invoice);
  const invoiceUnpricedCount = unpricedLineCount(lines);
  addPageIfNeeded(10);
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin, y - 4, contentW, 9, 1.5, 1.5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(51, 65, 85);
  pdf.text('Description', margin + 3, y);
  pdf.text('Qty', pageW - margin - 72, y, { align: 'right' });
  pdf.text('Unit', pageW - margin - 54, y, { align: 'right' });
  pdf.text('Unit price', pageW - margin - 25, y, { align: 'right' });
  pdf.text('Total', pageW - margin - 3, y, { align: 'right' });
  y += 10;

  if (lines.length === 0) {
    addWrappedText('No line items were listed for this invoice.', margin, contentW, 10, 5);
  } else {
    lines.forEach(line => {
      const descriptionLines = pdf.splitTextToSize(
        [lineDisplayTitle(line), ...customerLineDisplayDetailRows(line, invoice)].join('\n'),
        contentW - 88,
      );
      const rowH = Math.max(12, descriptionLines.length * 4 + 7);
      addPageIfNeeded(rowH);
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y - 3, pageW - margin, y - 3);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(15, 23, 42);
      pdf.text(descriptionLines, margin + 3, y);
      pdf.setTextColor(71, 85, 105);
      pdf.text(String(line.quantity), pageW - margin - 72, y, { align: 'right' });
      pdf.text(line.unit || 'each', pageW - margin - 54, y, { align: 'right' });
      pdf.text(persistedLinePriceLabel(line), pageW - margin - 25, y, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text(persistedLineTotalLabel(line), pageW - margin - 3, y, { align: 'right' });
      y += rowH;
    });
  }

  if (invoiceUnpricedCount > 0) {
    addPageIfNeeded(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(146, 64, 14);
    addWrappedText('Invoice total does not include items marked "Price to be confirmed."', margin, contentW, 9, 4);
  }

  addPageIfNeeded(42);
  pdf.setDrawColor(226, 232, 240);
  pdf.line(pageW - margin - 62, y, pageW - margin, y);
  y += 7;
  moneyRow('Material total', totals.materialTotalCents);
  moneyRow('Labor total', totals.laborTotalCents, false);
  if (totals.laborHours > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${formatLaborHours(totals.laborHours)} labor hrs`, pageW - margin - 58, y - 2);
  }
  moneyRow('Subtotal', totals.subtotalCents);
  moneyRow('Fees', totals.feeTotalCents);
  moneyRow('Tax', totals.taxCents);
  moneyRow('Discount', -invoice.discount_cents);
  moneyRow('Total', invoice.total_cents, true);
  moneyRow('Amount paid', invoice.amount_paid_cents);
  moneyRow('Balance due', balanceDue, true);

  sectionTitle('Payment Instructions');
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(51, 65, 85);
  addWrappedText('Payment processing through ServSync is coming soon. Please follow the contractor payment instructions provided outside this invoice.', margin, contentW, 10, 5);

  if (invoice.notes) {
    sectionTitle('Notes');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(invoice.notes, margin, contentW, 10, 5);
  }

  if (invoice.terms) {
    sectionTitle('Terms');
    pdf.setTextColor(51, 65, 85);
    addWrappedText(invoice.terms, margin, contentW, 10, 5);
  }

  const fileName = `${safeFileName(`${context.contractorName}-invoice-${invoice.invoice_number || invoice.title || invoice.id}`)}.pdf`;
  return { blob: pdf.output('blob'), fileName };
}

export async function downloadInvoicePdf(invoice: Invoice, context: InvoicePdfContext) {
  const { blob, fileName } = await createInvoicePdf(invoice, context);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

