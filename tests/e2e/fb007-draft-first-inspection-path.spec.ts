import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  draftChecklistSourceMatchesDraftSubject,
  type DraftChecklistSourceOption,
} from '../../src/features/drafts/checklistDraftScope';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const connectedOption: DraftChecklistSourceOption = {
  source_kind: 'home_inspection_checklist',
  source_id: '00000000-0000-4000-8000-000000000701',
  source_label: 'Connected home checklist',
  workflow_kind: 'inspection',
  job_type: 'inspection',
  source_updated_at: null,
  group_label: 'Home-specific Inspection Checklists',
  rooms: [{
    room: 'Exterior',
    room_id: 'exterior',
    display_name: 'Exterior',
    room_type: '',
    location_note: '',
    sort_order: 0,
    items: ['Inspect exterior condition'],
  }],
  subject_binding: {
    subject_type: 'connected',
    homeowner_user_id: '00000000-0000-4000-8000-000000000702',
    home_id: '00000000-0000-4000-8000-000000000703',
  },
};

const localOption: DraftChecklistSourceOption = {
  ...connectedOption,
  source_id: '00000000-0000-4000-8000-000000000704',
  source_label: 'Local home checklist',
  subject_binding: {
    subject_type: 'local',
    local_contact_id: '00000000-0000-4000-8000-000000000705',
    local_home_id: '00000000-0000-4000-8000-000000000706',
  },
};

const connectedDraftSubject = {
  subject_type: 'connected' as const,
  homeowner_user_id: '00000000-0000-4000-8000-000000000702',
  home_id: '00000000-0000-4000-8000-000000000703',
  local_contact_id: '',
  local_home_id: '',
};

async function installChecklistComposerHarness(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const composerModule = await dynamicImport('/src/features/drafts/ContractorDraftComposer.tsx');
    const mappingModule = await dynamicImport('/src/features/drafts/draftComposerMappings.ts');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const ContractorDraftComposer = composerModule.ContractorDraftComposer as (...args: unknown[]) => unknown;
    const createBlankDraft = mappingModule.createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;
    const checklist = (id: string, label: string, homeId: string, sourceKind = 'home_inspection_checklist') => ({
      source_kind: sourceKind,
      source_id: id,
      source_label: label,
      workflow_kind: 'inspection',
      job_type: 'inspection',
      source_updated_at: null,
      group_label: sourceKind === 'home_inspection_checklist' ? 'Home-specific Inspection Checklists' : 'Your Inspection Checklists',
      rooms: [{ room: 'Exterior', room_id: 'exterior', display_name: 'Exterior', room_type: '', location_note: '', sort_order: 0, items: ['Inspect exterior condition'] }],
      ...(sourceKind === 'home_inspection_checklist' ? {
        subject_binding: { subject_type: 'connected', homeowner_user_id: 'homeowner-1', home_id: homeId },
      } : {}),
    });
    const state = {
      draft: createBlankDraft({
        intended_output: 'job',
        work_format: 'inspection_checklist',
        subject_type: 'connected',
        homeowner_user_id: 'homeowner-1',
        home_id: 'home-1',
        title: 'Exterior inspection',
      }),
    };
    const connectedOptions = [{
      id: 'homeowner-1',
      label: 'Demo homeowner',
      properties: [
        { id: 'home-1', label: 'Primary home' },
        { id: 'home-2', label: 'Rental home' },
      ],
    }];
    const checklistOptions = [
      checklist('checklist-home-1', 'Primary home checklist', 'home-1'),
      checklist('checklist-home-2', 'Rental home checklist', 'home-2'),
      checklist('checklist-company', 'Company checklist', '', 'contractor_inspection_checklist'),
    ];

    document.body.innerHTML = '<main id="fb007-composer-root"></main>';
    const root = createRoot(document.getElementById('fb007-composer-root') as HTMLElement);
    const render = () => root.render(React.createElement(ContractorDraftComposer, {
      draft: state.draft,
      connectedOptions,
      localOptions: [],
      checklistOptions,
      canSave: true,
      saving: false,
      launchLabel: 'Create Job',
      onChange: (draft: Record<string, unknown>) => { state.draft = draft; render(); },
      onSave: () => undefined,
      onLaunch: () => undefined,
      onBack: () => undefined,
      onRemovePersistedLine: () => undefined,
    }));
    render();
  });
}

