import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canSeeDurableDraftWorkflow,
  isGlobalDurableDraftMasterEnabled,
  parseDurableDraftCohortEntitlement,
} from '../../src/features/drafts/durableDraftCohortAvailability';

const CONTRACTOR_A = '10000000-0000-4000-8000-000000000001';
const CONTRACTOR_B = '10000000-0000-4000-8000-000000000002';
const SESSION_A = 'session-a';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function resolvedAvailability(input: {
  contractorId?: string;
  sessionIdentity?: string;
  enabled?: boolean;
} = {}) {
  return {
    status: 'resolved' as const,
    canUseDurableDrafts: input.enabled ?? true,
    contractorId: input.contractorId ?? CONTRACTOR_A,
    sessionIdentity: input.sessionIdentity ?? SESSION_A,
    checkedAt: 1,
    errorKind: null,
  };
}

async function installRenderedHarness(page: Page, options: {
  contractorId?: string | null;
  globalMasterEnabled?: boolean;
} = {}) {
  await page.goto('/');
  await page.evaluate(async ({ contractorA, sessionA, options }) => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const cohort = await import('/src/features/drafts/durableDraftCohortAvailability.ts');

    const host = document.createElement('div');
    host.id = 'cohort-test-root';
    document.body.replaceChildren(host);

    const control = {
      contractorId: options.contractorId === undefined ? contractorA : options.contractorId,
      sessionIdentity: sessionA,
      globalMasterEnabled: options.globalMasterEnabled ?? true,
      demoPresentationActive: false,
      validContractorContext: true,
      now: 0,
      requests: [],
      resolvers: [],
      root: createRoot(host),
    };

    const client = {
      rpc(functionName, args) {
        control.requests.push({ functionName, args });
        return new Promise(resolveRequest => control.resolvers.push(resolveRequest));
      },
    };
    const readNow = () => control.now;

    function Harness() {
      const { availability } = cohort.useDurableDraftCohortAvailability({
        client,
        contractorId: control.contractorId,
        sessionIdentity: control.sessionIdentity,
        globalMasterEnabled: control.globalMasterEnabled,
        now: readNow,
        refreshTtlMs: 100,
      });
      const visible = cohort.canSeeDurableDraftWorkflow({
        globalMasterEnabled: control.globalMasterEnabled,
        availability,
        activeContractorId: control.contractorId,
        activeSessionIdentity: control.sessionIdentity,
        validContractorContext: control.validContractorContext,
        demoPresentationActive: control.demoPresentationActive,
      });
      return React.createElement('div', null,
        React.createElement('output', { 'data-testid': 'status' }, availability.status),
        React.createElement('output', { 'data-testid': 'contractor' }, availability.contractorId ?? 'none'),
        React.createElement('output', { 'data-testid': 'surface' }, visible ? 'durable-work' : availability.status === 'loading' ? 'loading-jobs' : 'legacy-jobs'),
      );
    }

    const render = () => control.root.render(React.createElement(Harness));
    window.__durableCohortHarness = {
      control,
      render,
      resolve(index, data, error = null) {
        control.resolvers[index]?.({ data, error });
      },
      unmount() {
        control.root.unmount();
      },
    };
    render();
  }, { contractorA: CONTRACTOR_A, sessionA: SESSION_A, options });
}

