import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');
const typeSource = () => sourceFile('src/types.ts');

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

test.describe('home reminder room picker UI', () => {
  test('adds nullable room fields to reminder types and draft state', () => {
    const types = typeSource();
    const app = appSource();
    const reminderType = sourceBetween(types, 'export interface HomeReminder {', 'export interface ServiceRequestReview');
    const reminderDraftType = sourceBetween(app, 'type HomeReminderDraft = {', 'type HomeRoomDraft = {');
    const emptyDraft = sourceBetween(app, 'const emptyHomeReminderDraft = (): HomeReminderDraft => ({', 'const reminderDueState');

    expect(reminderType).toContain('home_room_id: string | null;');
    expect(reminderDraftType).toContain('home_room_id: string | null;');
    expect(emptyDraft).toContain('home_room_id: null');
  });

  test('create reminder form offers an optional active-room picker and resets room on property change', () => {
    const app = appSource();
    const reminderForm = sourceBetween(
      app,
      '{reminderFormOpen && (',
      '<Field label="Notes — optional">',
    );

    expect(reminderForm).toContain('Room optional');
    expect(reminderForm).toContain('<option value="">No room</option>');
    expect(reminderForm).toContain('const reminderRooms = homeRoomsByHomeId[homeReminderDraft.home_id] || []');
    expect(reminderForm).toContain('reminderRooms.map(room =>');
    expect(reminderForm).toContain('roomReminderLabel(room)');
    expect(reminderForm).toContain('home_room_id: event.target.value || null');
    expect(reminderForm).toContain('home_id: event.target.value, home_room_id: null');
    expect(reminderForm).toContain('Add rooms in Properties before tagging reminders to rooms.');
    expect(reminderForm).toContain('Tag this reminder to a room for home organization.');
    expect(reminderForm).toContain('Room links are for organization only and do not change sharing, contractor access, or reminder delivery.');
    expect(reminderForm).toContain('Room notes are not shown on reminders.');
  });

  test('save payload includes nullable home_room_id without adding edit reminder behavior', () => {
    const app = appSource();
    const saveReminder = sourceBetween(app, 'const saveHomeReminder = async () => {', 'const updateHomeReminderStatus = async');
    const statusUpdate = sourceBetween(app, 'const updateHomeReminderStatus = async', 'const uploadDocument = async');

    expect(saveReminder).toContain(".from('home_reminders').insert");
    expect(saveReminder).toContain('home_room_id: homeReminderDraft.home_room_id || null');
    expect(statusUpdate).not.toContain('home_room_id');
    expect(app).not.toContain('Edit reminder');
    expect(app).not.toContain('Update reminder');
  });

  test('room chips resolve active room basics only and omit notes', () => {
    const app = appSource();
    const roomLoading = sourceBetween(app, 'const loadHomeRooms = useCallback(async () => {', 'const openHomeRoomForm =');
    const chipSource = sourceBetween(app, 'const roomReminderLabel = (room: HomeRoom) =>', 'const renderHomeRoomForm =');

    expect(roomLoading).toContain(".from('home_rooms')");
    expect(roomLoading).toContain(".is('archived_at', null)");
    expect(chipSource).toContain('homeRoomsByHomeId[reminder.home_id]');
    expect(chipSource).toContain('room.id === reminder.home_room_id');
    expect(chipSource).toContain('room.name');
    expect(chipSource).toContain('room.floor_label');
    expect(chipSource).toContain('room.area_label');
    expect(chipSource).toContain('Room: {roomReminderLabel(room)}');
    expect(chipSource).not.toContain('room.notes');
  });

  test('selected-property Home History reminders can be filtered locally by active room basics', () => {
    const app = appSource();
    const filterState = sourceBetween(app, "const [homeownerMaintenancePropertyScope", "const [reminderFormOpen");
    const resetEffect = sourceBetween(
      app,
      "useEffect(() => {\n    setHomeownerReminderRoomFilter('all');",
      'const openHomeRoomForm =',
    );
    const reminderFiltering = sourceBetween(
      app,
      'const propertyScopedHomeReminders = homeReminders.filter(reminder => {',
      'const homeownerMaintenanceScopeLabel',
    );
    const reminderList = sourceBetween(
      app,
      '{propertyScopedHomeReminders.length > 0 && (',
      '{/* Log list */}',
    );
    const dashboardReminderPreview = sourceBetween(
      app,
      '<Card title="Upcoming reminders" icon={<Bell size={18} />}>',
      '<Card title="Documents" icon={<FolderOpen size={18} />}>',
    );

    expect(filterState).toContain("useState('all')");
    expect(resetEffect).toContain("setHomeownerReminderRoomFilter('all')");
    expect(resetEffect).toContain('[selectedHomeId, homeownerMaintenancePropertyScope]');
    expect(reminderFiltering).toContain("homeownerMaintenancePropertyScope === 'selected'");
    expect(reminderFiltering).toContain('selectedHomeReminderRooms.map(room => room.id)');
    expect(reminderFiltering).toContain("homeownerReminderRoomFilter === 'all'");
    expect(reminderFiltering).toContain("homeownerReminderRoomFilter === activeRoomId");
    expect(reminderFiltering).toContain("reminder.home_room_id && selectedHomeReminderRoomIds.has(reminder.home_room_id)");
    expect(reminderFiltering).toContain(": 'none'");

    expect(reminderList).toContain('Filter by room');
    expect(reminderList).toContain('<option value="all">All rooms</option>');
    expect(reminderList).toContain('selectedHomeReminderRooms.map(room =>');
    expect(reminderList).toContain('roomReminderLabel(room)');
    expect(reminderList).toContain('<option value="none">No room</option>');
    expect(reminderList).toContain('Filter reminders by the room they are tagged to. Rooms are for organization only and do not change reminder delivery or sharing.');
    expect(reminderList).toContain('Add rooms in Properties before filtering reminders by room.');
    expect(reminderList).toContain('roomFilteredHomeReminders.length === 0');
    expect(reminderList).toContain('No Home Reminders match this room filter.');
    expect(reminderList).toContain('roomFilteredHomeReminders');

    expect(dashboardReminderPreview).not.toContain('Filter by room');
    expect(dashboardReminderPreview).not.toContain('homeownerReminderRoomFilter');
  });

  test('shared reminder shell and contractor code do not gain reminder-room visibility', () => {
    const app = appSource();
    const sharedShellSql = sourceFile('servsync-shared-home-reminders-shell.sql');
    const sharedShellType = sourceBetween(app, 'type SharedHomeReminderShell = {', 'type HomeAccessInviteDraft = {');
    const sharedReminderUi = sourceBetween(
      app,
      'data-testid="shared-home-reminders-section"',
      '{renderHomeAccessPanel()}',
    );
    const contractorSource = sourceBetween(
      app,
      'function ContractorDashboard({ profile, onSignOut }',
      'function PlatformAdminDashboard({ onSignOut }',
    );

    for (const source of [sharedShellSql, sharedShellType, sharedReminderUi]) {
      expect(source).not.toContain('home_room_id');
      expect(source).not.toContain('home_rooms');
      expect(source).not.toContain('room.notes');
      expect(source).not.toContain('Room:');
    }
    expect(contractorSource).not.toContain('home_room_id');
    expect(contractorSource).not.toContain('home_rooms');
  });

  test('changed-file scope stays frontend, tests, and planning docs only', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/types.ts',
      'tests/e2e/home-document-room-ui.spec.ts',
      'tests/e2e/home-rooms-ui.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved reminder-room UI file`).toBe(true);
    }
    expect(files.some(file => file.endsWith('.sql'))).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
  });
});
