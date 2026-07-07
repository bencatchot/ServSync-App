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

test.describe('Home Map v1 UI', () => {
  test('loads and saves simple room layout boxes without changing reminder/document behavior', () => {
    const app = appSource();
    const dataSource = sourceBetween(app, 'const loadHomeRoomLayouts = useCallback(async () => {', 'const loadHomeAssets = useCallback(async () => {');
    const layoutLogic = sourceBetween(app, 'const updateHomeRoomLayoutLocal =', 'const openHomeAssetForm =');
    const mapSource = sourceBetween(app, 'const renderHomeRoomLayoutForm =', 'const renderHomeAssetForm =');

    expect(dataSource).toContain(".from('home_room_layouts')");
    expect(dataSource).toContain(".is('archived_at', null)");
    expect(dataSource).toContain(".order('sort_order'");
    expect(dataSource).toContain('isMissingHomeMapSchemaError');
    expect(mapSource).toContain('Home Map');
    expect(mapSource).toContain('Add room box');
    expect(mapSource).toContain('Create room box');
    expect(mapSource).toContain('Link existing room');
    expect(mapSource).toContain('Save map layout');
    expect(mapSource).toContain('home-map-canvas');
    expect(mapSource).toContain('home-map-room-box');
    expect(layoutLogic).toContain('updateHomeRoomLayoutLocal');
    expect(mapSource).toContain("mode: 'move'");
    expect(mapSource).toContain("mode: 'resize'");
    expect(mapSource).toContain('setSelectedHomeRoomDetailId(room.id)');
    expect(layoutLogic).toContain("from('home_rooms')");
    expect(layoutLogic).toContain("from('home_room_layouts')");
    expect(mapSource).not.toContain('updateHomeReminderStatus');
    expect(mapSource).not.toContain('downloadDocument');
    expect(mapSource).not.toContain('deleteDocument');
  });

  test('keeps Home Map rough-only and excludes CAD, floor-plan, storage, key locations, and contractor access', () => {
    const app = appSource();
    const formSource = sourceBetween(app, 'const renderHomeRoomLayoutForm =', 'const renderHomeMapSection =');
    const mapSource = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const builderSource = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');
    const contractorSource = sourceBetween(
      app,
      'function ContractorDashboard({ profile, onSignOut }',
      'function PlatformAdminDashboard({ onSignOut }',
    );

    expect(mapSource).toContain('Dimensions are rough organizer data, not CAD or floor-plan measurements.');
    expect(builderSource).toContain('Rough organizer');
    expect(formSource).toContain('Longer spaces, such as hallways, create longer room boxes.');
    expect(builderSource).toContain('Drag to move. Use the corner handle to resize.');
    expect(mapSource).not.toContain('supabase.storage');
    expect(mapSource).not.toContain(".storage.from(");
    expect(mapSource).not.toContain('storage_path');
    expect(mapSource).not.toContain('key_locations');
    expect(mapSource).not.toContain('access instructions');
    expect(contractorSource).not.toContain('home_room_layouts');
    expect(contractorSource).not.toContain('renderHomeMapSection');
    expect(contractorSource).not.toContain('home-map-room-box');
    expect(contractorSource).not.toContain('home_assets');
  });

  test('shared shell map is compact read-only and does not show private document/reminder counts', () => {
    const app = appSource();
    const sharedSource = sourceBetween(
      app,
      '<Card title="Homes shared with me" icon={<Home size={18} />}>',
      '<Card title="Home Access" icon={<Users size={18} />}>',
    );
    const mapSource = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');

    expect(sharedSource).toContain('renderHomeMapSection');
    expect(mapSource).toContain('shared-home-map-section');
    expect(sharedSource).toContain('canShowPrivateCounts: false');
    expect(mapSource).toContain('canShowPrivateCounts ? homeReminders');
    expect(mapSource).toContain('canShowPrivateCounts ? homeDocuments');
    expect(sharedSource).not.toContain('downloadDocument');
    expect(sharedSource).not.toContain('homeDocuments.filter');
  });
});
