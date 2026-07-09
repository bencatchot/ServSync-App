import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-integration-foundation.sql');
const appPath = resolve(process.cwd(), 'src/App.tsx');
const typesPath = resolve(process.cwd(), 'src/types.ts');
const securityCatalogPath = resolve(process.cwd(), 'tests/e2e/security-catalog.spec.ts');
const backlogPath = resolve(process.cwd(), 'docs/servsync-master-plan/ServSync_Feature_Backlog.md');
const changelogPath = resolve(process.cwd(), 'docs/servsync-master-plan/CHANGELOG.md');
const masterPlanPath = resolve(process.cwd(), 'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function tableBlock(sql: string, tableName: string) {
  const match = sql.match(new RegExp(`create table if not exists public\\.${tableName} \\([\\s\\S]*?\\n\\);`, 'i'));
  expect(match, `${tableName} create table block should exist`).toBeTruthy();
  return match![0];
}

test.describe('provider-neutral integration foundation source checks', () => {
  test('SQL creates the two internal integration tables with UUID primary keys', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/create table if not exists public\.external_object_mappings/i);
    expect(sql).toMatch(/create table if not exists public\.integration_outbox_events/i);
    expect(tableBlock(sql, 'external_object_mappings')).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
    expect(tableBlock(sql, 'integration_outbox_events')).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
    expect(sql).toMatch(/alter table public\.external_object_mappings enable row level security/i);
    expect(sql).toMatch(/alter table public\.integration_outbox_events enable row level security/i);
  });

  test('SQL uses text check constraints instead of Postgres enums', () => {
    const sql = read(sqlPath);

    expect(sql).not.toMatch(/create\s+type\s+public\./i);
    expect(sql).toMatch(/servsync_entity_type text not null/i);
    expect(sql).toMatch(/mapping_status text not null default 'active'/i);
    expect(sql).toMatch(/sync_direction text not null default 'linked'/i);
    expect(sql).toMatch(/channel text not null/i);
    expect(sql).toMatch(/status text not null default 'pending'/i);
    expect(sql).toMatch(/constraint external_object_mappings_servsync_entity_type_check/i);
    expect(sql).toMatch(/constraint integration_outbox_events_channel_check/i);
    expect(sql).toMatch(/constraint integration_outbox_events_status_check/i);
  });

  test('external object mappings are provider-neutral, scoped, and uniqueness guarded', () => {
    const sql = read(sqlPath);
    const block = tableBlock(sql, 'external_object_mappings');

    for (const column of [
      'provider',
      'provider_account_id',
      'provider_object_type',
      'provider_object_id',
      'provider_parent_object_id',
      'servsync_entity_type',
      'servsync_entity_id',
      'contractor_id',
      'homeowner_user_id',
      'home_id',
      'metadata',
      'created_by',
    ]) {
      expect(block, `${column} should be present`).toContain(column);
    }

    expect(block).not.toMatch(/quickbooks_id|stripe_payment_id|google_event_id|outlook_event_id|twilio_message_id|sendgrid_message_id|qbo_id|intuit_id/i);
    expect(block).not.toContain('estimate_payment_schedule_item');
    expect(sql).toMatch(/external_object_mappings_provider_object_uidx[\s\S]*provider,\s*provider_account_id,\s*provider_object_type,\s*provider_object_id/i);
    expect(sql).toMatch(/external_object_mappings_servsync_entity_object_type_uidx[\s\S]*provider,\s*provider_account_id,\s*servsync_entity_type,\s*servsync_entity_id,\s*provider_object_type/i);
    expect(sql).toMatch(/constraint external_object_mappings_scope_check[\s\S]*contractor_id is not null[\s\S]*homeowner_user_id is not null[\s\S]*home_id is not null/i);
    expect(sql).toMatch(/external_object_mappings_entity_idx/i);
    expect(sql).toMatch(/external_object_mappings_contractor_provider_idx/i);
    expect(sql).toMatch(/external_object_mappings_homeowner_provider_idx/i);
    expect(sql).toMatch(/external_object_mappings_home_provider_idx/i);
  });

  test('integration outbox events are idempotent, scoped, and processing-indexed', () => {
    const sql = read(sqlPath);
    const block = tableBlock(sql, 'integration_outbox_events');

    for (const column of [
      'event_key',
      'channel',
      'provider',
      'event_type',
      'aggregate_type',
      'aggregate_id',
      'contractor_id',
      'homeowner_user_id',
      'home_id',
      'priority',
      'scheduled_for',
      'attempt_count',
      'max_attempts',
      'locked_at',
      'locked_by',
      'processing_started_at',
      'processed_at',
      'failed_at',
      'last_error_code',
      'last_error_message',
      'payload',
      'result_metadata',
    ]) {
      expect(block, `${column} should be present`).toContain(column);
    }

    expect(sql).toMatch(/integration_outbox_events_event_key_uidx[\s\S]*event_key/i);
    expect(sql).toMatch(/integration_outbox_events_processing_idx[\s\S]*status,\s*scheduled_for,\s*priority desc/i);
    expect(sql).toMatch(/integration_outbox_events_aggregate_idx[\s\S]*aggregate_type,\s*aggregate_id/i);
    expect(sql).toMatch(/constraint integration_outbox_events_scope_check[\s\S]*contractor_id is not null[\s\S]*homeowner_user_id is not null[\s\S]*home_id is not null[\s\S]*aggregate_id is not null/i);
    expect(sql).toMatch(/payload jsonb not null default '\{\}'::jsonb/i);
    expect(sql).toMatch(/result_metadata jsonb not null default '\{\}'::jsonb/i);
  });

  test('integration foundation is internal-only with no browser table grants or callable RPCs', () => {
    const sql = read(sqlPath);

    for (const tableName of ['external_object_mappings', 'integration_outbox_events']) {
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from public`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from anon`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from authenticated`, 'i'));
      expect(sql).not.toMatch(new RegExp(`grant\\s+.*on\\s+table\\s+public\\.${tableName}`, 'i'));
      expect(sql).not.toMatch(new RegExp(`create\\s+policy[\\s\\S]*${tableName}`, 'i'));
    }

    expect(sql).not.toMatch(/create or replace function public\.servsync_/i);
    expect(sql).not.toMatch(/grant execute on function/i);
  });

  test('TypeScript exposes provider-neutral foundation types without UI wiring', () => {
    const app = read(appPath);
    const types = read(typesPath);

    expect(types).toMatch(/export type ExternalObjectMappingStatus = 'active' \| 'pending' \| 'conflict' \| 'failed' \| 'archived'/);
    expect(types).toMatch(/export type ExternalObjectMappingEntityType =/);
    expect(types).not.toContain("'estimate_payment_schedule_item'");
    expect(types).toMatch(/export interface ExternalObjectMapping/);
    expect(types).toMatch(/export type IntegrationOutboxChannel =/);
    expect(types).toMatch(/export interface IntegrationOutboxEvent/);
    expect(app).not.toMatch(/external_object_mappings|integration_outbox_events|ExternalObjectMapping|IntegrationOutboxEvent/);
  });

  test('security catalog and docs identify the foundation as private and not live integrations', () => {
    const catalog = read(securityCatalogPath);
    const docs = [read(backlogPath), read(changelogPath), read(masterPlanPath)].join('\n');

    expect(catalog).toContain("'external_object_mappings'");
    expect(catalog).toContain("'integration_outbox_events'");
    expect(docs).toMatch(/provider-neutral integration foundation/i);
    expect(docs).toMatch(/no live integrations/i);
    expect(docs).toMatch(/QuickBooks\/accounting sync is not live/i);
    expect(docs).toMatch(/payments\/Stripe/i);
  });
});
