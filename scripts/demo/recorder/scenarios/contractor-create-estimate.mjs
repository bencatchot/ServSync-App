import {
  personas,
  propertyFixture,
  recorderEstimateFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const contractorCreateEstimateScenario = Object.freeze({
  key: 'contractor-create-estimate',
  displayName: 'Contractor creates an estimate',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'request_ready',
  finalCheckpoint: 'estimate_draft',
  fixturePolicy: 'Leave one canonical estimate_draft Demo fixture; the next run resets only registry-owned scenario records.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 20, max: 40 }),
  outputBaseName: 'servsync-contractor-create-estimate-v1',
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
    ...recorderEstimateFixture,
    line: Object.freeze({ ...recorderEstimateFixture.line }),
    unitPrice: (recorderEstimateFixture.line.unit_price_cents / 100).toFixed(2),
  }),
  scenes: Object.freeze([
    Object.freeze({
      key: 'request-context',
      identity: 'contractor',
      caption: 'Start an estimate from the service request',
    }),
    Object.freeze({
      key: 'estimate-draft',
      identity: 'contractor',
      caption: 'Add clear scope and pricing',
    }),
    Object.freeze({
      key: 'estimate-saved',
      identity: 'contractor',
      caption: 'The estimate is saved with the customer',
    }),
  ]),
  finalState: Object.freeze({
    estimateTitle: recorderEstimateFixture.title,
    estimateStatus: 'draft',
    homeownerLabel: personas.homeowner.fullName,
  }),
});
