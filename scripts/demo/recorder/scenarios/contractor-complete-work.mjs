import {
  estimateFixture,
  personas,
  propertyFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const contractorCompleteWorkScenario = Object.freeze({
  key: 'contractor-complete-work',
  displayName: 'Contractor completes work and finalizes the service record',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'estimate_accepted',
  finalCheckpoint: 'home_history_updated',
  fixturePolicy: 'Start from one registry-owned accepted Estimate, adopt only its exact UI-created Job and descendants, and leave one canonical finalized-report lineage for the next exact-row reset.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 50, max: 115 }),
  outputBaseName: 'servsync-contractor-complete-work-v1',
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
  estimate: Object.freeze({
    title: estimateFixture.title,
    scope: estimateFixture.scope,
    totalCents: estimateFixture.subtotalCents + estimateFixture.taxCents,
    line: Object.freeze({ ...estimateFixture.lines[0] }),
  }),
  work: Object.freeze({
    completionNote: 'Replaced the leaking water heater, tested the final connections, and recorded the completed service visit.',
  }),
  scenes: Object.freeze([
    Object.freeze({
      key: 'accepted-estimate',
      identity: 'contractor',
      caption: 'Create the Job from the accepted Estimate',
    }),
    Object.freeze({
      key: 'job-work',
      identity: 'contractor',
      caption: 'Record the work completed during the visit',
    }),
    Object.freeze({
      key: 'job-complete',
      identity: 'contractor',
      caption: 'Complete the Job when the agreed work is finished',
    }),
    Object.freeze({
      key: 'report-finalized',
      identity: 'contractor',
      caption: 'Finalize the report to save the service record',
    }),
  ]),
  finalState: Object.freeze({
    estimateTitle: estimateFixture.title,
    homeownerLabel: personas.homeowner.fullName,
    contractorLabel: personas.contractor.businessName,
    reportFeedback: 'Report finalized',
  }),
});
