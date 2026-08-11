import { expect, test, type Page } from '@playwright/test';
import {
  MARKETING_RECOMMENDATION_CONTRACT_VERSION,
  buildRecommendedMarketingPlan,
  createMarketingPlanningAdapter,
  type MarketingBusinessProfile,
  type MarketingRecentContentContext,
} from '../../src/features/marketing/marketingPlanning';
import {
  canonicalMarketingAudience,
  canonicalMarketingTopic,
} from '../../src/features/marketing/marketingTaxonomy';
import {
  operationalPlannerV3Profile,
  operationalPlannerV3RecentContent,
} from '../fixtures/marketingPlannerV3Operational';

const overview = {
  metrics: [],
  approvals: [],
  upcoming: [],
  recommendedNextAction: null,
};

const profile: MarketingBusinessProfile = {
  id: '00000000-0000-4000-8000-000000000038',
  workspaceKey: 'servsync_internal',
  workspaceKind: 'internal',
  contractorId: null,
  businessName: 'ServSync',
  businessSummary: 'ServSync helps homeowners and small contractors keep service work organized.',
  audienceSegments: ['Small contractors', 'Homeowners'],
  serviceFocus: ['Contractor software', 'Homeowner connections'],
  primaryGoal: 'Increase qualified awareness of ServSync.',
  secondaryGoals: ['Educate contractors'],
  geographicFocus: null,
  toneStyle: 'Practical and approachable.',
  offers: [],
  preferredChannels: ['social', 'video'],
  emphasizedTopics: ['Estimates and approvals', 'Home History', 'Customer requests'],
  avoidedTopics: ['Unsupported metrics'],
  ownerNotes: 'Internal strategy only.',
  status: 'ready',
  version: 1,
  updatedAt: '2026-08-10T12:00:00.000Z',
};

const recent: MarketingRecentContentContext = {
  windowLimit: 20,
  itemCount: 1,
  items: [{
    id: '42000000-0000-4000-8000-000000000001',
    title: 'Estimates and approvals for contractors',
    status: 'approved',
    intendedAudience: 'Small contractors',
    contentRole: 'educational_post',
    updatedAt: '2026-08-10T12:00:00.000Z',
  }],
};

function rawProfile(value = profile) {
  return {
    profile_id: value.id,
    workspace_key: value.workspaceKey,
    workspace_kind: value.workspaceKind,
    contractor_id: value.contractorId,
    business_name: value.businessName,
    business_summary: value.businessSummary,
    audience_segments: value.audienceSegments,
    service_focus: value.serviceFocus,
    primary_goal: value.primaryGoal,
    secondary_goals: value.secondaryGoals,
    geographic_focus: value.geographicFocus,
    tone_style: value.toneStyle,
    offers: value.offers,
    preferred_channels: value.preferredChannels,
    emphasized_topics: value.emphasizedTopics,
    avoided_topics: value.avoidedTopics,
    owner_notes: value.ownerNotes,
    profile_status: value.status,
    profile_version: value.version,
    updated_at: value.updatedAt,
  };
}

function rawRecent(value = recent) {
  return {
    window_limit: value.windowLimit,
    item_count: value.itemCount,
    items: value.items.map(item => ({
      id: item.id,
      title: item.title,
      status: item.status,
      intended_audience: item.intendedAudience,
      content_role: item.contentRole,
      updated_at: item.updatedAt,
    })),
    ...(value.recommendationContractVersion === undefined
      ? {}
      : { recommendation_contract_version: value.recommendationContractVersion }),
  };
}

