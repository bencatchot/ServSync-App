import { expect, test, type Page } from '@playwright/test';
import type { ComponentType } from 'react';
type Visit = { id: string; agreement_id: string; ordinal: number; due_on: string | null; job_id: string | null; job_name: string | null; job_status: string | null; report_ready: boolean; shared_with_homeowner: boolean; version: number };
type Call = { name: string; args: Record<string, unknown> };
type AuthCallback = (event: string, session: { user: { id: string } }) => void;
type FixtureState = { actor: string; authCallback: AuthCallback | null; calls: Call[]; opened: string; draft: string; visits: Visit[]; failAfterSetup: boolean; delay: boolean; failRead: boolean };
declare global { interface Window { planTest: FixtureState } }


async function mount(page: Page, mode = 'contractor') {
  await page.goto('/');
  await page.getByRole('heading', { name: /Home service, in sync.|Supabase is not connected/ }).waitFor();
  await page.evaluate(async mode => {
    const load = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await load('/node_modules/.vite/deps/react.js')).default as typeof import('react');
    const { createRoot } = (await load('/node_modules/.vite/deps/react-dom_client.js')).default as typeof import('react-dom/client');
    const { ServicePlanVisits, HomeownerPlanVisits, ServicePlanVisitAttention } = await load('/src/features/serviceAgreements/PlanVisits.tsx');
    const state: FixtureState = {
      actor: mode === 'homeowner' ? 'homeowner' : 'owner', authCallback: null, calls: [], opened: '', draft: '',
      visits: [], failAfterSetup: mode === 'lost-response', delay: false, failRead: false,
    };
    const plan = { id: 'plan', contractor_id: 'contractor', homeowner_user_id: 'homeowner', home_id: 'home', title: 'Fictional two-visit plan', status: 'active', included_visit_count: mode === 'unknown' || mode === 'lost-response' ? null : 2 };
    const jobs = [{ id: 'job', name: 'Fictional service Job', contractor_id: 'contractor', homeowner_user_id: 'homeowner', home_id: 'home', job_status: 'in_progress', status: 'draft' }, { id: 'job2', name: 'Replacement Job', contractor_id: 'contractor', homeowner_user_id: 'homeowner', home_id: 'home', job_status: 'scheduled', status: 'draft' }];
    const newVisit = (n: number, id = `visit-${n}`) => ({ id, agreement_id: 'plan', ordinal: n, due_on: null, job_id: null, job_name: null, job_status: null, report_ready: false, shared_with_homeowner: false, version: 1 });
    if (!['unknown','lost-response'].includes(mode)) state.visits = [newVisit(1),newVisit(2)];
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: state.actor } } }, error: null }), onAuthStateChange: (callback: AuthCallback) => { state.authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; } },
      from: () => { type Query = { select: () => Query; eq: () => Query; order: () => Promise<{ data: typeof plan[]; error: null }> }; const q: Query = { select: () => q, eq: () => q, order: async () => ({ data: [plan], error: null }) }; return q; },
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.calls.push({ name, args });
        if (name === 'servsync_get_plan_visits') {
          if (state.failRead) return { data: null, error: { message: 'Network unavailable' } };
          const data = structuredClone(state.visits.filter(v => mode !== 'homeowner' || v.shared_with_homeowner));
          if (state.delay) await new Promise(resolve => setTimeout(resolve, 200));
          return { data, error: null };
        }
        if (name === 'servsync_setup_plan_visits') {
          if (!state.visits.some(v => v.id === args.p_action_id)) state.visits.push(newVisit(state.visits.length + 1, String(args.p_action_id)));
          if (state.failAfterSetup) { state.failAfterSetup = false; return { error: { message: 'Response interrupted; retry the same action.' } }; }
          return { error: null };
        }
        const v = state.visits.find(v => v.id === args.p_visit_id)!;
        if (v.version !== args.p_expected_version) return { error: { message: 'This visit changed. Reload before editing.' } };
        Object.assign(v, { due_on: args.p_due_on, job_id: args.p_job_id, shared_with_homeowner: args.p_shared, job_status: args.p_job_id ? jobs.find(j => j.id === args.p_job_id)?.job_status : null, version: v.version + 1 });
        return { error: null };
      },
    };
    Object.assign(window, { planTest: state });
    const root = createRoot(document.getElementById('root')!);
    const common = { planLabel: () => 'Fictional homeowner · Shared test property', client, actorId: state.actor, contractorId: 'contractor', jobs, onOpenJob: (job: { id: string }) => { state.opened = job.id; }, onStartDraft: (p: { home_id: string }) => { state.draft = p.home_id; } };
    const Component = mode === 'homeowner' ? HomeownerPlanVisits : mode === 'attention' ? ServicePlanVisitAttention : ServicePlanVisits;
    root.render(React.createElement(Component as ComponentType<Record<string, unknown>>, { ...common, plan, onOpenPlans: () => { state.opened = 'plans'; }, disabledReason: mode === 'readonly' ? 'Account is read-only.' : undefined }));
  }, mode);
}
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('servsync:plan-visits-changed')));
const change = (page: Page, values: Record<string, unknown>) => page.evaluate(values => Object.assign(window.planTest.visits[0], values), values);

