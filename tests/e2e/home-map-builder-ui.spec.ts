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
    const toolbar = sourceBetween(builder, 'data-testid="home-map-builder-side-toolbar"', '<section className="relative flex min-h-0 flex-1 flex-col');

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
    expect(toolbar).toContain('<span>Add Room</span>');
    expect(toolbar).toContain('<span>Add Hallway</span>');
    expect(toolbar).toContain("<span>{savingHomeRoomLayout ? 'Saving' : 'Save'}</span>");
    expect(toolbar).toContain('<span>Zoom Out</span>');
    expect(toolbar).toContain('Fit View');
    expect(toolbar).toContain('<span>Zoom In</span>');
    expect(toolbar).not.toContain('sr-only');
  });

  test('mobile builder uses full-width canvas with bottom toolbar and sheet surfaces', () => {
    const app = appSource();
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');
    const shell = sourceBetween(builder, 'data-testid="home-map-builder-shell"', 'data-testid="home-map-room-detail-drawer"');
    const toolbar = sourceBetween(builder, 'data-testid="home-map-builder-mobile-toolbar"', 'data-testid="home-map-room-detail-drawer"');

    expect(builder).toContain('flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 p-2 pb-20');
    expect(builder).toContain('lg:grid lg:grid-cols-[144px_minmax(0,1fr)]');
    expect(shell).toContain('data-testid="home-map-builder-side-toolbar"');
    expect(shell).toContain('hidden min-h-0 flex-col');
    expect(shell).toContain('lg:flex');
    expect(shell).toContain('data-testid="home-map-builder-canvas"');
    expect(shell).toContain('flex-1 flex-col');
    expect(shell).toContain('fixed inset-x-0 bottom-0 z-40');
    expect(shell).toContain('max-h-[78vh]');
    expect(shell).toContain('lg:absolute lg:inset-auto');
    expect(builder).toContain('fixed inset-x-0 bottom-0 z-50');
    expect(builder).toContain('lg:hidden');
    expect(toolbar).toContain('overflow-x-auto');
    expect(toolbar).toContain('data-testid="home-map-mobile-add-room"');
    expect(toolbar).toContain("createHomeMapRoomBox(homeId, 'room')");
    expect(toolbar).toContain('data-testid="home-map-mobile-add-hallway"');
    expect(toolbar).toContain("createHomeMapRoomBox(homeId, 'hallway')");
    expect(toolbar).toContain('data-testid="home-map-mobile-save-now"');
    expect(toolbar).toContain('data-testid="home-map-mobile-zoom-out"');
    expect(toolbar).toContain('data-testid="home-map-mobile-fit-view"');
    expect(toolbar).toContain('data-testid="home-map-mobile-zoom-in"');
    expect(toolbar).toContain('data-testid="home-map-mobile-toggle-rooms"');
    expect(toolbar).toContain('data-testid="home-map-mobile-done"');
    expect(builder).toContain('items-end bg-slate-950/40 p-0 lg:items-stretch');
    expect(builder).toContain('rounded-t-3xl');
    expect(builder).toContain('lg:w-[440px]');
  });

  test('Add Room creates a room and matching layout with default rough square dimensions', () => {
    const app = appSource();
    const createFlow = sourceBetween(app, "const createHomeMapRoomBox = async (homeId: string, kind: 'room' | 'hallway') => {", 'const openHomeRoomLayoutForm =');
    const sizingHelper = sourceBetween(app, 'const roughHomeMapGridSize =', 'const loadHomeRooms =');
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
    expect(sizingHelper).toContain('measurementWidthFeet / HOME_MAP_FEET_PER_GRID_UNIT');
    expect(sizingHelper).toContain('measurementDepthFeet / HOME_MAP_FEET_PER_GRID_UNIT');
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
    expect(createFlow).toContain('roughHomeMapGridSize(measuredWidth, measuredDepth, \'ft\', 4, 3)');
    expect(createFlow).toContain("room_type: roomType");
    expect(createFlow).toContain("measurement_unit: 'ft'");
    expect(app).not.toContain('home_hallways');
    expect(app).not.toContain('hallway_layouts');
  });

  test('builder grid is measurement-aware and snaps rooms to rough one-foot increments', () => {
    const app = appSource();
    const constants = sourceBetween(app, 'const HOME_MAP_FEET_PER_GRID_UNIT =', 'const HOME_ASSET_CATEGORIES =');
    const sizingHelper = sourceBetween(app, 'const roughHomeMapGridSize =', 'const loadHomeRooms =');
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const saveLayout = sourceBetween(app, 'const saveHomeRoomLayoutDraft = async () => {', 'const saveHomeMapLayout = async');

    expect(constants).toContain('const HOME_MAP_FEET_PER_GRID_UNIT = 1');
    expect(constants).toContain('const HOME_MAP_PIXELS_PER_FOOT = 28');
    expect(constants).toContain('const HOME_MAP_MAJOR_GRID_EVERY_FEET = 5');
    expect(constants).toContain('const HOME_MAP_GRID_COLUMNS = 60');
    expect(constants).toContain('const HOME_MAP_GRID_ROWS = 40');
    expect(constants).toContain('const HOME_MAP_MIN_ROOM_GRID_UNITS = 1');
    expect(constants).toContain('HOME_MAP_WORKSPACE_WIDTH = HOME_MAP_GRID_COLUMNS * HOME_MAP_PIXELS_PER_FOOT');
    expect(constants).toContain('HOME_MAP_WORKSPACE_HEIGHT = HOME_MAP_GRID_ROWS * HOME_MAP_PIXELS_PER_FOOT');
    expect(sizingHelper).toContain('measurementWidthFeet = unit === \'m\' ? measuredWidth * 3.28084 : measuredWidth');
    expect(sizingHelper).toContain('measurementDepthFeet = unit === \'m\' ? measuredDepth * 3.28084 : measuredDepth');
    expect(sizingHelper).toContain('Math.round(span)');
    expect(sizingHelper).toContain('measurementWidthFeet / HOME_MAP_FEET_PER_GRID_UNIT');
    expect(sizingHelper).toContain('measurementDepthFeet / HOME_MAP_FEET_PER_GRID_UNIT');
    expect(app).toContain('type HomeMapBox = {');
    expect(app).toContain('xFeet: number;');
    expect(app).toContain('widthFeet: number;');
    expect(app).toContain('const homeMapBoxFromLayout = (layout: HomeRoomLayout): HomeMapBox => {');
    expect(app).toContain('const homeMapLayoutFieldsFromBox = (box: HomeMapBox)');
    expect(app).toContain('measured_width: feetBox.widthFeet');
    expect(app).toContain('measured_depth: feetBox.depthFeet');
    expect(app).toContain("measurement_unit: 'ft'");
    expect(app).toContain('const homeMapDimensionLabel = (layout: HomeRoomLayout | null | undefined)');
    expect(saveLayout).toContain('const layoutBox = clampHomeMapBox({');
    expect(saveLayout).toContain('widthFeet,');
    expect(saveLayout).toContain('depthFeet,');
    expect(saveLayout).toContain('...homeMapLayoutFieldsFromBox(layoutBox)');
    expect(map).toContain('Each grid line represents roughly 1 ft. Measurements are approximate.');
    expect(map).toContain('Grid: ~1 ft. Approximate.');
    expect(map).toContain('sm:hidden');
    expect(map).toContain('hidden sm:inline');
    expect(map).toContain('data-testid="home-map-grid-measurement-copy"');
    expect(map).toContain('const canvasPixelsPerFoot = HOME_MAP_PIXELS_PER_FOOT * mapZoom');
    expect(map).toContain('const canvasCellWidth = canvasPixelsPerFoot * HOME_MAP_FEET_PER_GRID_UNIT');
    expect(map).toContain('const canvasCellHeight = canvasPixelsPerFoot * HOME_MAP_FEET_PER_GRID_UNIT');
    expect(map).toContain('const canvasMajorGridSize = canvasPixelsPerFoot * HOME_MAP_MAJOR_GRID_EVERY_FEET');
    expect(map).toContain('HOME_MAP_WORKSPACE_WIDTH * mapZoom');
    expect(map).toContain('HOME_MAP_WORKSPACE_HEIGHT * mapZoom');
    expect(map).toContain('repeating-linear-gradient(to right');
    expect(map).toContain('transparent ${canvasCellWidth}px');
    expect(map).toContain('transparent ${canvasCellHeight}px');
    expect(map).toContain('transparent ${canvasMajorGridSize}px');
    expect(map).toContain('Math.round((event.clientX - homeMapDrag.startX) / canvasCellWidth)');
    expect(map).toContain('Math.round((event.clientY - homeMapDrag.startY) / canvasCellHeight)');
    expect(map).toContain('HOME_MAP_MAJOR_GRID_EVERY_FEET');
    expect(map).toContain('const box = homeMapBoxFromLayout(layout)');
    expect(map).toContain('box.xFeet * canvasCellWidth');
    expect(map).toContain('box.yFeet * canvasCellHeight');
    expect(map).toContain('box.widthFeet * canvasCellWidth');
    expect(map).toContain('box.depthFeet * canvasCellHeight');
    expect(map).toContain('updateHomeRoomLayoutFeetLocal(layout, { xFeet: nextX, yFeet: nextY })');
    expect(map).toContain('updateHomeRoomLayoutFeetLocal(layout, { widthFeet: nextWidth, depthFeet: nextHeight })');
  });

  test('mobile room tiles suppress text selection while measured footprints stay exact', () => {
    const app = appSource();
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');

    expect(map).toContain('data-testid="home-map-room-box"');
    expect(map).toContain('select-none');
    expect(map).toContain('[touch-action:none]');
    expect(map).toContain('[-webkit-touch-callout:none]');
    expect(map).toContain('[-webkit-user-select:none]');
    expect(map).toContain('onContextMenu={event => event.preventDefault()}');
    expect(map).toContain('onDragStart={event => event.preventDefault()}');
    expect(map).toContain('event.preventDefault();');
    expect(map).toContain('event.currentTarget.setPointerCapture(event.pointerId)');
    expect(map).toContain('event.currentTarget.releasePointerCapture(event.pointerId)');
    expect(map).toContain('const endPointerInteraction = (event: PointerEvent<HTMLElement>) => {');
    expect(map).toContain('width: `${box.widthFeet * canvasCellWidth}px`');
    expect(map).toContain('height: `${box.depthFeet * canvasCellHeight}px`');
    expect(map).not.toContain('minWidth: builderMode');
    expect(map).not.toContain('minHeight: builderMode');
    expect(map).toContain('data-testid="home-map-room-touch-target"');
    expect(map).toContain('absolute -inset-2 rounded-xl');
    expect(map).toContain('pointer-events-none absolute left-1 top-1');
    expect(map).toContain('absolute left-0 top-full z-20 mt-1');
    expect(map).toContain('data-testid="home-map-resize-handle"');
    expect(map).toContain('absolute -bottom-3 -right-3 z-20 inline-flex h-9 w-9');
  });

  test('room labels adapt to small true-size footprints without resizing the measured box', () => {
    const app = appSource();
    const helper = sourceBetween(app, 'const homeMapRoomLabelModeForBox =', 'const loadHomeRooms =');
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');

    expect(app).toContain("type HomeMapRoomLabelMode = 'full' | 'compact' | 'minimal' | 'external';");
    expect(helper).toContain('const pixelWidth = box.widthFeet * canvasCellWidth');
    expect(helper).toContain('const pixelHeight = box.depthFeet * canvasCellHeight');
    expect(helper).toContain('pixelWidth >= 150 && pixelHeight >= 88');
    expect(helper).toContain('pixelWidth >= 96 && pixelHeight >= 56');
    expect(helper).toContain("return 'external'");
    expect(helper).toContain("return 'minimal'");
    expect(map).toContain('const labelMode = homeMapRoomLabelModeForBox(box, canvasCellWidth, canvasCellHeight)');
    expect(map).toContain('data-testid="home-map-room-label"');
    expect(map).toContain('data-label-mode={labelMode}');
    expect(map).toContain("labelMode === 'full'");
    expect(map).toContain("labelMode === 'compact'");
    expect(map).toContain("labelMode === 'minimal'");
    expect(map).toContain("labelMode === 'external'");
    expect(map).toContain('const showExternalCallout = showExternalLabel && isSelected');
    expect(map).toContain('data-testid="home-map-room-floating-label"');
    expect(map).toContain('max-w-[calc(100%-0.5rem)]');
    expect(map).toContain('overflow-hidden');
    expect(map).toContain('truncate');
    expect(map).toContain('const roomMetadata = [room.room_type, layout.floor_label || room.floor_label].filter(Boolean).join');
    expect(map).toContain("{roomMetadata || 'Room box'}");
    expect(map).toContain('width: `${box.widthFeet * canvasCellWidth}px`');
    expect(map).toContain('height: `${box.depthFeet * canvasCellHeight}px`');
    expect(map).not.toContain('minWidth: builderMode');
    expect(map).not.toContain('minHeight: builderMode');
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

  test('room selection is explicit and Edit opens the room details drawer', () => {
    const app = appSource();
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const helper = sourceBetween(app, 'const openHomeMapRoomEditor =', 'const saveHomeRoomLayoutDraft =');
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(map).toContain('data-testid="home-map-room-box"');
    expect(map).toContain('role="button"');
    expect(map).toContain('tabIndex={0}');
    expect(map).toContain('setSelectedHomeRoomDetailId(room.id);');
    expect(map).not.toContain('if (builderMode) setHomeMapDetailPanelOpen(true)');
    expect(map).toContain("mode: 'move'");
    expect(map).toContain("mode: 'resize'");
    expect(map).toContain('data-testid="home-map-room-edit"');
    expect(map).toContain('openHomeMapRoomEditor(room, layout)');
    expect(helper).toContain('openHomeRoomForm(room.home_id, room)');
    expect(helper).toContain('openHomeRoomLayoutForm(room.home_id, layout)');
    expect(helper).toContain('setHomeMapDetailPanelOpen(true)');
    expect(builder).toContain('data-testid="home-map-room-detail-drawer"');
  });

  test('selected room panel is responsive editable room context without document or reminder mutations', () => {
    const app = appSource();
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');
    const detail = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');

    expect(builder).toContain('data-testid="home-map-room-detail-drawer"');
    expect(builder).toContain('lg:justify-end');
    expect(builder).toContain('max-h-[88vh]');
    expect(builder).toContain('Close');
    expect(builder).toContain('renderHomeRoomDetailPanel(selectedRoom, true, true)');
    expect(builder).toContain('setHomeMapRoomsPanelOpen(current => !current)');
    expect(builder).toContain('Collapse');
    expect(detail).toContain('Room detail');
    expect(detail).toContain('data-testid="home-map-room-basics-editor"');
    expect(detail).toContain('Edit room basics');
    expect(detail).toContain('Edit rough dimensions');
    expect(detail).toContain('renderHomeRoomForm(room.home_id)');
    expect(detail).toContain('renderHomeRoomLayoutForm(room.home_id)');
    expect(detail).toContain('Room name, room type, and floor stay at the top');
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
    expect(map).toContain('homeMapDimensionLabel(layout)');
    expect(map).toContain('data-testid="home-map-room-edit"');
    expect(map).toContain('Edit');
    expect(map).toContain('data-testid="home-map-resize-handle"');
    expect(map).not.toContain('reminderCount');
    expect(map).not.toContain('documentCount');
    expect(map).not.toContain('assetCount');
    expect(map).not.toContain('{reminderCount} rem');
    expect(map).not.toContain('{documentCount} docs');
    expect(map).not.toContain('{assetCount} assets');
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
    expect(autosaveSource).toContain('...homeMapLayoutFieldsFromBox(homeMapBoxFromLayout(layout))');
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
    const constants = sourceBetween(app, 'const HOME_MAP_FEET_PER_GRID_UNIT =', 'const HOME_ASSET_CATEGORIES =');
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(constants).toContain('HOME_MAP_FEET_PER_GRID_UNIT');
    expect(constants).toContain('HOME_MAP_PIXELS_PER_FOOT');
    expect(constants).toContain('HOME_MAP_MAJOR_GRID_EVERY_FEET');
    expect(constants).toContain('HOME_MAP_WORKSPACE_WIDTH');
    expect(constants).toContain('HOME_MAP_WORKSPACE_HEIGHT');
    expect(constants).toContain('HOME_MAP_ZOOM_MIN');
    expect(constants).toContain('HOME_MAP_ZOOM_MAX');
    expect(constants).toContain('const HOME_MAP_ZOOM_MIN = 0.5');
    expect(constants).toContain('const HOME_MAP_ZOOM_MAX = 3');
    expect(builder).toContain('data-testid="home-map-zoom-out"');
    expect(builder).toContain('data-testid="home-map-fit-view"');
    expect(builder).toContain('data-testid="home-map-zoom-in"');
    expect(builder).toContain('data-testid="home-map-builder-workspace"');
    expect(builder).toContain('flex flex-col bg-slate-950');
    expect(builder).toContain('data-testid="home-map-builder-shell"');
    expect(builder).toContain('lg:grid-cols-[144px_minmax(0,1fr)]');
    expect(builder).toContain('data-testid="home-map-builder-mobile-toolbar"');
    expect(builder).toContain('data-testid="home-map-builder-canvas"');
    expect(builder).toContain('Rough organizer');
    expect(builder).not.toContain('xl:grid-cols-[minmax(0,1fr)_390px]');
    expect(map).toContain('data-testid="home-map-canvas-scroll"');
    expect(map).toContain('h-[62vh] min-h-[420px]');
    expect(map).toContain('overflow-auto');
    expect(map).toContain('xl:h-[calc(100vh-190px)]');
    expect(map).toContain('canvasCellWidth');
    expect(map).toContain('canvasCellHeight');
    expect(map).toContain('box.xFeet * canvasCellWidth');
    expect(map).toContain('box.widthFeet * canvasCellWidth');
    expect(app).not.toContain('react-rnd');
    expect(app).not.toContain('interactjs');
  });

  test('mobile pinch and pan are canvas-owned without changing feet geometry', () => {
    const app = appSource();
    const stateSource = sourceBetween(app, 'const [homeMapDrag, setHomeMapDrag]', 'const [homeAssetsByHomeId, setHomeAssetsByHomeId]');
    const helper = sourceBetween(app, 'const clampHomeMapZoom =', 'const feetFromMeasurement =');
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');

    expect(app).toContain('type HomeMapCanvasGesture =');
    expect(app).toContain("mode: 'pinch';");
    expect(app).toContain("mode: 'pan';");
    expect(app).toContain('startDistance: number;');
    expect(app).toContain('startZoom: number;');
    expect(app).toContain('startMidpointX: number;');
    expect(app).toContain('startMidpointY: number;');
    expect(app).toContain('startScrollLeft: number;');
    expect(app).toContain('startX: number;');
    expect(app).toContain('startY: number;');
    expect(stateSource).toContain('homeMapCanvasScrollRef');
    expect(stateSource).toContain('setHomeMapCanvasScrollElement');
    expect(stateSource).toContain('homeMapZoomRef');
    expect(stateSource).toContain('homeMapCanvasGestureRef');
    expect(stateSource).toContain('useRef<HomeMapCanvasGesture | null>(null)');
    expect(stateSource).not.toContain('homeMapPinchGestureRef');
    expect(helper).toContain('Math.min(HOME_MAP_ZOOM_MAX, Math.max(HOME_MAP_ZOOM_MIN');
    expect(helper).toContain('const homeMapTouchDistance = (touches: TouchList)');
    expect(helper).toContain('const homeMapTouchMidpoint = (touches: TouchList, element: HTMLElement)');
    expect(helper).toContain('const homeMapTouchTargetIsInteractive = (target: EventTarget | null)');
    expect(helper).toContain('const setHomeMapCanvasScrollNode = useCallback');
    expect(helper).toContain('homeMapCanvasScrollRef.current = node;');
    expect(helper).toContain('setHomeMapCanvasScrollElement(node);');
    expect(helper).toContain('const scrollContainer = homeMapCanvasScrollElement;');
    expect(helper).toContain('const startHomeMapGesture = (event: globalThis.TouchEvent)');
    expect(helper).toContain('if (event.touches.length === 2)');
    expect(helper).toContain('setHomeMapDrag(null);');
    expect(helper).toContain('startZoom: homeMapZoomRef.current');
    expect(helper).toContain('const moveHomeMapGesture = (event: globalThis.TouchEvent)');
    expect(helper).toContain("if (gesture.mode === 'pinch')");
    expect(helper).toContain('event.preventDefault();');
    expect(helper).toContain('const currentMidpoint = homeMapTouchMidpoint(event.touches, scrollContainer);');
    expect(helper).toContain('const nextZoom = clampHomeMapZoom(gesture.startZoom * (nextDistance / gesture.startDistance));');
    expect(helper).toContain('setHomeMapZoom(nextZoom);');
    expect(helper).toContain('scrollContainer.scrollLeft = Math.max(0, (gesture.startScrollLeft + gesture.startMidpointX) * zoomRatio - currentMidpoint.x);');
    expect(helper).toContain('scrollContainer.scrollTop = Math.max(0, (gesture.startScrollTop + gesture.startMidpointY) * zoomRatio - currentMidpoint.y);');
    expect(helper).toContain("if (gesture.mode === 'pan')");
    expect(helper).toContain('scrollContainer.scrollLeft = Math.max(0, gesture.startScrollLeft + gesture.startX - touch.clientX);');
    expect(helper).toContain('const touchListenerOptions = { passive: false } as AddEventListenerOptions;');
    expect(helper).toContain("scrollContainer.addEventListener('touchstart', startHomeMapGesture, touchListenerOptions)");
    expect(helper).toContain("scrollContainer.addEventListener('touchmove', moveHomeMapGesture, touchListenerOptions)");
    expect(helper).toContain("scrollContainer.addEventListener('touchend', endHomeMapGesture, touchListenerOptions)");
    expect(helper).toContain("scrollContainer.addEventListener('touchcancel', endHomeMapGesture, touchListenerOptions)");
    expect(helper).toContain('homeMapCanvasGestureRef.current = null;');
    expect(map).toContain('ref={builderMode ? setHomeMapCanvasScrollNode : undefined}');
    expect(map).toContain('[overscroll-behavior:contain]');
    expect(map).toContain('[touch-action:none]');
    expect(map).not.toContain('onTouchStartCapture=');
    expect(map).not.toContain('onTouchMoveCapture=');
    expect(map).toContain('box.xFeet * canvasCellWidth');
    expect(map).toContain('box.yFeet * canvasCellHeight');
    expect(map).toContain('box.widthFeet * canvasCellWidth');
    expect(map).toContain('box.depthFeet * canvasCellHeight');
    expect(map).toContain('Math.round((event.clientX - homeMapDrag.startX) / canvasCellWidth)');
    expect(map).toContain('Math.round((event.clientY - homeMapDrag.startY) / canvasCellHeight)');
    expect(map).toContain('homeMapRoomLabelModeForBox(box, canvasCellWidth, canvasCellHeight)');
    expect(map).toContain('data-testid="home-map-resize-handle"');
    expect(map).toContain('data-testid="home-map-room-box"');
    expect(map).not.toContain('minWidth: builderMode');
    expect(map).not.toContain('minHeight: builderMode');
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