async function installHarness(page: Page, role = 'platform_admin') {
  await page.goto('/');
  await page.evaluate(async ({ overviewValue, profileValue, recentValue, roleValue }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const module = await dynamicImport('/src/features/marketing/MarketingWorkspace.tsx');
    const Workspace = module.InternalMarketingWorkspace as (...args: unknown[]) => unknown;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const state: { profile: Record<string, unknown>; plan: Record<string, unknown> | null; recent_content: Record<string, unknown> } = {
      profile: structuredClone(profileValue),
      plan: null,
      recent_content: structuredClone(recentValue),
    };
    const now = '2026-08-10T13:00:00.000Z';
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === 'servsync_list_internal_marketing_content') return { data: [], error: null };
        if (name === 'servsync_get_internal_marketing_planning') return { data: structuredClone(state), error: null };
        if (name === 'servsync_get_internal_marketing_directions') return { data: { accepted_plan: null, directions: [] }, error: null };
        if (name === 'servsync_update_internal_marketing_profile') {
          state.profile = {
            ...state.profile,
            business_summary: args.p_business_summary,
            audience_segments: args.p_audience_segments,
            service_focus: args.p_service_focus,
            primary_goal: args.p_primary_goal,
            secondary_goals: args.p_secondary_goals,
            geographic_focus: args.p_geographic_focus,
            tone_style: args.p_tone_style,
            offers: args.p_offers,
            preferred_channels: args.p_preferred_channels,
            emphasized_topics: args.p_emphasized_topics,
            avoided_topics: args.p_avoided_topics,
            owner_notes: args.p_owner_notes,
            profile_version: Number(state.profile.profile_version) + 1,
            updated_at: now,
          };
          return { data: { profile_id: state.profile.profile_id, revision_number: state.profile.profile_version }, error: null };
        }
        if (name === 'servsync_create_internal_marketing_plan' || name === 'servsync_create_internal_marketing_plan_v3') {
          state.plan = {
            plan_id: '42000000-0000-4000-8000-000000000010',
            workspace_key: 'servsync_internal',
            plan_mode: args.p_mode,
            plan_status: 'draft',
            title: args.p_title,
            planning_start: args.p_planning_start,
            planning_end: args.p_planning_end,
            owner_direction: args.p_owner_direction,
            profile_version: args.p_profile_version,
            recent_content_context: {
              ...structuredClone(state.recent_content),
              ...(args.p_mode === 'recommended'
                ? { recommendation_contract_version: args.p_recommendation_contract_version ?? 1 }
                : {}),
            },
            items: args.p_items,
            revision_number: 1,
            created_at: now,
            updated_at: now,
            accepted_at: null,
          };
          return { data: { plan_id: state.plan.plan_id, revision_number: 1 }, error: null };
        }
        if (name === 'servsync_update_internal_marketing_plan' && state.plan) {
          state.plan = {
            ...state.plan,
            title: args.p_title,
            planning_start: args.p_planning_start,
            planning_end: args.p_planning_end,
            owner_direction: args.p_owner_direction,
            items: args.p_items,
            revision_number: Number(state.plan.revision_number) + 1,
            updated_at: now,
          };
          return { data: { plan_id: state.plan.plan_id, revision_number: state.plan.revision_number }, error: null };
        }
        if (name === 'servsync_accept_internal_marketing_plan' && state.plan) {
          state.plan = {
            ...state.plan,
            plan_status: 'accepted',
            revision_number: Number(state.plan.revision_number) + 1,
            accepted_at: now,
            updated_at: now,
          };
          return { data: { plan_id: state.plan.plan_id, revision_number: state.plan.revision_number }, error: null };
        }
        return { data: null, error: { message: 'Unexpected RPC' } };
      },
    };
    Object.assign(window, { __marketingPlanningCalls: calls });
    document.body.innerHTML = '<main class="mx-auto max-w-6xl bg-slate-50 p-4"><div id="marketing-test-root"></div></main>';
    createRoot(document.getElementById('marketing-test-root') as HTMLElement).render(
      React.createElement(Workspace, { role: roleValue, overview: overviewValue, client }),
    );
  }, { overviewValue: overview, profileValue: rawProfile(), recentValue: rawRecent(), roleValue: role });
}

