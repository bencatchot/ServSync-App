import {
  personas,
  propertyFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const homeownerConnectServiceRequestScenario = Object.freeze({
  key: 'homeowner-connect-service-request',
  displayName: 'Homeowner connects and requests service',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'contractor_discovery_ready',
  finalCheckpoint: 'request_ready',
  fixturePolicy: 'Start with one fictional Demo home and no Gulf Coast connection, create and accept one exact contextual connection through the real product UI, submit one exact service Request, and retain only registry-owned lineage for guarded reset.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 42, max: 110 }),
  outputBaseName: 'servsync-homeowner-connect-service-request-v1',
  showSceneCallouts: false,
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
  connection: Object.freeze({
    message: 'I need help with a leaking water heater at Demo Bay Home.',
    shareContact: true,
    shareHomeOverview: true,
    shareAddress: true,
  }),
  request: Object.freeze({ ...requestFixture }),
  scenes: Object.freeze([
    Object.freeze({ key: 'choose-contractor', identity: 'homeowner', caption: 'Choose the contractor you want to connect with' }),
    Object.freeze({ key: 'share-home', identity: 'homeowner', caption: 'Choose the correct home and the details needed for service' }),
    Object.freeze({ key: 'connection-active', identity: 'homeowner', caption: 'After acceptance, the contractor is ready for a service request' }),
    Object.freeze({ key: 'request-details', identity: 'homeowner', caption: 'Describe the work clearly and review the selected home' }),
    Object.freeze({ key: 'request-sent', identity: 'homeowner', caption: 'The request keeps the contractor, home, and work details together' }),
  ]),
  finalState: Object.freeze({
    requestTitle: requestFixture.title,
    homeownerLabel: personas.homeowner.fullName,
    contractorLabel: personas.contractor.businessName,
  }),
});
