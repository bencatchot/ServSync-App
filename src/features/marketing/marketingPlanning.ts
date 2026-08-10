import {
  canonicalMarketingAudience,
  canonicalMarketingTopic,
  marketingAudienceLabel,
  normalizeMarketingIdentity,
} from './marketingTaxonomy';

export const MARKETING_RECOMMENDATION_CONTRACT_VERSION = 2;

export const MARKETING_PLAN_CONTENT_ROLES = [
  'facebook_instagram_post',
  'linkedin_post',
  'educational_post',
  'feature_highlight',
  'short_video_concept',
  'problem_solution_post',
  'local_contractor_connection',
  'feature_announcement',
  'contractor_benefit',
  'homeowner_benefit',
] as const;

export const MARKETING_PROFILE_CHANNELS = ['social', 'website', 'video', 'email', 'other'] as const;

export type MarketingPlanContentRole = (typeof MARKETING_PLAN_CONTENT_ROLES)[number];
export type MarketingProfileChannel = (typeof MARKETING_PROFILE_CHANNELS)[number];
export type MarketingProfileStatus = 'incomplete' | 'ready';
export type MarketingPlanMode = 'owner_directed' | 'recommended';
export type MarketingPlanStatus = 'draft' | 'accepted';

export type MarketingBusinessProfile = {
  id: string;
  workspaceKey: string;
  workspaceKind: 'internal' | 'contractor';
  contractorId: string | null;
  businessName: string;
  businessSummary: string;
  audienceSegments: string[];
  serviceFocus: string[];
  primaryGoal: string;
  secondaryGoals: string[];
  geographicFocus: string | null;
  toneStyle: string;
  offers: string[];
  preferredChannels: MarketingProfileChannel[];
  emphasizedTopics: string[];
  avoidedTopics: string[];
  ownerNotes: string;
  status: MarketingProfileStatus;
  version: number;
  updatedAt: string;
};

export type MarketingRecentContentItem = {
  id: string;
  title: string;
  status: string;
  intendedAudience: string | null;
  contentRole: string | null;
  updatedAt: string;
};

export type MarketingRecentContentContext = {
  windowLimit: number;
  itemCount: number;
  items: MarketingRecentContentItem[];
  recommendationContractVersion?: number;
};

export type MarketingPlanItem = {
  audience: string;
  topic: string;
  direction: string;
  rationale: string;
  contentRoles: MarketingPlanContentRole[];
};

export type MarketingPlan = {
  id: string;
  workspaceKey: string;
  mode: MarketingPlanMode;
  status: MarketingPlanStatus;
  title: string;
  planningStart: string;
  planningEnd: string;
  ownerDirection: string | null;
  profileVersion: number;
  recommendationContractVersion: number | null;
  recentContentContext: MarketingRecentContentContext;
  items: MarketingPlanItem[];
  revisionNumber: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
};

export type MarketingPlanningState = {
  profile: MarketingBusinessProfile;
  plan: MarketingPlan | null;
  recentContent: MarketingRecentContentContext;
};

export type MarketingPlanCreateInput = {
  clientRequestId: string;
  profileVersion: number;
  mode: MarketingPlanMode;
  title: string;
  planningStart: string;
  planningEnd: string;
  ownerDirection: string | null;
  recommendationContractVersion: number | null;
  items: MarketingPlanItem[];
};

type RpcResult = { data: unknown; error: unknown };

export interface MarketingPlanningRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type MarketingPlanningAdapterErrorKind = 'unauthorized' | 'stale' | 'ambiguous' | 'rpc' | 'malformed';

