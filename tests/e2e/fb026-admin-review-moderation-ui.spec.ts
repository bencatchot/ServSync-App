import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const typeSource = () => sourceFile('src/types.ts');
const reviewPublicDisplayPauseSql = () => sourceFile('servsync-review-public-display-pause.sql');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-026 admin review moderation UI', () => {
  test('platform admin dashboard exposes an internal Reviews tab using existing moderation RPCs', () => {
    const source = appSource();
    const adminSource = sourceBetween(source, 'function PlatformAdminDashboard', 'function PermissionPicker');

    expect(adminSource).toContain("{ id: 'reviews',      label: 'Reviews'");
    expect(adminSource).toContain("supabase.rpc('servsync_admin_review_moderation_queue'");
    expect(adminSource).toContain("supabase.rpc('servsync_admin_update_review_moderation'");
    expect(adminSource).toContain('REVIEW_MODERATION_FILTER_OPTIONS');
    expect(source).toContain("value: 'pending', label: 'Pending'");
    expect(source).toContain("value: 'approved', label: 'Approved'");
    expect(source).toContain("value: 'hidden', label: 'Hidden'");
    expect(source).toContain("value: 'rejected', label: 'Rejected'");
    expect(source).toContain("value: 'all', label: 'All reviews'");
  });

  test('admin review moderation copy keeps approval separate from public display', () => {
    const source = appSource();
    const adminSource = sourceBetween(source, 'function PlatformAdminDashboard', 'function PermissionPicker');
    const pauseSql = reviewPublicDisplayPauseSql();

    expect(adminSource).toContain('Public ServSync review display remains paused.');
    expect(adminSource).toContain('Approving a review records moderation status only; it does not publish the review publicly yet.');
    expect(adminSource).toContain('Internal admin only');
    expect(adminSource).toContain('Save status');
    expect(adminSource).toContain('Approve');
    expect(adminSource).toContain('Hide');
    expect(adminSource).toContain('Reject');
    expect(adminSource).toContain('Reset pending');

    expect(pauseSql).toContain("'avg_rating',             null::numeric");
    expect(pauseSql).toContain("'review_count',           0::bigint");
    expect(pauseSql).toContain("'reviews',                '[]'::jsonb");
    expect(pauseSql).not.toContain('from public.service_request_reviews');
  });

  test('homeowner and contractor dashboards do not expose admin moderation controls', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');

    for (const dashboardSource of [homeownerSource, contractorSource]) {
      expect(dashboardSource).not.toContain('servsync_admin_review_moderation_queue');
      expect(dashboardSource).not.toContain('servsync_admin_update_review_moderation');
      expect(dashboardSource).not.toContain('Review moderation');
      expect(dashboardSource).not.toContain('Approving a review records moderation status only');
      expect(dashboardSource).not.toContain('Save status');
      expect(dashboardSource).not.toContain('Reset pending');
    }
  });

  test('admin review moderation rows and drafts use explicit review moderation types', () => {
    const source = appSource();
    const types = typeSource();

    expect(types).toContain("export type ReviewModerationStatus = 'pending' | 'approved' | 'hidden' | 'rejected';");
    expect(types).toContain('export interface AdminReviewModerationRow');
    expect(types).toContain('moderation_status: ReviewModerationStatus;');
    expect(types).toContain('moderation_note: string;');
    expect(source).toContain('type AdminReviewModerationFilter = ReviewModerationStatus |');
    expect(source).toContain('type AdminReviewModerationDraft =');
    expect(source).toContain('reviewModerationDraftFromRow');
  });

  test('admin UI avoids unsupported trust claims while external reviews remain separate', () => {
    const source = appSource();
    const adminSource = sourceBetween(source, 'function PlatformAdminDashboard', 'function PermissionPicker');
    const profileSource = sourceBetween(source, 'function ContractorPublicProfilePage', 'function DiscoverFeed');
    const discoverSource = sourceBetween(source, 'function DiscoverFeed', 'function EmptyState');

    expect(profileSource).toContain('External review links take you to third-party review sites.');
    expect(profileSource).toContain('ServSync reviews are separate and come from completed ServSync work.');
    expect(discoverSource).toContain('These links open third-party review sites. They are separate from ServSync reviews.');

    for (const unsupportedClaim of [
      'verified reviews',
      'public moderated reviews',
      'award',
      'top contractor',
      'paid ranking',
      'imported Google reviews',
      'automated Google posting',
      'Google review posted',
    ]) {
      expect(adminSource.toLowerCase()).not.toContain(unsupportedClaim.toLowerCase());
    }
  });
});
