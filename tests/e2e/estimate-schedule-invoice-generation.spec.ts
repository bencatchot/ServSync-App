import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-estimate-schedule-invoice-generation.sql');
const appPath = resolve(process.cwd(), 'src/App.tsx');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test.describe('estimate schedule invoice generation RPC source checks', () => {
  test('SQL defines a narrow security-definer schedule invoice RPC', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/create or replace function public\.servsync_create_invoice_from_estimate_schedule_item\(\s*p_schedule_item_id uuid\s*\)/i);
    expect(sql).toMatch(/returns jsonb/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public/i);
    expect(sql).toMatch(/if auth\.uid\(\) is null then/i);
    expect(sql).toMatch(/raise exception 'Authentication is required\.'/i);
    expect(sql).toMatch(/grant execute on function public\.servsync_create_invoice_from_estimate_schedule_item\(uuid\) to authenticated/i);
    expect(sql).toMatch(/revoke execute on function public\.servsync_create_invoice_from_estimate_schedule_item\(uuid\) from public/i);
    expect(sql).toMatch(/revoke execute on function public\.servsync_create_invoice_from_estimate_schedule_item\(uuid\) from anon/i);
  });

  test('RPC locks one schedule row, requires accepted estimate, and prevents duplicates', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('servsync-estimate-schedule-invoice-' \|\| p_schedule_item_id::text\)\)/i);
    expect(sql).toMatch(/from public\.estimate_payment_schedule_items[\s\S]*where id = p_schedule_item_id[\s\S]*for update/i);
    expect(sql).toMatch(/from public\.estimates[\s\S]*where id = v_schedule\.estimate_id[\s\S]*for update/i);
    expect(sql).toMatch(/v_estimate\.status <> 'accepted'/i);
    expect(sql).toMatch(/Only accepted estimate payment schedule items can create invoices/i);
    expect(sql).toMatch(/v_schedule\.linked_invoice_id is not null/i);
    expect(sql).toMatch(/This payment schedule item already has an invoice/i);
    expect(sql).toMatch(/update public\.estimate_payment_schedule_items[\s\S]*set linked_invoice_id = v_invoice\.id[\s\S]*where id = v_schedule\.id[\s\S]*and linked_invoice_id is null/i);
  });

  test('RPC uses contractor billing permission boundary, not general job-write access', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/current_user_can_manage_contractor_billing\(v_estimate\.contractor_id\)/i);
    expect(sql).not.toMatch(/current_user_can_write_contractor_jobs/i);
    expect(sql).not.toMatch(/current_user_can_access_contractor\(v_estimate\.contractor_id\)/i);
  });

  test('RPC creates exactly one draft invoice from schedule fields', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/insert into public\.invoices \([\s\S]*invoice_type,[\s\S]*invoice_sequence,[\s\S]*status,[\s\S]*subtotal_cents,[\s\S]*total_cents,[\s\S]*amount_paid_cents/i);
    expect(sql).toMatch(/v_schedule\.invoice_type,\s+v_schedule\.sort_order \+ 1/i);
    expect(sql).toMatch(/'draft',\s+v_schedule\.calculated_amount_cents/i);
    expect(sql).toMatch(/v_schedule\.calculated_amount_cents,\s+0\s+\)\s+returning \* into v_invoice/i);
    expect(sql).not.toMatch(/insert into public\.invoices[\s\S]*select[\s\S]*from public\.estimate_line_items/i);
    expect(sql).not.toMatch(/from public\.estimate_line_items/i);
  });

  test('RPC creates one schedule-billing line item from calculated amount', () => {
    const sql = read(sqlPath);
    const lineInsert = sql.match(/insert into public\.invoice_line_items \([\s\S]*?\);/i)?.[0] ?? '';

    expect(lineInsert).toMatch(/line_type/i);
    expect(lineInsert).toMatch(/'fee'/i);
    expect(lineInsert).toMatch(/description/i);
    expect(lineInsert).toMatch(/line_title/i);
    expect(lineInsert).toMatch(/quantity/i);
    expect(lineInsert).toMatch(/unit_price_cents/i);
    expect(lineInsert).toMatch(/v_schedule\.calculated_amount_cents/i);
    expect(lineInsert).not.toMatch(/public\.estimate_line_items/i);
    expect((sql.match(/insert into public\.invoice_line_items/gi) ?? []).length).toBe(1);
  });

  test('RPC returns future-UI identifiers without side effects outside draft creation', () => {
    const sql = read(sqlPath);
    const app = read(appPath);

    expect(sql).toMatch(/jsonb_build_object\([\s\S]*'invoice_id', v_invoice\.id,[\s\S]*'schedule_item_id', v_schedule\.id,[\s\S]*'created', true/i);
    expect(sql).not.toMatch(/create table|alter table|create policy|alter policy|drop policy/i);
    expect(sql).not.toMatch(/servsync_send_invoice|servsync_mark_invoice_paid|servsync_file_invoice_to_home_history/i);
    expect(sql).not.toMatch(/stripe|quickbooks|qbo|intuit|twilio|sendgrid|sms|push|notification|home_history/i);
    expect(app).not.toContain('servsync_create_invoice_from_estimate_schedule_item');
    expect(app).not.toContain('beginInvoiceDraftFromPaymentSchedule');
  });
});
