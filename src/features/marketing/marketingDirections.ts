import type { MarketingPlanItem } from './marketingPlanning';

export type MarketingDirectionStatus = 'draft' | 'approved';
export type MarketingDirectionMode = 'owner_led' | 'recommended';
export type MarketingDirectionSource = 'manual' | 'codex_assisted' | 'runtime_ai' | 'approved_provider';

export type MarketingDirectionCorrection = {
  code: string;
  correction: string;
};

export type MarketingDirectionAcceptedPlan = {
  id: string;
  title: string;
  revisionNumber: number;
  itemCount: number;
  acceptedAt: string;
};

export type MarketingDirection = {
  id: string;
  workspaceKey: string;
  sourcePlanId: string;
  sourcePlanRevision: number;
  sourcePlanItemIndex: number;
  sourcePlanItem: MarketingPlanItem;
  mode: MarketingDirectionMode;
  ownerInput: string | null;
  audienceKey: string;
  topic: string;
  contentRole: string;
  objective: string;
  statement: string;
  centralMessage: string;
  supportingPoints: string[];
  cautions: string[];
  correctedAssumptions: MarketingDirectionCorrection[];
  recommendationRationale: string | null;
  truthPackVersion: string;
  truthCapabilityKeys: string[];
  preparationSource: MarketingDirectionSource;
  status: MarketingDirectionStatus;
  revisionNumber: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

export type MarketingDirectionsState = {
  acceptedPlan: MarketingDirectionAcceptedPlan | null;
  directions: MarketingDirection[];
};

type RpcResult = { data: unknown; error: unknown };

export interface MarketingDirectionsRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type MarketingDirectionsAdapterErrorKind = 'unauthorized' | 'stale' | 'ambiguous' | 'rpc' | 'malformed';

export class MarketingDirectionsAdapterError extends Error {
  constructor(public readonly kind: MarketingDirectionsAdapterErrorKind, message: string) {
    super(message);
    this.name = 'MarketingDirectionsAdapterError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIENCE_KEYS = new Set([
  'small_contractors', 'hvac_contractors', 'plumbers', 'electricians',
  'carpentry_contractors', 'lawn_landscaping_contractors',
  'pressure_washing_contractors', 'handyman_contractors', 'homeowners',
]);
const CONTENT_ROLES = new Set([
  'facebook_instagram_post', 'linkedin_post', 'educational_post', 'feature_highlight',
  'short_video_concept', 'problem_solution_post', 'local_contractor_connection',
  'feature_announcement', 'contractor_benefit', 'homeowner_benefit',
]);
const CORRECTION_CODES = new Set([
  'competitor_account_requirement', 'competitor_app_download_requirement',
  'competitor_subscription_requirement', 'competitor_inferiority',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isBoundedText = (value: unknown, minimum: number, maximum: number): value is string => (
  typeof value === 'string' && value.trim() === value && value.length >= minimum && value.length <= maximum
);
const isStringArray = (value: unknown, maximum: number, itemMaximum: number, minimum = 0): value is string[] => (
  Array.isArray(value)
  && value.length >= minimum
  && value.length <= maximum
  && value.every(item => typeof item === 'string' && item.trim() === item && item.length >= 1 && item.length <= itemMaximum)
  && new Set(value.map(item => item.toLowerCase())).size === value.length
);

function malformedError() {
  return new MarketingDirectionsAdapterError('malformed', 'ServSync received an invalid Marketing Direction response.');
}

function parsePlanItem(value: unknown): MarketingPlanItem {
  if (
    !isRecord(value)
    || !isBoundedText(value.audience, 1, 120)
    || !isBoundedText(value.topic, 1, 160)
    || !isBoundedText(value.direction, 1, 1000)
    || !isBoundedText(value.rationale, 1, 1000)
    || !isStringArray(value.content_roles, 3, 80, 1)
    || !(value.content_roles as string[]).every(role => CONTENT_ROLES.has(role))
  ) throw malformedError();
  return {
    audience: value.audience,
    topic: value.topic,
    direction: value.direction,
    rationale: value.rationale,
    contentRoles: value.content_roles as MarketingPlanItem['contentRoles'],
  };
}

function parseAcceptedPlan(value: unknown): MarketingDirectionAcceptedPlan | null {
  if (value === null) return null;
  if (
    !isRecord(value)
    || !isUuid(value.plan_id)
    || !isBoundedText(value.title, 3, 160)
    || !Number.isSafeInteger(value.revision_number)
    || Number(value.revision_number) < 1
    || !Number.isSafeInteger(value.item_count)
    || Number(value.item_count) < 1
    || Number(value.item_count) > 7
    || !isTimestamp(value.accepted_at)
  ) throw malformedError();
  return {
    id: value.plan_id,
    title: value.title,
    revisionNumber: Number(value.revision_number),
    itemCount: Number(value.item_count),
    acceptedAt: value.accepted_at,
  };
}

function parseCorrection(value: unknown): MarketingDirectionCorrection {
  if (
    !isRecord(value)
    || Object.keys(value).sort().join(',') !== 'code,correction'
    || typeof value.code !== 'string'
    || !CORRECTION_CODES.has(value.code)
    || !isBoundedText(value.correction, 1, 300)
  ) throw malformedError();
  return { code: value.code, correction: value.correction };
}

function parseDirection(value: unknown): MarketingDirection {
  if (
    !isRecord(value)
    || !isUuid(value.direction_id)
    || value.workspace_key !== 'servsync_internal'
    || !isUuid(value.source_plan_id)
    || !Number.isSafeInteger(value.source_plan_revision)
    || !Number.isSafeInteger(value.source_plan_item_index)
    || Number(value.source_plan_item_index) < 1
    || Number(value.source_plan_item_index) > 7
    || !['owner_led', 'recommended'].includes(String(value.direction_mode))
    || !(value.owner_input === null || isBoundedText(value.owner_input, 1, 1000))
    || typeof value.audience_key !== 'string'
    || !AUDIENCE_KEYS.has(value.audience_key)
    || !isBoundedText(value.topic, 1, 160)
    || typeof value.content_role !== 'string'
    || !CONTENT_ROLES.has(value.content_role)
    || !isBoundedText(value.objective, 20, 240)
    || !isBoundedText(value.statement, 80, 500)
    || !isBoundedText(value.central_message, 20, 500)
    || !isStringArray(value.supporting_points, 4, 300)
    || !isStringArray(value.cautions, 4, 300)
    || !Array.isArray(value.corrected_assumptions)
    || value.corrected_assumptions.length > 4
    || !(value.recommendation_rationale === null || isBoundedText(value.recommendation_rationale, 20, 500))
    || value.truth_pack_version !== 'servsync-marketing-truth-v3'
    || !isStringArray(value.truth_capability_keys, 4, 80, 1)
    || value.preparation_source !== 'codex_assisted'
    || !['draft', 'approved'].includes(String(value.direction_status))
    || !Number.isSafeInteger(value.revision_number)
    || Number(value.revision_number) < 1
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
    || !(value.approved_at === null || isTimestamp(value.approved_at))
  ) throw malformedError();

  const sourcePlanItem = parsePlanItem(value.source_plan_item);
  const correctionCodes = (value.corrected_assumptions as unknown[]).map(item => parseCorrection(item).code);
  if (value.content_role !== sourcePlanItem.contentRoles[0]) throw malformedError();
  if (
    new Set(correctionCodes).size !== correctionCodes.length
    || (value.direction_mode === 'recommended' && (value.owner_input !== null || value.recommendation_rationale === null))
    || (value.direction_mode === 'owner_led' && (value.owner_input === null || value.recommendation_rationale !== null))
    || (value.direction_status === 'draft' && value.approved_at !== null)
    || (value.direction_status === 'approved' && !isTimestamp(value.approved_at))
  ) throw malformedError();

  return {
    id: value.direction_id,
    workspaceKey: value.workspace_key,
    sourcePlanId: value.source_plan_id,
    sourcePlanRevision: Number(value.source_plan_revision),
    sourcePlanItemIndex: Number(value.source_plan_item_index),
    sourcePlanItem,
    mode: value.direction_mode as MarketingDirectionMode,
    ownerInput: value.owner_input,
    audienceKey: value.audience_key,
    topic: value.topic,
    contentRole: value.content_role,
    objective: value.objective,
    statement: value.statement,
    centralMessage: value.central_message,
    supportingPoints: value.supporting_points,
    cautions: value.cautions,
    correctedAssumptions: value.corrected_assumptions.map(parseCorrection),
    recommendationRationale: value.recommendation_rationale,
    truthPackVersion: value.truth_pack_version,
    truthCapabilityKeys: value.truth_capability_keys,
    preparationSource: value.preparation_source as MarketingDirectionSource,
    status: value.direction_status as MarketingDirectionStatus,
    revisionNumber: Number(value.revision_number),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    approvedAt: value.approved_at,
  };
}

function parseState(value: unknown): MarketingDirectionsState {
  if (!isRecord(value) || !Array.isArray(value.directions)) throw malformedError();
  const acceptedPlan = parseAcceptedPlan(value.accepted_plan);
  const directions = value.directions.map(parseDirection);
  if (!acceptedPlan && directions.length > 0) throw malformedError();
  if (acceptedPlan && (
    directions.length > acceptedPlan.itemCount
    || directions.some(direction => (
      direction.sourcePlanId !== acceptedPlan.id
      || direction.sourcePlanRevision !== acceptedPlan.revisionNumber
      || direction.sourcePlanItemIndex > acceptedPlan.itemCount
    ))
    || new Set(directions.map(direction => direction.id)).size !== directions.length
    || new Set(directions.map(direction => direction.sourcePlanItemIndex)).size !== directions.length
  )) throw malformedError();
  return { acceptedPlan, directions };
}

function serverMessage(error: unknown) {
  return isRecord(error) && typeof error.message === 'string' ? error.message : '';
}

function serverError(error: unknown, mutation: boolean) {
  const message = serverMessage(error);
  if (isRecord(error) && (error.code === '42501' || error.status === 401 || error.status === 403)) {
    return new MarketingDirectionsAdapterError('unauthorized', 'Internal Marketing Directions are unavailable for this account.');
  }
  if (message.includes('Marketing Direction changed; reload and try again.')) {
    return new MarketingDirectionsAdapterError('stale', 'This Marketing Direction changed. Reload before continuing.');
  }
  return new MarketingDirectionsAdapterError(
    'rpc',
    mutation ? 'ServSync could not save this Marketing Direction change.' : 'ServSync could not load Marketing Directions.',
  );
}

async function call(client: MarketingDirectionsRpcClient, name: string, args: Record<string, unknown>, mutation: boolean) {
  try {
    const { data, error } = await client.rpc(name, args);
    if (error) throw serverError(error, mutation);
    return data;
  } catch (error) {
    if (error instanceof MarketingDirectionsAdapterError) throw error;
    throw new MarketingDirectionsAdapterError(
      mutation ? 'ambiguous' : 'rpc',
      mutation ? 'The save result is unclear. Reload before trying again.' : 'ServSync could not load Marketing Directions.',
    );
  }
}

function parseReceipt(value: unknown) {
  if (
    !isRecord(value)
    || !isUuid(value.direction_id)
    || !Number.isSafeInteger(value.revision_number)
    || Number(value.revision_number) < 1
    || !['draft', 'approved'].includes(String(value.status))
  ) throw malformedError();
  return {
    directionId: value.direction_id as string,
    revisionNumber: Number(value.revision_number),
    status: value.status as MarketingDirectionStatus,
  };
}

export function createMarketingDirectionsAdapter(client: MarketingDirectionsRpcClient) {
  return {
    async get() {
      return parseState(await call(client, 'servsync_get_internal_marketing_directions', {}, false));
    },
    async update(direction: MarketingDirection) {
      return parseReceipt(await call(client, 'servsync_update_internal_marketing_direction', {
        p_direction_id: direction.id,
        p_expected_revision: direction.revisionNumber,
        p_objective: direction.objective,
        p_statement: direction.statement,
        p_central_message: direction.centralMessage,
        p_supporting_points: direction.supportingPoints,
        p_cautions: direction.cautions,
        p_corrected_assumptions: direction.correctedAssumptions,
        p_recommendation_rationale: direction.recommendationRationale,
      }, true));
    },
    async approve(direction: MarketingDirection) {
      return parseReceipt(await call(client, 'servsync_approve_internal_marketing_direction', {
        p_direction_id: direction.id,
        p_expected_revision: direction.revisionNumber,
      }, true));
    },
  };
}
