import { expect, test } from '@playwright/test';
import { loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { timestampForRecord, waitForContractorWorkspaceReady } from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

// Standalone Calendar Events v1 — contractor creates a calendar event that is
// not tied to a job, sees it on the calendar, opens detail, edits, and deletes.
// Real UI actions only; no direct DB inserts.
test.describe('standalone calendar events', () => {
  test('contractor creates, edits, and deletes a standalone calendar event', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();
    test.setTimeout(120_000);
    // The delete action uses window.confirm — auto-accept it.
    page.on('dialog', dialog => { void dialog.accept(); });

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const ts = timestampForRecord();
    const title = `E2E Calendar Event ${ts}`;
    const editedTitle = `E2E Calendar Event ${ts} edited`;

    const calendarEventsRequest = (method: string) => (response: import('@playwright/test').Response) =>
      response.url().includes('/rest/v1/contractor_calendar_events') && response.request().method() === method;

    const eventRow = (eventTitle: string) =>
      main.getByRole('button').filter({ hasText: eventTitle }).filter({ hasText: /Not tied to a job/i });

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /^Calendar$/i);
    await waitForContractorWorkspaceReady(page);

    // ── Create ────────────────────────────────────────────────────────────────
    await main.getByRole('button', { name: /^New event$/i }).click();
    await expect(page.getByRole('heading', { name: /^New calendar event$/i })).toBeVisible();
    await expect(page.getByText(/^Not tied to a job$/i).first()).toBeVisible();

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
    await page.getByRole('combobox', { name: 'Event type', exact: true }).selectOption('routine_inspection');
    await page.getByRole('spinbutton', { name: /Duration/i }).fill('45');
    await page.getByRole('textbox', { name: /Notes/i }).fill('E2E standalone calendar event — safe to delete.');

    const insertResponse = page.waitForResponse(calendarEventsRequest('POST'));
    await page.getByRole('button', { name: /^Create event$/i }).click();
    expect((await insertResponse).ok()).toBeTruthy();

    // Appears on the calendar (selected-day / upcoming list).
    await expect(eventRow(title).first()).toBeVisible({ timeout: 30_000 });

    // ── Open detail ─────────────────────────────────────────────────────────--
    await eventRow(title).first().click();
    await expect(page.getByRole('heading', { name: /^Calendar event$/i })).toBeVisible();
    await expect(page.getByText(/^Not tied to a job$/i).first()).toBeVisible();
    const comingSoon = page.getByRole('button', { name: /Create Job from Event \(coming soon\)/i });
    await expect(comingSoon).toBeVisible();
    await expect(comingSoon).toBeDisabled();

    // ── Edit ──────────────────────────────────────────────────────────────────
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(editedTitle);
    const updateResponse = page.waitForResponse(calendarEventsRequest('PATCH'));
    await page.getByRole('button', { name: /^Save changes$/i }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    await expect(eventRow(editedTitle).first()).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText(title, { exact: true })).toHaveCount(0);

    // ── Delete ──────────────────────────────────────────────────────────────--
    await eventRow(editedTitle).first().click();
    await expect(page.getByRole('heading', { name: /^Calendar event$/i })).toBeVisible();
    const deleteResponse = page.waitForResponse(calendarEventsRequest('DELETE'));
    await page.getByRole('button', { name: /^Delete$/i }).click();
    expect((await deleteResponse).ok()).toBeTruthy();
    await expect(main.getByText(editedTitle, { exact: false })).toHaveCount(0, { timeout: 30_000 });

    await consoleErrors.assertClean(testInfo);
  });
});
