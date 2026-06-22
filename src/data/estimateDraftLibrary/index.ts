import { closetShelvingOrStorageInstallationBundle } from './carpentry/install/closet-shelving-or-storage-installation';
import { interiorAccentWallOrWainscotingInstallationBundle } from './carpentry/install/interior-accent-wall-or-wainscoting-installation';
import { smallWallFramingOrPartitionInstallationBundle } from './carpentry/install/small-wall-framing-or-partition-installation';
import { deckRepairBundle } from './carpentry/repair/deck-repair';
import { exteriorTrimOrWoodRotRepairBundle } from './carpentry/repair/exterior-trim-or-wood-rot-repair';
import { fenceOrGateRepairBundle } from './carpentry/repair/fence-or-gate-repair';
import { interiorTrimRepairOrReplacementBundle } from './carpentry/repair/interior-trim-repair-or-replacement';
import { porchColumnOrPostRepairBundle } from './carpentry/repair/porch-column-or-post-repair';
import { stairOrHandrailRepairBundle } from './carpentry/repair/stair-or-handrail-repair';
import { exteriorDoorReplacementBundle } from './carpentry/replace/exterior-door-replacement';
import { interiorDoorReplacementBundle } from './carpentry/replace/interior-door-replacement';
import { hvacSystemReplacementBundle } from './hvac/replace/hvac-system-replacement';
import { ceilingFanInstallationBundle } from './electrical/install/ceiling-fan-installation';
import { outletOrSwitchReplacementBundle } from './electrical/replace/outlet-or-switch-replacement';
import { electricalDiagnosticServiceCallBundle } from './electrical/service/electrical-diagnostic-service-call';
import { accessibleFixtureOrSupplyLeakRepairBundle } from './plumbing/repair/accessible-fixture-or-supply-leak-repair';
import { faucetReplacementBundle } from './plumbing/replace/faucet-replacement';
import { garbageDisposalReplacementBundle } from './plumbing/replace/garbage-disposal-replacement';
import { tankStyleWaterHeaterReplacementBundle } from './plumbing/replace/tank-style-water-heater-replacement';
import { toiletReplacementBundle } from './plumbing/replace/toilet-replacement';
import { drainCleaningServiceBundle } from './plumbing/service/drain-cleaning-service';
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
  tankStyleWaterHeaterReplacementBundle,
  drainCleaningServiceBundle,
  accessibleFixtureOrSupplyLeakRepairBundle,
  toiletReplacementBundle,
  faucetReplacementBundle,
  garbageDisposalReplacementBundle,
  electricalDiagnosticServiceCallBundle,
  outletOrSwitchReplacementBundle,
  ceilingFanInstallationBundle,
  deckRepairBundle,
  interiorDoorReplacementBundle,
  exteriorDoorReplacementBundle,
  interiorTrimRepairOrReplacementBundle,
  fenceOrGateRepairBundle,
  stairOrHandrailRepairBundle,
  exteriorTrimOrWoodRotRepairBundle,
  closetShelvingOrStorageInstallationBundle,
  porchColumnOrPostRepairBundle,
  smallWallFramingOrPartitionInstallationBundle,
  interiorAccentWallOrWainscotingInstallationBundle,
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
