import { expect, test, type Page } from '@playwright/test';
import {
  createMarketingDirectionsAdapter,
  type MarketingDirection,
  type MarketingDirectionsAdapterError,
} from '../../src/features/marketing/marketingDirections';

const overview = { metrics: [], approvals: [], upcoming: [], recommendedNextAction: null };
const planId = '4e390d96-03f0-4342-9a13-3e8119383024';
const now = '2026-08-11T03:06:05.768Z';

function rawPlanItem(index: number) {
  const topics = ['Invoices', 'Contractor discovery and profiles', 'Deposits and manual payments', 'Home History', 'Jobs', 'Product demonstrations'];
  const roles = ['contractor_benefit', 'local_contractor_connection', 'feature_highlight', 'homeowner_benefit', 'problem_solution_post', 'short_video_concept'];
  return {
    audience: index === 4 ? 'Homeowners' : 'Small contractors',
    topic: topics[index - 1],
    direction: `Accepted Plan intent for ${topics[index - 1]} with enough detail to preserve the exact planning context.`,
    rationale: `Accepted Plan rationale for ${topics[index - 1]}.`,
    content_roles: [roles[index - 1]],
  };
}

function rawDirection(index: number, status: 'draft' | 'approved' = 'draft') {
  const source = rawPlanItem(index);
  return {
    direction_id: `48000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    workspace_key: 'servsync_internal',
    source_plan_id: planId,
    source_plan_revision: 3,
    source_plan_item_index: index,
    source_plan_item: source,
    direction_mode: 'recommended',
    owner_input: null,
    audience_key: index === 4 ? 'homeowners' : 'small_contractors',
    topic: source.topic,
    content_role: source.content_roles[0],
    objective: `Develop a specific and grounded objective for ${source.topic} that supports the accepted planning intent.`,
    statement: `Focus this Direction on one concrete ${source.topic} interaction, with enough detail to guide later content without turning the Direction into finished copy or expanding beyond current ServSync product truth.`,
    central_message: `Keep the ${source.topic} story concrete, useful, and bounded to current ServSync behavior.`,
    supporting_points: ['Show one recognizable product interaction.', 'Keep the customer and work context clear.'],
    cautions: ['Do not claim unsupported automation, results, or integrations.'],
    corrected_assumptions: [],
    recommendation_rationale: `This Direction develops accepted Plan item ${index} into a specific story while preserving the approved audience and topic.`,
    truth_pack_version: 'servsync-marketing-truth-v3',
    truth_capability_keys: [index === 6 ? 'service_requests' : index === 4 ? 'home_history' : 'invoices'],
    preparation_source: 'codex_assisted',
    direction_status: status,
    revision_number: status === 'approved' ? 2 : 1,
    created_at: now,
    updated_at: now,
    approved_at: status === 'approved' ? now : null,
  };
}

function rawState(empty = false) {
  return {
    accepted_plan: { plan_id: planId, title: 'ServSync marketing plan', revision_number: 3, item_count: 6, accepted_at: now },
    directions: empty ? [] : Array.from({ length: 6 }, (_, index) => rawDirection(index + 1)),
  };
}

const planningState = {
  profile: {
    profile_id: '00000000-0000-4000-8000-000000000038',
    workspace_key: 'servsync_internal', workspace_kind: 'internal', contractor_id: null,
    business_name: 'ServSync', business_summary: 'ServSync keeps service work organized for homeowners and small contractors.',
    audience_segments: ['Small contractors', 'Homeowners'], service_focus: ['Estimates', 'Jobs', 'Invoices'],
    primary_goal: 'Increase qualified contractor awareness.', secondary_goals: ['Educate homeowners'], geographic_focus: null,
    tone_style: 'Practical and approachable', offers: [], preferred_channels: ['social', 'video'],
    emphasized_topics: ['Invoices', 'Jobs'], avoided_topics: [], owner_notes: '', profile_status: 'ready', profile_version: 2, updated_at: now,
  },
  plan: {
    plan_id: planId, workspace_key: 'servsync_internal', plan_mode: 'recommended', plan_status: 'accepted', title: 'ServSync marketing plan',
    planning_start: '2026-08-11', planning_end: '2026-09-10', owner_direction: null, profile_version: 2,
    recent_content_context: { window_limit: 20, item_count: 0, items: [], recommendation_contract_version: 3 },
    items: Array.from({ length: 6 }, (_, index) => rawPlanItem(index + 1)), revision_number: 3, created_at: now, updated_at: now, accepted_at: now,
  },
  recent_content: { window_limit: 20, item_count: 0, items: [] },
};

async function installHarness(page: Page, options: { role?: 'platform_admin' | 'contractor' | 'homeowner'; empty?: boolean; error?: boolean } = {}) {
  await page.goto('/');
  await page.evaluate(async ({ overviewValue, planningValue, directionsValue, roleValue, errorValue, nowValue }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const module = await dynamicImport('/src/features/marketing/MarketingWorkspace.tsx');
    const Workspace = module.InternalMarketingWorkspace as (...args: unknown[]) => unknown;
    const state = structuredClone(directionsValue);
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === 'servsync_list_internal_marketing_content') return { data: [], error: null };
        if (name === 'servsync_get_internal_marketing_planning') return { data: structuredClone(planningValue), error: null };
        if (name === 'servsync_get_internal_marketing_directions') {
          return errorValue ? { data: null, error: { message: 'private database detail' } } : { data: structuredClone(state), error: null };
        }
        const item = state.directions.find((direction: Record<string, unknown>) => direction.direction_id === args.p_direction_id);
        if (!item) return { data: null, error: { code: 'P0002', message: 'Marketing Direction not found.' } };
        if (name === 'servsync_update_internal_marketing_direction') {
          Object.assign(item, {
            objective: args.p_objective,
            statement: args.p_statement,
            central_message: args.p_central_message,
            supporting_points: args.p_supporting_points,
            cautions: args.p_cautions,
            corrected_assumptions: args.p_corrected_assumptions,
            recommendation_rationale: args.p_recommendation_rationale,
            revision_number: Number(item.revision_number) + 1,
          });
          return { data: { direction_id: item.direction_id, revision_number: item.revision_number, status: item.direction_status }, error: null };
        }
        if (name === 'servsync_approve_internal_marketing_direction') {
          Object.assign(item, { direction_status: 'approved', revision_number: Number(item.revision_number) + 1, approved_at: nowValue });
          return { data: { direction_id: item.direction_id, revision_number: item.revision_number, status: item.direction_status }, error: null };
        }
        return { data: null, error: { message: 'Unexpected RPC' } };
      },
    };
    Object.assign(window, { __marketingDirectionCalls: calls });
    document.body.innerHTML = '<main class="mx-auto max-w-6xl bg-slate-50 p-4"><div id="marketing-test-root"></div></main>';
    createRoot(document.getElementById('marketing-test-root') as HTMLElement).render(
      React.createElement(Workspace, { role: roleValue, overview: overviewValue, client }),
    );
  }, {
    overviewValue: overview,
    planningValue: planningState,
    directionsValue: rawState(options.empty),
    roleValue: options.role ?? 'platform_admin',
    errorValue: options.error ?? false,
    nowValue: now,
  });
}

async function openDirections(page: Page) {
  await page.getByTestId('marketing-nav-settings').click();
  await page.getByRole('tab', { name: 'Directions' }).click();
}

test.describe('accepted Plan Marketing Directions', () => {
  test('adapter parses bounded state and protects server-owned identity', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const adapter = createMarketingDirectionsAdapter({ rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'servsync_get_internal_marketing_directions') return { data: rawState(), error: null };
      return { data: { direction_id: rawDirection(1).direction_id, revision_number: 2, status: 'draft' }, error: null };
    } });
    const state = await adapter.get();
    expect(state.directions).toHaveLength(6);
    await adapter.update(state.directions[0]);
    expect(calls[1].args).not.toHaveProperty('workspace_id');
    expect(calls[1].args).not.toHaveProperty('source_plan_id');
    expect(calls[1].args).not.toHaveProperty('truth_pack_version');

    const unauthorized = createMarketingDirectionsAdapter({ rpc: async () => ({ data: null, error: { code: '42501', message: 'Not authorized.' } }) });
    await expect(unauthorized.get()).rejects.toMatchObject({ kind: 'unauthorized' });
    const malformedPayload = rawState();
    malformedPayload.directions[0].workspace_key = 'contractor_workspace';
    const malformed = createMarketingDirectionsAdapter({ rpc: async () => ({ data: malformedPayload, error: null }) });
    await expect(malformed.get()).rejects.toMatchObject({ kind: 'malformed' });
    const stale = createMarketingDirectionsAdapter({ rpc: async () => ({ data: null, error: { message: 'Marketing Direction changed; reload and try again.' } }) });
    await expect(stale.update(state.directions[0])).rejects.toMatchObject({ kind: 'stale' });
    let ambiguousCalls = 0;
    const ambiguous = createMarketingDirectionsAdapter({ rpc: async () => { ambiguousCalls += 1; throw new Error('network'); } });
    await expect(ambiguous.approve(state.directions[0])).rejects.toEqual(expect.objectContaining<Partial<MarketingDirectionsAdapterError>>({ kind: 'ambiguous' }));
    expect(ambiguousCalls).toBe(1);
  });

  test('platform admin can review six source-bound drafts, edit, and approve without content actions', async ({ page }) => {
    await installHarness(page);
    await openDirections(page);
    await expect(page.getByTestId('marketing-directions-workspace')).toBeVisible();
    await expect(page.getByTestId('marketing-direction-item-6')).toBeVisible();
    await expect(page.getByTestId('marketing-direction-detail')).toContainText('Accepted Plan intent');
    await expect(page.getByTestId('marketing-direction-detail')).toContainText('servsync-marketing-truth-v3');

    await page.getByLabel('Central message').fill('A clearer invoice story remains tied to the customer and completed service work.');
    await expect(page.getByRole('button', { name: 'Approve Direction' })).toBeDisabled();
    await expect(page.getByText('Save this draft before approving it.')).toBeVisible();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText('Marketing Direction saved');
    await expect(page.getByTestId('marketing-direction-detail')).toContainText('Revision 2');
    await expect(page.getByRole('button', { name: 'Approve Direction' })).toBeEnabled();
    await page.getByRole('button', { name: 'Approve Direction' }).click();
    await expect(page.getByRole('status')).toContainText('No content was created');
    await expect(page.getByTestId('marketing-direction-detail')).toContainText('Approved');
    await expect(page.getByRole('textbox', { name: 'Direction', exact: true })).toBeDisabled();

    const calls = await page.evaluate(() => (window as unknown as { __marketingDirectionCalls: Array<{ name: string }> }).__marketingDirectionCalls);
    expect(calls.some(call => call.name === 'servsync_update_internal_marketing_direction')).toBe(true);
    expect(calls.some(call => call.name === 'servsync_approve_internal_marketing_direction')).toBe(true);
    expect(calls.some(call => /content|package|publish|schedule/.test(call.name)
      && !['servsync_list_internal_marketing_content', 'servsync_get_internal_marketing_publishing'].includes(call.name))).toBe(false);
  });

  test('empty, error, and unauthorized states fail closed', async ({ page }) => {
    await installHarness(page, { empty: true });
    await openDirections(page);
    await expect(page.getByTestId('marketing-directions-empty')).toContainText('No Directions prepared');

    await installHarness(page, { error: true });
    await openDirections(page);
    await expect(page.getByRole('alert')).toContainText('ServSync could not load Marketing Directions');
    await expect(page.getByRole('alert')).not.toContainText('private database detail');

    for (const role of ['contractor', 'homeowner'] as const) {
      await installHarness(page, { role });
      await expect(page.getByTestId('marketing-workspace')).toHaveCount(0);
    }
  });

  test('Directions remain usable at 390x844 without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installHarness(page);
    await openDirections(page);
    await page.getByTestId('marketing-direction-item-6').click();
    await expect(page.getByTestId('marketing-direction-detail')).toContainText('Product demonstrations');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
