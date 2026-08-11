export const MARKETING_AUDIENCE_TAXONOMY_VERSION = 1;

export type MarketingAudienceKind = 'contractor' | 'homeowner' | 'other';
export type MarketingAudienceScope = 'general_contractor' | 'trade_contractor' | 'homeowner' | 'other';
export type MarketingPlanningTheme = 'service_work' | 'customer_relationship' | 'home_records' | 'business_presence' | 'product_education' | 'tenant_specific';

type AudienceDefinition = {
  key: string;
  label: string;
  kind: MarketingAudienceKind;
  scope: MarketingAudienceScope;
  aliases: string[];
};

const AUDIENCE_DEFINITIONS: AudienceDefinition[] = [
  {
    key: 'small_contractors',
    label: 'Small contractors',
    kind: 'contractor',
    scope: 'general_contractor',
    aliases: ['small contractor', 'small contractors', 'small service contractor', 'small service contractors'],
  },
  {
    key: 'hvac_contractors',
    label: 'HVAC contractors',
    kind: 'contractor',
    scope: 'trade_contractor',
    aliases: ['hvac', 'hvac contractor', 'hvac contractors'],
  },
  {
    key: 'plumbers',
    label: 'Plumbing contractors',
    kind: 'contractor',
    scope: 'trade_contractor',
    aliases: ['plumber', 'plumbers', 'plumbing', 'plumbing contractor', 'plumbing contractors'],
  },
  {
    key: 'electricians',
    label: 'Electrical contractors',
    kind: 'contractor',
    scope: 'trade_contractor',
    aliases: ['electrician', 'electricians', 'electrical', 'electrical contractor', 'electrical contractors'],
  },
  {
    key: 'carpentry_contractors',
    label: 'Carpentry contractors',
    kind: 'contractor',
    scope: 'trade_contractor',
    aliases: ['carpenter', 'carpenters', 'carpentry', 'carpentry contractor', 'carpentry contractors'],
  },
  {
    key: 'lawn_landscaping_contractors',
    label: 'Lawn care and landscaping contractors',
    kind: 'contractor',
    scope: 'trade_contractor',
    aliases: [
      'landscaper',
      'landscapers',
      'landscaping',
      'landscaping contractor',
      'landscaping contractors',
      'lawn care',
      'lawn care and landscaping',
      'lawn care contractor',
      'lawn care contractors',
    ],
  },
  {
    key: 'pressure_washing_contractors',
    label: 'Pressure washing contractors',
    kind: 'contractor',
    scope: 'trade_contractor',
    aliases: ['pressure washing', 'pressure washer', 'pressure washers', 'pressure washing contractor', 'pressure washing contractors'],
  },
  {
    key: 'handyman_contractors',
    label: 'Handyman and general maintenance contractors',
    kind: 'contractor',
    scope: 'trade_contractor',
    aliases: [
      'handyman',
      'handymen',
      'general maintenance',
      'handyman and general maintenance',
      'handyman contractor',
      'handyman contractors',
    ],
  },
  {
    key: 'homeowners',
    label: 'Homeowners',
    kind: 'homeowner',
    scope: 'homeowner',
    aliases: ['homeowner', 'homeowners', 'local homeowner', 'local homeowners'],
  },
];

type TopicDefinition = {
  key: string;
  label: string;
  aliases: string[];
  planningFocus?: string;
  theme: MarketingPlanningTheme;
  relatedKeys?: string[];
};

