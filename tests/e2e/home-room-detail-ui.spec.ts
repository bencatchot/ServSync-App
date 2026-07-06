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

test.describe('homeowner room detail panel', () => {
  test('adds homeowner-owned room detail state and controls inside the Rooms card only', () => {
    const app = appSource();
    const roomState = sourceBetween(app, 'const [homeRoomsByHomeId, setHomeRoomsByHomeId]', 'const [connections, setConnections]');
    const resetEffects = sourceBetween(app, 'useEffect(() => {\n    setHomeownerReminderRoomFilter', 'const openHomeRoomForm =');
    const roomUiSource = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderSharedHomeShellsPanel =');

    expect(roomState).toContain('const [selectedHomeRoomDetailId, setSelectedHomeRoomDetailId] = useState<string | null>(null);');
    expect(resetEffects).toContain('setSelectedHomeRoomDetailId(null)');
    expect(resetEffects).toContain('[selectedHomeId]');
    expect(roomUiSource).toContain('View details');
    expect(roomUiSource).toContain('Close details');
    expect(roomUiSource).toContain("data-testid=\"home-room-detail-panel\"");
    expect(roomUiSource).toContain('!compact && canManage');
    expect(roomUiSource).toContain('renderHomeRoomDetailPanel(detailRoom, showNotes)');
  });

  test('room detail uses existing linked reminders and documents without adding mutations', () => {
    const app = appSource();
    const detailPanel = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');

    expect(detailPanel).toContain('homeReminders');
    expect(detailPanel).toContain('reminder.home_id === room.home_id && reminder.home_room_id === room.id');
    expect(detailPanel).toContain('homeDocuments');
    expect(detailPanel).toContain('doc.home_id === room.home_id && doc.home_room_id === room.id');
    expect(detailPanel).toContain('Linked reminders');
    expect(detailPanel).toContain('Linked documents');
    expect(detailPanel).toContain('No reminders, documents, or assets are linked to this room yet.');
    expect(detailPanel).toContain('No reminders are tagged to this room.');
    expect(detailPanel).toContain('No documents are tagged to this room.');
    expect(detailPanel).toContain('Room links are optional and help organize home records.');
    expect(detailPanel).toContain('reminderDueState(reminder)');
    expect(detailPanel).toContain('homeDocumentTypeLabel(doc.document_type)');
    expect(detailPanel).toContain('storageSizeLabel(doc.file_size_bytes)');
    expect(detailPanel).not.toContain('updateHomeReminderStatus');
    expect(detailPanel).not.toContain('downloadDocument');
    expect(detailPanel).not.toContain('deleteDocument');
    expect(detailPanel).not.toContain('supabase.');
  });

  test('room notes remain manager-scoped and room detail does not expand shared or contractor surfaces', () => {
    const app = appSource();
    const detailPanel = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');
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

    expect(detailPanel).toContain('showNotes && room.notes');
    expect(sharedHomesSource).not.toContain('home-room-detail-panel');
    expect(sharedHomesSource).not.toContain('renderHomeRoomDetailPanel');
    expect(sharedHomesSource).toContain('Requests, estimates, invoices, jobs, documents, messages, notifications, storage, contractor connections, and Home History remain private until sharing is expanded.');
    expect(contractorSource).not.toContain('home-room-detail-panel');
    expect(contractorSource).not.toContain('renderHomeRoomDetailPanel');
    expect(contractorSource).not.toContain('home_room_id');
  });

  test('room detail includes linked assets without key-location, storage, contractor, or workflow scope', () => {
    const app = appSource();
    const detailPanel = sourceBetween(app, 'const renderHomeRoomDetailPanel =', 'const renderHomeRoomForm =');
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/types.ts',
      'servsync-home-map-layout-foundation.sql',
      'tests/e2e/home-assets-foundation.spec.ts',
      'tests/e2e/home-map-layout-foundation.spec.ts',
      'tests/e2e/home-map-ui.spec.ts',
      'tests/e2e/home-assets-ui.spec.ts',
      'tests/e2e/home-room-detail-ui.spec.ts',
      'tests/e2e/home-document-room-ui.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'tests/e2e/home-rooms-ui.spec.ts',
      'tests/e2e/security-catalog.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(detailPanel).toContain('linkedAssets');
    expect(detailPanel).toContain('Linked assets');
    expect(detailPanel).toContain('No assets are assigned to this room.');
    expect(detailPanel).not.toContain('home_systems');
    expect(detailPanel).not.toContain('key_locations');
    expect(detailPanel).not.toContain('floor_plan');

    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved homeowner Room Detail file`).toBe(true);
    }
    expect(files.some(file => file.endsWith('.sql') && file !== 'servsync-home-map-layout-foundation.sql')).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file))).toBe(false);
  });
});
