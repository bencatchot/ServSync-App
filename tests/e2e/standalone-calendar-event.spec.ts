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
    const selectedDate = new Date();
    selectedDate.setDate(selectedDate.getDate() + 1);
    const selectedDateValue = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    const selectedDayPattern = new RegExp(`^${selectedDate.getDate()}\\b`);

    const calendarEventsRequest = (method: string) => (response: import('@playwright/test').Response) =>
      response.url().includes('/rest/v1/contractor_calendar_events') && response.request().method() === method;

    const eventRow = (eventTitle: string) =>
      main.getByRole('button').filter({ hasText: eventTitle }).filter({ hasText: /Not tied to a job/i });

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /^Calendar$/i);
    await waitForContractorWorkspaceReady(page);
    await main.getByRole('button', { name: selectedDayPattern }).first().click();

    // ── Create ────────────────────────────────────────────────────────────────
    await main.getByRole('button', { name: /^New event$/i }).click();
    await expect(page.getByRole('heading', { name: /^New calendar event$/i })).toBeVisible();
    await expect(page.getByText(/^Not tied to a job$/i).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Event date', exact: true })).toHaveValue(selectedDateValue);

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
    await page.getByRole('combobox', { name: 'Event type', exact: true }).selectOption('inspection_visit');
    await page.getByRole('combobox', { name: 'Event time', exact: true }).selectOption('10:00');
    await page.getByRole('combobox', { name: /^Repeat$/i }).selectOption('monthly');
    await expect(page.getByText(/Monthly with no end date/i)).toBeVisible();
    await page.getByRole('spinbutton', { name: /Duration/i }).fill('45');
    await page.getByRole('textbox', { name: /Notes/i }).fill('E2E standalone calendar event — safe to delete.');

    const insertResponse = page.waitForResponse(calendarEventsRequest('POST'));
    await page.getByRole('button', { name: /^Create event$/i }).click();
    expect((await insertResponse).ok()).toBeTruthy();

    // Appears on the calendar (selected-day / upcoming list).
    await expect(eventRow(title).filter({ hasText: /10:00 AM/i }).first()).toBeVisible({ timeout: 30_000 });

    // ── Open detail from the month grid ───────────────────────────────────────
    const calendarGridChip = main
      .getByRole('button')
      .filter({ hasText: title })
      .filter({ hasText: /10:00 AM/i })
      .filter({ hasNotText: /Not tied to a job/i })
      .first();
    await expect(calendarGridChip).toBeVisible();
    await calendarGridChip.click();
    const eventDialog = page.getByRole('dialog', { name: /^Calendar event$/i });
    await expect(eventDialog).toBeVisible();
    await expect(eventDialog.getByText(/^Not tied to a job$/i).first()).toBeVisible();
    await expect(eventDialog.getByText(/Monthly with no end date/i)).toBeVisible();
    const createJobButton = eventDialog.getByRole('button', { name: /^Create Job from Event$/i });
    await expect(createJobButton).toBeVisible();
    await expect(createJobButton).toBeDisabled();
    await expect(eventDialog.getByText(/Select a customer and save the event before creating a job/i)).toBeVisible();

    // ── Edit ──────────────────────────────────────────────────────────────────
    await eventDialog.getByRole('textbox', { name: 'Title', exact: true }).fill(editedTitle);
    await eventDialog.getByRole('combobox', { name: 'Event time', exact: true }).selectOption('11:30');
    await eventDialog.getByRole('combobox', { name: /^Repeat$/i }).selectOption('weekly');
    await expect(eventDialog.getByText(/Weekly with no end date/i)).toBeVisible();
    const updateResponse = page.waitForResponse(calendarEventsRequest('PATCH'));
    await page.getByRole('button', { name: /^Save changes$/i }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    await expect(eventRow(editedTitle).filter({ hasText: /11:30 AM/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(eventRow(editedTitle).filter({ hasText: /Repeats weekly/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText(title, { exact: true })).toHaveCount(0);

    // ── Delete ──────────────────────────────────────────────────────────────--
    await eventRow(editedTitle).first().click();
    await expect(eventDialog).toBeVisible();
    const deleteResponse = page.waitForResponse(calendarEventsRequest('DELETE'));
    await eventDialog.getByRole('button', { name: /^Delete$/i }).click();
    expect((await deleteResponse).ok()).toBeTruthy();
    await expect(main.getByText(editedTitle, { exact: false })).toHaveCount(0, { timeout: 30_000 });

    await consoleErrors.assertClean(testInfo);
  });
});
