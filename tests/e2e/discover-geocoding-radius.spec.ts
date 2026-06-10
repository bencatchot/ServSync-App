import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { timestampForRecord } from './helpers/customers';
import { requireApprovedSandboxForMutation } from './helpers/guards';

async function visibleWithin(locator: Locator, timeout = 1_500) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForLocationStatus(main: Locator) {
  const geocoded = main.getByText(/Showing contractors whose listed service areas overlap this search area\./i);
  const fallback = main.getByText(/We could not confirm that location\. Showing text matches instead\./i);

  await expect(geocoded.or(fallback)).toBeVisible({ timeout: 45_000 });
  return visibleWithin(geocoded) ? 'geocoded' : 'fallback';
}

async function addFairhopeServiceArea(page: Page, timestamp: string) {
  const main = page.getByRole('main');

  await openSidebarTab(page, /Business Profile/i);
  await expect(main.getByText(/^Service areas$/i)).toBeVisible();

  await main.getByRole('button', { name: /Add service area/i }).click();

  const areaLabel = `E2E Radius ${timestamp}`;
  const labelInput = main.getByPlaceholder(/^Eastern Shore$/i).last();
  await expect(labelInput).toBeVisible();
  await labelInput.fill(areaLabel);

  const serviceAreaCard = labelInput.locator('xpath=ancestor::div[.//input[@placeholder="Fairhope, AL or 36532"] and .//select][1]');
  const locationInput = serviceAreaCard.getByPlaceholder(/^Fairhope, AL or 36532$/i);
  const radiusSelect = serviceAreaCard.locator('select').first();

  await locationInput.fill('Fairhope, AL');
  await radiusSelect.selectOption('50');

  await expect(labelInput).toHaveValue(areaLabel);
  await expect(locationInput).toHaveValue('Fairhope, AL');
  await expect(radiusSelect).toHaveValue('50');

  await main.getByRole('button', { name: /Save business profile/i }).click();

  const confirmed = main.getByText(/Location confirmed/i).last();
  const failed = main.getByText(/Could not confirm this location\. Check the ZIP or city\/state\./i).last();
  await expect(confirmed.or(failed)).toBeVisible({ timeout: 45_000 });

  return visibleWithin(confirmed);
}

async function createContractorDiscoverPost(page: Page, timestamp: string) {
  const main = page.getByRole('main');
  const postTitle = `E2E Radius Discover ${timestamp}`;

  await openSidebarTab(page, /^Discover$/i);
  await expect(main.getByRole('button', { name: /^Create Post$/i })).toBeVisible();

  await main.getByLabel(/^Title$/i).fill(postTitle);
  await main.getByLabel(/^City$/i).fill('Fairhope');
  await main.getByPlaceholder(/Start typing a state/i).fill('AL');
  await main.getByLabel(/^Description$/i).fill('E2E Discover radius post for Playwright geocoding coverage.');

  await expect(main.getByLabel(/^Title$/i)).toHaveValue(postTitle);
  await main.getByRole('button', { name: /^Create Post$/i }).click();

  const postError = main.getByText(/Unable to create post|Add a title before posting/i).first();
  await Promise.race([
    main.getByText(/^Post published\.$/i).waitFor({ state: 'visible', timeout: 30_000 }),
    postError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
      throw new Error(`Discover post creation failed: ${(await postError.textContent())?.trim() || 'unknown error'}`);
    }),
  ]);

  await expect(main.getByText(postTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
  return postTitle;
}

async function searchDiscover(page: Page, location: string, radius: string) {
  const main = page.getByRole('main');

  await main.getByPlaceholder(/^ZIP or city$/i).fill(location);
  await main.getByLabel(/^Service area radius$/i).selectOption(radius);
  await main.getByRole('button', { name: /^Search$/i }).click();

  return waitForLocationStatus(main);
}

function postCardByTitle(main: Locator, postTitle: string) {
  return main
    .getByText(postTitle, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class, "overflow-hidden") and contains(@class, "rounded-2xl")][1]');
}