export class MarketingPlanningAdapterError extends Error {
  constructor(public readonly kind: MarketingPlanningAdapterErrorKind, message: string) {
    super(message);
    this.name = 'MarketingPlanningAdapterError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
const isNullableUuid = (value: unknown): value is string | null => value === null || isUuid(value);
const isStringArray = (value: unknown, max = 12, itemMax = 160): value is string[] => (
  Array.isArray(value)
  && value.length <= max
  && value.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= itemMax)
);

function serverMessage(error: unknown) {
  return isRecord(error) && typeof error.message === 'string' ? error.message : '';
}

function serverError(error: unknown, mutation: boolean) {
  const message = serverMessage(error);
  if (isRecord(error) && (error.code === '42501' || error.status === 401 || error.status === 403)) {
    return new MarketingPlanningAdapterError('unauthorized', 'Internal Marketing planning is unavailable for this account.');
  }
  if (message.includes('Marketing profile changed; reload and try again.') || message.includes('Marketing plan changed; reload and try again.')) {
    return new MarketingPlanningAdapterError('stale', 'This Marketing planning record changed. Reload before continuing.');
  }
  return new MarketingPlanningAdapterError(
    'rpc',
    mutation ? 'ServSync could not save this Marketing planning change.' : 'ServSync could not load Marketing planning.',
  );
}

function malformedError() {
  return new MarketingPlanningAdapterError('malformed', 'ServSync received an invalid Marketing planning response.');
}

function parseRecentContent(value: unknown): MarketingRecentContentContext {
  if (
    !isRecord(value)
    || value.window_limit !== 20
    || !Array.isArray(value.items)
    || value.item_count !== value.items.length
    || !(
      value.recommendation_contract_version === undefined
      || (Number.isSafeInteger(value.recommendation_contract_version) && Number(value.recommendation_contract_version) >= 1)
    )
  ) {
    throw malformedError();
  }
  const items = value.items.map(item => {
    if (
      !isRecord(item)
      || !isUuid(item.id)
      || typeof item.title !== 'string'
      || item.title.length > 160
      || typeof item.status !== 'string'
      || !(item.intended_audience === null || typeof item.intended_audience === 'string')
      || !(item.content_role === null || typeof item.content_role === 'string')
      || !isTimestamp(item.updated_at)
    ) throw malformedError();
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      intendedAudience: item.intended_audience,
      contentRole: item.content_role,
      updatedAt: item.updated_at,
    };
  });
  return {
    windowLimit: 20,
    itemCount: items.length,
    items,
    ...(value.recommendation_contract_version === undefined
      ? {}
      : { recommendationContractVersion: Number(value.recommendation_contract_version) }),
  };
}

function parseProfile(value: unknown): MarketingBusinessProfile {
  if (
    !isRecord(value)
    || !isUuid(value.profile_id)
    || typeof value.workspace_key !== 'string'
    || !['internal', 'contractor'].includes(String(value.workspace_kind))
    || !isNullableUuid(value.contractor_id)
    || typeof value.business_name !== 'string'
    || typeof value.business_summary !== 'string'
    || !isStringArray(value.audience_segments)
    || !isStringArray(value.service_focus, 20)
    || typeof value.primary_goal !== 'string'
    || !isStringArray(value.secondary_goals, 12, 300)
    || !(value.geographic_focus === null || typeof value.geographic_focus === 'string')
    || typeof value.tone_style !== 'string'
    || !isStringArray(value.offers, 12, 300)
    || !isStringArray(value.preferred_channels)
    || !value.preferred_channels.every(channel => MARKETING_PROFILE_CHANNELS.includes(channel as MarketingProfileChannel))
    || !isStringArray(value.emphasized_topics, 20)
    || !isStringArray(value.avoided_topics, 20)
    || typeof value.owner_notes !== 'string'
    || !['incomplete', 'ready'].includes(String(value.profile_status))
    || !Number.isSafeInteger(value.profile_version)
    || Number(value.profile_version) < 1
    || !isTimestamp(value.updated_at)
  ) throw malformedError();

  if ((value.workspace_kind === 'internal') !== (value.contractor_id === null)) throw malformedError();

  return {
    id: value.profile_id,
    workspaceKey: value.workspace_key,
    workspaceKind: value.workspace_kind as MarketingBusinessProfile['workspaceKind'],
    contractorId: value.contractor_id,
    businessName: value.business_name,
    businessSummary: value.business_summary,
    audienceSegments: value.audience_segments,
    serviceFocus: value.service_focus,
    primaryGoal: value.primary_goal,
    secondaryGoals: value.secondary_goals,
    geographicFocus: value.geographic_focus,
    toneStyle: value.tone_style,
    offers: value.offers,
    preferredChannels: value.preferred_channels as MarketingProfileChannel[],
    emphasizedTopics: value.emphasized_topics,
    avoidedTopics: value.avoided_topics,
    ownerNotes: value.owner_notes,
    status: value.profile_status as MarketingProfileStatus,
    version: Number(value.profile_version),
    updatedAt: value.updated_at,
  };
}

