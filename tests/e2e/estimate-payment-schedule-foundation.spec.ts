import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-estimate-payment-schedule-foundation.sql');
const appPath = resolve(process.cwd(), 'src/App.tsx');
const typesPath = resolve(process.cwd(), 'src/types.ts');
const securityCatalogPath = resolve(process.cwd(), 'tests/e2e/security-catalog.spec.ts');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test.describe('estimate payment schedule foundation source checks', () => {
  test('SQL creates provider-neutral schedule table with approved fields and constraints', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/create table if not exists public\.estimate_payment_schedule_items/i);
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
    expect(sql).toMatch(/estimate_id uuid not null references public\.estimates\(id\) on delete cascade/i);
    expect(sql).toMatch(/linked_invoice_id uuid references public\.invoices\(id\) on delete set null/i);
    expect(sql).toMatch(/invoice_type text not null/i);
    expect(sql).toMatch(/invoice_type in \('total', 'deposit', 'progress', 'final'\)/i);
    expect(sql).toMatch(/amount_type text not null/i);
    expect(sql).toMatch(/amount_type in \('fixed', 'percentage'\)/i);
    expect(sql).toMatch(/amount_value numeric\(12,2\) not null/i);
    expect(sql).toMatch(/amount_value >= 0/i);
    expect(sql).toMatch(/calculated_amount_cents integer not null default 0/i);
    expect(sql).toMatch(/calculated_amount_cents >= 0/i);
    expect(sql).toMatch(/sort_order integer not null default 0/i);
    expect(sql).toMatch(/create index if not exists estimate_payment_schedule_items_estimate_sort_idx\s+on public\.estimate_payment_schedule_items\(estimate_id, sort_order\)/i);
    expect(sql).toMatch(/create index if not exists estimate_payment_schedule_items_linked_invoice_idx\s+on public\.estimate_payment_schedule_items\(linked_invoice_id\)\s+where linked_invoice_id is not null/i);
  });

  test('SQL does not backfill legacy estimates with schedule rows', () => {
    const sql = read(sqlPath);

    expect(sql).not.toMatch(/insert into public\.estimate_payment_schedule_items/i);
    expect(sql).not.toMatch(/update public\.estimate_payment_schedule_items/i);
    expect(sql).toMatch(/Existing estimates without rows remain valid legacy estimates/i);
  });

  test('RLS grants no public or anon access and keeps schedule management on billing boundary', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/alter table public\.estimate_payment_schedule_items enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.estimate_payment_schedule_items from public/i);
    expect(sql).toMatch(/revoke all on table public\.estimate_payment_schedule_items from anon/i);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.estimate_payment_schedule_items to authenticated/i);
    expect(sql).toMatch(/current_user_can_access_contractor\(e\.contractor_id\)/i);
    expect(sql).toMatch(/current_user_can_manage_contractor_billing\(e\.contractor_id\)/i);
    expect(sql).not.toMatch(/current_user_can_write_contractor_jobs\(e\.contractor_id\)/i);
    expect(sql).toMatch(/e\.status = 'draft'[\s\S]*current_user_can_manage_contractor_billing\(e\.contractor_id\)/i);
  });

  test('homeowner schedule reads stay non-draft and home-scoped', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/create policy "Estimate payment schedule: homeowner reads non-draft"/i);
    expect(sql).toMatch(/e\.status <> 'draft'/i);
    expect(sql).toMatch(/e\.homeowner_user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/current_user_can_access_home\(e\.home_id\)/i);
    expect(sql).not.toMatch(/current_user_can_manage_home\(e\.home_id\)/i);
  });

  test('TypeScript and estimate selects expose schedule items without UI behavior', () => {
    const types = read(typesPath);
    const app = read(appPath);

    expect(types).toMatch(/export type EstimatePaymentScheduleInvoiceType = InvoiceType;/);
    expect(types).toMatch(/export type EstimatePaymentScheduleAmountType = 'fixed' \| 'percentage';/);
    expect(types).toMatch(/export interface EstimatePaymentScheduleItem/);
    expect(types).toMatch(/payment_schedule_items\?: EstimatePaymentScheduleItem\[\];/);
    expect(app).toMatch(/payment_schedule_items:estimate_payment_schedule_items\(\*\)/);
    expect(app).not.toMatch(/servsync_create_invoice_from_schedule/i);
  });

  test('security catalog includes the schedule table as a private RLS table', () => {
    const catalog = read(securityCatalogPath);

    expect(catalog).toMatch(/'estimate_payment_schedule_items'/);
  });

  test('QuickBooks/accounting sync stays provider-neutral for future mapping', () => {
    const sql = read(sqlPath);
    const tableBlock = sql.match(/create table if not exists public\.estimate_payment_schedule_items[\s\S]*?\);/i)?.[0] ?? '';

    expect(tableBlock).not.toMatch(/quickbooks|qbo|intuit|external_accounting_id/i);
    expect(sql).toMatch(/External accounting IDs such as QuickBooks IDs should live in a future provider-neutral mapping table/i);
  });
});
