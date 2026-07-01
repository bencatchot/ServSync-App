import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const reviewEligibilitySql = () => sourceFile('servsync-review-eligibility.sql');
const reviewGrantHardeningSql = () => sourceFile('servsync-review-grant-hardening.sql');
const publicReviewsSql = () => sourceFile('servsync-public-reviews.sql');
const externalReviewLinksSql = () => sourceFile('servsync-external-review-links.sql');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-026 review trust boundaries', () => {
  test('homeowner review UI only opens for closed review-eligible service requests', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');

    expect(homeownerSource).toContain("const canLeaveReview = request.status === 'closed' && Boolean(request.review_eligible);");
    expect(homeownerSource).toContain('canLeaveReview && reviewDrafts[request.id]?.open');
    expect(homeownerSource).toContain('Leave a review for {request.contractor_name}');
    expect(homeownerSource).toContain('>Leave a review</button>');
    expect(homeownerSource).not.toContain("request.status === 'closed' || Boolean(request.review_eligible)");
    expect(homeownerSource).not.toContain("request.status !== 'declined' && Boolean(request.review_eligible)");
  });

  test('homeowner review submission uses the guarded review RPC instead of direct table writes', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const submitReviewSource = sourceBetween(homeownerSource, 'const submitReview = async', 'const respondToAppointment = async');

    expect(submitReviewSource).toContain("supabase.rpc('servsync_homeowner_submit_review'");
    expect(submitReviewSource).toContain('p_request_id: request.id');
    expect(submitReviewSource).toContain('p_rating: draft.rating');
    expect(submitReviewSource).toContain('p_reviewer_display_name');
    expect(submitReviewSource).toContain('p_reviewer_location');
    expect(submitReviewSource).not.toContain(".from('service_request_reviews')");
    expect(submitReviewSource).not.toContain('.from("service_request_reviews")');
  });

  test('contractor dashboard does not expose controls to create, edit, approve, or delete homeowner reviews', () => {
    const source = appSource();
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');

    expect(contractorSource).toContain('Homeowner reviews');
    expect(contractorSource).toContain('Homeowner review');
    expect(contractorSource).not.toContain('servsync_homeowner_submit_review');
    expect(contractorSource).not.toContain('setReviewDrafts');
    expect(contractorSource).not.toContain('Submit review');
    expect(contractorSource).not.toContain('Leave a review');
    expect(contractorSource).not.toContain('Approve review');
    expect(contractorSource).not.toContain('Delete review');
    expect(contractorSource).not.toContain('Edit review');
  });

  test('external review links remain separate from ServSync reviews and are not counted as ServSync ratings', () => {
    const source = appSource();
    const profileSource = sourceBetween(source, 'function ContractorPublicProfilePage', 'function DiscoverFeed');
    const discoverSource = sourceBetween(source, 'function DiscoverFeed', 'function EmptyState');
    const externalSql = externalReviewLinksSql();

    expect(profileSource).toContain('External review links take you to third-party review sites.');
    expect(profileSource).toContain('ServSync reviews are separate and come from completed ServSync work.');
    expect(profileSource).toContain('ServSync Reviews ({data.review_count})');
    expect(profileSource).toContain('From completed ServSync work.');
    expect(discoverSource).toContain('These links open third-party review sites. They are separate from ServSync reviews.');
    expect(externalSql).toContain('coalesce(cp.external_review_links');
    expect(externalSql).toContain('from public.service_request_reviews r');
    expect(externalSql).not.toContain('jsonb_array_length(cp.external_review_links)');
    expect(externalSql).not.toContain('external_review_links) as review_count');
  });

  test('public profile and Discover review displays use public-safe fields only', () => {
    const source = appSource();
    const reviewCardSource = sourceBetween(source, 'function PublicReviewCard', 'function LandingPage');
    const publicSql = publicReviewsSql();

    for (const publicSafeField of [
      'rating',
      'body',
      'kudos',
      'reviewer_display_name',
      'reviewer_location',
      'created_at',
    ]) {
      expect(publicSql).toContain(publicSafeField);
    }

    for (const privateField of [
      'homeowner_user_id',
      'request_id',
      'service_request_id',
      'home_id',
      'address_line1',
      'phone',
      'email',
      'closing_summary',
    ]) {
      expect(reviewCardSource).not.toContain(privateField);
    }
  });

  test('review eligibility SQL ties reviews to completed ServSync work and blocks contractor authorship', () => {
    const sql = reviewEligibilitySql();

    expect(sql).toContain('ServSync Reviews remain anchored to public.service_request_reviews.');
    expect(sql).toContain('This patch requires completed platform-work evidence');
    expect(sql).toContain('servsync_service_request_has_completed_work');
    expect(sql).toContain("sr.status = 'closed'");
    expect(sql).toContain('homeowner_user_id = auth.uid()');
    expect(sql).toContain('public.servsync_homeowner_can_review_service_request(request_id, auth.uid())');
    expect(sql).toContain('public.current_user_can_access_contractor(contractor_id)');
    expect(sql).not.toContain('current_user_can_manage_contractor_schedule');
    expect(sql).not.toContain('current_user_can_manage_contractor_billing');
  });

  test('review grant hardening keeps direct review table access closed to browser roles', () => {
    const sql = reviewGrantHardeningSql();

    expect(sql).toContain('Review writes should flow through servsync_homeowner_submit_review(...).');
    expect(sql).toContain('revoke all privileges on table public.service_request_reviews from anon;');
    expect(sql).toContain('revoke all privileges on table public.service_request_reviews from authenticated;');
    expect(sql).toContain('grant execute on function public.servsync_homeowner_submit_review(uuid, smallint, text, text[], text, text)');
    expect(sql).toContain('grant execute on function public.servsync_homeowner_can_review_service_request(uuid, uuid)');
    expect(sql).not.toContain('grant select on public.service_request_reviews to anon');
    expect(sql).not.toContain('grant insert on public.service_request_reviews to authenticated');
    expect(sql).not.toContain('grant execute on function public.servsync_service_request_has_completed_work');
  });

  test('review and referral copy avoids unsupported trust claims and automation', () => {
    const source = appSource();
    const reviewedSource = [
      sourceBetween(source, 'function ContractorPublicProfilePage', 'function DiscoverFeed'),
      sourceBetween(source, 'function DiscoverFeed', 'function EmptyState'),
    ].join('\n');

    for (const unsupportedClaim of [
      'Top Rated',
      'award-winning',
      'verified contractor',
      'paid ranking',
      'sponsored ranking',
      'Google review posted',
      'automatically post',
      'imported Google reviews',
      'seeded reviews',
      'fake reviews',
    ]) {
      expect(reviewedSource.toLowerCase()).not.toContain(unsupportedClaim.toLowerCase());
    }
  });
});