function parsePlanItem(value: unknown): MarketingPlanItem {
  if (
    !isRecord(value)
    || Object.keys(value).sort().join(',') !== 'audience,content_roles,direction,rationale,topic'
    || typeof value.audience !== 'string'
    || value.audience.trim().length < 1
    || value.audience.length > 160
    || typeof value.topic !== 'string'
    || value.topic.trim().length < 1
    || value.topic.length > 160
    || typeof value.direction !== 'string'
    || value.direction.trim().length < 3
    || value.direction.length > 1000
    || typeof value.rationale !== 'string'
    || value.rationale.trim().length < 3
    || value.rationale.length > 1000
    || !Array.isArray(value.content_roles)
    || value.content_roles.length < 1
    || value.content_roles.length > 3
    || !value.content_roles.every(role => MARKETING_PLAN_CONTENT_ROLES.includes(role as MarketingPlanContentRole))
  ) throw malformedError();
  return {
    audience: value.audience,
    topic: value.topic,
    direction: value.direction,
    rationale: value.rationale,
    contentRoles: value.content_roles as MarketingPlanContentRole[],
  };
}

function parsePlan(value: unknown): MarketingPlan | null {
  if (value === null) return null;
  if (
    !isRecord(value)
    || !isUuid(value.plan_id)
    || typeof value.workspace_key !== 'string'
    || !['owner_directed', 'recommended'].includes(String(value.plan_mode))
    || !['draft', 'accepted'].includes(String(value.plan_status))
    || typeof value.title !== 'string'
    || !DATE_PATTERN.test(String(value.planning_start))
    || !DATE_PATTERN.test(String(value.planning_end))
    || !(value.owner_direction === null || typeof value.owner_direction === 'string')
    || !Number.isSafeInteger(value.profile_version)
    || !Array.isArray(value.items)
    || value.items.length < 1
    || value.items.length > 7
    || !Number.isSafeInteger(value.revision_number)
    || Number(value.revision_number) < 1
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
    || !(value.accepted_at === null || isTimestamp(value.accepted_at))
  ) throw malformedError();
  const recentContentContext = parseRecentContent(value.recent_content_context);
  const recommendationContractVersion = value.plan_mode === 'recommended'
    ? recentContentContext.recommendationContractVersion ?? 1
    : null;
  return {
    id: value.plan_id,
    workspaceKey: value.workspace_key,
    mode: value.plan_mode as MarketingPlanMode,
    status: value.plan_status as MarketingPlanStatus,
    title: value.title,
    planningStart: value.planning_start as string,
    planningEnd: value.planning_end as string,
    ownerDirection: value.owner_direction,
    profileVersion: Number(value.profile_version),
    recommendationContractVersion,
    recentContentContext,
    items: value.items.map(parsePlanItem),
    revisionNumber: Number(value.revision_number),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    acceptedAt: value.accepted_at,
  };
}

function parseState(value: unknown): MarketingPlanningState {
  if (!isRecord(value)) throw malformedError();
  return {
    profile: parseProfile(value.profile),
    plan: parsePlan(value.plan),
    recentContent: parseRecentContent(value.recent_content),
  };
}