test.describe('FB-007 Draft-first Inspection Path Completion v1', () => {
  test('home-specific checklist eligibility follows the exact Draft subject', () => {
    expect(draftChecklistSourceMatchesDraftSubject(connectedOption, connectedDraftSubject)).toBe(true);
    expect(draftChecklistSourceMatchesDraftSubject(connectedOption, {
      ...connectedDraftSubject,
      home_id: '00000000-0000-4000-8000-000000000799',
    })).toBe(false);
    expect(draftChecklistSourceMatchesDraftSubject(localOption, {
      subject_type: 'local',
      homeowner_user_id: '',
      home_id: '',
      local_contact_id: '00000000-0000-4000-8000-000000000705',
      local_home_id: '00000000-0000-4000-8000-000000000706',
    })).toBe(true);
    expect(draftChecklistSourceMatchesDraftSubject(localOption, connectedDraftSubject)).toBe(false);

    const contractorOption = { ...connectedOption, source_kind: 'contractor_inspection_checklist' as const, subject_binding: undefined };
    expect(draftChecklistSourceMatchesDraftSubject(contractorOption, connectedDraftSubject)).toBe(true);
  });

  for (const viewport of [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`renders subject-scoped checklist selection without overflow on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installChecklistComposerHarness(page);

      const source = page.getByTestId('durable-draft-checklist-source');
      await expect(source.getByRole('option', { name: 'Primary home checklist' })).toHaveCount(1);
      await expect(source.getByRole('option', { name: 'Rental home checklist' })).toHaveCount(0);
      await expect(source.getByRole('option', { name: 'Company checklist' })).toHaveCount(1);
      await source.selectOption('home_inspection_checklist:checklist-home-1');
      await expect(page.getByTestId('durable-draft-checklist-summary')).toContainText('Primary home checklist');

      await page.getByTestId('durable-draft-property').selectOption('home-2');
      await expect(source).toHaveValue('');
      await expect(source.getByRole('option', { name: 'Primary home checklist' })).toHaveCount(0);
      await expect(source.getByRole('option', { name: 'Rental home checklist' })).toHaveCount(1);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('contextual connected and local starts converge on the shared Draft composer', () => {
    const app = sourceFile('src/App.tsx');

    expect(app).toContain('const openContextualSharedDraft = (');
    expect(app).toContain("intended_output: 'job' as const");
    expect(app).toContain("work_format: 'inspection_checklist' as const");
    expect(app).toContain('checklist_source: checklistOption ? createDraftChecklistSnapshot(checklistOption) : null');
    expect(app).toContain('draftChecklistSourceMatchesDraftSubject(option, baseDraft)');
    expect(app.match(/if \(openContextualSharedDraft\(/g)).toHaveLength(2);
    expect(app).toContain("subject_type: 'connected'");
    expect(app).toContain("subject_type: 'local'");
    expect(app).toContain('if (!sharedDraftComposerEnabled) return false;');
    expect(app).toContain('setInspectionNewDraft({');
  });

  test('checklist choices are subject-scoped and no longer depend on legacy search state', () => {
    const app = sourceFile('src/App.tsx');
    const composer = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');

    expect(app).toContain('...homeScopedInspectionTemplates.map(template => ({');
    expect(app).toContain('subject_binding: template.home_id');
    expect(app).toContain('...contractorScopedInspectionTemplates.filter(customTemplateLooksInspectionLike).map(template => ({');
    expect(composer).toContain('const eligibleChecklistOptions = checklistOptions.filter(option => draftChecklistSourceMatchesDraftSubject(option, draft));');
    expect(composer).toContain('const groupOptions = eligibleChecklistOptions.filter(option => option.group_label === group);');
    expect(composer).toContain('checklist_source: null');
  });

  test('not-applicable remains recorded and neutral across validation, UI, and PDF output', () => {
    const validator = sourceFile('src/features/drafts/durableDraftOutputValidation.ts');
    const status = sourceFile('src/features/findings/statusPresentation.ts');
    const pdf = sourceFile('src/utils/pdfDocuments.ts');

    expect(validator).toContain("'Not Applicable'");
    expect(status).toContain("status === 'Not Applicable'");
    expect(status).toContain("tone: 'muted'");
    expect(status).toContain("return status === 'Monitor' || status === 'Needs Repair' || status === 'Urgent';");
    expect(pdf).toContain("'Not Applicable': { bg:");
    expect(pdf).toContain('const notApplicableCount =');
    expect(pdf).toContain("{ label: 'N/A'");
    expect(pdf).toContain('const attentionFindings = recordedFindings.filter(f => findingStatusNeedsAttention(f.status));');

    const app = sourceFile('src/App.tsx');
    expect(app).not.toContain("findingStatusIsRecorded(f.status) && !['Pass', 'Fixed On Site'].includes(f.status)");
  });

  test('report lifecycle copy describes filing visibility and completion separately', () => {
    const app = sourceFile('src/App.tsx');

    expect(app).toContain('Finalize saves and files the PDF. For connected homeowners, it becomes available in Documents and Home History and creates an in-app notification.');
    expect(app).toContain('Complete job & send closes the linked request and sends the completion notice.');
    expect(app).not.toContain('It does not send anything until you choose to send it.');
  });

  test('SQL hardening is transactional, role-aware, and contains no application-data mutation', () => {
    const sql = sourceFile('servsync-draft-first-inspection-path-completion.sql');

    expect(sql).toMatch(/^--[\s\S]*\nbegin;/);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('public.current_user_can_manage_contractor_team(contractor_id)');
    expect(sql).toContain('public.current_user_can_write_contractor_jobs(i.contractor_id)');
    expect(sql).toContain('public.current_user_can_write_contractor_jobs(cp.id)');
    expect(sql).not.toContain('public.current_user_can_access_contractor(');
    expect(sql).toContain('revoke all on function public.servsync_can_upload_field_work_report_path(text) from public;');
    expect(sql).toContain('revoke all on function public.servsync_can_upload_field_work_report_path(text) from anon;');
    expect(sql).toContain('grant execute on function public.servsync_can_upload_field_work_report_path(text) to authenticated;');
    expect(sql).toContain('revoke all on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) from public;');
    expect(sql).toContain('revoke all on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) from anon;');
    expect(sql).toContain('grant execute on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) to authenticated;');
    expect(sql).toContain('revoke all on function public.servsync_notify_field_work_report(uuid) from public;');
    expect(sql).toContain('revoke all on function public.servsync_notify_field_work_report(uuid) from anon;');
    expect(sql).toContain('grant execute on function public.servsync_notify_field_work_report(uuid) to authenticated;');
    expect(sql).toContain('revoke all on function public.current_user_can_manage_contractor_team(uuid) from public;');
    expect(sql).toContain('revoke all on function public.current_user_can_manage_contractor_team(uuid) from anon;');
    expect(sql).toContain('grant execute on function public.current_user_can_manage_contractor_team(uuid) to authenticated;');
    expect(sql).toContain('revoke all on function public.current_user_can_write_contractor_jobs(uuid) from public;');
    expect(sql).toContain('revoke all on function public.current_user_can_write_contractor_jobs(uuid) from anon;');
    expect(sql).toContain('grant execute on function public.current_user_can_write_contractor_jobs(uuid) to authenticated;');
    expect(sql).toContain('revoke all on table public.inspection_templates from authenticated;');
    expect(sql).toContain('grant select, insert, update, delete on table public.inspection_templates to authenticated;');
    expect(sql).not.toMatch(/\buqgtheclhxqlnjpfmheq\b|\bzpzdkoaubyjtsomccxya\b|\bbdytwgejqnlblhrnqxkp\b/);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.|\bupdate\s+public\.|\bdelete\s+from\s+public\./i);
  });
});
