import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const reviewEligibilitySql = () => sourceFile('servsync-review-eligibility.sql');
const reviewGrantHardeningSql = () => sourceFile('servsync-review-grant-hardening.sql');
const reviewPublicDisplayPauseSql = () => sourceFile('servsync-review-public-display-pause.sql');
const reviewModerationFoundationSql = () => sourceFile('servsync-review-moderation-foundation.sql');
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

  test('homeowner review form copy reflects paused public display and pending moderation', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const reviewFormSource = sourceBetween(
      homeownerSource,
      'Leave a review for {request.contractor_name}',
      '<Star size={15} />{submittingReviewId === request.id',
    );

    expect(reviewFormSource).toContain('Your name (optional display detail)');
    expect(reviewFormSource).toContain('Your city/state (optional display detail)');
    expect(reviewFormSource).toContain('Public ServSync review display is paused while moderation is finalized.');
    expect(reviewFormSource).toContain('Optional display details may be reviewed before any future public display.');
    expect(reviewFormSource).not.toContain('shown publicly');
    expect(reviewFormSource).not.toContain('displayed publicly');
    expect(reviewFormSource).not.toContain('public name');
    expect(reviewFormSource).not.toContain('public location');
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
    expect(source).toContain('ServSync public review display is being finalized for beta.');
    expect(source).toContain('Reviews from completed ServSync work are not shown publicly yet.');
    expect(profileSource).toContain('PUBLIC_REVIEW_DISPLAY_PAUSED_COPY');
    expect(profileSource).toContain('PUBLIC_REVIEW_DISPLAY_PAUSED_HELPER');
    expect(discoverSource).toContain('These links open third-party review sites. They are separate from ServSync reviews.');
    expect(externalSql).toContain('coalesce(cp.external_review_links');
    expect(externalSql).toContain('from public.service_request_reviews r');
    expect(externalSql).not.toContain('jsonb_array_length(cp.external_review_links)');
    expect(externalSql).not.toContain('external_review_links) as review_count');
  });

  test('public profile and Discover review displays pause ServSync review aggregates and snippets', () => {
    const source = appSource();
    const profileSource = sourceBetween(source, 'function ContractorPublicProfilePage', 'function DiscoverFeed');
    const discoverSource = sourceBetween(source, 'function DiscoverFeed', 'function EmptyState');
    const pauseSql = reviewPublicDisplayPauseSql();
    const publicSql = publicReviewsSql();

    expect(publicSql).toContain('from public.service_request_reviews');
    expect(pauseSql).toContain("'avg_rating',             null::numeric");
    expect(pauseSql).toContain("'review_count',           0::bigint");
    expect(pauseSql).toContain("'reviews',                '[]'::jsonb");
    expect(pauseSql).toContain('null::numeric as avg_rating');
    expect(pauseSql).toContain('0::bigint as review_count');
    expect(pauseSql).toContain("'[]'::jsonb as reviews");
    expect(pauseSql).not.toContain('from public.service_request_reviews');

    const profileReviewPauseSource = sourceBetween(profileSource, '{/* Reviews */}', '</section>');
    const discoverReviewPauseSource = sourceBetween(
      discoverSource,
      '<p className="text-sm font-semibold text-slate-700">{PUBLIC_REVIEW_DISPLAY_PAUSED_COPY}</p>',
      'External Reviews',
    );

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
      expect(profileReviewPauseSource).not.toContain(privateField);
      expect(discoverReviewPauseSource).not.toContain(privateField);
    }

    expect(profileSource).not.toContain('ServSync Reviews ({data.review_count})');
    expect(profileSource).not.toContain('No ServSync reviews yet.');
    expect(profileSource).not.toContain('data.reviews.map');
    expect(profileSource).not.toContain('data.avg_rating.toFixed(1)');
    expect(discoverSource).not.toContain('item.reviews.map');
    expect(discoverSource).not.toContain('selectedPost.reviews.map');
    expect(discoverSource).not.toContain('Common review notes');
    expect(discoverSource).not.toContain('selectedPost.avg_rating.toFixed(1)');
  });

  test('public display pause preserves private review capture and avoids moderation schema creep', () => {
    const source = appSource();
    const pauseSql = reviewPublicDisplayPauseSql();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');

    expect(homeownerSource).toContain("supabase.rpc('servsync_homeowner_submit_review'");
    expect(contractorSource).toContain('Homeowner reviews');
    expect(pauseSql).toContain('does not change review capture, private party visibility');
    expect(pauseSql).toContain('coalesce(cp.external_review_links');
    expect(pauseSql).not.toContain('create table');
    expect(pauseSql).not.toContain('alter table public.service_request_reviews');
    expect(pauseSql).not.toContain('moderation_status');
    expect(pauseSql).not.toContain('moderated_at');
    expect(pauseSql).not.toContain('hidden_reason');
  });

  test('review moderation foundation defaults reviews to pending without public display re-enable', () => {
    const sql = reviewModerationFoundationSql();
    const pauseSql = reviewPublicDisplayPauseSql();

    expect(sql).toContain('FB-026 Slice 3B-1: review moderation SQL/RPC foundation.');
    expect(sql).toContain("add column if not exists moderation_status text not null default 'pending'");
    expect(sql).toContain('add column if not exists moderated_at timestamptz null');
    expect(sql).toContain('add column if not exists moderated_by uuid null references public.profiles(id)');
    expect(sql).toContain("add column if not exists moderation_note text not null default ''");
    expect(sql).toContain('add column if not exists updated_at timestamptz not null default now()');
    expect(sql).toContain("check (moderation_status in ('pending', 'approved', 'hidden', 'rejected'))");
    expect(sql).not.toContain("moderation_status = 'approved'");
    expect(sql).toContain('from public.service_request_reviews rv');

    expect(pauseSql).toContain("'avg_rating',             null::numeric");
    expect(pauseSql).toContain("'review_count',           0::bigint");
    expect(pauseSql).toContain("'reviews',                '[]'::jsonb");
    expect(pauseSql).not.toContain('from public.service_request_reviews');
  });

  test('homeowner review submit resets moderation fields to pending on submit and resubmit', () => {
    const sql = reviewModerationFoundationSql();
    const submitSource = sourceBetween(
      sql,
      'create or replace function public.servsync_homeowner_submit_review',
      'create or replace function public.servsync_admin_review_moderation_queue',
    );

    expect(submitSource).toContain("moderation_status,\n    moderated_at,\n    moderated_by,\n    moderation_note,\n    updated_at");
    expect(submitSource).toContain("'pending',\n    null,\n    null,\n    '',\n    now()");
    expect(submitSource).toContain("moderation_status = 'pending'");
    expect(submitSource).toContain('moderated_at = null');
    expect(submitSource).toContain('moderated_by = null');
    expect(submitSource).toContain("moderation_note = ''");
    expect(submitSource).toContain('updated_at = now()');
    expect(submitSource).toContain('servsync_service_request_has_completed_work');
    expect(submitSource).toContain("sr.status = 'closed'");
    expect(submitSource).toContain('sr.homeowner_user_id = auth.uid()');
  });

  test('admin moderation RPCs are guarded and do not create public display, dispute, or UI scope', () => {
    const sql = reviewModerationFoundationSql();

    expect(sql).toContain('create or replace function public.servsync_admin_review_moderation_queue');
    expect(sql).toContain('create or replace function public.servsync_admin_update_review_moderation');
    expect(sql.match(/if not public\.current_user_is_platform_admin\(\) then/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("raise exception 'Unauthorized'");
    expect(sql).toContain("p_status not in ('pending', 'approved', 'hidden', 'rejected')");
    expect(sql).toContain('revoke all privileges on table public.service_request_reviews from public;');
    expect(sql).toContain('revoke all privileges on table public.service_request_reviews from anon;');
    expect(sql).toContain('revoke all privileges on table public.service_request_reviews from authenticated;');
    expect(sql).toContain('grant execute on function public.servsync_admin_review_moderation_queue(text)');
    expect(sql).toContain('grant execute on function public.servsync_admin_update_review_moderation(uuid, text, text)');

    for (const outOfScope of [
      'create table',
      'contractor_dispute',
      'review_response',
      'google',
      'badge',
      'award',
      'ranking',
    ]) {
      expect(sql.toLowerCase()).not.toContain(outOfScope);
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
