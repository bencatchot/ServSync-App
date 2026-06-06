import jsPDF from 'jspdf';
import { Customer, Finding, Photo } from '../types';
import { buildProfessionalReportSummary } from './reportSummary';

const BLUE = [37, 99, 235] as const;
const DARK = [30, 41, 59] as const;
const GRAY = [100, 116, 139] as const;
const LIGHT = [248, 250, 252] as const;
const WHITE = [255, 255, 255] as const;
const BORDER = [226, 232, 240] as const;
const GREEN_BG = [220, 252, 231] as const;
const GREEN_TEXT = [22, 163, 74] as const;

const URGENT_BG = [254, 226, 226] as const;
const URGENT_TEXT = [220, 38, 38] as const;
const REPAIR_BG = [254, 243, 199] as const;
const REPAIR_TEXT = [217, 119, 6] as const;
const MONITOR_BG = [219, 234, 254] as const;
const MONITOR_TEXT = [37, 99, 235] as const;
const PASS_BG = [220, 252, 231] as const;
const PASS_TEXT = [22, 163, 74] as const;
const FIXED_BG = [204, 251, 241] as const;
const FIXED_TEXT = [15, 118, 110] as const;

function statusColors(status: string) {
  if (status === 'Urgent') return { bg: URGENT_BG, text: URGENT_TEXT, border: URGENT_TEXT };
  if (status === 'Needs Repair') return { bg: REPAIR_BG, text: REPAIR_TEXT, border: REPAIR_TEXT };
  if (status === 'Monitor') return { bg: MONITOR_BG, text: MONITOR_TEXT, border: MONITOR_TEXT };
  if (status === 'Fixed On Site') return { bg: FIXED_BG, text: FIXED_TEXT, border: FIXED_TEXT };
  return { bg: PASS_BG, text: PASS_TEXT, border: PASS_TEXT };
}