test.describe('durable Draft cohort SQL source contract', () => {
  test('adds one default-false tenant entitlement atomically without enrollment', () => {
    const sql = sourceFile('servsync-durable-draft-cohort-entitlement.sql');
    expect(sql).toMatch(/^--[\s\S]*\nbegin;/i);
    expect(sql).toMatch(/commit;\s*$/i);
    expect(sql).toMatch(/alter table public\.contractor_billing_accounts\s+add column if not exists durable_draft_beta_enabled boolean not null default false/i);
    expect(sql).toContain("comment on column public.contractor_billing_accounts.durable_draft_beta_enabled");
    expect(sql).toContain("has an incompatible definition");
    expect(sql).not.toMatch(/set\s+durable_draft_beta_enabled\s*=\s*true/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.contractor_billing_accounts/i);
    expect(sql).not.toMatch(/update\s+public\.(?:contractor_work_drafts|estimates|inspections|invoices|homes|homeowner_contractor_connections|contractor_team_members|contractor_profiles)/i);
  });

  test('exposes only a tenant-scoped owner or active-member boolean', () => {
    const sql = sourceFile('servsync-durable-draft-cohort-entitlement.sql');
    expect(sql).toContain('public.servsync_current_contractor_durable_draft_entitlement');
    expect(sql).toMatch(/p_contractor_id uuid default null/i);
    expect(sql).toMatch(/returns table \(\s*contractor_id uuid,\s*can_use_durable_drafts boolean\s*\)/i);
    expect(sql).toMatch(/security definer\s+set search_path = pg_catalog, public\s+stable/i);
    expect(sql).toContain('v_user_id uuid := auth.uid()');
    expect(sql).toContain('cp.owner_user_id = v_user_id');
    expect(sql).toContain('tm.user_id = v_user_id');
    expect(sql).toContain("tm.status = 'active'");
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toMatch(/coalesce\(\([\s\S]*cba\.durable_draft_beta_enabled[\s\S]*\), false\)/i);
    expect(sql).not.toContain('current_user_is_platform_admin');
    expect(sql).not.toMatch(/tm\.role\s+(?:=|in)/i);
    expect(sql).not.toMatch(/billing_status|current_plan|monthly_price|stripe_|beta_cohort/);
  });

  test('hardens dependencies and grants only authenticated execution', () => {
    const sql = sourceFile('servsync-durable-draft-cohort-entitlement.sql');
    for (const dependency of [
      'public.contractor_billing_accounts',
      'public.contractor_profiles',
      'public.contractor_team_members',
    ]) {
      expect(sql).toContain(`to_regclass('${dependency}')`);
    }
    expect(sql).toContain("to_regprocedure('auth.uid()')");
    expect(sql).toContain("to_regprocedure('public.servsync_current_contractor_profile()')");
    expect(sql).toContain("id_column.attname = 'id'");
    expect(sql).toContain("owner_column.attname = 'owner_user_id'");
    expect(sql).toContain("contractor_column.attname = 'contractor_id'");
    expect(sql).not.toMatch(/drop function if exists public\.servsync_current_contractor_durable_draft_entitlement/i);
    expect(sql).toMatch(/revoke all on function public\.servsync_current_contractor_durable_draft_entitlement\(uuid\) from public/i);
    expect(sql).toMatch(/revoke all on function public\.servsync_current_contractor_durable_draft_entitlement\(uuid\) from anon/i);
    expect(sql).toMatch(/grant execute on function public\.servsync_current_contractor_durable_draft_entitlement\(uuid\) to authenticated/i);
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+(?:table\s+)?public\.contractor_billing_accounts/i);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });

  test('leaves both approved durable Draft SQL sources unchanged', () => {
    expect(sourceFile('servsync-durable-draft-launch-foundation.sql')).toContain('servsync_launch_work_draft');
    expect(sourceFile('servsync-durable-draft-launch-permission-parity-correction.sql')).toContain('DRAFT_PERMISSION_DENIED');
  });
});

test.describe('durable Draft cohort pure frontend contract', () => {
  test('requires all three global gates and rejects Demo mode', () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const enabled = isGlobalDurableDraftMasterEnabled({
        sharedDraftComposerEnabled: Boolean(mask & 1),
        draftJobUiEnabled: Boolean(mask & 2),
        contractorWorkUiEnabled: Boolean(mask & 4),
        demoPresentationActive: false,
      });
      expect(enabled, `gate mask ${mask}`).toBe(mask === 7);
    }
    expect(isGlobalDurableDraftMasterEnabled({
      sharedDraftComposerEnabled: true,
      draftJobUiEnabled: true,
      contractorWorkUiEnabled: true,
      demoPresentationActive: true,
    })).toBe(false);
  });

  test('enforces the complete master/cohort/context/Demo truth table', () => {
    for (const globalMasterEnabled of [false, true]) {
      for (const cohortEnabled of [false, true]) {
        for (const validContractorContext of [false, true]) {
          for (const demoPresentationActive of [false, true]) {
            const visible = canSeeDurableDraftWorkflow({
              globalMasterEnabled,
              availability: resolvedAvailability({ enabled: cohortEnabled }),
              activeContractorId: CONTRACTOR_A,
              activeSessionIdentity: SESSION_A,
              validContractorContext,
              demoPresentationActive,
            });
            expect(visible).toBe(globalMasterEnabled && cohortEnabled && validContractorContext && !demoPresentationActive);
          }
        }
      }
    }
  });

  test('strictly parses exact contractor responses and defaults null to unavailable', () => {
    expect(parseDurableDraftCohortEntitlement(null, CONTRACTOR_A)).toBeNull();
    expect(parseDurableDraftCohortEntitlement([], CONTRACTOR_A)).toBeNull();
    expect(parseDurableDraftCohortEntitlement([{ contractor_id: CONTRACTOR_A, can_use_durable_drafts: false }], CONTRACTOR_A))
      .toEqual({ contractor_id: CONTRACTOR_A, can_use_durable_drafts: false });
    expect(() => parseDurableDraftCohortEntitlement([{ contractor_id: CONTRACTOR_B, can_use_durable_drafts: true }], CONTRACTOR_A))
      .toThrow('DRAFT_COHORT_RESPONSE_INVALID');
    expect(() => parseDurableDraftCohortEntitlement([{ contractor_id: CONTRACTOR_A, can_use_durable_drafts: 'true' }], CONTRACTOR_A))
      .toThrow('DRAFT_COHORT_RESPONSE_INVALID');
    expect(() => parseDurableDraftCohortEntitlement([{
      contractor_id: CONTRACTOR_A,
      can_use_durable_drafts: true,
      billing_status: 'private',
    }], CONTRACTOR_A)).toThrow('DRAFT_COHORT_RESPONSE_INVALID');
    expect(() => parseDurableDraftCohortEntitlement([
      { contractor_id: CONTRACTOR_A, can_use_durable_drafts: true },
      { contractor_id: CONTRACTOR_A, can_use_durable_drafts: true },
    ], CONTRACTOR_A)).toThrow('DRAFT_COHORT_RESPONSE_INVALID');
  });

  test('rejects stale contractor and session state even when the entitlement was true', () => {
    expect(canSeeDurableDraftWorkflow({
      globalMasterEnabled: true,
      availability: resolvedAvailability(),
      activeContractorId: CONTRACTOR_B,
      activeSessionIdentity: SESSION_A,
      validContractorContext: true,
      demoPresentationActive: false,
    })).toBe(false);
    expect(canSeeDurableDraftWorkflow({
      globalMasterEnabled: true,
      availability: resolvedAvailability(),
      activeContractorId: CONTRACTOR_A,
      activeSessionIdentity: 'session-b',
      validContractorContext: true,
      demoPresentationActive: false,
    })).toBe(false);
  });

  test('contains no persistent storage or private Draft data contract', () => {
    const source = sourceFile('src/features/drafts/durableDraftCohortAvailability.ts');
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(source).not.toMatch(/privateNotes|scopeDescription|itemDescription|customerName|propertyAddress|serviceRequest/);
    expect(source).not.toMatch(/console\.(?:log|debug|info|warn|error)/);
  });
});

