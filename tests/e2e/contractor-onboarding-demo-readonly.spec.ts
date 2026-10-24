import { expect, test } from '@playwright/test';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
const demoHost = 'bdytwgejqnlblhrnqxkp.supabase.co';
// This destination was explicitly approved for the existing Demo bypass.
const approvedPreviewOrigin = 'https://servsync-demo-mddems300-bencatchots-projects.vercel.app';
const readRpcs = new Set([
  'servsync_current_contractor_profile', 'servsync_contractor_connected_homeowners', 'servsync_contractor_service_requests',
  'servsync_contractor_pending_connection_requests', 'servsync_contractor_team', 'servsync_list_local_customer_summaries',
  'servsync_list_local_customer_historical_context', 'servsync_list_archived_local_customers', 'servsync_list_local_customer_claim_invites_v2',
  'servsync_list_price_book_internal_costs', 'servsync_current_contractor_entitlements', 'servsync_current_contractor_durable_draft_entitlement',
  'current_user_can_access_contractor', 'current_user_can_manage_contractor_estimates', 'current_user_can_manage_contractor_billing',
  'current_user_can_write_contractor_jobs', 'servsync_find_help', 'servsync_get_work_draft',
]);

test('Demo owner reaches sample and real unsaved preview through the actual app without business writes', async ({ page }) => {
  test.skip(process.env.ONBOARDING_DEMO_READONLY !== 'true', 'Requires explicit dedicated Demo credentials and read-only opt-in.');
  test.setTimeout(90_000);
  if (process.env.ONBOARDING_MOBILE === 'true') await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) throw new Error('Use the origin-scoped ONBOARDING_DEMO_BYPASS instead of global headers');
  const bypass = process.env.ONBOARDING_DEMO_BYPASS;
  if (bypass && process.env.TEST_APP_URL !== approvedPreviewOrigin) throw new Error('Unapproved bypass destination');
  const blocked: string[] = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    // Preview toolbar is unrelated to app verification. Do not authenticate it.
    if (url.hostname === 'vercel.live') { await route.abort(); return; }
    if (url.hostname.endsWith('.supabase.co') && url.hostname !== demoHost) { blocked.push('non-Demo backend'); await route.abort(); return; }
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      await route.continue(bypass && url.origin === approvedPreviewOrigin
        ? { headers: { ...request.headers(), 'x-vercel-protection-bypass': bypass } }
        : undefined);
      return;
    }
    const rpc = url.pathname.split('/rest/v1/rpc/')[1];
    if (url.hostname === demoHost && (url.pathname === '/auth/v1/token' || (rpc && readRpcs.has(rpc)))) { await route.continue(); return; }
    blocked.push(`${url.origin}${url.pathname}`); await route.abort();
  });
  await page.goto('/#/contractor');
  await page.getByLabel('Email', { exact: true }).fill(process.env.DEMO_CONTRACTOR_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_CONTRACTOR_PASSWORD!);
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Contractor command center', { exact: true })).toBeVisible({ timeout: 30_000 });
  const reopen = page.getByRole('button', { name: 'Open first-estimate guide' });
  if (await reopen.isVisible()) await reopen.click();
  await expect(page.getByRole('heading', { name: 'Build your first estimate' })).toBeVisible();
  await page.getByRole('button', { name: 'Try sample estimate' }).click();
  await page.getByRole('button', { name: 'Preview customer estimate' }).click();
  await expect(page.getByTestId('onboarding-estimate-preview')).toContainText('$195.00');
  await page.getByRole('button', { name: 'Start a real estimate' }).click();
  await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Customer', exact: true })).toHaveValue('');
  await page.getByLabel('What needs doing?').fill('Synthetic onboarding preview only');
  await page.getByLabel('Scope / description').fill('Synthetic scope; do not save or send.');
  await page.getByLabel('Draft estimate line item 1 description', { exact: true }).fill('Synthetic repair');
  await page.getByLabel('Draft estimate line item 1 unit price', { exact: true }).fill('125');
  await page.getByRole('button', { name: 'Preview customer estimate' }).click();
  await expect(page.getByTestId('onboarding-estimate-preview')).toContainText('$125.00');
  await expect(page.getByTestId('onboarding-estimate-preview')).toContainText('Customer not selected');
  const pdfText = await page.getByRole('link', { name: 'Open customer PDF preview' }).evaluate(async link => (await fetch((link as HTMLAnchorElement).href)).text());
  expect(pdfText).toContain('Preview generated:');
  expect(pdfText).not.toContain('Invalid Date');
  expect(blocked, 'No business mutation or unexpected backend requests').toEqual([]);
});
