import { expect, test } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer, type ViteDevServer } from 'vite';
import { contractorPriceBookAccess } from '../../src/features/price-book/priceBookAccess';
import type { ContractorTeamAccess, ContractorTeamRole } from '../../src/types';

const contractor = { owner_user_id: 'owner-user' };

type PriceBookRenderHarness = {
  renderPriceBookWorkspace: (options?: {
    count?: number;
    canManage?: boolean;
    loadState?: 'idle' | 'loading' | 'ready' | 'error';
    formOpen?: boolean;
  }) => string;
  renderContractorJobsOverview: (canViewPriceBook: boolean) => string;
};

let viteServer: ViteDevServer;
let renderHarness: PriceBookRenderHarness;

test.beforeAll(async () => {
  viteServer = await createServer({
    root: process.cwd(),
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [react()],
    server: { middlewareMode: true },
  });
  renderHarness = await viteServer.ssrLoadModule('/tests/e2e/helpers/priceBookRenderHarness.tsx') as PriceBookRenderHarness;
});

test.afterAll(async () => {
  await viteServer?.close();
});

function teamAccess(role: ContractorTeamRole, status: 'active' | 'disabled' = 'active'): ContractorTeamAccess {
  return {
    contractor_id: 'contractor-1',
    can_manage: role === 'admin',
    included_seats: 1,
    active_seat_count: status === 'active' ? 1 : 0,
    extra_seat_count: 0,
    members: [{
      id: `member-${role}`,
      contractor_id: 'contractor-1',
      user_id: `${role}-user`,
      email: `${role}@example.test`,
      display_name: role,
      role,
      status,
      accepted_at: '2026-08-01T12:00:00.000Z',
      created_at: '2026-08-01T12:00:00.000Z',
      updated_at: '2026-08-01T12:00:00.000Z',
    }],
    invites: [],
  };
}

test.describe('FB-024 rendered Price Book management behavior', () => {
  test('grants active account roles read access while limiting management to owner, admin, and office', () => {
    expect(contractorPriceBookAccess(contractor, null, 'owner-user')).toEqual({ canView: true, canManage: true });
    expect(contractorPriceBookAccess(contractor, teamAccess('admin'), 'admin-user')).toEqual({ canView: true, canManage: true });
    expect(contractorPriceBookAccess(contractor, teamAccess('office'), 'office-user')).toEqual({ canView: true, canManage: true });
    expect(contractorPriceBookAccess(contractor, teamAccess('field_tech'), 'field_tech-user')).toEqual({ canView: true, canManage: false });
    expect(contractorPriceBookAccess(contractor, teamAccess('viewer'), 'viewer-user')).toEqual({ canView: true, canManage: false });
    expect(contractorPriceBookAccess(contractor, teamAccess('viewer', 'disabled'), 'viewer-user')).toEqual({ canView: false, canManage: false });
  });

  test('keeps Price Book reachable for read-only roles and renders the workspace read-only', () => {
    const overview = renderHarness.renderContractorJobsOverview(true);
    const workspace = renderHarness.renderPriceBookWorkspace({ canManage: false });

    expect(overview).toContain('data-testid="contractor-work-open-custom-pricing"');
    expect(overview).toContain('Price Book');
    expect(workspace).toContain('You can view Price Book items');
    expect(workspace).not.toContain('>Add Item<');
    expect(workspace).not.toContain('data-testid="price-book-import-tools"');
    expect(renderHarness.renderContractorJobsOverview(false)).not.toContain('data-testid="contractor-work-open-custom-pricing"');
  });

  test('fails closed when loading is incomplete or unsuccessful', () => {
    for (const loadState of ['idle', 'loading', 'error'] as const) {
      const workspace = renderHarness.renderPriceBookWorkspace({ canManage: true, loadState, formOpen: true });
      expect(workspace).not.toContain('>Add Item<');
      expect(workspace).not.toContain('data-testid="price-book-item-form"');
      expect(workspace).not.toContain('data-testid="price-book-import-tools"');
    }

    const failed = renderHarness.renderPriceBookWorkspace({ canManage: true, loadState: 'error' });
    expect(failed).toContain('data-testid="price-book-load-error"');
    expect(failed).toContain('Read failed safely.');

    const ready = renderHarness.renderPriceBookWorkspace({ canManage: true, loadState: 'ready', formOpen: true });
    expect(ready).toContain('data-testid="price-book-item-form"');
    expect(ready).toContain('data-testid="price-book-import-tools"');
  });

  test('renders empty, normal, and busy libraries without exceeding the 25-row page size', () => {
    const rowCount = (markup: string) => (markup.match(/data-testid="price-book-item-row"/g) || []).length;

    const empty = renderHarness.renderPriceBookWorkspace({ count: 0 });
    expect(empty).toContain('Your Price Book is empty.');
    expect(rowCount(empty)).toBe(0);
    expect(rowCount(renderHarness.renderPriceBookWorkspace({ count: 10 }))).toBe(10);

    const busy = renderHarness.renderPriceBookWorkspace({ count: 100 });
    expect(rowCount(busy)).toBe(25);
    expect(busy).toContain('Showing 1–25 of 100');
    expect(busy).toContain('Page 1 of 4');
  });
});
