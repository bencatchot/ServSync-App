import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('Property Asset Bridge v1', () => {
  test('extends the canonical asset identity with strict generic fields and append-only revisions', () => {
    const sql = source('servsync-property-asset-bridge.sql');

    expect(sql).toContain('alter table public.home_assets');
    expect(sql).toContain('add column local_home_id uuid');
    expect(sql).toContain('add column asset_kind text');
    expect(sql).toContain("asset_kind in ('hvac', 'plumbing', 'electrical', 'appliance', 'roof', 'exterior', 'garage', 'safety', 'other')");
    expect(sql).toContain('create table public.home_asset_revisions');
    expect(sql).toContain('home_asset_revisions_asset_revision_unique');
    expect(sql).toContain('home_asset_revisions_immutable_trigger');
    expect(sql).toContain('home_assets_guard_truncate_trigger');
    expect(sql).toContain('home_asset_revisions_guard_truncate_trigger');
    expect(sql).toContain("if current_user <> 'postgres' then");
    expect(sql).toContain('revision_number = asset.revision_number + 1');
    expect(sql).not.toMatch(/\b(jsonb|metadata)\s+(?:not\s+null\s+)?default\s+'\{\}'/i);
  });

  test('uses exact property authority and deliberately defers Field Technician writes', () => {
    const sql = source('servsync-property-asset-bridge.sql');

    expect(sql).toContain('public.current_user_can_access_home(p_home_id)');
    expect(sql).toContain('public.current_user_can_manage_home(p_home_id)');
    expect(sql).toContain('shared.share_home_overview = true');
    expect(sql).toContain("member.role in ('admin', 'office', 'field_tech')");
    expect(sql).toContain('public.current_user_can_manage_contractor_customers(p_contractor_id)');
    expect(sql).toContain('contact.homeowner_user_id is null');
    expect(sql).toContain('local_home.archived_at is null');
    expect(sql).toContain("contractor.account_status = 'active'");
  });

  test('maps local assets onto the claimed canonical home without changing asset identity', () => {
    const sql = source('servsync-property-asset-bridge.sql');

    expect(sql).toContain('contractor_local_homes_map_property_assets_trigger');
    expect(sql).toContain("set_config('servsync.property_asset_change_kind', 'claim_mapped', true)");
    expect(sql).toContain('set home_id = new.home_id');
    expect(sql).toContain('where asset.local_home_id = new.id');
    expect(sql).toContain('and asset.home_id is null');
    expect(sql).not.toMatch(/insert\s+into\s+public\.home_assets[\s\S]{0,400}claim_mapped/i);
  });

  test('denies direct browser tables and exposes only five authenticated RPCs', () => {
    const sql = source('servsync-property-asset-bridge.sql');

    expect(sql).toContain('alter table public.home_assets force row level security');
    expect(sql).toContain('alter table public.home_asset_revisions force row level security');
    expect(sql).toContain('revoke all on table public.home_assets from public, anon, authenticated, service_role');
    expect(sql).toContain('revoke all on table public.home_asset_revisions from public, anon, authenticated, service_role');
    expect(sql).toContain('grant all privileges on table public.home_assets to service_role');
    expect(sql).toContain('grant all privileges on table public.home_asset_revisions to service_role');
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete)[\s\S]*on\s+(?:table\s+)?public\.(?:home_assets|home_asset_revisions)\s+to\s+(?:anon|authenticated|public)/i);

    const grants = [...sql.matchAll(/grant execute on function public\.(servsync_[^(]+)\([^;]+?\) to authenticated;/g)]
      .map(match => match[1]);
    expect(grants.sort()).toEqual([
      'servsync_create_property_asset',
      'servsync_list_property_asset_revisions',
      'servsync_list_property_assets',
      'servsync_set_property_asset_lifecycle',
      'servsync_update_property_asset',
    ]);
    expect(sql).not.toMatch(/grant execute[\s\S]*to (?:anon|public)/i);
    expect(sql).not.toMatch(/grant execute on function public\.servsync_(?:list|create|update|set)_property_asset[^;]+to service_role/i);
  });

  test('keeps shared assets provider-neutral and outside Trade Pack entitlement', () => {
    const sql = source('servsync-property-asset-bridge.sql').toLowerCase();

    for (const forbidden of [
      'stripe', 'price_id', 'product_id', 'subscription',
      'trade_pack_capability', 'trade_pack_work_type',
      'draft_id', 'job_id', 'estimate_id', 'invoice_id',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  test('keeps the bridge hidden behind an exact missing-RPC compatibility boundary', () => {
    const app = source('src/App.tsx');
    const adapter = source('src/propertyAssetAdapter.ts');
    const start = app.indexOf('const loadHomeAssets = useCallback(async () => {');
    const end = app.indexOf('const signedHomeAssetUrl =', start);
    const assetLogic = app.slice(start, end);

    expect(assetLogic).toContain('propertyAssetAdapter.list(homeIds)');
    expect(assetLogic).toContain('propertyAssetAdapter.create(assetInput)');
    expect(assetLogic).toContain('propertyAssetAdapter.update({');
    expect(assetLogic).toContain('propertyAssetAdapter.archive(asset)');
    expect(adapter).toContain("client.rpc('servsync_list_property_assets'");
    expect(adapter).toContain("client.rpc('servsync_create_property_asset'");
    expect(adapter).toContain("client.rpc('servsync_update_property_asset'");
    expect(adapter).toContain("client.rpc('servsync_set_property_asset_lifecycle'");
    expect(adapter).toContain("client.from('home_assets')");
    expect(adapter).toContain("error.code !== 'PGRST202'");
    expect(adapter).not.toMatch(/production|demo|sandbox|project[_-]?ref|feature[_-]?flag/i);
    expect(app).not.toContain('Property Asset Bridge');
  });
});
