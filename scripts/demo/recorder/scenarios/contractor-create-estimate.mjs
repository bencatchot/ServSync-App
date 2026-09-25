import {
  personas,
  propertyFixture,
  recorderEstimateFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const contractorCreateEstimateScenario = Object.freeze({
  key: 'contractor-create-estimate',
  displayName: 'Contractor creates an estimate',
  fixtureScenarioKey: 'draft_first_estimate',
  initialCheckpoint: 'draft_ready',
  finalCheckpoint: 'estimate_draft',
  fixturePolicy: 'Use an isolated draft_first_estimate run; clean only exact registered Draft/output records after recording; shared customer/property remain read-only.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 55, max: 180 }),
  outputBaseName: 'servsync-contractor-create-estimate-v2',
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
  showSceneCallouts: false,
  scenes: Object.freeze([
    Object.freeze({
      key: 'work-draft',
      identity: 'contractor',
      caption: 'Open Work and start a new Draft',
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
