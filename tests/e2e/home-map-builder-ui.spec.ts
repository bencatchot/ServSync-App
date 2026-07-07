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
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(entry).toContain('data-testid="home-map-entry-card"');
    expect(entry).toContain('data-testid="home-map-entry-open"');
    expect(entry).toContain('setHomeMapBuilderHomeId(homeId)');
    expect(properties).toContain('renderHomeMapBuilderView(selectedHome.id');
    expect(properties).toContain('renderHomeMapEntryCard(selectedHome.id');
    expect(properties).not.toContain('renderHomeMapSystemsSection(selectedHome.id');
    expect(builder).toContain('data-testid="home-map-builder-workspace"');
    expect(builder).toContain('fixed inset-0');
    expect(builder).not.toContain('<Card title="Home Map Builder"');
  });

  test('top header is minimal and builder actions live in the side toolbar', () => {
    const app = appSource();
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');
    const header = sourceBetween(builder, 'data-testid="home-map-builder-header"', 'data-testid="home-map-builder-shell"');
    const toolbar = sourceBetween(builder, 'data-testid="home-map-builder-side-toolbar"', '<section className="relative flex min-h-0 flex-col');

    expect(header).toContain('Home Map Builder');
    expect(header).toContain('{label}');
    expect(header).toContain('data-testid="home-map-save-status"');
    expect(header).not.toContain('data-testid="home-map-builder-add-room"');
    expect(header).not.toContain('data-testid="home-map-builder-add-hallway"');
    expect(header).not.toContain('data-testid="home-map-zoom-in"');
    expect(header).not.toContain('Done');
    expect(toolbar).toContain('data-testid="home-map-builder-add-room"');
    expect(toolbar).toContain('data-testid="home-map-builder-add-hallway"');
    expect(toolbar).toContain('data-testid="home-map-save-now"');
    expect(toolbar).toContain('data-testid="home-map-zoom-out"');
    expect(toolbar).toContain('data-testid="home-map-fit-view"');
    expect(toolbar).toContain('data-testid="home-map-zoom-in"');
    expect(toolbar).toContain('data-testid="home-map-builder-toggle-rooms"');
    expect(toolbar).toContain('closeHomeMapBuilder(homeId)');
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
    expect(builder).toContain('data-testid="home-map-builder-room-list-panel"');
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

    expect(builder).toContain('data-testid="home-map-room-detail-drawer"');
    expect(builder).toContain('lg:justify-end');
    expect(builder).toContain('max-h-[88vh]');
    expect(builder).toContain('Close');
    expect(builder).toContain('setHomeMapRoomsPanelOpen(current => !current)');
    expect(builder).toContain('Collapse');
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

  test('room boxes stay simple and keep linked-record clutter in the detail drawer', () => {
    const app = appSource();
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(map).toContain('data-testid="home-map-room-box"');
    expect(map).toContain('{room.name}');
    expect(map).toContain('measurements');
    expect(map).toContain('data-testid="home-map-resize-handle"');
    expect(map).not.toContain('reminderCount');
    expect(map).not.toContain('documentCount');
    expect(map).not.toContain('assetCount');
    expect(map).not.toContain('{reminderCount} rem');
    expect(map).not.toContain('{documentCount} docs');
    expect(map).not.toContain('{assetCount} assets');
    expect(map).not.toContain('openHomeRoomLayoutForm(homeId, layout)');
    expect(builder).toContain('renderHomeRoomDetailPanel(selectedRoom, true, true)');
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
    expect(builder).toContain('data-testid="home-map-builder-workspace"');
    expect(builder).toContain('flex flex-col bg-slate-950');
    expect(builder).toContain('data-testid="home-map-builder-shell"');
    expect(builder).toContain('grid-cols-[104px_minmax(0,1fr)]');
    expect(builder).toContain('data-testid="home-map-builder-canvas"');
    expect(builder).toContain('Canvas-first workspace');
    expect(builder).not.toContain('xl:grid-cols-[minmax(0,1fr)_390px]');
    expect(map).toContain('data-testid="home-map-canvas-scroll"');
    expect(map).toContain('h-[62vh] min-h-[420px] overflow-auto');
    expect(map).toContain('xl:h-[calc(100vh-190px)]');
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
