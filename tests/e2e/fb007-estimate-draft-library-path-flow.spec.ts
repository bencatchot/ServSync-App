import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findEstimateDraftLibraryBundle,
  findEstimateDraftLibraryBundleForScope,
} from '../../src/data/estimateDraftLibrary';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const pdfDocumentsSource = () => sourceFile('src/utils/pdfDocuments.ts');
const libraryIndexSource = () => sourceFile('src/data/estimateDraftLibrary/index.ts');
const libraryTypesSource = () => sourceFile('src/data/estimateDraftLibrary/types.ts');
const hvacBundleSource = () => sourceFile('src/data/estimateDraftLibrary/hvac/replace/hvac-system-replacement.ts');
const hvacTuneUpBundleSource = () => sourceFile('src/data/estimateDraftLibrary/hvac/service/hvac-seasonal-tune-up.ts');
const plumbingFaucetBundleSource = () => sourceFile('src/data/estimateDraftLibrary/plumbing/replace/plumbing-faucet-replacement.ts');
const carpentryTrimBundleSource = () => sourceFile('src/data/estimateDraftLibrary/carpentry/repair/carpentry-trim-baseboard-repair.ts');
const pressureWashingBundlePaths = [
  'src/data/estimateDraftLibrary/pressure_washing/service/house-exterior-soft-wash.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/driveway-concrete-cleaning.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/sidewalk-walkway-cleaning.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/patio-pool-deck-cleaning.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/deck-soft-wash.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/fence-washing.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/roof-soft-wash.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/gutter-exterior-brightening.ts',
  'src/data/estimateDraftLibrary/pressure_washing/service/commercial-flatwork-grease-cleanup.ts',
];
const pressureWashingBundleSources = () => pressureWashingBundlePaths.map(path => sourceFile(path));
const pressureWashingJobBundles = [
  'house_exterior_soft_wash',
  'driveway_concrete_cleaning',
  'sidewalk_walkway_cleaning',
  'patio_pool_deck_cleaning',
  'deck_soft_wash',
  'fence_washing',
  'roof_soft_wash',
  'gutter_exterior_brightening',
  'commercial_flatwork_grease_cleanup',
] as const;

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-007 Estimate Draft Library path-flow foundation', () => {
  test('Estimate Draft Library module exists and keeps only approved proof bundles wired', () => {
    const indexSource = libraryIndexSource();
    const typesSource = libraryTypesSource();
    const bundleSource = hvacBundleSource();
    const tuneUpBundleSource = hvacTuneUpBundleSource();
    const plumbingSource = plumbingFaucetBundleSource();
    const carpentrySource = carpentryTrimBundleSource();
    const bundleListSource = sourceBetween(indexSource, 'const ESTIMATE_DRAFT_LIBRARY_BUNDLES = [', '] satisfies EstimateDraftLibraryBundle[];');

    expect(indexSource).toContain("import { hvacSystemReplacementBundle } from './hvac/replace/hvac-system-replacement';");
    expect(indexSource).toContain("import { hvacSeasonalTuneUpBundle } from './hvac/service/hvac-seasonal-tune-up';");
    expect(indexSource).toContain("import { plumbingFaucetReplacementBundle } from './plumbing/replace/plumbing-faucet-replacement';");
    expect(indexSource).toContain("import { carpentryTrimBaseboardRepairBundle } from './carpentry/repair/carpentry-trim-baseboard-repair';");
    expect(indexSource).toContain("import { houseExteriorSoftWashBundle } from './pressure_washing/service/house-exterior-soft-wash';");
    expect(indexSource).toContain("import { commercialFlatworkGreaseCleanupBundle } from './pressure_washing/service/commercial-flatwork-grease-cleanup';");
    expect(indexSource).toContain('findEstimateDraftLibraryBundleForScope');
    expect(indexSource).toContain('estimateDraftLibraryTradeFromText');

    expect(typesSource).toContain("export type EstimateDraftLibraryTrade = 'hvac' | 'plumbing' | 'electrical' | 'carpentry' | 'pressure_washing' | 'other';");
    expect(typesSource).toContain("export type EstimateDraftLibraryWorkCategory = 'install' | 'repair' | 'replace' | 'inspect' | 'service';");
    expect(typesSource).toContain("export type EstimateDraftLibrarySuggestionBehavior =");
    expect(typesSource).toContain('local_code_sensitive?: boolean;');

    expect(bundleSource).toContain("trade: 'hvac'");
    expect(bundleSource).toContain("work_category: 'replace'");
    expect(bundleSource).toContain("job_bundle: 'hvac_system_replacement'");
    expect(bundleSource).toContain("display_name: 'HVAC System Replacement'");
    expect(bundleSource).toContain("aliases: [");
    expect(bundleSource).toContain("'replace hvac system'");

    expect(tuneUpBundleSource).toContain("trade: 'hvac'");
    expect(tuneUpBundleSource).toContain("work_category: 'service'");
    expect(tuneUpBundleSource).toContain("job_bundle: 'hvac_seasonal_tune_up'");
    expect(tuneUpBundleSource).toContain("display_name: 'HVAC Seasonal Tune-Up'");
    expect(tuneUpBundleSource).toContain("'seasonal hvac tune up'");
    expect(tuneUpBundleSource).toContain("'filter check'");

    expect(plumbingSource).toContain("trade: 'plumbing'");
    expect(plumbingSource).toContain("work_category: 'replace'");
    expect(plumbingSource).toContain("job_bundle: 'plumbing_faucet_replacement'");
    expect(plumbingSource).toContain("display_name: 'Plumbing Faucet Replacement'");
    expect(plumbingSource).toContain("'replace kitchen faucet'");
    expect(plumbingSource).toContain("'install replacement lavatory faucet'");

    expect(carpentrySource).toContain("trade: 'carpentry'");
    expect(carpentrySource).toContain("work_category: 'repair'");
    expect(carpentrySource).toContain("job_bundle: 'carpentry_trim_baseboard_repair'");
    expect(carpentrySource).toContain("display_name: 'Carpentry Trim/Baseboard Repair'");
    expect(carpentrySource).toContain("'repair damaged baseboard trim'");
    expect(carpentrySource).toContain("'replace short section of interior trim'");

    expect(bundleListSource).toContain('hvacSystemReplacementBundle');
    expect(bundleListSource).toContain('hvacSeasonalTuneUpBundle');
    expect(bundleListSource).toContain('plumbingFaucetReplacementBundle');
    expect(bundleListSource).toContain('carpentryTrimBaseboardRepairBundle');
    expect(bundleListSource).toContain('houseExteriorSoftWashBundle');
    expect(bundleListSource).toContain('drivewayConcreteCleaningBundle');
    expect(bundleListSource).toContain('sidewalkWalkwayCleaningBundle');
    expect(bundleListSource).toContain('patioPoolDeckCleaningBundle');
    expect(bundleListSource).toContain('deckSoftWashBundle');
    expect(bundleListSource).toContain('fenceWashingBundle');
    expect(bundleListSource).toContain('roofSoftWashBundle');
    expect(bundleListSource).toContain('gutterExteriorBrighteningBundle');
    expect(bundleListSource).toContain('commercialFlatworkGreaseCleanupBundle');
    expect(bundleListSource).not.toContain('toilet');
    expect(bundleListSource).not.toContain('garbage');
    expect(bundleListSource).not.toContain('electrical');
    expect(bundleListSource).not.toContain('door');
    expect(bundleListSource).not.toContain('drywall');
    expect(bundleListSource).not.toContain('flooring');
  });

  test('resolver matches approved proof-bundle scopes while leaving unrelated scopes to fallback', () => {
    const matchingReplacementBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'replace',
      rough_scope: 'Replace HVAC system with furnace and AC changeout after site review',
    });
    const matchingTuneUpBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'service',
      rough_scope: 'Seasonal HVAC tune up and filter check',
    });
    const matchingMaintenanceBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'service',
      rough_scope: 'HVAC maintenance visit for AC tune-up and furnace tune-up',
    });
    const matchingFaucetBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'replace',
      rough_scope: 'Replace kitchen faucet with owner-approved replacement fixture',
    });
    const matchingLavatoryBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'replace',
      rough_scope: 'Install replacement lavatory faucet in the bathroom vanity',
    });
    const matchingCarpentryTrimBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Repair damaged baseboard trim in the hallway',
    });
    const matchingCarpentryInteriorTrimBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Replace short section of interior trim after contractor review',
    });
    const nonMatchingFaucetRepair = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'repair',
      rough_scope: 'Repair leaking faucet cartridge and diagnose drip',
    });
    const nonMatchingPlumbingDisposal = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'replace',
      rough_scope: 'Replace garbage disposal under kitchen sink',
    });
    const nonMatchingPlumbingToilet = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'replace',
      rough_scope: 'Toilet replacement with wax ring and flange review',
    });
    const nonMatchingWaterHeater = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'replace',
      rough_scope: 'Water heater replacement and pan installation',
    });
    const nonMatchingElectrical = findEstimateDraftLibraryBundleForScope({
      trade: 'electrical',
      work_category: 'replace',
      rough_scope: 'Replace outlet and switch',
    });
    const nonMatchingCarpentryDoor = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Repair interior door that will not close',
    });
    const nonMatchingDrywall = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Patch drywall hole and texture wall',
    });
    const nonMatchingFlooring = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Repair damaged flooring near baseboard',
    });
    const nonMatchingExteriorTrim = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Repair exterior trim and siding',
    });
    const nonMatchingRotWaterDamage = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Repair rotten water damaged framing and mold behind trim',
    });
    const nonMatchingCabinetry = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Repair cabinet door and drawer slides',
    });
    const nonMatchingDeckRailing = findEstimateDraftLibraryBundleForScope({
      trade: 'carpentry',
      work_category: 'repair',
      rough_scope: 'Repair deck railing and stairs',
    });
    const nonMatchingTrade = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'replace',
      rough_scope: 'Replace HVAC system',
    });
    const nonMatchingReplacementScope = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'replace',
      rough_scope: 'Seasonal tune up and filter check',
    });
    const nonMatchingServiceScope = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'service',
      rough_scope: 'Refrigerant leak repair and ductwork replacement',
    });
    const matchingHouseSoftWashBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'pressure_washing',
      work_category: 'service',
      rough_scope: 'Soft wash house exterior siding and soffits',
    });
    const matchingDrivewayBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'pressure_washing',
      work_category: 'service',
      rough_scope: 'Pressure wash driveway concrete and review oil stains',
    });
    const matchingRoofBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'pressure_washing',
      work_category: 'service',
      rough_scope: 'Roof soft wash for black streaks and algae',
    });
    const matchingCommercialBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'pressure_washing',
      work_category: 'service',
      rough_scope: 'Commercial flatwork grease cleanup around restaurant dumpster pad',
    });
    const nonMatchingPressureWashingRepair = findEstimateDraftLibraryBundleForScope({
      trade: 'pressure_washing',
      work_category: 'repair',
      rough_scope: 'Repair pressure washer pump',
    });
    const nonMatchingPressureWashingTrade = findEstimateDraftLibraryBundleForScope({
      trade: 'plumbing',
      work_category: 'service',
      rough_scope: 'Roof soft wash for black streaks',
    });

    expect(matchingReplacementBundle?.job_bundle).toBe('hvac_system_replacement');
    expect(matchingReplacementBundle?.trade).toBe('hvac');
    expect(matchingReplacementBundle?.work_category).toBe('replace');
    expect(matchingTuneUpBundle?.job_bundle).toBe('hvac_seasonal_tune_up');
    expect(matchingTuneUpBundle?.work_category).toBe('service');
    expect(matchingMaintenanceBundle?.job_bundle).toBe('hvac_seasonal_tune_up');
    expect(matchingFaucetBundle?.job_bundle).toBe('plumbing_faucet_replacement');
    expect(matchingFaucetBundle?.trade).toBe('plumbing');
    expect(matchingFaucetBundle?.work_category).toBe('replace');
    expect(matchingLavatoryBundle?.job_bundle).toBe('plumbing_faucet_replacement');
    expect(matchingCarpentryTrimBundle?.job_bundle).toBe('carpentry_trim_baseboard_repair');
    expect(matchingCarpentryTrimBundle?.trade).toBe('carpentry');
    expect(matchingCarpentryTrimBundle?.work_category).toBe('repair');
    expect(matchingCarpentryInteriorTrimBundle?.job_bundle).toBe('carpentry_trim_baseboard_repair');
    expect(nonMatchingFaucetRepair).toBeNull();
    expect(nonMatchingPlumbingDisposal).toBeNull();
    expect(nonMatchingPlumbingToilet).toBeNull();
    expect(nonMatchingWaterHeater).toBeNull();
    expect(nonMatchingElectrical).toBeNull();
    expect(nonMatchingCarpentryDoor).toBeNull();
    expect(nonMatchingDrywall).toBeNull();
    expect(nonMatchingFlooring).toBeNull();
    expect(nonMatchingExteriorTrim).toBeNull();
    expect(nonMatchingRotWaterDamage).toBeNull();
    expect(nonMatchingCabinetry).toBeNull();
    expect(nonMatchingDeckRailing).toBeNull();
    expect(nonMatchingTrade).toBeNull();
    expect(nonMatchingReplacementScope).toBeNull();
    expect(nonMatchingServiceScope).toBeNull();
    expect(matchingHouseSoftWashBundle?.job_bundle).toBe('house_exterior_soft_wash');
    expect(matchingHouseSoftWashBundle?.trade).toBe('pressure_washing');
    expect(matchingHouseSoftWashBundle?.work_category).toBe('service');
    expect(matchingDrivewayBundle?.job_bundle).toBe('driveway_concrete_cleaning');
    expect(matchingRoofBundle?.job_bundle).toBe('roof_soft_wash');
    expect(matchingCommercialBundle?.job_bundle).toBe('commercial_flatwork_grease_cleanup');
    expect(nonMatchingPressureWashingRepair).toBeNull();
    expect(nonMatchingPressureWashingTrade).toBeNull();

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
    const tuneUpBundleSource = hvacTuneUpBundleSource();
    const plumbingSource = plumbingFaucetBundleSource();
    const carpentrySource = carpentryTrimBundleSource();
    const builderSource = sourceBetween(app, 'function estimateDraftLibraryBundleItems', 'function estimateDraftLibraryNotes');
    const seedSource = sourceBetween(app, 'function estimateDraftLibrarySeedFromItem', 'function estimateDraftLibraryBundleItems');
    const lineSource = sourceBetween(app, 'function estimateBuilderLineFromSeed', 'function customerFacingRoughScope');

    expect(bundleSource).toContain("suggestion_behavior: 'default_candidate'");
    expect(bundleSource).toContain("suggestion_behavior: 'optional_candidate'");
    expect(tuneUpBundleSource).toContain("suggestion_behavior: 'default_candidate'");
    expect(tuneUpBundleSource).toContain("suggestion_behavior: 'optional_candidate'");
    expect(plumbingSource).toContain("suggestion_behavior: 'default_candidate'");
    expect(plumbingSource).toContain("suggestion_behavior: 'optional_candidate'");
    expect(plumbingSource).toContain("suggestion_behavior: 'review_only'");
    expect(carpentrySource).toContain("suggestion_behavior: 'default_candidate'");
    expect(carpentrySource).toContain("suggestion_behavior: 'optional_candidate'");
    expect(carpentrySource).toContain("suggestion_behavior: 'review_only'");
    pressureWashingBundleSources().forEach(bundleSource => {
      expect(bundleSource).toContain("trade: 'pressure_washing'");
      expect(bundleSource).toContain("work_category: 'service'");
      expect(bundleSource).toContain("suggestion_behavior: 'default_candidate'");
      expect(bundleSource).toContain("suggestion_behavior: 'review_only'");
    });
    expect(builderSource).toContain("return behavior === 'default_candidate' || behavior === 'optional_candidate';");
    expect(builderSource).not.toContain("behavior === 'review_only'");
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
    const bundleSources = [hvacBundleSource(), hvacTuneUpBundleSource(), plumbingFaucetBundleSource(), carpentryTrimBundleSource(), ...pressureWashingBundleSources()];
    const typesSource = libraryTypesSource();

    bundleSources.forEach(bundleSource => {
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
  });

  test('contractor review reminders and rationale remain editor-only', () => {
    const app = appSource();
    const bundleSources = [hvacBundleSource(), hvacTuneUpBundleSource(), plumbingFaucetBundleSource(), carpentryTrimBundleSource(), ...pressureWashingBundleSources()];
    const editorNoteSource = sourceBetween(app, 'function estimateDraftLibraryItemEditorNote', 'function estimateDraftLibrarySeedFromItem');
    const homeownerSource = sourceBetween(app, 'function HomeownerDashboard', 'function ContractorDashboard');
    const pdfSource = pdfDocumentsSource();

    bundleSources.forEach(bundleSource => {
      expect(bundleSource).toContain('contractor_review_reminders');
      expect(bundleSource).toContain('contractor_review_required: true');
    });
    expect(editorNoteSource).toContain('Contractor review required before finalizing this estimate.');
    expect(editorNoteSource).toContain('Review flags:');
    expect(editorNoteSource).toContain('Suggested by Estimate Draft Library');

    for (const publicSource of [homeownerSource, pdfSource]) {
      expect(publicSource).not.toContain('estimateDraftLibrary');
      expect(publicSource).not.toContain('Estimate Draft Library');
      expect(publicSource).not.toContain('contractor_review_reminders');
      expect(publicSource).not.toContain('local_code_sensitive');
      expect(publicSource).not.toContain('Contractor review required before finalizing this estimate.');
      expect(publicSource).not.toContain('Review flags:');
    }
  });

  test('pressure washing service bundles are discoverable, unpriced, and keep sensitive metadata contractor-only', () => {
    const pressureBundles = pressureWashingJobBundles.map(job_bundle => findEstimateDraftLibraryBundle({
      trade: 'pressure_washing',
      work_category: 'service',
      job_bundle,
    }));

    expect(pressureBundles).toHaveLength(9);
    pressureBundles.forEach(bundle => {
      expect(bundle).not.toBeNull();
      expect(bundle?.trade).toBe('pressure_washing');
      expect(bundle?.work_category).toBe('service');
      expect(bundle?.sections.length).toBeGreaterThan(0);
      expect(bundle?.excluded_items).toContain('pricing');
      expect(bundle?.sections.flatMap(section => section.items).some(item => item.suggestion_behavior === 'default_candidate')).toBe(true);
    });

    const allPressureItems = pressureBundles.flatMap(bundle => bundle?.sections.flatMap(section => section.items) ?? []);
    const generatedPressureItems = allPressureItems.filter(item => {
      const behavior = item.suggestion_behavior || 'default_candidate';
      return behavior === 'default_candidate' || behavior === 'optional_candidate';
    });
    const sensitivePressureItems = allPressureItems.filter(item =>
      item.local_code_sensitive
      || /runoff|wastewater|grease|degreaser|chemical|downspout/i.test(`${item.id} ${item.title} ${item.editor_note || ''}`)
    );
    const customerFacingText = [
      ...allPressureItems.map(item => item.customer_description || ''),
      ...pressureBundles.flatMap(bundle => bundle?.customer_note_candidates.map(candidate => candidate.text) ?? []),
      ...pressureBundles.flatMap(bundle => bundle?.terms_candidates.map(candidate => candidate.text) ?? []),
    ].join('\n');
    const contractorOnlyText = [
      ...allPressureItems.map(item => item.editor_note || ''),
      ...pressureBundles.flatMap(bundle => bundle?.contractor_review_reminders.map(reminder => reminder.detail) ?? []),
    ].filter(Boolean);

    expect(generatedPressureItems.length).toBeGreaterThan(0);
    generatedPressureItems.forEach(item => {
      expect(item).not.toHaveProperty('unit_price');
      expect(item).not.toHaveProperty('default_unit_price');
      expect(item).not.toHaveProperty('price_cents');
      expect(item.title).toBeTruthy();
      expect(item.unit).toBeTruthy();
    });
    expect(sensitivePressureItems.length).toBeGreaterThan(0);
    sensitivePressureItems.forEach(item => {
      expect(item.contractor_review_required).toBe(true);
      expect(item.review_flags?.length).toBeGreaterThan(0);
    });
    expect(allPressureItems.filter(item => item.local_code_sensitive).every(item => item.contractor_review_required)).toBe(true);
    expect(allPressureItems.filter(item => item.local_code_sensitive).every(item => item.review_flags?.some(flag => flag === 'code' || flag === 'regional'))).toBe(true);
    expect(customerFacingText).not.toMatch(/contractor must verify|silently added|before adding this line|confirm chemical choice/i);
    contractorOnlyText.forEach(note => {
      expect(customerFacingText).not.toContain(note);
    });
  });

  test('library internals stay out of homeowner, PDF, invoice quick-pick, AI, and backend surfaces', () => {
    const app = appSource();
    const homeownerSource = sourceBetween(app, 'function HomeownerDashboard', 'function ContractorDashboard');
    const pdfSource = pdfDocumentsSource();
    const invoiceComposerSource = sourceBetween(app, 'function createBlankInvoiceDraft', 'function estimateDocumentLabel');
    const referenceToolsSource = sourceBetween(app, 'const renderEstimateReferenceTools =', 'const startEstimateAssistantSpeech');

    expect(homeownerSource).not.toContain('estimateDraftLibrary');
    expect(pdfSource).not.toContain('estimateDraftLibrary');
    expect(invoiceComposerSource).not.toContain('estimateDraftLibrary');
    expect(referenceToolsSource).not.toContain('estimateDraftLibrary');
    expect(app).not.toContain('const renderAdvancedTradeTools =');

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
      expect(hvacTuneUpBundleSource()).not.toContain(prohibitedPath);
      expect(plumbingFaucetBundleSource()).not.toContain(prohibitedPath);
      expect(carpentryTrimBundleSource()).not.toContain(prohibitedPath);
      pressureWashingBundleSources().forEach(bundleSource => expect(bundleSource).not.toContain(prohibitedPath));
    }
  });
});