const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    key: 'customer_requests',
    label: 'Customer requests',
    aliases: ['customer request', 'customer requests', 'service request', 'service requests'],
    planningFocus: 'show how a customer request stays connected to the service work that follows',
    theme: 'customer_relationship',
    relatedKeys: ['service_work_organization'],
  },
  {
    key: 'estimates_and_approvals',
    label: 'Estimates and approvals',
    aliases: ['estimate', 'estimates', 'estimate approval', 'estimate approvals', 'estimates and approvals'],
    planningFocus: 'explain preparing, sending, and tracking an estimate plus the supported ways a customer can respond',
    theme: 'service_work',
    relatedKeys: ['secure_document_links'],
  },
  {
    key: 'jobs',
    label: 'Jobs',
    aliases: ['active job', 'active jobs', 'job', 'jobs', 'jobs and reports', 'job and report', 'job reports', 'finalized work report', 'finalized work reports', 'completed job record', 'completed job records'],
    planningFocus: 'show how an accepted scope can stay connected to the job and its finalized customer-facing work report',
    theme: 'service_work',
    relatedKeys: ['service_work_organization', 'home_history'],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    aliases: ['invoice', 'invoices', 'invoicing', 'invoices and manual payments', 'manual invoice payment', 'manual invoice payments'],
    planningFocus: 'explain how the invoice stays connected to the customer and the service work it bills',
    theme: 'service_work',
  },
  {
    key: 'customer_communication',
    label: 'Customer communication',
    aliases: ['customer communication', 'customer communications', 'communicating with customers'],
    planningFocus: 'focus on giving the customer a clear next step and keeping the related work context together',
    theme: 'customer_relationship',
    relatedKeys: [
      'customer_requests',
      'estimates_and_approvals',
      'secure_document_links',
      'connected_homeowner_relationships',
    ],
  },
  {
    key: 'home_history',
    label: 'Home History',
    aliases: ['home histories', 'home history', 'property history', 'service history'],
    planningFocus: 'show how eligible completed work and service records can remain organized around the home',
    theme: 'home_records',
    relatedKeys: ['jobs', 'connected_homeowner_relationships'],
  },
  {
    key: 'secure_document_links',
    label: 'Secure document links',
    aliases: ['document link', 'document links', 'secure document link', 'secure document links', 'secure guest link', 'secure guest links'],
    planningFocus: 'explain one supported document-specific customer interaction through a secure, expiring link',
    theme: 'customer_relationship',
    relatedKeys: ['estimates_and_approvals', 'connected_homeowner_relationships'],
  },
  {
    key: 'connected_homeowner_relationships',
    label: 'Connected homeowner relationships',
    aliases: ['connected homeowner', 'connected homeowners', 'connected homeowner relationship', 'connected homeowner relationships', 'homeowner connection', 'homeowner connections', 'homeowner and contractor connection', 'homeowner and contractor connections'],
    planningFocus: 'explain the optional ongoing homeowner-contractor connection and only its currently supported benefits',
    theme: 'customer_relationship',
    relatedKeys: ['secure_document_links', 'home_history'],
  },
  {
    key: 'product_demonstrations',
    label: 'Product demonstrations',
    aliases: ['demo', 'demos', 'demo concept', 'video concept', 'product walkthrough', 'demonstration', 'demonstrations', 'feature demo', 'feature demos', 'product demonstration', 'product demonstrations'],
    planningFocus: 'demonstrate one current product interaction through a short, concrete sequence',
    theme: 'product_education',
  },
  {
    key: 'service_work_organization',
    label: 'Organizing service work',
    aliases: [
      'organized workflow',
      'organized customer workflow',
      'organizing service work',
      'keeping service work organized',
      'contractor work organization',
      'service work organization',
    ],
    planningFocus: 'show one concrete way requests, estimates, jobs, or invoices stay connected instead of describing organization in the abstract',
    theme: 'service_work',
    relatedKeys: ['customer_requests', 'jobs'],
  },
  {
    key: 'contractor_discovery_profiles',
    label: 'Contractor discovery and profiles',
    aliases: ['contractor discovery', 'contractor discoveries', 'contractor profile', 'contractor profiles', 'contractor discovery and profiles'],
    planningFocus: 'explain one supported contractor-profile or homeowner-discovery interaction without claiming ranking, credential verification, or lead outcomes',
    theme: 'business_presence',
  },
];

const GENERIC_TOPIC_IDENTITIES = new Set([
  'practical contractor and homeowner problems',
  'practical contractor problems',
  'practical homeowner problems',
  'trade specific examples',
  'trade specific example',
  'contractor benefits',
  'homeowner benefits',
  'being organized',
  'product education',
  'education',
  'maintenance',
]);

