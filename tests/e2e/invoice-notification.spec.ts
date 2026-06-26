import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import {
  createLocalE2ECustomer,
  escapeRegExp,
  openE2ECustomerActionPanel,
  timestampForRecord,
  waitForContractorWorkspaceReady,
} from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

// Options for a second browser context (homeowner) so it carries the same
// Vercel Preview protection bypass + baseURL as the default config context.
function appContextOptions() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return {
    baseURL: process.env.TEST_APP_URL,
    extraHTTPHeaders: bypass
      ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
  };
}

async function waitForInvoiceDraftSave(main: Locator, saveInvoiceButton: Locator) {
  const saveError = main
    .getByText(/Unable to save invoice draft|Add at least one line item|Add an invoice title/i)
    .first();
  await Promise.race([
    saveInvoiceButton.waitFor({ state: 'hidden', timeout: 30_000 }),
    saveError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
      throw new Error(`Invoice draft save failed: ${(await saveError.textContent())?.trim() || 'unknown error'}`);
    }),
  ]);
}

// Open a contractor customer by name without depending on "Not invited" status
// (the shared helper filters on that, which no longer holds once connected).
async function openCustomerByName(page: Page, customerName: string) {
  const main = page.getByRole('main');
  const search = main.getByPlaceholder(/Search homeowner, city, address/i);
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(customerName);
  const result = main.getByRole('button').filter({ hasText: customerName }).first();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click();
  await expect(
    main.getByRole('heading', { level: 2, name: new RegExp(`^${escapeRegExp(customerName)}$`, 'i') }),
  ).toBeVisible({ timeout: 30_000 });
  await waitForContractorWorkspaceReady(page);
}

