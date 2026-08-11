export const MARKETING_CONTENT_STATUSES = [
  'idea',
  'draft',
  'needs_approval',
  'approved',
  'rejected',
] as const;

export const MARKETING_CONTENT_TYPES = ['social_post', 'email', 'website_copy', 'other'] as const;
export const MARKETING_CHANNEL_CATEGORIES = ['social', 'email', 'website', 'other'] as const;
export const MARKETING_PREPARATION_SOURCES = ['manual', 'codex_assisted', 'runtime_ai'] as const;
export const MARKETING_PREPARATION_AUDIENCES = [
  'small_contractors',
  'hvac_contractors',
  'plumbers',
  'electricians',
  'carpentry_contractors',
  'lawn_landscaping_contractors',
  'pressure_washing_contractors',
  'handyman_contractors',
  'homeowners',
] as const;
export const MARKETING_CONTENT_ROLES = [
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

export type MarketingContentStatus = (typeof MARKETING_CONTENT_STATUSES)[number];
export type MarketingContentType = (typeof MARKETING_CONTENT_TYPES)[number];
export type MarketingChannelCategory = (typeof MARKETING_CHANNEL_CATEGORIES)[number];
export type MarketingPreparationSource = (typeof MARKETING_PREPARATION_SOURCES)[number];
export type MarketingPreparationAudience = (typeof MARKETING_PREPARATION_AUDIENCES)[number];
export type MarketingContentRole = (typeof MARKETING_CONTENT_ROLES)[number];
export type MarketingStrategicSource = 'approved_direction';

export type MarketingContentItem = {
  id: string;
  workspaceKey: 'servsync_internal';
  workspaceKind: 'internal';
  title: string;
  contentType: MarketingContentType;
  body: string;
  channelCategory: MarketingChannelCategory | null;
  status: MarketingContentStatus;
  revisionNumber: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  createdByName: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  submittedByName: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  preparationSource: MarketingPreparationSource;
  preparationRequestId: string | null;
  preparationRecipeKey: string | null;
  truthPackVersion: string | null;
  preparedAt: string | null;
  preparationSequence: number | null;
  intendedAudience: MarketingPreparationAudience | null;
  contentRole: MarketingContentRole | null;
  strategicSource: MarketingStrategicSource | null;
  sourcePlanId: string | null;
  sourcePlanRevision: number | null;
  sourcePlanItemIndex: number | null;
  sourceDirectionId: string | null;
  sourceDirectionRevision: number | null;
  sourceDirectionTopic: string | null;
  sourceDirectionStatus: 'approved' | null;
};

type RpcResult = { data: unknown; error: unknown };

export interface MarketingContentRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type MarketingContentAdapterErrorKind = 'unauthorized' | 'stale' | 'ambiguous' | 'rpc' | 'malformed';

export class MarketingContentAdapterError extends Error {
  constructor(public readonly kind: MarketingContentAdapterErrorKind, message: string) {
    super(message);
    this.name = 'MarketingContentAdapterError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isNullableUuid = (value: unknown): value is string | null => value === null || (typeof value === 'string' && UUID_PATTERN.test(value));
const isTimestamp = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);
const isNullableTimestamp = (value: unknown): value is string | null => value === null || isTimestamp(value);

function serverMessage(error: unknown) {
  return isRecord(error) && typeof error.message === 'string' ? error.message : '';
}

function serverError(error: unknown, mutation: boolean) {
  const message = serverMessage(error);
  if (isRecord(error) && (error.code === '42501' || error.status === 401 || error.status === 403)) {
    return new MarketingContentAdapterError('unauthorized', 'Internal Marketing content is unavailable for this account.');
  }
  if (message.includes('Marketing content changed; reload and try again.')) {
    return new MarketingContentAdapterError('stale', 'This content changed. Reload the latest version before continuing.');
  }
  return new MarketingContentAdapterError(
    'rpc',
    mutation ? 'ServSync could not save this marketing content.' : 'ServSync could not load marketing content.',
  );
}

function malformedError() {
  return new MarketingContentAdapterError('malformed', 'ServSync received an invalid marketing content response.');
}

function parseItem(value: unknown): MarketingContentItem {
  if (!isRecord(value)) throw malformedError();
  const status = value.status;
  const contentType = value.content_type;
  const channelCategory = value.channel_category;
  const preparationSource = value.preparation_source;
  const intendedAudience = value.intended_audience;
  const contentRole = value.content_role;
  const strategicSource = value.strategic_source;
  const sourceDirectionStatus = value.source_direction_status;
  if (
    typeof value.content_id !== 'string'
    || !UUID_PATTERN.test(value.content_id)
    || value.workspace_key !== 'servsync_internal'
    || value.workspace_kind !== 'internal'
    || typeof value.title !== 'string'
    || value.title.trim().length < 1
    || value.title.length > 160
    || !MARKETING_CONTENT_TYPES.includes(contentType as MarketingContentType)
    || typeof value.body !== 'string'
    || value.body.length > 10000
    || !(channelCategory === null || MARKETING_CHANNEL_CATEGORIES.includes(channelCategory as MarketingChannelCategory))
    || !MARKETING_CONTENT_STATUSES.includes(status as MarketingContentStatus)
    || typeof value.revision_number !== 'number'
    || !Number.isSafeInteger(value.revision_number)
    || value.revision_number < 1
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
    || !isNullableUuid(value.created_by)
    || !isNullableString(value.created_by_name)
    || !isNullableTimestamp(value.submitted_at)
    || !isNullableUuid(value.submitted_by)
    || !isNullableString(value.submitted_by_name)
    || !isNullableTimestamp(value.reviewed_at)
    || !isNullableUuid(value.reviewed_by)
    || !isNullableString(value.reviewed_by_name)
    || !isNullableString(value.review_note)
    || !MARKETING_PREPARATION_SOURCES.includes(preparationSource as MarketingPreparationSource)
    || !isNullableUuid(value.preparation_request_id)
    || !isNullableString(value.preparation_recipe_key)
    || !isNullableString(value.truth_pack_version)
    || !isNullableTimestamp(value.prepared_at)
    || !(value.preparation_sequence === null || (
      typeof value.preparation_sequence === 'number'
      && Number.isSafeInteger(value.preparation_sequence)
      && value.preparation_sequence >= 1
      && value.preparation_sequence <= 7
    ))
    || !(intendedAudience === null || MARKETING_PREPARATION_AUDIENCES.includes(intendedAudience as MarketingPreparationAudience))
    || !(contentRole === null || MARKETING_CONTENT_ROLES.includes(contentRole as MarketingContentRole))
    || !(strategicSource === null || strategicSource === 'approved_direction')
    || !isNullableUuid(value.source_plan_id)
    || !(value.source_plan_revision === null || (
      typeof value.source_plan_revision === 'number'
      && Number.isSafeInteger(value.source_plan_revision)
      && value.source_plan_revision >= 1
    ))
    || !(value.source_plan_item_index === null || (
      typeof value.source_plan_item_index === 'number'
      && Number.isSafeInteger(value.source_plan_item_index)
      && value.source_plan_item_index >= 1
      && value.source_plan_item_index <= 7
    ))
    || !isNullableUuid(value.source_direction_id)
    || !(value.source_direction_revision === null || (
      typeof value.source_direction_revision === 'number'
      && Number.isSafeInteger(value.source_direction_revision)
      && value.source_direction_revision >= 1
    ))
    || !isNullableString(value.source_direction_topic)
    || !(sourceDirectionStatus === null || sourceDirectionStatus === 'approved')
  ) {
    throw malformedError();
  }

  if ((value.submitted_at === null) !== (value.submitted_by === null)) throw malformedError();
  if ((value.reviewed_at === null) !== (value.reviewed_by === null)) throw malformedError();
  if (value.review_note !== null && (value.review_note.length < 3 || value.review_note.length > 1000)) throw malformedError();
  const hasPreparation = preparationSource !== 'manual';
  if (hasPreparation !== (
    value.preparation_request_id !== null
    && typeof value.preparation_recipe_key === 'string'
    && value.preparation_recipe_key.length > 0
    && typeof value.truth_pack_version === 'string'
    && /^servsync-marketing-truth-v[1-9][0-9]*$/.test(value.truth_pack_version)
    && value.prepared_at !== null
    && value.preparation_sequence !== null
    && intendedAudience !== null
    && contentRole !== null
  )) throw malformedError();
  if (!hasPreparation && (
    value.preparation_request_id !== null
    || value.preparation_recipe_key !== null
    || value.truth_pack_version !== null
    || value.prepared_at !== null
    || value.preparation_sequence !== null
    || intendedAudience !== null
    || contentRole !== null
  )) throw malformedError();
  const hasDirectionLineage = strategicSource === 'approved_direction';
  if (hasDirectionLineage !== (
    value.source_plan_id !== null
    && value.source_plan_revision !== null
    && value.source_plan_item_index !== null
    && value.source_direction_id !== null
    && value.source_direction_revision !== null
    && typeof value.source_direction_topic === 'string'
    && value.source_direction_topic.trim().length > 0
    && sourceDirectionStatus === 'approved'
  )) throw malformedError();
  if (!hasDirectionLineage && (
    value.source_plan_id !== null
    || value.source_plan_revision !== null
    || value.source_plan_item_index !== null
    || value.source_direction_id !== null
    || value.source_direction_revision !== null
    || value.source_direction_topic !== null
    || sourceDirectionStatus !== null
  )) throw malformedError();
  if (hasDirectionLineage && preparationSource !== 'codex_assisted') throw malformedError();

  return {
    id: value.content_id,
    workspaceKey: 'servsync_internal',
    workspaceKind: 'internal',
    title: value.title,
    contentType: contentType as MarketingContentType,
    body: value.body,
    channelCategory: channelCategory as MarketingChannelCategory | null,
    status: status as MarketingContentStatus,
    revisionNumber: value.revision_number,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    createdBy: value.created_by,
    createdByName: value.created_by_name,
    submittedAt: value.submitted_at,
    submittedBy: value.submitted_by,
    submittedByName: value.submitted_by_name,
    reviewedAt: value.reviewed_at,
    reviewedBy: value.reviewed_by,
    reviewedByName: value.reviewed_by_name,
    reviewNote: value.review_note,
    preparationSource: preparationSource as MarketingPreparationSource,
    preparationRequestId: value.preparation_request_id,
    preparationRecipeKey: value.preparation_recipe_key,
    truthPackVersion: value.truth_pack_version,
    preparedAt: value.prepared_at,
    preparationSequence: value.preparation_sequence,
    intendedAudience: intendedAudience as MarketingPreparationAudience | null,
    contentRole: contentRole as MarketingContentRole | null,
    strategicSource: strategicSource as MarketingStrategicSource | null,
    sourcePlanId: value.source_plan_id,
    sourcePlanRevision: value.source_plan_revision,
    sourcePlanItemIndex: value.source_plan_item_index,
    sourceDirectionId: value.source_direction_id,
    sourceDirectionRevision: value.source_direction_revision,
    sourceDirectionTopic: value.source_direction_topic,
    sourceDirectionStatus: sourceDirectionStatus as 'approved' | null,
  };
}

export function parseMarketingContentItems(value: unknown) {
  if (!Array.isArray(value)) throw malformedError();
  return value.map(parseItem);
}

function parseMutationReceipt(value: unknown) {
  if (
    !isRecord(value)
    || typeof value.content_id !== 'string'
    || !UUID_PATTERN.test(value.content_id)
    || !MARKETING_CONTENT_STATUSES.includes(value.status as MarketingContentStatus)
    || typeof value.revision_number !== 'number'
    || !Number.isSafeInteger(value.revision_number)
    || value.revision_number < 1
  ) {
    throw malformedError();
  }
  return {
    contentId: value.content_id,
    status: value.status as MarketingContentStatus,
    revisionNumber: value.revision_number,
  };
}

async function readRpc(client: MarketingContentRpcClient, name: string, args: Record<string, unknown>) {
  try {
    const result = await client.rpc(name, args);
    if (result.error) throw serverError(result.error, false);
    return result.data;
  } catch (error) {
    if (error instanceof MarketingContentAdapterError) throw error;
    throw new MarketingContentAdapterError('rpc', 'ServSync could not load marketing content.');
  }
}

async function mutationRpc(client: MarketingContentRpcClient, name: string, args: Record<string, unknown>) {
  let result: RpcResult;
  try {
    result = await client.rpc(name, args);
  } catch {
    throw new MarketingContentAdapterError(
      'ambiguous',
      'The save result could not be confirmed. Reload before trying again.',
    );
  }
  if (result.error) throw serverError(result.error, true);
  return result.data;
}

export function createMarketingContentAdapter(client: MarketingContentRpcClient) {
  return {
    async list(status: MarketingContentStatus | 'all' = 'all') {
      const data = await readRpc(client, 'servsync_list_internal_marketing_content', {
        p_status: status,
      });
      return parseMarketingContentItems(data);
    },

    async create(input: {
      clientRequestId: string;
      title: string;
      contentType: MarketingContentType;
      body: string;
      channelCategory: MarketingChannelCategory | null;
    }) {
      const data = await mutationRpc(client, 'servsync_create_internal_marketing_content', {
        p_client_request_id: input.clientRequestId,
        p_title: input.title,
        p_content_type: input.contentType,
        p_body: input.body,
        p_channel_category: input.channelCategory,
      });
      return parseMutationReceipt(data);
    },

    async update(input: {
      contentId: string;
      expectedRevision: number;
      title: string;
      contentType: MarketingContentType;
      body: string;
      channelCategory: MarketingChannelCategory | null;
    }) {
      const data = await mutationRpc(client, 'servsync_update_internal_marketing_content', {
        p_content_id: input.contentId,
        p_expected_revision: input.expectedRevision,
        p_title: input.title,
        p_content_type: input.contentType,
        p_body: input.body,
        p_channel_category: input.channelCategory,
      });
      const receipt = parseMutationReceipt(data);
      if (receipt.contentId !== input.contentId || receipt.revisionNumber !== input.expectedRevision + 1) throw malformedError();
      return receipt;
    },

    async transition(input: {
      contentId: string;
      expectedRevision: number;
      toStatus: Exclude<MarketingContentStatus, 'idea'>;
      reason?: string | null;
    }) {
      const data = await mutationRpc(client, 'servsync_transition_internal_marketing_content', {
        p_content_id: input.contentId,
        p_expected_revision: input.expectedRevision,
        p_to_status: input.toStatus,
        p_reason: input.reason ?? null,
      });
      const receipt = parseMutationReceipt(data);
      if (
        receipt.contentId !== input.contentId
        || receipt.status !== input.toStatus
        || receipt.revisionNumber !== input.expectedRevision + 1
      ) throw malformedError();
      return receipt;
    },
  };
}
