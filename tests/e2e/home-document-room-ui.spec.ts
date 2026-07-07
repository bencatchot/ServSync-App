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

test.describe('home document room picker UI', () => {
  test('adds nullable document room fields to document types and local upload state', () => {
    const types = typeSource();
    const app = appSource();
    const documentType = sourceBetween(types, 'export interface HomeDocument {', 'export interface AppNotification');
    const uploadState = sourceBetween(app, 'const [homeDocuments, setHomeDocuments]', 'const [homeownerDocumentPropertyScope');
    const resetEffect = sourceBetween(
      app,
      'useEffect(() => {\n    setDocUploadRoomId(null);',
      'const openHomeRoomForm =',
    );

    expect(documentType).toContain('home_room_id: string | null;');
    expect(uploadState).toContain('const [docUploadRoomId, setDocUploadRoomId] = useState<string | null>(null);');
    expect(resetEffect).toContain('setDocUploadRoomId(null)');
    expect(resetEffect).toContain('[selectedHomeId]');
  });

  test('manual upload form offers an optional active-room picker with safety copy', () => {
    const app = appSource();
    const uploadForm = sourceBetween(
      app,
      '<div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">',
      '{/* Document list */}',
    );

    expect(uploadForm).toContain('selectedHome?.id &&');
    expect(uploadForm).toContain('Room optional');
    expect(uploadForm).toContain('<option value="">No room</option>');
    expect(uploadForm).toContain('selectedHomeRooms.length === 0');
    expect(uploadForm).toContain('Add rooms in Properties before tagging documents to rooms.');
    expect(uploadForm).toContain('selectedHomeRooms.map(room =>');
    expect(uploadForm).toContain('roomDocumentLabel(room)');
    expect(uploadForm).toContain('setDocUploadRoomId(event.target.value || null)');
    expect(uploadForm).toContain('Tag this document to a room for homeowner organization.');
    expect(uploadForm).toContain('Room tags do not change sharing, contractor access, or document visibility.');
    expect(uploadForm).toContain('Room notes are not shown with documents.');
    expect(uploadForm).toContain('Do not upload lockbox codes, alarm details, gate codes, hidden-key details, or sensitive access instructions unless explicit visibility controls are supported.');
  });

  test('prepare RPC payload carries nullable p_home_room_id without changing register call shape', () => {
    const app = appSource();
    const uploadDocument = sourceBetween(app, 'const uploadDocument = async (file: File) => {', 'const downloadDocument = async');

    expect(uploadDocument).toContain("supabase.rpc('servsync_prepare_manual_home_document_upload'");
    expect(uploadDocument).toContain('p_home_room_id: docUploadRoomId || null');
    expect(uploadDocument).toContain('setDocUploadRoomId(null)');
    expect(uploadDocument).toContain("'servsync_register_manual_home_document_upload'");
    expect(uploadDocument).toContain('{ p_storage_path: preparedStoragePath }');
    expect(uploadDocument).not.toContain('.from(\'home_documents\').update');
    expect(uploadDocument).not.toContain('home_room_id: docUploadRoomId || null, p_storage_path');
  });

  test('document room chips resolve active same-home room basics only and omit room notes', () => {
    const app = appSource();
    const roomLoading = sourceBetween(app, 'const loadHomeRooms = useCallback(async () => {', 'const openHomeRoomForm =');
    const labelSource = sourceBetween(app, 'const roomReminderLabel = (room: HomeRoom) =>', 'const roomDocumentLabel = roomReminderLabel;');
    const chipSource = sourceBetween(app, 'const roomDocumentLabel = roomReminderLabel;', 'const homeDocumentTypeLabel =');
    const documentList = sourceBetween(app, '{propertyScopedHomeDocuments.map(doc => {', '{docPendingDelete && (');
    const dashboardDocuments = sourceBetween(
      app,
      '<Card title="Documents" icon={<FolderOpen size={18} />}>',
      '<button type="button" onClick={() => { setHomeownerDocumentPropertyScope',
    );

    expect(roomLoading).toContain(".from('home_rooms')");
    expect(roomLoading).toContain(".is('archived_at', null)");
    expect(chipSource).toContain("Pick<HomeDocument, 'home_id' | 'home_room_id'>");
    expect(chipSource).toContain('homeRoomsByHomeId[doc.home_id]');
    expect(chipSource).toContain('room.id === doc.home_room_id');
    expect(chipSource).toContain('Room: {roomDocumentLabel(room)}');
    expect(labelSource).toContain('room.name');
    expect(labelSource).toContain('room.floor_label');
    expect(labelSource).toContain('room.area_label');
    expect(labelSource).not.toContain('room.notes');
    expect(chipSource).not.toContain('room.notes');
    expect(documentList).toContain('renderDocumentRoomChip(doc)');
    expect(dashboardDocuments).toContain('renderDocumentRoomChip(doc)');
  });

  test('shared-home shells and contractor code do not gain document room visibility', () => {
    const app = appSource();
    const sharedHomeShellSql = sourceFile('servsync-shared-home-shell.sql');
    const sharedReminderShellSql = sourceFile('servsync-shared-home-reminders-shell.sql');
    const sharedHomesUi = sourceBetween(
      app,
      '<Card title="Homes shared with me" icon={<Home size={18} />}>',
      '<Card title="Home Access" icon={<Users size={18} />}>',
    );
    const contractorSource = sourceBetween(
      app,
      'function ContractorDashboard({ profile, onSignOut }',
      'function PlatformAdminDashboard({ onSignOut }',
    );

    for (const source of [sharedHomeShellSql, sharedReminderShellSql, sharedHomesUi]) {
      expect(source).not.toContain('home_documents');
      expect(source).not.toContain('home_room_id');
      expect(source).not.toContain('home_rooms');
      expect(source).not.toContain('renderDocumentRoomChip');
      expect(source).not.toContain('room.notes');
    }

    expect(contractorSource).not.toContain('home_room_id');
    expect(contractorSource).not.toContain('renderDocumentRoomChip');
    expect(contractorSource).not.toContain('roomForDocument');
  });

  test('changed-file scope stays frontend, tests, and planning docs only', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'src/textCleanup.ts',
      'src/types.ts',
      'tests/e2e/home-map-systems-ux.spec.ts',
      'servsync-home-map-layout-foundation.sql',
      'tests/e2e/home-assets-foundation.spec.ts',
      'tests/e2e/home-map-layout-foundation.spec.ts',
      'tests/e2e/home-map-ui.spec.ts',
      'tests/e2e/home-assets-ui.spec.ts',
      'tests/e2e/home-document-room-ui.spec.ts',
      'tests/e2e/home-room-detail-ui.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'tests/e2e/home-rooms-ui.spec.ts',
      'tests/e2e/security-catalog.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved document-room UI file`).toBe(true);
    }

    expect(files.some(file => file.endsWith('.sql') && file !== 'servsync-home-map-layout-foundation.sql')).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file))).toBe(false);
    expect(files).not.toContain('servsync-home-document-upload-room-registration.sql');
    expect(files).not.toContain('servsync-home-document-room-foundation.sql');
  });
});
