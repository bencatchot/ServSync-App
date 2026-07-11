import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  SERVSYNC_DEMO_PRESENTATION_DEDICATED_REF,
  demoPresentationJobCheckpointLabel,
  isServSyncDemoPresentationMode,
  parseSupabaseProjectRef,
} from '../../src/demoPresentation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Demo presentation mode guard and source wiring', () => {
  const dedicatedEnv = {
    VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED: 'true',
    VITE_SERVSYNC_DEMO_PROJECT_REF: SERVSYNC_DEMO_PRESENTATION_DEDICATED_REF,
    VITE_SUPABASE_URL: `https://${SERVSYNC_DEMO_PRESENTATION_DEDICATED_REF}.supabase.co`,
  };

  test('activates only for the dedicated demo project with exact enabled flag', () => {
    expect(parseSupabaseProjectRef(dedicatedEnv.VITE_SUPABASE_URL)).toBe(SERVSYNC_DEMO_PRESENTATION_DEDICATED_REF);
    expect(isServSyncDemoPresentationMode(dedicatedEnv)).toBe(true);

    expect(isServSyncDemoPresentationMode({ ...dedicatedEnv, VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED: 'TRUE' })).toBe(false);
    expect(isServSyncDemoPresentationMode({ ...dedicatedEnv, VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED: '1' })).toBe(false);
    expect(isServSyncDemoPresentationMode({ ...dedicatedEnv, VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED: undefined })).toBe(false);
    expect(isServSyncDemoPresentationMode({ ...dedicatedEnv, VITE_SERVSYNC_DEMO_PROJECT_REF: undefined })).toBe(false);
    expect(isServSyncDemoPresentationMode({ ...dedicatedEnv, VITE_SUPABASE_URL: undefined })).toBe(false);
    expect(isServSyncDemoPresentationMode({ ...dedicatedEnv, VITE_SUPABASE_URL: 'not-a-url' })).toBe(false);
    expect(isServSyncDemoPresentationMode({ ...dedicatedEnv, VITE_SUPABASE_URL: 'https://example.com' })).toBe(false);
  });

  test('fails closed for production, shared sandbox, and mismatched refs', () => {
    expect(isServSyncDemoPresentationMode({
      ...dedicatedEnv,
      VITE_SUPABASE_URL: 'https://uqgtheclhxqlnjpfmheq.supabase.co',
      VITE_SERVSYNC_DEMO_PROJECT_REF: 'uqgtheclhxqlnjpfmheq',
    })).toBe(false);
    expect(isServSyncDemoPresentationMode({
      ...dedicatedEnv,
      VITE_SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
      VITE_SERVSYNC_DEMO_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
    })).toBe(false);
    expect(isServSyncDemoPresentationMode({
      ...dedicatedEnv,
      VITE_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
    })).toBe(false);
  });

  test('does not reference sensitive server-only demo credentials in browser source', () => {
    const source = [
      sourceFile('src/App.tsx'),
      sourceFile('src/demoPresentation.ts'),
    ].join('\n');

    for (const forbidden of [
      'DEMO_SUPABASE_SERVICE_ROLE_KEY',
      'DEMO_DATABASE_URL',
      'DEMO_HOMEOWNER_PASSWORD',
      'DEMO_CONTRACTOR_PASSWORD',
      'DEMO_RESET_ACKNOWLEDGE',
      'DEMO_MODE_ENABLED',
      'service_role',
      'SERVICE_ROLE',
      'Bearer ',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test('presentation mode hides clutter and mutating controls while normal setup code remains present', () => {
    const app = sourceFile('src/App.tsx');

    expect(app).toContain('const SERVSYNC_DEMO_PRESENTATION_MODE = isServSyncDemoPresentationMode();');
    expect(app).toContain('const showInitialHomeSetupPrompt = !SERVSYNC_DEMO_PRESENTATION_MODE');
    expect(app).toContain('const showHomeownerOnboardingChecklist = !SERVSYNC_DEMO_PRESENTATION_MODE');
    expect(app).toContain('const showInitialContractorProfileSetupPrompt = !SERVSYNC_DEMO_PRESENTATION_MODE');
    expect(app).toContain('const showContractorOnboardingChecklist = !SERVSYNC_DEMO_PRESENTATION_MODE');
    expect(app).toContain('actions={SERVSYNC_DEMO_PRESENTATION_MODE ? undefined : <NotificationBell');
    expect(app).toContain('const homeownerRequestsBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0');
    expect(app).toContain('const contractorHomeownersBadgeCount = SERVSYNC_DEMO_PRESENTATION_MODE ? 0');
    expect(app).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && !estimateComposerOpen && (');
    expect(app).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && showJobInvoiceAction && (');
    expect(app).toContain("action={!SERVSYNC_DEMO_PRESENTATION_MODE ? (");

    expect(app).toContain('Tell us about your home');
    expect(app).toContain('Set up your business profile');
    expect(app).toContain('Set up your home record');
    expect(app).toContain('Set up your workflow');
  });

  test('presentation mode leaves homeowner contractor-discovery connection CTAs available for the approved capture surface', () => {
    const app = sourceFile('src/App.tsx');
    const findContractorSource = sourceBetween(
      app,
      '<Card title="Find a contractor"',
      '{requestingConnectionId && selectedRequestConnection && (',
    );
    const publicProfileCtaSource = sourceBetween(
      app,
      '{/* CTA */}',
      '{publicContractorTarget && connectionModalOpen && (',
    );

    expect(findContractorSource).toContain('Request connection');
    expect(findContractorSource).toContain('openContextualConnectionRequest(contractorTargetFromProfile(contractor))');
    expect(findContractorSource).not.toContain('SERVSYNC_DEMO_PRESENTATION_MODE');
    expect(publicProfileCtaSource).toContain('Request connection with ${data.business_name}');
    expect(publicProfileCtaSource).toContain('setConnectionModalOpen(true)');
    expect(publicProfileCtaSource).not.toContain('SERVSYNC_DEMO_PRESENTATION_MODE');
  });

  test('checkpoint presentation labels are distinct and do not create product statuses', () => {
    expect(demoPresentationJobCheckpointLabel({ status: 'draft', totalWorkItems: 5, completedWorkItems: 0 })).toBe('Draft job created from accepted estimate');
    expect(demoPresentationJobCheckpointLabel({ status: 'scheduled', totalWorkItems: 5, completedWorkItems: 0 })).toBe('Contractor visit scheduled');
    expect(demoPresentationJobCheckpointLabel({ status: 'in_progress', totalWorkItems: 5, completedWorkItems: 2 })).toBe('Work in progress');
    expect(demoPresentationJobCheckpointLabel({ status: 'in_progress', totalWorkItems: 5, completedWorkItems: 5 })).toBe('Ready for contractor review');
    expect(demoPresentationJobCheckpointLabel({ status: 'completed', totalWorkItems: 5, completedWorkItems: 5 })).toBe('Work completed. Billing and home records are the next workflow and are intentionally outside this demo.');
  });

  test('selected-homeowner presentation summary uses real job and work-item collections', () => {
    const app = sourceFile('src/App.tsx');
    const selectedHomeownerSource = sourceBetween(
      app,
      'const rawFieldWork = conn ? fieldWorkForHomeowner(conn.homeowner_user_id)',
      'const workspaceUnassignedRecordCount = propertyScopeEnabled',
    );
    const presentationSummarySource = sourceBetween(
      app,
      'const presentationCurrentJob = activeJobRecords[0]',
      'const workspaceCards: Array<',
    );

    expect(selectedHomeownerSource).toContain('const subjectEstimateRecordsAcrossProperties = rawSubjectEstimates.filter(estimate => estimateDocumentLabel(estimate) !== \'Invoice\');');
    expect(presentationSummarySource).toContain('const presentationCurrentJob = activeJobRecords[0] ?? workOrderRecords[0] ?? inspectionRecords[0] ?? null;');
    expect(presentationSummarySource).toContain('const presentationCurrentJobItems = presentationCurrentJob ? workItemsForJob(presentationCurrentJob.id) : [];');
    expect(presentationSummarySource).toContain('const presentationCurrentJobProperty = presentationCurrentJob ? recordPropertyLabelForContractor(presentationCurrentJob) : \'\';');
    expect(presentationSummarySource).toContain('data-testid="demo-presentation-current-job-summary"');
    expect(presentationSummarySource).toContain('{presentationCurrentJob.name}');
    expect(presentationSummarySource).toContain('{presentationCurrentJobCopy}');
    expect(presentationSummarySource).toContain('{presentationCurrentJobProgress}');
    expect(presentationSummarySource).toContain('Property: {presentationCurrentJobProperty}');
  });

  test('selected-homeowner presentation summary appears on the default profile and jobs views', () => {
    const app = sourceFile('src/App.tsx');
    const profileViewSource = sourceBetween(
      app,
      "{activeTabId === 'profile' && (",
      "{activeTabId === 'home' && (",
    );
    const jobsViewSource = sourceBetween(
      app,
      "{activeTabId === 'fieldwork' && (",
      "{(activeTabId === 'estimates' || activeTabId === 'invoices') && (",
    );

    expect(profileViewSource).toContain('{renderDemoPresentationCurrentJobSummary()}');
    expect(profileViewSource).toContain('Profile');
    expect(jobsViewSource).toContain('{renderDemoPresentationCurrentJobSummary()}');
    expect(jobsViewSource).toContain('Jobs dashboard');
  });

  test('presentation mode hides property suggestion mutation without removing normal code', () => {
    const app = sourceFile('src/App.tsx');
    const propertySuggestionSource = sourceBetween(
      app,
      'const renderConnectedPropertySuggestions = () => {',
      '{isLoadingSuggestions && proposals.length === 0 ? (',
    );

    expect(propertySuggestionSource).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && (');
    expect(propertySuggestionSource).toContain('Suggest property');
    expect(propertySuggestionSource).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && isSuggesting && (');
    expect(propertySuggestionSource).toContain('openConnectedPropertyProposalForm(connectionId)');
  });

  test('contractor Jobs workspace surfaces the current checkpoint story for capture', () => {
    const app = sourceFile('src/App.tsx');
    const storySource = sourceBetween(
      app,
      'const demoPresentationCurrentContractorJob = openJobs[0]',
      'const estimateSourceProperty = (draft: Pick<EstimateDraft',
    );
    const jobsOverviewSource = sourceBetween(
      app,
      "{contractorJobsView === 'overview' && (",
      "{contractorJobsView === 'new_financial' && (",
    );
    const jobsListSource = sourceBetween(
      app,
      "{(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
      "{showLocalContactForm && (",
    );

    expect(storySource).toContain('data-testid="demo-presentation-jobs-checkpoint-story"');
    expect(storySource).toContain('{demoPresentationCurrentContractorJob.name}');
    expect(storySource).toContain('{demoPresentationCurrentContractorJobCopy}');
    expect(storySource).toContain('{demoPresentationCurrentContractorJobProgress}');
    expect(storySource).toContain('Property: {demoPresentationCurrentContractorJobProperty}');
    expect(jobsOverviewSource).toContain('{renderDemoPresentationJobsCheckpointStory()}');
    expect(jobsListSource).toContain('{renderDemoPresentationJobsCheckpointStory()}');
  });

  test('contractor Jobs capture surfaces hide mutation labels only in presentation mode', () => {
    const app = sourceFile('src/App.tsx');
    const jobsListSource = sourceBetween(
      app,
      "{(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (",
      "{showLocalContactForm && (",
    );
    const recentJobsSource = sourceBetween(
      app,
      "{contractorJobsView === 'overview' && (",
      "{contractorJobsView === 'templates' && (",
    );

    expect(jobsListSource).toContain("{!SERVSYNC_DEMO_PRESENTATION_MODE && inspectionJobStatus(insp) === 'draft'");
    expect(jobsListSource).toContain('SERVSYNC_DEMO_PRESENTATION_MODE');
    expect(jobsListSource).toContain("? checklistStyle && !inspectionIsClosedJob(insp) ? 'View report' : 'View Job'");
    expect(jobsListSource).toContain(": checklistStyle ? (insp.status === 'draft' ? 'Continue' : 'View report') : inspectionIsClosedJob(insp) ? 'View Job' : 'Continue Job'");
    expect(jobsListSource).toContain('{demoPresentationBadgeLabelForJob(insp)}');
    expect(jobsListSource).toContain('{subjectLabel}{subjectAddress ? ` · ${subjectAddress}` : \'\'}');

    expect(recentJobsSource).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && inspectionJobStatus(insp) === \'draft\'');
    expect(recentJobsSource).toContain('SERVSYNC_DEMO_PRESENTATION_MODE');
    expect(recentJobsSource).toContain("? checklistStyle && !inspectionIsClosedJob(insp) ? 'View report' : 'View Job'");
    expect(recentJobsSource).toContain(": checklistStyle ? (insp.status === 'draft' ? 'Continue' : 'View report') : inspectionIsClosedJob(insp) ? 'View Job' : 'Continue Job'");
    expect(recentJobsSource).toContain('{demoPresentationBadgeLabelForJob(insp)}');
    expect(recentJobsSource).toContain('{subjectLabel}{subjectAddress ? ` · ${subjectAddress}` : \'\'}');
  });

  test('homeowner dashboard hides reminder and Home History capture clutter only in presentation mode', () => {
    const app = sourceFile('src/App.tsx');
    const homeownerDashboardSource = sourceBetween(
      app,
      '<Card title="My contractors" icon={<Users size={18} />}>',
      '<Card title="Documents" icon={<FolderOpen size={18} />}>',
    );

    expect(homeownerDashboardSource).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && (');
    expect(homeownerDashboardSource).toContain('<Card title="Recent home history"');
    expect(homeownerDashboardSource).toContain('Open Home History');
    expect(homeownerDashboardSource).toContain('<Card title="Upcoming reminders"');
    expect(homeownerDashboardSource).toContain('Add reminder');
    expect(homeownerDashboardSource).toContain('openDashboardHomeReminders.map(reminder =>');

    const activeWorkSource = sourceBetween(
      app,
      '<Card title="Active work" icon={<ClipboardCheck size={18} />}>',
      '<Card title="My contractors" icon={<Users size={18} />}>',
    );
    expect(activeWorkSource).toContain('activeServiceRequests.map(request =>');
    expect(activeWorkSource).toContain('dashboardAcceptedWorkEstimates.map(estimate =>');
    expect(activeWorkSource).toContain('Job created from this estimate.');
  });

  test('homeowner accepted-estimate detail hides PDF and Home History actions only in presentation mode', () => {
    const app = sourceFile('src/App.tsx');
    const estimateCardSource = sourceBetween(
      app,
      'const renderHomeownerEstimateCard = (estimate: Estimate',
      'const renderHomeownerEstimatesInvoicesPage = () => (',
    );
    const estimateActionSource = sourceBetween(
      estimateCardSource,
      '<div className="mt-3 flex flex-wrap items-center gap-2">',
      '{isOpen && (',
    );
    const acceptedActionSource = sourceBetween(
      estimateCardSource,
      "{!SERVSYNC_DEMO_PRESENTATION_MODE && estimate.status === 'accepted' && (",
      '{estimate.scope &&',
    );

    expect(estimateActionSource).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && (');
    expect(estimateActionSource).toContain('downloadEstimatePdf(estimate');
    expect(estimateActionSource).toContain('Download PDF');
    expect(estimateActionSource).toContain('View Request');

    expect(acceptedActionSource).toContain('fileEstimateToHomeRecords(estimate, contractorName)');
    expect(acceptedActionSource).toContain('File to Home History');
    expect(acceptedActionSource).toContain("onClick={() => setHomeownerTab('log')}");
    expect(acceptedActionSource).toContain('View Home History');

    expect(estimateCardSource).toContain('You accepted this estimate.');
    expect(estimateCardSource).toContain('The contractor has created a job from this approved estimate.');
    expect(estimateCardSource).toContain('{estimate.scope &&');
    expect(estimateCardSource).toContain('estimate.line_items');
    expect(estimateCardSource).toContain('Payment Schedule');
    expect(estimateCardSource).toContain('Total <strong className="text-slate-950">{formatMoney(estimate.total_cents)}</strong>');
  });

  test('PR 279 template-free selected-homeowner estimate behavior remains intact', () => {
    const app = sourceFile('src/App.tsx');
    const selectedCustomerEstimatePanelSource = sourceBetween(
      app,
      "{(activeTabId === 'estimates' || activeTabId === 'invoices') && (",
      "{activeTabId === 'requests' && conn && (",
    );

    expect(selectedCustomerEstimatePanelSource).toContain('selectedDocumentSection.estimates.map(estimate =>');
    expect(selectedCustomerEstimatePanelSource).toContain('noSubjectEstimateCopy');
    expect(selectedCustomerEstimatePanelSource).not.toContain('ServSync estimate starters');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Search estimate templates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('visibleStarterEstimateTemplates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('visibleEstimateTemplates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Saved Work Templates');
  });
});