test.describe('invoice_sent in-app notification', () => {
  test('contractor sends invoice to connected homeowner -> homeowner sees Invoice sent notification', async ({ page, browser }, testInfo) => {
    requireApprovedSandboxForMutation();
    test.setTimeout(180_000);

    const contractorErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const ts = timestampForRecord();
    const invoiceTitle = `E2E Invoice Notif ${ts}`;

    // ---- Phase 1: contractor creates a local customer + a claim invite ----
    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);
    await waitForContractorWorkspaceReady(page);

    const { customerName } = await createLocalE2ECustomer(page, ts);

    const inviteButton = main.getByRole('button', { name: /Invite to ServSync|Create New ServSync Invite/i });
    await expect(inviteButton).toBeVisible({ timeout: 30_000 });
    const invitePromise = page.waitForResponse(r => r.url().includes('/rpc/servsync_create_local_customer_claim_invite'));
    await inviteButton.click();
    const inviteResp = await invitePromise;
    expect(inviteResp.ok()).toBeTruthy();
    const inviteJson = await inviteResp.json();
    const token: string | undefined = inviteJson?.invite_token ?? inviteJson?.[0]?.invite_token;
    expect(token, 'claim invite token returned').toBeTruthy();

    // ---- Phase 2: homeowner claims the invite (separate context) ----
    const homeownerContext = await browser.newContext(appContextOptions());
    const hoPage = await homeownerContext.newPage();
    const hoMain = hoPage.getByRole('main');
    const homeownerErrors = captureMajorConsoleErrors(hoPage);

    await loginAs(hoPage, 'homeowner');
    await hoPage.goto(`/#/homeowner?claim=${encodeURIComponent(token as string)}`);
    const acceptButton = hoMain.getByRole('button', { name: /^Accept and (link to my existing home|create\/link my profile)$/i });
    await expect(acceptButton).toBeVisible({ timeout: 30_000 });
    const acceptPromise = hoPage.waitForResponse(r => r.url().includes('/rpc/servsync_accept_local_customer_claim'));
    await acceptButton.click();
    const acceptResp = await acceptPromise;
    expect(acceptResp.ok()).toBeTruthy();

    // ---- Phase 3: contractor creates + SENDS the invoice ----
    await page.reload();
    await openSidebarTab(page, /Homeowners/i);
    await waitForContractorWorkspaceReady(page);
    await openCustomerByName(page, customerName);
    await openE2ECustomerActionPanel(page, customerName);
    await main.getByRole('button', { name: /^Create invoice\b/i }).click();
    await expectActiveTabHeading(page, /^Jobs$/i);
    await expect(main.getByRole('heading', { name: /^Invoice draft$/i })).toBeVisible();

    await main.getByRole('textbox', { name: /^Invoice title$/i }).fill(invoiceTitle);
    await main.getByRole('textbox', { name: /^(Invoice scope|Scope)$/i }).fill('E2E invoice for invoice_sent notification test.');
    await main.getByRole('textbox', { name: /^(Invoice line item 1 description|Description)$/i }).fill(invoiceTitle);
    await main.getByRole('spinbutton', { name: /^(Invoice line item 1 quantity|Qty)$/i }).fill('1');
    await main.getByRole('textbox', { name: /^(Invoice line item 1 unit price|Unit price)$/i }).fill('150');

    const saveInvoiceButton = main.getByRole('button', { name: /^Save Invoice$/i });
    await expect(saveInvoiceButton).toBeEnabled();
    await saveInvoiceButton.click();
    await waitForInvoiceDraftSave(main, saveInvoiceButton);

    await expect(main.getByRole('heading', { name: /^Open estimates and invoices$/i })).toBeVisible();
    await expect(main.getByText(invoiceTitle, { exact: true })).toBeVisible({ timeout: 30_000 });

    const sendButton = main
      .getByRole('button', { name: new RegExp(`Send invoice ${escapeRegExp(invoiceTitle)} to homeowner`, 'i') })
      .first();
    await expect(sendButton).toBeVisible({ timeout: 30_000 });
    const sendPromise = page.waitForResponse(r => r.url().includes('/rpc/servsync_send_invoice'));
    await sendButton.click();
    const sendResp = await sendPromise;
    expect(sendResp.ok()).toBeTruthy();

    // ---- Phase 4: homeowner sees the invoice_sent notification ----
    // Deployed-build selectors only: the lucide Bell icon + the unique invoice
    // title (notification body). "Invoice sent" + the unique title together
    // match only the notification item, never the invoice row in the list.
    const homeownerBell = hoPage.locator('button:has(svg.lucide-bell)').first();
    const homeownerBadge = hoPage.locator('button:has(svg.lucide-bell) span').first();
    const homeownerInvoiceNotif = hoPage
      .getByRole('button')
      .filter({ hasText: /Invoice sent/i })
      .filter({ hasText: invoiceTitle });

    await hoPage.goto('/#/homeowner');
    await hoPage.reload();
    await expect(homeownerBell).toBeVisible({ timeout: 30_000 });
    // Unread count is visible (this invoice notification is unread).
    await expect(homeownerBadge).toBeVisible({ timeout: 30_000 });

    await homeownerBell.click();
    await expect(homeownerInvoiceNotif.first()).toBeVisible({ timeout: 30_000 });
    // Unread items are not dimmed (read items get opacity-65).
    await expect(homeownerInvoiceNotif.first()).not.toHaveClass(/opacity-65/);

    // Click navigation: marks the notification read and opens the invoices view.
    await homeownerInvoiceNotif.first().click();
    await expect(
      hoMain.getByRole('heading', { level: 1, name: /Estimates|Invoices/i }),
    ).toBeVisible({ timeout: 30_000 });

    // Mark one read: the click above marked it read (now dimmed).
    await homeownerBell.click();
    await expect(homeownerInvoiceNotif.first()).toHaveClass(/opacity-65/, { timeout: 30_000 });

    // Mark all read (clears any remaining unread).
    const markAll = hoPage.getByRole('button', { name: /^Mark all read$/i });
    if (await markAll.isVisible().catch(() => false)) {
      await markAll.click();
    }
    await expect(homeownerBadge).toHaveCount(0, { timeout: 30_000 });

    // ---- Cross-user separation: contractor never receives this notification ----
    const contractorBell = page.locator('button:has(svg.lucide-bell)').first();
    if (await contractorBell.isVisible().catch(() => false)) {
      await contractorBell.click();
      await expect(
        page.getByRole('button').filter({ hasText: /Invoice sent/i }).filter({ hasText: invoiceTitle }),
      ).toHaveCount(0);
    }

    await homeownerErrors.assertClean(testInfo);
    await contractorErrors.assertClean(testInfo);
    await homeownerContext.close();
  });
});
