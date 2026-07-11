export const scenarioKey = 'water_heater_core_loop';

export const supportedCheckpointKeys = [
  'request_ready',
  'contractor_review_ready',
  'estimate_draft',
  'estimate_sent',
  'estimate_accepted',
  'job_created',
];

export const defaultCheckpointKey = 'job_created';

export const deferredCheckpointKeys = [
  'estimate_viewed',
  'job_in_progress',
  'job_completed',
  'invoice_draft',
  'invoice_sent',
  'invoice_paid',
  'home_history_updated',
];

export const lifecycleStepKeys = [
  'identities',
  'profilesAndCompany',
  'property',
  'connection',
  'request',
  'contractorReview',
  'estimateDraft',
  'estimateSent',
  'estimateAccepted',
  'jobCreated',
];

export const checkpointDefinitions = [
  {
    key: 'request_ready',
    displayName: 'Fresh Homeowner Request',
    primaryRole: 'homeowner',
    narrativePurpose: 'Show the homeowner-created water-heater service request before contractor response work begins.',
    requiredSteps: ['identities', 'profilesAndCompany', 'property', 'connection', 'request'],
    expected: {
      requestCount: 1,
      estimateCount: 0,
      jobCount: 0,
    },
  },
  {
    key: 'contractor_review_ready',
    displayName: 'Contractor Reviewing Request',
    primaryRole: 'contractor',
    narrativePurpose:
      'Show the request in a contractor-readable state. This is a narrative checkpoint; no separate core request status is fabricated.',
    requiredSteps: ['identities', 'profilesAndCompany', 'property', 'connection', 'request', 'contractorReview'],
    expected: {
      requestCount: 1,
      estimateCount: 0,
      jobCount: 0,
    },
  },
  {
    key: 'estimate_draft',
    displayName: 'Estimate Draft',
    primaryRole: 'contractor',
    narrativePurpose: 'Show the contractor draft estimate, line items, and payment schedule before sending.',
    requiredSteps: ['identities', 'profilesAndCompany', 'property', 'connection', 'request', 'contractorReview', 'estimateDraft'],
    expected: {
      requestCount: 1,
      estimateStatus: 'draft',
      estimateCount: 1,
      jobCount: 0,
    },
  },
  {
    key: 'estimate_sent',
    displayName: 'Estimate Sent',
    primaryRole: 'homeowner',
    narrativePurpose: 'Show the homeowner-facing sent estimate before approval.',
    requiredSteps: [
      'identities',
      'profilesAndCompany',
      'property',
      'connection',
      'request',
      'contractorReview',
      'estimateDraft',
      'estimateSent',
    ],
    expected: {
      requestCount: 1,
      estimateStatus: 'sent',
      estimateCount: 1,
      jobCount: 0,
    },
  },
  {
    key: 'estimate_accepted',
    displayName: 'Estimate Accepted',
    primaryRole: 'contractor',
    narrativePurpose: 'Show the accepted estimate immediately before contractor job creation.',
    requiredSteps: [
      'identities',
      'profilesAndCompany',
      'property',
      'connection',
      'request',
      'contractorReview',
      'estimateDraft',
      'estimateSent',
      'estimateAccepted',
    ],
    expected: {
      requestCount: 1,
      estimateStatus: 'accepted',
      estimateCount: 1,
      approvalEventCount: 1,
      jobCount: 0,
    },
  },
  {
    key: 'job_created',
    displayName: 'Job Created',
    primaryRole: 'contractor',
    narrativePurpose: 'Show the accepted estimate with the linked draft job created through the product RPC.',
    requiredSteps: [
      'identities',
      'profilesAndCompany',
      'property',
      'connection',
      'request',
      'contractorReview',
      'estimateDraft',
      'estimateSent',
      'estimateAccepted',
      'jobCreated',
    ],
    expected: {
      requestCount: 1,
      estimateStatus: 'accepted',
      estimateCount: 1,
      approvalEventCount: 1,
      jobCount: 1,
      jobCreatedEventCount: 1,
    },
  },
];

export const checkpointByKey = Object.fromEntries(checkpointDefinitions.map((checkpoint) => [checkpoint.key, checkpoint]));

export const personas = {
  homeowner: {
    emailEnv: 'DEMO_HOMEOWNER_EMAIL',
    passwordEnv: 'DEMO_HOMEOWNER_PASSWORD',
    defaultEmail: 'sarah.homeowner@example.test',
    fullName: 'Sarah Johnson',
    displayName: 'Sarah Johnson',
    phone: '251-555-0104',
  },
  contractor: {
    emailEnv: 'DEMO_CONTRACTOR_EMAIL',
    passwordEnv: 'DEMO_CONTRACTOR_PASSWORD',
    defaultEmail: 'marcus.owner@example.test',
    fullName: 'Marcus Bennett',
    contactName: 'Marcus Bennett',
    phone: '251-555-0118',
    businessName: 'Gulf Coast Home Services',
    slug: 'gulf-coast-home-services-demo',
  },
};

