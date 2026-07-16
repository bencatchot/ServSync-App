import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyDraftJobScopeResult,
  draftJobComposerDraftFromRecords,
  draftJobMetadataPayload,
  draftJobOptionsWithSavedSelection,
  draftJobSaveFailureFeedback,
  draftJobScopePayload,
  isComposerDraftJob,
  validateDraftJobComposerDraft,
} from '../../src/features/jobs/draftJobMappings';
import { isDraftJobUiEnabled } from '../../src/features/jobs/draftJobAvailability';
import { composerDraftJobsFrom } from '../../src/features/jobs/jobRecordSelectors';
import { workComposerLineItemRowAdvancedVisibility } from '../../src/features/work-composer/WorkComposerLineItemRow';
import { createWorkComposerLineDraft } from '../../src/features/work-composer/workComposerDrafts';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Draft Job UI persistence and resume', () => {
  test('Draft Job UI gate is explicit and defaults to the legacy Start New Job route', () => {
    expect(isDraftJobUiEnabled({})).toBe(false);
    expect(isDraftJobUiEnabled({ VITE_DRAFT_JOB_UI_ENABLED: '' })).toBe(false);
    expect(isDraftJobUiEnabled({ VITE_DRAFT_JOB_UI_ENABLED: 'false' })).toBe(false);
    expect(isDraftJobUiEnabled({ VITE_DRAFT_JOB_UI_ENABLED: 'TRUE' })).toBe(false);
    expect(isDraftJobUiEnabled({ VITE_DRAFT_JOB_UI_ENABLED: '1' })).toBe(false);
    expect(isDraftJobUiEnabled({ VITE_DRAFT_JOB_UI_ENABLED: 'true' })).toBe(true);

    const appSource = sourceFile('src/App.tsx');
    expect(appSource).toContain("return jobsView === 'new_jobs' ? (DRAFT_JOB_UI_ENABLED ? 'draft_job' : 'new') : 'list';");
    expect(appSource).toContain("setInspectionView(DRAFT_JOB_UI_ENABLED ? 'draft_job' : 'new')");
    expect(appSource).toContain("DRAFT_JOB_UI_ENABLED && contractorJobsView === 'open_jobs'");
    expect(appSource).toContain("DRAFT_JOB_UI_ENABLED && inspectionView === 'draft_job'");
    expect(appSource).toContain("(!DRAFT_JOB_UI_ENABLED && inspectionView === 'draft_job')");
    expect(appSource).toContain('Draft Job UI is not enabled in this environment.');
  });

  test('identifies only new composer Draft Jobs, not historical generic inspection drafts', () => {
    expect(isComposerDraftJob({ job_origin: 'draft_composer', status: 'draft', job_status: 'draft' } as any)).toBe(true);
    expect(isComposerDraftJob({ job_origin: null, status: 'draft', job_status: 'draft' } as any)).toBe(false);
    expect(isComposerDraftJob({ job_origin: 'draft_composer', status: 'finalized', job_status: 'draft' } as any)).toBe(false);
    expect(isComposerDraftJob({ job_origin: 'draft_composer', status: 'draft', job_status: 'in_progress' } as any)).toBe(false);

    const appSource = sourceFile('src/App.tsx');
    expect(composerDraftJobsFrom([
      { job_origin: 'draft_composer', status: 'draft', job_status: 'draft', updated_at: '2026-07-15T00:01:00.000Z' },
      { job_origin: null, status: 'draft', job_status: 'draft', updated_at: '2026-07-15T00:02:00.000Z' },
    ] as any[])).toHaveLength(1);
    expect(appSource).toContain('const composerDraftJobs = composerDraftJobsFrom(inspections);');
    expect(appSource).toContain('const operationalInspections = operationalJobsFrom(inspections);');
    expect(appSource).toContain('selectedJobsCustomerDrafts');
    expect(appSource).toContain('<DraftJobList');
  });

  test('maps backend Draft Jobs and scope into composer state with stable IDs and sort order', () => {
    const inspection = {
      id: 'draft-1',
      contractor_id: 'contractor-1',
      homeowner_user_id: 'homeowner-1',
      home_id: 'home-1',
      local_contact_id: null,
      local_home_id: null,
      service_request_id: null,
      template_id: null,
      name: 'Kitchen work',
      summary: 'Replace faucet and supply lines.',
      status: 'draft',
      job_status: 'draft',
      job_origin: 'draft_composer',
      rooms_with_findings: [],
      report_storage_path: null,
      report_file_name: null,
      created_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-07-15T00:00:00.000Z',
    } as any;
    const workItems = [
      {
        id: 'item-b',
        inspection_id: 'draft-1',
        contractor_id: 'contractor-1',
        title: 'Second line',
        description: 'Second line',
        customer_description: '',
        internal_notes: 'Private note',
        line_type: 'material',
        quantity: 2,
        unit: 'each',
        unit_price_cents: 1250,
        labor_hours: null,
        billable: true,
        completion_status: 'open',
        billing_status: 'unbilled',
        work_state: 'open',
        approval_required: false,
        approval_status: 'not_required',
        room_id: null,
        room_label: 'Kitchen',
        location_label: 'Sink base',
        sort_order: 1,
        created_at: '2026-07-15T00:02:00.000Z',
        updated_at: '2026-07-15T00:02:00.000Z',
      },
      {
        id: 'item-a',
        inspection_id: 'draft-1',
        contractor_id: 'contractor-1',
        title: 'First line',
        description: 'First line',
        customer_description: '',
        internal_notes: '',
        line_type: 'labor',
        quantity: 1,
        unit: 'hour',
        unit_price_cents: 8500,
        labor_hours: 1,
        billable: true,
        completion_status: 'open',
        billing_status: 'unbilled',
        work_state: 'open',
        approval_required: false,
        approval_status: 'not_required',
        room_id: null,
        room_label: '',
        location_label: '',
        sort_order: 0,
        created_at: '2026-07-15T00:01:00.000Z',
        updated_at: '2026-07-15T00:01:00.000Z',
      },
    ] as any[];

    const draft = draftJobComposerDraftFromRecords(inspection, workItems);
    expect(draft.subject_type).toBe('connected');
    expect(draft.homeowner_user_id).toBe('homeowner-1');
    expect(draft.home_id).toBe('home-1');
    expect(draft.title).toBe('Kitchen work');
    expect(draft.scope).toBe('Replace faucet and supply lines.');
    expect(draft.line_items.map(line => line.job_work_item_id)).toEqual(['item-a', 'item-b']);
    expect(draft.line_items[1].room_label).toBe('Kitchen');
    expect(draft.line_items[1].internal_notes).toBe('Private note');
    expect(draft.line_items[1].unit_price).toBe('12.50');
  });

  test('round-trips supported Draft fields without pretending unsupported top-level notes persist', () => {
    const draft = draftJobComposerDraftFromRecords({
      id: 'draft-local-1',
      homeowner_user_id: null,
      home_id: null,
      local_contact_id: 'local-1',
      local_home_id: 'local-home-1',
      service_request_id: null,
      name: 'Local sink work',
      summary: 'Repair sink supply line.',
      status: 'draft',
      job_status: 'draft',
      job_origin: 'draft_composer',
      created_at: '',
      updated_at: '',
    } as any, [
      {
        id: 'work-1',
        inspection_id: 'draft-local-1',
        contractor_id: 'contractor-1',
        title: 'Replace valve',
        description: 'Replace valve',
        customer_description: 'Customer-safe valve note',
        internal_notes: 'Use quarter-turn shutoff',
        line_type: 'material',
        quantity: 2,
        unit: 'each',
        unit_price_cents: 1799,
        labor_hours: 0.5,
        billable: true,
        completion_status: 'open',
        billing_status: 'unbilled',
        work_state: 'open',
        approval_required: false,
        approval_status: 'not_required',
        room_id: null,
        room_label: 'Laundry',
        location_label: 'Utility sink',
        sort_order: 0,
        created_at: '2026-07-16T00:00:00.000Z',
        updated_at: '2026-07-16T00:00:00.000Z',
      },
    ] as any[]);

    expect(draft.subject_type).toBe('local');
    expect(draft.local_contact_id).toBe('local-1');
    expect(draft.local_home_id).toBe('local-home-1');
    expect(draft.notes).toBe('');

    const metadata = draftJobMetadataPayload(draft);
    expect(metadata).toEqual({
      p_homeowner_user_id: null,
      p_home_id: null,
      p_local_contact_id: 'local-1',
      p_local_home_id: 'local-home-1',
      p_service_request_id: null,
      p_name: 'Local sink work',
      p_summary: 'Repair sink supply line.',
    });
    expect(metadata).not.toHaveProperty('p_notes');

    const scope = draftJobScopePayload(draft);
    expect(scope[0]).toMatchObject({
      id: 'work-1',
      source_type: 'draft_job_scope',
      title: 'Replace valve',
      description: 'Replace valve',
      customer_description: 'Customer-safe valve note',
      internal_notes: 'Use quarter-turn shutoff',
      line_type: 'material',
      quantity: 2,
      unit: 'each',
      unit_price_cents: 1799,
      labor_hours: 0.5,
      room_label: 'Laundry',
      location_label: 'Utility sink',
      sort_order: 0,
    });
    expect(scope[0]).not.toHaveProperty('model_spec');
    expect(scope[0]).not.toHaveProperty('supply_status');
  });

  test('adds saved customer and property fallbacks so resumed Draft selections do not render blank', () => {
    const base = [{
      id: 'active-customer',
      label: 'Active Customer',
      properties: [{ id: 'active-home', label: 'Active Home' }],
    }];

    expect(draftJobOptionsWithSavedSelection(base, 'active-customer', 'missing-home', {
      customer: 'Saved customer',
      helper: 'Saved helper',
      property: 'Saved property',
    })[0].properties.map(property => property.id)).toEqual(['active-home', 'missing-home']);

    const withMissingCustomer = draftJobOptionsWithSavedSelection(base, 'missing-customer', 'missing-home', {
      customer: 'Saved customer',
      helper: 'Saved helper',
      property: 'Saved property',
    });
    expect(withMissingCustomer).toHaveLength(2);
    expect(withMissingCustomer[1]).toMatchObject({
      id: 'missing-customer',
      label: 'Saved customer',
      helper: 'Saved helper',
      properties: [{ id: 'missing-home', label: 'Saved property' }],
    });
  });

  test('builds create/update and scope payloads without activating or duplicating Draft Jobs', () => {
    const draft = draftJobComposerDraftFromRecords({
      id: 'draft-1',
      homeowner_user_id: null,
      home_id: null,
      local_contact_id: 'local-1',
      local_home_id: 'local-home-1',
      service_request_id: null,
      name: 'Fence repair',
      summary: 'Replace loose panel.',
      status: 'draft',
      job_status: 'draft',
      job_origin: 'draft_composer',
      created_at: '',
      updated_at: '',
    } as any, []);
    draft.line_items = [
      {
        id: 'client-line-1',
        line_type: 'labor',
        description: 'Repair fence panel',
        line_title: 'Repair fence panel',
        customer_description: '',
        model_spec: '',
        supply_status: '',
        quantity: '1.5',
        unit: 'hour',
        unit_price: '75',
        labor_hours: '',
        room_id: null,
        room_label: 'Back yard',
        location_label: 'Fence line',
        internal_notes: 'Bring exterior screws',
      },
    ];

    expect(validateDraftJobComposerDraft(draft)).toBe('');
    expect(draftJobMetadataPayload(draft)).toMatchObject({
      p_homeowner_user_id: null,
      p_local_contact_id: 'local-1',
      p_local_home_id: 'local-home-1',
      p_name: 'Fence repair',
      p_summary: 'Replace loose panel.',
    });
    const scope = draftJobScopePayload(draft, ['removed-persisted-id']);
    expect(scope[0]).not.toHaveProperty('id');
    expect(scope[0]).toMatchObject({
      source_type: 'draft_job_scope',
      source_key: 'draft-job-scope-client:client-line-1',
      title: 'Repair fence panel',
      quantity: 1.5,
      unit_price_cents: 7500,
      room_label: 'Back yard',
      location_label: 'Fence line',
      internal_notes: 'Bring exterior screws',
      approval_required: false,
      approval_status: 'not_required',
    });
    expect(scope[1]).toEqual({ id: 'removed-persisted-id', remove: true });

    const saved = applyDraftJobScopeResult(draft, { updated_item_ids: ['persisted-line-1'] });
    expect(saved.line_items[0].id).toBe('persisted-line-1');
    expect(saved.line_items[0].job_work_item_id).toBe('persisted-line-1');
  });

  test('save flow keeps partial-save retries on the same Draft Job and never exposes activation UI', () => {
    const appSource = sourceFile('src/App.tsx');
    const saveSource = sourceBetween(appSource, 'const saveDraftJobComposer = async', 'const syncSimpleJobWorkItems = async');
    const composerSource = sourceFile('src/features/jobs/DraftJobComposer.tsx');

    expect(saveSource).toContain('draftId = await createDraftJob');
    expect(saveSource).toContain('setActiveDraftJobId(draftId)');
    expect(saveSource).toContain("savePhase = 'saving_scope'");
    expect(saveSource).toContain("savePhase = 'refreshing_saved_data'");
    expect(saveSource).toContain('await upsertDraftJobScope');
    expect(saveSource).toContain('draftJobSaveFailureFeedback');
    expect(saveSource).not.toContain('servsync_activate_draft_job');

    expect(composerSource).toContain('Save Draft');
    expect(composerSource).toContain('Customer type is fixed after the first save');
    expect(composerSource).not.toContain('Create Estimate');
    expect(composerSource).not.toContain('Create Invoice');
  });

  test('Continue Draft performs a canonical refetch and failed loads do not open a blank composer', () => {
    const appSource = sourceFile('src/App.tsx');
    const continueSource = sourceBetween(appSource, 'const continueDraftJob = async', 'const saveDraftJobComposer = async');
    const fetchSource = sourceBetween(appSource, 'const fetchDraftJobRecord = async', 'const startDraftJobComposer =');
    const listSource = sourceFile('src/features/jobs/DraftJobList.tsx');

    expect(fetchSource).toContain(".from('inspections')");
    expect(fetchSource).toContain(".select('*')");
    expect(continueSource).toContain('fetchDraftJobRecord(draft.id)');
    expect(continueSource).toContain('refreshJobWorkItemsForJob(draft.id)');
    expect(continueSource).toContain('isComposerDraftJob(freshDraft)');
    expect(continueSource).toContain('setDraftJobDraft(draftJobComposerDraftFromRecords(freshDraft, items))');
    expect(continueSource.indexOf("setInspectionView('draft_job')")).toBeGreaterThan(continueSource.indexOf('isComposerDraftJob(freshDraft)'));
    expect(continueSource).toContain('setLoadingDraftJobId(draft.id)');
    expect(continueSource).toContain('setLoadingDraftJobId(null)');
    expect(listSource).toContain('loadingDraftId === draft.id');
    expect(listSource).toContain('Loading...');
  });

  test('Draft composer exposes only supported durable advanced fields for Draft scope rows', () => {
    const composerSource = sourceFile('src/features/jobs/DraftJobComposer.tsx');
    const rowSource = sourceFile('src/features/work-composer/WorkComposerLineItemRow.tsx');
    const compactBranch = sourceBetween(
      rowSource,
      'if (compactAdvanced) {',
      '  return (\n    <div key={line.id} className="rounded-xl border border-slate-200 bg-white p-3">',
    );
    const draftLine = createWorkComposerLineDraft({
      line_type: 'material',
      line_title: 'Replace valve',
      description: 'Replace valve',
      model_spec: '',
      supply_status: '',
      room_label: 'Laundry',
      location_label: 'Utility sink',
      internal_notes: 'Use quarter-turn shutoff',
    });
    const estimateLine = createWorkComposerLineDraft({
      line_type: 'material',
      line_title: 'Replace valve',
      description: 'Replace valve',
      model_spec: 'Moen 1225',
      supply_status: 'contractor_supplied',
    });

    expect(composerSource).toContain('advancedDetailsOpen={expandedLineIds.has(line.id)}');
    expect(composerSource).toContain('onAdvancedDetailsOpenChange');
    expect(composerSource).toContain('line.room_label?.trim() || line.location_label?.trim() || line.internal_notes?.trim()');
    expect(workComposerLineItemRowAdvancedVisibility('draft job', draftLine)).toEqual({
      showModelSpec: false,
      showSupplyStatus: false,
    });
    expect(workComposerLineItemRowAdvancedVisibility('estimate', estimateLine)).toEqual({
      showModelSpec: true,
      showSupplyStatus: true,
    });
    expect(workComposerLineItemRowAdvancedVisibility('invoice', estimateLine)).toEqual({
      showModelSpec: true,
      showSupplyStatus: true,
    });
    expect(compactBranch).toContain('{showModelSpec ? modelSpecField : null}');
    expect(compactBranch).toContain('{showSupplyStatus ? supplyStatusField : null}');
    expect(compactBranch).not.toContain('\n              {modelSpecField}\n');
    expect(compactBranch).not.toContain('\n              {supplyStatusField}\n');
    expect(compactBranch).toContain('{roomField}');
    expect(compactBranch).toContain('{locationField}');
    expect(compactBranch).toContain('{internalNotesField}');
  });

  test('save failure feedback distinguishes scope failures from post-save refresh failures', () => {
    expect(draftJobSaveFailureFeedback({
      draftId: 'draft-1',
      metadataSaved: true,
      scopeSaved: false,
      error: new Error('scope rejected'),
    })).toMatchObject({
      title: 'Draft details saved, but scope changes did not save.',
    });

    expect(draftJobSaveFailureFeedback({
      draftId: 'draft-1',
      metadataSaved: true,
      scopeSaved: true,
      error: new Error('network reload failed'),
    })).toEqual({
      title: 'Draft Job saved, but the latest saved data could not be reloaded.',
      body: 'Refresh to confirm the changes.',
    });

    expect(draftJobSaveFailureFeedback({
      draftId: null,
      metadataSaved: false,
      scopeSaved: false,
      error: new Error('permission denied'),
    })).toMatchObject({
      title: 'Draft Job could not be created.',
      body: 'You do not have permission to save this Draft Job.',
    });
  });

  test('Drafts section is separate from operational job status presentation', () => {
    const listSource = sourceFile('src/features/jobs/DraftJobList.tsx');
    const appSource = sourceFile('src/App.tsx');
    const openJobsSource = sourceBetween(appSource, "{ id: 'open_jobs' as const", "{ id: 'closed_jobs' as const");
    const focusedListSource = sourceBetween(appSource, "const listTitle = contractorJobsView === 'open_jobs'", 'const jobTypeFilterOptions = [');

    expect(listSource).toContain('data-testid="contractor-draft-jobs-section"');
    expect(listSource).toContain('Continue Draft');
    expect(listSource).toContain('Draft');
    expect(openJobsSource).toContain('Scheduled and active work');
    expect(openJobsSource).not.toContain('Draft and active work');
    expect(focusedListSource).toContain('Scheduled and in-progress jobs that still need work.');
  });

  test('does not add SQL, production targeting, or future outcome actions in this UI slice', () => {
    const appSource = sourceFile('src/App.tsx');
    const apiSource = sourceFile('src/features/jobs/draftJobApi.ts');
    const composerSource = sourceFile('src/features/jobs/DraftJobComposer.tsx');

    expect(apiSource).toContain('servsync_create_draft_job');
    expect(apiSource).toContain('servsync_update_draft_job');
    expect(apiSource).toContain('servsync_upsert_draft_job_scope');
    expect(apiSource).not.toContain('servsync_activate_draft_job');
    expect(appSource).not.toContain('uqgtheclhxqlnjpfmheq');
    expect(composerSource).not.toContain('Create Estimate');
    expect(composerSource).not.toContain('Create Invoice');
  });
});
