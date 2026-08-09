import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('Durable Trade Section Instances v1', () => {
  test('stores exact definition and asset snapshots in append-only durable history', () => {
    const sql = source('servsync-durable-trade-section-instances.sql');

    expect(sql).toContain('create table public.trade_section_instances');
    expect(sql).toContain('create table public.trade_section_revisions');
    expect(sql).toContain('definition_version_id uuid not null');
    expect(sql).toContain('definition_snapshot jsonb not null');
    expect(sql).toContain('definition_snapshot_sha256 text not null');
    expect(sql).toContain('property_asset_revision_number bigint');
    expect(sql).toContain('Trade Section revisions are append-only and immutable.');
    expect(sql).toContain('Trade Section instances cannot be hard-deleted.');
  });

  test('uses canonical Draft, Estimate, Job, property, claim, and asset identities', () => {
    const sql = source('servsync-durable-trade-section-instances.sql');

    expect(sql).toContain('work_draft_id uuid references public.contractor_work_drafts(id)');
    expect(sql).toContain('estimate_id uuid references public.estimates(id)');
    expect(sql).toContain('job_id uuid references public.inspections(id)');
    expect(sql).toContain('property_asset_id uuid references public.home_assets(id)');
    expect(sql).toContain('contractor_work_drafts_sync_trade_sections');
    expect(sql).toContain('inspections_sync_trade_sections');
    expect(sql).toContain('contractor_local_homes_map_trade_sections');
    expect(sql).toContain("set_config('servsync.trade_section_change_kind', 'claim_mapped', true)");
    expect(sql).toContain('Trade Section Estimate lineage is invalid.');
    expect(sql).toContain('Trade Section Job lineage is invalid.');
    expect(sql).toContain('Trade Section Estimate lineage cannot be rewritten.');
    expect(sql).toContain('Trade Section Job lineage cannot be rewritten.');
  });

  test('fails closed on roles, capabilities, values, and stale revisions', () => {
    const sql = source('servsync-durable-trade-section-instances.sql');

    expect(sql).toContain("coalesce(v_role, '') not in ('owner', 'admin', 'office')");
    expect(sql).toContain("coalesce(v_role, '') not in ('owner', 'admin', 'office', 'viewer')");
    expect(sql).not.toMatch(/\('owner', 'admin', 'office', 'field_tech'/);
    expect(sql).toContain("v_grant.access_mode is distinct from 'active'");
    expect(sql).toContain("coalesce(v_mode, '') not in ('active', 'completion_only')");
    expect(sql).toContain('Trade Section has changed; refresh and try again.');
    expect(sql).toContain('Trade Section values do not match the governing definition.');
    expect(sql).toContain('set search_path = pg_catalog, public, extensions');
    expect(sql).toContain("v_key in ('__proto__', 'prototype', 'constructor')");
    expect(sql).toContain('pg_column_size(p_values) > 65536');
  });

  test('keeps private tables closed and exposes exactly five authenticated RPCs', () => {
    const sql = source('servsync-durable-trade-section-instances.sql');

    expect(sql).toContain('alter table public.trade_section_instances force row level security');
    expect(sql).toContain('alter table public.trade_section_revisions force row level security');
    expect(sql).toContain('revoke all on table public.trade_section_instances from public, anon, authenticated, service_role');
    expect(sql).toContain('grant select on table public.trade_section_instances, public.trade_section_revisions to service_role');

    const grants = [...sql.matchAll(/grant execute on function public\.(servsync_[^(]+)\([^;]+?\) to authenticated;/g)]
      .map(match => match[1]);
    expect(grants.sort()).toEqual([
      'servsync_create_trade_section_instance',
      'servsync_list_trade_section_instances',
      'servsync_list_trade_section_revisions',
      'servsync_set_trade_section_lifecycle',
      'servsync_update_trade_section_values',
    ]);
    expect(sql).not.toMatch(/grant execute[\s\S]*to (?:anon|public)/i);
    expect(sql).toContain('where instance.contractor_id = v_contractor_id');
    expect(sql).toContain('and revision.contractor_id = v_contractor_id');
  });

  test('keeps the runtime behind its strict source gate and outside shared types', () => {
    const app = source('src/App.tsx');
    const clientSource = source('src/types.ts');
    const availability = source('src/features/trade-sections/tradeSectionAvailability.ts');
    const adapter = source('src/features/trade-sections/tradeSectionAdapter.ts');

    for (const rpc of [
      'servsync_create_trade_section_instance',
      'servsync_list_trade_section_instances',
      'servsync_update_trade_section_values',
    ]) {
      expect(adapter).toContain(rpc);
      expect(clientSource).not.toContain(rpc);
    }
    expect(adapter).not.toContain('servsync_list_trade_section_revisions');
    expect(adapter).not.toContain('servsync_set_trade_section_lifecycle');
    expect(availability).toContain("VITE_DURABLE_TRADE_SECTIONS_UI_ENABLED === 'true'");
    expect(app).toContain('DURABLE_TRADE_SECTIONS_UI_ENABLED');
    expect(app).not.toContain('No Cooling');
  });

  test('contains no provider, billing, or homeowner projection coupling', () => {
    const sql = source('servsync-durable-trade-section-instances.sql').toLowerCase();

    for (const forbidden of [
      'stripe', 'price_id', 'product_id', 'subscription', 'billing_tier',
      'customer_projection', 'homeowner_trade_section',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
