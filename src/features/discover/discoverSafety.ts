export const DISCOVER_REPORT_REASONS = {
  harassment: "Harassment or threats",
  inappropriate: "Inappropriate content",
  privacy: "Private information shared without permission",
  spam: "Spam, fraud, or misleading content",
  other: "Something else",
} as const;

export type DiscoverSafetyReportReason = keyof typeof DISCOVER_REPORT_REASONS;
export const DISCOVER_SAFETY_DETAIL_LIMIT = 500;

export function discoverReviewImageUrl(value: string, imageOrigin?: string): string | null {
  // Do not load arbitrary hosts or application endpoints with a moderator's
  // session. Only bundled fixture paths and the exact review-storage origin fit.
  if (/^\/(?:assets|fixtures|review)\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|svg)$/i.test(value)
    && !value.includes("//")) return value;
  if (!imageOrigin || /[\\\r\n\t]/.test(value)) return null;
  try {
    const expected = new URL(imageOrigin);
    const url = new URL(value);
    if (expected.protocol !== "https:" || url.protocol !== "https:") return null;
    if (url.origin !== expected.origin || url.username || url.password || url.hash) return null;
    if (!/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/discover-[a-z0-9-]+\//.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
