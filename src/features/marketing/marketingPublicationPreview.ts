import type { MarketingContentItem } from './marketingContent';
import type { MarketingProvider } from './marketingPublishing';

export type MarketingPublicationSnapshot = {
  title: string;
  body: string;
  content_type: string;
  channel_category: string | null;
  content_revision: number;
  preparation_source: string;
  content_role?: string;
  source_plan_id?: string;
  source_plan_revision?: number;
  source_plan_item_index?: number;
  source_direction_id?: string;
  source_direction_revision?: number;
};

export type MarketingProviderPreview = {
  provider: MarketingProvider;
  publicMessage: string;
  mediaLabel: 'Text only';
};

export function isFacebookPreviewEligible(content: MarketingContentItem) {
  return content.status === 'approved'
    && content.contentType === 'social_post'
    && content.channelCategory === 'social';
}

export function eligibleFacebookPreviewContent(items: MarketingContentItem[]) {
  return items.filter(isFacebookPreviewEligible);
}

export function marketingPublicationSnapshotForContent(content: MarketingContentItem): MarketingPublicationSnapshot {
  return Object.fromEntries(Object.entries({
    title: content.title,
    body: content.body,
    content_type: content.contentType,
    channel_category: content.channelCategory,
    content_revision: content.revisionNumber,
    preparation_source: content.preparationSource,
    content_role: content.contentRole,
    source_plan_id: content.sourcePlanId,
    source_plan_revision: content.sourcePlanRevision,
    source_plan_item_index: content.sourcePlanItemIndex,
    source_direction_id: content.sourceDirectionId,
    source_direction_revision: content.sourceDirectionRevision,
  }).filter(([, value]) => value !== null)) as MarketingPublicationSnapshot;
}

export function publicMessageForProvider(
  provider: MarketingProvider,
  snapshot: Pick<MarketingPublicationSnapshot, 'body'> | { body?: string },
) {
  if (provider !== 'facebook') throw new Error(`A ${provider} preview is not available yet.`);
  return typeof snapshot.body === 'string' ? snapshot.body : '';
}

export function marketingProviderPreview(
  provider: MarketingProvider,
  snapshot: MarketingPublicationSnapshot,
): MarketingProviderPreview {
  return {
    provider,
    publicMessage: publicMessageForProvider(provider, snapshot),
    mediaLabel: 'Text only',
  };
}
