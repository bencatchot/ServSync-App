import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appPath = resolve(process.cwd(), 'src/App.tsx');
const actionFeedbackPath = resolve(process.cwd(), 'src/features/feedback/ActionFeedback.tsx');
const corePresentationPath = resolve(process.cwd(), 'src/features/presentation/CorePresentation.tsx');
const presentationFeedbackPath = resolve(process.cwd(), 'src/features/presentation/presentationFeedback.ts');

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
    const noticeSource = read(corePresentationPath);
    const feedbackSource = read(presentationFeedbackPath);

    expect(app).toContain('type NoticeContent');
    expect(noticeSource).toContain('<ActionFeedback');
    expect(noticeSource).toContain('compact');
    expect(feedbackSource).toContain('actionFeedbackMessage');
    expect(`${noticeSource}\n${feedbackSource}`).not.toMatch(/createPortal|Toast|toast|NotificationProvider|localStorage|sessionStorage|setTimeout/);
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
    expect(agreementSource).toContain("'Service plan accepted'");
    expect(agreementSource).toContain('Scheduling and billing still happen separately with the contractor.');
    expect(appointmentSource).toContain("'New time suggested'");
    expect(appointmentSource).toContain('The contractor still needs to confirm before the appointment changes.');
    expect(appointmentSource).toContain("'Visit time confirmed'");

    expect(requestSource).toContain('saveServiceRequestDurably');
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
    const agreementSource = sourceBetween(app, 'const saveServiceAgreementOfferDraft = async', 'const requirePriceBookImportAccess = () => {');
    const reportSource = sourceBetween(app, 'const finalizeInspection = async', 'const deleteInspection = async');

    expect(estimateSaveSource).toContain("'Draft estimate saved'");
    expect(estimateSaveSource).toContain('It has not been sent to the homeowner.');
    expect(estimateSendSource).toContain("'Estimate sent'");
    expect(estimateSendSource).toContain('The homeowner can now review and respond to it.');
    expect(invoiceSource).toContain("'Draft invoice saved'");
    expect(invoiceSource).toContain('It remains private until you send it to the homeowner.');
    expect(invoiceSource).toContain("'Invoice sent'");
    expect(invoiceSource).toContain('Online payment appears only when the contractor has completed Stripe test setup; offline payment remains available.');
    expect(invoiceSource).toContain("'Invoice paid'");
    expect(invoiceSource).toContain('ServSync recorded an offline payment and did not process money.');
    expect(invoiceSource).toContain("'Invoice voided'");
    expect(jobCreateSource).toContain("'Job created'");
    expect(homeMapSource).toContain("'Home Map update submitted'");
    expect(homeMapSource).toContain('The permanent Home Map is unchanged until they approve it.');
    expect(homeMapSource).toContain("'Home Map update revoked'");
    expect(agreementSource).toContain("'Draft service plan saved'");
    expect(agreementSource).toContain("'Service plan offer sent'");
    expect(reportSource).toContain("'Report finalized'");
    expect(reportSource).toContain("'Report sent'");
    expect(reportSource).toContain("'Job completed'");

    expect(invoiceSource).toContain("supabase.rpc('servsync_send_invoice'");
    expect(invoiceSource).toContain("supabase.rpc('servsync_record_offline_invoice_payment'");
    expect(invoiceSource).toContain("supabase.rpc('servsync_void_invoice'");
    expect(homeMapSource).toContain("supabase.rpc('servsync_submit_home_map_draft'");
    expect(homeMapSource).toContain("supabase.rpc('servsync_revoke_home_map_draft'");
    expect(reportSource).toContain('finalizeJobReportDurably');
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

  test('action feedback remains presentation-only and free of later workflow authority', () => {
    const app = read(appPath);
    const feedback = read(actionFeedbackPath);

    expect(app).toContain('<EmptyState text="No requests match that search." compact />');
    expect(app).toContain("import { FilterSummary } from './features/search/FilterSummary';");
    expect(app).not.toMatch(/Quick Duplicate Job|Project Activity Feed|Bundle 5|Stripe checkout|Pay Now/);
    expect(feedback).not.toMatch(/CREATE POLICY|ALTER TABLE|CREATE FUNCTION|SECURITY DEFINER|rpc definition/i);
  });
});
