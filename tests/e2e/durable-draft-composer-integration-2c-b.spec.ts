import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  parseContractorWorkDraftListRows,
} from '../../src/features/drafts/durableDraftLaunchApi';
import type {
  DurableDraftCanonicalState,
  DurableDraftListPresentation,
} from '../../src/features/drafts/durableDraftMappings';

const DRAFT_ID = '00000000-0000-4000-8000-000000000101';
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000102';
const HOMEOWNER_ID = '00000000-0000-4000-8000-000000000103';
const HOME_ID = '00000000-0000-4000-8000-000000000104';
const ITEM_ID = '00000000-0000-4000-8000-000000000105';
const LEGACY_ID = '00000000-0000-4000-8000-000000000106';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

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
    expect(app).toContain('isDurableDraftComposerPathEnabled({');
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
