import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDraftChecklistSnapshot,
  draftChecklistRoomsToInspectionRooms,
  parseDraftChecklistSnapshot,
  type DraftChecklistSourceOption,
} from '../../src/features/drafts/checklistDraftScope';
import { createBlankSharedDraftComposerDraft } from '../../src/features/drafts/draftComposerMappings';
import {
  durableCanonicalStateToComposer,
  durableDraftSafeMessage,
  isDurableDraftComposerPathEnabled,
  legacyDraftsWithoutDurableMatches,
  prepareDurableDraftSave,
} from '../../src/features/drafts/durableDraftComposerIntegration';
import {
  DurableDraftError,
  launchContractorWorkDraft,
  parseContractorWorkDraftListRows,
  saveContractorWorkDraft,
} from '../../src/features/drafts/durableDraftLaunchApi';
import type {
  DurableDraftCanonicalState,
  DurableDraftListPresentation,
} from '../../src/features/drafts/durableDraftMappings';
import type {
  ContractorWorkDraft,
  ContractorWorkDraftEnvelope,
  ContractorWorkDraftLaunchResult,
  ContractorWorkDraftMetadataInput,
} from '../../src/features/drafts/durableDraftLaunchTypes';

const DRAFT_ID = '00000000-0000-4000-8000-000000000101';
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000102';
const HOMEOWNER_ID = '00000000-0000-4000-8000-000000000103';
const HOME_ID = '00000000-0000-4000-8000-000000000104';
const ITEM_ID = '00000000-0000-4000-8000-000000000105';
const LEGACY_ID = '00000000-0000-4000-8000-000000000106';
const JOB_ID = '00000000-0000-4000-8000-000000000108';
const LAUNCH_ID = '00000000-0000-4000-8000-000000000109';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000110';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const checklistOption: DraftChecklistSourceOption = {
  source_kind: 'contractor_inspection_checklist',
  source_id: '00000000-0000-4000-8000-000000000201',
  source_label: 'HVAC inspection checklist',
  workflow_kind: 'inspection',
  job_type: 'inspection',
  source_updated_at: '2026-07-24 12:00:00+00',
  group_label: 'Your Inspection Checklists',
  rooms: [
    {
      room: 'Mechanical Room',
      room_id: 'mechanical-room',
      display_name: 'Mechanical Room',
      room_type: '',
      location_note: '',
      sort_order: 0,
      items: ['Inspect filter condition', 'Confirm thermostat operation'],
    },
  ],
};

function checklistSnapshot() {
  return createDraftChecklistSnapshot(checklistOption);
}

function rawDraft(overrides: Partial<ContractorWorkDraft> = {}): ContractorWorkDraft {
  return {
    id: DRAFT_ID,
    contractor_id: CONTRACTOR_ID,
    created_by_user_id: null,
    homeowner_user_id: HOMEOWNER_ID,
    home_id: HOME_ID,
    local_contact_id: null,
    local_home_id: null,
    service_request_id: null,
    subject_type: 'connected_homeowner',
    subject_display_name_snapshot: 'Casey Customer',
    property_display_snapshot: '123 Main St',
    title: 'Water heater planning',
    scope_description: 'Replace the existing unit.',
    private_notes: 'Confirm shutoff access.',
    intended_output: null,
    work_format: 'standard',
    checklist_source: null,
    labor_mode: 'line_specific',
    labor_rate_cents: 12500,
    job_labor_hours: null,
    status: 'active',
    legacy_inspection_id: null,
    launched_output_type: null,
    launched_estimate_id: null,
    launched_job_id: null,
    launched_estimate_id_snapshot: null,
    launched_job_id_snapshot: null,
    launched_at: null,
    launched_by_user_id: null,
    created_at: '2026-07-19T10:00:00.000Z',
    updated_at: '2026-07-19T10:00:00.000Z',
    ...overrides,
  };
}

function rawEnvelope(draft: Partial<ContractorWorkDraft> = {}): ContractorWorkDraftEnvelope {
  return { draft: rawDraft(draft), items: [], launches: [] };
}

