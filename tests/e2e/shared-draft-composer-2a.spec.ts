import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isSharedDraftComposerLaunchEnabled } from '../../src/features/drafts/sharedDraftComposerAvailability';
import {
  createBlankSharedDraftComposerDraft,
  sharedDraftComposerDraftFromRecords,
  sharedDraftComposerDraftToDraftJobDraft,
  validateSharedDraftComposerDraftForSave,
} from '../../src/features/drafts/draftComposerMappings';
import { draftJobMetadataPayload, draftJobScopePayload } from '../../src/features/jobs/draftJobMappings';
import { createWorkComposerLineDraft } from '../../src/features/work-composer/workComposerDrafts';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Hidden Shared Draft Composer UI Foundation', () => {
  test('uses a strict default-off shared Draft composer gate', () => {
    expect(isSharedDraftComposerLaunchEnabled({})).toBe(false);
    expect(isSharedDraftComposerLaunchEnabled({ VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED: '' })).toBe(false);
    expect(isSharedDraftComposerLaunchEnabled({ VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED: 'false' })).toBe(false);
    expect(isSharedDraftComposerLaunchEnabled({ VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED: 'TRUE' })).toBe(false);
    expect(isSharedDraftComposerLaunchEnabled({ VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED: '1' })).toBe(false);
    expect(isSharedDraftComposerLaunchEnabled({ VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED: 'true' })).toBe(true);

    const gateSource = sourceFile('src/features/drafts/sharedDraftComposerAvailability.ts');
    expect(gateSource).toContain("env.VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED === 'true'");
  });

  test('wires the shared composer only at the existing Draft path and preserves gate-off fallback', () => {
    const appSource = sourceFile('src/App.tsx');
    const renderSource = sourceBetween(
      appSource,
      '{DRAFT_JOB_UI_ENABLED && inspectionView === \'draft_job\'',
      '{/* ── NEW VIEW ── */}',
    );

    expect(appSource).toContain("import { SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED } from './features/drafts/sharedDraftComposerAvailability';");
    expect(appSource).toContain('const sharedDraftComposerEnabled = SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED && DRAFT_JOB_UI_ENABLED;');
    expect(renderSource).toContain('sharedDraftComposerEnabled ? (');
    expect(renderSource).toContain('<ContractorDraftComposer');
    expect(renderSource).toContain('<DraftJobComposer');
    expect(renderSource).toContain('canManageDraftJobs');
    expect(renderSource).toContain('onSave={() => void saveDraftJobComposer()}');
    expect(renderSource).not.toContain('contractorTab === \'drafts\'');
    expect(appSource).not.toContain("label: 'Start New Draft'");
  });

  test('clean Drafts start with no intended output and legacy resumed Draft Jobs default to Job', () => {
    const clean = createBlankSharedDraftComposerDraft();
    expect(clean.intended_output).toBeNull();
    expect(clean.work_format).toBe('standard');

    const legacy = sharedDraftComposerDraftFromRecords({
      id: 'draft-1',
      homeowner_user_id: null,
      home_id: null,
      local_contact_id: 'local-1',
      local_home_id: 'home-1',
      service_request_id: null,
      name: 'Saved Draft Job',
      summary: 'Saved scope',
      status: 'draft',
      job_status: 'draft',
      job_origin: 'draft_composer',
      created_at: '',
      updated_at: '',
    } as any, []);
    expect(legacy.intended_output).toBe('job');
    expect(legacy.title).toBe('Saved Draft Job');
    expect(legacy.scope).toBe('Saved scope');
  });

  test('switching intended output preserves shared Draft state and pricing', () => {
    const line = createWorkComposerLineDraft({
      line_title: 'Replace valve',
      description: 'Replace valve',
      quantity: '2',
      unit: 'each',
      unit_price: '17.99',
      labor_hours: '0.5',
      room_label: 'Laundry',
      location_label: 'Utility sink',
      internal_notes: 'Use quarter-turn shutoff',
    });
    const estimateDraft = createBlankSharedDraftComposerDraft({
      intended_output: 'estimate',
      homeowner_user_id: 'homeowner-1',
      home_id: 'home-1',
      title: 'Valve work',
      scope: 'Replace sink valve.',
      line_items: [line],
    });
    const jobDraft = { ...estimateDraft, intended_output: 'job' as const };
    const backToEstimate = { ...jobDraft, intended_output: 'estimate' as const };

    expect(backToEstimate.homeowner_user_id).toBe('homeowner-1');
    expect(backToEstimate.home_id).toBe('home-1');
    expect(backToEstimate.title).toBe('Valve work');
    expect(backToEstimate.scope).toBe('Replace sink valve.');
    expect(backToEstimate.line_items[0].unit_price).toBe('17.99');
    expect(backToEstimate.line_items[0].internal_notes).toBe('Use quarter-turn shutoff');
  });

  test('Save Draft maps only currently supported shared fields into existing Draft Job persistence', () => {
    const shared = createBlankSharedDraftComposerDraft({
      intended_output: 'estimate',
      subject_type: 'local',
      title: 'Fence repair',
      scope: 'Replace loose panel.',
      notes: 'Session-only note should not persist.',
      local_contact_id: 'local-1',
      local_home_id: 'local-home-1',
      line_items: [
        createWorkComposerLineDraft({
          line_title: 'Repair fence panel',
          description: 'Repair fence panel',
          quantity: '1.5',
          unit: 'hour',
          unit_price: '75',
          room_label: 'Back yard',
          location_label: 'Fence line',
          internal_notes: 'Bring exterior screws',
        }),
      ],
    });

    const draftJob = sharedDraftComposerDraftToDraftJobDraft(shared);
    const metadata = draftJobMetadataPayload(draftJob);
    const scope = draftJobScopePayload(draftJob);
    expect(draftJob).not.toHaveProperty('intended_output');
    expect(draftJob).not.toHaveProperty('work_format');
    expect(validateSharedDraftComposerDraftForSave(shared)).toBe('');
    expect(metadata).not.toHaveProperty('p_notes');
    expect(scope[0]).toMatchObject({
      title: 'Repair fence panel',
      unit_price_cents: 7500,
      room_label: 'Back yard',
      location_label: 'Fence line',
      internal_notes: 'Bring exterior screws',
    });
  });

  test('shared composer UI has Estimate and Job only, with no launch or top-level notes controls', () => {
    const composerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');
    const selectorSource = sourceFile('src/features/drafts/DraftOutcomeSelector.tsx');

    expect(selectorSource).toContain("label: 'Estimate'");
    expect(selectorSource).toContain("label: 'Job'");
    expect(selectorSource).not.toContain('Invoice');
    expect(composerSource).toContain('data-testid="shared-draft-composer"');
    expect(composerSource).toContain('Save Draft');
    expect(composerSource).toContain('Back to Work');
    expect(composerSource).not.toContain('Create Estimate');
    expect(composerSource).not.toContain('Create Job');
    expect(composerSource).not.toContain('Create Invoice');
    expect(composerSource).not.toContain('Launch');
    expect(composerSource).not.toContain('Notes / exclusions');
    expect(composerSource).not.toContain('Payment schedule');
    expect(composerSource).not.toContain('inspection_checklist');
  });

  test('component source keeps mobile and accessibility guardrails visible', () => {
    const composerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');
    const selectorSource = sourceFile('src/features/drafts/DraftOutcomeSelector.tsx');

    expect(selectorSource).toContain('<fieldset');
    expect(selectorSource).toContain('<legend');
    expect(selectorSource).toContain('role="radiogroup"');
    expect(selectorSource).toContain('type="radio"');
    expect(selectorSource).toContain('focus-within:ring-2');
    expect(selectorSource).toContain('min-h-11');
    expect(selectorSource).toContain('sm:grid-cols-2');
    expect(composerSource).toContain('min-h-11');
    expect(composerSource).not.toContain('fixed bottom');
    expect(composerSource).not.toContain('overflow-x');
  });

  test('work format is modeled for future expansion without rendering checklist UI', () => {
    const typeSource = sourceFile('src/features/drafts/draftComposerTypes.ts');
    const mappingSource = sourceFile('src/features/drafts/draftComposerMappings.ts');
    const composerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');

    expect(typeSource).toContain("export type DraftWorkFormat = 'standard';");
    expect(mappingSource).toContain("work_format: 'standard'");
    expect(composerSource).not.toContain('Work format');
    expect(composerSource).not.toContain('Checklist');
  });

  test('existing Draft Job composer remains the gate-off composer and still owns Create Job', () => {
    const legacyComposerSource = sourceFile('src/features/jobs/DraftJobComposer.tsx');
    const sharedComposerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');

    expect(legacyComposerSource).toContain('Create Job');
    expect(legacyComposerSource).toContain('Create operational job now');
    expect(sharedComposerSource).not.toContain('Create operational job now');
  });
});
