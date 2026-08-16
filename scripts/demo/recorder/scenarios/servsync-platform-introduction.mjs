import {
  personas,
  propertyFixture,
  estimateFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const servsyncPlatformIntroductionScenario = Object.freeze({
  key: 'servsync-platform-introduction',
  displayName: 'ServSync platform introduction',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'contractor_discovery_ready',
  finalCheckpoint: 'home_history_updated',
  fixturePolicy: 'Use only dedicated-Demo fictional data, register every per-run Discover and lifecycle row, and create canonical Invoice and finalized-report output through current ServSync product paths.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 65, max: 80 }),
  outputBaseName: 'servsync-platform-introduction-v2',
  identities: Object.freeze({
    homeowner: Object.freeze({ role: 'homeowner', label: personas.homeowner.fullName }),
    contractor: Object.freeze({ role: 'contractor', label: personas.contractor.businessName }),
  }),
  property: Object.freeze({
    nickname: propertyFixture.nickname,
    addressLine1: propertyFixture.address_line1,
    city: propertyFixture.city,
    state: propertyFixture.state,
    zipCode: propertyFixture.zip_code,
  }),
  request: Object.freeze({ ...requestFixture }),
  estimate: Object.freeze({ ...estimateFixture, line: estimateFixture.lines[0] }),
  scenes: Object.freeze([
    Object.freeze({ key: 'homeowner-need', caption: 'Finding the right help can start with a simple question' }),
    Object.freeze({ key: 'recommendation-list', caption: 'Then comes a list of names with limited context' }),
    Object.freeze({ key: 'contractor-side', caption: 'Small contractors are trying to be seen, too' }),
    Object.freeze({ key: 'servsync-intro', caption: 'ServSync is being built for both sides' }),
    Object.freeze({ key: 'discover', caption: 'Browse what local contractors are sharing' }),
    Object.freeze({ key: 'profile-connection', caption: 'Open a profile and choose whether to connect' }),
    Object.freeze({ key: 'service-request', caption: 'A service request ties the need to the home' }),
    Object.freeze({ key: 'estimate', caption: 'Review the scope and approve the estimate' }),
    Object.freeze({ key: 'job', caption: 'Agreed work moves into the job' }),
    Object.freeze({ key: 'invoice', caption: 'Billing stays with the same customer and work' }),
    Object.freeze({ key: 'home-history', caption: 'Finalized reports remain with the home' }),
    Object.freeze({ key: 'beta', caption: 'Create a free account and test ServSync during beta' }),
  ]),
  finalState: Object.freeze({
    invoiceTitlePattern: /Invoice/i,
    reportFileNamePattern: /^[a-z0-9-]+-Field-Work-\d{4}-\d{2}-\d{2}\.pdf$/i,
  }),
});
