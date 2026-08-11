import { expect, test, type Page } from '@playwright/test';
import {
  createMarketingContentAdapter,
  MarketingContentAdapterError,
  type MarketingContentItem,
} from '../../src/features/marketing/marketingContent';
import { buildInternalMarketingOverview } from '../../src/features/marketing/marketingDomain';

const overview = buildInternalMarketingOverview({ contractors: 4, homeowners: 9, activeInvites: 2 });

function contentItem(overrides: Partial<MarketingContentItem> = {}): MarketingContentItem {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    workspaceKey: 'servsync_internal',
    workspaceKind: 'internal',
    title: 'Review the launch message',
    contentType: 'social_post',
    body: 'A real piece of content awaiting an internal decision.',
    channelCategory: 'social',
    status: 'needs_approval',
    revisionNumber: 3,
    createdAt: '2026-08-09T18:00:00.000Z',
    updatedAt: '2026-08-09T18:05:00.000Z',
    createdBy: '10000000-0000-4000-8000-000000000001',
    createdByName: 'Platform Owner',
    submittedAt: '2026-08-09T18:05:00.000Z',
    submittedBy: '10000000-0000-4000-8000-000000000001',
    submittedByName: 'Platform Owner',
    reviewedAt: null,
    reviewedBy: null,
    reviewedByName: null,
    reviewNote: null,
    preparationSource: 'manual',
    preparationRequestId: null,
    preparationRecipeKey: null,
    truthPackVersion: null,
    preparedAt: null,
    preparationSequence: null,
    intendedAudience: null,
    contentRole: null,
    ...overrides,
  };
}

function rpcRow(item: MarketingContentItem) {
  return {
    content_id: item.id,
    workspace_key: item.workspaceKey,
    workspace_kind: item.workspaceKind,
    title: item.title,
    content_type: item.contentType,
    body: item.body,
    channel_category: item.channelCategory,
    status: item.status,
    revision_number: item.revisionNumber,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    created_by: item.createdBy,
    created_by_name: item.createdByName,
    submitted_at: item.submittedAt,
    submitted_by: item.submittedBy,
    submitted_by_name: item.submittedByName,
    reviewed_at: item.reviewedAt,
    reviewed_by: item.reviewedBy,
    reviewed_by_name: item.reviewedByName,
    review_note: item.reviewNote,
    preparation_source: item.preparationSource,
    preparation_request_id: item.preparationRequestId,
    preparation_recipe_key: item.preparationRecipeKey,
    truth_pack_version: item.truthPackVersion,
    prepared_at: item.preparedAt,
    preparation_sequence: item.preparationSequence,
    intended_audience: item.intendedAudience,
    content_role: item.contentRole,
  };
}

