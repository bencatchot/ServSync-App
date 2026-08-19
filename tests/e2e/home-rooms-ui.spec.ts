import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function changedFiles() {
  const branchDiff = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const workingTreeDiff = execFileSync('git', ['diff', '--name-only'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return Array.from(new Set(`${branchDiff}\n${workingTreeDiff}\n${untracked}`
    .split('\n')
    .map(file => file.trim())
    .filter(Boolean)));
}

test.describe('homeowner rooms UI', () => {
  test('owner room management uses home_rooms with soft archive only', () => {
    const source = appSource();
    const roomDataSource = sourceBetween(
      source,
      'const knownHomeRoomIds = Array.from(new Set([',
      'useEffect(() => {\n    if (!selectedHomeId) return;',
    );
    const roomUiSource = sourceBetween(
      source,
      'const renderHomeRoomForm =',
      'const renderSharedHomeShellsPanel =',
    );

    expect(roomDataSource).toContain(".from('home_rooms')");
    expect(roomDataSource).toContain(".is('archived_at', null)");
    expect(roomDataSource).toContain(".order('sort_order'");
    expect(roomDataSource).toContain(".order('name'");
    expect(roomDataSource).toContain('created_by: profile.id');
    expect(roomDataSource).toContain('name,');
    expect(roomDataSource).toContain('room_type: cleanRoomOptionalText');
    expect(roomDataSource).toContain('floor_label: cleanRoomOptionalText');
    expect(roomDataSource).toContain('area_label: cleanRoomOptionalText');
    expect(roomDataSource).toContain('notes: cleanRoomNoteText');
    expect(roomDataSource).toContain('archived_at: new Date().toISOString()');
    expect(roomDataSource).toContain('Room name is required.');
    expect(roomDataSource).not.toContain('.delete()');
    expect(roomDataSource).not.toContain('home_id: homeRoomDraft.home_id, created_by');

    expect(roomUiSource).toContain('Rooms');
    expect(roomUiSource).toContain('Add room');
    expect(roomUiSource).toContain('Edit room');
    expect(roomUiSource).toContain('Archive');
    expect(roomUiSource).toContain('Do not store lockbox codes, gate codes, alarm details, hidden-key details, or sensitive access instructions in room notes.');
  });

  test('shared-home rooms keep admin manage and member/viewer read-only boundaries', () => {
    const source = appSource();
    const roomUiSource = sourceBetween(
      source,
      'const renderHomeRoomForm =',
      'const renderSharedHomeShellsPanel =',
    );
    const sharedHomesSource = sourceBetween(
      source,
      '<Card title="Homes shared with me" icon={<Home size={18} />}>',
      '<Card title="Home Access" icon={<Users size={18} />}>',
    );

    expect(sharedHomesSource).toContain("const canManageSharedRooms = shell.role === 'admin'");
    expect(sharedHomesSource).toContain('Members and viewers are read-only; shared admins can manage rooms.');
    expect(roomUiSource).toContain('shared-home-rooms-section');
    expect(roomUiSource).toContain('Read-only non-sensitive room basics shared with this home.');
    expect(sharedHomesSource).toContain('showNotes: canManageSharedRooms');
    expect(sharedHomesSource).toContain('canManage: canManageSharedRooms');
    expect(sharedHomesSource).toContain('Limited location shared');
    expect(sharedHomesSource).toContain('This shared home cannot be selected for owner dashboard records yet.');
  });

  test('Property Settings keeps optional setup progress collapsed and concise', () => {
    const source = appSource();
    const workspace = sourceFile('src/features/homeowner/HomeownerPropertiesWorkspace.tsx');
    const homeSetupDataSource = sourceBetween(
      source,
      'const homeSetupGuideItems = [',
      'const showInitialHomeSetupPrompt',
    );

    expect(homeSetupDataSource).toContain('Add rooms');
    expect(homeSetupDataSource).toContain('selectedHomeRooms.length > 0');
    expect(homeSetupDataSource).toContain('Add assets & systems');
    expect(homeSetupDataSource).toContain('Start a Home Map');
    expect(workspace).toContain('data-testid="property-setup-progress"');
    expect(workspace).toContain('<details className=');
    expect(workspace).toContain('optional details added');
    expect(workspace).not.toContain('future tools');
  });

  test('room UI still avoids contractor, key-location, storage, and workflow scope', () => {
    const source = appSource();
    const contractorSource = sourceBetween(
      source,
      'function ContractorDashboard(',
      'function PlatformAdminDashboard(',
    );
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/features/homeowner/HomeownerPropertiesWorkspace.tsx',
      'src/textCleanup.ts',
      'src/utils/localStorage.ts',
      'scripts/validation/check-app-monolith-budget.mjs',
      'tests/e2e/home-access-ui.spec.ts',
      'tests/e2e/home-map-builder-ui.spec.ts',
      'tests/e2e/home-map-systems-ux.spec.ts',
      'src/types.ts',
      'servsync-home-map-layout-foundation.sql',
      'tests/e2e/home-assets-foundation.spec.ts',
      'tests/e2e/home-map-layout-foundation.spec.ts',
      'tests/e2e/home-map-ui.spec.ts',
      'tests/e2e/home-assets-ui.spec.ts',
      'tests/e2e/home-document-room-ui.spec.ts',
      'tests/e2e/home-room-detail-ui.spec.ts',
      'tests/e2e/home-rooms-ui.spec.ts',
      'tests/e2e/homeowner-properties-progressive-disclosure.spec.ts',
      'tests/e2e/mobile-smoke.spec.ts',
      'tests/e2e/production-auth-readonly-smoke.spec.ts',
      'tests/e2e/recurring-authenticated-role-smoke.spec.ts',
      'tests/e2e/shared-home-reminders-ui.spec.ts',
      'tests/e2e/shared-home-shell.spec.ts',
      'tests/e2e/home-setup-clarity.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'tests/e2e/security-catalog.spec.ts',
      'docs/qa/ServSync_Homeowner_Properties_Progressive_Disclosure_Acceptance_2026-08-19.md',
      'docs/servsync-master-plan/ServSync_Product_Roadmap.md',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(contractorSource).not.toContain('home_rooms');
    expect(contractorSource).not.toContain('home_assets');
    expect(contractorSource).not.toContain('home_room_layouts');
    expect(source).not.toContain('home_systems');
    expect(source).not.toContain('key_locations');
    expect(source).not.toContain('floor_plan');

    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved homeowner rooms UI file`).toBe(true);
    }
    expect(files.some(file => file.endsWith('.sql') && file !== 'servsync-home-map-layout-foundation.sql')).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
  });

  test('owner can add, edit, and archive a room when sandbox credentials are available', async ({ page }) => {
    const email = process.env.TEST_HOMEOWNER_EMAIL?.trim();
    const password = process.env.TEST_HOMEOWNER_PASSWORD?.trim();
    test.skip(!email || !password, 'Sandbox homeowner credentials are not loaded in this environment.');

    const unique = `Codex Room ${Date.now()}`;
    const edited = `${unique} Edited`;

    await page.goto('/#/homeowner');
    const authMain = page.getByRole('main');
    await authMain.getByLabel(/^Email$/i).fill(email!);
    await authMain.getByLabel(/^Password$/i).fill(password!);
    await authMain.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(page.getByRole('heading', { name: /^Sign in$/i })).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Properties$/i }).click();
    await page.getByRole('main').getByRole('tab', { name: /^Home Map$/i }).click();
    await page.getByTestId('home-map-entry-open').click();

    const roomsSection = page.getByTestId('home-rooms-section').first();
    await expect(roomsSection).toBeVisible();
    await roomsSection.getByRole('button', { name: /^Add room$/i }).click();
    await roomsSection.getByRole('button', { name: /^Save room$/i }).click();
    await expect(page.getByText('Room name is required.')).toBeVisible();

    await roomsSection.getByLabel(/^Room name$/i).fill(unique);
    await roomsSection.getByLabel(/^Room type$/i).fill('Office');
    await roomsSection.getByLabel(/^Floor$/i).fill('Main');
    await roomsSection.getByLabel(/^Area$/i).fill('West');
    await roomsSection.getByLabel(/^Notes$/i).fill('General room note for test coverage.');
    await roomsSection.getByRole('button', { name: /^Save room$/i }).click();
    await expect(roomsSection.getByText(unique)).toBeVisible({ timeout: 15_000 });
    await expect(roomsSection.getByText(/Type: Office/)).toBeVisible();

    await roomsSection.getByRole('button', { name: /^Edit$/i }).first().click();
    await roomsSection.getByLabel(/^Room name$/i).fill(edited);
    await roomsSection.getByRole('button', { name: /^Save room$/i }).click();
    await expect(roomsSection.getByText(edited)).toBeVisible({ timeout: 15_000 });

    await roomsSection.getByRole('button', { name: /^Archive$/i }).first().click();
    await expect(roomsSection.getByText(edited)).toBeHidden({ timeout: 15_000 });
  });
});