function checklistMetadata(): ContractorWorkDraftMetadataInput {
  return {
    homeowner_user_id: HOMEOWNER_ID,
    home_id: HOME_ID,
    local_contact_id: null,
    local_home_id: null,
    service_request_id: null,
    title: 'HVAC inspection',
    scope_description: 'Inspect the system.',
    private_notes: 'Private technician prep.',
    intended_output: 'job',
    work_format: 'inspection_checklist',
    checklist_source: checklistSnapshot(),
    labor_mode: null,
    labor_rate_cents: null,
    job_labor_hours: null,
    legacy_inspection_id: null,
  };
}

function canonicalState(overrides: Partial<DurableDraftCanonicalState['draft']> = {}): DurableDraftCanonicalState {
  return {
    draft: {
      draftId: DRAFT_ID,
      contractorId: CONTRACTOR_ID,
      createdByUserId: null,
      subject: { type: 'connected_homeowner', homeownerUserId: HOMEOWNER_ID, homeId: HOME_ID, serviceRequestId: null },
      subjectDisplayNameSnapshot: 'Casey Customer',
      propertyDisplaySnapshot: '123 Main St',
      title: 'Water heater planning',
      scopeDescription: 'Replace the existing unit.',
      privateNotes: 'Confirm shutoff access.',
      intendedOutput: null,
      workFormat: 'standard',
      checklistSource: null,
      laborMode: 'line_specific',
      laborRateCents: 12500,
      jobLaborHours: null,
      status: 'active',
      legacyInspectionId: null,
      launchedOutputType: null,
      launchedEstimateId: null,
      launchedJobId: null,
      launchedEstimateIdSnapshot: null,
      launchedJobIdSnapshot: null,
      launchedAt: null,
      launchedByUserId: null,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
      ...overrides,
    },
    items: [{
      rowId: 'local-row-one',
      durableItemId: ITEM_ID,
      sourceDraftId: DRAFT_ID,
      title: 'Install heater',
      description: 'Install heater',
      customerDescription: 'Install replacement unit',
      internalNotes: 'Use existing vent path',
      lineType: 'labor',
      quantity: 1,
      unit: 'each',
      unitPriceCents: 50000,
      laborHours: 3,
      roomId: null,
      roomLabel: 'Utility room',
      locationLabel: null,
      sortOrder: 0,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
    }],
    launches: [],
  };
}

function listRow(overrides: Partial<DurableDraftListPresentation> = {}): DurableDraftListPresentation {
  return {
    draftId: DRAFT_ID,
    contractorId: CONTRACTOR_ID,
    status: 'active',
    intendedOutput: null,
    workFormat: 'standard',
    checklistSource: null,
    title: 'Water heater planning',
    subjectType: 'connected_homeowner',
    subjectLabel: 'Casey Customer',
    propertyLabel: '123 Main St',
    legacyInspectionId: null,
    launchedOutputType: null,
    liveOutputId: null,
    outputIdSnapshot: null,
    outputAvailable: false,
    launchedAt: null,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T10:00:00.000Z',
    ...overrides,
  };
}