test.describe('internal Business Marketing Profile and Plan', () => {
  test('canonical taxonomy resolves supported label/code variants without collapsing conflicts', () => {
    for (const value of ['HVAC', 'HVAC contractors', 'hvac_contractors', 'hVaC CoNtRaCtOrS']) {
      expect(canonicalMarketingAudience(value).key).toBe('hvac_contractors');
    }
    expect(canonicalMarketingAudience('Plumbing contractors').key).toBe('plumbers');
    expect(canonicalMarketingAudience('Carpentry').key).toBe('carpentry_contractors');
    expect(canonicalMarketingAudience('Pressure washing').key).toBe('pressure_washing_contractors');
    expect(canonicalMarketingAudience('Property managers').key).not.toBe(canonicalMarketingAudience('Homeowners').key);

    for (const value of ['estimate', 'estimates', 'Estimate approvals', 'Estimates and approvals']) {
      expect(canonicalMarketingTopic(value).key).toBe('estimates_and_approvals');
    }
    expect(canonicalMarketingTopic('Customer request').key).toBe('customer_requests');
    expect(canonicalMarketingTopic('Active jobs').key).toBe('jobs');
    expect(canonicalMarketingTopic('Estimate templates').key).not.toBe(canonicalMarketingTopic('Invoices').key);
  });

  test('planner v3 prioritizes coherent ServSync relevance before audience uniqueness', () => {
    const servSyncPlan = buildRecommendedMarketingPlan(
      operationalPlannerV3Profile,
      operationalPlannerV3RecentContent,
    );

    expect(servSyncPlan).toHaveLength(6);
    const audienceKeys = servSyncPlan.map(item => canonicalMarketingAudience(item.audience).key);
    expect(audienceKeys.filter(key => key === 'small_contractors').length).toBeGreaterThanOrEqual(3);
    expect(new Set(audienceKeys)).toEqual(new Set(['small_contractors', 'homeowners']));
    expect(servSyncPlan.map(item => canonicalMarketingAudience(item.audience).kind)).toContain('homeowner');
    expect(new Set(servSyncPlan.map(item => canonicalMarketingTopic(item.topic).key)).size).toBeGreaterThan(4);
    expect(servSyncPlan.every(item => item.direction.includes('ServSync'))).toBe(true);
    expect(servSyncPlan.some(item => /practical contractor and homeowner problems|trade-specific examples/i.test(item.topic))).toBe(false);
    expect(servSyncPlan.some(item => item.contentRoles.includes('feature_announcement'))).toBe(false);

    const discovery = servSyncPlan.find(item => canonicalMarketingTopic(item.topic).key === 'contractor_discovery_profiles');
    expect(discovery?.direction).toContain('without claiming ranking, credential verification, or lead outcomes');
    expect(discovery?.direction).not.toMatch(/guarantee/i);

    const communication = servSyncPlan.find(item => canonicalMarketingTopic(item.topic).key === 'customer_communication');
    expect(communication?.rationale).toContain('related recent coverage exists');
    expect(communication?.rationale).not.toContain('recent window does not cover');

    const demonstration = servSyncPlan.find(item => canonicalMarketingTopic(item.topic).key === 'product_demonstrations');
    expect(demonstration?.direction).toMatch(/product demonstration about (Customer requests|Estimates and approvals|Jobs|Invoices|Customer communication|Home History|Secure document links|Connected homeowner relationships):/);
    expect(demonstration?.direction).not.toContain('demonstrate one current product interaction');
  });

  test('product demonstrations resolve from eligible profile interactions or yield to stronger topics', () => {
    const withSpecificOptions = buildRecommendedMarketingPlan({
      ...profile,
      audienceSegments: ['Small contractors'],
      serviceFocus: ['Product demonstrations', 'Customer requests'],
      emphasizedTopics: ['Product demonstrations', 'Customer requests', 'Invoices', 'Jobs', 'Home History'],
      primaryGoal: 'Increase contractor signups.',
    }, { windowLimit: 20, itemCount: 0, items: [] });
    const demonstration = withSpecificOptions.find(item => canonicalMarketingTopic(item.topic).key === 'product_demonstrations');
    expect(demonstration?.direction).toMatch(/product demonstration about (Customer requests|Invoices|Jobs|Home History):/);

    const withoutSpecificOptions = buildRecommendedMarketingPlan({
      ...profile,
      audienceSegments: ['Small contractors'],
      serviceFocus: ['Product demonstrations', 'Seasonal campaign planning'],
      emphasizedTopics: ['Product demonstrations', 'Local content calendar', 'Service business education', 'Owner marketing priorities', 'Brand awareness'],
      primaryGoal: 'Increase contractor signups.',
    }, { windowLimit: 20, itemCount: 0, items: [] });
    expect(withoutSpecificOptions.some(item => canonicalMarketingTopic(item.topic).key === 'product_demonstrations')).toBe(false);
    expect(withoutSpecificOptions.every(item => !item.direction.includes('demonstrate one current product interaction'))).toBe(true);
  });

  test('trade audiences require actual profile relevance instead of unused-audience novelty', () => {
    const base = {
      ...profile,
      audienceSegments: ['Small contractors', 'HVAC contractors'],
      primaryGoal: 'Increase qualified contractor awareness and signups.',
      secondaryGoals: [],
      emphasizedTopics: ['Customer requests', 'Estimates and approvals', 'Jobs', 'Invoices', 'Customer communication', 'Home History'],
      serviceFocus: ['Service work organization'],
      businessSummary: 'Software for small service contractors.',
      ownerNotes: 'Prefer specific product interactions.',
    };
    const withoutTradeContext = buildRecommendedMarketingPlan(base, { windowLimit: 20, itemCount: 0, items: [] });
    expect(new Set(withoutTradeContext.map(item => item.audience))).toEqual(new Set(['Small contractors']));

    const withTradeContext = buildRecommendedMarketingPlan({
      ...base,
      ownerNotes: 'Use HVAC contractors when a service-call example is useful.',
      emphasizedTopics: ['HVAC estimate walkthrough', ...base.emphasizedTopics],
    }, { windowLimit: 20, itemCount: 0, items: [] });
    expect(withTradeContext.some(item => item.audience === 'HVAC contractors')).toBe(true);
  });

  test('single-trade contractor diversity comes from its services and topics, not ServSync audiences', () => {
    const contractorPlan = buildRecommendedMarketingPlan({
      ...profile,
      id: '42000000-0000-4000-8000-000000000020',
      workspaceKey: 'contractor_fixture',
      workspaceKind: 'contractor',
      contractorId: '42000000-0000-4000-8000-000000000021',
      businessName: 'Fixture Plumbing',
      businessSummary: 'A local plumbing contractor serving homeowners.',
      audienceSegments: ['Local homeowners'],
      serviceFocus: ['Water heater repair', 'Leak repair', 'Drain cleaning'],
      primaryGoal: 'Generate qualified local plumbing leads.',
      secondaryGoals: ['Educate homeowners about maintenance'],
      toneStyle: 'Direct and helpful.',
      preferredChannels: ['social', 'website'],
      emphasizedTopics: ['Water heater maintenance', 'Leak warning signs', 'Seasonal plumbing care'],
      avoidedTopics: ['Discount-heavy messaging'],
      ownerNotes: 'Focus on useful local homeowner education.',
    }, { windowLimit: 20, itemCount: 0, items: [] });

    expect(contractorPlan.length).toBeGreaterThanOrEqual(5);
    expect(new Set(contractorPlan.map(item => item.audience))).toEqual(new Set(['Homeowners']));
    expect(new Set(contractorPlan.map(item => item.topic)).size).toBe(contractorPlan.length);
    expect(contractorPlan.flatMap(item => [item.audience, item.topic, item.direction]).join(' ')).not.toMatch(/ServSync|small contractors|Home History/i);
    expect(contractorPlan.some(item => item.contentRoles.includes('feature_announcement'))).toBe(false);
  });

  test('generic topics are rejected and a genuinely narrow profile explains the shorter plan', () => {
    const narrowPlan = buildRecommendedMarketingPlan({
      ...profile,
      audienceSegments: ['Local homeowners'],
      serviceFocus: ['Water heater maintenance', 'Leak warning signs'],
      emphasizedTopics: [
        'Practical homeowner problems',
        'Discuss practical contractor problems',
        'Trade-specific examples',
        'Create a trade-specific example',
        'Talk about being organized',
      ],
      avoidedTopics: [],
    }, { windowLimit: 20, itemCount: 0, items: [] });

    expect(narrowPlan).toHaveLength(2);
    expect(narrowPlan.map(item => item.topic)).toEqual(['Leak warning signs', 'Water heater maintenance']);
    expect(narrowPlan[0].rationale).toContain('the Profile supplies only 2 distinct eligible audience/topic combinations');
    expect(narrowPlan.slice(1).every(item => !item.rationale.includes('this plan contains'))).toBe(true);
  });

  test('recent semantic families identify organized-workflow overlap without forcing exclusion', () => {
    const candidateProfile = {
      ...profile,
      audienceSegments: ['Small contractors'],
      serviceFocus: [],
      primaryGoal: 'Increase contractor signups.',
      secondaryGoals: [],
      emphasizedTopics: ['Organizing service work', 'Customer requests', 'Home History', 'Invoices', 'Jobs'],
    };
    const context: MarketingRecentContentContext = {
      windowLimit: 20,
      itemCount: 1,
      items: [{ ...recent.items[0], title: 'A more organized customer workflow for small teams', intendedAudience: 'hvac_contractors' }],
    };
    const normal = buildRecommendedMarketingPlan(candidateProfile, context);
    const reordered = buildRecommendedMarketingPlan({
      ...candidateProfile,
      audienceSegments: [...candidateProfile.audienceSegments].reverse(),
      emphasizedTopics: [...candidateProfile.emphasizedTopics].reverse(),
      serviceFocus: [...candidateProfile.serviceFocus].reverse(),
    }, context);
    const identities = (items: typeof normal) => items.map(item => `${canonicalMarketingAudience(item.audience).key}:${canonicalMarketingTopic(item.topic).key}`).sort();
    expect(identities(reordered)).toEqual(identities(normal));
    const organizingItem = normal.find(item => canonicalMarketingTopic(item.topic).key === 'service_work_organization');
    expect(organizingItem).toBeDefined();
    expect(organizingItem?.rationale).toContain('related recent coverage exists');
    expect(organizingItem?.rationale).not.toContain('recent window does not cover');
  });

  test('goals, avoid topics, channels, and owner context materially affect bounded recommendations', () => {
    const base = {
      ...profile,
      audienceSegments: ['Small contractors', 'Homeowners'],
      serviceFocus: ['Product demonstrations', 'Customer communication'],
      emphasizedTopics: ['Customer requests', 'Home History', 'Invoices', 'Jobs', 'Estimates and approvals'],
      avoidedTopics: ['Invoices'],
      preferredChannels: ['video'] as MarketingBusinessProfile['preferredChannels'],
      ownerNotes: 'Prioritize practical demonstrations.',
    };
    const contractorFirst = buildRecommendedMarketingPlan({ ...base, primaryGoal: 'Increase contractor signups.' }, { windowLimit: 20, itemCount: 0, items: [] });
    const homeownerFirst = buildRecommendedMarketingPlan({ ...base, primaryGoal: 'Increase homeowner adoption.' }, { windowLimit: 20, itemCount: 0, items: [] });
    expect(canonicalMarketingAudience(contractorFirst[0].audience).kind).toBe('contractor');
    expect(canonicalMarketingAudience(homeownerFirst[0].audience).kind).toBe('homeowner');
    expect(contractorFirst.some(item => canonicalMarketingTopic(item.topic).key === 'invoices')).toBe(false);
    expect(contractorFirst.some(item => item.contentRoles[0] === 'short_video_concept')).toBe(true);
    expect(contractorFirst.every(item => /recent window|recent content|related recent coverage/.test(item.rationale))).toBe(true);
  });

  test('recommendations are profile-specific and do not copy ServSync strategy into contractor context', () => {
    const internal = buildRecommendedMarketingPlan(profile, recent);
    const contractor = buildRecommendedMarketingPlan({
      ...profile,
      id: '42000000-0000-4000-8000-000000000020',
      workspaceKey: 'contractor_fixture',
      workspaceKind: 'contractor',
      contractorId: '42000000-0000-4000-8000-000000000021',
      businessName: 'Fixture Pressure Washing',
      businessSummary: 'Local exterior cleaning business.',
      audienceSegments: ['Local homeowners', 'Property managers'],
      serviceFocus: ['House washing', 'Driveway cleaning'],
      primaryGoal: 'Generate local exterior cleaning leads.',
      secondaryGoals: [],
      toneStyle: 'Visual and direct.',
      emphasizedTopics: ['Before and after work', 'Seasonal property care'],
      avoidedTopics: ['Discount-heavy messaging'],
    }, { windowLimit: 20, itemCount: 0, items: [] });

    expect(internal.map(item => item.audience)).toContain('Homeowners');
    expect(contractor.map(item => item.audience)).toContain('Homeowners');
    expect(contractor.flatMap(item => [item.audience, item.topic]).join(' ')).not.toMatch(/ServSync|contractors|Home History/i);
  });

  test('adapter fails closed for unauthorized and malformed responses and never sends workspace identity', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const adapter = createMarketingPlanningAdapter({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: { profile: rawProfile(), plan: null, recent_content: rawRecent() }, error: null };
      },
    });
    await expect(adapter.get()).resolves.toMatchObject({ profile: { workspaceKey: 'servsync_internal' } });
    expect(calls[0].args).toEqual({});

    const unauthorized = createMarketingPlanningAdapter({ rpc: async () => ({ data: null, error: { code: '42501', message: 'Not authorized.' } }) });
    await expect(unauthorized.get()).rejects.toMatchObject({ kind: 'unauthorized' });

    const malformed = createMarketingPlanningAdapter({ rpc: async () => ({
      data: { profile: { ...rawProfile(), workspace_kind: 'contractor', contractor_id: null }, plan: null, recent_content: rawRecent() },
      error: null,
    }) });
    await expect(malformed.get()).rejects.toMatchObject({ kind: 'malformed' });
  });

  test('adapter accepts the full persisted profile bounds and rejects an oversized item', async () => {
    const boundedProfile = {
      ...rawProfile(),
      service_focus: Array.from({ length: 20 }, (_, index) => `Service ${index + 1}`),
      secondary_goals: ['G'.repeat(300)],
      offers: ['O'.repeat(300)],
      emphasized_topics: Array.from({ length: 20 }, (_, index) => `Topic ${index + 1}`),
      avoided_topics: Array.from({ length: 20 }, (_, index) => `Avoid ${index + 1}`),
    };
    const bounded = createMarketingPlanningAdapter({ rpc: async () => ({
      data: { profile: boundedProfile, plan: null, recent_content: rawRecent() },
      error: null,
    }) });
    await expect(bounded.get()).resolves.toMatchObject({
      profile: { serviceFocus: { length: 20 }, secondaryGoals: ['G'.repeat(300)] },
    });

    const oversized = createMarketingPlanningAdapter({ rpc: async () => ({
      data: {
        profile: { ...boundedProfile, offers: ['O'.repeat(301)] },
        plan: null,
        recent_content: rawRecent(),
      },
      error: null,
    }) });
    await expect(oversized.get()).rejects.toMatchObject({ kind: 'malformed' });
  });

  test('historical recommended plans remain identifiable as v1/v2 while new evidence reads v3', async () => {
    const planValue = {
      plan_id: '42000000-0000-4000-8000-000000000030',
      workspace_key: 'servsync_internal',
      plan_mode: 'recommended',
      plan_status: 'draft',
      title: 'Historical recommendation',
      planning_start: '2026-08-10',
      planning_end: '2026-09-09',
      owner_direction: null,
      profile_version: 2,
      recent_content_context: rawRecent(),
      items: [{
        audience: 'Small contractors',
        topic: 'Customer requests',
        direction: 'Explain customer requests in practical language.',
        rationale: 'Historical planner evidence.',
        content_roles: ['educational_post'],
      }],
      revision_number: 1,
      created_at: '2026-08-10T13:00:00.000Z',
      updated_at: '2026-08-10T13:00:00.000Z',
      accepted_at: null,
    };
    const historical = createMarketingPlanningAdapter({ rpc: async () => ({
      data: { profile: rawProfile(), plan: planValue, recent_content: rawRecent() },
      error: null,
    }) });
    await expect(historical.get()).resolves.toMatchObject({ plan: { recommendationContractVersion: 1 } });

    const plannerV2 = createMarketingPlanningAdapter({ rpc: async () => ({
      data: {
        profile: rawProfile(),
        plan: {
          ...planValue,
          recent_content_context: { ...rawRecent(), recommendation_contract_version: 2 },
        },
        recent_content: rawRecent(),
      },
      error: null,
    }) });
    await expect(plannerV2.get()).resolves.toMatchObject({ plan: { recommendationContractVersion: 2 } });

    const current = createMarketingPlanningAdapter({ rpc: async () => ({
      data: {
        profile: rawProfile(),
        plan: {
          ...planValue,
          recent_content_context: { ...rawRecent(), recommendation_contract_version: 3 },
        },
        recent_content: rawRecent(),
      },
      error: null,
    }) });
    await expect(current.get()).resolves.toMatchObject({ plan: { recommendationContractVersion: 3 } });
  });

  test('an ambiguous create result is not retried by the adapter', async () => {
    let calls = 0;
    const adapter = createMarketingPlanningAdapter({ rpc: async () => {
      calls += 1;
      throw new TypeError('Network connection closed');
    } });

    await expect(adapter.createPlan({
      clientRequestId: '42000000-0000-4000-8000-000000000099',
      profileVersion: 1,
      mode: 'recommended',
      title: 'Thirty-day Marketing plan',
      planningStart: '2026-08-10',
      planningEnd: '2026-09-09',
      ownerDirection: null,
      recommendationContractVersion: MARKETING_RECOMMENDATION_CONTRACT_VERSION,
      items: buildRecommendedMarketingPlan(profile, recent),
    })).rejects.toMatchObject({ kind: 'ambiguous' });
    expect(calls).toBe(1);
  });

  test('platform admin edits the profile, prepares a recommendation, edits it, and accepts it without content actions', async ({ page }) => {
    await installHarness(page);
    await page.getByTestId('marketing-nav-settings').click();
    await expect(page.getByTestId('marketing-profile-editor')).toContainText('ServSync');
    await page.getByLabel('Primary goal').fill('Increase informed consideration of ServSync.');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toContainText('Marketing Profile saved');

    await page.getByRole('tab', { name: 'Plan' }).click();
    await page.getByRole('button', { name: 'Recommend plan' }).click();
    await expect(page.getByTestId('marketing-plan-editor')).toContainText('Draft plan');
    await expect(page.getByTestId('marketing-plan-editor')).toContainText('planner v3');
    await expect(page.getByTestId('marketing-plan-item-1')).toBeVisible();
    await page.getByTestId('marketing-plan-item-1').getByLabel('Direction').fill('Give homeowners a clear explanation of Home History.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText('Draft plan saved');
    await page.getByRole('button', { name: 'Accept plan' }).click();
    await expect(page.getByTestId('marketing-plan-editor')).toContainText('Accepted plan');
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

    const calls = await page.evaluate(() => (window as unknown as { __marketingPlanningCalls: Array<{ name: string; args: Record<string, unknown> }> }).__marketingPlanningCalls);
    expect(calls.map(call => call.name)).toContain('servsync_update_internal_marketing_profile');
    expect(calls.map(call => call.name)).toContain('servsync_create_internal_marketing_plan_v3');
    expect(calls.find(call => call.name === 'servsync_create_internal_marketing_plan_v3')?.args.p_recommendation_contract_version).toBe(3);
    expect(calls.map(call => call.name)).toContain('servsync_update_internal_marketing_plan');
    expect(calls.map(call => call.name)).toContain('servsync_accept_internal_marketing_plan');
    expect(calls.some(call => Object.keys(call.args).some(key => /workspace|contractor|actor/.test(key)))).toBe(false);
    expect(calls.some(call => [
      'servsync_create_internal_marketing_content',
      'servsync_update_internal_marketing_content',
      'servsync_transition_internal_marketing_content',
    ].includes(call.name) || /publish|schedule/.test(call.name))).toBe(false);
  });

  test('owner-directed planning is bounded to profile audience and topic choices', async ({ page }) => {
    await installHarness(page);
    await page.getByTestId('marketing-nav-settings').click();
    await page.getByRole('tab', { name: 'Plan' }).click();
    await page.getByRole('button', { name: 'Owner-directed' }).click();
    await page.getByLabel('Audience').selectOption({ label: 'Small contractors' });
    await page.getByLabel('Topic').selectOption({ label: 'Customer requests' });
    await page.getByLabel('What do you want to market?').fill('Explain how customer requests can stay organized.');
    await page.getByRole('button', { name: 'Prepare owner plan' }).click();
    await expect(page.getByTestId('marketing-plan-editor')).toContainText('Owner-directed');
    await expect(page.getByTestId('marketing-plan-item-1').getByLabel('Audience')).toHaveValue('Small contractors');
    await expect(page.getByTestId('marketing-plan-item-1').getByLabel('Topic')).toHaveValue('Customer requests');
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${viewport.name} profile and planning UI remains usable without overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installHarness(page);
      await page.getByTestId('marketing-nav-settings').click();
      await expect(page.getByTestId('marketing-profile-editor')).toBeVisible();
      await page.getByRole('tab', { name: 'Plan' }).click();
      await expect(page.getByTestId('marketing-plan-builder')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  for (const role of ['contractor', 'homeowner']) {
    test(`${role} cannot render the internal planning workspace`, async ({ page }) => {
      await installHarness(page, role);
      await expect(page.getByTestId('marketing-workspace')).toHaveCount(0);
    });
  }
});
