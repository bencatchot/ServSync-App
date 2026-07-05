import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Jobs template taxonomy', () => {
  test('Jobs overview uses clarified template helper copy', () => {
    const source = appSource();
    const jobsOverviewSource = sourceBetween(
      source,
      'data-testid="contractor-jobs-overview-tools-list"',
      "{contractorJobsView === 'new_financial' && (",
    );

    expect(jobsOverviewSource).toContain('Saved work templates and inspection checklists');
    expect(jobsOverviewSource).not.toContain('Workflow and estimate starters');
  });

  test('Templates library separates saved work templates from inspection checklists', () => {
    const source = appSource();
    const templatesSource = sourceBetween(
      source,
      "{contractorJobsView === 'templates' && (",
      "{contractorJobsView === 'overview' && (",
    );

    expect(templatesSource).toContain('Saved Work Templates');
    expect(templatesSource).toContain('Saved estimate starters for scope, terms, line items, and optional pricing. Direct-job and invoice template starts are future work.');
    expect(templatesSource).toContain('Inspection Checklists');
    expect(templatesSource).toContain('Your Inspection Checklists');
    expect(templatesSource).toContain('Home-specific Inspection Checklists');
    expect(templatesSource).toContain('Home-specific checklists are saved inspection/report layouts for a property. Full Home Setup Templates and Home Map tools are future work.');
    expect(templatesSource).not.toContain('Your estimate templates');
    expect(templatesSource).not.toContain('Inspection templates');
    expect(templatesSource).not.toContain('Your Templates');
    expect(templatesSource).not.toContain('Home Templates');
  });

  test('home-scoped inspection checklist UI no longer uses general Home Templates labels', () => {
    const source = appSource();
    const homeScopedSource = sourceBetween(
      source,
      'const defaultHomeTemplateName =',
      'const persistInspectionRooms =',
    ) + sourceBetween(
      source,
      '{homeTemplatePrompt && (',
      "{contractorTab === 'overview' && (",
    );

    expect(homeScopedSource).toContain('Home-specific Inspection Checklist');
    expect(homeScopedSource).toContain('home-specific inspection checklist');
    expect(homeScopedSource).not.toContain('Home Template');
    expect(homeScopedSource).not.toContain('home template');
  });

  test('saved work templates still use estimate template data and inspection checklists still use inspection templates', () => {
    const source = appSource();
    const loadSource = sourceBetween(source, '// Load inspection templates and inspections', 'if (!estimateTemplatesRes.error) setEstimateTemplates');
    const estimateTemplateStartSource = sourceBetween(source, 'const renderSavedEstimateTemplateStartPicker =', 'const renderBuildEstimateDraftPanel =');
    const templatesSource = sourceBetween(source, "{contractorJobsView === 'templates' && (", "{contractorJobsView === 'overview' && (");

    expect(loadSource).toContain(".from('inspection_templates')");
    expect(loadSource).toContain(".from('estimate_templates')");
    expect(estimateTemplateStartSource).toContain('estimateTemplates.map(template =>');
    expect(templatesSource).toContain('estimateTemplates.length');
    expect(templatesSource).toContain('contractorScopedInspectionTemplates.length');
    expect(templatesSource).toContain('homeScopedInspectionTemplates.length');
  });

  test('direct service job creation remains separate from estimate templates', () => {
    const source = appSource();
    const createJobSource = sourceBetween(source, 'const startNewInspection = async () => {', 'const saveTemplate = async () => {');
    const newJobFormSource = sourceBetween(source, "{inspectionView === 'new' && (", "{inspectionView === 'detail' && activeInspection && (() => {");

    expect(createJobSource).toContain("supabase.rpc('servsync_create_field_work'");
    expect(createJobSource).not.toContain('estimate_templates');
    expect(createJobSource).not.toContain('estimateDraftFromTemplate');
    expect(newJobFormSource).toContain('Blank Service Job');
    expect(newJobFormSource).toContain('Repair');
    expect(newJobFormSource).toContain('Install');
  });

  test('does not add forbidden backend or platform-scope changes', () => {
    const source = appSource();

    expect(source).not.toContain('createWorkTemplate');
    expect(source).not.toContain('home_map');
    expect(source).not.toContain('floor_plan');
  });
});
