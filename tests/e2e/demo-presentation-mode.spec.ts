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
