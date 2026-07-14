import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { homeMapDraftStatusPresentation } from '../../src/features/homeMap/statusPresentation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

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

test.describe('Bundle 3B-2 service agreement, report, and Home Map notices', () => {
  test('VisibilityNotice stays presentation-only and mobile-safe', () => {
    const source = sourceFile('src/features/drafts/VisibilityNotice.tsx');

    expect(source).toContain("type VisibilityNoticeVariant = 'standard' | 'compact'");
    expect(source).toContain("type VisibilityNoticeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'");
    expect(source).toContain('title: ReactNode');
    expect(source).toContain('body: ReactNode');
    expect(source).toContain('action?: ReactNode');
    expect(source).toContain('data-testid={testId}');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('break-words');
    expect(source).toContain("isCompact ? 'px-3 py-2' : 'px-3 py-3'");
    expect(source).not.toMatch(/supabase|rpc\(|from\(|insert|update|delete|useNavigate|appRoute|permission|localStorage|sessionStorage/);
    expect(source).not.toMatch(/role="alert"|tabIndex|autoFocus/);
  });

  test('Home Map draft presentation maps supported values and unknowns safely', () => {
    expect(homeMapDraftStatusPresentation('draft')).toEqual({ label: 'Draft', tone: 'neutral' });
    expect(homeMapDraftStatusPresentation('submitted')).toEqual({ label: 'Submitted for Homeowner Review', tone: 'info' });
    expect(homeMapDraftStatusPresentation('accepted')).toEqual({ label: 'Approved by Homeowner', tone: 'success' });
    expect(homeMapDraftStatusPresentation('declined')).toEqual({ label: 'Declined by Homeowner', tone: 'danger' });
    expect(homeMapDraftStatusPresentation('revoked')).toEqual({ label: 'Revoked', tone: 'muted' });
    expect(homeMapDraftStatusPresentation('awaiting-homeowner')).toEqual({ label: 'Awaiting Homeowner', tone: 'neutral' });
    expect(homeMapDraftStatusPresentation(null)).toEqual({ label: 'Unknown', tone: 'neutral' });
  });

  test('service agreement notices distinguish draft offers from sent and active visibility states', () => {
    const app = sourceFile('src/App.tsx');
    const contractorSource = sourceBetween(app, "{contractorJobsView === 'service_agreements' && (", "{contractorJobsView === 'templates' && (");
    const homeownerSource = sourceBetween(app, 'function HomeownerDashboard', 'function ContractorDashboard');

    expect(app).toContain("import { VisibilityNotice } from './features/drafts/VisibilityNotice';");
    expect(contractorSource).toContain('<DraftNotice');
    expect(contractorSource).toContain('title="Draft service agreement"');
    expect(contractorSource).toContain('Not visible to the homeowner yet. Save the draft, then send when ready.');
    expect(contractorSource).toContain('testId="service-agreement-draft-offer-notice"');
    expect(contractorSource).not.toMatch(/Create agreement template[\s\S]{0,500}<DraftNotice/);

    expect(homeownerSource).toContain('testId="homeowner-service-agreement-sent-notice"');
    expect(homeownerSource).toContain('title="Sent to homeowner"');
    expect(homeownerSource).toContain('testId="homeowner-service-agreement-active-notice"');
    expect(homeownerSource).toContain('title="Active agreement"');
    expect(homeownerSource).toContain("respondToServiceAgreementOffer(offer, 'accepted')");
    expect(homeownerSource).toContain("respondToServiceAgreementOffer(offer, 'declined')");
    expect(homeownerSource).toContain(".neq('status', 'draft')");
  });

  test('report notices clarify draft, review, finalization, filing, and send visibility without workflow changes', () => {
    const app = sourceFile('src/App.tsx');
    const reportSource = sourceBetween(app, "{inspectionView === 'detail' && activeInspection && (() => {", 'function CalendarView');

    expect(reportSource).toContain('title="Draft report"');
    expect(reportSource).toContain('testId="report-draft-notice"');
    expect(reportSource).toContain('title="Closed for review"');
    expect(reportSource).toContain('testId="report-closed-for-review-notice"');
    expect(reportSource).toContain('title="Report sent · Job complete"');
    expect(reportSource).toContain('testId="report-sent-job-complete-notice"');
    expect(reportSource).toContain('title="Filed to Documents"');
    expect(reportSource).toContain('testId="report-filed-notice"');
    expect(reportSource).toContain('testId="report-send-visibility-notice"');
    expect(reportSource).toContain('testId="report-finalization-notice"');
    expect(reportSource).toContain('onClick={() => void finalizeInspection(activeInspection)}');
    expect(reportSource).toContain('onClick={() => void sendInspectionReportToHomeowner(activeInspection)}');
    expect(reportSource).toContain("activeInspection.status !== 'finalized'");
    expect(reportSource).toContain('disabled={!inspectionClosedForReview || finalizingInspection}');
    expect(reportSource).toContain('Finalize saves the PDF. Complete job & send report notifies the homeowner and closes the linked service request.');
  });

  test('Home Map contractor notices keep draft, submitted, approved, declined, and revoked states separate from actions', () => {
    const app = sourceFile('src/App.tsx');
    const panelSource = sourceBetween(
      app,
      'const renderContractorHomeMapDraftPanel = (request: ServiceRequestSummary) => {',
      'const serviceRequestIdsWithJobs = new Set(',
    );

    expect(app).toContain("import { homeMapDraftStatusPresentation } from './features/homeMap/statusPresentation';");
    expect(panelSource).toContain('<StatusBadge {...homeMapDraftStatusPresentation(draft.status)} />');
    expect(panelSource).toContain('title="Draft Home Map update"');
    expect(panelSource).toContain('testId="contractor-home-map-draft-private-notice"');
    expect(panelSource).toContain('title="Submitted for homeowner review"');
    expect(panelSource).toContain('testId="contractor-home-map-draft-submitted-notice"');
    expect(panelSource).toContain('title="Approved by homeowner"');
    expect(panelSource).toContain('testId="contractor-home-map-draft-approved-notice"');
    expect(panelSource).toContain('title="Declined by homeowner"');
    expect(panelSource).toContain('testId="contractor-home-map-draft-declined-notice"');
    expect(panelSource).toContain('title="Proposal revoked"');
    expect(panelSource).toContain('testId="contractor-home-map-draft-revoked-notice"');
    expect(panelSource).toContain("draft.status === 'draft'");
    expect(panelSource).toContain("draft?.status === 'submitted'");
    expect(panelSource).toContain('onClick={() => void submitContractorHomeMapDraft(draft)}');
    expect(panelSource).toContain('onClick={() => void revokeContractorHomeMapDraft(draft)}');
    expect(panelSource).not.toContain('servsync_accept_home_map_draft');
    expect(panelSource).not.toContain('servsync_decline_home_map_draft');
  });

  test('connected-property proposal and permanent Home Map workflows remain outside the new presentation helper', () => {
    const app = sourceFile('src/App.tsx');
    const homeMapPresentation = sourceFile('src/features/homeMap/statusPresentation.ts');

    expect(app).toContain('function connectedPropertyProposalStatusLabel(status: ConnectedPropertyProposalStatus)');
    expect(app).toContain('function connectedPropertyProposalStatusClass(status: ConnectedPropertyProposalStatus)');
    expect(homeMapPresentation).not.toContain('connectedPropertyProposal');
    expect(homeMapPresentation).not.toContain('home_rooms');
    expect(homeMapPresentation).not.toContain('home_room_layouts');
    expect(homeMapPresentation).not.toContain('supabase');
    expect(homeMapPresentation).not.toContain('.rpc(');
  });

  test('scope remains frontend presentation, tests, and documentation only', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/features/feedback/ActionFeedback.tsx',
      'src/features/drafts/VisibilityNotice.tsx',
      'src/features/homeMap/statusPresentation.ts',
      'tests/e2e/action-feedback-confirmation.spec.ts',
      'tests/e2e/service-report-homemap-notices.spec.ts',
      'tests/e2e/draft-clarity-notices.spec.ts',
      'tests/e2e/status-secondary-migration.spec.ts',
      'tests/e2e/contractor-home-map-drafts-ui.spec.ts',
      'tests/e2e/fb032-service-agreements-contractor-ui.spec.ts',
      'tests/e2e/fb032-service-agreements-homeowner-ui.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
    ]);

    expect(files.length, 'branch should have changed files for Bundle 3B-2').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for Bundle 3B-2`).toBe(true);
    }

    expect(files.some(file => file.endsWith('.sql'))).toBe(false);
    expect(files.some(file => file.includes('supabase/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => file.includes('pdfDocuments'))).toBe(false);
  });
});