async function saveVisiblePost(main: Locator, postTitle: string) {
  await expect(main.getByText(postTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
  const postCard = postCardByTitle(main, postTitle);
  const saveControl = postCard.getByRole('button', { name: /^(Save Post|Save|Saved|Unsave|Remove saved)$/i });
  await expect(saveControl).toBeVisible();

  if (await visibleWithin(postCard.getByRole('button', { name: /^(Save Post|Save)$/i }))) {
    await saveControl.click();
    await Promise.race([
      main.getByText(/^Post saved\.$/i).waitFor({ state: 'visible', timeout: 30_000 }),
      postCard.getByRole('button', { name: /^(Saved|Unsave|Remove saved)$/i }).waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
  }
}

async function unsaveVisiblePost(main: Locator, postTitle: string) {
  const postCard = postCardByTitle(main, postTitle);
  const unsaveControl = postCard.getByRole('button', { name: /^(Saved|Unsave|Remove saved|Save Post|Save)$/i });
  await expect(unsaveControl).toBeVisible();
  await unsaveControl.click();

  const removedNotice = main.getByText(/Post removed from saved posts/i);
  const unsavedControl = postCard.getByRole('button', { name: /^(Save Post|Save)$/i });
  await Promise.race([
    removedNotice.waitFor({ state: 'visible', timeout: 30_000 }),
    unsavedControl.waitFor({ state: 'visible', timeout: 30_000 }),
    main.getByText(postTitle, { exact: true }).waitFor({ state: 'hidden', timeout: 30_000 }),
  ]);
}

test.describe('Discover geocoding radius coverage', () => {
  test('geocodes contractor service areas and keeps saved posts independent of location search', async ({ browser }, testInfo) => {
    requireApprovedSandboxForMutation();

    const timestamp = timestampForRecord();
    const contractorContext = await browser.newContext();
    const contractorPage = await contractorContext.newPage();
    const contractorErrors = captureMajorConsoleErrors(contractorPage);

    await loginAs(contractorPage, 'contractor');
    const serviceAreaConfirmed = await addFairhopeServiceArea(contractorPage, timestamp);
    const postTitle = await createContractorDiscoverPost(contractorPage, timestamp);
    await contractorErrors.assertClean(testInfo);
    await contractorContext.close();

    const homeownerContext = await browser.newContext();
    const homeownerPage = await homeownerContext.newPage();
    const homeownerErrors = captureMajorConsoleErrors(homeownerPage);
    const main = homeownerPage.getByRole('main');

    await loginAs(homeownerPage, 'homeowner');
    await openSidebarTab(homeownerPage, /^Discover$/i);
    await expect(main.getByText(/^Filter Discover posts$/i)).toBeVisible();

    const daphneStatus = await searchDiscover(homeownerPage, 'Daphne, AL', '10');
    if (serviceAreaConfirmed && daphneStatus === 'geocoded') {
      await expect(main.getByText(postTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    }

    const nearbyZipStatus = await searchDiscover(homeownerPage, '36526', '10');
    if (serviceAreaConfirmed && nearbyZipStatus === 'geocoded') {
      await expect(main.getByText(postTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    }

    const fairhopeStatus = await searchDiscover(homeownerPage, 'Fairhope, AL', '10');
    expect(['geocoded', 'fallback']).toContain(fairhopeStatus);
    await expect(main.getByText(postTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
    await saveVisiblePost(main, postTitle);

    await searchDiscover(homeownerPage, 'Anchorage, AK', '10');
    await main.getByRole('button', { name: /Saved Posts/i }).click();
    await expect(main.getByText(postTitle, { exact: true })).toBeVisible({ timeout: 30_000 });

    await unsaveVisiblePost(main, postTitle);

    await homeownerErrors.assertClean(testInfo);
    await homeownerContext.close();
  });
});
