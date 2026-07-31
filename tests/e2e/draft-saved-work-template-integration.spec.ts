import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EstimateTemplate } from '../../src/types';
import { createBlankSharedDraftComposerDraft } from '../../src/features/drafts/draftComposerMappings';
import {
  applyEstimateTemplateToSharedDraft,
  draftHasMeaningfulSavedWorkTemplateContent,
  estimateTemplateReusableDraftContent,
} from '../../src/features/drafts/savedWorkTemplateDraftIntegration';
import { createWorkComposerLineDraft } from '../../src/features/work-composer/workComposerDrafts';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function sampleTemplate(overrides: Partial<EstimateTemplate> = {}): EstimateTemplate {
  return {
    id: 'template-1',
    contractor_id: 'contractor-1',
    name: 'Water heater swap',
    trade: 'Plumbing',
    scope: 'Replace the existing water heater.',
    notes: 'Confirm access and shutoff location.',
    terms: 'Due on completion.',
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    line_items: [
      {
        line_type: 'material',
        description: 'Install 50 gallon water heater',
        line_title: 'Water heater installation',
        customer_description: 'Includes standard installation supplies.',
        model_spec: 'Contractor selected',
        supply_status: 'contractor_supplied',
        quantity: 1,
        unit: 'each',
        unit_price_cents: 129900,
        labor_hours: 3.5,
        sort_order: 2,
      },
      {
        line_type: 'fee',
        description: 'Permit allowance',
        line_title: '',
        customer_description: '',
        model_spec: '',
        supply_status: null,
        quantity: 1,
        unit: 'permit',
        unit_price_cents: null,
        labor_hours: null,
        sort_order: 1,
      },
    ],
    ...overrides,
  };
}

