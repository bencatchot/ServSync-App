import { expect, test } from '@playwright/test';
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

test.describe('Assets & Systems v1 UI', () => {
  test('loads active home_assets and supports owner/admin add edit archive without hard delete', () => {
    const app = appSource();
    const dataSource = sourceBetween(app, 'const loadHomeAssets = useCallback(async () => {', 'useEffect(() => {\n    void loadHomeAssets();');
    const assetLogic = sourceBetween(app, 'const openHomeAssetForm =', 'const signedHomeAssetUrl =');
    const assetSource = sourceBetween(app, 'const renderHomeAssetForm =', 'const renderSharedHomeShellsPanel =');

    expect(dataSource).toContain(".from('home_assets')");
    expect(dataSource).toContain(".is('archived_at', null)");
    expect(dataSource).toContain(".order('asset_category'");
    expect(dataSource).toContain(".order('name'");
    expect(assetSource).toContain('Assets &amp; Systems');
    expect(assetSource).toContain('Add asset');
    expect(assetSource).toContain('Edit asset/system');
    expect(assetSource).toContain('Archive');
    expect(assetLogic).toContain('archived_at: new Date().toISOString()');
    expect(assetLogic).toContain('home_room_id: homeAssetDraft.home_room_id || null');
    expect(assetLogic).toContain('created_by: profile.id');
    expect(assetLogic).not.toContain('.delete()');
  });

  test('uses safe asset fields, optional room links, manager-only notes, and no sensitive access fields', () => {
    const app = appSource();
    const assetSource = sourceBetween(app, 'const renderHomeAssetForm =', 'const renderSharedHomeShellsPanel =');

    expect(assetSource).toContain('Name');
    expect(assetSource).toContain('Asset category');
    expect(assetSource).toContain('Asset type');
    expect(assetSource).toContain('Room optional');
    expect(assetSource).toContain('Manufacturer');
    expect(assetSource).toContain('Model');
    expect(assetSource).toContain('Install date');
    expect(assetSource).toContain('Warranty expires');
    expect(assetSource).toContain('No room');
    expect(assetSource).toContain('showNotes && asset.notes');
    expect(assetSource).toContain('Do not add lockbox, gate, alarm, hidden-key, security-system secret, or sensitive access instructions.');
    expect(assetSource).not.toContain('Serial number');
    expect(assetSource).not.toContain('serial_number');
    expect(assetSource).not.toContain('access_code');
    expect(assetSource).not.toContain('key_locations');
  });

  test('shared shells can show basic read-only assets while contractor code remains untouched', () => {
    const app = appSource();
    const sharedSource = sourceBetween(
      app,
      '<Card title="Homes shared with me" icon={<Home size={18} />}>',
      '<Card title="Home Access" icon={<Users size={18} />}>',
    );
    const assetSource = sourceBetween(app, 'const renderHomeAssetForm =', 'const renderSharedHomeShellsPanel =');
    const contractorSource = sourceBetween(
      app,
      'function ContractorDashboard({ profile, onSignOut }',
      'function PlatformAdminDashboard({ onSignOut }',
    );

    expect(sharedSource).toContain('renderHomeAssetsSection');
    expect(assetSource).toContain('shared-home-assets-section');
    expect(sharedSource).toContain('showNotes: canManageSharedRooms');
    expect(assetSource).toContain('Read-only basic assets and systems shared with this home. Manager notes are hidden.');
    expect(contractorSource).not.toContain('home_assets');
    expect(contractorSource).not.toContain('home_room_layouts');
    expect(contractorSource).not.toContain('Assets & Systems');
  });
});