export const propertyFixture = {
  nickname: 'Demo Bay Home',
  address_line1: '1200 Demo Bay Lane',
  address_line2: '',
  city: 'Fairhope',
  state: 'AL',
  zip_code: '36532',
  home_type: 'Single-family home',
  year_built: '2006',
  square_feet: '2180',
  notes:
    'Fictional South Alabama demo property for ServSync recordings. No real customer address or service history.',
};

export const requestFixture = {
  category: 'Plumbing',
  urgency: 'normal',
  title: 'Replace leaking water heater',
  description:
    'The existing 40-gallon water heater is leaking near the base. We would like inspection and replacement options. Access is through the garage utility area, and an appointment within the next few days would be helpful.',
};

export const estimateFixture = {
  title: 'Water heater replacement estimate',
  scope:
    'Replace the leaking 40-gallon water heater in the garage utility area using fictional demo materials and normal demo installation steps.',
  notes: 'Demo estimate for presentation only. Pricing is fictional and should not be used as market guidance.',
  terms:
    'Demo terms: work may begin after approval. Final balance is due when the demo job is complete. No payment collection is enabled in Demo Mode.',
  subtotalCents: 216500,
  taxCents: 0,
  materialTotalCents: 166500,
  laborTotalCents: 50000,
  lines: [
    {
      line_type: 'labor',
      line_title: 'Remove and dispose of existing 40-gallon water heater',
      description: 'Remove the leaking unit and haul away from the demo property.',
      customer_description: 'Remove existing leaking water heater and dispose of it properly.',
      quantity: 1,
      unit: 'job',
      unit_price_cents: 27500,
      sort_order: 10,
      labor_hours: 2,
    },
    {
      line_type: 'material',
      line_title: 'Supply and install new 40-gallon water heater',
      description: 'Demo-grade replacement water heater and normal installation materials.',
      customer_description: 'Supply and install a fictional 40-gallon replacement water heater for demo purposes.',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 137500,
      sort_order: 20,
      supply_status: 'contractor_supplied',
    },
    {
      line_type: 'material',
      line_title: 'Replace water connections as required',
      description: 'Demo flexible water connectors and fittings.',
      customer_description: 'Replace water connections needed for the new unit.',
      quantity: 1,
      unit: 'allowance',
      unit_price_cents: 16500,
      sort_order: 30,
      supply_status: 'contractor_supplied',
    },
    {
      line_type: 'material',
      line_title: 'Install drain pan',
      description: 'Demo drain pan installed under replacement unit.',
      customer_description: 'Install or replace a drain pan under the new water heater.',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 12500,
      sort_order: 40,
      supply_status: 'contractor_supplied',
    },
    {
      line_type: 'labor',
      line_title: 'Test system and clean work area',
      description: 'Fill, test, verify basic operation, and clean the garage utility area.',
      customer_description: 'Test the replacement water heater and leave the work area clean.',
      quantity: 1,
      unit: 'job',
      unit_price_cents: 22500,
      sort_order: 50,
      labor_hours: 1.5,
    },
  ],
  paymentSchedule: [
    {
      invoice_type: 'deposit',
      label: 'Deposit',
      amount_type: 'fixed',
      amount_value: 350,
      calculated_amount_cents: 35000,
      due_trigger: 'Due on approval',
      sort_order: 10,
    },
    {
      invoice_type: 'final',
      label: 'Final payment',
      amount_type: 'fixed',
      amount_value: 1815,
      calculated_amount_cents: 181500,
      due_trigger: 'Due on completion',
      sort_order: 20,
    },
  ],
};

export const dateOffsets = {
  profileCreatedAtDays: -90,
  propertyCreatedAtDays: -75,
  connectionCreatedAtDays: -21,
  requestCreatedAtDays: -1,
  contractorReviewReadyHours: -20,
  estimateCreatedAtHours: -6,
  estimateSentAtHours: -4,
  estimateAcceptedAtHours: -2,
  jobCreatedAtHours: -1,
  visitWindowStartDays: 1,
  waterHeaterInstallDateDays: -2555,
  waterHeaterWarrantyDateDays: 1095,
};

export const presentationNotes = [
  'Use request_ready for homeowner request screenshots.',
  'Use contractor_review_ready for contractor intake screenshots.',
  'Use estimate_draft for contractor editing screenshots.',
  'Use estimate_sent for homeowner review screenshots.',
  'Use estimate_accepted for the approved-estimate handoff.',
  'Use job_created for the linked draft job state.',
];

export const waterHeaterCoreLoopScenario = {
  scenarioKey,
  displayName: 'Water Heater Core Loop Demo',
  description:
    'Dedicated demo scenario for homeowner request, contractor estimate, homeowner approval, and job creation.',
  personas,
  property: propertyFixture,
  request: requestFixture,
  contractor: personas.contractor,
  estimate: estimateFixture,
  checkpointDefinitions,
  supportedCheckpointKeys,
  defaultCheckpointKey,
  deferredCheckpointKeys,
  lifecycleStepKeys,
  dateOffsets,
  presentationNotes,
};