async function loadImageAsBase64(url: string, options?: { format?: 'image/jpeg' | 'image/png'; quality?: number; background?: readonly number[] }): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(objectUrl); resolve(null); return; }
        if (options?.background) {
          ctx.fillStyle = `rgb(${options.background[0]}, ${options.background[1]}, ${options.background[2]})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(objectUrl);
        resolve({
          dataUrl: canvas.toDataURL(options?.format || 'image/jpeg', options?.quality ?? 0.85),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
      img.src = objectUrl;
    });
  } catch (err) {
    console.error('Image load failed:', err);
    return null;
  }
}

async function loadBrandLogo() {
  return loadImageAsBase64('/prevention-pros-logo.png', { format: 'image/png' });
}


function isItemPhoto(photo: Photo) {
  return photo.caption.startsWith('__item__');
}

function itemPhotoCaption(itemName: string) {
  return `__item__${itemName}`;
}

function photosForItem(roomPhotos: Photo[], finding: Finding) {
  return roomPhotos.filter(photo =>
    isItemPhoto(photo) &&
    (photo.caption === itemPhotoCaption(finding.itemKey) || photo.caption === itemPhotoCaption(finding.title))
  );
}

function getRoomLabel(room: string): string {
  return room;
}

export interface ExportedReportPdf {
  blob: Blob;
  fileName: string;
}

export async function exportReportPdf(customer: Customer, preferredFileName?: string): Promise<ExportedReportPdf> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 0;

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const brandLogo = await loadBrandLogo();

  function checkPageBreak(needed: number) {
    if (y + needed > pageH - 16) { pdf.addPage(); y = 16; }
  }

  function drawRect(x: number, yPos: number, w: number, h: number, fillColor: readonly number[], radius = 3) {
    pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    pdf.roundedRect(x, yPos, w, h, radius, radius, 'F');
  }

  function drawBorderedRect(x: number, yPos: number, w: number, h: number, fillColor: readonly number[], borderColor: readonly number[], radius = 3) {
    pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x, yPos, w, h, radius, radius, 'FD');
  }

  function text(str: string, x: number, yPos: number, color: readonly number[], size: number, style: 'normal' | 'bold' = 'normal', align: 'left' | 'center' | 'right' = 'left', maxWidth?: number) {
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.setFontSize(size);
    pdf.setFont('helvetica', style);
    if (maxWidth) {
      const lines = pdf.splitTextToSize(str, maxWidth);
      pdf.text(lines, x, yPos, { align });
    } else {
      pdf.text(str, x, yPos, { align });
    }
  }

  function badge(label: string, x: number, yPos: number, bg: readonly number[], textColor: readonly number[]) {
    const badgeW = 28;
    const badgeH = 5.5;
    drawRect(x, yPos - 4, badgeW, badgeH, bg, 2);
    text(label, x + badgeW / 2, yPos, textColor, 7, 'bold', 'center');
  }

  function sectionDivider(yPos: number) {
    pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    pdf.setLineWidth(0.2);
    pdf.line(margin, yPos, pageW - margin, yPos);
  }

  function addImageContained(image: { dataUrl: string; width: number; height: number }, x: number, yPos: number, boxW: number, boxH: number) {
    drawRect(x, yPos, boxW, boxH, [241, 245, 249], 2);
    const scale = Math.min(boxW / image.width, boxH / image.height);
    const renderW = image.width * scale;
    const renderH = image.height * scale;
    const renderX = x + (boxW - renderW) / 2;
    const renderY = yPos + (boxH - renderH) / 2;
    pdf.addImage(image.dataUrl, 'JPEG', renderX, renderY, renderW, renderH);
  }

  function addPhotosRow(photos: {url: string}[], cache: Map<string, { dataUrl: string; width: number; height: number }>) {
    if (photos.length === 0) return;
    checkPageBreak(50);
    const photoSize = 42;
    const photoGap = 3;
    const photosPerRow = 4;
    let photoX = margin;
    let photoRowY = y;
    for (let i = 0; i < photos.length; i++) {
      if (i > 0 && i % photosPerRow === 0) {
        photoRowY += photoSize + photoGap + 4;
        photoX = margin;
        checkPageBreak(photoSize + 8);
      }
      const b64 = cache.get(photos[i].url);
      if (b64) {
        try { addImageContained(b64, photoX, photoRowY, photoSize, photoSize); }
        catch { drawRect(photoX, photoRowY, photoSize, photoSize, LIGHT, 2); }
      } else {
        drawRect(photoX, photoRowY, photoSize, photoSize, LIGHT, 2);
        text('Photo', photoX + photoSize / 2, photoRowY + photoSize / 2, GRAY, 7, 'normal', 'center');
      }
      photoX += photoSize + photoGap;
    }
    y = photoRowY + photoSize + 8;
  }

  // HEADER
  drawRect(0, 0, pageW, 38, BLUE, 0);
  const headerTextX = brandLogo ? margin + 44 : margin;
  if (brandLogo) {
    drawRect(margin, 7, 36, 18, WHITE, 3);
    addImageContained(brandLogo, margin + 2, 9, 32, 14);
  }
  text('ServSync', headerTextX, 13, WHITE, 16, 'bold');
  text('Building Trust with Quality Work  ·  servsync.app', headerTextX, 20, [147, 197, 253], 8);

  const allFindings = Object.values(customer.findings).flat();
  const urgentCount = allFindings.filter(f => f.status === 'Urgent').length;
  const issueCount = allFindings.filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;

  const statusLabel = urgentCount > 0 ? `${urgentCount} URGENT` : 'ALL CLEAR';
  const statusBg = urgentCount > 0 ? URGENT_BG : PASS_BG;
  const statusTextColor = urgentCount > 0 ? URGENT_TEXT : PASS_TEXT;
  drawRect(pageW - margin - 34, 8, 34, 8, statusBg, 2);
  text(statusLabel, pageW - margin - 17, 13.5, statusTextColor, 7, 'bold', 'center');

  y = 44;

  // PROPERTY INFO
  text(customer.name, margin, y, DARK, 16, 'bold');
  y += 6;
  text(customer.address, margin, y, GRAY, 9);
  y += 5;
  text(`Prepared: ${today}`, margin, y, GRAY, 8);
  y += 8;

  const boxW = (contentW - 6) / 3;
  const boxes = [
    { label: 'Owner', value: customer.owner },
    { label: 'Service Plan', value: customer.plan },
    { label: 'Total Issues', value: `${issueCount} item${issueCount !== 1 ? 's' : ''}` },
  ];
  boxes.forEach((box, i) => {
    const bx = margin + i * (boxW + 3);
    drawBorderedRect(bx, y, boxW, 14, LIGHT, BORDER, 2);
    text(box.label.toUpperCase(), bx + 3, y + 5, GRAY, 7, 'bold');
    text(box.value, bx + 3, y + 11, DARK, 9, 'bold');
  });
  y += 20;

  sectionDivider(y);
  y += 8;

  // EXECUTIVE SUMMARY
  const professionalSummary = buildProfessionalReportSummary(customer);
  text('PROFESSIONAL SUMMARY', margin, y, GRAY, 8, 'bold');
  y += 6;
  const summaryParts = [
    professionalSummary.intro,
    professionalSummary.urgentText,
    professionalSummary.fixedText,
    professionalSummary.followUpText,
    `Potential cost savings: ${professionalSummary.savingsText} ${professionalSummary.savingsDetails.join(' ')}`,
  ];
  const summaryLines = summaryParts.flatMap(part => pdf.splitTextToSize(part, contentW - 6));
  const summaryH = Math.max(28, summaryLines.length * 4.2 + 8);
  checkPageBreak(summaryH + 4);
  drawRect(margin, y, contentW, summaryH, LIGHT, 2);
  let sy = y + 5;
  summaryParts.forEach((part, index) => {
    const isUrgentLine = index === 1 && professionalSummary.urgent.length > 0;
    const color = index === summaryParts.length - 1 ? GREEN_TEXT : isUrgentLine ? URGENT_TEXT : DARK;
    text(part, margin + 3, sy, color, 8, isUrgentLine ? 'bold' : 'normal', 'left', contentW - 6);
    sy += pdf.splitTextToSize(part, contentW - 6).length * 4.2 + 2;
  });
  y += summaryH + 6;

  // ROOM SECTIONS
  const roomsWithData = customer.rooms.filter(room => {
    const hasFindings = (customer.findings[room] || []).length > 0;
    const hasPhotos = (customer.photos[room] || []).length > 0;
    return hasFindings || hasPhotos;
  });

  // Preload all photos
  const photoCache = new Map<string, { dataUrl: string; width: number; height: number }>();
  const allPhotos = Object.values(customer.photos).flat();
  for (const photo of allPhotos) {
    const b64 = await loadImageAsBase64(photo.url);
    if (b64) photoCache.set(photo.url, b64);
  }

  if (roomsWithData.length === 0) {
    text('No findings recorded yet. Run an inspection to add items.', margin, y, GRAY, 9);
    y += 10;
  }

  for (const room of roomsWithData) {
    const allRoomFindings = customer.findings[room] || [];
    const roomFindings = allRoomFindings.filter(f => f.status !== 'Pass');
    const passFindings = allRoomFindings.filter(f => f.status === 'Pass');
    const roomPhotos = customer.photos[room] || [];
    const roomLevelPhotos = roomPhotos.filter(p => !isItemPhoto(p));
    const hasUrgent = roomFindings.some(f => f.status === 'Urgent');

    checkPageBreak(24);

    // Room header
    drawRect(margin, y, contentW, 12, DARK, 2);
    text(getRoomLabel(room).toUpperCase(), margin + 4, y + 8, WHITE, 10, 'bold');

    const roomBadgeLabel = hasUrgent ? 'URGENT' : roomFindings.length > 0 ? 'HAS ISSUES' : 'CLEAR';
    const roomBadgeBg = hasUrgent ? URGENT_BG : roomFindings.length > 0 ? REPAIR_BG : PASS_BG;
    const roomBadgeText = hasUrgent ? URGENT_TEXT : roomFindings.length > 0 ? REPAIR_TEXT : PASS_TEXT;
    drawRect(pageW - margin - 30, y + 2, 30, 8, roomBadgeBg, 2);
    text(roomBadgeLabel, pageW - margin - 15, y + 7.5, roomBadgeText, 7, 'bold', 'center');

    y += 14;
    text(
      `${allRoomFindings.length} items checked  ·  ${passFindings.length} passed  ·  ${roomFindings.filter(f => f.status === 'Fixed On Site').length} fixed  ·  ${roomFindings.filter(f => f.status !== 'Fixed On Site').length} open`,
      margin, y, GRAY, 8
    );
    y += 7;

    // Room-level photos
    if (roomLevelPhotos.length > 0) {
      text('ROOM PHOTOS', margin, y, GRAY, 7, 'bold');
      y += 5;
      addPhotosRow(roomLevelPhotos, photoCache);
    }

    // Issues with item photos
    if (roomFindings.length > 0) {
      text('FINDINGS & ACTIONS', margin, y, GRAY, 7, 'bold');
      y += 5;

      for (const f of roomFindings) {
        const cols = statusColors(f.status);
        const itemPhotos = photosForItem(roomPhotos, f);
        const descLines = f.description ? pdf.splitTextToSize(f.description, contentW - 10).length : 0;
        const actionLines = f.action ? pdf.splitTextToSize(f.action, contentW - 10).length : 0;
        const photoH = itemPhotos.length > 0 ? 50 : 0;
        const findingH = 10 + photoH + (descLines * 4.5) + (actionLines * 4.5) + (f.due ? 5 : 0) + 8;
        checkPageBreak(findingH);

        pdf.setFillColor(cols.border[0], cols.border[1], cols.border[2]);
        pdf.rect(margin, y, 2, findingH, 'F');
        drawRect(margin + 2, y, contentW - 2, findingH, LIGHT, 0);

        text(f.title, margin + 6, y + 6, DARK, 9, 'bold', 'left', contentW - 40);
        badge(f.status, pageW - margin - 30, y + 6, cols.bg, cols.text);

        let fy = y + 12;

        // Item photos under this finding
        if (itemPhotos.length > 0) {
          const photoSize = 38;
          const photoGap = 3;
          let photoX = margin + 6;
          for (let i = 0; i < Math.min(itemPhotos.length, 4); i++) {
            const b64 = photoCache.get(itemPhotos[i].url);
            if (b64) {
              try { addImageContained(b64, photoX, fy, photoSize, photoSize); }
              catch { drawRect(photoX, fy, photoSize, photoSize, BORDER, 2); }
            } else {
              drawRect(photoX, fy, photoSize, photoSize, BORDER, 2);
            }
            photoX += photoSize + photoGap;
          }
          fy += photoSize + 4;
        }

        if (f.description) {
          text('Observed:', margin + 6, fy, GRAY, 7, 'bold');
          fy += 4;
          text(f.description, margin + 6, fy, DARK, 8, 'normal', 'left', contentW - 10);
          fy += pdf.splitTextToSize(f.description, contentW - 10).length * 4.5;
        }

        if (f.action) {
          text(f.status === 'Fixed On Site' ? 'Action Taken:' : 'Action:', margin + 6, fy, BLUE, 7, 'bold');
          fy += 4;
          text(f.action, margin + 6, fy, BLUE, 8, 'normal', 'left', contentW - 10);
          fy += pdf.splitTextToSize(f.action, contentW - 10).length * 4.5;
        }

        if (f.due) {
          text(`Follow-up: ${f.due}`, margin + 6, fy, GRAY, 7);
          fy += 5;
        }

        y += findingH + 3;
      }
    }

    // Passed items with the same card treatment as issues
    if (passFindings.length > 0) {
      checkPageBreak(10);
      text('PASSED ITEMS', margin, y, GRAY, 7, 'bold');
      y += 5;

      for (const f of passFindings) {
        const cols = statusColors(f.status);
        const itemPhotos = photosForItem(roomPhotos, f);
        const descLines = f.description ? pdf.splitTextToSize(f.description, contentW - 10).length : 0;
        const photoRows = itemPhotos.length > 0 ? Math.ceil(Math.min(itemPhotos.length, 4) / 4) : 0;
        const photoH = photoRows > 0 ? 42 : 0;
        const findingH = 10 + photoH + (descLines * 4.5) + (f.due ? 5 : 0) + 8;
        checkPageBreak(findingH);

        pdf.setFillColor(cols.border[0], cols.border[1], cols.border[2]);
        pdf.rect(margin, y, 2, findingH, 'F');
        drawRect(margin + 2, y, contentW - 2, findingH, LIGHT, 0);

        text(f.title, margin + 6, y + 6, DARK, 9, 'bold', 'left', contentW - 40);
        badge(f.status, pageW - margin - 30, y + 6, cols.bg, cols.text);

        let fy = y + 12;

        if (f.description) {
          text('Observed:', margin + 6, fy, GRAY, 7, 'bold');
          fy += 4;
          text(f.description, margin + 6, fy, DARK, 8, 'normal', 'left', contentW - 10);
          fy += pdf.splitTextToSize(f.description, contentW - 10).length * 4.5;
        }

        if (f.due) {
          text(`Follow-up: ${f.due}`, margin + 6, fy, GRAY, 7);
          fy += 5;
        }

        if (itemPhotos.length > 0) {
          const photoSize = 38;
          const photoGap = 3;
          let photoX = margin + 6;
          for (let i = 0; i < Math.min(itemPhotos.length, 4); i++) {
            const b64 = photoCache.get(itemPhotos[i].url);
            if (b64) {
              try { addImageContained(b64, photoX, fy, photoSize, photoSize); }
              catch { drawRect(photoX, fy, photoSize, photoSize, BORDER, 2); }
            } else {
              drawRect(photoX, fy, photoSize, photoSize, BORDER, 2);
            }
            photoX += photoSize + photoGap;
          }
        }

        y += findingH + 3;
      }
    }

    y += 4;
    sectionDivider(y);
    y += 8;
  }

  // FOOTER / REPORT DISCLAIMER
  checkPageBreak(28);
  drawRect(margin, pageH - 28, contentW, 10, LIGHT, 2);
  text('This report is based on a limited visual maintenance inspection of accessible areas at the time of service. It is not a code inspection, engineering report, environmental inspection, pest inspection, or guarantee of hidden conditions. Urgent items should be addressed promptly by the appropriate qualified professional.', margin + 2, pageH - 24, GRAY, 6.2, 'normal', 'left', contentW - 4);
  drawRect(0, pageH - 14, pageW, 14, DARK, 0);
  text('ServSync  ·  servsync.app  ·  Building Trust with Quality Work', pageW / 2, pageH - 6, [148, 163, 184], 7, 'normal', 'center');

  const safeName = customer.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = preferredFileName || `${safeName}-Report-${dateStr}.pdf`;
  const blob = pdf.output('blob');
  pdf.save(fileName);
  return { blob, fileName };
}