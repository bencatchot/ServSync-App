import {
  personas,
  propertyFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const homeownerServiceRequestScenario = Object.freeze({
  key: 'homeowner-service-request',
  displayName: 'Homeowner service request',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'connected_request_ready',
  finalCheckpoint: 'request_ready',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 14, max: 40 }),
  outputBaseName: 'servsync-homeowner-service-request-v1',
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
      key: 'homeowner-submit',
      identity: 'homeowner',
      caption: 'A homeowner sends a service request',
    }),
    Object.freeze({
      key: 'contractor-review',
      identity: 'contractor',
      caption: 'The contractor sees it with the customer and home',
    }),
  ]),
  finalState: Object.freeze({
    contractorTab: 'Service Requests',
    requestTitle: requestFixture.title,
    homeownerLabel: personas.homeowner.fullName,
  }),
});
