import test from 'node:test';
import assert from 'node:assert/strict';
import { requestDecision, assertReviewEnvironment, approvedOrigin, localOrigin } from '../../scripts/help/record-guided-onboarding-review.mjs';

test('review recorder refuses business writes, production, Help publication and toolbar authentication', () => {
  const demo = 'https://bdytwgejqnlblhrnqxkp.supabase.co';
  assert.equal(requestDecision(`${demo}/rest/v1/rpc/servsync_current_contractor_profile`, 'POST'), 'read');
  assert.equal(requestDecision(`${demo}/auth/v1/token`, 'POST'), 'login');
  for (const path of ['/auth/v1/signup', '/rest/v1/rpc/servsync_save_work_draft', '/rest/v1/rpc/servsync_launch_work_draft', '/rest/v1/rpc/servsync_transition_help_walkthrough', '/rest/v1/estimates']) {
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal(requestDecision(`${demo}${path}`, method), 'deny');
  }
  assert.equal(requestDecision('https://uqgtheclhxqlnjpfmheq.supabase.co/rest/v1/estimates', 'GET'), 'deny');
  assert.equal(requestDecision('https://vercel.live/login/validate', 'POST'), 'toolbar-block');
  assert.equal(requestDecision(`${approvedOrigin}/api/send-local-estimate-email`, 'POST'), 'deny');
});

test('review recorder requires the exact approved origin and rejects broad credentials', () => {
  const env = { ONBOARDING_REVIEW_ORIGIN: approvedOrigin, ONBOARDING_REVIEW_READONLY: 'true', DEMO_CONTRACTOR_EMAIL: 'fixture', DEMO_CONTRACTOR_PASSWORD: 'fixture', ONBOARDING_DEMO_BYPASS: 'fixture' };
  assert.doesNotThrow(() => assertReviewEnvironment(env));
  assert.throws(() => assertReviewEnvironment({ ...env, ONBOARDING_REVIEW_ORIGIN: 'https://servsync.app' }));
  assert.throws(() => assertReviewEnvironment({ ...env, ONBOARDING_REVIEW_ORIGIN: localOrigin }));
  assert.doesNotThrow(() => assertReviewEnvironment({ ...env, ONBOARDING_REVIEW_ORIGIN: localOrigin, ONBOARDING_DEMO_BYPASS: undefined }));
  for (const key of ['VERCEL_AUTOMATION_BYPASS_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'DEMO_SUPABASE_SERVICE_ROLE_KEY']) assert.throws(() => assertReviewEnvironment({ ...env, [key]: 'fixture' }));
});