test.describe('Slice 2C-B durable Draft Composer integration', () => {
  test('requires Shared plus Draft Job and suppresses the durable path in Demo Presentation', () => {
    expect(isDurableDraftComposerPathEnabled({ sharedDraftEnabled: true, draftJobEnabled: true, demoPresentationMode: false })).toBe(true);
    expect(isDurableDraftComposerPathEnabled({ sharedDraftEnabled: false, draftJobEnabled: true, demoPresentationMode: false })).toBe(false);
    expect(isDurableDraftComposerPathEnabled({ sharedDraftEnabled: true, draftJobEnabled: false, demoPresentationMode: false })).toBe(false);
    expect(isDurableDraftComposerPathEnabled({ sharedDraftEnabled: true, draftJobEnabled: true, demoPresentationMode: true })).toBe(false);
  });

  test('maps a canonical active Draft into editable Composer state without losing durable identity', () => {
    const state = canonicalState({ intendedOutput: 'job' });
    const form = durableCanonicalStateToComposer(state);
    expect(form).toMatchObject({
      homeowner_user_id: HOMEOWNER_ID,
      home_id: HOME_ID,
      intended_output: 'job',
      notes: 'Confirm shutoff access.',
      labor_rate: '125.00',
    });
    expect(form.line_items[0]).toMatchObject({ id: 'local-row-one', job_work_item_id: ITEM_ID });
  });

  test('prepares one complete new-Draft snapshot with optional intent and private notes', () => {
    const form = createBlankSharedDraftComposerDraft({
      homeowner_user_id: HOMEOWNER_ID,
      home_id: HOME_ID,
      title: 'New plan',
      scope: 'Plan the work.',
      notes: 'Contractor only.',
      intended_output: null,
      line_items: [],
    });
    const before = structuredClone(form);
    const prepared = prepareDurableDraftSave({ form, current: null, contractorId: CONTRACTOR_ID, removedDurableItemIds: [] });
    expect(prepared.payload).toMatchObject({
      draft_id: null,
      metadata: { private_notes: 'Contractor only.', intended_output: null },
      items: [],
      removed_item_ids: [],
    });
    expect(form).toEqual(before);
  });

  test('creates bounded checklist snapshots and converts them into inspection rooms only after launch', () => {
    const snapshot = checklistSnapshot();
    expect(parseDraftChecklistSnapshot(snapshot)).toEqual(snapshot);
    expect(snapshot).toMatchObject({
      schema_version: 1,
      source_kind: 'contractor_inspection_checklist',
      source_label: 'HVAC inspection checklist',
      job_type: 'inspection',
    });
    expect(snapshot.snapshot_fingerprint).toMatch(/^draft-checklist-v1-[0-9a-f]{8}$/);
    expect(parseDraftChecklistSnapshot({ ...snapshot, rooms: [] })).toBeNull();
    expect(parseDraftChecklistSnapshot({ ...snapshot, source_label: 'Edited label' })).toBeNull();
    expect(parseDraftChecklistSnapshot({ ...snapshot, debug_path: '/tmp/workspace' })).toBeNull();
    expect(draftChecklistRoomsToInspectionRooms(snapshot.rooms)).toEqual([
      expect.objectContaining({
        room: 'Mechanical Room',
        findings: [
          expect.objectContaining({ title: 'Inspect filter condition', status: 'Pass', photos: [] }),
          expect.objectContaining({ title: 'Confirm thermostat operation', status: 'Pass', photos: [] }),
        ],
      }),
    ]);
  });

  test('prepares checklist Draft saves as Job-only snapshots with no operational line items', () => {
    const source = checklistSnapshot();
    const form = createBlankSharedDraftComposerDraft({
      homeowner_user_id: HOMEOWNER_ID,
      home_id: HOME_ID,
      title: 'Checklist visit',
      scope: 'Inspect HVAC system.',
      intended_output: 'estimate',
      work_format: 'inspection_checklist',
      checklist_source: source,
      line_items: [],
    });
    const prepared = prepareDurableDraftSave({ form, current: null, contractorId: CONTRACTOR_ID, removedDurableItemIds: [] });
    expect(prepared.payload).toMatchObject({
      metadata: {
        intended_output: 'job',
        work_format: 'inspection_checklist',
        checklist_source: source,
      },
      items: [],
    });
  });

  test('runtime-validates checklist Draft rows as Job-only and rejects relabeled metadata', () => {
    const snapshot = checklistSnapshot();
    const checklistRow = {
      id: DRAFT_ID,
      contractor_id: CONTRACTOR_ID,
      subject_type: 'connected_homeowner',
      subject_display_name_snapshot: 'Casey Customer',
      property_display_snapshot: '123 Main St',
      title: 'Inspection Draft',
      intended_output: 'job',
      work_format: 'inspection_checklist',
      checklist_source: snapshot,
      status: 'active',
      legacy_inspection_id: null,
      launched_output_type: null,
      launched_estimate_id: null,
      launched_job_id: null,
      launched_estimate_id_snapshot: null,
      launched_job_id_snapshot: null,
      launched_at: null,
      created_at: '2026-07-19T10:00:00.000Z',
      updated_at: '2026-07-19T10:00:00.000Z',
    };
    expect(parseContractorWorkDraftListRows([checklistRow])).toEqual([checklistRow]);
    expect(parseContractorWorkDraftListRows([{ ...checklistRow, intended_output: 'estimate' }])).toBeNull();
    expect(parseContractorWorkDraftListRows([{ ...checklistRow, checklist_source: { ...snapshot, snapshot_fingerprint: 'draft-checklist-v1-deadbeef' } }])).toBeNull();
    expect(parseContractorWorkDraftListRows([{ ...checklistRow, work_format: 'standard' }])).toBeNull();
  });

  test('routes checklist save and launch through dedicated RPCs without Estimate behavior', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const client = {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === 'servsync_save_inspection_checklist_work_draft') {
          return {
            data: rawEnvelope({
              intended_output: 'job',
              work_format: 'inspection_checklist',
              checklist_source: checklistSnapshot(),
              labor_mode: null,
              labor_rate_cents: null,
              job_labor_hours: null,
            }),
            error: null,
            status: 200,
          };
        }
        const launch: ContractorWorkDraftLaunchResult = {
          draft_id: DRAFT_ID,
          status: 'succeeded',
          output_type: 'job',
          estimate_id: null,
          job_id: JOB_ID,
          output_id_snapshot: JOB_ID,
          output_available: true,
          launch_id: LAUNCH_ID,
          idempotent: true,
        };
        return { data: launch, error: null, status: 200 };
      },
      from: () => { throw new Error('list not used'); },
    };

    await saveContractorWorkDraft(client, {
      draft_id: null,
      metadata: checklistMetadata(),
      items: [],
      removed_item_ids: [],
    });
    await launchContractorWorkDraft(client, {
      draft_id: DRAFT_ID,
      intended_output: 'job',
      work_format: 'inspection_checklist',
      idempotency_key: IDEMPOTENCY_KEY,
    });

    expect(calls.map(call => call.fn)).toEqual([
      'servsync_save_inspection_checklist_work_draft',
      'servsync_launch_inspection_checklist_work_draft',
    ]);
    expect(calls[0].args).toMatchObject({
      p_draft_id: null,
      p_items: [],
      p_removed_item_ids: [],
    });
    expect(calls[1].args).toMatchObject({
      p_draft_id: DRAFT_ID,
      p_intended_output: 'job',
      p_idempotency_key: IDEMPOTENCY_KEY,
    });
  });

  test('updates the same durable Draft and sends persisted IDs plus explicit removals', () => {
    const current = canonicalState();
    const form = durableCanonicalStateToComposer(current);
    form.line_items.push({ ...form.line_items[0], id: 'new-local-row', job_work_item_id: null, line_title: 'Permit fee', description: 'Permit fee' });
    form.line_items = form.line_items.filter(line => line.job_work_item_id !== ITEM_ID);
    const prepared = prepareDurableDraftSave({ form, current, contractorId: CONTRACTOR_ID, removedDurableItemIds: [ITEM_ID] });
    expect(prepared.payload.draft_id).toBe(DRAFT_ID);
    expect(prepared.payload.removed_item_ids).toEqual([ITEM_ID]);
    expect(prepared.payload.items).toHaveLength(1);
    expect(prepared.payload.items[0].id).toBeNull();
  });

  test('reordering preserves row and durable identities while changing canonical order', () => {
    const current = canonicalState();
    current.items.push({ ...current.items[0], rowId: 'local-row-two', durableItemId: null, sourceDraftId: null, title: 'Permit fee' });
    const form = durableCanonicalStateToComposer(current);
    form.line_items = [form.line_items[1], form.line_items[0]];
    const prepared = prepareDurableDraftSave({ form, current, contractorId: CONTRACTOR_ID, removedDurableItemIds: [] });
    expect(prepared.submitted.items.map(item => item.rowId)).toEqual(['local-row-two', 'local-row-one']);
    expect(prepared.submitted.items.map(item => item.durableItemId)).toEqual([null, ITEM_ID]);
    expect(prepared.payload.items.map(item => item.sort_order)).toEqual([0, 1]);
  });

  test('rejects duplicate persisted identities before the save adapter can run', () => {
    const current = canonicalState();
    const form = durableCanonicalStateToComposer(current);
    form.line_items.push({ ...form.line_items[0], id: 'different-local-row' });
    expect(() => prepareDurableDraftSave({ form, current, contractorId: CONTRACTOR_ID, removedDurableItemIds: [] })).toThrow('DUPLICATE_DURABLE_ITEM_ID');
  });

  test('de-duplicates only legacy rows bridged by legacy inspection ID', () => {
    const legacy = [{ id: LEGACY_ID }, { id: '00000000-0000-4000-8000-000000000107' }];
    const visible = legacyDraftsWithoutDurableMatches(legacy, [listRow({ legacyInspectionId: LEGACY_ID })]);
    expect(visible).toEqual([{ id: '00000000-0000-4000-8000-000000000107' }]);
  });

  test('runtime-validates active and consumed list rows before presentation', () => {
    const active = {
      id: DRAFT_ID,
      contractor_id: CONTRACTOR_ID,
      subject_type: 'connected_homeowner',
      subject_display_name_snapshot: 'Casey Customer',
      property_display_snapshot: '123 Main St',
      title: 'Plan',
      intended_output: null,
      work_format: 'standard',
      checklist_source: null,
      status: 'active',
      legacy_inspection_id: null,
      launched_output_type: null,
      launched_estimate_id: null,
      launched_job_id: null,
      launched_estimate_id_snapshot: null,
      launched_job_id_snapshot: null,
      launched_at: null,
      created_at: '2026-07-19T10:00:00.000Z',
      updated_at: '2026-07-19T10:00:00.000Z',
    };
    expect(parseContractorWorkDraftListRows([active])).toEqual([active]);
    expect(parseContractorWorkDraftListRows([{ ...active, id: 'bad-id' }])).toBeNull();
    expect(parseContractorWorkDraftListRows([{ ...active, status: 'consumed' }])).toBeNull();
    expect(parseContractorWorkDraftListRows([active, active])).toBeNull();
  });

  test('keeps the checklist SQL source additive, gated, and unapplied by default', () => {
    const sql = sourceFile('servsync-durable-draft-inspection-checklist-path.sql');
    expect(sql).toContain('add column if not exists checklist_source jsonb');
    expect(sql).toContain('servsync_save_inspection_checklist_work_draft');
    expect(sql).toContain('servsync_launch_inspection_checklist_work_draft');
    expect(sql).toContain("coalesce(nullif(trim(coalesce(p_metadata->>'work_format', '')), ''), 'standard') <> 'inspection_checklist'");
    expect(sql).toContain("or coalesce(nullif(trim(coalesce(p_metadata->>'intended_output', '')), ''), '') <> 'job'");
    expect(sql).toContain('revoke execute on function public.servsync_private_work_draft_checklist_source');
    expect(sql).toContain('revoke execute on function public.servsync_private_checklist_source_to_rooms_with_findings');
    expect(sql).toContain('or jsonb_array_length(p_items) <> 0');
    expect(sql).toContain('job_origin,');
    expect(sql).toContain("'direct',");
    expect(sql).toContain("v_output_type <> 'job'");
    expect(sql).toContain('public.servsync_private_validate_work_draft_relationships(v_draft, \'job\')');
    expect(sql).not.toContain('insert into public.invoices');
  });

  test('maps structured errors to safe phase-specific copy without raw details', () => {
    const error = new DurableDraftError({
      name: 'DurableDraftError',
      phase: 'save',
      kind: 'application',
      applicationCode: 'DRAFT_PERMISSION_DENIED',
      postgresCode: 'P0001',
      details: 'private database detail',
      hint: null,
      httpStatus: 403,
      transportClassification: null,
      safeMessage: 'DRAFT_PERMISSION_DENIED',
    });
    expect(durableDraftSafeMessage(error, 'save')).toBe('You do not have access to change this Draft.');
    expect(durableDraftSafeMessage(error, 'save')).not.toContain('private database detail');
  });

  test('wires adapters only through the effective durable branch and preserves the legacy fallback', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/drafts/DurableDraftWorkspace.tsx');
    expect(app).toContain('const sharedDraftComposerEnabled = canSeeDurableDraftWorkflow({');
    expect(app).toContain('useDurableDraftCohortAvailability({');
    expect(app).toContain('sharedDraftComposerEnabled && supabase ? (');
    expect(app).toContain('<DurableDraftWorkspace');
    expect(app).toContain('<DraftJobComposer');
    expect(workspace).toContain('saveContractorWorkDraft');
    expect(workspace).toContain('getContractorWorkDraft');
    expect(workspace).toContain('listContractorWorkDrafts');
    expect(workspace).toContain('importLegacyContractorWorkDraft');
  });

  test('loads consumed outputs without side effects before generation-checked adoption', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/drafts/DurableDraftWorkspace.tsx');
    const loader = app.slice(app.indexOf('const loadDurableDraftOutput'), app.indexOf('const adoptDurableDraftOutput'));
    const adopter = app.slice(app.indexOf('const adoptDurableDraftOutput'), app.indexOf('const saveDraftJobComposer'));
    expect(loader).toContain("return { type: 'estimate', id, record: validated.record }");
    expect(loader).toContain("return { type: 'job', id, record: validated.record }");
    expect(loader).not.toMatch(/setEstimates|setInspections|openEstimateRecord|openInspection/);
    expect(adopter).toMatch(/setEstimates[\s\S]*openEstimateRecord/);
    expect(adopter).toMatch(/setInspections[\s\S]*openInspection/);
    expect(workspace).toContain('openingOutputOperation.current === operation');
    expect(workspace).toMatch(/await onLoadOutput[\s\S]*if \(!isCurrent\(\)\) return;[\s\S]*onAdoptOutput/);
  });

  test('contains only the gated C1 launch path with no role-name policy or automatic output navigation', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/drafts/DurableDraftWorkspace.tsx');
    const integration = sourceFile('src/features/drafts/durableDraftComposerIntegration.ts');
    const consumedAdoption = workspace.slice(workspace.indexOf('const adoptCanonicalConsumed'), workspace.indexOf('const handleLaunchFailure'));
    expect(workspace).toContain('launchContractorWorkDraft');
    expect(workspace).toContain('recordDurableDraftLaunchSuccess');
    expect(workspace).toContain('createDurableDraftLaunchAttempt');
    expect(workspace).toContain('launchEnabled');
    expect(workspace).toContain('Do not create it again.');
    expect(workspace).not.toContain('Create Invoice');
    expect(consumedAdoption).not.toContain('onAdoptOutput');
    expect(app).not.toContain("from './features/drafts/durableDraftLaunchAttempt'");
    for (const role of ['field_tech', 'office', 'admin', 'viewer']) {
      expect(workspace).not.toContain(role);
      expect(integration).not.toContain(role);
    }
  });

  test('presents consumed and unavailable Drafts read-only with no mutation controls', () => {
    const workspace = sourceFile('src/features/drafts/DurableDraftWorkspace.tsx');
    expect(workspace).toContain("canonical.draft.status !== 'active'");
    expect(workspace).toContain('data-testid="durable-draft-read-only-summary"');
    expect(workspace).toContain('is no longer available');
    expect(workspace).not.toContain('Reactivate');
    expect(workspace).not.toContain('Retry Launch');
    expect(workspace).not.toContain('Duplicate Output');
  });

  test('keeps private notes contractor-only and supports accessible save/loading feedback', () => {
    const composer = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');
    const workspace = sourceFile('src/features/drafts/DurableDraftWorkspace.tsx');
    expect(composer).toContain("composerField('Private notes'");
    expect(composer).toContain('not copied to the customer-facing Estimate or Job');
    expect(workspace).toContain('aria-live="polite"');
    expect(workspace).toContain('errorSummaryRef.current?.focus()');
    expect(workspace).toContain('min-h-11');
  });
});
