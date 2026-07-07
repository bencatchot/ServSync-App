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

test.describe('Home Map & Systems dedicated builder UX', () => {
  test('Properties exposes a clean Home Map entry instead of embedded competing feature cards', () => {
    const app = appSource();
    const properties = sourceBetween(
      app,
      'data-testid="home-setup-guide"',
      '{renderSharedHomeShellsPanel()}',
    );
    const entry = sourceBetween(app, 'const renderHomeMapEntryCard =', 'const renderHomeMapBuilderView =');

    expect(properties).toContain('renderHomeMapEntryCard(selectedHome.id');
    expect(properties).toContain('<Card title="Home Map"');
    expect(properties).not.toContain('<Card title="Rooms"');
    expect(properties).not.toContain('<Card title="Home Map & Systems"');
    expect(properties).not.toContain('<Card title="Assets & Systems"');
    expect(entry).toContain('data-testid="home-map-entry-card"');
    expect(entry).toContain('Build a simple map of your home, then attach rooms, systems, documents, and reminders.');
    expect(entry).toContain('Rooms and hallways are the map objects.');
    expect(entry).toContain('data-testid="home-map-entry-open"');
    expect(entry).toContain("hasMap ? 'Open Home Map' : 'Build Home Map'");
  });

  test('dedicated builder keeps the map as the room management surface', () => {
    const app = appSource();
    const builder = sourceBetween(app, 'const renderHomeMapBuilderView =', 'const renderSharedHomeShellsPanel =');

    expect(builder).toContain('data-testid="home-map-builder-workspace"');
    expect(builder).toContain('fixed inset-0');
    expect(builder).toContain('Home Map Builder');
    expect(builder).toContain('data-testid="home-map-builder-header"');
    expect(builder).toContain('data-testid="home-map-builder-side-toolbar"');
    expect(builder).toContain('hidden min-h-0 flex-col');
    expect(builder).toContain('data-testid="home-map-builder-mobile-toolbar"');
    expect(builder).toContain('fixed inset-x-0 bottom-0 z-50');
    expect(builder).toContain('data-testid="home-map-builder-shell"');
    expect(builder).toContain('flex min-h-0 flex-1 flex-col');
    expect(builder).toContain('lg:grid lg:grid-cols-[144px_minmax(0,1fr)]');
    expect(builder).toContain('data-testid="home-map-builder-canvas"');
    expect(builder).toContain('flex-1 flex-col');
    expect(builder).toContain('Drag to move. Use the corner handle to resize.');
    expect(builder).toContain('data-testid="home-map-room-detail-drawer"');
    expect(builder).toContain('rounded-t-3xl');
    expect(builder).toContain('renderHomeRoomDetailPanel(selectedRoom, true, true)');
    expect(builder).toContain('<span>Add Room</span>');
    expect(builder).toContain('<span>Add Hallway</span>');
    expect(builder).toContain('<span>Zoom Out</span>');
    expect(builder).toContain('Fit View');
    expect(builder).toContain('<span>Zoom In</span>');
    expect(builder).toContain('data-testid="home-map-builder-room-list-panel"');
    expect(builder).toContain('fixed inset-x-0 bottom-0 z-40');
    expect(builder).toContain('max-h-[78vh]');
    expect(builder).toContain('setHomeMapRoomsPanelOpen(current => !current)');
    expect(builder).toContain('Rooms on this map');
    expect(builder).toContain('Rooms not on map');
    expect(builder).not.toContain('data-testid="home-map-builder-side-panel"');
    expect(builder).not.toContain('data-testid="home-map-builder-selected-panel"');
  });

  test('rough dimensions and direct map controls remain simple organizer behavior', () => {
    const app = appSource();
    const form = sourceBetween(app, 'const renderHomeRoomLayoutForm =', 'const renderHomeMapSection =');
    const map = sourceBetween(app, 'const renderHomeMapSection =', 'const renderHomeAssetForm =');
    const detail = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');

    expect(form).toContain('Room dimensions');
    expect(form).toContain('Length');
    expect(form).toContain('Width');
    expect(form).toContain('Enter rough dimensions like 10 x 14.');
    expect(map).toContain('Each grid line represents roughly 1 ft. Measurements are approximate.');
    expect(map).toContain('Grid: ~1 ft. Approximate.');
    expect(map).toContain('data-testid="home-map-grid-measurement-copy"');
    expect(map).toContain('canvasPixelsPerFoot = HOME_MAP_PIXELS_PER_FOOT * mapZoom');
    expect(map).toContain('repeating-linear-gradient(to right');
    expect(map).toContain('HOME_MAP_MAJOR_GRID_EVERY_FEET');
    expect(form).not.toContain('<Field label="X">');
    expect(form).not.toContain('<Field label="Y">');
    expect(form).not.toContain('layout width');
    expect(form).not.toContain('layout height');
    expect(form).not.toContain('ceiling');
    expect(map).toContain('const isSelected = selectedHomeRoomDetailId === room.id');
    expect(map).toContain('cursor-grab');
    expect(map).toContain('data-testid="home-map-room-edit"');
    expect(map).toContain('openHomeMapRoomEditor(room, layout)');
    expect(map).not.toContain('setHomeMapDetailPanelOpen(true)');
    expect(map).toContain('data-testid="home-map-resize-handle"');
    expect(map).toContain("mode: 'move'");
    expect(map).toContain("mode: 'resize'");
    expect(detail).toContain('data-testid="home-map-room-basics-editor"');
    expect(detail).toContain('Edit room basics');
    expect(detail).toContain('Edit rough dimensions');
    expect(detail).toContain('data-testid="home-map-fine-tune-controls"');
    expect(detail).toContain('Fine tune position');
    expect(detail).toContain('Fallback map controls');
  });

  test('selected room panel keeps assets documents reminders and notes in room context only', () => {
    const app = appSource();
    const detail = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');
    const sharedHomesSource = sourceBetween(
      app,
      '<Card title="Homes shared with me" icon={<Home size={18} />}>',
      '<Card title="Home Access" icon={<Users size={18} />}>',
    );
    const contractorSource = sourceBetween(
      app,
      'function ContractorDashboard({ profile, onSignOut }',
      'function PlatformAdminDashboard({ onSignOut }',
    );

    expect(detail).toContain('Linked assets');
    expect(detail).toContain('Linked documents');
    expect(detail).toContain('Linked reminders');
    expect(detail).toContain('showNotes && room.notes');
    expect(detail).toContain('openHomeAssetForm(room.home_id, undefined, room.id)');
    expect(detail).not.toContain('updateHomeReminderStatus');
    expect(detail).not.toContain('downloadDocument');
    expect(detail).not.toContain('deleteDocument');
    expect(sharedHomesSource).not.toContain('home-map-builder-workspace');
    expect(sharedHomesSource).not.toContain('home-map-room-detail-drawer');
    expect(contractorSource).not.toContain('home-map-builder-workspace');
    expect(contractorSource).not.toContain('home_assets');
    expect(contractorSource).not.toContain('home_room_layouts');
  });

  test('future floor plan uploads and persistent map objects remain out of live behavior', () => {
    const app = appSource();
    const docs = `${sourceFile('docs/servsync-master-plan/ServSync_Feature_Backlog.md')}\n${sourceFile('docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md')}`;

    expect(docs).toContain('home_map_objects');
    expect(docs).toContain('floor-plan upload');
    expect(app).not.toContain('home_map_objects');
    expect(app).not.toContain('floor_plan_upload');
    expect(app).not.toContain('doorway_marker');
    expect(app).not.toContain('window_marker');
    expect(app).not.toContain('stairs_marker');
    expect(app).not.toContain('key_locations');
    expect(app).not.toContain('access_code');
  });

  test('scope remains frontend tests and docs only', () => {
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

    expect(files.length, 'branch should have changed files for this builder slice').toBeGreaterThan(0);
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
