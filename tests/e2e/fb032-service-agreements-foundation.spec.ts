import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-service-agreements-foundation.sql');
const sql = readFileSync(sqlPath, 'utf8');
const compactSql = sql.replace(/\s+/g, ' ').toLowerCase();

function occurrences(pattern: RegExp) {
  return sql.match(pattern)?.length ?? 0;
}

test.describe('FB-032 service agreements SQL foundation source guardrails', () => {
  test('defines the narrow foundation tables and defers visits', () => {
    for (const table of [
      'service_agreement_templates',
      'service_agreement_offers',
      'service_agreements',
    ]) {
      expect(sql, `${table} should be created`).toContain(`create table if not exists public.${table}`);
      expect(sql, `${table} should enable RLS`).toContain(`alter table public.${table} enable row level security`);
      expect(sql, `${table} should revoke public table privileges`).toContain(`revoke all on table public.${table} from public`);
      expect(sql, `${table} should revoke anon table privileges`).toContain(`revoke all on table public.${table} from anon`);
      expect(sql, `${table} should revoke authenticated table write privileges before selective grants`).toContain(
        `revoke all on table public.${table} from authenticated`,
      );
      expect(sql, `${table} should grant read-only browser access behind RLS`).toContain(
        `grant select on table public.${table} to authenticated`,
      );
    }

    expect(sql).not.toContain('create table if not exists public.service_agreement_visits');
    expect(sql).not.toContain('public.service_agreement_visits');
  });

  test('keeps contractor management role scoped to owner, admin, office, or platform admin', () => {
    expect(sql).toContain('create or replace function public.current_user_can_manage_service_agreements');
    expect(sql).toMatch(/language sql\s+security definer\s+set search_path = public\s+stable/i);
    expect(sql).toContain("tm.role in ('admin', 'office')");
    expect(sql).not.toContain("tm.role in ('admin', 'office', 'field_tech')");
    expect(sql).toContain('or public.current_user_is_platform_admin()');
  });

  test('defines browser-callable RPCs with hardened grants', () => {
    const rpcs = [
      'current_user_can_manage_service_agreements',
      'servsync_create_service_agreement_template',
      'servsync_update_service_agreement_template',
      'servsync_create_service_agreement_offer',
      'servsync_send_service_agreement_offer',
      'servsync_homeowner_respond_to_service_agreement_offer',
    ];

    for (const rpc of rpcs) {
      expect(sql, `${rpc} should be defined`).toContain(`create or replace function public.${rpc}`);
      expect(sql, `${rpc} should be SECURITY DEFINER`).toMatch(
        new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?security definer[\\s\\S]*?set search_path = public`, 'i'),
      );
      expect(sql, `${rpc} should deny PUBLIC execute`).toMatch(
        new RegExp(`revoke (all on function|execute on function) public\\.${rpc}[\\s\\S]*? from public`, 'i'),
      );
      expect(sql, `${rpc} should deny anon execute`).toMatch(
        new RegExp(`revoke (all on function|execute on function) public\\.${rpc}[\\s\\S]*? from anon`, 'i'),
      );
      expect(sql, `${rpc} should grant authenticated execute`).toMatch(
        new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*? to authenticated`, 'i'),
      );
    }
  });

  test('keeps offers property-scoped and hides drafts from homeowners', () => {
    expect(sql).toContain("where id = p_connection_id\n     and status = 'active'");
    expect(compactSql).toContain('from public.connection_shared_properties csp join public.homes h on h.id = csp.home_id');
    expect(compactSql).toContain('where csp.connection_id = p_connection_id and csp.home_id = p_home_id');
    expect(compactSql).toContain('and h.homeowner_user_id = v_connection.homeowner_user_id');
    expect(compactSql).not.toContain('from public.homes h where h.id = p_home_id and h.homeowner_user_id = v_connection.homeowner_user_id');
    expect(sql).toContain('Selected home is not approved for this contractor connection.');
    expect(sql).toContain('and contractor_id = v_connection.contractor_id');
    expect(sql).toContain("and status = 'active'");
    expect(sql).toContain("homeowner_user_id = auth.uid()\n    and status <> 'draft'");
    expect(sql).toContain("v_existing.status <> 'draft'");
    expect(sql).toContain("set status = 'sent',\n         sent_at = now()");
  });

  test('homeowner response is single-use and creates an agreement only on accept', () => {
    expect(sql).toContain("v_response not in ('accepted', 'declined')");
    expect(sql).toContain('if v_offer.homeowner_user_id <> auth.uid() then');
    expect(sql).toContain("if v_offer.status <> 'sent' then");
    expect(sql).toContain("set status = v_response,\n         responded_at = now()");
    expect(sql).toMatch(/if v_response = 'accepted' then\s+insert into public\.service_agreements/i);
    expect(occurrences(/insert into public\.service_agreements/g)).toBe(1);
    expect(sql).toContain('offer_id uuid not null unique references public.service_agreement_offers');
  });

  test('does not introduce payments, external delivery, job, invoice, reminder, or visit automation', () => {
    const forbidden = [
      /stripe/i,
      /quickbooks/i,
      /autopay/i,
      /insert into public\.inspections/i,
      /insert into public\.invoices/i,
      /insert into public\.invoice_line_items/i,
      /insert into public\.service_request_appointments/i,
      /insert into public\.contractor_visit_events/i,
      /insert into public\.home_reminders/i,
      /insert into public\.notifications/i,
      /send-notification-email/i,
      /send-home-access-invite-email/i,
    ];

    for (const pattern of forbidden) {
      expect(sql, `SQL patch should not match forbidden automation pattern ${pattern}`).not.toMatch(pattern);
    }
  });
});
