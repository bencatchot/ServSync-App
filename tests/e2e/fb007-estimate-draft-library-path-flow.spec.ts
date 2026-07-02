import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findEstimateDraftLibraryBundleForScope,
} from '../../src/data/estimateDraftLibrary';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const pdfDocumentsSource = () => sourceFile('src/utils/pdfDocuments.ts');
const libraryIndexSource = () => sourceFile('src/data/estimateDraftLibrary/index.ts');
const libraryTypesSource = () => sourceFile('src/data/estimateDraftLibrary/types.ts');
const hvacBundleSource = () => sourceFile('src/data/estimateDraftLibrary/hvac/replace/hvac-system-replacement.ts');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-007 Estimate Draft Library path-flow foundation', () => {
  test('Estimate Draft Library module exists and keeps one HVAC replacement proof bundle wired', () => {
    const indexSource = libraryIndexSource();
    const typesSource = libraryTypesSource();
    const bundleSource = hvacBundleSource();

    expect(indexSource).toContain("import { hvacSystemReplacementBundle } from './hvac/replace/hvac-system-replacement';");
    expect(indexSource).toContain('const ESTIMATE_DRAFT_LIBRARY_BUNDLES = [\n  hvacSystemReplacementBundle,\n] satisfies EstimateDraftLibraryBundle[];');
    expect(indexSource).toContain('findEstimateDraftLibraryBundleForScope');
    expect(indexSource).toContain('estimateDraftLibraryTradeFromText');

    expect(typesSource).toContain("export type EstimateDraftLibraryTrade = 'hvac' | 'plumbing' | 'electrical' | 'carpentry' | 'other';");
    expect(typesSource).toContain("export type EstimateDraftLibraryWorkCategory = 'install' | 'repair' | 'replace' | 'inspect' | 'service';");
    expect(typesSource).toContain("export type EstimateDraftLibrarySuggestionBehavior =");

    expect(bundleSource).toContain("trade: 'hvac'");
    expect(bundleSource).toContain("work_category: 'replace'");
    expect(bundleSource).toContain("job_bundle: 'hvac_system_replacement'");
    expect(bundleSource).toContain("display_name: 'HVAC System Replacement'");
    expect(bundleSource).toContain("aliases: [");
    expect(bundleSource).toContain("'replace hvac system'");
  });

  test('resolver matches HVAC replacement scopes and leaves unrelated scopes to rule-based fallback', () => {
    const matchingBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'replace',
      rough_scope: 'Replace HVAC system with furnace and AC changeout after site review',
    });
    const nonMatchingTrade = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'replace',
      rough_scope: 'Replace HVAC system',
    });
    const nonMatchingScope = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'replace',
      rough_scope: 'Seasonal tune up and filter check',
    });

    expect(matchingBundle?.job_bundle).toBe('hvac_system_replacement');
    expect(matchingBundle?.trade).toBe('hvac');
    expect(matchingBundle?.work_category).toBe('replace');
    expect(nonMatchingTrade).toBeNull();
    expect(nonMatchingScope).toBeNull();

    const app = appSource();
    const builderSource = sourceBetween(app, 'const libraryBundle = resolveEstimateDraftLibraryBundle({', 'const mergeMode = chooseEstimateDraftBuilderMergeMode');
    const noticeSource = sourceBetween(app, 'const libraryCopy = builtDraft.libraryBundleName', 'const inferenceCopy = [');

    expect(builderSource).toContain('? buildEstimateDraftFromLibraryBundle({');
    expect(builderSource).toContain(': buildRuleBasedEstimateDraft({');
    expect(noticeSource).toContain('Used Estimate Draft Library path');
    expect(noticeSource).toContain('No matching Estimate Draft Library bundle was found, so the existing rule-based builder was used.');
  });

  test('default and optional library candidates become editable price-required estimate draft lines', () => {
    const app = appSource();
    const bundleSource = hvacBundleSource();
    const builderSource = sourceBetween(app, 'function estimateDraftLibraryBundleItems', 'function estimateDraftLibraryNotes');
    const seedSource = sourceBetween(app, 'function estimateDraftLibrarySeedFromItem', 'function estimateDraftLibraryBundleItems');
    const lineSource = sourceBetween(app, 'function estimateBuilderLineFromSeed', 'function customerFacingRoughScope');

    expect(bundleSource).toContain("suggestion_behavior: 'default_candidate'");
    expect(bundleSource).toContain("suggestion_behavior: 'optional_candidate'");
    expect(builderSource).toContain("return behavior === 'default_candidate' || behavior === 'optional_candidate';");
    expect(seedSource).toContain('line_type: item.line_type');
    expect(seedSource).toContain('description: item.title');
    expect(seedSource).toContain('unit: item.unit');
    expect(seedSource).toContain('editor_source_note: estimateDraftLibraryItemEditorNote(bundle, item)');
    expect(lineSource).toContain('createEstimateLineDraft({');
    expect(lineSource).toContain("unit_price: ''");
    expect(lineSource).toContain('builderGenerated: true');
    expect(lineSource).toContain('editor_source_note: estimateBuilderEditorSourceNote(seed)');
  });

  test('library bundle remains price-free and avoids pricing/tax/category/assembly behavior', () => {
    const bundleSource = hvacBundleSource();
    const typesSource = libraryTypesSource();

    for (const prohibitedField of [
      'unit_price',
      'default_unit_price',
      'price_cents',
      'default_quantity',
      'taxable',
      'margin',
      'assembly',
      'invoice',
      '$',
    ]) {
      expect(bundleSource).not.toContain(prohibitedField);
      expect(typesSource).not.toContain(prohibitedField);
    }

    expect(bundleSource).toContain("'pricing'");
    expect(bundleSource).toContain('excluded_items');
  });

  test('contractor review reminders and rationale remain editor-only', () => {
    const app = appSource();
    const bundleSource = hvacBundleSource();
    const editorNoteSource = sourceBetween(app, 'function estimateDraftLibraryItemEditorNote', 'function estimateDraftLibrarySeedFromItem');
    const homeownerSource = sourceBetween(app, 'function HomeownerDashboard', 'function ContractorDashboard');
    const pdfSource = pdfDocumentsSource();

    expect(bundleSource).toContain('contractor_review_reminders');
    expect(bundleSource).toContain('contractor_review_required: true');
    expect(editorNoteSource).toContain('Contractor review required before finalizing this estimate.');
    expect(editorNoteSource).toContain('Review flags:');
    expect(editorNoteSource).toContain('Suggested by Estimate Draft Library');

    for (const publicSource of [homeownerSource, pdfSource]) {
      expect(publicSource).not.toContain('estimateDraftLibrary');
      expect(publicSource).not.toContain('Estimate Draft Library');
      expect(publicSource).not.toContain('contractor_review_reminders');
      expect(publicSource).not.toContain('Contractor review required before finalizing this estimate.');
      expect(publicSource).not.toContain('Review flags:');
    }
  });

  test('library internals stay out of homeowner, PDF, invoice quick-pick, AI, and backend surfaces', () => {
    const app = appSource();
    const homeownerSource = sourceBetween(app, 'function HomeownerDashboard', 'function ContractorDashboard');
    const pdfSource = pdfDocumentsSource();
    const invoiceComposerSource = sourceBetween(app, 'function createBlankInvoiceDraft', 'function estimateDocumentLabel');
    const advancedToolsSource = sourceBetween(app, 'const renderAdvancedTradeTools =', 'const applyTradeToolEstimateDraft');

    expect(homeownerSource).not.toContain('estimateDraftLibrary');
    expect(pdfSource).not.toContain('estimateDraftLibrary');
    expect(invoiceComposerSource).not.toContain('estimateDraftLibrary');
    expect(advancedToolsSource).not.toContain('estimateDraftLibrary');

    for (const prohibitedPath of [
      'supabase/functions',
      'servsync-',
      'CREATE POLICY',
      'CREATE FUNCTION',
      'ALTER TABLE',
      'VITE_',
      'vercel',
    ]) {
      expect(libraryIndexSource()).not.toContain(prohibitedPath);
      expect(hvacBundleSource()).not.toContain(prohibitedPath);
    }
  });
});
