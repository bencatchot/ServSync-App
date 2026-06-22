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
import { ductlessMiniSplitInstallBundle } from './hvac/install/ductless-mini-split-install';
import { indoorAirQualityFilterOrAirPurifierInstallBundle } from './hvac/install/indoor-air-quality-filter-or-air-purifier-install';
import { wholeHomeDehumidifierInstallBundle } from './hvac/install/whole-home-dehumidifier-install';
import { zoningSystemInstallBundle } from './hvac/install/zoning-system-install';
import { ductRepairOrDuctSealingBundle } from './hvac/repair/duct-repair-or-duct-sealing';
import { furnaceGasValveOrControlBoardRepairBundle } from './hvac/repair/furnace-gas-valve-or-control-board-repair';
import { furnaceIgnitionOrFlameSensorRepairBundle } from './hvac/repair/furnace-ignition-or-flame-sensor-repair';
import { refrigerantLeakDiagnosisAndRepairBundle } from './hvac/repair/refrigerant-leak-diagnosis-and-repair';
import { airHandlerReplacementBundle } from './hvac/replace/air-handler-replacement';
import { blowerMotorReplacementBundle } from './hvac/replace/blower-motor-replacement';
import { capacitorReplacementBundle } from './hvac/replace/capacitor-replacement';
import { centralAcSystemReplacementBundle } from './hvac/replace/central-ac-system-replacement';
import { compressorReplacementBundle } from './hvac/replace/compressor-replacement';
import { condenserFanMotorReplacementBundle } from './hvac/replace/condenser-fan-motor-replacement';
import { ductworkReplacementOrModificationBundle } from './hvac/replace/ductwork-replacement-or-modification';
import { evaporatorCoilReplacementBundle } from './hvac/replace/evaporator-coil-replacement';
import { gasFurnaceReplacementBundle } from './hvac/replace/gas-furnace-replacement';
import { heatPumpSystemReplacementBundle } from './hvac/replace/heat-pump-system-replacement';
import { hvacSystemReplacementBundle } from './hvac/replace/hvac-system-replacement';
import { thermostatReplacementOrSmartThermostatInstallBundle } from './hvac/replace/thermostat-replacement-or-smart-thermostat-install';
import { condensateDrainCleaningOrRepairBundle } from './hvac/service/condensate-drain-cleaning-or-repair';
import { hvacDiagnosticServiceCallBundle } from './hvac/service/hvac-diagnostic-service-call';
import { seasonalHvacMaintenanceVisitBundle } from './hvac/service/seasonal-hvac-maintenance-visit';
import { electricalSafetyInspectionBundle } from './electrical/inspect/electrical-safety-inspection';
import { afciBreakerOrProtectionUpgradeBundle } from './electrical/install/afci-breaker-or-protection-upgrade';
import { applianceDisconnectOrWhipInstallationBundle } from './electrical/install/appliance-disconnect-or-whip-installation';
import { ceilingFanInstallationBundle } from './electrical/install/ceiling-fan-installation';
import { dimmerOrSmartSwitchInstallationBundle } from './electrical/install/dimmer-or-smart-switch-installation';
import { doorbellOrVideoDoorbellInstallationBundle } from './electrical/install/doorbell-or-video-doorbell-installation';
import { generatorInletOrTransferSwitchInstallationBundle } from './electrical/install/generator-inlet-or-transfer-switch-installation';
import { gfciOutletInstallationOrReplacementBundle } from './electrical/install/gfci-outlet-installation-or-replacement';
import { minorRoomWiringAdditionBundle } from './electrical/install/minor-room-wiring-addition';
import { outdoorReceptacleInstallationBundle } from './electrical/install/outdoor-receptacle-installation';
import { outdoorSecurityOrFloodLightInstallationBundle } from './electrical/install/outdoor-security-or-flood-light-installation';
import { recessedLightingInstallationBundle } from './electrical/install/recessed-lighting-installation';
import { smokeAndCoDetectorInstallationBundle } from './electrical/install/smoke-and-co-detector-installation';
import { subpanelInstallationBundle } from './electrical/install/subpanel-installation';
import { wholeHomeSurgeProtectorInstallationBundle } from './electrical/install/whole-home-surge-protector-installation';
import { atticOrCrawlspaceWiringRepairBundle } from './electrical/repair/attic-or-crawlspace-wiring-repair';
import { breakerReplacementOrPanelRepairBundle } from './electrical/repair/breaker-replacement-or-panel-repair';
import { poolOrSpaElectricalCorrectionBundle } from './electrical/repair/pool-or-spa-electrical-correction';
import { bathroomExhaustFanReplacementBundle } from './electrical/replace/bathroom-exhaust-fan-replacement';
import { outletOrSwitchReplacementBundle } from './electrical/replace/outlet-or-switch-replacement';
import { panelUpgradeOrReplacementBundle } from './electrical/replace/panel-upgrade-or-replacement';
import { electricalDiagnosticServiceCallBundle } from './electrical/service/electrical-diagnostic-service-call';
import { panelLabelingAndCircuitMappingBundle } from './electrical/service/panel-labeling-and-circuit-mapping';
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
  hvacDiagnosticServiceCallBundle,
  seasonalHvacMaintenanceVisitBundle,
  centralAcSystemReplacementBundle,
  heatPumpSystemReplacementBundle,
  gasFurnaceReplacementBundle,
  ductlessMiniSplitInstallBundle,
  thermostatReplacementOrSmartThermostatInstallBundle,
  capacitorReplacementBundle,
  condenserFanMotorReplacementBundle,
  blowerMotorReplacementBundle,
  condensateDrainCleaningOrRepairBundle,
  refrigerantLeakDiagnosisAndRepairBundle,
  evaporatorCoilReplacementBundle,
  compressorReplacementBundle,
  furnaceIgnitionOrFlameSensorRepairBundle,
  furnaceGasValveOrControlBoardRepairBundle,
  ductRepairOrDuctSealingBundle,
  ductworkReplacementOrModificationBundle,
  airHandlerReplacementBundle,
  indoorAirQualityFilterOrAirPurifierInstallBundle,
  wholeHomeDehumidifierInstallBundle,
  zoningSystemInstallBundle,
  tankStyleWaterHeaterReplacementBundle,
  drainCleaningServiceBundle,
  accessibleFixtureOrSupplyLeakRepairBundle,
  toiletReplacementBundle,
  faucetReplacementBundle,
  garbageDisposalReplacementBundle,
  electricalDiagnosticServiceCallBundle,
  outletOrSwitchReplacementBundle,
  ceilingFanInstallationBundle,
  gfciOutletInstallationOrReplacementBundle,
  breakerReplacementOrPanelRepairBundle,
  afciBreakerOrProtectionUpgradeBundle,
  electricalSafetyInspectionBundle,
  smokeAndCoDetectorInstallationBundle,
  recessedLightingInstallationBundle,
  dimmerOrSmartSwitchInstallationBundle,
  outdoorReceptacleInstallationBundle,
  outdoorSecurityOrFloodLightInstallationBundle,
  wholeHomeSurgeProtectorInstallationBundle,
  panelUpgradeOrReplacementBundle,
  subpanelInstallationBundle,
  generatorInletOrTransferSwitchInstallationBundle,
  bathroomExhaustFanReplacementBundle,
  doorbellOrVideoDoorbellInstallationBundle,
  panelLabelingAndCircuitMappingBundle,
  applianceDisconnectOrWhipInstallationBundle,
  atticOrCrawlspaceWiringRepairBundle,
  minorRoomWiringAdditionBundle,
  poolOrSpaElectricalCorrectionBundle,
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
