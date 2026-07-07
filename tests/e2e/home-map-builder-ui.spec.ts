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

test.describe('Home Map Builder dedicated view', () => {
  test('entry card opens a dedicated builder instead of embedding the full map in Properties', () => {
    const app = appSource();
    const entry = sourceBetween(app, 'const renderHomeMapEntryCard =', 'const renderHomeMapBuilderView =');
    const properties = sourceBetween(app, "homeownerTab === 'home' && selectedHome?.id && homeMapBuilderHomeId", '{renderSharedHomeShellsPanel()}');

    expect(entry).toContain('data-testid="home-map-entry-card"');
    expect(entry).toContain('data-testid="home-map-entry-open"');
    expect(entry).toContain('setHomeMapBuilderHomeId(homeId)');
    expect(properties).toContain('renderHomeMapBuilderView(selectedHome.id');
    expect(properties).toContain('renderHomeMapEntryCard(selectedHome.id');
    expect(properties).not.toContain('renderHomeMapSystemsSection(selectedHome.id');
  });

  test('Add Room creates a room and matching layout with default rough square dimensions', () => {
    const app = appSource();
    const createFlow = sourceBetween(app, "const createHomeMapRoomBox = async (homeId: string, kind: 'room' | 'hallway') => {", 'const openHomeRoomLayoutForm =');
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(builder).toContain('data-testid="home-map-builder-add-room"');
    expect(builder).toContain("createHomeMapRoomBox(homeId, 'room')");
    expect(createFlow).toContain("const measuredWidth = isHallway ? 4 : 10");
    expect(createFlow).toContain("const measuredDepth = isHallway ? 16 : 10");
    expect(createFlow).toContain("const roomName = isHallway ? 'New hallway' : 'New room'");
    expect(createFlow).toContain("const roomType = isHallway ? 'Hallway' : null");
    expect(createFlow).toContain('const flushed = await flushHomeMapPendingSaves(homeId)');
    expect(createFlow).toContain(".from('home_rooms')");
    expect(createFlow).toContain(".from('home_room_layouts')");
    expect(createFlow).toContain('roughHomeMapGridSize(measuredWidth, measuredDepth, \'ft\', 4, 3)');
    expect(createFlow).toContain('setSelectedHomeRoomDetailId(typedRoom.id)');
  });

  test('Add Hallway creates a normal room with long narrow default map dimensions', () => {
    const app = appSource();
    const createFlow = sourceBetween(app, "const createHomeMapRoomBox = async (homeId: string, kind: 'room' | 'hallway') => {", 'const openHomeRoomLayoutForm =');
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(builder).toContain('data-testid="home-map-builder-add-hallway"');
    expect(builder).toContain("createHomeMapRoomBox(homeId, 'hallway')");
    expect(createFlow).toContain("const isHallway = kind === 'hallway'");
    expect(createFlow).toContain('const flushed = await flushHomeMapPendingSaves(homeId)');
    expect(createFlow).toContain("const measuredWidth = isHallway ? 4 : 10");
    expect(createFlow).toContain("const measuredDepth = isHallway ? 16 : 10");
    expect(createFlow).toContain("room_type: roomType");
    expect(createFlow).toContain("measurement_unit: 'ft'");
    expect(app).not.toContain('home_hallways');
    expect(app).not.toContain('hallway_layouts');
  });

  test('unmapped rooms can be added without creating duplicate rooms', () => {
    const app = appSource();
    const addExisting = sourceBetween(app, 'const addExistingRoomToHomeMap = async (homeId: string, room: HomeRoom) => {', "const createHomeMapRoomBox = async");
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(builder).toContain('data-testid="home-map-builder-add-existing"');
    expect(builder).toContain('Rooms not on map');
    expect(builder).toContain('Add {room.name} to map');
    expect(addExisting).toContain(".from('home_room_layouts')");
    expect(addExisting).toContain('const flushed = await flushHomeMapPendingSaves(homeId)');
    expect(addExisting).toContain('home_room_id: room.id');
    expect(addExisting).toContain('setSelectedHomeRoomDetailId(room.id)');
    expect(addExisting).not.toContain(".from('home_rooms')");
  });

  test('selected room panel is responsive room context without document or reminder mutations', () => {
    const app = appSource();
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');
    const detail = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');

    expect(builder).toContain('lg:grid-cols-[minmax(0,1fr)_360px]');
    expect(builder).toContain('data-testid="home-map-builder-selected-panel"');
    expect(builder).toContain('lg:sticky lg:top-4');
    expect(detail).toContain('Room detail');
    expect(detail).toContain('Linked assets');
    expect(detail).toContain('Linked documents');
    expect(detail).toContain('Linked reminders');
    expect(detail).toContain('Manager notes');
    expect(detail).toContain('data-testid="home-map-fine-tune-controls"');
    expect(detail).toContain('Fine tune position');
    expect(detail).toContain('renderHomeAssetForm(room.home_id)');
    expect(detail).not.toContain('downloadDocument');
    expect(detail).not.toContain('deleteDocument');
    expect(detail).not.toContain('updateHomeReminderStatus');
  });

  test('builder autosaves dirty room layouts and flushes before leaving or reloading map data', () => {
    const app = appSource();
    const stateSource = sourceBetween(app, 'const [homeRoomLayoutsByHomeId, setHomeRoomLayoutsByHomeId]', 'const [homeAssetsByHomeId, setHomeAssetsByHomeId]');
    const autosaveSource = sourceBetween(app, 'const markHomeMapLayoutDirty =', 'const openHomeRoomForm =');
    const selectionSource = sourceBetween(app, 'const selectHome = async', 'const openContextualConnectionRequest =');
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(stateSource).toContain('homeMapDirtyLayoutIds');
    expect(stateSource).toContain('homeMapSaveStatus');
    expect(stateSource).toContain('homeMapAutosaveTimerRef');
    expect(stateSource).toContain('homeMapSaveInFlightRef');
    expect(autosaveSource).toContain('next.add(layoutId)');
    expect(autosaveSource).toContain('flushHomeMapPendingSaves');
    expect(autosaveSource).toContain("setHomeMapSaveStatus('dirty')");
    expect(autosaveSource).toContain("setHomeMapSaveStatus('saving')");
    expect(autosaveSource).toContain("setHomeMapSaveStatus('saved')");
    expect(autosaveSource).toContain("setHomeMapSaveStatus('error')");
    expect(autosaveSource).toContain('window.setTimeout');
    expect(autosaveSource).toContain('closeHomeMapBuilder');
    expect(selectionSource).toContain('await flushHomeMapPendingSaves(selectedHomeId || homeMapBuilderHomeId)');
    expect(builder).toContain('data-testid="home-map-save-status"');
    expect(builder).toContain("saveStatusLabel");
    expect(builder).toContain('closeHomeMapBuilder(homeId)');
  });

  test('builder canvas is scrollable and zoomable without adding a map dependency', () => {
    const app = appSource();
    const constants = sourceBetween(app, 'const HOME_MAP_GRID_COLUMNS =', 'const HOME_ASSET_CATEGORIES =');
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(constants).toContain('HOME_MAP_WORKSPACE_WIDTH');
    expect(constants).toContain('HOME_MAP_WORKSPACE_HEIGHT');
    expect(constants).toContain('HOME_MAP_ZOOM_MIN');
    expect(constants).toContain('HOME_MAP_ZOOM_MAX');
    expect(builder).toContain('data-testid="home-map-zoom-out"');
    expect(builder).toContain('data-testid="home-map-fit-view"');
    expect(builder).toContain('data-testid="home-map-zoom-in"');
    expect(map).toContain('data-testid="home-map-canvas-scroll"');
    expect(map).toContain('max-h-[68vh] overflow-auto');
    expect(map).toContain('canvasCellWidth');
    expect(map).toContain('canvasCellHeight');
    expect(map).toContain('layout.layout_x * canvasCellWidth');
    expect(map).toContain('layout.layout_width * canvasCellWidth');
    expect(app).not.toContain('react-rnd');
    expect(app).not.toContain('interactjs');
  });

  test('future floor-plan objects and upload remain documented-only, not live behavior', () => {
    const app = appSource();
    const docs = `${sourceFile('docs/servsync-master-plan/ServSync_Feature_Backlog.md')}\n${sourceFile('docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md')}`;

    expect(docs).toContain('home_map_objects');
    expect(docs).toContain('floor-plan upload');
    expect(app).not.toContain('home_map_objects');
    expect(app).not.toContain('floor_plan_upload');
    expect(app).not.toContain('door_marker');
    expect(app).not.toContain('window_marker');
    expect(app).not.toContain('stairs_marker');
    expect(app).not.toContain('counter_marker');
    expect(app).not.toContain('cabinet_marker');
    expect(app).not.toContain('closet_marker');
    expect(app).not.toContain('appliance_marker');
    expect(app).not.toContain('utility_marker');
  });

  test('scope stays frontend test docs only with no backend storage package or deployment files', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/types.ts',
      'tests/e2e/home-map-builder-ui.spec.ts',
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

    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for the Home Map Builder slice`).toBe(true);
    }
    expect(files.some(file => file.endsWith('.sql'))).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file))).toBe(false);
  });
});
