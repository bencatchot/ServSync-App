-- ServSync FB-020 Slice 3B
-- Contractor billing permission helper and money-action authorization split.
--
-- This patch separates contractor billing/money permissions from operational
-- job-write permissions. It keeps field technicians eligible for job execution
-- paths through current_user_can_write_contractor_jobs, but requires owner,
-- admin, office, or platform-admin access for invoice and price-bearing work
-- item actions.

begin;

create or replace function public.current_user_can_manage_contractor_billing(
  p_contractor_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
        from public.contractor_profiles cp
       where cp.id = p_contractor_id
         and cp.owner_user_id = auth.uid()
    )
    or exists (
      select 1
        from public.contractor_team_members ctm
       where ctm.contractor_id = p_contractor_id
         and ctm.user_id = auth.uid()
         and ctm.status = 'active'
         and ctm.role in ('admin', 'office')
    )
    or public.current_user_is_platform_admin();
$$;

revoke all on function public.current_user_can_manage_contractor_billing(uuid) from public;
revoke all on function public.current_user_can_manage_contractor_billing(uuid) from anon;
revoke all on function public.current_user_can_manage_contractor_billing(uuid) from authenticated;
grant execute on function public.current_user_can_manage_contractor_billing(uuid) to authenticated;

create or replace function pg_temp.servsync_replace_function_auth(
  p_function regprocedure,
  p_old text,
  p_new text,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p_function)
    into v_definition;

  if v_definition is null then
    raise exception 'Function % does not exist.', p_label;
  end if;

  if position(p_new in v_definition) > 0 then
    raise notice 'Function % already uses billing helper.', p_label;
    return;
  end if;

  if position(p_old in v_definition) = 0 then
    raise exception 'Function % does not contain expected authorization check.', p_label;
  end if;

  execute replace(v_definition, p_old, p_new);
end;
$$;

select pg_temp.servsync_replace_function_auth(
  'public.servsync_create_invoice_from_estimate(uuid)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_estimate.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_estimate.contractor_id)',
  'servsync_create_invoice_from_estimate(uuid)'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_create_invoice_from_job(uuid)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_job.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_job.contractor_id)',
  'servsync_create_invoice_from_job(uuid)'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_create_partial_invoice_from_job(uuid, uuid[])'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_job.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_job.contractor_id)',
  'servsync_create_partial_invoice_from_job(uuid, uuid[])'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_send_invoice(uuid)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_invoice.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_invoice.contractor_id)',
  'servsync_send_invoice(uuid)'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_void_invoice(uuid)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_invoice.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_invoice.contractor_id)',
  'servsync_void_invoice(uuid)'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_mark_invoice_paid(uuid)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_invoice.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_invoice.contractor_id)',
  'servsync_mark_invoice_paid(uuid)'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_job.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_job.contractor_id)',
  'servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text)'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_item.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_item.contractor_id)',
  'servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text)'
);

select pg_temp.servsync_replace_function_auth(
  'public.servsync_remove_job_work_item(uuid)'::regprocedure,
  'public.current_user_can_write_contractor_jobs(v_item.contractor_id)',
  'public.current_user_can_manage_contractor_billing(v_item.contractor_id)',
  'servsync_remove_job_work_item(uuid)'
);

revoke execute on function public.servsync_create_invoice_from_estimate(uuid) from public;
revoke execute on function public.servsync_create_invoice_from_estimate(uuid) from anon;
grant execute on function public.servsync_create_invoice_from_estimate(uuid) to authenticated;

revoke execute on function public.servsync_create_invoice_from_job(uuid) from public;
revoke execute on function public.servsync_create_invoice_from_job(uuid) from anon;
grant execute on function public.servsync_create_invoice_from_job(uuid) to authenticated;

revoke execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) from public;
revoke execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) from anon;
grant execute on function public.servsync_create_partial_invoice_from_job(uuid, uuid[]) to authenticated;

revoke execute on function public.servsync_send_invoice(uuid) from public;
revoke execute on function public.servsync_send_invoice(uuid) from anon;
grant execute on function public.servsync_send_invoice(uuid) to authenticated;

revoke execute on function public.servsync_void_invoice(uuid) from public;
revoke execute on function public.servsync_void_invoice(uuid) from anon;
grant execute on function public.servsync_void_invoice(uuid) to authenticated;

