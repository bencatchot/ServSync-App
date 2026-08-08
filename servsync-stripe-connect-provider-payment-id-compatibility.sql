-- ServSync Stripe Connect provider payment ID compatibility.
-- Stripe's current ACH PaymentIntent events can expose a py_ provider payment
-- identifier where card events expose a ch_ charge identifier.

begin;

do $$
declare
  v_constraint_expression text;
  v_constraint_validated boolean;
begin
  if to_regclass('public.invoice_online_payment_attempts') is null then
    raise exception 'Stripe Connect Online Payments Foundation is required.';
  end if;
  select pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
         constraint_row.convalidated
    into v_constraint_expression, v_constraint_validated
    from pg_constraint constraint_row
   where constraint_row.conrelid = 'public.invoice_online_payment_attempts'::regclass
     and constraint_row.conname = 'invoice_online_payment_attempts_charge_check';

  if v_constraint_expression is null then
    raise exception 'Canonical Stripe provider identifier constraint is required.';
  end if;

  if not v_constraint_validated or v_constraint_expression not in (
    '((charge_id IS NULL) OR (charge_id ~ ''^ch_[A-Za-z0-9_]{8,}$''::text))',
    '((charge_id IS NULL) OR (charge_id ~ ''^(ch|py)_[A-Za-z0-9_]{8,}$''::text))'
  ) then
    raise exception 'Stripe provider identifier constraint is incompatible.';
  end if;
end;
$$;

alter table public.invoice_online_payment_attempts
  drop constraint invoice_online_payment_attempts_charge_check;

alter table public.invoice_online_payment_attempts
  add constraint invoice_online_payment_attempts_charge_check
  check (charge_id is null or charge_id ~ '^(ch|py)_[A-Za-z0-9_]{8,}$')
  not valid;

alter table public.invoice_online_payment_attempts
  validate constraint invoice_online_payment_attempts_charge_check;

commit;
