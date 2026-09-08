import type { MarketingPublication } from './marketingPublishing';

export function hasCaptionVerificationIssue(publication: MarketingPublication) {
  return publication.provider === 'facebook' && publication.status === 'failed'
    && publication.failureCategory === 'content_validation'
    && Boolean(publication.providerPublicationId)
    && publication.failureMessage?.includes('did not preserve the exact approved public message') === true;
}

export function publicationReviewUrl(publication: MarketingPublication): string | null {
  if (publication.providerPermalink) {
    try {
      const url = new URL(publication.providerPermalink);
      if (url.protocol === 'https:' && (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))) return url.href;
    } catch { /* Fall back only to a validated provider identifier. */ }
  }
  return publication.provider === 'facebook' && /^\d{3,80}$/.test(publication.providerPublicationId ?? '')
    ? `https://www.facebook.com/${publication.providerPublicationId}` : null;
}