function receipt(value: unknown, idKey: 'profile_id' | 'plan_id') {
  if (!isRecord(value) || !isUuid(value[idKey]) || !Number.isSafeInteger(value.revision_number) || Number(value.revision_number) < 1) {
    throw malformedError();
  }
  return { id: value[idKey] as string, revisionNumber: Number(value.revision_number) };
}

async function call(client: MarketingPlanningRpcClient, name: string, args: Record<string, unknown>, mutation: boolean) {
  try {
    const { data, error } = await client.rpc(name, args);
    if (error) throw serverError(error, mutation);
    return data;
  } catch (error) {
    if (error instanceof MarketingPlanningAdapterError) throw error;
    throw new MarketingPlanningAdapterError(
      mutation ? 'ambiguous' : 'rpc',
      mutation ? 'The save result is unclear. Reload before trying again.' : 'ServSync could not load Marketing planning.',
    );
  }
}

export function createMarketingPlanningAdapter(client: MarketingPlanningRpcClient) {
  return {
    async get() {
      return parseState(await call(client, 'servsync_get_internal_marketing_planning', {}, false));
    },
    async saveProfile(profile: MarketingBusinessProfile) {
      const data = await call(client, 'servsync_update_internal_marketing_profile', {
        p_expected_version: profile.version,
        p_business_summary: profile.businessSummary,
        p_audience_segments: profile.audienceSegments,
        p_service_focus: profile.serviceFocus,
        p_primary_goal: profile.primaryGoal,
        p_secondary_goals: profile.secondaryGoals,
        p_geographic_focus: profile.geographicFocus,
        p_tone_style: profile.toneStyle,
        p_offers: profile.offers,
        p_preferred_channels: profile.preferredChannels,
        p_emphasized_topics: profile.emphasizedTopics,
        p_avoided_topics: profile.avoidedTopics,
        p_owner_notes: profile.ownerNotes,
      }, true);
      return receipt(data, 'profile_id');
    },
    async createPlan(input: MarketingPlanCreateInput) {
      const data = await call(client, 'servsync_create_internal_marketing_plan', {
        p_client_request_id: input.clientRequestId,
        p_profile_version: input.profileVersion,
        p_mode: input.mode,
        p_title: input.title,
        p_planning_start: input.planningStart,
        p_planning_end: input.planningEnd,
        p_owner_direction: input.ownerDirection,
        p_recommendation_contract_version: input.recommendationContractVersion,
        p_items: input.items.map(item => ({
          audience: item.audience,
          topic: item.topic,
          direction: item.direction,
          rationale: item.rationale,
          content_roles: item.contentRoles,
        })),
      }, true);
      return receipt(data, 'plan_id');
    },
    async updatePlan(plan: MarketingPlan) {
      const data = await call(client, 'servsync_update_internal_marketing_plan', {
        p_plan_id: plan.id,
        p_expected_revision: plan.revisionNumber,
        p_title: plan.title,
        p_planning_start: plan.planningStart,
        p_planning_end: plan.planningEnd,
        p_owner_direction: plan.ownerDirection,
        p_items: plan.items.map(item => ({
          audience: item.audience,
          topic: item.topic,
          direction: item.direction,
          rationale: item.rationale,
          content_roles: item.contentRoles,
        })),
      }, true);
      return receipt(data, 'plan_id');
    },
    async acceptPlan(plan: MarketingPlan) {
      const data = await call(client, 'servsync_accept_internal_marketing_plan', {
        p_plan_id: plan.id,
        p_expected_revision: plan.revisionNumber,
      }, true);
      return receipt(data, 'plan_id');
    },
  };
}

const normalize = normalizeMarketingIdentity;

function textIncludesIdentity(text: string, identity: string) {
  const normalizedText = normalize(text);
  const normalizedIdentity = normalize(identity);
  return normalizedIdentity.length > 0 && (` ${normalizedText} `).includes(` ${normalizedIdentity} `);
}

function recentRoleCount(recentContent: MarketingRecentContentContext, role: MarketingPlanContentRole) {
  return recentContent.items.filter(item => item.contentRole === role).length;
}

