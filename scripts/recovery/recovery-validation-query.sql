with counts as (
  select * from (values
    ('auth_users', (select count(*) from auth.users)),
    ('profiles', (select count(*) from public.profiles)),
    ('contractor_profiles', (select count(*) from public.contractor_profiles)),
    ('contractor_team_members', (select count(*) from public.contractor_team_members)),
    ('homeowner_profiles', (select count(*) from public.homeowner_profiles)),
    ('local_contacts', (select count(*) from public.contractor_local_contacts)),
    ('local_homes', (select count(*) from public.contractor_local_homes)),
    ('homes', (select count(*) from public.homes)),
    ('drafts', (select count(*) from public.contractor_work_drafts)),
    ('draft_items', (select count(*) from public.contractor_work_draft_items)),
    ('estimates', (select count(*) from public.estimates)),
    ('estimate_lines', (select count(*) from public.estimate_line_items)),
    ('jobs', (select count(*) from public.inspections)),
    ('job_work_items', (select count(*) from public.job_work_items)),
    ('invoices', (select count(*) from public.invoices)),
    ('invoice_lines', (select count(*) from public.invoice_line_items)),
    ('offline_payments', (select count(*) from public.invoice_offline_payment_records)),
    ('online_payment_attempts', (select count(*) from public.invoice_online_payment_attempts)),
    ('home_history', (select count(*) from public.home_maintenance_log)),
    ('reminders', (select count(*) from public.home_reminders)),
    ('price_book_items', (select count(*) from public.contractor_price_book_items)),
    ('price_book_costs', (select count(*) from public.contractor_price_book_item_costs)),
    ('import_sources', (select count(*) from public.contractor_price_book_import_sources)),
    ('import_batches', (select count(*) from public.contractor_price_book_import_batches)),
    ('import_rows', (select count(*) from public.contractor_price_book_import_batch_rows)),
    ('rollback_batches', (select count(*) from public.contractor_price_book_import_rollback_batches)),
    ('rollback_rows', (select count(*) from public.contractor_price_book_import_rollback_rows)),
    ('assets', (select count(*) from public.home_assets)),
    ('asset_revisions', (select count(*) from public.home_asset_revisions)),
    ('trade_sections', (select count(*) from public.trade_section_instances)),
    ('trade_section_revisions', (select count(*) from public.trade_section_revisions)),
    ('storage_buckets', (select count(*) from storage.buckets)),
    ('storage_object_metadata', (select count(*) from storage.objects))
  ) values_table(name, row_count)
), relationship_violations as (
  select * from (values
    ('profile_auth', (select count(*) from public.profiles child left join auth.users parent on parent.id = child.id where parent.id is null)),
    ('contractor_owner_auth', (select count(*) from public.contractor_profiles child left join auth.users parent on parent.id = child.owner_user_id where parent.id is null)),
    ('team_contractor', (select count(*) from public.contractor_team_members child left join public.contractor_profiles parent on parent.id = child.contractor_id where parent.id is null)),
    ('team_auth', (select count(*) from public.contractor_team_members child left join auth.users parent on parent.id = child.user_id where parent.id is null)),
    ('homeowner_auth', (select count(*) from public.homeowner_profiles child left join auth.users parent on parent.id = child.user_id where parent.id is null)),
    ('local_home_contact', (select count(*) from public.contractor_local_homes child left join public.contractor_local_contacts parent on parent.id = child.local_contact_id where parent.id is null)),
    ('home_owner_auth', (select count(*) from public.homes child left join auth.users parent on parent.id = child.homeowner_user_id where parent.id is null)),
    ('draft_item_draft', (select count(*) from public.contractor_work_draft_items child left join public.contractor_work_drafts parent on parent.id = child.draft_id where parent.id is null)),
    ('estimate_line_estimate', (select count(*) from public.estimate_line_items child left join public.estimates parent on parent.id = child.estimate_id where parent.id is null)),
    ('job_work_item_job', (select count(*) from public.job_work_items child left join public.inspections parent on parent.id = child.inspection_id where parent.id is null)),
    ('invoice_line_invoice', (select count(*) from public.invoice_line_items child left join public.invoices parent on parent.id = child.invoice_id where parent.id is null)),
    ('offline_payment_invoice', (select count(*) from public.invoice_offline_payment_records child left join public.invoices parent on parent.id = child.invoice_id where parent.id is null)),
    ('price_book_cost_item', (select count(*) from public.contractor_price_book_item_costs child left join public.contractor_price_book_items parent on parent.id = child.price_book_item_id where parent.id is null)),
    ('import_batch_source', (select count(*) from public.contractor_price_book_import_batches child left join public.contractor_price_book_import_sources parent on parent.id = child.import_source_id where parent.id is null)),
    ('import_row_batch', (select count(*) from public.contractor_price_book_import_batch_rows child left join public.contractor_price_book_import_batches parent on parent.id = child.batch_id where parent.id is null)),
    ('rollback_batch_import', (select count(*) from public.contractor_price_book_import_rollback_batches child left join public.contractor_price_book_import_batches parent on parent.id = child.import_batch_id where parent.id is null)),
    ('rollback_row_batch', (select count(*) from public.contractor_price_book_import_rollback_rows child left join public.contractor_price_book_import_rollback_batches parent on parent.id = child.rollback_batch_id where parent.id is null)),
    ('asset_revision_asset', (select count(*) from public.home_asset_revisions child left join public.home_assets parent on parent.id = child.asset_id where parent.id is null)),
    ('trade_revision_instance', (select count(*) from public.trade_section_revisions child left join public.trade_section_instances parent on parent.id = child.instance_id where parent.id is null))
  ) values_table(name, violation_count)
), financial_violations as (
  select * from (values
    ('negative_total', (select count(*) from public.invoices where total_cents < 0)),
    ('negative_paid', (select count(*) from public.invoices where amount_paid_cents < 0)),
    ('paid_exceeds_total', (select count(*) from public.invoices where amount_paid_cents > total_cents)),
    ('paid_nonzero_balance', (select count(*) from public.invoices where status = 'paid' and total_cents - amount_paid_cents <> 0)),
    ('partial_invalid_balance', (select count(*) from public.invoices where status = 'partially_paid' and (amount_paid_cents <= 0 or total_cents - amount_paid_cents <= 0))),
    ('nonpositive_offline_payment', (select count(*) from public.invoice_offline_payment_records where amount_cents <= 0)),
    ('duplicate_offline_idempotency', (select count(*) from (select contractor_id, idempotency_key from public.invoice_offline_payment_records group by 1, 2 having count(*) > 1) duplicates)),
    ('duplicate_online_idempotency', (select count(*) from (select contractor_id, idempotency_key from public.invoice_online_payment_attempts group by 1, 2 having count(*) > 1) duplicates)),
    ('payment_ledger_mismatch', (
      select count(*)
      from public.invoices invoice
      where invoice.amount_paid_cents
        <> coalesce((select sum(payment.amount_cents) from public.invoice_offline_payment_records payment where payment.invoice_id = invoice.id), 0)
          + coalesce((select sum(attempt.accounted_amount_cents) from public.invoice_online_payment_attempts attempt where attempt.invoice_id = invoice.id), 0)
    ))
  ) values_table(name, violation_count)
)
select jsonb_build_object(
  'counts', (select jsonb_object_agg(name, row_count order by name) from counts),
  'countFingerprint', encode(digest((select string_agg(name || ':' || row_count, ',' order by name) from counts), 'sha256'), 'hex'),
  'relationshipViolations', (select jsonb_object_agg(name, violation_count order by name) from relationship_violations),
  'financialViolations', (select jsonb_object_agg(name, violation_count order by name) from financial_violations),
  'invoiceStatuses', (select coalesce(jsonb_object_agg(status, status_count), '{}'::jsonb) from (select status, count(*) status_count from public.invoices group by status) statuses),
  'storageBuckets', (
    select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket.id, 'public', bucket.public, 'metadataCount', (select count(*) from storage.objects object where object.bucket_id = bucket.id)) order by bucket.id), '[]'::jsonb)
    from storage.buckets bucket
  )
) as result;
