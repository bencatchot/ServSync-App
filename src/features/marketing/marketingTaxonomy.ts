export const MARKETING_AUDIENCE_TAXONOMY_VERSION = 1;

export type MarketingAudienceKind = 'contractor' | 'homeowner' | 'other';

type AudienceDefinition = {
  key: string;
  label: string;
  kind: MarketingAudienceKind;
  aliases: string[];
};

const AUDIENCE_DEFINITIONS: AudienceDefinition[] = [
  {
    key: 'small_contractors',
    label: 'Small contractors',
    kind: 'contractor',
    aliases: ['small contractor', 'small contractors', 'small service contractor', 'small service contractors'],
  },
  {
    key: 'hvac_contractors',
    label: 'HVAC contractors',
    kind: 'contractor',
    aliases: ['hvac', 'hvac contractor', 'hvac contractors'],
  },
  {
    key: 'plumbers',
    label: 'Plumbing contractors',
    kind: 'contractor',
    aliases: ['plumber', 'plumbers', 'plumbing', 'plumbing contractor', 'plumbing contractors'],
  },
  {
    key: 'electricians',
    label: 'Electrical contractors',
    kind: 'contractor',
    aliases: ['electrician', 'electricians', 'electrical', 'electrical contractor', 'electrical contractors'],
  },
  {
    key: 'carpentry_contractors',
    label: 'Carpentry contractors',
    kind: 'contractor',
    aliases: ['carpenter', 'carpenters', 'carpentry', 'carpentry contractor', 'carpentry contractors'],
  },
  {
    key: 'lawn_landscaping_contractors',
    label: 'Lawn care and landscaping contractors',
    kind: 'contractor',
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
    aliases: ['pressure washing', 'pressure washer', 'pressure washers', 'pressure washing contractor', 'pressure washing contractors'],
  },
  {
    key: 'handyman_contractors',
    label: 'Handyman and general maintenance contractors',
    kind: 'contractor',
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
    aliases: ['homeowner', 'homeowners', 'local homeowner', 'local homeowners'],
  },
];

type TopicDefinition = {
  key: string;
  label: string;
  aliases: string[];
  planningFocus?: string;
};

const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    key: 'customer_requests',
    label: 'Customer requests',
    aliases: ['customer request', 'customer requests', 'service request', 'service requests'],
    planningFocus: 'show how a customer request stays connected to the service work that follows',
  },
  {
    key: 'estimates_and_approvals',
    label: 'Estimates and approvals',
    aliases: ['estimate', 'estimates', 'estimate approval', 'estimate approvals', 'estimates and approvals'],
    planningFocus: 'explain preparing, sending, and tracking an estimate plus the supported ways a customer can respond',
  },
  {
    key: 'jobs',
    label: 'Jobs',
    aliases: ['active job', 'active jobs', 'job', 'jobs'],
    planningFocus: 'show how an accepted scope can stay connected to the job and the work being completed',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    aliases: ['invoice', 'invoices', 'invoicing'],
    planningFocus: 'explain how the invoice stays connected to the customer and the service work it bills',
  },
  {
    key: 'customer_communication',
    label: 'Customer communication',
    aliases: ['customer communication', 'customer communications', 'communicating with customers'],
    planningFocus: 'focus on giving the customer a clear next step and keeping the related work context together',
  },
  {
    key: 'home_history',
    label: 'Home History',
    aliases: ['home histories', 'home history', 'property history', 'service history'],
    planningFocus: 'show how eligible completed work and service records can remain organized around the home',
  },
  {
    key: 'secure_document_links',
    label: 'Secure document links',
    aliases: ['document link', 'document links', 'secure document link', 'secure document links', 'secure guest link', 'secure guest links'],
    planningFocus: 'explain one supported document-specific customer interaction through a secure, expiring link',
  },
  {
    key: 'connected_homeowner_relationships',
    label: 'Connected homeowner relationships',
    aliases: ['connected homeowner', 'connected homeowners', 'connected homeowner relationship', 'connected homeowner relationships', 'homeowner connection', 'homeowner connections'],
    planningFocus: 'explain the optional ongoing homeowner-contractor connection and only its currently supported benefits',
  },
  {
    key: 'product_demonstrations',
    label: 'Product demonstrations',
    aliases: ['demo', 'demos', 'demonstration', 'demonstrations', 'feature demo', 'feature demos', 'product demonstration', 'product demonstrations'],
    planningFocus: 'demonstrate one current product interaction through a short, concrete sequence',
  },
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
    recognized: Boolean(definition),
  };
}

export function canonicalMarketingTopic(value: string) {
  const normalized = normalizeMarketingIdentity(value);
  const direct = topicAliasMap.get(normalized);
  if (direct) return { key: direct.key, label: direct.label, planningFocus: direct.planningFocus ?? null, recognized: true };

  const embedded = TOPIC_DEFINITIONS.find(definition => (
    definition.aliases.some(alias => {
      const normalizedAlias = normalizeMarketingIdentity(alias);
      return normalizedAlias.length >= 5 && new RegExp(`(?:^| )${normalizedAlias.replace(/ /g, '\\s+')}(?: |$)`).test(normalized);
    })
  ));
  return embedded
    ? { key: embedded.key, label: embedded.label, planningFocus: embedded.planningFocus ?? null, recognized: true }
    : { key: `custom:${normalized}`, label: value.trim(), planningFocus: null, recognized: false };
}

export function marketingAudienceLabel(value: string) {
  return canonicalMarketingAudience(value).label;
}

export const MARKETING_TRUTH_AUDIENCES_V3 = AUDIENCE_DEFINITIONS.map(definition => definition.key);
