import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureMajorConsoleErrors } from './helpers/console';
import { loginAs, openSidebarTab } from './helpers/auth';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ) - document.documentElement.clientWidth);
  expect(overflow, 'Properties should not overflow horizontally').toBeLessThanOrEqual(2);
}

test.describe('FB-039D homeowner Properties progressive disclosure', () => {
  test('source keeps one workspace state and four explicit ownership sections', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/homeowner/HomeownerPropertiesWorkspace.tsx');
    const storage = sourceFile('src/utils/localStorage.ts');

    expect(app).toContain("type HomeownerPropertySection,");
    expect(app).toContain('activeSection={homeownerPropertySection}');
    expect(app).toContain('access: <>{renderHomeAccessPanel()}{renderSharedHomeShellsPanel()}</>');
    expect(app).toContain('renderHomeMapEntryCard(selectedHome.id');
    expect(app).toContain("setHomeownerPropertySection('settings')");
    expect(storage).toContain("homeownerPropertySection: 'servsync.homeowner.propertySection'");

    expect(workspace).toContain("export type HomeownerPropertySection = 'overview' | 'map' | 'access' | 'settings'");
    expect(workspace).toContain("{ id: 'overview', label: 'Overview'");
    expect(workspace).toContain("{ id: 'map', label: 'Home Map'");
    expect(workspace).toContain("{ id: 'access', label: 'Access'");
    expect(workspace).toContain("{ id: 'settings', label: 'Property Settings'");
    expect(workspace).toContain('properties.length > 1 ?');
    expect(workspace).toContain('data-testid="property-overview-section"');
    expect(workspace).toContain('data-testid="property-map-section"');
    expect(workspace).toContain('data-testid="property-access-section"');
    expect(workspace).toContain('data-testid="property-settings-section"');
    expect(workspace).toContain('Nothing needs attention right now.');
    expect(workspace).not.toContain('future feature');
  });

  test('owner can traverse all four sections without duplicate working surfaces', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await loginAs(page, 'homeowner');
    await openSidebarTab(page, /^Properties$/i);

    await expect(main.getByTestId('property-overview-section')).toBeVisible();
    await expect(main.getByTestId('home-map-entry-card')).toHaveCount(0);
    await expect(main.getByTestId('home-access-panel')).toHaveCount(0);
    await expect(main.getByRole('heading', { name: /^My profile$/i })).toHaveCount(0);

    await main.getByRole('tab', { name: /^Home Map$/i }).click();
    await expect(main.getByTestId('property-map-section')).toBeVisible();
    await expect(main.getByTestId('home-map-entry-card')).toBeVisible();
    await expect(main.getByTestId('home-access-panel')).toHaveCount(0);

    await main.getByRole('tab', { name: /^Access$/i }).click();
    await expect(main.getByTestId('property-access-section')).toBeVisible();
    await expect(main.getByTestId('home-access-panel')).toBeVisible();
    await expect(main.getByTestId('shared-home-shells-panel')).toBeVisible();
    await expect(main.getByTestId('home-map-entry-card')).toHaveCount(0);

    await main.getByRole('tab', { name: /^Property Settings$/i }).click();
    await expect(main.getByTestId('property-settings-section')).toBeVisible();
    await expect(main.getByRole('button', { name: /^Add another property$/i })).toBeVisible();
    await expect(main.getByRole('heading', { name: /^My profile$/i })).toBeVisible();
    await expect(main.getByTestId('property-setup-progress')).not.toHaveAttribute('open', '');
    await expectNoHorizontalOverflow(page);
    await consoleErrors.assertClean(testInfo);
  });

  test('390x844 keeps the four-section hierarchy readable and stable', async ({ page }, testInfo) => {
    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');

    await loginAs(page, 'homeowner');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileHeader = page.locator('div.md\\:hidden').first();
    await mobileHeader.getByRole('button').first().click();
    const drawer = page.locator('div.fixed.inset-0.z-50 aside').first();
    await drawer.getByRole('button', { name: /^Properties$/i }).first().click();

    await expect(main.getByTestId('property-overview-section')).toBeVisible();
    await expect(main.getByRole('tab')).toHaveCount(4);
    await expectNoHorizontalOverflow(page);

    for (const section of ['Home Map', 'Access', 'Property Settings']) {
      await main.getByRole('tab', { name: new RegExp(`^${section}$`, 'i') }).click();
      await expectNoHorizontalOverflow(page);
    }

    await consoleErrors.assertClean(testInfo);
  });
});
