import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const cleanupSource = () => sourceFile('src/textCleanup.ts');

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

function expectedRoughHomeMapGridSize(length: number | null, width: number | null, unit: 'ft' | 'm' = 'ft') {
  if (!length || !width) return { layoutWidth: 4, layoutHeight: 3 };
  const roughGridUnit = unit === 'm' ? 1.1 : 3.5;
  const clampSpan = (span: number, max: number) => Math.min(max, Math.max(1, Math.round(span)));
  return {
    layoutWidth: clampSpan(length / roughGridUnit, 12),
    layoutHeight: clampSpan(width / roughGridUnit, 8),
  };
}

test.describe('Home Map & Systems UX consolidation', () => {
  test('Properties uses one primary Home Map & Systems surface with map first', () => {
    const app = appSource();
    const properties = sourceBetween(
      app,
      'data-testid="home-setup-guide"',
      '{renderSharedHomeShellsPanel()}',
    );
    const unified = sourceBetween(app, 'const renderHomeMapSystemsSection =', 'const renderSharedHomeShellsPanel =');

    expect(properties).toContain('<Card title="Home Map & Systems"');
    expect(properties).not.toContain('<Card title="Rooms"');
    expect(properties).not.toContain('<Card title="Home Map"');
    expect(properties).not.toContain('<Card title="Assets & Systems"');
    expect(unified).toContain('data-testid="home-map-systems-section"');
    expect(unified).toContain('data-testid="home-map-systems-map"');
    expect(unified.indexOf('data-testid="home-map-systems-map"')).toBeLessThan(unified.indexOf('data-testid="home-map-systems-room-detail"'));
    expect(unified.indexOf('data-testid="home-map-systems-map"')).toBeLessThan(unified.indexOf('data-testid="home-map-systems-rooms-list"'));
    expect(unified).toContain('Map rooms and hallways, organize systems, and keep related documents and reminders together.');
    expect(unified).toContain('Rooms are the organizing backbone for this home.');
  });

  test('map room form exposes rough dimensions instead of implementation coordinates', () => {
    const app = appSource();
    const form = sourceBetween(app, 'const renderHomeRoomLayoutForm =', 'const renderHomeMapSection =');
    const saveLogic = sourceBetween(app, 'const saveHomeRoomLayoutDraft = async () => {', 'const saveHomeMapLayout = async');

    expect(form).toContain('Room dimensions');
    expect(form).toContain('Length');
    expect(form).toContain('Width');
    expect(form).toContain('Enter rough dimensions like 10 x 14.');
    expect(form).toContain('Longer spaces, such as hallways, create longer room boxes.');
    expect(form).toContain('measured_width');
    expect(form).toContain('measured_depth');
    expect(form).not.toContain('<Field label="X">');
    expect(form).not.toContain('<Field label="Y">');
    expect(form).not.toContain('layout_width');
    expect(form).not.toContain('layout_height');
    expect(form).not.toContain('ceiling');
    expect(saveLogic).toContain('roughHomeMapGridSize');
    expect(saveLogic).toContain('dimensionsChanged');
    expect(saveLogic).toContain('shouldApplyRoughDimensions');
    expect(saveLogic).toContain('const layoutX = parseHomeMapNumber');
    expect(saveLogic).toContain('const layoutY = parseHomeMapNumber');
    expect(saveLogic).toContain('layout_width: Math.min(HOME_MAP_GRID_COLUMNS - layoutX');
    expect(saveLogic).toContain('measured_width: measuredWidth');
    expect(saveLogic).toContain('measured_depth: measuredDepth');
  });

  test('rough room dimensions preserve useful room and hallway proportions', () => {
    const app = appSource();
    const sizing = sourceBetween(app, 'const roughHomeMapGridSize =', 'const loadHomeRooms =');

    expect(sizing).toContain("const roughGridUnit = unit === 'm' ? 1.1 : 3.5");
    expect(sizing).toContain('layoutWidth: clampSpan(measuredWidth / roughGridUnit, HOME_MAP_GRID_COLUMNS)');
    expect(sizing).toContain('layoutHeight: clampSpan(measuredDepth / roughGridUnit, HOME_MAP_GRID_ROWS)');

    const square = expectedRoughHomeMapGridSize(10, 10);
    const wide = expectedRoughHomeMapGridSize(10, 5);
    const tall = expectedRoughHomeMapGridSize(5, 10);
    const largerWide = expectedRoughHomeMapGridSize(14, 10);
    const hallway = expectedRoughHomeMapGridSize(4, 18);

    expect(square.layoutWidth).toBe(square.layoutHeight);
    expect(wide.layoutWidth).toBeGreaterThan(wide.layoutHeight);
    expect(tall.layoutHeight).toBeGreaterThan(tall.layoutWidth);
    expect(largerWide.layoutWidth).toBeGreaterThan(square.layoutWidth);
    expect(largerWide.layoutHeight).toBeGreaterThanOrEqual(square.layoutHeight);
    expect(hallway.layoutHeight).toBeGreaterThan(hallway.layoutWidth);
    expect(hallway.layoutWidth).toBeGreaterThanOrEqual(1);
  });

  test('hallways are supported as normal room spaces without a separate data model', () => {
    const app = appSource();
    const form = sourceBetween(app, 'const renderHomeRoomLayoutForm =', 'const renderHomeMapSection =');
    const roomForm = sourceBetween(app, 'const renderHomeRoomForm =', 'const renderHomeRoomsList =');
    const docs = sourceFile('docs/servsync-master-plan/ServSync_Feature_Backlog.md');

    expect(form).toContain('Laundry room or hallway');
    expect(form).toContain('Utility, hallway, bedroom, exterior...');
    expect(roomForm).toContain('Kitchen, hallway, bedroom, exterior...');
    expect(form).toContain('Longer spaces, such as hallways, create longer room boxes.');
    expect(docs).toContain('Hallways are treated as normal room/map spaces');
    expect(app).not.toContain('home_hallways');
    expect(app).not.toContain('hallway_layouts');
  });

  test('map boxes have selected state, direct drag, visible resize handle, and fallback controls', () => {
    const app = appSource();
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const detail = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');

    expect(map).toContain('const isSelected = selectedHomeRoomDetailId === room.id');
    expect(map).toContain('cursor-grab');
    expect(map).toContain('active:cursor-grabbing');
    expect(map).toContain('Drag to move');
    expect(map).toContain('drag or resize each box until the map feels useful');
    expect(map).toContain('data-testid="home-map-resize-handle"');
    expect(map).toContain('<Maximize2 size={14} />');
    expect(map).toContain("mode: 'move'");
    expect(map).toContain("mode: 'resize'");
    expect(detail).toContain('data-testid="home-map-room-controls"');
    expect(detail).toContain('Move up');
    expect(detail).toContain('Move right');
    expect(detail).toContain('Wider');
    expect(detail).toContain('Shallower');
  });

  test('selected room detail is the central room management panel without changing document or reminder actions', () => {
    const app = appSource();
    const detail = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');
    const unified = sourceBetween(app, 'const renderHomeMapSystemsSection =', 'const renderSharedHomeShellsPanel =');

    expect(unified).toContain('renderHomeRoomDetailPanel(selectedRoom, true, true)');
    expect(detail).toContain('Linked reminders');
    expect(detail).toContain('Linked documents');
    expect(detail).toContain('Linked assets');
    expect(detail).toContain('openHomeAssetForm(room.home_id, undefined, room.id)');
    expect(detail).toContain('Rough dimensions:');
    expect(detail).not.toContain('updateHomeReminderStatus');
    expect(detail).not.toContain('downloadDocument');
    expect(detail).not.toContain('deleteDocument');
  });

  test('advanced floor plan objects and uploads remain future-scoped', () => {
    const app = appSource();
    const docs = `${sourceFile('docs/servsync-master-plan/ServSync_Feature_Backlog.md')}\n${sourceFile('docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md')}`;
    const unified = sourceBetween(app, 'const renderHomeMapSystemsSection =', 'const renderSharedHomeShellsPanel =');

    expect(unified).toContain('Future floor-plan uploads and map objects like doors, windows, stairs, counters, and utility markers need separate design, storage, and permission review.');
    expect(docs).toContain('floor-plan uploads and basic map objects such as doors, windows, stairs, counters, islands, cabinets, closets, appliance markers, and utility markers');
    expect(app).not.toContain('floor_plan_upload');
    expect(app).not.toContain('home_map_objects');
    expect(app).not.toContain('doorway_marker');
    expect(app).not.toContain('window_marker');
    expect(app).not.toContain('stairs_marker');
  });

  test('label cleanup prevents trailing periods on user-entered names while prose cleanup remains', () => {
    const app = appSource();
    const cleanup = cleanupSource();
    const roomSave = sourceBetween(app, 'const saveHomeRoom = async () => {', 'const archiveHomeRoom = async');
    const layoutSave = sourceBetween(app, 'const saveHomeRoomLayoutDraft = async () => {', 'const saveHomeMapLayout = async');
    const assetSave = sourceBetween(app, 'const saveHomeAsset = async () => {', 'const archiveHomeAsset = async');
    const reminderSave = sourceBetween(app, 'const saveHomeReminder = async () => {', 'const updateHomeReminderStatus = async');

    expect(cleanup).toContain('export function cleanHumanLabelText');
    expect(cleanup).toContain('restoreHumanTextTradeTerms(value)');
    expect(cleanup).not.toContain('cleanHumanLabelText(value: string) {\n  return punctuateHumanText');
    expect(roomSave).toContain('cleanHumanLabelText(homeRoomDraft.name)');
    expect(layoutSave).toContain('cleanHumanLabelText(homeRoomLayoutDraft.new_room_name)');
    expect(assetSave).toContain('cleanHumanLabelText(homeAssetDraft.name)');
    expect(assetSave).toContain('cleanHumanLabelText(homeAssetDraft.asset_category)');
    expect(reminderSave).toContain('cleanHumanLabelText(homeReminderDraft.title)');
    expect(roomSave).toContain('cleanRoomNoteText(homeRoomDraft.notes)');
    expect(assetSave).toContain('cleanHomeMapNoteText(homeAssetDraft.notes)');
  });

  test('scope remains frontend tests and docs only', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/textCleanup.ts',
      'tests/e2e/home-map-systems-ux.spec.ts',
      'tests/e2e/home-map-ui.spec.ts',
      'tests/e2e/home-assets-ui.spec.ts',
      'tests/e2e/home-room-detail-ui.spec.ts',
      'tests/e2e/home-document-room-ui.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'tests/e2e/home-rooms-ui.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this consolidation').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for Home Map & Systems UX consolidation`).toBe(true);
    }
    expect(files.some(file => file.endsWith('.sql'))).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file))).toBe(false);
  });
});
