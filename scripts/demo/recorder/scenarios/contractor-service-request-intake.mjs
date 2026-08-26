import {
  personas,
  propertyFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const contractorServiceRequestIntakeScenario = Object.freeze({
  key: 'contractor-service-request-intake',
  displayName: 'Contractor reviews a homeowner service request',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'request_ready',
  finalCheckpoint: 'request_ready',
  fixturePolicy: 'Leave one canonical request_ready Demo fixture; recording is read-only after the registry-owned fixture seed.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 14, max: 34 }),
  outputBaseName: 'servsync-contractor-service-request-intake-v1',
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
      key: 'request-list',
      identity: 'contractor',
      caption: 'Open the homeowner service request',
    }),
    Object.freeze({
      key: 'request-details',
      identity: 'contractor',
      caption: 'Review the original request, customer, and home',
    }),
    Object.freeze({
      key: 'estimate-handoff',
      identity: 'contractor',
      caption: 'Start the estimate here to keep the request context attached',
    }),
  ]),
  finalState: Object.freeze({
    homeownerLabel: personas.homeowner.fullName,
    startChoiceTitle: 'Start your estimate',
    blankEstimateAction: 'Build blank estimate',
  }),
});