test.describe('Draft saved work template integration', () => {
  test('maps contractor estimate templates to durable Draft-supported reusable content', () => {
    const mapped = estimateTemplateReusableDraftContent(sampleTemplate());

    expect(mapped.scope).toBe('Replace the existing water heater.');
    expect(mapped.notes).toBe('Confirm access and shutoff location.');
    expect(mapped.line_items).toHaveLength(2);
    expect(mapped.line_items[0]).toMatchObject({
      line_type: 'fee',
      description: 'Permit allowance',
      line_title: 'Permit allowance',
      quantity: '1',
      unit: 'permit',
      unit_price: '',
      labor_hours: '',
      editor_source_note: 'Suggested by saved work template: Water heater swap.',
    });
    expect(mapped.line_items[1]).toMatchObject({
      line_type: 'material',
      line_title: 'Water heater installation',
      customer_description: 'Includes standard installation supplies.',
      unit_price: '1299.00',
      labor_hours: '3.5',
    });
    expect(mapped.line_items[0].id).not.toBe(mapped.line_items[1].id);
    expect(mapped.line_items[0].job_work_item_id).toBeUndefined();
    expect(mapped.line_items[1].job_work_item_id).toBeUndefined();
  });

  test('replaces reusable Draft content without changing identity, output, or customer context', () => {
    const draft = createBlankSharedDraftComposerDraft({
      subject_type: 'local',
      local_contact_id: 'local-customer-1',
      local_home_id: 'local-home-1',
      title: 'Existing planning title',
      intended_output: 'invoice',
      invoice_session: { visited: true },
      scope: 'Old scope',
      notes: 'Old notes',
      line_items: [createWorkComposerLineDraft({ description: 'Old line' })],
    });

    const next = applyEstimateTemplateToSharedDraft(draft, sampleTemplate(), 'replace');

    expect(next.title).toBe('Existing planning title');
    expect(next.subject_type).toBe('local');
    expect(next.local_contact_id).toBe('local-customer-1');
    expect(next.local_home_id).toBe('local-home-1');
    expect(next.intended_output).toBe('invoice');
    expect(next.invoice_session.visited).toBe(true);
    expect(next.work_format).toBe('standard');
    expect(next.checklist_source).toBeNull();
    expect(next.scope).toBe('Replace the existing water heater.');
    expect(next.notes).toBe('Confirm access and shutoff location.');
    expect(next.line_items.map(line => line.description)).toEqual(['Permit allowance', 'Install 50 gallon water heater']);
  });

  test('adds template content after existing Draft content in stable template order', () => {
    const existingLine = createWorkComposerLineDraft({ description: 'Existing line', line_title: 'Existing line' });
    const draft = createBlankSharedDraftComposerDraft({
      scope: 'Existing scope',
      notes: 'Existing notes',
      line_items: [existingLine],
    });

    const next = applyEstimateTemplateToSharedDraft(draft, sampleTemplate(), 'add');

    expect(next.scope).toBe('Existing scope\n\nReplace the existing water heater.');
    expect(next.notes).toBe('Existing notes\n\nConfirm access and shutoff location.');
    expect(next.line_items.map(line => line.description)).toEqual([
      'Existing line',
      'Permit allowance',
      'Install 50 gallon water heater',
    ]);
    expect(next.line_items[0].id).toBe(existingLine.id);
    expect(next.line_items[1].id).not.toBe(existingLine.id);
    expect(next.line_items[2].id).not.toBe(existingLine.id);
  });

  test('detects non-empty Draft content before requiring Replace or Add confirmation', () => {
    expect(draftHasMeaningfulSavedWorkTemplateContent(createBlankSharedDraftComposerDraft())).toBe(false);
    expect(draftHasMeaningfulSavedWorkTemplateContent(createBlankSharedDraftComposerDraft({ title: 'Title only' }))).toBe(false);
    expect(draftHasMeaningfulSavedWorkTemplateContent(createBlankSharedDraftComposerDraft({ scope: 'Has scope' }))).toBe(true);
    expect(draftHasMeaningfulSavedWorkTemplateContent(createBlankSharedDraftComposerDraft({
      line_items: [createWorkComposerLineDraft({ description: 'Has a line' })],
    }))).toBe(true);
  });

  test('wires the Draft Composer picker to existing contractor-scoped templates without backend writes', () => {
    const appSource = sourceFile('src/App.tsx');
    const workspaceSource = sourceFile('src/features/drafts/DurableDraftWorkspace.tsx');
    const composerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');
    const helperSource = sourceFile('src/features/drafts/savedWorkTemplateDraftIntegration.ts');
    const templateGuidance = sourceBetween(
      composerSource,
      'data-testid="durable-draft-template-guidance"',
      "{composerField('Draft title'",
    );

    expect(appSource).toContain(".from('estimate_templates')");
    expect(appSource).toContain(".eq('contractor_id', loadedContractor.id)");
    expect(appSource.match(/savedWorkTemplates=\{estimateTemplates\}/g) ?? []).toHaveLength(2);
    expect(workspaceSource).toContain('savedWorkTemplates?: EstimateTemplate[];');
    expect(workspaceSource).toContain('savedWorkTemplates={savedWorkTemplates}');
    expect(templateGuidance).toContain('data-testid="durable-draft-template-picker-toggle"');
    expect(templateGuidance).toContain('Choose template');
    expect(templateGuidance).toContain('data-testid="durable-draft-template-picker"');
    expect(templateGuidance).toContain('data-testid="durable-draft-template-option"');
    expect(templateGuidance).toContain('data-testid="durable-draft-template-confirmation"');
    expect(templateGuidance).toContain('data-testid="durable-draft-template-replace"');
    expect(templateGuidance).toContain('data-testid="durable-draft-template-add"');
    expect(templateGuidance).toContain('data-testid="durable-draft-template-cancel"');
    expect(templateGuidance).toContain('saved template');
    expect(templateGuidance).not.toContain('Template starting points');
    expect(templateGuidance).not.toContain('Inspection Checklists');
    expect(templateGuidance).not.toContain('Home-specific Checklists');
    expect(composerSource).toContain('{!isChecklistDraft ? (');
    expect(composerSource).toContain('draftHasMeaningfulSavedWorkTemplateContent(draft)');
    expect(composerSource).toContain("applyTemplate(template, 'replace')");
    expect(composerSource).toContain("applyTemplate(pendingTemplate, 'add')");
    expect(helperSource).not.toContain('supabase.');
    expect(helperSource).not.toContain(".from('estimate_templates').insert");
    expect(helperSource).not.toContain(".from('estimate_templates').update");
    expect(helperSource).not.toContain(".from('estimate_templates').delete");
  });

  test('keeps template application away from launches, provider delivery, storage, and token surfaces', () => {
    const composerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');
    const helperSource = sourceFile('src/features/drafts/savedWorkTemplateDraftIntegration.ts');
    const combined = `${composerSource}\n${helperSource}`;

    expect(combined).not.toContain('launchContractorWorkDraft');
    expect(combined).not.toContain('onLaunch(');
    expect(combined).not.toContain('sendInvitation');
    expect(combined).not.toContain('sendEmail');
    expect(combined).not.toContain('sendSms');
    expect(combined).not.toContain('providerDelivery');
    expect(combined).not.toContain('localStorage');
    expect(combined).not.toContain('sessionStorage');
    expect(combined).not.toContain('invite_token');
    expect(combined).not.toContain('claim_url');
  });
});
