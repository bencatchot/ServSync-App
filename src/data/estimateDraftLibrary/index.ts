import { hvacSystemReplacementBundle } from './hvac/replace/hvac-system-replacement';
import { hvacSeasonalTuneUpBundle } from './hvac/service/hvac-seasonal-tune-up';
import { plumbingFaucetReplacementBundle } from './plumbing/replace/plumbing-faucet-replacement';
import { carpentryTrimBaseboardRepairBundle } from './carpentry/repair/carpentry-trim-baseboard-repair';
import { commercialFlatworkGreaseCleanupBundle } from './pressure_washing/service/commercial-flatwork-grease-cleanup';
import { deckSoftWashBundle } from './pressure_washing/service/deck-soft-wash';
import { drivewayConcreteCleaningBundle } from './pressure_washing/service/driveway-concrete-cleaning';
import { fenceWashingBundle } from './pressure_washing/service/fence-washing';
import { gutterExteriorBrighteningBundle } from './pressure_washing/service/gutter-exterior-brightening';
import { houseExteriorSoftWashBundle } from './pressure_washing/service/house-exterior-soft-wash';
import { patioPoolDeckCleaningBundle } from './pressure_washing/service/patio-pool-deck-cleaning';
import { roofSoftWashBundle } from './pressure_washing/service/roof-soft-wash';
import { sidewalkWalkwayCleaningBundle } from './pressure_washing/service/sidewalk-walkway-cleaning';
import type {
  EstimateDraftLibraryBundle,
  EstimateDraftLibraryTrade,
  EstimateDraftLibraryWorkCategory,
} from './types';

export type {
  ContractorReviewReminder,
  EstimateDraftLibraryBundle,
  EstimateDraftLibraryItem,
  EstimateDraftLibrarySection,
  EstimateDraftLibraryTrade,
  EstimateDraftLibraryWorkCategory,
  NotesTermsCandidate,
  ScopeWordingHelper,
} from './types';

const ESTIMATE_DRAFT_LIBRARY_BUNDLES = [
  hvacSystemReplacementBundle,
  hvacSeasonalTuneUpBundle,
  plumbingFaucetReplacementBundle,
  carpentryTrimBaseboardRepairBundle,
  houseExteriorSoftWashBundle,
  drivewayConcreteCleaningBundle,
  sidewalkWalkwayCleaningBundle,
  patioPoolDeckCleaningBundle,
  deckSoftWashBundle,
  fenceWashingBundle,
  roofSoftWashBundle,
  gutterExteriorBrighteningBundle,
  commercialFlatworkGreaseCleanupBundle,
] satisfies EstimateDraftLibraryBundle[];

function normalizeLibraryKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function estimateDraftLibraryTradeFromText(value: string): EstimateDraftLibraryTrade | null {
  const normalized = normalizeLibraryKey(value);
  if (normalized === 'hvac' || normalized === 'heating_cooling' || normalized === 'heating_and_cooling') return 'hvac';
  if (normalized === 'plumbing' || normalized === 'plumber') return 'plumbing';
  if (normalized === 'electrical' || normalized === 'electrician') return 'electrical';
  if (normalized === 'carpentry' || normalized === 'carpenter') return 'carpentry';
  if (normalized === 'pressure_washing' || normalized === 'power_washing' || normalized === 'exterior_cleaning') return 'pressure_washing';
  if (normalized === 'other' || normalized === 'general' || normalized === 'general_maintenance') return 'other';
  return null;
}

export function findEstimateDraftLibraryBundle({
  trade,
  work_category,
  job_bundle,
}: {
  trade: EstimateDraftLibraryTrade;
  work_category: EstimateDraftLibraryWorkCategory;
  job_bundle: string;
}) {
  const normalizedBundle = normalizeLibraryKey(job_bundle);
  return ESTIMATE_DRAFT_LIBRARY_BUNDLES.find(bundle =>
    bundle.trade === trade
    && bundle.work_category === work_category
    && normalizeLibraryKey(bundle.job_bundle) === normalizedBundle
  ) ?? null;
}

export function findEstimateDraftLibraryBundleForScope({
  trade,
  work_category,
  rough_scope,
}: {
  trade: EstimateDraftLibraryTrade;
  work_category: EstimateDraftLibraryWorkCategory;
  rough_scope: string;
}) {
  const normalizedScope = normalizeLibraryKey(rough_scope);
  if (!normalizedScope) return null;
  return ESTIMATE_DRAFT_LIBRARY_BUNDLES.find(bundle => {
    if (bundle.trade !== trade || bundle.work_category !== work_category) return false;
    return bundle.aliases.some(alias => normalizedScope.includes(normalizeLibraryKey(alias)));
  }) ?? null;
}
