import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-multiple-invoices-foundation.sql');
const appPath = resolve(process.cwd(), 'src/App.tsx');
const typesPath = resolve(process.cwd(), 'src/types.ts');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test.describe('multiple invoices from one estimate foundation source checks', () => {
  test('SQL adds invoice type and nullable positive sequence without one-invoice uniqueness', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/add column if not exists invoice_type text not null default 'total'/i);
    expect(sql).toMatch(/alter column invoice_type set default 'total'/i);
    expect(sql).toMatch(/alter column invoice_type set not null/i);
    expect(sql).toMatch(/add column if not exists invoice_sequence integer/i);
    expect(sql).toMatch(/constraint invoices_invoice_type_check/i);
    expect(sql).toMatch(/invoice_type in \('total', 'deposit', 'progress', 'final'\)/i);
    expect(sql).toMatch(/constraint invoices_invoice_sequence_positive_check/i);
    expect(sql).toMatch(/invoice_sequence is null or invoice_sequence > 0/i);
    expect(sql).toMatch(/create index if not exists invoices_estimate_status_type_idx/i);
    expect(sql).toMatch(/create index if not exists invoices_estimate_sequence_idx/i);
    const uniqueLines = sql
      .split('\n')
      .filter(line => /\bunique\b/i.test(line) || /create unique index/i.test(line));
    expect(uniqueLines.join('\n')).not.toMatch(/estimate_id/i);
    expect(uniqueLines.join('\n')).not.toMatch(/invoice_type/i);
  });

  test('SQL backfills progress invoices from job-work-item invoice lines', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/update public\.invoices i\s+set invoice_type = 'progress'/i);
    expect(sql).toMatch(/from public\.invoice_line_items ili/i);
    expect(sql).toMatch(/ili\.invoice_id = i\.id/i);
    expect(sql).toMatch(/ili\.job_work_item_id is not null/i);
  });

  test('partial job/work-item invoice RPC explicitly creates progress invoices', () => {
    const sql = read(sqlPath);
    const match = sql.match(
      /create or replace function public\.servsync_create_partial_invoice_from_job[\s\S]*?revoke execute on function public\.servsync_create_partial_invoice_from_job/i,
    );

    expect(match, 'Partial invoice RPC replacement should be present').toBeTruthy();
    const rpcSql = match![0];
    expect(rpcSql).toMatch(/security definer/i);
    expect(rpcSql).toMatch(/set search_path = public/i);
    expect(rpcSql).toMatch(/current_user_can_manage_contractor_billing\(v_job\.contractor_id\)/i);
    expect(rpcSql).not.toMatch(/current_user_can_write_contractor_jobs\(v_job\.contractor_id\)/i);
    expect(rpcSql).toMatch(/insert into public\.invoices \([\s\S]*estimate_id,\s+invoice_type,/i);
    expect(rpcSql).toMatch(/v_job\.estimate_id,\s+'progress',/i);
    expect(sql).toMatch(/grant execute on function public\.servsync_create_partial_invoice_from_job\(uuid, uuid\[\]\) to authenticated/i);
    expect(sql).not.toMatch(/create or replace function public\.servsync_create_invoice_from_estimate/i);
  });

  test('app invoice select and types expose the foundation fields', () => {
    const app = read(appPath);
    const types = read(typesPath);

    expect(types).toMatch(/export type InvoiceType = 'total' \| 'deposit' \| 'progress' \| 'final'/);
    expect(types).toMatch(/invoice_type: InvoiceType;/);
    expect(types).toMatch(/invoice_sequence\?: number \| null;/);
    expect(app).toMatch(/const INVOICE_WITH_LINES_SELECT = '[^']*invoice_number, invoice_type, invoice_sequence,/);
  });
});
