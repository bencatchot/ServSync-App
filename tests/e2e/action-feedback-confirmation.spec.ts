import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appPath = resolve(process.cwd(), 'src/App.tsx');
const actionFeedbackPath = resolve(process.cwd(), 'src/features/feedback/ActionFeedback.tsx');

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

function changedFiles() {
  const branchDiff = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const workingTreeDiff = execFileSync('git', ['diff', '--name-only'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return Array.from(new Set(`${branchDiff}\n${workingTreeDiff}\n${untracked}`
    .split('\n')
    .map(file => file.trim())
    .filter(Boolean)));
}

test.describe('Bundle 4A action feedback and confirmation', () => {
  test('ActionFeedback supports visible, dismissible, mobile-safe feedback without data behavior', () => {
    const source = read(actionFeedbackPath);

    expect(source).toContain("export type ActionFeedbackTone = 'success' | 'error' | 'warning' | 'info'");
    expect(source).toContain('action?: ReactNode');
    expect(source).toContain('{action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}');
    expect(source).toContain('onDismiss?: () => void');
    expect(source).toContain('compact?: boolean');
    expect(source).toContain('data-testid={testId}');
    expect(source).toContain("role={isError ? 'alert' : 'status'}");
    expect(source).toContain("aria-live={isError ? 'assertive' : 'polite'}");
    expect(source).toContain('aria-label="Dismiss action feedback"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('min-w-0');
    expect(source).not.toMatch(/supabase|rpc\(|from\(|insert|update|delete|useNavigate|appRoute|permission|localStorage|sessionStorage|setTimeout/);
    expect(source).not.toMatch(/autoFocus|tabIndex|createPortal/);
  });

  test('App Notice delegates to ActionFeedback without creating a global toast manager', () => {
    const app = read(appPath);
    const noticeSource = sourceBetween(app, 'type NoticeContent = string | ActionFeedbackMessage;', 'const CALENDAR_EVENT_TYPE_OPTIONS');

    expect(app).toContain("import { ActionFeedback, type ActionFeedbackMessage, type ActionFeedbackTone } from './features/feedback/ActionFeedback';");
    expect(noticeSource).toContain('<ActionFeedback');
    expect(noticeSource).toContain('compact');
    expect(noticeSource).toContain('actionFeedbackMessage');
    expect(noticeSource).not.toMatch(/createPortal|Toast|toast|NotificationProvider|localStorage|sessionStorage|setTimeout/);
  });

  test('selected homeowner actions use outcome-specific feedback without workflow promises', () => {
    const app = read(appPath);
    const connectionSource = sourceBetween(app, 'const submitContextualConnectionRequest = async', 'const saveActiveSharedProperties = async');
    const requestSource = sourceBetween(app, 'const createServiceRequest = async', 'const updateHomeownerServiceRequest = async');
    const estimateSource = sourceBetween(app, 'const respondToEstimate = async', 'const respondToServiceAgreementOffer = async');
    const agreementSource = sourceBetween(app, 'const respondToServiceAgreementOffer = async', 'const viewHomeownerInvoice = async');
    const appointmentSource = sourceBetween(app, 'const respondToAppointment = async', 'const reopenRequest = async');

    expect(connectionSource).toContain("'Connection request sent'");
    expect(connectionSource).toContain('They need to accept before shared-home permissions are active.');
    expect(requestSource).toContain("'Service request submitted'");
    expect(requestSource).toContain('No response time is guaranteed.');
    expect(estimateSource).toContain("'Estimate accepted'");
    expect(estimateSource).toContain("'Estimate response could not be saved'");
    expect(agreementSource).toContain("'Service agreement accepted'");
    expect(agreementSource).toContain('Scheduling and billing still happen separately with the contractor.');
    expect(appointmentSource).toContain("'New time suggested'");
    expect(appointmentSource).toContain('The contractor still needs to confirm before the appointment changes.');
    expect(appointmentSource).toContain("'Visit time confirmed'");

    expect(requestSource).toContain("supabase.rpc('servsync_create_service_request'");
    expect(estimateSource).toContain("supabase.rpc('servsync_homeowner_respond_to_estimate'");
    expect(agreementSource).toContain("supabase.rpc('servsync_homeowner_respond_to_service_agreement_offer'");
    expect(appointmentSource).toContain("supabase.rpc('servsync_homeowner_respond_to_appointment'");
    expect(appointmentSource).toContain("supabase.rpc('servsync_accept_service_request_appointment_window'");
  });

  test('selected contractor actions distinguish draft, sent, paid, voided, finalized, and completed outcomes', () => {
    const app = read(appPath);
    const estimateSaveSource = sourceBetween(app, 'const saveEstimateDraft = async', 'const saveInvoiceDraft = async');
    const invoiceSource = sourceBetween(app, 'const saveInvoiceDraft = async', 'const openInvoiceRecord =');
    const estimateSendSource = sourceBetween(app, 'const sendEstimateToHomeowner = async', 'const createJobFromAcceptedEstimate = async');
    const jobCreateSource = sourceBetween(app, 'const createJobFromAcceptedEstimate = async', 'const openSaveEstimateTemplateModal =');
    const homeMapSource = sourceBetween(app, 'const submitContractorHomeMapDraft = async', 'const proposeAppointmentWindows = async');
    const agreementSource = sourceBetween(app, 'const saveServiceAgreementOfferDraft = async', 'const importContractorPriceBookCsvRows = async');
    const reportSource = sourceBetween(app, 'const finalizeInspection = async', 'const deleteInspection = async');

    expect(estimateSaveSource).toContain("'Draft estimate saved'");
    expect(estimateSaveSource).toContain('It has not been sent to the homeowner.');
    expect(estimateSendSource).toContain("'Estimate sent'");
    expect(estimateSendSource).toContain('The homeowner can now review and respond to it.');
    expect(invoiceSource).toContain("'Draft invoice saved'");
    expect(invoiceSource).toContain('It remains private until you send it to the homeowner.');
    expect(invoiceSource).toContain("'Invoice sent'");
    expect(invoiceSource).toContain('Payment is handled directly with the contractor.');
    expect(invoiceSource).toContain("'Invoice marked paid'");
    expect(invoiceSource).toContain('ServSync did not process a payment.');
    expect(invoiceSource).toContain("'Invoice voided'");
    expect(jobCreateSource).toContain("'Job created'");
    expect(homeMapSource).toContain("'Home Map update submitted'");
    expect(homeMapSource).toContain('The permanent Home Map is unchanged until they approve it.');
    expect(homeMapSource).toContain("'Home Map update revoked'");
    expect(agreementSource).toContain("'Draft service agreement saved'");
    expect(agreementSource).toContain("'Service agreement offer sent'");
    expect(reportSource).toContain("'Report finalized'");
    expect(reportSource).toContain("'Report sent'");
    expect(reportSource).toContain("'Job completed'");

    expect(invoiceSource).toContain("supabase.rpc('servsync_send_invoice'");
    expect(invoiceSource).toContain("supabase.rpc('servsync_mark_invoice_paid'");
    expect(invoiceSource).toContain("supabase.rpc('servsync_void_invoice'");
    expect(homeMapSource).toContain("supabase.rpc('servsync_submit_home_map_draft'");
    expect(homeMapSource).toContain("supabase.rpc('servsync_revoke_home_map_draft'");
    expect(reportSource).toContain("supabase.rpc('servsync_finalize_field_work'");
    expect(reportSource).toContain("supabase.rpc('servsync_notify_field_work_report'");
  });

  test('feedback lifecycle and scope stay local to existing notice state', () => {
    const app = read(appPath);
    const contractorNoticeState = sourceBetween(app, "const [notice, setNotice] = useState<NoticeContent | ''>", 'const shouldAutoFocusEstimateLine');

    expect(contractorNoticeState).toContain('setNotice(current => current === notice ?');
    expect(app).toContain("setNotice('');");
    expect(app).toContain("setError('');");
    expect(app).not.toMatch(/ActionFeedback[\s\S]{0,200}localStorage|ActionFeedback[\s\S]{0,200}sessionStorage/);
    expect(app).not.toMatch(/createPortal|ToastProvider|enqueueToast|notificationQueue/);
  });

  test('Bundle 4A does not start search/filter, routing, backend, payment, PDF, or later-bundle work', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/features/feedback/ActionFeedback.tsx',
      'src/features/search/FilterSummary.tsx',
      'tests/e2e/action-feedback-confirmation.spec.ts',
      'tests/e2e/search-filter-recovery.spec.ts',
      'tests/e2e/empty-state-foundation.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'tests/e2e/contractor-home-map-drafts-ui.spec.ts',
      'tests/e2e/service-report-homemap-notices.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
    ]);
    const app = read(appPath);

    expect(files.length, 'Bundle 4A should have changed files').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for Bundle 4A`).toBe(true);
    }

    expect(files.some(file => file.endsWith('.sql'))).toBe(false);
    expect(files.some(file => file.includes('supabase/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => file.includes('pdfDocuments'))).toBe(false);

    expect(app).toContain('<EmptyState text="No requests match that search." compact />');
    expect(app).toContain("import { FilterSummary } from './features/search/FilterSummary';");
    expect(app).not.toMatch(/Quick Duplicate Job|Project Activity Feed|Bundle 5|Stripe checkout|Pay Now/);
    expect(app).not.toMatch(/CREATE POLICY|ALTER TABLE|CREATE FUNCTION|SECURITY DEFINER|rpc definition/i);
  });
});
