-- ServSync invoice -> Home History filing.
-- Apply after:
--   - servsync-invoices-schema.sql
--   - servsync-maintenance-log.sql
--   - servsync-maintenance-log-home-id.sql
--
-- This stores a durable structured invoice relationship in Home History
-- without generating duplicate PDF documents.

begin;

alter table public.home_maintenance_log
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

create unique index if not exists maintenance_log_unique_invoice_idx
  on public.home_maintenance_log(invoice_id)
  where invoice_id is not null;

create index if not exists maintenance_log_homeowner_invoice_idx
  on public.home_maintenance_log(homeowner_user_id, invoice_id)
  where invoice_id is not null;

create or replace function public.servsync_file_invoice_to_home_history(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_existing public.home_maintenance_log;
  v_entry public.home_maintenance_log;
  v_contractor_name text;
  v_performed_at date;
begin
  perform pg_advisory_xact_lock(hashtext('servsync-file-invoice-history-' || p_invoice_id::text));

  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
     and homeowner_user_id = auth.uid()
   limit 1;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.status in ('draft', 'void') then
    raise exception 'Only visible active or paid invoices can be filed to Home History.';
  end if;

  select *
    into v_existing
    from public.home_maintenance_log
   where invoice_id = v_invoice.id
     and homeowner_user_id = auth.uid()
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'maintenance_log_id', v_existing.id,
      'invoice_id', v_invoice.id,
      'created', false
    );
  end if;

  select business_name
    into v_contractor_name
    from public.contractor_profiles
   where id = v_invoice.contractor_id
   limit 1;

  v_performed_at := coalesce(
    v_invoice.paid_at,
    v_invoice.issued_at,
    v_invoice.updated_at,
    v_invoice.created_at,
    now()
  )::date;

  insert into public.home_maintenance_log (
    homeowner_user_id,
    home_id,
    invoice_id,
    category,
    title,
    description,
    performed_at,
    contractor_name,
    cost_cents,
    notes
  ) values (
    v_invoice.homeowner_user_id,
    v_invoice.home_id,
    v_invoice.id,
    case when v_invoice.status = 'paid' then 'Receipt / Invoice' else 'Invoice' end,
    coalesce(nullif(trim(v_invoice.title), ''), case when v_invoice.status = 'paid' then 'Paid invoice' else 'Invoice' end),
    coalesce(
      nullif(trim(v_invoice.scope), ''),
      case when v_invoice.status = 'paid'
        then 'Paid invoice filed from ServSync invoice records.'
        else 'Invoice filed from ServSync invoice records.'
      end
    ),
    v_performed_at,
    coalesce(nullif(trim(v_contractor_name), ''), 'Contractor'),
    v_invoice.total_cents,
    case when v_invoice.status = 'paid'
      then 'Receipt/invoice record filed from structured ServSync invoice data. No duplicate PDF was stored.'
      else 'Invoice record filed from structured ServSync invoice data. No duplicate PDF was stored.'
    end
  )
  returning * into v_entry;

  return jsonb_build_object(
    'maintenance_log_id', v_entry.id,
    'invoice_id', v_invoice.id,
    'created', true
  );
exception
  when unique_violation then
    select *
      into v_existing
      from public.home_maintenance_log
     where invoice_id = p_invoice_id
       and homeowner_user_id = auth.uid()
     limit 1;

    if v_existing.id is not null then
      return jsonb_build_object(
        'maintenance_log_id', v_existing.id,
        'invoice_id', p_invoice_id,
        'created', false
      );
    end if;

    raise;
end;
$$;

grant execute on function public.servsync_file_invoice_to_home_history(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