function recentAudienceCount(recentContent: MarketingRecentContentContext, audience: string) {
  const key = canonicalMarketingAudience(audience).key;
  return recentContent.items.filter(item => (
    item.intendedAudience !== null && canonicalMarketingAudience(item.intendedAudience).key === key
  )).length;
}

function recentTopicCount(recentContent: MarketingRecentContentContext, topic: string) {
  const key = canonicalMarketingTopic(topic).key;
  return recentContent.items.filter(item => canonicalMarketingTopic(item.title).key === key).length;
}

function goalAffinity(goal: string, audience: string, topic: string) {
  const normalizedGoal = normalize(goal);
  const canonicalAudience = canonicalMarketingAudience(audience);
  const canonicalTopic = canonicalMarketingTopic(topic);
  let score = 0;
  if (textIncludesIdentity(normalizedGoal, canonicalAudience.label) || textIncludesIdentity(normalizedGoal, canonicalAudience.key)) score += 3;
  if (textIncludesIdentity(normalizedGoal, canonicalTopic.label) || textIncludesIdentity(normalizedGoal, canonicalTopic.key)) score += 3;
  if (canonicalAudience.kind === 'contractor' && /\b(contractor|business|signup|lead|acquisition|consideration)\b/.test(normalizedGoal)) score += 2;
  if (canonicalAudience.kind === 'homeowner' && /\b(homeowner|home owner|home|property)\b/.test(normalizedGoal)) score += 2;
  return score;
}

function profileTextAffinity(profile: MarketingBusinessProfile, audience: string, topic: string) {
  const context = `${profile.businessSummary} ${profile.ownerNotes}`;
  const canonicalAudience = canonicalMarketingAudience(audience);
  const canonicalTopic = canonicalMarketingTopic(topic);
  return Number(textIncludesIdentity(context, canonicalAudience.label))
    + Number(textIncludesIdentity(context, canonicalTopic.label));
}

function topicIsAvoided(topic: string, avoidedTopics: string[]) {
  const canonical = canonicalMarketingTopic(topic);
  return avoidedTopics.some(avoided => {
    const avoidedCanonical = canonicalMarketingTopic(avoided);
    return canonical.key === avoidedCanonical.key
      || textIncludesIdentity(topic, avoided)
      || textIncludesIdentity(avoided, topic);
  });
}

function roleChannelScore(role: MarketingPlanContentRole, channels: MarketingProfileChannel[]) {
  let score = 0;
  if (channels.includes('social') && [
    'facebook_instagram_post', 'linkedin_post', 'educational_post', 'problem_solution_post',
    'local_contractor_connection', 'feature_announcement', 'contractor_benefit', 'homeowner_benefit',
  ].includes(role)) score += 2;
  if (channels.includes('video') && role === 'short_video_concept') score += 4;
  if (channels.includes('website') && ['educational_post', 'feature_highlight', 'feature_announcement'].includes(role)) score += 2;
  if (channels.includes('email') && ['educational_post', 'contractor_benefit', 'homeowner_benefit'].includes(role)) score += 2;
  if (channels.includes('other')) score += 1;
  return score;
}

function chooseRole(
  profile: MarketingBusinessProfile,
  recentContent: MarketingRecentContentContext,
  audience: string,
  topic: string,
  selectedRoles: MarketingPlanContentRole[],
) {
  const audienceKind = canonicalMarketingAudience(audience).kind;
  const topicKey = canonicalMarketingTopic(topic).key;
  const goalText = normalize([profile.primaryGoal, ...profile.secondaryGoals].join(' '));
  return MARKETING_PLAN_CONTENT_ROLES
    .map(role => {
      let score = roleChannelScore(role, profile.preferredChannels);
      score -= recentRoleCount(recentContent, role) * 2;
      score -= selectedRoles.filter(value => value === role).length * 4;
      if (!selectedRoles.includes(role)) score += 3;
      if (audienceKind === 'homeowner' && ['homeowner_benefit', 'local_contractor_connection'].includes(role)) score += 3;
      if (audienceKind === 'contractor' && ['contractor_benefit', 'problem_solution_post', 'linkedin_post'].includes(role)) score += 2;
      if (/\beducat/.test(goalText) && role === 'educational_post') score += 3;
      if (/\b(signup|lead|acquisition|consideration|awareness)\b/.test(goalText) && ['contractor_benefit', 'homeowner_benefit', 'problem_solution_post'].includes(role)) score += 2;
      if (topicKey === 'product_demonstrations' && ['short_video_concept', 'feature_highlight'].includes(role)) score += 4;
      return { role, score };
    })
    .sort((left, right) => right.score - left.score || left.role.localeCompare(right.role))[0].role;
}

