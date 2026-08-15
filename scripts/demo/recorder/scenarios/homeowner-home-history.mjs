import {
  personas,
  propertyFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const homeownerHomeHistoryScenario = Object.freeze({
  key: 'homeowner-home-history',
  displayName: 'Homeowner reopens a completed work report',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'home_history_updated',
  finalCheckpoint: 'home_history_updated',
  fixturePolicy: 'Leave one canonical home_history_updated Demo fixture; the next run removes its exact private PDF before resetting registry-owned rows.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 12, max: 18 }),
  outputBaseName: 'servsync-homeowner-home-history-v1',
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
  scenes: Object.freeze([
    Object.freeze({
      key: 'open-home',
      identity: 'homeowner',
      caption: 'Open the home you want to look back on',
    }),
    Object.freeze({
      key: 'home-history',
      identity: 'homeowner',
      caption: 'Completed work stays with the home',
    }),
    Object.freeze({
      key: 'finalized-report',
      identity: 'homeowner',
      caption: 'Reopen the finalized report when you need it',
    }),
  ]),
  finalState: Object.freeze({
    homeHistoryTitle: requestFixture.title,
    contractorLabel: personas.contractor.businessName,
    reportFileName: 'Demo Bay Home - completed water heater work report.pdf',
  }),
});
