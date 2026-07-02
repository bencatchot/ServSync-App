import { hvacSystemReplacementBundle } from './hvac/replace/hvac-system-replacement';
import { hvacSeasonalTuneUpBundle } from './hvac/service/hvac-seasonal-tune-up';
import { plumbingFaucetReplacementBundle } from './plumbing/replace/plumbing-faucet-replacement';
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