function recommendationDirection(profile: MarketingBusinessProfile, audience: string, topic: string) {
  const canonicalTopic = canonicalMarketingTopic(topic);
  const focus = canonicalTopic.planningFocus
    ?? `develop one focused ${topic.toLowerCase()} idea grounded in ${profile.businessName}'s approved business context`;
  const tone = profile.toneStyle.trim().replace(/[.!?]+$/, '').toLowerCase();
  return `${marketingAudienceLabel(audience)}: ${focus}. Use a ${tone} tone and keep the piece specific to ${profile.businessName}.`;
}

function recommendationRationale(
  profile: MarketingBusinessProfile,
  recentContent: MarketingRecentContentContext,
  audience: string,
  topic: string,
  role: MarketingPlanContentRole,
  selectedAudiences: string[],
  planShortfallReason: string | null,
) {
  const primary = goalAffinity(profile.primaryGoal, audience, topic);
  const secondary = profile.secondaryGoals.some(goal => goalAffinity(goal, audience, topic) > 0);
  const topicCount = recentTopicCount(recentContent, topic);
  const reasons: string[] = [];
  if (primary > 0) reasons.push('Supports the primary goal');
  else if (secondary) reasons.push('Supports an approved secondary goal');
  if (!selectedAudiences.some(value => canonicalMarketingAudience(value).key === canonicalMarketingAudience(audience).key)) {
    reasons.push('adds another Profile audience');
  }
  reasons.push(topicCount === 0
    ? `no matching ${canonicalMarketingTopic(topic).label.toLowerCase()} topic appears in the recent window`
    : `the topic is recent, so the plan rotates audience or format`);
  if (roleChannelScore(role, profile.preferredChannels) > 0) reasons.push('fits an approved channel');
  if (planShortfallReason) reasons.push(planShortfallReason);
  return `${reasons.join('; ')}.`;
}

