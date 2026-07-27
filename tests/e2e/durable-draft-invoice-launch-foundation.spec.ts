import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-durable-draft-invoice-launch-foundation.sql');

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sqlSource() {
  return readFileSync(sqlPath, 'utf8');
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Durable Draft-to-Invoice launch foundation source checks', () => {
  test('predecessor invoice-column check matches deployed invoice schema names', () => {
    const sql = sqlSource();
    const columnCheck = sourceBetween(
      sql,
      'with expected(table_name, column_name) as (',
      "if v_mismatch is not null then\n    raise exception 'DRAFT_TO_INVOICE_FOUNDATION_COLUMN_MISMATCH",
    );

    for (const column of [
      'id',
      'contractor_id',
      'homeowner_user_id',
      'home_id',
      'local_contact_id',
      'local_home_id',
      'service_request_id',
      'job_id',
      'estimate_id',
      'title',
      'scope',
      'notes',
      'terms',
      'status',
      'invoice_type',
      'labor_mode',
      'labor_rate_cents',
      'job_labor_hours',
      'subtotal_cents',
      'material_total_cents',
      'labor_total_cents',
      'fee_total_cents',
      'other_total_cents',
      'tax_rate_percent',
      'tax_cents',
      'discount_type',
      'discount_value',
      'discount_cents',
      'discount_reason',
      'total_cents',
      'amount_paid_cents',
    ]) {
      expect(columnCheck).toContain(`('invoices', '${column}')`);
    }

    for (const staleColumn of [
      'customer_name',
      'customer_email',
      'description',
      'materials_subtotal_cents',
      'labor_subtotal_cents',
      'payment_terms',
    ]) {
      expect(columnCheck).not.toContain(`('invoices', '${staleColumn}')`);
    }
  });

  test('predecessor line-item column check covers invoice line insert requirements', () => {
    const sql = sqlSource();
    const columnCheck = sourceBetween(
      sql,
      'with expected(table_name, column_name) as (',
      "if v_mismatch is not null then\n    raise exception 'DRAFT_TO_INVOICE_FOUNDATION_COLUMN_MISMATCH",
    );

    for (const column of [
      'invoice_id',
      'line_type',
      'description',
      'line_title',
      'customer_description',
      'quantity',
      'unit',
      'unit_price_cents',
      'labor_hours',
      'sort_order',
    ]) {
      expect(columnCheck).toContain(`('invoice_line_items', '${column}')`);
    }
  });

  test('adds invoice-specific linkage without generalizing existing output references', () => {
    const sql = sqlSource();

    expect(sql).toContain('DRAFT_TO_INVOICE_FOUNDATION_COLUMN_MISMATCH');
    expect(sql).toContain("('invoices', 'invoice_type')");
    expect(sql).toContain("('invoices', 'labor_mode')");
    expect(sql).toContain("('invoice_line_items', 'line_title')");
    expect(sql).toContain("('invoice_line_items', 'customer_description')");
    expect(sql).toContain("intended_output in ('estimate', 'job', 'invoice')");
    expect(sql).toContain("launched_output_type is null or launched_output_type in ('estimate', 'job', 'invoice')");
    expect(sql).toContain("requested_output in ('estimate', 'job', 'invoice')");
    expect(sql).toContain('launched_invoice_id uuid references public.invoices(id) on delete set null');
    expect(sql).toContain('launched_invoice_id_snapshot uuid');
    expect(sql).toContain('contractor_work_draft_launches_invoice_output_unique_idx');
    expect(sql).toContain('contractor_work_draft_launches_invoice_snapshot_unique_idx');
    expect(sql).not.toContain('launched_output_id');
    expect(sql).not.toContain('launched_output_table');
  });

  test('launch constraints keep Estimate, Job, and Invoice linkage mutually exclusive', () => {
    const sql = sqlSource();
    const draftConstraint = sourceBetween(
      sql,
      'add constraint contractor_work_drafts_launch_state_check check',
      'alter table public.contractor_work_draft_launches',
    );
    const launchConstraint = sourceBetween(
      sql,
      'add constraint contractor_work_draft_launches_status_linkage_check check',
      'create unique index if not exists contractor_work_draft_launches_invoice_output_unique_idx',
    );

    expect(draftConstraint).toContain("launched_output_type = 'estimate'");
    expect(draftConstraint).toContain("launched_output_type = 'job'");
    expect(draftConstraint).toContain("launched_output_type = 'invoice'");
    expect(launchConstraint).toContain("requested_output = 'estimate'");
    expect(launchConstraint).toContain("requested_output = 'job'");
    expect(launchConstraint).toContain("requested_output = 'invoice'");

    for (const constraint of [draftConstraint, launchConstraint]) {
      expect(constraint).toContain('launched_invoice_id_snapshot is not null');
      expect(constraint).toContain('launched_estimate_id is null');
      expect(constraint).toContain('launched_job_id is null');
      expect(constraint).toContain('launched_invoice_id is null');
      expect(constraint).toContain('launched_invoice_id is null or launched_invoice_id = launched_invoice_id_snapshot');
    }
    expect(draftConstraint).toContain("status in ('active', 'discarded')");
    expect(draftConstraint).toContain('and launched_invoice_id is null');
    expect(draftConstraint).toContain('and launched_invoice_id_snapshot is null');
  });

  test('save accepts invoice only through standard Drafts with billing authority', () => {
    const sql = sqlSource();
    const saveRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_save_work_draft',
      'create or replace function public.servsync_private_validate_work_draft_relationships',
    );

    expect(saveRpc).toContain("v_intended_output not in ('estimate', 'job', 'invoice')");
    expect(saveRpc).toContain("if v_work_format <> 'standard'");
    expect(saveRpc).toContain("if v_intended_output = 'invoice'");
    expect(saveRpc).toContain('servsync_private_can_create_work_draft_invoice(v_contractor_id)');
    expect(saveRpc).toContain('DRAFT_PERMISSION_DENIED');
    expect(saveRpc).toContain('servsync_private_can_persist_work_draft(v_contractor_id)');
  });

  test('invoice launch helper creates draft invoice lines without customer-facing side effects', () => {
    const sql = sqlSource();
    const helper = sourceBetween(
      sql,
      'create or replace function public.servsync_private_launch_work_draft_as_invoice',
      'create or replace function public.servsync_launch_work_draft',
    );

    expect(helper).toContain('security definer');
    expect(helper).toContain('set search_path = public');
    expect(helper).toContain('servsync_private_can_create_work_draft_invoice(p_draft.contractor_id)');
    expect(helper).toMatch(/insert into public\.invoices \([\s\S]*invoice_type,[\s\S]*status,[\s\S]*subtotal_cents,[\s\S]*total_cents,[\s\S]*amount_paid_cents/i);
    expect(helper).toMatch(/discount_cents,\s+discount_type,\s+discount_value,\s+discount_reason,/i);
    expect(helper).toMatch(/v_subtotal,\s+0,\s+0,\s+0,\s+'amount',\s+0,\s+'',\s+v_subtotal,\s+0\s*\)/i);
    expect(helper).not.toMatch(/'none',\s+0,\s+''/i);
    expect(helper).not.toMatch(/'none',\s+null,\s+''/i);
    expect(helper).toContain("'total'");
    expect(helper).toContain("'draft'");
    expect(helper).toContain("''");
    expect(helper).toContain('Payment is due upon receipt unless otherwise agreed in writing.');
    expect(helper).toMatch(/insert into public\.invoice_line_items \([\s\S]*line_title,[\s\S]*customer_description,[\s\S]*labor_hours,[\s\S]*sort_order/i);
    expect(helper).toContain('row_number() over (order by item.sort_order asc, item.created_at asc, item.id asc) - 1');
    expect(helper).not.toContain('p_draft.private_notes');
    expect(helper).not.toMatch(/status\s*,[\s\S]*'(?:sent|viewed|paid|overdue)'/i);
    expect(helper).not.toMatch(/insert into public\.(?:notifications|activity_events|appointments|storage|home_history|payments)/i);
    expect(helper).not.toMatch(/pdf|finaliz|send/i);
  });

  test('launch RPC handles invoice idempotency, ledger linkage, and deleted-output recovery', () => {
    const sql = sqlSource();
    const launchRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_launch_work_draft',
      'revoke execute on function public.servsync_save_work_draft',
    );

    expect(launchRpc).toContain("v_output_type not in ('estimate', 'job', 'invoice')");
    expect(launchRpc).toContain('v_invoice_id uuid');
    expect(launchRpc).toContain('v_existing_launch.idempotency_key = p_idempotency_key');
    expect(launchRpc).toContain("'invoice_id', v_existing_launch.launched_invoice_id");
    expect(launchRpc).toContain("when v_existing_launch.requested_output = 'job' then v_existing_launch.launched_job_id_snapshot");
    expect(launchRpc).toContain('else v_existing_launch.launched_invoice_id_snapshot');
    expect(launchRpc).toContain("v_draft.launched_output_type = 'invoice'");
    expect(launchRpc).toContain("'invoice_id', v_draft.launched_invoice_id");
    expect(launchRpc).toContain('servsync_private_can_create_work_draft_invoice(v_draft.contractor_id)');
    expect(launchRpc).toContain('servsync_private_launch_work_draft_as_invoice(v_draft)');
    expect(launchRpc).toMatch(/insert into public\.contractor_work_draft_launches \([\s\S]*launched_invoice_id,[\s\S]*launched_invoice_id_snapshot/i);
    expect(launchRpc).toMatch(/update public\.contractor_work_drafts[\s\S]*launched_invoice_id = v_invoice_id,[\s\S]*launched_invoice_id_snapshot = v_invoice_id/i);
    expect(launchRpc).toContain("'invoice_id', v_invoice_id");
    expect(launchRpc).toContain('coalesce(v_estimate_id, v_job_id, v_invoice_id)');
  });

  test('private helpers stay private while public save and launch grants remain authenticated', () => {
    const sql = sqlSource();

    for (const fn of [
      'servsync_private_can_create_work_draft_invoice(uuid)',
      'servsync_private_launch_work_draft_as_invoice(public.contractor_work_drafts)',
      'servsync_private_validate_work_draft_relationships(public.contractor_work_drafts, text)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public`);
      expect(sql).toContain(`revoke all on function public.${fn} from anon`);
      expect(sql).toContain(`revoke all on function public.${fn} from authenticated`);
    }
    expect(sql).toContain('grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated');
    expect(sql).toContain('grant execute on function public.servsync_launch_work_draft(uuid, text, uuid) to authenticated');
  });

  test('relationship validation extends exact property sharing checks to invoice launches', () => {
    const sql = sqlSource();
    const validator = sourceBetween(
      sql,
      'create or replace function public.servsync_private_validate_work_draft_relationships',
      'create or replace function public.servsync_private_launch_work_draft_as_invoice',
    );

    expect(validator).toContain("p_requested_output not in ('estimate', 'job', 'invoice')");
    expect(validator).toContain("if p_requested_output in ('job', 'invoice')");
    expect(validator).toContain('connection_shared_properties');
    expect(validator).toContain('PROPERTY_NOT_SHARED');
    expect(validator).toContain('contractor_local_homes');
    expect(validator).toContain('home.local_contact_id = p_draft.local_contact_id');
  });

  test('frontend contract parses invoice launch responses behind gated app wiring', () => {
    const types = read('src/features/drafts/durableDraftLaunchTypes.ts');
    const api = read('src/features/drafts/durableDraftLaunchApi.ts');
    const composer = read('src/features/drafts/ContractorDraftComposer.tsx');
    const selector = read('src/features/drafts/DraftOutcomeSelector.tsx');

    expect(types).toContain("output_type: 'invoice'");
    expect(types).toContain('invoice_id: string | null');
    expect(api).toContain("value.output_type !== 'estimate' && value.output_type !== 'job' && value.output_type !== 'invoice'");
    expect(api).toContain('const invoiceId = value.invoice_id ?? null');
    expect(api).toContain("if (value.output_type === 'invoice'");
    expect(types).toContain("export type ContractorWorkDraftLaunchOutput = 'estimate' | 'job' | 'invoice'");
    expect(selector).toContain('invoiceAvailable');
    expect(selector).toContain("label: 'Draft Invoice'");
    expect(composer).toContain('invoiceOutputAvailable');
    expect(composer).not.toContain('sendInvoiceToHomeowner');
  });
});
