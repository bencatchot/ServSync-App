import type {
  MarketingBusinessProfile,
  MarketingRecentContentContext,
} from '../../src/features/marketing/marketingPlanning';

export const operationalPlannerV3Profile: MarketingBusinessProfile = {
  id: '00000000-0000-4000-8000-000000000038',
  workspaceKey: 'servsync_internal',
  workspaceKind: 'internal',
  contractorId: null,
  businessName: 'ServSync',
  businessSummary: 'ServSync connects homeowners and contractors while helping small service businesses keep requests, estimates, approvals, jobs, invoices, customer communication, and property history organized.',
  audienceSegments: [
    'Small contractors', 'HVAC', 'Plumbing contractors', 'Electrical contractors', 'Carpentry',
    'Lawn care and landscaping', 'Pressure washing', 'Handyman/general maintenance', 'Homeowners',
  ],
  serviceFocus: [
    'Contractor work organization', 'Homeowner and contractor connections', 'Customer requests',
    'Estimates and approvals', 'Jobs and finalized work reports', 'Invoices and manual payments',
    'Home History and homeowner records', 'Product education and demonstrations',
  ],
  primaryGoal: 'Increase qualified small-contractor awareness, consideration, and signups for ServSync.',
  secondaryGoals: ['Increase homeowner adoption', 'Educate contractors and homeowners', 'Explain current product workflows'],
  geographicFocus: null,
  toneStyle: 'Plainspoken, practical, approachable, useful, credible, non-corporate, and not hype-heavy.',
  offers: [],
  preferredChannels: ['social', 'website', 'video'],
  emphasizedTopics: [
    'Organizing service work', 'Customer requests', 'Estimates and approvals', 'Jobs and reports',
    'Invoices and manual payments', 'Customer communication', 'Home History and homeowner records',
    'Contractor discovery and profiles', 'Secure document links', 'Connected homeowner relationships',
    'Trade-specific examples', 'Product demonstrations', 'Practical contractor and homeowner problems',
  ],
  avoidedTopics: ['Unsupported metrics', 'Invented testimonials', 'Guarantees', 'Unsupported integrations', 'Manufactured competitor claims'],
  ownerNotes: 'Create deliberate audience, trade, topic, and format variety over time; each item should have one clear audience and one primary idea. Homeowner value should stand on its own merits.',
  status: 'ready',
  version: 2,
  updatedAt: '2026-08-10T22:00:00.000Z',
};

const recentItems: Array<[string, string]> = [
  ['What should stay connected after a customer calls?', 'educational_post'],
  ['Video concept: One customer, two useful paths', 'short_video_concept'],
  ['Let the estimate move forward before account setup', 'feature_highlight'],
  ['Secure link or connected homeowner account?', 'educational_post'],
  ['Not every HVAC customer needs the same starting point', 'linkedin_post'],
  ["When a customer asks, 'Do I need an account?'", 'facebook_instagram_post'],
  ['Demo concept: follow one HVAC service call', 'short_video_concept'],
  ['Send an Estimate without forcing an account signup', 'feature_highlight'],
  ['When one service call lives in too many places', 'facebook_instagram_post'],
  ['A more organized customer workflow for small HVAC teams', 'linkedin_post'],
];

export const operationalPlannerV3RecentContent: MarketingRecentContentContext = {
  windowLimit: 20,
  itemCount: recentItems.length,
  items: recentItems.map(([title, contentRole], index) => ({
    id: `42000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title,
    status: index < 3 ? 'approved' : 'draft',
    intendedAudience: 'hvac_contractors',
    contentRole,
    updatedAt: `2026-08-10T${String(22 - Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '30' : '00'}:00.000Z`,
  })),
};