export function buildRecommendedMarketingPlan(
  profile: MarketingBusinessProfile,
  recentContent: MarketingRecentContentContext,
): MarketingPlanItem[] {
  if (profile.status !== 'ready' || profile.audienceSegments.length === 0 || profile.emphasizedTopics.length === 0) {
    throw new Error('Complete the Marketing Profile before requesting a plan.');
  }

  const topics = [...profile.emphasizedTopics, ...profile.serviceFocus]
    .filter(topic => !topicIsAvoided(topic, profile.avoidedTopics))
    .filter((topic, index, values) => values.findIndex(value => canonicalMarketingTopic(value).key === canonicalMarketingTopic(topic).key) === index);
  if (topics.length === 0) throw new Error('The Marketing Profile does not contain an eligible planning topic.');

  const candidates = profile.audienceSegments.flatMap(audience => topics.map(topic => ({
    audience,
    topic,
    audienceKey: canonicalMarketingAudience(audience).key,
    audienceKind: canonicalMarketingAudience(audience).kind,
    topicKey: canonicalMarketingTopic(topic).key,
    baseScore:
      goalAffinity(profile.primaryGoal, audience, topic) * 5
      + profile.secondaryGoals.reduce((sum, goal) => sum + goalAffinity(goal, audience, topic) * 2, 0)
      + profileTextAffinity(profile, audience, topic) * 2
      + (profile.emphasizedTopics.some(value => canonicalMarketingTopic(value).key === canonicalMarketingTopic(topic).key) ? 4 : 2)
      - recentAudienceCount(recentContent, audience)
      - recentTopicCount(recentContent, topic) * 4,
  })));

  const audienceCount = new Set(candidates.map(candidate => candidate.audienceKey)).size;
  const topicCount = new Set(candidates.map(candidate => candidate.topicKey)).size;
  const targetCount = candidates.length < 5
    ? candidates.length
    : Math.min(7, 5 + Number(audienceCount >= 3) + Number(topicCount >= 6));
  const selected: typeof candidates = [];
  const selectedRoles: MarketingPlanContentRole[] = [];
  const planShortfallReason = targetCount < 5
    ? `the Profile supplies only ${targetCount} distinct eligible audience/topic combination${targetCount === 1 ? '' : 's'}, so this plan contains ${targetCount} item${targetCount === 1 ? '' : 's'}`
    : null;

  while (selected.length < targetCount) {
    const next = candidates
      .filter(candidate => !selected.some(item => item.audienceKey === candidate.audienceKey && item.topicKey === candidate.topicKey))
      .map(candidate => {
        const selectedAudienceUses = selected.filter(item => item.audienceKey === candidate.audienceKey).length;
        const selectedTopicUses = selected.filter(item => item.topicKey === candidate.topicKey).length;
        const selectedKindUses = selected.filter(item => item.audienceKind === candidate.audienceKind).length;
        return {
          candidate,
          score: candidate.baseScore
            + (selectedTopicUses === 0 ? 9 : 0)
            + (audienceCount > 1 && selectedAudienceUses === 0 ? 5 : 0)
            + (new Set(candidates.map(item => item.audienceKind)).size > 1 && selectedKindUses === 0 ? 3 : 0)
            - selectedTopicUses * 8
            - selectedAudienceUses * 3,
        };
      })
      .sort((left, right) => (
        right.score - left.score
        || `${left.candidate.audienceKey}:${left.candidate.topicKey}`.localeCompare(`${right.candidate.audienceKey}:${right.candidate.topicKey}`)
      ))[0]?.candidate;
    if (!next) break;
    const role = chooseRole(profile, recentContent, next.audience, next.topic, selectedRoles);
    selected.push(next);
    selectedRoles.push(role);
  }

  return selected.map((candidate, index) => ({
    audience: marketingAudienceLabel(candidate.audience),
    topic: canonicalMarketingTopic(candidate.topic).label,
    direction: recommendationDirection(profile, candidate.audience, candidate.topic),
    rationale: recommendationRationale(
      profile,
      recentContent,
      candidate.audience,
      candidate.topic,
      selectedRoles[index],
      selected.slice(0, index).map(item => item.audience),
      index === 0 ? planShortfallReason : null,
    ),
    contentRoles: [selectedRoles[index]],
  }));
}

export function buildOwnerDirectedMarketingPlan(
  profile: MarketingBusinessProfile,
  direction: string,
  audience: string,
  topic: string,
): MarketingPlanItem[] {
  const normalizedAudience = normalize(audience);
  const normalizedTopic = normalize(topic);
  if (!profile.audienceSegments.some(value => normalize(value) === normalizedAudience)) {
    throw new Error('Choose an audience from this business Marketing Profile.');
  }
  if (!profile.emphasizedTopics.some(value => normalize(value) === normalizedTopic)) {
    throw new Error('Choose a topic from this business Marketing Profile.');
  }
  const cleanDirection = direction.trim();
  if (cleanDirection.length < 3 || cleanDirection.length > 1000) {
    throw new Error('Add a direction between 3 and 1,000 characters.');
  }
  return [{
    audience,
    topic,
    direction: cleanDirection,
    rationale: 'Owner-directed priority, bounded to the approved business profile.',
    contentRoles: ['educational_post'],
  }];
}