const GENERIC_TOPIC_PATTERNS = [
  /^(?:discuss|explain|show|talk about) (?:practical )?(?:contractor|homeowner|contractor and homeowner) problems$/,
  /^(?:create|discuss|show|use) (?:a )?trade specific examples?$/,
  /^(?:discuss|explain|show|talk about) (?:contractor|homeowner) benefits$/,
  /^(?:discuss|explain|show|talk about) being organized$/,
];

export function normalizeMarketingIdentity(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const audienceAliasMap = new Map(
  AUDIENCE_DEFINITIONS.flatMap(definition => (
    [definition.key, definition.label, ...definition.aliases]
      .map(alias => [normalizeMarketingIdentity(alias), definition] as const)
  )),
);

const topicAliasMap = new Map(
  TOPIC_DEFINITIONS.flatMap(definition => (
    [definition.key, definition.label, ...definition.aliases]
      .map(alias => [normalizeMarketingIdentity(alias), definition] as const)
  )),
);

export function canonicalMarketingAudience(value: string) {
  const normalized = normalizeMarketingIdentity(value);
  const definition = audienceAliasMap.get(normalized);
  return {
    key: definition?.key ?? `custom:${normalized}`,
    label: definition?.label ?? value.trim(),
    kind: definition?.kind ?? 'other' as MarketingAudienceKind,
    scope: definition?.scope ?? 'other' as MarketingAudienceScope,
    recognized: Boolean(definition),
  };
}

export function canonicalMarketingTopic(value: string) {
  const normalized = normalizeMarketingIdentity(value);
  const direct = topicAliasMap.get(normalized);
  if (direct) return {
    key: direct.key,
    label: direct.label,
    planningFocus: direct.planningFocus ?? null,
    theme: direct.theme,
    recognized: true,
  };

  const embedded = TOPIC_DEFINITIONS.find(definition => (
    definition.aliases.some(alias => {
      const normalizedAlias = normalizeMarketingIdentity(alias);
      return normalizedAlias.length >= 5 && new RegExp(`(?:^| )${normalizedAlias.replace(/ /g, '\\s+')}(?: |$)`).test(normalized);
    })
  ));
  return embedded
    ? {
      key: embedded.key,
      label: embedded.label,
      planningFocus: embedded.planningFocus ?? null,
      theme: embedded.theme,
      recognized: true,
    }
    : {
      key: `custom:${normalized}`,
      label: value.trim(),
      planningFocus: null,
      theme: 'tenant_specific' as MarketingPlanningTheme,
      recognized: false,
    };
}

export function marketingTopicSpecificity(value: string) {
  const canonical = canonicalMarketingTopic(value);
  if (canonical.recognized) return 3;
  const normalized = normalizeMarketingIdentity(value);
  if (GENERIC_TOPIC_IDENTITIES.has(normalized) || GENERIC_TOPIC_PATTERNS.some(pattern => pattern.test(normalized))) return 0;
  const meaningfulWords = normalized.split(' ').filter(word => word.length >= 3 && !['and', 'the', 'for', 'with'].includes(word));
  return meaningfulWords.length >= 2 ? 2 : 0;
}

export type MarketingRecentTopicRelationship = 'exact' | 'related' | 'new';

export function marketingTopicRelationship(left: string, right: string): MarketingRecentTopicRelationship {
  const leftTopic = canonicalMarketingTopic(left);
  const rightTopic = canonicalMarketingTopic(right);
  if (leftTopic.key === rightTopic.key) return 'exact';
  const leftDefinition = TOPIC_DEFINITIONS.find(definition => definition.key === leftTopic.key);
  const rightDefinition = TOPIC_DEFINITIONS.find(definition => definition.key === rightTopic.key);
  if (
    leftDefinition?.relatedKeys?.includes(rightTopic.key)
    || rightDefinition?.relatedKeys?.includes(leftTopic.key)
  ) return 'related';
  return 'new';
}

export function marketingAudienceLabel(value: string) {
  return canonicalMarketingAudience(value).label;
}

export const MARKETING_TRUTH_AUDIENCES_V3 = AUDIENCE_DEFINITIONS.map(definition => definition.key);
