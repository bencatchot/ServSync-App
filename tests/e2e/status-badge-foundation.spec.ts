import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Status badge foundation', () => {
  test('defines canonical core status labels and tones with safe fallback behavior', () => {
    const source = sourceFile('src/features/status/statusPresentation.ts');

    expect(source).toContain("export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'violet'");
    expect(source).toContain("draft: { label: 'Draft', tone: 'neutral' }");
    expect(source).toContain("sent: { label: 'Sent', tone: 'info' }");
    expect(source).toContain("accepted: { label: 'Accepted', tone: 'success' }");
    expect(source).toContain("draft: { label: 'Planning', tone: 'neutral' }");
    expect(source).toContain("in_progress: { label: 'In Progress', tone: 'warning' }");
    expect(source).toContain("partially_paid: { label: 'Partially Paid', tone: 'warning' }");
    expect(source).toContain("contractor_responded: { label: 'Responded', tone: 'violet' }");
    expect(source).toContain("homeowner_replied: { label: 'Homeowner Replied', tone: 'warning' }");
    expect(source).toContain("return presentations[status as InvoiceStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };");
    expect(source).toContain("replace(/[_-]+/g, ' ')");
    expect(source).not.toContain('Sent to homeowner');
    expect(source).not.toContain('toLocaleDateString');
    expect(source).not.toContain('formatDateTime');
  });

  test('renders non-interactive text badges with optional decorative icons', () => {
    const source = sourceFile('src/features/status/StatusBadge.tsx');

    expect(source).toContain('export function StatusBadge');
    expect(source).toContain('label, tone, icon');
    expect(source).toContain('inline-flex max-w-full items-center gap-1 rounded-full border font-semibold');
    expect(source).toContain('statusToneClass(tone)');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('<span className="min-w-0 whitespace-normal break-words">{label}</span>');
    expect(source).not.toContain('tabIndex');
    expect(source).not.toContain('onClick');
    expect(source).not.toContain('truncate');
  });

  test('keeps existing feature helper signatures while delegating to shared presentation mappings', () => {
    const estimates = sourceFile('src/features/estimates/status.ts');
    const jobs = sourceFile('src/features/jobs/status.ts');
    const invoices = sourceFile('src/features/invoices/status.ts');
    const requests = sourceFile('src/features/requests/status.ts');

    expect(estimates).toContain('export function estimateStatusLabel');
    expect(estimates).toContain('return estimateStatusPresentation(status).label;');
    expect(estimates).toContain('return statusToneClass(estimateStatusPresentation(status).tone);');
    expect(jobs).toContain('export function inspectionJobStatusLabel');
    expect(jobs).toContain('return jobStatusPresentation(inspectionJobStatus(work)).label;');
    expect(jobs).toContain('return statusToneClass(jobStatusPresentation(inspectionJobStatus(work)).tone);');
    expect(invoices).toContain('export function invoiceStatusLabel');
    expect(invoices).toContain('return invoiceStatusPresentation(status).label;');
    expect(invoices).toContain('return statusToneClass(invoiceStatusPresentation(status).tone);');
    expect(requests).toContain('export function serviceRequestStatusLabel');
    expect(requests).toContain('return requestStatusPresentation(status).label;');
    expect(requests).toContain('return statusToneClass(requestStatusPresentation(status).tone);');

    expect(invoices).not.toContain("status.replace(/_/g, ' ')");
    expect(jobs).not.toContain("in_progress: 'In progress'");
  });

  test('migrates primary homeowner and contractor core surfaces to StatusBadge', () => {
    const source = sourceFile('src/App.tsx');

    expect(source).toContain("import { StatusBadge } from './features/status/StatusBadge';");
    expect(source).toContain('estimateStatusPresentation');
    expect(source).toContain('invoiceStatusPresentation');
    expect(source).toContain('jobStatusPresentation');
    expect(source).toContain('requestStatusPresentation');

    expect(source).toContain('<StatusBadge {...invoiceStatusPresentation(invoice.status)} />');
    expect(source).toContain('<StatusBadge {...estimateStatusPresentation(estimate.status)} />');
    expect(source).toContain('<StatusBadge {...requestStatusPresentation(request.status)}');
    expect(source).toContain('tone={jobStatusPresentation(inspectionJobStatus(insp)).tone}');
    expect(source).toContain('tone={jobStatusPresentation(inspectionJobStatus(activeInspection)).tone}');
    expect(source).toContain('tone={rowInvoice ? invoiceStatusPresentation(rowInvoice.status).tone :');

    const homeownerInvoiceCard = sourceBetween(source, 'const renderHomeownerInvoiceCard =', 'const renderHomeownerEstimateCard =');
    const homeownerEstimateCard = sourceBetween(source, 'const renderHomeownerEstimateCard =', 'const renderHomeownerRecordsSection =');
    const contractorFinancialList = sourceBetween(source, 'data-testid="contractor-invoice-card"', 'data-testid="contractor-estimate-card"');
    const contractorEstimateList = sourceBetween(source, 'data-testid="contractor-estimate-card"', 'data-testid="contractor-job-row"');

    expect(homeownerInvoiceCard).toContain('StatusBadge');
    expect(homeownerEstimateCard).toContain('StatusBadge');
    expect(contractorFinancialList).toContain('StatusBadge');
    expect(contractorEstimateList).toContain('StatusBadge');
    expect(source).toContain('data-testid="contractor-service-request-card"');
    expect(source).toContain('<StatusBadge {...requestStatusPresentation(request.status)} className="shrink-0" />');
  });

  test('preserves presentation-only scope boundaries', () => {
    const source = sourceFile('src/App.tsx');
    const statusSource = sourceFile('src/features/status/statusPresentation.ts');

    expect(source).not.toContain('datePresentation');
    expect(statusSource).not.toContain('paid_at');
    expect(statusSource).not.toContain('amount_paid_cents');
    expect(statusSource).not.toContain('invoiceCanMarkPaid');
    expect(statusSource).not.toContain('invoiceCanVoid');
    expect(statusSource).not.toContain('serviceAgreement');
    expect(statusSource).not.toContain('Referral');
    expect(statusSource).not.toContain('Support');
    expect(statusSource).not.toContain('Project');
  });
});
