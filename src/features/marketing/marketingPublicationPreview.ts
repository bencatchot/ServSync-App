import type { MarketingContentItem } from './marketingContent';
import type { MarketingMediaAsset, MarketingMediaPairing } from './marketingMedia';
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
  media_pairing_id?: string;
  media_snapshot?: {
    pairing_id: string;
    asset_id: string;
    storage_bucket: 'marketing-assets';
    storage_path: string;
    mime_type: 'video/mp4';
    sha256: string;
    file_size_bytes: number;
    width: number;
    height: number;
    duration_seconds: number;
    media_variant: MarketingMediaAsset['mediaVariant'];
    recorder_scenario: string;
    source_commit: string;
    narration_provider?: 'OpenAI';
    narration_model?: string;
    narration_voice?: string;
    narration_script_version?: number;
    ai_narration_disclosure_text?: string;
  };
};

export type MarketingProviderPreview = {
  provider: MarketingProvider;
  publicMessage: string;
  mediaLabel: 'Text only' | 'Managed product demo video';
};

export function isFacebookPreviewEligible(content: MarketingContentItem) {
  return ['needs_approval', 'approved'].includes(content.status)
    && content.contentType === 'social_post'
    && content.channelCategory === 'social';
}

export function eligibleFacebookPreviewContent(items: MarketingContentItem[]) {
  return items.filter(isFacebookPreviewEligible);
}

export function marketingPublicationSnapshotForContent(
  content: MarketingContentItem,
  pairing?: MarketingMediaPairing | null,
  asset?: MarketingMediaAsset | null,
): MarketingPublicationSnapshot {
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
    ...(pairing && asset ? {
      media_pairing_id: pairing.id,
      media_snapshot: Object.fromEntries(Object.entries({
        pairing_id: pairing.id,
        asset_id: asset.id,
        storage_bucket: asset.storageBucket,
        storage_path: asset.storagePath,
        mime_type: asset.mimeType,
        sha256: asset.sha256,
        file_size_bytes: asset.fileSizeBytes,
        width: asset.width,
        height: asset.height,
        duration_seconds: asset.durationSeconds,
        media_variant: asset.mediaVariant,
        recorder_scenario: asset.recorderScenario,
        source_commit: asset.sourceCommit,
        narration_provider: asset.narrationProvider,
        narration_model: asset.narrationModel,
        narration_voice: asset.narrationVoice,
        narration_script_version: asset.narrationScriptVersion,
        ai_narration_disclosure_text: asset.aiNarrationDisclosureText,
      }).filter(([, value]) => value !== null)) as MarketingPublicationSnapshot['media_snapshot'],
    } : {}),
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
    mediaLabel: snapshot.media_snapshot ? 'Managed product demo video' : 'Text only',
  };
}
