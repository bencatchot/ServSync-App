export type DemoLineItem = {
  line_type: 'labor' | 'material' | 'fee' | 'other';
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
};

export const demoRecords = {
  homeowner: {
    fullName: 'Emily Smith',
    secondaryContact: 'John Smith',
    emailEnv: 'MARKETING_DEMO_HOMEOWNER_EMAIL',
    passwordEnv: 'MARKETING_DEMO_HOMEOWNER_PASSWORD',
    profile: {
      display_name: 'Emily Smith',
      phone: '(555) 010-0142',
      city: 'Fairhope',
      state: 'AL',
      zip_code: '36532',
    },
    home: {
      nickname: 'Smith Residence',
      address_line1: '18 Harborview Lane',
      address_line2: '',
      city: 'Fairhope',
      state: 'AL',
      zip_code: '36532',
      home_type: 'Single-family home',
      year_built: '1998',
      square_feet: '2,150',
      notes: 'Two-story home near Mobile Bay with a renovated kitchen and attached garage.',
    },
  },
  contractor: {
    fullName: 'Michael Turner',
    emailEnv: 'MARKETING_DEMO_CONTRACTOR_EMAIL',
    passwordEnv: 'MARKETING_DEMO_CONTRACTOR_PASSWORD',
    profile: {
      business_name: 'Harborview Plumbing Co.',
      slug: 'harborview-plumbing-co-demo',
      contact_name: 'Michael Turner',
      email: 'michael.turner.demo@example.com',
      phone: '(555) 010-0198',
      website_url: 'https://example.com/harborview-plumbing',
      city: 'Fairhope',
      state: 'AL',
      zip_code: '36532',
      service_categories: ['Plumbing'],
      service_zip_codes: ['36532', '36526', '36527', '36602'],
      license_number: '',
      insurance_status: '',
      bonded_status: '',
      business_summary:
        'Friendly plumbing service for Fairhope, Daphne, Spanish Fort, and nearby Mobile Bay homes.',
      external_review_links: [],
      public_profile_enabled: true,
      account_status: 'active',
    },
    serviceAreas: [
      {
        label: 'Fairhope and Eastern Shore',
        location_text: 'Fairhope, AL',
        zip_code: '36532',
        city: 'Fairhope',
        state: 'AL',
        radius_miles: 25,
        sort_order: 0,
      },
      {
        label: 'Daphne and Spanish Fort',
        location_text: 'Daphne, AL',
        zip_code: '36526',
        city: 'Daphne',
        state: 'AL',
        radius_miles: 25,
        sort_order: 1,
      },
    ],
  },
  localCustomer: {
    display_name: 'Emily Smith',
    phone: '(555) 010-0142',
    email: 'emily.smith.demo@example.com',
    notes: 'Homeowner prefers clear written estimates and photos when repairs are completed.',
    home_nickname: 'Smith Residence',
    address_line1: '18 Harborview Lane',
    address_line2: '',
    city: 'Fairhope',
    state: 'AL',
    zip_code: '36532',
    home_type: 'Single-family home',
    year_built: '1998',
    square_feet: '2,150',
    home_notes: 'Renovated kitchen, attached garage, and routine maintenance records kept in ServSync.',
  },
  serviceRequest: {
    title: 'Kitchen sink leak under cabinet',
    category: 'Plumbing',
    urgency: 'normal',
    description:
      'Water is collecting under the kitchen sink after running the faucet. Please inspect the drain and supply connections.',
  },
  estimate: {
    title: 'Kitchen Sink Leak Repair',
    scope:
      'Inspect the kitchen sink drain and supply connections, replace worn parts as needed, test for leaks, and clean the work area.',
    notes:
      'Final repair approach will be confirmed after the sink cabinet and visible plumbing connections are inspected.',
    terms:
      'Estimate includes the listed scope only. Additional work requires homeowner approval before it is performed.',
    lineItems: [
      {
        line_type: 'material',
        description: 'Kitchen sink drain and supply repair materials',
        quantity: 1,
        unit: 'allowance',
        unit_price_cents: 14500,
      },
      {
        line_type: 'labor',
        description: 'Inspect, repair, and test kitchen sink plumbing',
        quantity: 1,
        unit: 'service',
        unit_price_cents: 28500,
      },
    ] satisfies DemoLineItem[],
  },
  invoice: {
    title: 'Kitchen Sink Repair Invoice',
    scope:
      'Completed kitchen sink leak repair, replaced worn drain components, checked supply connections, and tested for active leaks.',
    notes: 'Repair was completed and the sink cabinet was checked for active leaks before cleanup.',
    terms: 'Payment instructions and warranty details are shown only as provided by the contractor.',
    lineItems: [
      {
        line_type: 'material',
        description: 'Drain repair parts and supplies',
        quantity: 1,
        unit: 'allowance',
        unit_price_cents: 14500,
      },
      {
        line_type: 'labor',
        description: 'Kitchen sink leak repair labor',
        quantity: 1,
        unit: 'service',
        unit_price_cents: 28500,
      },
    ] satisfies DemoLineItem[],
  },
} as const;
