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

test.describe('Contractor Home Map Draft UI source guardrails', () => {
  test('adds a request-scoped draft entry in contractor Service Requests', () => {
    const source = appSource();
    const requestSource = sourceBetween(
      source,
      "{contractorTab === 'requests' && (",
      "{contractorTab === 'calendar' &&",
    );

    expect(requestSource).toContain('contractorHomeMapDraftsByRequestId[request.id]');
    expect(requestSource).toContain('data-testid="contractor-home-map-draft-open"');
    expect(requestSource).toContain('Create Home Map draft');
    expect(requestSource).toContain('Continue Home Map draft');
    expect(source).toContain('Submitted for homeowner review');
    expect(source).toContain('Approved by homeowner');
    expect(source).toContain('Declined by homeowner');
    expect(source).toContain('Revoked');
    expect(requestSource).toContain('renderContractorHomeMapDraftPanel(request)');
    expect(requestSource).toContain('request.home_id');
  });

  test('uses only the contractor draft RPC boundary for contractor map writes', () => {
    const source = appSource();
    const actionSource = sourceBetween(
      source,
      'const upsertContractorHomeMapDraftRoom = async (',
      'const proposeAppointmentWindows = async',
    );

    for (const rpc of [
      'servsync_create_home_map_draft',
      'servsync_upsert_home_map_draft_room',
      'servsync_submit_home_map_draft',
      'servsync_revoke_home_map_draft',
    ]) {
      expect(actionSource).toContain(rpc);
    }

    expect(actionSource).not.toContain('servsync_accept_home_map_draft');
    expect(actionSource).not.toContain('servsync_decline_home_map_draft');
    expect(actionSource).not.toContain(".from('home_rooms')");
    expect(actionSource).not.toContain(".from('home_room_layouts')");
    expect(actionSource).not.toContain(".from('home_assets')");
    expect(actionSource).not.toContain(".from('home_documents')");
    expect(actionSource).not.toContain(".from('home_reminders')");
    expect(actionSource).not.toContain('.storage.');
    expect(actionSource).toContain('p_source_home_room_id: null');
  });

  test('loads only draft tables and keeps permanent Home Map tables out of contractor draft loading', () => {
    const source = appSource();
    const loadSource = sourceBetween(
      source,
      'const loadContractorHomeMapDrafts = useCallback(async',
      'const loadContractor = useCallback(async () => {',
    );

    expect(loadSource).toContain(".from('home_map_drafts')");
    expect(loadSource).toContain(".from('home_map_draft_rooms')");
    expect(loadSource).toContain(".from('home_map_draft_room_layouts')");
    expect(loadSource).toContain(".in('service_request_id', homeScopedRequestIds)");
    expect(loadSource).not.toContain(".from('home_rooms')");
    expect(loadSource).not.toContain(".from('home_room_layouts')");
    expect(loadSource).not.toContain(".from('home_assets')");
    expect(loadSource).not.toContain(".from('home_documents')");
    expect(loadSource).not.toContain(".from('home_reminders')");
  });

  test('draft builder is blank-first and status-aware without homeowner review controls', () => {
    const source = appSource();
    const panelSource = sourceBetween(
      source,
      'const renderContractorHomeMapDraftPanel = (request: ServiceRequestSummary) => {',
      'const serviceRequestIdsWithJobs = new Set(',
    );

    expect(panelSource).toContain('data-testid="contractor-home-map-draft-panel"');
    expect(panelSource).toContain('No draft rooms yet');
    expect(panelSource).toContain('Start blank with a room or hallway for this request.');
    expect(panelSource).toContain('data-testid="contractor-home-map-draft-add-room"');
    expect(panelSource).toContain('data-testid="contractor-home-map-draft-add-hallway"');
    expect(panelSource).toContain('data-testid="contractor-home-map-draft-submit"');
    expect(panelSource).toContain('data-testid="contractor-home-map-draft-revoke"');
    expect(panelSource).toContain("draft?.status === 'submitted'");
    expect(panelSource).toContain("draft?.status === 'accepted'");
    expect(panelSource).toContain("draft?.status === 'declined'");
    expect(panelSource).toContain("draft?.status === 'revoked'");
    expect(panelSource).toContain('The homeowner must approve it before anything changes their permanent Home Map.');
    expect(panelSource).toContain('Contractors cannot accept, decline, or write to the permanent homeowner Home Map.');
    expect(panelSource).not.toContain('servsync_accept_home_map_draft');
    expect(panelSource).not.toContain('servsync_decline_home_map_draft');
    expect(panelSource).not.toContain('Linked assets');
    expect(panelSource).not.toContain('Linked documents');
    expect(panelSource).not.toContain('Linked reminders');
  });

  test('draft boxes use feet-based geometry and selected draft room editing only', () => {
    const source = appSource();
    const panelSource = sourceBetween(
      source,
      'const renderContractorHomeMapDraftPanel = (request: ServiceRequestSummary) => {',
      'const serviceRequestIdsWithJobs = new Set(',
    );

    expect(source).toContain('type ContractorHomeMapDraftRoomLayout = {');
    expect(source).toContain('x_feet: number;');
    expect(source).toContain('width_feet: number;');
    expect(source).toContain('const contractorHomeMapDraftBoxFromLayout = (layout: ContractorHomeMapDraftRoomLayout): HomeMapBox => {');
    expect(panelSource).toContain('box.xFeet * canvasCellWidth');
    expect(panelSource).toContain('box.yFeet * canvasCellHeight');
    expect(panelSource).toContain('box.widthFeet * canvasCellWidth');
    expect(panelSource).toContain('box.depthFeet * canvasCellHeight');
    expect(panelSource).toContain('updateContractorHomeMapDraftLayoutLocal(room.id, { xFeet: nextX, yFeet: nextY })');
    expect(panelSource).toContain('updateContractorHomeMapDraftLayoutLocal(room.id, { widthFeet: nextWidth, depthFeet: nextHeight })');
    expect(panelSource).toContain('data-testid="contractor-home-map-draft-resize-handle"');
    expect(panelSource).toContain('data-testid="contractor-home-map-draft-save-room"');
    expect(panelSource).not.toContain('minWidth: builderMode');
    expect(panelSource).not.toContain('minHeight: builderMode');
  });

  test('scope remains approved frontend test docs only', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'src/App.tsx',
      'tests/e2e/contractor-home-map-drafts-ui.spec.ts',
      'tests/e2e/home-map-drafts-foundation.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this contractor draft UI slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for the contractor Home Map draft UI slice`).toBe(true);
    }
    expect(files.some(file => file.endsWith('.sql'))).toBe(false);
    expect(files.some(file => file.includes('supabase/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket|service-worker|native/i.test(file))).toBe(false);
  });
});
