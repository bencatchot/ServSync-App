import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptPath = resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs');
const manifestPath = resolve(process.cwd(), 'scripts/demo/scenarios/water-heater-core-loop.mjs');
const sqlPath = resolve(process.cwd(), 'servsync-demo-mode-foundation.sql');
const appPath = resolve(process.cwd(), 'src/App.tsx');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test.describe('Demo Mode Slice 2B job lifecycle checkpoint source checks', () => {
  test('manifest exposes only the approved job lifecycle checkpoints before invoice and Home History states', async () => {
    const manifest = await import('../../scripts/demo/scenarios/water-heater-core-loop.mjs');

    expect(manifest.supportedCheckpointKeys.slice(-4)).toEqual([
      'job_scheduled',
      'job_in_progress',
      'job_review_ready',
      'job_completed',
    ]);
    expect(manifest.defaultCheckpointKey).toBe('job_created');
    expect(manifest.deferredCheckpointKeys).toEqual(
      expect.arrayContaining(['invoice_draft', 'invoice_sent', 'invoice_paid', 'home_history_updated'])
    );
    expect(manifest.deferredCheckpointKeys).not.toContain('job_scheduled');
    expect(manifest.deferredCheckpointKeys).not.toContain('job_in_progress');
    expect(manifest.deferredCheckpointKeys).not.toContain('job_review_ready');
    expect(manifest.deferredCheckpointKeys).not.toContain('job_completed');
    expect(manifest.checkpointByKey.job_scheduled.expected.visitSharedWithHomeowner).toBe(false);
    expect(manifest.checkpointByKey.job_completed.expected.invoiceCount).toBe(0);
    expect(manifest.checkpointByKey.job_completed.expected.homeHistoryCount).toBe(0);
  });

  test('runner schedules visits through the product RPC and keeps homeowner appointment proposals out of Slice 2B', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/async function scheduleJobVisit/);
    expect(script).toMatch(/contractorClient\.rpc\('servsync_schedule_visit_event'/);
    expect(script).toMatch(/p_share_with_homeowner: false/);
    expect(script).toMatch(/registerCreatedRecord\([\s\S]*'contractor_visit_events'[\s\S]*'demo_contractor_visit_event'[\s\S]*'job_scheduled'/);
    expect(script).toMatch(/service_request_appointments[\s\S]*Demo job scheduling must not create homeowner appointment proposals/);
    expect(script).not.toMatch(/share_with_homeowner:\s*true/);
  });

  test('runner models in-progress and review-ready states with estimate-derived work items only', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/async function advanceJobInProgress/);
    expect(script).toMatch(/async function advanceJobReviewReady/);
    expect(script).toMatch(/inProgressCompletedWorkItemCount/);
    expect(script).toMatch(/source_estimate_line_item_id/);
    expect(script).toMatch(/manual work items are not part of Slice 2B/);
    expect(script).toMatch(/job_status: 'in_progress'/);
    expect(script).toMatch(/completed_at: null/);
    expect(script).not.toMatch(/servsync_create_manual_job_work_item/);
  });

  test('runner completion is lightweight and excludes reports, invoices, and Home History filing', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/async function completeDemoJob/);
    expect(script).toMatch(/contractorClient\.rpc\('servsync_complete_visit_event_for_job'/);
    expect(script).toMatch(/job_status: 'completed'/);
    expect(script).toMatch(/closed_at: null/);
    expect(script).toMatch(/report_storage_path: null/);
    expect(script).toMatch(/report_file_name: null/);
    expect(script).toMatch(/Demo Slice 2B must not create invoices/);
    expect(script).toMatch(/Demo Slice 2B must not file Home History rows/);
    expect(script).toMatch(/Demo Slice 2B must not fabricate job_completed workflow events/);
    expect(script).not.toMatch(/servsync_finalize_field_work/);
    expect(script).not.toMatch(/servsync_notify_field_work_report/);
    expect(script).not.toMatch(/createInvoiceFromJob/);
  });

  test('verification checks exact lifecycle status, visit events, work-item counts, and deferred artifacts', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/job\.job_status !== checkpoint\.expected\.jobStatus/);
    expect(script).toMatch(/verifyExactJobWorkItemOwnership\(issues, \{ registeredWorkItemIds: jobWorkItemIds, jobWorkItems \}\)/);
    expect(script).toMatch(/Expected \$\{checkpoint\.expected\.completedWorkItemCount\} completed job work items/);
    expect(script).toMatch(/Expected \$\{checkpoint\.expected\.openWorkItemCount\} open job work items/);
    expect(script).toMatch(/verifyExactVisitEventOwnership\(issues, \{ registeredVisitEventIds: visitEventIds, visitEvents \}\)/);
    expect(script).toMatch(/visitEvent\.share_with_homeowner !== false/);
    expect(script).toMatch(/scenarioInvoices\.length !== 0/);
    expect(script).toMatch(/homeHistoryRows\.length !== 0/);
    expect(script).toMatch(/const workflowEventClauses = \[estimateId \? `estimate_id\.eq\.\$\{estimateId\}`/);
    expect(script).toMatch(/Scheduled visit before job completion/);
  });

  test('job-completed verification rejects current-job events without relying on estimate linkage', async () => {
    const runner = await import('../../scripts/demo/seed-demo-scenario.mjs');

    const matches = runner.findForbiddenJobCompletedEvents(
      [
        { event_type: 'job_completed', inspection_id: 'job-current', estimate_id: null },
        { event_type: 'job_completed', inspection_id: 'job-current', estimate_id: 'estimate-other' },
        { event_type: 'job_completed', inspection_id: 'job-other', estimate_id: null },
        { event_type: 'job_created', inspection_id: 'job-current', estimate_id: null },
      ],
      'job-current'
    );

    expect(matches.map((event) => event.estimate_id)).toEqual([null, 'estimate-other']);
  });

  test('visit-event verification requires the registered and actual current-job IDs to match exactly', async () => {
    const runner = await import('../../scripts/demo/seed-demo-scenario.mjs');

    const mismatchIssues: string[] = [];
    runner.verifyExactVisitEventOwnership(mismatchIssues, {
      registeredVisitEventIds: ['visit-registered'],
      visitEvents: [{ id: 'visit-actual' }],
    });
    expect(mismatchIssues).toContain(
      'Demo contractor visit event registry ID visit-registered does not match current job visit event visit-actual.'
    );

    const unregisteredIssues: string[] = [];
    runner.verifyExactVisitEventOwnership(unregisteredIssues, {
      registeredVisitEventIds: [],
      visitEvents: [{ id: 'visit-actual' }],
    });
    expect(unregisteredIssues).toContain('Expected 1 registered contractor visit event, found 0.');

    const staleIssues: string[] = [];
    runner.verifyExactVisitEventOwnership(staleIssues, {
      registeredVisitEventIds: ['visit-stale'],
      visitEvents: [],
    });
    expect(staleIssues).toContain('Expected exactly one contractor visit event for the demo job, found 0.');

    const duplicateIssues: string[] = [];
    runner.verifyExactVisitEventOwnership(duplicateIssues, {
      registeredVisitEventIds: ['visit-a', 'visit-b'],
      visitEvents: [{ id: 'visit-a' }],
    });
    expect(duplicateIssues).toContain('Expected 1 registered contractor visit event, found 2.');

    const exactIssues: string[] = [];
    runner.verifyExactVisitEventOwnership(exactIssues, {
      registeredVisitEventIds: ['visit-a'],
      visitEvents: [{ id: 'visit-a' }],
    });
    expect(exactIssues).toEqual([]);
  });

  test('job-work-item verification requires exact current-job and registry ID-set equality', async () => {
    const runner = await import('../../scripts/demo/seed-demo-scenario.mjs');

    const exactIssues: string[] = [];
    const exactComparison = runner.verifyExactJobWorkItemOwnership(exactIssues, {
      registeredWorkItemIds: ['work-b', 'work-a'],
      jobWorkItems: [{ id: 'work-a' }, { id: 'work-b' }],
    });
    expect(exactIssues).toEqual([]);
    expect(exactComparison.ok).toBe(true);
    expect(exactComparison.actual).toEqual(['work-a', 'work-b']);
    expect(exactComparison.registered).toEqual(['work-a', 'work-b']);

    const missingIssues: string[] = [];
    runner.verifyExactJobWorkItemOwnership(missingIssues, {
      registeredWorkItemIds: ['work-a'],
      jobWorkItems: [{ id: 'work-a' }, { id: 'work-b' }],
    });
    expect(missingIssues).toContain('Demo job work item registry is missing current job work item IDs: work-b.');

    const staleIssues: string[] = [];
    runner.verifyExactJobWorkItemOwnership(staleIssues, {
      registeredWorkItemIds: ['work-a', 'work-stale'],
      jobWorkItems: [{ id: 'work-a' }],
    });
    expect(staleIssues).toContain('Demo job work item registry includes stale IDs not attached to the current job: work-stale.');

    const duplicateIssues: string[] = [];
    runner.verifyExactJobWorkItemOwnership(duplicateIssues, {
      registeredWorkItemIds: ['work-a', 'work-a'],
      jobWorkItems: [{ id: 'work-a' }],
    });
    expect(duplicateIssues).toContain('Duplicate registered demo job work item IDs: work-a.');

    const unrelatedCurrentIssues: string[] = [];
    runner.verifyExactJobWorkItemOwnership(unrelatedCurrentIssues, {
      registeredWorkItemIds: ['work-a'],
      jobWorkItems: [{ id: 'work-a' }, { id: 'work-unregistered-current-job' }],
    });
    expect(unrelatedCurrentIssues).toContain(
      'Demo job work item registry is missing current job work item IDs: work-unregistered-current-job.'
    );
  });

  test('demo registry SQL can reset contractor visit events only through the explicit allowlist', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/p_table_name = 'contractor_visit_events'/);
    expect(sql).toMatch(/when p_table_name = 'contractor_visit_events' then 112/);
    expect(sql).toMatch(/delete from %I\.%I where %I = \$1/i);
    expect(sql).not.toMatch(/\btruncate\s+(table\s+)?public\./i);
    expect(sql).not.toMatch(/delete from public\.contractor_visit_events\s*;/i);
  });

  test('source files do not add browser checkpoint controls or frontend feature exposure', () => {
    const manifest = read(manifestPath);
    const script = read(scriptPath);
    const app = read(appPath);

    expect(manifest).toContain('job_review_ready');
    expect(script).toContain('parseCheckpointKey');
    expect(app).not.toMatch(/localStorage\.setItem\(['"`]demoCheckpoint|Checkpoint selector|presentation mode/i);
    expect(app).not.toContain('VITE_DEMO_SUPABASE_SERVICE_ROLE_KEY');
    expect(app).not.toContain('DEMO_SUPABASE_SERVICE_ROLE_KEY');
  });
});
