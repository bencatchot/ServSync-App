import {
  estimateFixture,
  personas,
  propertyFixture,
  requestFixture,
} from '../../scenarios/water-heater-core-loop.mjs';

export const contractorInvoiceOutsidePaymentScenario = Object.freeze({
  key: 'contractor-invoice-outside-payment',
  displayName: 'Contractor delivers an Invoice and records an outside payment',
  fixtureScenarioKey: 'water_heater_core_loop',
  initialCheckpoint: 'job_completed',
  finalCheckpoint: 'invoice_partially_paid',
  fixturePolicy: 'Start from one registry-owned completed Job, adopt only its exact UI-created Invoice and offline-payment ledger row, and preserve the complete customer, property, Request, Estimate, Job, Invoice, and payment lineage for exact-row reset.',
  environment: Object.freeze({
    name: 'ServSync Demo',
    projectRef: 'bdytwgejqnlblhrnqxkp',
    appUrl: 'https://servsync-demo.vercel.app',
  }),
  viewport: Object.freeze({ width: 1440, height: 900 }),
  expectedDurationSeconds: Object.freeze({ min: 38, max: 90 }),
  outputBaseName: 'servsync-contractor-invoice-outside-payment-v1',
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
  request: Object.freeze({ ...requestFixture }),
  estimate: Object.freeze({
    title: estimateFixture.title,
    scope: estimateFixture.scope,
    totalCents: estimateFixture.subtotalCents + estimateFixture.taxCents,
    line: Object.freeze({ ...estimateFixture.lines[0] }),
  }),
  payment: Object.freeze({
    amountCents: 40000,
    amountInput: '400.00',
    method: 'bank_transfer',
    methodLabel: 'Bank transfer / external ACH',
    reference: 'DEMO-PARTIAL',
    note: 'Fictional Demo offline payment record. No money was processed.',
  }),
  scenes: Object.freeze([
    Object.freeze({
      key: 'completed-job',
      identity: 'contractor',
      caption: 'Create the Invoice from completed work',
    }),
    Object.freeze({
      key: 'invoice-draft',
      identity: 'contractor',
      caption: 'Review and send the Invoice to the customer',
    }),
    Object.freeze({
      key: 'invoice-delivered',
      identity: 'homeowner',
      caption: 'The customer can now view the delivered Invoice',
    }),
    Object.freeze({
      key: 'outside-payment',
      identity: 'contractor',
      caption: 'Record money received outside ServSync',
    }),
    Object.freeze({
      key: 'payment-recorded',
      identity: 'contractor',
      caption: 'ServSync updates the balance without processing money',
    }),
  ]),
  finalState: Object.freeze({
    estimateTitle: estimateFixture.title,
    homeownerLabel: personas.homeowner.fullName,
    contractorLabel: personas.contractor.businessName,
    statusLabel: 'Partially Paid',
    amountPaidLabel: '$400.00',
    balanceDueLabel: '$1,765.00',
    paymentFeedback: 'Payment recorded',
  }),
});