revoke execute on function public.servsync_mark_invoice_paid(uuid) from public;
revoke execute on function public.servsync_mark_invoice_paid(uuid) from anon;
grant execute on function public.servsync_mark_invoice_paid(uuid) to authenticated;

revoke execute on function public.servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text) from public;
revoke execute on function public.servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text) from anon;
grant execute on function public.servsync_create_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text, text) to authenticated;

revoke execute on function public.servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text) from public;
revoke execute on function public.servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text) from anon;
grant execute on function public.servsync_update_job_work_item(uuid, text, text, text, text, numeric, text, integer, numeric, boolean, text) to authenticated;

revoke execute on function public.servsync_remove_job_work_item(uuid) from public;
revoke execute on function public.servsync_remove_job_work_item(uuid) from anon;
grant execute on function public.servsync_remove_job_work_item(uuid) to authenticated;

drop policy if exists "Invoices: contractor team creates" on public.invoices;
create policy "Invoices: contractor team creates"
  on public.invoices for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_billing(contractor_id)
  );

drop policy if exists "Invoices: contractor team updates" on public.invoices;
create policy "Invoices: contractor team updates"
  on public.invoices for update to authenticated
  using (
    public.current_user_can_manage_contractor_billing(contractor_id)
  )
  with check (
    public.current_user_can_manage_contractor_billing(contractor_id)
  );

drop policy if exists "Invoices: contractor team deletes drafts" on public.invoices;
create policy "Invoices: contractor team deletes drafts"
  on public.invoices for delete to authenticated
  using (
    status = 'draft'
    and public.current_user_can_manage_contractor_billing(contractor_id)
  );

drop policy if exists "Invoice lines: contractor team creates" on public.invoice_line_items;
create policy "Invoice lines: contractor team creates"
  on public.invoice_line_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  );

drop policy if exists "Invoice lines: contractor team updates" on public.invoice_line_items;
create policy "Invoice lines: contractor team updates"
  on public.invoice_line_items for update to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  );

drop policy if exists "Invoice lines: contractor team deletes drafts" on public.invoice_line_items;
create policy "Invoice lines: contractor team deletes drafts"
  on public.invoice_line_items for delete to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_line_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  );

drop policy if exists "Job work items: contractor team creates" on public.job_work_items;
create policy "Job work items: contractor team creates"
  on public.job_work_items for insert to authenticated
  with check (
    public.current_user_can_manage_contractor_billing(contractor_id)
    and exists (
      select 1
        from public.inspections i
       where i.id = job_work_items.inspection_id
         and i.contractor_id = job_work_items.contractor_id
    )
  );

drop policy if exists "Job work items: contractor team updates" on public.job_work_items;
create policy "Job work items: contractor team updates"
  on public.job_work_items for update to authenticated
  using (
    public.current_user_can_manage_contractor_billing(contractor_id)
  )
  with check (
    public.current_user_can_manage_contractor_billing(contractor_id)
    and exists (
      select 1
        from public.inspections i
       where i.id = job_work_items.inspection_id
         and i.contractor_id = job_work_items.contractor_id
    )
  );

drop policy if exists "Job work items: contractor team deletes unbilled" on public.job_work_items;
create policy "Job work items: contractor team deletes unbilled"
  on public.job_work_items for delete to authenticated
  using (
    billing_status in ('unbilled', 'not_billable')
    and public.current_user_can_manage_contractor_billing(contractor_id)
  );

drop policy if exists "Invoice backlog items: contractor team creates" on public.invoice_backlog_items;
create policy "Invoice backlog items: contractor team creates"
  on public.invoice_backlog_items for insert to authenticated
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  );

drop policy if exists "Invoice backlog items: contractor team updates drafts" on public.invoice_backlog_items;
create policy "Invoice backlog items: contractor team updates drafts"
  on public.invoice_backlog_items for update to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  )
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  );

drop policy if exists "Invoice backlog items: contractor team deletes drafts" on public.invoice_backlog_items;
create policy "Invoice backlog items: contractor team deletes drafts"
  on public.invoice_backlog_items for delete to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_backlog_items.invoice_id
         and i.status = 'draft'
         and public.current_user_can_manage_contractor_billing(i.contractor_id)
    )
  );

notify pgrst, 'reload schema';

commit;
