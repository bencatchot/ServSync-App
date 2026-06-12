-- ServSync in-app notifications: invoice sent.
-- Adds the one missing workflow notification ("invoice sent" -> homeowner) to the
-- existing public.notifications system. Mirrors notify_on_estimate in
-- servsync-estimates.sql.
--
-- Run order: after servsync-notifications.sql, servsync-estimates.sql, and
-- servsync-invoices-schema.sql / servsync-invoice-actions.sql.
--
-- Sandbox-review patch. Do NOT apply to production without explicit approval.

begin;

-- ── Link notifications to invoices ──────────────────────────────────────────

alter table if exists public.notifications
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;

create index if not exists notifications_invoice_idx
  on public.notifications(invoice_id)
  where invoice_id is not null;

-- ── Trigger: notify homeowner when an invoice is sent ───────────────────────

create or replace function public.notify_on_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
begin
  -- Only homeowner-connected invoices create an in-app notification.
  -- Local-only invoices (homeowner_user_id is null) have no app recipient.
  if new.homeowner_user_id is null then
    return new;
  end if;

  -- Fire only on the transition into 'sent' so re-renders / later status
  -- changes (viewed, paid, ...) never duplicate the notification.
  if TG_OP = 'INSERT' then
    if new.status <> 'sent' then
      return new;
    end if;
  else
    if new.status <> 'sent' or old.status = new.status then
      return new;
    end if;
  end if;

  v_body := coalesce(
    nullif(trim(new.title), ''),
    nullif(trim(new.invoice_number), ''),
    'A contractor sent you an invoice.'
  );

  insert into public.notifications (user_id, type, title, body, invoice_id)
  values (
    new.homeowner_user_id,
    'invoice_sent',
    'Invoice sent',
    v_body,
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_invoice on public.invoices;
create trigger trg_notify_on_invoice
  after insert or update on public.invoices
  for each row execute function public.notify_on_invoice();

notify pgrst, 'reload schema';

commit;
