-- ServSync first-class invoice actions.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Run after:
--   - servsync-invoices-schema.sql
--
-- Adds RPCs for MVP invoice state transitions only. This does not add Stripe,
-- payment processing, invoice PDFs, reminders, or timeline entries.

begin;

create or replace function public.servsync_send_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
   for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_invoice.contractor_id) then
    raise exception 'You do not have permission to send this invoice.';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'Only draft invoices can be sent.';
  end if;

  if v_invoice.homeowner_user_id is null then
    raise exception 'Local-only invoices cannot be sent to a homeowner yet. Connect this customer to a ServSync homeowner before sending.';
  end if;

  update public.invoices
     set status = 'sent',
         issued_at = coalesce(issued_at, now()),
         updated_at = now()
   where id = v_invoice.id
   returning * into v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'status', v_invoice.status,
    'issued_at', v_invoice.issued_at
  );
end;
$$;

create or replace function public.servsync_homeowner_view_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
     and homeowner_user_id = auth.uid()
     and status <> 'draft'
   for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.status = 'sent' then
    update public.invoices
       set status = 'viewed',
           updated_at = now()
     where id = v_invoice.id
     returning * into v_invoice;
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'status', v_invoice.status
  );
end;
$$;

create or replace function public.servsync_mark_invoice_paid(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
   for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_invoice.contractor_id) then
    raise exception 'You do not have permission to mark this invoice paid.';
  end if;

  if v_invoice.status not in ('sent', 'viewed', 'overdue', 'partially_paid') then
    raise exception 'Only sent, viewed, overdue, or partially paid invoices can be marked paid.';
  end if;

  update public.invoices
     set status = 'paid',
         paid_at = now(),
         amount_paid_cents = total_cents,
         updated_at = now()
   where id = v_invoice.id
   returning * into v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'status', v_invoice.status,
    'paid_at', v_invoice.paid_at,
    'amount_paid_cents', v_invoice.amount_paid_cents
  );
end;
$$;

create or replace function public.servsync_void_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select *
    into v_invoice
    from public.invoices
   where id = p_invoice_id
   for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.current_user_can_write_contractor_jobs(v_invoice.contractor_id) then
    raise exception 'You do not have permission to void this invoice.';
  end if;

  if v_invoice.status not in ('draft', 'sent', 'viewed') then
    raise exception 'Only draft, sent, or viewed invoices can be voided.';
  end if;

  update public.invoices
     set status = 'void',
         voided_at = now(),
         updated_at = now()
   where id = v_invoice.id
   returning * into v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'status', v_invoice.status,
    'voided_at', v_invoice.voided_at
  );
end;
$$;

grant execute on function public.servsync_send_invoice(uuid) to authenticated;
grant execute on function public.servsync_homeowner_view_invoice(uuid) to authenticated;
grant execute on function public.servsync_mark_invoice_paid(uuid) to authenticated;
grant execute on function public.servsync_void_invoice(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
