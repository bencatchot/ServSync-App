import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appPath = resolve(process.cwd(), 'src/App.tsx');
const draftNoticePath = resolve(process.cwd(), 'src/features/drafts/DraftNotice.tsx');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Bundle 3B-1 draft clarity notices', () => {
  test('DraftNotice stays presentation-only and mobile-safe', () => {
    const source = read(draftNoticePath);

    expect(source).toContain("type DraftNoticeVariant = 'standard' | 'compact'");
    expect(source).toContain('title: ReactNode');
    expect(source).toContain('body: ReactNode');
    expect(source).toContain('action?: ReactNode');
    expect(source).toContain('testId?: string');
    expect(source).toContain('data-testid={testId}');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('break-words');
    expect(source).toContain("isCompact ? 'px-3 py-2' : 'px-3 py-3'");
    expect(source).not.toMatch(/supabase|rpc\(|from\(|insert|update|delete|useNavigate|appRoute|permission|status ===|localStorage|sessionStorage/);
    expect(source).not.toMatch(/role="alert"|tabIndex|autoFocus/);
  });

  test('estimate composer uses shared draft notice while keeping copied-price and dirty-state boundaries separate', () => {
    const app = read(appPath);
    const estimateNoticeSource = sourceBetween(app, 'const renderEstimateDraftStateNotice = () => (', 'const renderInvoiceDraftStateNotice = () => (');
    const savedItemPickerSource = sourceBetween(app, 'const renderEstimateSavedItemPicker = () => {', 'const renderEstimateLineItemSources =');
    const estimateComposerSource = sourceBetween(app, '{estimateComposerOpen && selectedJobsCustomerName && (', '{invoiceComposerOpen && selectedJobsCustomerName && (');

    expect(app).toContain("import { DraftNotice } from './features/drafts/DraftNotice';");
    expect(estimateNoticeSource).toContain('<DraftNotice');
    expect(estimateNoticeSource).toContain('title="Draft estimate"');
    expect(estimateNoticeSource).toContain('body="Not sent to the homeowner yet. Save the draft, then send when ready."');
    expect(estimateNoticeSource).toContain('testId="estimate-draft-state-notice"');
    expect(estimateComposerSource).toContain('{renderEstimateDraftStateNotice()}');
    expect(savedItemPickerSource).toContain('Copied price — review before sending.');
    expect(estimateNoticeSource).not.toMatch(/unsaved|all changes saved|autosaved|last saved|saved just now|dirty/i);
  });

  test('estimate schedule copy reflects draft invoice creation without changing schedule behavior', () => {
    const app = read(appPath);
    const scheduleSource = sourceBetween(app, 'const renderEstimatePaymentScheduleEditor =', 'const renderInvoiceDraftTotals =');
    const scheduleInvoiceHandler = sourceBetween(app, 'const createInvoiceFromEstimateScheduleItem = async', 'const renderContractorEstimatePaymentScheduleSection');

    expect(scheduleSource).toContain('After homeowner approval, accepted schedule items can be used to create draft invoices; creating a draft does not send it automatically.');
    expect(scheduleSource).not.toContain('Customer-facing display and invoice generation will be added in a later step.');
    expect(scheduleInvoiceHandler).toContain("supabase.rpc('servsync_create_invoice_from_estimate_schedule_item'");
    expect(scheduleInvoiceHandler).not.toContain(".from('invoices')");
    expect(scheduleInvoiceHandler).not.toContain('sendInvoiceToHomeowner');
  });

  test('invoice composer uses draft notice and separates save-draft from send visibility action', () => {
    const app = read(appPath);
    const invoiceNoticeSource = sourceBetween(app, 'const renderInvoiceDraftStateNotice = () => (', 'const renderEstimateDraftTotals = () => {');
    const invoiceComposerSource = sourceBetween(app, '{invoiceComposerOpen && selectedJobsCustomerName && (', "{contractorJobsView === 'templates' && (");
    const invoiceActionsSource = sourceBetween(invoiceComposerSource, '<div className="mt-4 flex flex-wrap gap-2">', '{invoiceDraft.job_id && (');

    expect(invoiceNoticeSource).toContain('<DraftNotice');
    expect(invoiceNoticeSource).toContain('title="Draft invoice"');
    expect(invoiceNoticeSource).toContain('body="Not sent to the homeowner yet. Save the draft, then send when ready."');
    expect(invoiceNoticeSource).toContain('testId="invoice-draft-state-notice"');
    expect(invoiceComposerSource).toContain('{renderInvoiceDraftStateNotice()}');
    expect(invoiceActionsSource).toContain("editingInvoiceId ? 'Update draft invoice' : 'Save draft invoice'");
    expect(invoiceActionsSource).toContain("? 'Send to homeowner'");
    expect(invoiceActionsSource).not.toContain('Save Invoice');
    expect(invoiceActionsSource).not.toMatch(/Pay Now|Stripe|payment method|payment history/i);
    expect(invoiceNoticeSource).not.toMatch(/unsaved|all changes saved|autosaved|last saved|saved just now|dirty/i);
  });

  test('privacy and scope boundaries remain source-enforced', () => {
    const app = read(appPath);
    const homeownerEstimateFetch = sourceBetween(app, 'const loadHomeowner = useCallback(async', 'useEffect(() => {\n    void loadHomeowner();');
    const invoiceSaveSource = sourceBetween(app, 'const saveInvoiceDraft = async', 'const sendInvoiceToHomeowner = async');

    expect(homeownerEstimateFetch).toContain(".neq('status', 'draft')");
    expect(invoiceSaveSource).toContain("status: 'draft'");
    expect(invoiceSaveSource).not.toContain('sendInvoiceToHomeowner');
    expect(app).toContain('title="Draft service agreement"');
    expect(app).toContain('title="Draft report"');
    expect(app).toContain('title="Draft Home Map update"');
    expect(app).not.toMatch(/DraftNotice[\s\S]{0,160}(Sent to homeowner|Active agreement|Accepted|Declined|Expired|Withdrawn|Closed for review|Report sent|Filed to Documents|Submitted for homeowner review|Approved by homeowner|Proposal revoked)/i);
    expect(app).not.toMatch(/CREATE POLICY|ALTER TABLE|CREATE FUNCTION|SECURITY DEFINER|rpc definition/i);
  });
});
