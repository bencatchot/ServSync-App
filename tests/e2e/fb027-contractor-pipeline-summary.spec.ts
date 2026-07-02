import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-027 contractor pipeline summary', () => {
  test('request follow-up remains derived from existing request, quote, and appointment state', () => {
    const source = appSource();
    const requestFollowUpSource = sourceBetween(source, 'function contractorRequestNeedsFollowUp', 'function homeownerRequestNeedsResponse');
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');

    expect(requestFollowUpSource).toContain("!['closed', 'declined'].includes(request.status)");
    expect(requestFollowUpSource).toContain("request.status === 'homeowner_replied'");
    expect(requestFollowUpSource).toContain("request.quote?.status === 'accepted'");
    expect(requestFollowUpSource).toContain("request.appointment?.status === 'proposed' && request.appointment.proposed_by === 'homeowner'");
    expect(requestFollowUpSource).not.toContain('overdue');
    expect(requestFollowUpSource).not.toContain('notification');

    expect(contractorSource).toContain('const contractorFollowUpRequests = requestPhaseServiceRequests.filter(contractorRequestNeedsFollowUp);');
    expect(contractorSource).toContain('const contractorFollowUpCount = contractorFollowUpRequests.length;');
    expect(contractorSource).toContain("label: 'Requests'");
    expect(contractorSource).toContain('count: contractorFollowUpCount');
    expect(contractorSource).toContain('setContractorTab(\'requests\')');
  });

  test('accepted estimates needing jobs use existing linked-job detection without new statuses', () => {
    const source = appSource();
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const workflowOverviewSource = sourceBetween(
      contractorSource,
      '<Card title="Workflow overview"',
      '<ContractorEntitlementStatusPanel',
    );
    const acceptedEstimateSource = sourceBetween(
      contractorSource,
      'const jobForEstimate =',
      'const invoiceAttentionRecords =',
    );

    expect(acceptedEstimateSource).toContain("insp.estimate_id === estimate.id || (estimate.inspection_id ? insp.id === estimate.inspection_id : false)");
    expect(acceptedEstimateSource).toContain("const estimateHasLinkedJob = (estimate: Pick<Estimate, 'id' | 'inspection_id'>) => Boolean(jobForEstimate(estimate) || estimate.inspection_id);");
    expect(acceptedEstimateSource).toContain("const acceptedEstimatesNeedingJobs = estimates.filter(estimate => estimate.status === 'accepted' && !estimateHasLinkedJob(estimate));");
    expect(contractorSource).toContain("label: 'Estimates / invoices'");
    expect(contractorSource).toContain('count: acceptedEstimatesNeedingJobs.length + invoiceAttentionRecords.length');
    expect(contractorSource).toContain("helper: `${acceptedEstimatesNeedingJobs.length} accepted`");
    expect(workflowOverviewSource).toContain('acceptedEstimatesNeedingJobs.length > 0');
    expect(workflowOverviewSource).toContain('Accepted estimates ready for jobs');
    expect(workflowOverviewSource).toContain('Create jobs from approved estimates in the existing Jobs workspace.');
    expect(workflowOverviewSource).toContain('{acceptedEstimatesNeedingJobs.length} need jobs');
    expect(workflowOverviewSource).toContain("setContractorTab('inspections')");
    expect(workflowOverviewSource).toContain("setContractorJobsView('open_financial')");
    expect(workflowOverviewSource).toContain("setInspectionView('list')");
    expect(workflowOverviewSource).not.toContain('createJobFromAcceptedEstimate');

    for (const unapprovedStatus of ['needs_job', 'job_needed', 'ready_for_job', 'follow_up']) {
      expect(acceptedEstimateSource).not.toContain(unapprovedStatus);
    }
  });

  test('invoice attention is status-based and does not invent overdue-by-date automation', () => {
    const source = appSource();
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const invoiceAttentionSource = sourceBetween(
      contractorSource,
      'const openInvoiceRecords =',
      'const onboardingCustomerCount =',
    );

    expect(invoiceAttentionSource).toContain("const openInvoiceRecords = invoices.filter(invoice => !['paid', 'void'].includes(invoice.status));");
    expect(invoiceAttentionSource).toContain("const invoiceAttentionRecords = openInvoiceRecords.filter(invoice => ['draft', 'overdue', 'partially_paid'].includes(invoice.status));");
    expect(contractorSource).toContain("label: 'Invoices'");
    expect(contractorSource).toContain("helper: `${invoiceAttentionRecords.length} need attention`");

    expect(invoiceAttentionSource).not.toContain('due_at');
    expect(invoiceAttentionSource).not.toContain('due_date');
    expect(invoiceAttentionSource).not.toContain('Date.now');
    expect(invoiceAttentionSource).not.toContain('new Date()');
  });

  test('completed jobs ready to invoice use existing linked-invoice and work-item billing rules', () => {
    const source = appSource();
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const completedJobInvoiceSource = sourceBetween(
      contractorSource,
      'const linkedNonVoidInvoiceForJob =',
      'const openFinancialRecords =',
    );
    const workflowOverviewSource = sourceBetween(
      contractorSource,
      '<Card title="Workflow overview"',
      '<ContractorEntitlementStatusPanel',
    );
    const jobRowSource = sourceBetween(
      contractorSource,
      'data-testid="contractor-job-row"',
      '{showLocalContactForm &&',
    );
    const jobDetailInvoiceActionSource = sourceBetween(
      contractorSource,
      'const linkedInvoiceForJob = linkedNonVoidInvoiceForJob(activeInspection);',
      'Standalone scheduling coming soon',
    );

    expect(completedJobInvoiceSource).toContain("invoice.status !== 'void'");
    expect(completedJobInvoiceSource).toContain('invoice.job_id === job.id || (job.estimate_id ? invoice.estimate_id === job.estimate_id : false)');
    expect(completedJobInvoiceSource).toContain("if (status !== 'completed' && status !== 'closed') return false;");
    expect(completedJobInvoiceSource).toContain('if (linkedNonVoidInvoiceForJob(job)) return false;');
    expect(completedJobInvoiceSource).toContain('if (jobWorkItems.length > 0) return jobWorkItems.some(jobWorkItemCanInvoice);');
    expect(completedJobInvoiceSource).toContain('const completedJobsReadyToInvoice = closedJobs.filter(jobReadyForInvoiceFollowUp);');
    expect(completedJobInvoiceSource).not.toContain('cancelled');
    expect(completedJobInvoiceSource).not.toContain('due_at');
    expect(completedJobInvoiceSource).not.toContain('Date.now');

    expect(contractorSource).toContain('+ completedJobsReadyToInvoice.length');
    expect(contractorSource).toContain("label: 'Completed jobs'");
    expect(workflowOverviewSource).toContain('completedJobsReadyToInvoice.length > 0');
    expect(workflowOverviewSource).toContain('Completed jobs ready to invoice');
    expect(workflowOverviewSource).toContain('Review recent closed jobs and create invoices from completed work.');
    expect(workflowOverviewSource).toContain('{completedJobsReadyToInvoice.length} ready');
    expect(workflowOverviewSource).toContain('onClick={openCompletedJobsReadyToInvoice}');
    expect(completedJobInvoiceSource).toContain("setContractorJobsView('closed_jobs')");
    expect(workflowOverviewSource).not.toContain('createInvoiceFromJob');
    expect(workflowOverviewSource).not.toContain('openPartialInvoiceReview');

    expect(jobRowSource).toContain('linkedInvoice ? openInvoiceRecord(linkedInvoice) : hasDurableWorkItems ? openInspection(insp) : void createInvoiceFromJob(insp)');
    expect(jobDetailInvoiceActionSource).toContain('if (linkedInvoiceForJob) openInvoiceRecord(linkedInvoiceForJob);');
    expect(jobDetailInvoiceActionSource).toContain('else if (activeJobHasDurableWorkItems) openPartialInvoiceReview(activeInspection);');
    expect(jobDetailInvoiceActionSource).toContain('else void createInvoiceFromJob(activeInspection);');
  });

  test('dashboard summary stays lightweight and uses existing loaded workflow data', () => {
    const source = appSource();
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const workflowOverviewSource = sourceBetween(
      contractorSource,
      '<Card title="Workflow overview"',
      '<ContractorEntitlementStatusPanel',
    );

    expect(contractorSource).toContain('const actionReviewCount = connectionRequests.length');
    expect(contractorSource).toContain('+ homeownerAppointmentRequests.length');
    expect(contractorSource).toContain('+ contractorFollowUpCount');
    expect(contractorSource).toContain('+ acceptedEstimatesNeedingJobs.length');
    expect(contractorSource).toContain('+ completedJobsReadyToInvoice.length');
    expect(contractorSource).toContain('+ invoiceAttentionRecords.length');
    expect(contractorSource).toContain('+ (contractorProfileOnboardingComplete ? 0 : 1)');

    for (const label of ['Connections', 'Calendar requests', 'Requests', 'Estimates / invoices', 'Completed jobs', 'Profile setup']) {
      expect(contractorSource).toContain(`label: '${label}'`);
    }

    for (const stage of ['Requests', 'Estimates', 'Jobs', 'Invoices', 'Records']) {
      expect(workflowOverviewSource).toContain(`{stage.label}`);
      expect(contractorSource).toContain(`label: '${stage}'`);
    }

    expect(workflowOverviewSource).toContain('Needs review');
    expect(workflowOverviewSource).toContain('Items already marked by existing workflow statuses.');
    expect(workflowOverviewSource).not.toContain('queue');
    expect(workflowOverviewSource).not.toContain('automation');
  });

  test('job-message indicators remain job scoped and are not folded into the dashboard pipeline count', () => {
    const source = appSource();
    const messageIndicatorSource = sourceBetween(source, 'async function fetchWorkflowJobMessageIndicators', 'function appointmentNextActionText');
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const actionReviewSource = sourceBetween(contractorSource, 'const actionReviewCount =', 'const toolShortcutItems');

    expect(messageIndicatorSource).toContain('const visibleInspectionIds = uniqueJobMessageInspectionIds(inspectionIds);');
    expect(messageIndicatorSource).toContain(".eq('context_type', 'job')");
    expect(messageIndicatorSource).toContain(".in('inspection_id', visibleInspectionIds)");
    expect(messageIndicatorSource).toContain('message.sender_user_id === currentUserId');
    expect(messageIndicatorSource).toContain(".from('workflow_messages')");
    expect(messageIndicatorSource).toContain(".from('workflow_thread_reads')");

    expect(actionReviewSource).not.toContain('workflowJobMessageIndicators');
    expect(actionReviewSource).not.toContain('workflow_messages');
    expect(actionReviewSource).not.toContain('workflow_thread_reads');
  });

  test('FB-027 summary does not mix in review display, notifications, or new backend behavior', () => {
    const source = appSource();
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const workflowOverviewSource = sourceBetween(
      contractorSource,
      '<Card title="Workflow overview"',
      '<ContractorEntitlementStatusPanel',
    );

    for (const outOfScope of [
      'servsync_admin_review_moderation_queue',
      'servsync_admin_update_review_moderation',
      'servsync_homeowner_submit_review',
      'public review display',
      'approved-only public display',
      'paid ranking',
      'top contractor',
      'badge',
      'email notification',
      'sms',
      'push',
    ]) {
      expect(workflowOverviewSource.toLowerCase()).not.toContain(outOfScope.toLowerCase());
    }

    expect(workflowOverviewSource).not.toContain('supabase.rpc');
    expect(workflowOverviewSource).not.toContain(".from('");
    expect(workflowOverviewSource).not.toContain('.insert(');
    expect(workflowOverviewSource).not.toContain('.update(');
    expect(workflowOverviewSource).not.toContain('.delete(');
  });

  test('actual accepted-estimate job creation remains on estimate cards only', () => {
    const source = appSource();
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');
    const workflowOverviewSource = sourceBetween(
      contractorSource,
      '<Card title="Workflow overview"',
      '<ContractorEntitlementStatusPanel',
    );
    const estimateCardSource = sourceBetween(
      contractorSource,
      'data-testid="contractor-estimate-card"',
      '<Card title="Create Job"',
    );

    expect(workflowOverviewSource).not.toContain('data-testid="contractor-create-job-from-accepted-estimate"');
    expect(workflowOverviewSource).not.toContain('aria-label={`Create job from accepted estimate');
    expect(estimateCardSource).toContain('data-testid="contractor-create-job-from-accepted-estimate"');
    expect(estimateCardSource).toContain('aria-label={`Create job from accepted estimate ${estimate.title}`}');
    expect(estimateCardSource).toContain('onClick={() => void createJobFromAcceptedEstimate(estimate)}');
    expect(estimateCardSource).toContain('View Job');
    expect(estimateCardSource).toContain('onClick={() => void openLinkedJobForEstimate(estimate)}');
  });
});
