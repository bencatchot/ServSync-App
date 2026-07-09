import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const pdfDocumentsSource = () => sourceFile('src/utils/pdfDocuments.ts');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('homeowner estimate payment schedule display', () => {
  test('homeowner estimate review renders structured payment schedules only in expanded details', () => {
    const source = appSource();
    const cardSource = sourceBetween(source, 'const renderHomeownerEstimateCard =', 'const renderHomeownerRecordsSection =');

    expect(source).toContain('payment_schedule_items:estimate_payment_schedule_items(*)');
    expect(source).toContain('const paymentScheduleRows = sortedEstimatePaymentScheduleRows(estimate);');
    expect(cardSource.indexOf('{isOpen && (')).toBeLessThan(cardSource.indexOf('data-testid="homeowner-estimate-payment-schedule"'));
    expect(cardSource).toContain('paymentScheduleRows.length > 0 && (');
    expect(cardSource).toContain('data-testid="homeowner-estimate-payment-schedule"');
    expect(cardSource).toContain('Payment Schedule');
    expect(cardSource).toContain('These payment terms are part of the estimate your contractor sent.');
    expect(cardSource).toContain('Schedule total');
    expect(cardSource).toContain('paymentScheduleRows.map(row =>');
    expect(cardSource).toContain("row.label?.trim() || estimatePaymentScheduleInvoiceTypeCustomerLabel(row.invoice_type)");
    expect(cardSource).toContain("row.due_trigger?.trim() || 'Due date to be confirmed'");
    expect(cardSource).toContain('formatMoney(row.calculated_amount_cents)');
  });

  test('homeowner schedule helpers sort rows and keep warning copy display-only', () => {
    const source = appSource();
    const helperSource = sourceBetween(source, 'function estimatePaymentScheduleInvoiceTypeCustomerLabel', 'function createBlankSavedEstimateChargeDraft');
    const cardSource = sourceBetween(source, 'const renderHomeownerEstimateCard =', 'const renderHomeownerRecordsSection =');

    expect(helperSource).toContain("case 'total':");
    expect(helperSource).toContain("return 'Total invoice';");
    expect(helperSource).toContain("case 'deposit':");
    expect(helperSource).toContain("return 'Deposit invoice';");
    expect(helperSource).toContain("case 'progress':");
    expect(helperSource).toContain("return 'Progress invoice';");
    expect(helperSource).toContain("case 'final':");
    expect(helperSource).toContain("return 'Final invoice';");
    expect(helperSource).toContain("return 'Scheduled invoice';");
    expect(helperSource).toContain('sort((a, b) => a.sort_order - b.sort_order)');
    expect(helperSource).toContain('This payment schedule total is above the estimate total. Ask your contractor to correct it before approving.');
    expect(helperSource).toContain('This payment schedule total does not match the estimate total. Ask your contractor to confirm before approving.');
    expect(source).not.toContain('servsync_create_invoice_from_schedule');
    expect(source).not.toContain('beginInvoiceDraftFromPaymentSchedule');
  });

  test('accept copy mentions schedules only when rows exist and Terms/PDF wording stay compatible', () => {
    const source = appSource();
    const pdfSource = pdfDocumentsSource();
    const cardSource = sourceBetween(source, 'const renderHomeownerEstimateCard =', 'const renderHomeownerRecordsSection =');

    expect(cardSource).toContain('paymentScheduleRows.length > 0 && (');
    expect(cardSource).toContain('By approving, you accept the estimate scope, total, and payment schedule.');
    expect(cardSource).toContain('<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>');
    expect(pdfSource).toContain("sectionTitle('Payment Schedule')");
    expect(pdfSource).toContain('paymentScheduleInvoiceTypeLabel(row.invoice_type)');
    expect(pdfSource).toContain('formatMoney(row.calculated_amount_cents)');
    expect(pdfSource).toContain("row.due_trigger?.trim() || 'Due date to be confirmed'");
    expect(pdfSource).toContain("sectionTitle('Terms')");
  });

  test('contractor schedule editor remains the source of schedule rows', () => {
    const source = appSource();
    const contractorScheduleSource = sourceBetween(source, 'const renderEstimatePaymentScheduleEditor =', 'const renderInvoiceDraftTotals =');
    const saveSource = sourceBetween(source, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');

    expect(contractorScheduleSource).toContain('Full invoice on completion');
    expect(contractorScheduleSource).toContain('Deposit + final');
    expect(contractorScheduleSource).toContain('Custom schedule');
    expect(saveSource).toContain(".from('estimate_payment_schedule_items')");
    expect(saveSource).toContain('.insert(scheduleForSave.rows.map(row => ({');
  });
});