test.describe('durable Draft cohort rendered loading and race behavior', () => {
  test('does not call the RPC when the global master or contractor context is missing', async ({ page }) => {
    await installRenderedHarness(page, { globalMasterEnabled: false });
    await expect(page.getByTestId('surface')).toHaveText('legacy-jobs');
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(0);

    await installRenderedHarness(page, { contractorId: null });
    await expect(page.getByTestId('surface')).toHaveText('legacy-jobs');
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(0);
  });

  test('renders neutral loading then entitled durable UI without a legacy flash', async ({ page }) => {
    await installRenderedHarness(page);
    await expect(page.getByTestId('surface')).toHaveText('loading-jobs');
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(1);
    await page.evaluate(({ contractorA }) => {
      window.__durableCohortHarness.resolve(0, [{ contractor_id: contractorA, can_use_durable_drafts: true }]);
    }, { contractorA: CONTRACTOR_A });
    await expect(page.getByTestId('surface')).toHaveText('durable-work');
  });

  test('fails closed to legacy Jobs for false, missing, malformed, and RPC error responses', async ({ page }) => {
    const outcomes = [
      { data: [{ contractor_id: CONTRACTOR_A, can_use_durable_drafts: false }], error: null },
      { data: null, error: null },
      { data: [{ contractor_id: CONTRACTOR_B, can_use_durable_drafts: true }], error: null },
      { data: null, error: { message: 'private internal failure' } },
    ];
    for (const outcome of outcomes) {
      await installRenderedHarness(page);
      await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(1);
      await page.evaluate(({ data, error }) => window.__durableCohortHarness.resolve(0, data, error), outcome);
      await expect(page.getByTestId('surface')).toHaveText('legacy-jobs');
      await expect(page.locator('body')).not.toContainText('private internal failure');
    }
  });

  test('invalidates immediately on tenant switch and ignores the stale prior response', async ({ page }) => {
    await installRenderedHarness(page);
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(1);
    await page.evaluate(({ contractorB }) => {
      window.__durableCohortHarness.control.contractorId = contractorB;
      window.__durableCohortHarness.render();
    }, { contractorB: CONTRACTOR_B });
    await expect(page.getByTestId('surface')).toHaveText('loading-jobs');
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(2);
    await page.evaluate(({ contractorA }) => {
      window.__durableCohortHarness.resolve(0, [{ contractor_id: contractorA, can_use_durable_drafts: true }]);
    }, { contractorA: CONTRACTOR_A });
    await expect(page.getByTestId('surface')).toHaveText('loading-jobs');
    await page.evaluate(({ contractorB }) => {
      window.__durableCohortHarness.resolve(1, [{ contractor_id: contractorB, can_use_durable_drafts: false }]);
    }, { contractorB: CONTRACTOR_B });
    await expect(page.getByTestId('surface')).toHaveText('legacy-jobs');
  });

  test('invalidates on session change and does not update after unmount', async ({ page }) => {
    await installRenderedHarness(page);
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(1);
    await page.evaluate(() => {
      window.__durableCohortHarness.control.sessionIdentity = 'session-b';
      window.__durableCohortHarness.render();
    });
    await expect(page.getByTestId('surface')).toHaveText('loading-jobs');
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(2);
    await page.evaluate(() => window.__durableCohortHarness.unmount());
    await page.evaluate(({ contractorA }) => {
      window.__durableCohortHarness.resolve(1, [{ contractor_id: contractorA, can_use_durable_drafts: true }]);
    }, { contractorA: CONTRACTOR_A });
    await expect(page.locator('#cohort-test-root')).toBeEmpty();
  });

  test('refreshes only after the in-memory TTL on focus and fails closed without flashing', async ({ page }) => {
    await installRenderedHarness(page);
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(1);
    await page.evaluate(({ contractorA }) => {
      window.__durableCohortHarness.resolve(0, [{ contractor_id: contractorA, can_use_durable_drafts: true }]);
    }, { contractorA: CONTRACTOR_A });
    await expect(page.getByTestId('surface')).toHaveText('durable-work');

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect(await page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(1);
    await page.evaluate(() => {
      window.__durableCohortHarness.control.now = 101;
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(2);
    await expect(page.getByTestId('surface')).toHaveText('durable-work');
    await page.evaluate(() => window.__durableCohortHarness.resolve(1, null, { message: 'unavailable' }));
    await expect(page.getByTestId('surface')).toHaveText('legacy-jobs');
  });

  test('refreshes stale state when a visible document emits visibilitychange', async ({ page }) => {
    await installRenderedHarness(page);
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(1);
    await page.evaluate(({ contractorA }) => {
      window.__durableCohortHarness.resolve(0, [{ contractor_id: contractorA, can_use_durable_drafts: false }]);
    }, { contractorA: CONTRACTOR_A });
    await expect(page.getByTestId('surface')).toHaveText('legacy-jobs');
    await page.evaluate(() => {
      window.__durableCohortHarness.control.now = 101;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => window.__durableCohortHarness.control.requests.length)).toBe(2);
  });
});

test.describe('durable Draft cohort App integration boundaries', () => {
  test('uses one effective decision for Work, list, composer, targets, and capabilities', () => {
    const app = sourceFile('src/App.tsx');
    expect(app).toContain('const globalDurableDraftMasterEnabled = isGlobalDurableDraftMasterEnabled({');
    expect(app).toContain('const sharedDraftComposerEnabled = canSeeDurableDraftWorkflow({');
    expect(app).toContain('useDurableDraftCohortAvailability({');
    expect(app).toContain("data-testid=\"durable-draft-cohort-loading\"");
    expect(app).toContain("data-testid=\"durable-draft-cohort-list-loading\"");
    expect(app).toContain("data-testid=\"durable-draft-cohort-editor-loading\"");
    expect(app).toContain("contractorJobsView === 'overview' && !durableDraftCohortLoading && !sharedDraftComposerEnabled");
    expect(app).toContain('if (!sharedDraftComposerEnabled || !supabase)');
    expect(app).toContain('if (entitlementDefinitivelyUnavailable) setDurableDraftOpenTarget(null);');
    expect(app).toContain('launchEnabled={sharedDraftComposerEnabled && !SERVSYNC_DEMO_PRESENTATION_MODE}');
  });

  test('keeps cohort presentation separate from existing persistence and launch authority', () => {
    const app = sourceFile('src/App.tsx');
    expect(app).toContain('capabilities={durableDraftCapabilities}');
    expect(app).toContain('canStartDraft={!SERVSYNC_DEMO_PRESENTATION_MODE && (sharedDraftComposerEnabled');
    expect(app).toContain('? durableDraftCapabilities.canPersistDraft');
    expect(app).not.toMatch(/durable_draft_beta_enabled/);
  });

  test('keeps homeowner and platform-admin dashboards outside contractor entitlement loading', () => {
    const app = sourceFile('src/App.tsx');
    const homeowner = app.slice(app.indexOf('function HomeownerDashboard'), app.indexOf('function ContractorDashboard'));
    const platformAdmin = app.slice(app.indexOf('function PlatformAdminDashboard'), app.indexOf('function CalendarView'));
    expect(homeowner).not.toContain('useDurableDraftCohortAvailability');
    expect(homeowner).not.toContain('servsync_current_contractor_durable_draft_entitlement');
    expect(platformAdmin).not.toContain('useDurableDraftCohortAvailability');
    expect(platformAdmin).not.toContain('servsync_current_contractor_durable_draft_entitlement');
  });
});

declare global {
  interface Window {
    __durableCohortHarness: any;
  }
}