for (const width of [1440, 390]) test.describe(`Plan visits ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test('saves due date, explicit sharing and Job link; opens existing workflows without submission', async ({ page }) => {
    await mount(page);
    await expect(page.getByText('0 of 2 included visits completed')).toBeVisible();
    await page.getByLabel('Visit 1 due date').fill('2026-12-20');
    await page.getByLabel('Visit 1 linked Job').selectOption('job');
    await page.getByRole('form', { name: 'Visit 1', exact: true }).getByRole('checkbox').check();
    await page.getByRole('form', { name: 'Visit 1', exact: true }).getByRole('button', { name: 'Save visit' }).click();
    await expect(page.getByRole('button', { name: 'Open Job / schedule' })).toBeVisible();
    await page.getByRole('button', { name: 'Open Job / schedule' }).click();
    await page.getByRole('button', { name: 'Start New Draft for this property' }).click();
    expect(await page.evaluate(() => [window.planTest.opened, window.planTest.draft])).toEqual(['job','home']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/servsync-plan-visits-${width}.png`, fullPage: true });
  });
  test('cancel, completion and reopen update reload counts; correction is explicit', async ({ page }) => {
    await mount(page);
    for (const [status, count] of [['scheduled',0],['cancelled',0],['completed',1],['in_progress',0]] as const) {
      await change(page, { job_id: 'job', job_status: status }); await refresh(page);
      await expect(page.getByText(`${count} of 2 included visits completed`)).toBeVisible();
    }
    await change(page, { job_status: 'completed' }); await refresh(page);
    await expect(page.getByLabel('Visit 1 linked Job')).toBeDisabled();
    await page.getByLabel(/Correct this completed visit/).check();
    await page.getByLabel('Visit 1 linked Job').selectOption('job2');
    await page.getByRole('form', { name: 'Visit 1', exact: true }).getByRole('button', { name: 'Save visit' }).click();
    await expect(page.getByText('0 of 2 included visits completed')).toBeVisible();
    expect(await page.evaluate(() => window.planTest.calls.filter((c: Call) => c.name === 'servsync_update_plan_visit').at(-1)!.args.p_confirm_correction)).toBe(true);
  });
  test('focus refresh preserves edits and detects a conflicting newer version', async ({ page }) => {
    await mount(page);
    await page.getByLabel('Visit 1 due date').fill('2026-12-21');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByLabel('Visit 1 due date')).toHaveValue('2026-12-21');
    await page.evaluate(() => { window.planTest.failRead = true; window.dispatchEvent(new Event('focus')); });
    await expect(page.getByRole('alert')).toContainText('could not be refreshed');
    await expect(page.getByLabel('Visit 1 due date')).toHaveValue('2026-12-21');
    await page.evaluate(() => { window.planTest.failRead = false; });
    await change(page, { version: 2, due_on: '2026-12-22' }); await refresh(page);
    await expect(page.getByText(/Your edits are kept/)).toBeVisible();
    await expect(page.getByLabel('Visit 1 due date')).toHaveValue('2026-12-21');
    await page.getByRole('button', { name: 'Discard edits' }).click();
    await expect(page.getByLabel('Visit 1 due date')).toHaveValue('2026-12-22');
  });
  test('lost setup response retries same identity, unknown allowance stays unspecified', async ({ page }) => {
    await mount(page, 'lost-response');
    await page.getByRole('button', { name: 'Add a tracked visit' }).click();
    await expect(page.getByRole('alert')).toContainText('Response interrupted');
    await page.getByRole('button', { name: 'Add a tracked visit' }).click();
    await expect(page.getByRole('form')).toHaveCount(1);
    await expect(page.getByText(/No visit allowance specified/)).toBeVisible();
    const ids = await page.evaluate(() => window.planTest.calls.filter((c: Call) => c.name === 'servsync_setup_plan_visits').map((c: Call) => c.args.p_action_id));
    expect(ids[0]).toBe(ids[1]);
  });
  test('account change clears results and focus cannot reload previous scope', async ({ page }) => {
    await mount(page);
    await expect(page.getByRole('form')).toHaveCount(2);
    await page.evaluate(() => { const s=window.planTest; s.actor='other'; s.authCallback?.('SIGNED_IN',{ user:{ id:'other' } }); window.dispatchEvent(new Event('focus')); });
    await expect(page.getByRole('form')).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeVisible();
  });
  test('read-only accounts cannot set up or save visits', async ({ page }) => {
    await mount(page, 'readonly');
    await expect(page.getByText('Account is read-only.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save visit' })).toHaveCount(0);
    await expect(page.getByLabel('Visit 1 due date')).toBeDisabled();
  });
  test('homeowner receives only shared progress without Job/report or edit actions', async ({ page }) => {
    await mount(page, 'homeowner');
    await expect(page.getByText('Your contractor has not shared visit progress here.')).toBeVisible();
    await change(page, { shared_with_homeowner: true, job_status: 'completed', due_on: '2026-12-01' }); await refresh(page);
    await expect(page.getByText(/1 shared visit completed/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Job|Save visit|Set up/ })).toHaveCount(0);
  });
  test('attention shows overdue visits and excludes completed visits', async ({ page }) => {
    await mount(page, 'attention');
    await change(page, { due_on: '2020-01-01' }); await refresh(page);
    await expect(page.getByText(/Overdue/)).toBeVisible();
    await change(page, { job_status: 'completed' }); await refresh(page);
    await expect(page.getByRole('region', { name: 'Plan visits needing attention' })).toHaveCount(0);
  });
});
