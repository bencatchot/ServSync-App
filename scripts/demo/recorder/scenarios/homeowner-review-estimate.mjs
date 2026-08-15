import {
  estimateFixture,
  personas,
  propertyFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const homeownerReviewEstimateScenario = Object.freeze({
  key: 'homeowner-review-estimate',
  displayName: 'Homeowner reviews an estimate',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'estimate_sent',
  finalCheckpoint: 'estimate_accepted',
  fixturePolicy: 'Leave one canonical estimate_accepted Demo fixture; the next run resets only registry-owned scenario records.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 15, max: 22 }),
  outputBaseName: 'servsync-homeowner-review-estimate-v1',
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
    lineCount: estimateFixture.lines.length,
    paymentScheduleCount: estimateFixture.paymentSchedule.length,
    line: Object.freeze({ ...estimateFixture.lines[0] }),
  }),
  response: Object.freeze({ action: 'accept', resultingStatus: 'accepted' }),
  scenes: Object.freeze([
    Object.freeze({
      key: 'estimate-available',
      identity: 'homeowner',
      caption: 'Review the estimate',
    }),
    Object.freeze({
      key: 'estimate-details',
      identity: 'homeowner',
      caption: 'Respond when you are ready',
    }),
    Object.freeze({
      key: 'estimate-accepted',
      identity: 'homeowner',
      caption: 'Estimate accepted',
    }),
  ]),
  finalState: Object.freeze({
    estimateTitle: estimateFixture.title,
    estimateStatus: 'accepted',
    contractorLabel: personas.contractor.businessName,
  }),
});