async function installHarness(page: Page, initial: MarketingContentItem[] = [], behavior: 'ready' | 'error' | 'pending' = 'ready') {
  await page.goto('/');
  await page.evaluate(async ({ overview, initialRows, behavior }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as {
      createElement: (...args: unknown[]) => unknown;
    };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const module = await dynamicImport('/src/features/marketing/MarketingWorkspace.tsx');
    const Workspace = module.InternalMarketingWorkspace as (...args: unknown[]) => unknown;
    const state = initialRows.map(row => ({ ...row }));
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let nextId = 10;
    const now = () => '2026-08-09T19:00:00.000Z';
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (behavior === 'pending') return new Promise(() => undefined);
        if (behavior === 'error') return { data: null, error: { message: 'database detail must stay private' } };
        if (name === 'servsync_list_internal_marketing_content') return { data: state.map(row => ({ ...row })), error: null };
        if (name === 'servsync_get_internal_marketing_directions') return { data: { accepted_plan: null, directions: [] }, error: null };
        if (name === 'servsync_create_internal_marketing_content') {
          const id = `40000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
          state.unshift({
            content_id: id,
            workspace_key: 'servsync_internal',
            workspace_kind: 'internal',
            title: args.p_title,
            content_type: args.p_content_type,
            body: args.p_body,
            channel_category: args.p_channel_category,
            status: 'idea',
            revision_number: 1,
            created_at: now(),
            updated_at: now(),
            created_by: '10000000-0000-4000-8000-000000000001',
            created_by_name: 'Platform Owner',
            submitted_at: null,
            submitted_by: null,
            submitted_by_name: null,
            reviewed_at: null,
            reviewed_by: null,
            reviewed_by_name: null,
            review_note: null,
            preparation_source: 'manual',
            preparation_request_id: null,
            preparation_recipe_key: null,
            truth_pack_version: null,
            prepared_at: null,
            preparation_sequence: null,
            intended_audience: null,
            content_role: null,
          });
          return { data: { content_id: id, status: 'idea', revision_number: 1 }, error: null };
        }
        const item = state.find(row => row.content_id === args.p_content_id);
        if (!item) return { data: null, error: { code: 'P0002', message: 'Marketing content not found.' } };
        if (name === 'servsync_update_internal_marketing_content') {
          item.title = args.p_title;
          item.content_type = args.p_content_type;
          item.body = args.p_body;
          item.channel_category = args.p_channel_category;
          item.revision_number = Number(item.revision_number) + 1;
          item.updated_at = now();
          return { data: { content_id: item.content_id, status: item.status, revision_number: item.revision_number }, error: null };
        }
        if (name === 'servsync_transition_internal_marketing_content') {
          const from = item.status;
          item.status = args.p_to_status;
          item.revision_number = Number(item.revision_number) + 1;
          item.updated_at = now();
          if (from === 'draft' && args.p_to_status === 'needs_approval') {
            item.submitted_at = now();
            item.submitted_by = '10000000-0000-4000-8000-000000000001';
            item.submitted_by_name = 'Platform Owner';
            item.reviewed_at = null;
            item.reviewed_by = null;
            item.reviewed_by_name = null;
            item.review_note = null;
          }
          if (from === 'needs_approval') {
            item.reviewed_at = now();
            item.reviewed_by = '10000000-0000-4000-8000-000000000001';
            item.reviewed_by_name = 'Platform Owner';
            item.review_note = args.p_reason;
          }
          return { data: { content_id: item.content_id, status: item.status, revision_number: item.revision_number }, error: null };
        }
        return { data: null, error: { message: 'Unknown RPC' } };
      },
    };

    Object.assign(window, { __marketingRpcCalls: calls });
    document.body.innerHTML = '<main class="mx-auto max-w-6xl bg-slate-50 p-4"><div id="marketing-test-root"></div></main>';
    createRoot(document.getElementById('marketing-test-root') as HTMLElement).render(
      React.createElement(Workspace, { role: 'platform_admin', overview, client }),
    );
  }, { overview, initialRows: initial.map(rpcRow), behavior });
}

test.describe('internal Marketing content approval', () => {
  test('adapter validates reads, protects mutation identity, and fails closed', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const item = contentItem();
    const adapter = createMarketingContentAdapter({
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'servsync_list_internal_marketing_content') return { data: [rpcRow(item)], error: null };
        return { data: { content_id: item.id, status: 'approved', revision_number: 4 }, error: null };
      },
    });

    await expect(adapter.list('needs_approval')).resolves.toEqual([item]);
    await expect(adapter.transition({ contentId: item.id, expectedRevision: 3, toStatus: 'approved' })).resolves.toMatchObject({ status: 'approved' });
    expect(calls[1].args).toEqual({
      p_content_id: item.id,
      p_expected_revision: 3,
      p_to_status: 'approved',
      p_reason: null,
    });
    expect(calls[1].args).not.toHaveProperty('workspace_id');
    expect(calls[1].args).not.toHaveProperty('actor_user_id');

    const malformed = createMarketingContentAdapter({ rpc: async () => ({ data: [{ ...rpcRow(item), workspace_key: 'contractor_1' }], error: null }) });
    await expect(malformed.list()).rejects.toMatchObject({ kind: 'malformed' });

    const malformedProvenance = createMarketingContentAdapter({ rpc: async () => ({
      data: [{ ...rpcRow(item), preparation_source: 'codex_assisted' }],
      error: null,
    }) });
    await expect(malformedProvenance.list()).rejects.toMatchObject({ kind: 'malformed' });

    const unauthorized = createMarketingContentAdapter({ rpc: async () => ({ data: null, error: { code: '42501', message: 'Not authorized.' } }) });
    await expect(unauthorized.list()).rejects.toMatchObject({ kind: 'unauthorized' });

    const stale = createMarketingContentAdapter({ rpc: async () => ({ data: null, error: { message: 'Marketing content changed; reload and try again.' } }) });
    await expect(stale.update({
      contentId: item.id,
      expectedRevision: 3,
      title: item.title,
      contentType: item.contentType,
      body: item.body,
      channelCategory: item.channelCategory,
    })).rejects.toMatchObject({ kind: 'stale' });

    const ambiguous = createMarketingContentAdapter({ rpc: async () => { throw new Error('network'); } });
    await expect(ambiguous.transition({ contentId: item.id, expectedRevision: 3, toStatus: 'approved' }))
      .rejects.toEqual(expect.objectContaining<Partial<MarketingContentAdapterError>>({ kind: 'ambiguous' }));
  });

  test('empty queue is truthful and create-to-approval drives the Overview queue', async ({ page }) => {
    await installHarness(page);
    await expect(page.getByTestId('marketing-needs-approval')).toContainText('Nothing waiting for approval');

    await page.getByTestId('marketing-nav-content').click();
    await expect(page.getByTestId('marketing-content-list')).toContainText('No marketing content yet');
    await page.getByRole('button', { name: 'Create content' }).click();
    await page.getByLabel('Internal title').fill('Launch reminder');
    await page.getByRole('textbox', { name: /^Content / }).fill('A real message prepared for owner review.');
    await page.getByRole('button', { name: 'Create idea' }).click();
    await expect(page.getByTestId('marketing-content-detail')).toContainText('Idea');
    await page.getByRole('button', { name: 'Start draft' }).click();
    await expect(page.getByTestId('marketing-content-detail')).toContainText('Draft');
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByTestId('marketing-content-detail')).toContainText('Needs approval');

    await page.getByTestId('marketing-nav-overview').click();
    await expect(page.getByTestId('marketing-needs-approval')).toContainText('Launch reminder');
    await page.getByRole('button', { name: /Launch reminder/ }).click();
    await expect(page.getByTestId('marketing-content-detail')).toContainText('A real message prepared for owner review.');
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByTestId('marketing-content-detail')).toContainText('Approved');
    await page.getByTestId('marketing-nav-overview').click();
    await expect(page.getByTestId('marketing-needs-approval')).toContainText('Nothing waiting for approval');
  });

  test('loading and failure states remain honest and do not expose server details', async ({ page }) => {
    await installHarness(page, [], 'pending');
    await expect(page.getByTestId('marketing-needs-approval')).toContainText('Loading approval queue');
    await page.getByTestId('marketing-nav-content').click();
    await expect(page.getByTestId('marketing-content-list')).toContainText('Loading content');

    await installHarness(page, [], 'error');
    await expect(page.getByTestId('marketing-needs-approval')).toContainText('Approval queue unavailable');
    await expect(page.getByTestId('marketing-workspace')).not.toContainText('database detail must stay private');
    await page.getByTestId('marketing-nav-content').click();
    await expect(page.getByRole('alert')).toContainText('ServSync could not load marketing content.');
  });

  test('reviewer can return content to draft with a durable reason', async ({ page }) => {
    await installHarness(page, [contentItem()]);
    await page.getByTestId('marketing-nav-content').click();
    await page.getByRole('tab', { name: 'Needs approval' }).click();
    await page.getByRole('button', { name: /Review the launch message/ }).click();
    await page.getByLabel('Return or rejection reason').fill('Clarify who this message is for.');
    await page.getByRole('button', { name: 'Return to draft' }).click();
    await expect(page.getByTestId('marketing-content-detail')).toContainText('Draft');
    await expect(page.getByTestId('marketing-content-detail')).toContainText('Clarify who this message is for.');
  });

  test('reviewer can reject exact content with a reason', async ({ page }) => {
    await installHarness(page, [contentItem()]);
    await page.getByTestId('marketing-nav-content').click();
    await page.getByRole('tab', { name: 'Needs approval' }).click();
    await page.getByRole('button', { name: /Review the launch message/ }).click();
    await page.getByLabel('Return or rejection reason').fill('This direction is not approved.');
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByTestId('marketing-content-detail')).toContainText('Rejected');
    await expect(page.getByTestId('marketing-content-detail')).toContainText('This direction is not approved.');
  });

  test('Codex-prepared drafts show bounded provenance and remain human-controlled drafts', async ({ page }) => {
    const prepared = contentItem({
      status: 'draft',
      revisionNumber: 1,
      submittedAt: null,
      submittedBy: null,
      submittedByName: null,
      preparationSource: 'codex_assisted',
      preparationRequestId: '41000000-0000-4000-8000-000000000010',
      preparationRecipeKey: 'contractor_acquisition',
      truthPackVersion: 'servsync-marketing-truth-v1',
      preparedAt: '2026-08-09T18:00:00.000Z',
      preparationSequence: 1,
      intendedAudience: 'hvac_contractors',
      contentRole: 'linkedin_post',
    });
    await installHarness(page, [prepared]);
    await page.getByTestId('marketing-nav-content').click();
    await expect(page.getByTestId('marketing-codex-source-badge')).toHaveText(/Codex-prepared/);
    await page.getByRole('button', { name: /Review the launch message/ }).click();
    await expect(page.getByTestId('marketing-preparation-provenance')).toContainText('Codex-prepared draft');
    await expect(page.getByTestId('marketing-preparation-provenance')).toContainText('HVAC contractors');
    await expect(page.getByTestId('marketing-preparation-provenance')).toContainText('LinkedIn post');
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${viewport.name} content review remains usable without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installHarness(page, [contentItem({
        status: 'draft',
        submittedAt: null,
        submittedBy: null,
        submittedByName: null,
        preparationSource: 'codex_assisted',
        preparationRequestId: '41000000-0000-4000-8000-000000000010',
        preparationRecipeKey: 'contractor_acquisition',
        truthPackVersion: 'servsync-marketing-truth-v1',
        preparedAt: '2026-08-09T18:00:00.000Z',
        preparationSequence: 1,
        intendedAudience: 'small_contractors',
        contentRole: 'educational_post',
      })]);
      await page.getByTestId('marketing-nav-content').click();
      await page.getByRole('button', { name: /Review the launch message/ }).click();
      await expect(page.getByTestId('marketing-preparation-provenance')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
