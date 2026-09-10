import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const host = 'servsync-stripe-sandbox-git-codex-a-72970b-bencatchots-projects.vercel.app';
const origin = process.env.PROSPECT_BROWSER_URL || 'http://127.0.0.1:4185';
assert.ok(['http://127.0.0.1:4185', `https://${host}`].includes(origin), 'Only local or the reviewed Sandbox Preview is allowed.');
const bypass = process.env.PROSPECT_PREVIEW_BYPASS;
export async function verifyBrowser({ admin, other, homeowner, ref, marker, registerProspect, results }) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  async function pageFor(actor) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    if (bypass) await context.route(`https://${host}/**`, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass } }));
    // Existing adoption/alert reads refresh every contractor's alert as a side effect.
    // Block those unrelated RPCs; all prospect, claim, auth and public-profile traffic is real.
    await context.route(`https://${ref}.supabase.co/rest/v1/rpc/servsync_admin_*`, route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      return ['servsync_admin_contractor_adoption', 'servsync_admin_connection_alerts', 'servsync_admin_refresh_connection_alerts'].includes(name)
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        : route.continue();
    });
    if (actor) await context.addInitScript(({ session, key }) => localStorage.setItem(key, JSON.stringify(session)), { session: actor.session, key: `sb-${ref}-auth-token` });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    return page;
  }
  try {
    const adminPage = await pageFor(admin);
    // Capture only the created ID, before subsequent UI actions can fail.
    const created = new Promise(resolve => adminPage.on('response', async response => {
      if (response.url().endsWith('/rpc/servsync_admin_save_contractor_prospect') && response.ok() && response.request().postDataJSON()?.p_id === null) {
        const p = await response.json(); registerProspect(p.id); resolve(p);
      }
    }));
    await adminPage.goto(`${origin}/#/admin`);
    await adminPage.getByRole('button', { name: 'Unclaimed profiles', exact: true }).click({ timeout: 30000 });
    const section = adminPage.getByRole('region', { name: 'Unclaimed profiles' });
    await section.getByRole('button', { name: 'Create contractor profile' }).click();
    await expect(section.getByRole('textbox', { name: 'Profile address', exact: true })).toHaveCount(0);
    await section.getByRole('textbox', { name: 'Business name', exact: true }).fill('Sandbox Acceptance Plumbing');
    await section.getByRole('textbox', { name: 'Business email', exact: true }).fill(other.email);
    await section.getByRole('textbox', { name: 'Phone', exact: true }).fill('555-0102');
    await section.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(section.getByRole('status')).toContainText('Profile saved');
    const prospect = await created;
    const slug = prospect.slug;
    expect(slug).toMatch(/^sandbox-acceptance-plumbing-[a-f0-9]{12}$/);
    await section.getByRole('textbox', { name: 'Claim recipient email' }).fill(other.email);
    await section.getByRole('button', { name: 'Create new claim link' }).click();
    const linkField = section.getByRole('textbox', { name: 'Private claim link' });
    await expect(linkField).toBeVisible();
    let claimPath = new URL(await linkField.inputValue()).hash;
    results.push('browser admin UI creates public profile and recipient claim link');
    await section.getByRole('button', { name: 'Close editor' }).click();
    const listing = section.getByRole('article', { name: 'Sandbox Acceptance Plumbing', exact: true });
    await listing.getByRole('button', { name: 'Hide from Discover', exact: true }).click();
    await expect(section.getByRole('status')).toContainText('Profile hidden');
    await expect(listing).toHaveCount(0);
    await section.getByRole('combobox', { name: 'Visibility', exact: true }).selectOption('hidden');
    await listing.getByRole('button', { name: 'Show in Discover', exact: true }).click();
    await expect(section.getByRole('status')).toContainText('Profile is visible');
    await section.getByRole('combobox', { name: 'Visibility', exact: true }).selectOption('public');
    await listing.getByRole('button', { name: 'Manage', exact: true }).click();
    await section.getByRole('button', { name: 'Create new claim link' }).click();
    await expect(linkField).toBeVisible();
    claimPath = new URL(await linkField.inputValue()).hash;
    await section.getByRole('button', { name: 'Close editor' }).click();
    results.push('browser dedicated manager hides, retrieves, restores and reinvites an unclaimed profile');
    await adminPage.getByRole('button', { name: 'Contractors', exact: true }).click();
    await expect(section).toHaveCount(0);
    results.push('browser contractor accounts excludes the unclaimed profile manager');
    const publicPage = await pageFor(null);
    await publicPage.goto(`${origin}/#/profile?slug=${slug}`);
    await expect(publicPage.getByText('Unclaimed profile', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(publicPage.getByRole('button', { name: 'Request connection' })).toBeDisabled();
    await expect(publicPage.getByRole('button', { name: 'Request service' })).toBeDisabled();
    await expect(publicPage.locator('a[href^="mailto:"],a[href^="tel:"]')).toHaveCount(0);
    await expect(publicPage.getByText(other.email, { exact: true })).toHaveCount(0);
    await publicPage.setViewportSize({ width: 390, height: 844 });
    expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await publicPage.screenshot({ path: '/tmp/servsync-prospects-sandbox-public-mobile.png', fullPage: true });
    results.push('browser anonymous profile renders at mobile width with contact actions disabled');
    const homePage = await pageFor(homeowner);
    await homePage.goto(`${origin}/#/homeowner`);
    await homePage.getByRole('button', { name: 'Discover', exact: true }).click({ timeout: 30000 });
    await expect(homePage.getByRole('heading', { name: 'Sandbox Acceptance Plumbing', exact: true })).toBeVisible();
    results.push('browser homeowner Discover lists the unclaimed profile');
    const claimPage = await pageFor(other);
    await claimPage.goto(`${origin}/${claimPath}`);
    await expect(claimPage.getByRole('heading', { name: 'Claim your business profile' })).toBeVisible();
    await expect(claimPage.getByRole('button', { name: 'Claim business profile', exact: true })).toBeDisabled();
    await claimPage.getByRole('textbox', { name: 'Business name', exact: true }).fill('Sandbox Owner Reviewed Plumbing');
    await claimPage.getByRole('checkbox', { name: /authorized to manage/ }).check();
    await claimPage.getByRole('button', { name: 'Claim business profile', exact: true }).click();
    await expect(claimPage).not.toHaveURL(/claim_business/, { timeout: 30000 });
    const cp = await other.client.from('contractor_profiles').select('id,business_name,owner_user_id').eq('id', prospect.id).single();
    expect(cp.error).toBeNull(); expect(cp.data.business_name).toBe('Sandbox Owner Reviewed Plumbing'); expect(cp.data.owner_user_id).toBe(other.id);
    await publicPage.reload();
    await expect(publicPage.getByText('Unclaimed profile', { exact: true })).toHaveCount(0);
    await expect(publicPage.getByRole('heading', { name: 'Sandbox Owner Reviewed Plumbing', exact: true })).toBeVisible({ timeout: 30000 });
    results.push('browser recipient reviews and claims; same public address becomes owned profile');
    expect(errors).toEqual([]); results.push('browser flow has zero uncaught browser errors');
  } catch (error) {
    throw new Error(String(error.message).replace(/[a-f0-9]{64}/g, '[claim-token-redacted]'));
  } finally { await browser.close(); }
}
