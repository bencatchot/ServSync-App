import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-project-collaboration-foundation.sql');
const appPath = resolve(process.cwd(), 'src/App.tsx');
const typesPath = resolve(process.cwd(), 'src/types.ts');
const securityCatalogPath = resolve(process.cwd(), 'tests/e2e/security-catalog.spec.ts');
const backlogPath = resolve(process.cwd(), 'docs/servsync-master-plan/ServSync_Feature_Backlog.md');
const changelogPath = resolve(process.cwd(), 'docs/servsync-master-plan/CHANGELOG.md');
const masterPlanPath = resolve(process.cwd(), 'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md');
const specPath = resolve(process.cwd(), 'docs/servsync-master-plan/ServSync_Project_Collaboration_Spec_v1.md');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function tableBlock(sql: string, tableName: string) {
  const match = sql.match(new RegExp(`create table if not exists public\\.${tableName} \\([\\s\\S]*?\\n\\);`, 'i'));
  expect(match, `${tableName} create table block should exist`).toBeTruthy();
  return match![0];
}

test.describe('hidden Project Collaboration foundation source checks', () => {
  test('SQL creates the hidden durable project foundation tables', () => {
    const sql = read(sqlPath);

    for (const tableName of [
      'projects',
      'project_parties',
      'project_party_memberships',
      'project_authority_assignments',
      'project_events',
      'project_collaboration_allowed_profiles',
    ]) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${tableName}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${tableName} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from public`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from anon`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from authenticated`, 'i'));
    }

    expect(tableBlock(sql, 'projects')).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
    expect(tableBlock(sql, 'project_events')).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
  });

  test('projects require exactly one property context and preserve creator history', () => {
    const sql = read(sqlPath);
    const block = tableBlock(sql, 'projects');

    expect(block).toMatch(/home_id uuid references public\.homes\(id\) on delete restrict/i);
    expect(block).toMatch(/local_home_id uuid references public\.contractor_local_homes\(id\) on delete restrict/i);
    expect(block).toMatch(/constraint projects_exactly_one_property_check[\s\S]*home_id is not null and local_home_id is null[\s\S]*home_id is null and local_home_id is not null/i);
    expect(block).toMatch(/original_creator_user_id uuid not null references public\.profiles\(id\) on delete restrict/i);
    expect(block).toMatch(/original_creator_party_type text not null/i);
    expect(block).toMatch(/original_creator_contractor_id uuid references public\.contractor_profiles\(id\) on delete restrict/i);
    expect(block).toMatch(/status text not null default 'active'/i);
    expect(block).toMatch(/status in \('active', 'paused', 'closed'\)/i);
  });

  test('party, membership, authority, and event models are normalized and durable', () => {
    const sql = read(sqlPath);

    expect(tableBlock(sql, 'project_parties')).toMatch(/party_type text not null/i);
    expect(tableBlock(sql, 'project_parties')).toMatch(/party_type in \('contractor_company', 'homeowner'\)/i);
    expect(tableBlock(sql, 'project_parties')).toMatch(/status in \('invited', 'active', 'paused', 'left', 'removed'\)/i);
    expect(sql).toMatch(/project_parties_project_contractor_uidx/i);
    expect(sql).toMatch(/project_parties_project_homeowner_uidx/i);

    expect(tableBlock(sql, 'project_party_memberships')).toMatch(/project_party_id uuid not null references public\.project_parties\(id\) on delete restrict/i);
    expect(tableBlock(sql, 'project_party_memberships')).toMatch(/user_id uuid not null references public\.profiles\(id\) on delete restrict/i);
    expect(tableBlock(sql, 'project_party_memberships')).toMatch(/status in \('active', 'paused', 'revoked'\)/i);
    expect(sql).toMatch(/project_party_memberships_active_user_uidx[\s\S]*where status = 'active'/i);

    expect(tableBlock(sql, 'project_authority_assignments')).toMatch(/authority_role in \('project_lead', 'controller', 'manager'\)/i);
    expect(tableBlock(sql, 'project_authority_assignments')).toMatch(/status in \('active', 'revoked', 'superseded'\)/i);
    expect(sql).toMatch(/project_authority_assignments_one_active_lead_uidx[\s\S]*authority_role = 'project_lead' and status = 'active'/i);

    expect(tableBlock(sql, 'project_events')).toMatch(/visibility_scope text not null/i);
    expect(tableBlock(sql, 'project_events')).toMatch(/visibility_scope in \([\s\S]*'all_active_participants'[\s\S]*'lead_controllers_managers'[\s\S]*'specific_project_party'[\s\S]*'assigned_contractor_and_lead'[\s\S]*'platform_admin_only'/i);
    expect(tableBlock(sql, 'project_events')).toMatch(/event_type in \([\s\S]*'project_created'[\s\S]*'project_metadata_updated'[\s\S]*'creator_party_activated'[\s\S]*'creator_membership_activated'[\s\S]*'project_lead_assigned'[\s\S]*'job_attached'/i);
    expect(tableBlock(sql, 'project_events')).not.toMatch(/'project_paused'|'project_closed'|'invitation_sent'|'assignment_published'|'successor_assigned'/i);
  });

  test('job association is one project per inspection-backed job and does not touch estimates or invoices', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/alter table public\.inspections[\s\S]*add column if not exists project_id uuid/i);
    expect(sql).toMatch(/constraint inspections_project_id_fkey[\s\S]*foreign key \(project_id\) references public\.projects\(id\) on delete restrict/i);
    expect(sql).toMatch(/create index if not exists inspections_project_idx[\s\S]*on public\.inspections\(project_id\)[\s\S]*where project_id is not null/i);
    expect(sql).not.toMatch(/alter table public\.estimates[\s\S]*project_id/i);
    expect(sql).not.toMatch(/alter table public\.invoices[\s\S]*project_id/i);
    expect(sql).not.toMatch(/create or replace function public\.servsync_detach_job_from_project/i);
  });

  test('runtime gate and allowlist fail closed and are private', () => {
    const sql = read(sqlPath);
    const allowlist = tableBlock(sql, 'project_collaboration_allowed_profiles');

    expect(sql).toMatch(/'project_collaboration_mutations_enabled'[\s\S]*false[\s\S]*on conflict \(setting_key\) do nothing/i);
    expect(allowlist).toMatch(/profile_id uuid primary key references public\.profiles\(id\) on delete restrict/i);
    expect(allowlist).toMatch(/enabled boolean not null default true/i);
    expect(allowlist).toMatch(/expires_at timestamptz/i);
    expect(allowlist).toMatch(/revoked_at timestamptz/i);
    expect(sql).toMatch(/create or replace function public\.current_user_project_collaboration_allowed\(\)/i);
    expect(sql).toMatch(/auth\.uid\(\) is not null[\s\S]*project_collaboration_mutations_enabled[\s\S]*ap\.enabled = true[\s\S]*ap\.revoked_at is null[\s\S]*ap\.expires_at is null or ap\.expires_at > now\(\)/i);
    expect(sql).not.toMatch(/current_user_is_platform_admin\(\)[\s\S]{0,240}project_collaboration_allowed/i);
    expect(sql).not.toMatch(/grant\s+.*on table public\.project_collaboration_allowed_profiles/i);
  });

  test('RPCs are guarded, contractor-led only, and do not accept arbitrary event JSON', () => {
    const sql = read(sqlPath);

    for (const rpc of ['servsync_create_project', 'servsync_update_project', 'servsync_attach_job_to_project']) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${rpc}`, 'i'));
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*security definer[\\s\\S]*set search_path = public`, 'i'));
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*current_user_project_collaboration_allowed\\(\\)`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${rpc}[\\s\\S]*from public`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${rpc}[\\s\\S]*from anon`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*to authenticated`, 'i'));
      expect(sql).not.toMatch(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*p_event_details`, 'i'));
      expect(sql).not.toMatch(new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*p_metadata`, 'i'));
    }

    expect(sql).toMatch(/current_user_project_company_role\(p_contractor_id\) in \('owner', 'admin'\)/i);
    expect(sql).not.toMatch(/current_user_project_company_role\(p_contractor_id\) in \('owner', 'admin', 'office'/i);
    expect(sql).not.toMatch(/field_tech[\s\S]{0,120}can_create_hidden_project/i);
    expect(sql).not.toMatch(/viewer[\s\S]{0,120}can_create_hidden_project/i);
    expect(sql).toMatch(/current_user_can_manage_hidden_project\(p_project_id\)/i);
    expect(sql).toMatch(/current_user_can_write_contractor_jobs\(v_job\.contractor_id\)/i);
  });

  test('SQL does not broaden estimate or invoice financial visibility', () => {
    const sql = read(sqlPath);

    expect(sql).not.toMatch(/create policy[\s\S]*estimates[\s\S]*project/i);
    expect(sql).not.toMatch(/create policy[\s\S]*invoices[\s\S]*project/i);
    expect(sql).not.toMatch(/current_user_can_view_project[\s\S]*estimates|current_user_can_view_project[\s\S]*invoices/i);
    expect(sql).not.toMatch(/view_project_subcontractor_financials/i);
    expect(sql).not.toMatch(/current_user_can_manage_contractor_billing[\s\S]*project/i);
  });

  test('TypeScript exposes hidden foundation types without UI wiring', () => {
    const app = read(appPath);
    const types = read(typesPath);

    expect(types).toMatch(/export type ProjectStatus = 'active' \| 'paused' \| 'closed';/);
    expect(types).toMatch(/export type ProjectPartyType = 'contractor_company' \| 'homeowner';/);
    expect(types).toMatch(/export type ProjectAuthorityRole = 'project_lead' \| 'controller' \| 'manager';/);
    expect(types).toMatch(/export type ProjectEventVisibilityScope =/);
    expect(types).toMatch(/export interface Project/);
    expect(types).toMatch(/export interface ProjectParty/);
    expect(types).toMatch(/export interface ProjectPartyMembership/);
    expect(types).toMatch(/export interface ProjectAuthorityAssignment/);
    expect(types).toMatch(/export interface ProjectEvent/);
    expect(types).toMatch(/project_id\?: string \| null;/);
    expect(app).not.toMatch(/servsync_create_project|servsync_update_project|servsync_attach_job_to_project|Project Collaboration|project_collaboration/i);
  });

  test('security catalog and docs record hidden foundation-only scope', () => {
    const catalog = read(securityCatalogPath);
    const docs = [read(backlogPath), read(changelogPath), read(masterPlanPath)].join('\n');
    const spec = read(specPath);

    for (const tableName of [
      'projects',
      'project_parties',
      'project_party_memberships',
      'project_authority_assignments',
      'project_events',
      'project_collaboration_allowed_profiles',
    ]) {
      expect(catalog).toContain(`'${tableName}'`);
    }

    for (const rpc of ['servsync_create_project', 'servsync_update_project', 'servsync_attach_job_to_project']) {
      expect(catalog).toContain(`'${rpc}'`);
    }

    expect(docs).toMatch(/Project Collaboration/i);
    expect(docs).toMatch(/hidden foundation/i);
    expect(docs).toMatch(/disabled by default/i);
    expect(docs).toMatch(/No UI[\s\S]{0,160}Project Board/i);
    expect(docs).toMatch(/No UI[\s\S]{0,220}financial sharing/i);
    expect(spec).toMatch(/Project membership does not create financial-document access/i);
    expect(spec).toMatch(/does not authorize implementation by itself/i);
  });
});
