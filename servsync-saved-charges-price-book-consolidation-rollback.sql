-- Guarded rollback for Saved Charges -> Price Book Consolidation v1.
-- Run only with the compatible pre-consolidation client. It refuses rollback if
-- any migrated Price Book item or retained legacy row changed after migration.

begin;

lock table public.contractor_saved_estimate_charges in access exclusive mode;
lock table public.contractor_price_book_items in share row exclusive mode;
lock table public.contractor_saved_charge_price_book_lineage in access exclusive mode;

do $$
begin
  if exists (
    select 1
      from public.contractor_saved_charge_price_book_lineage lineage
      join public.contractor_saved_estimate_charges legacy on legacy.id = lineage.legacy_saved_charge_id
      join public.contractor_price_book_items item on item.id = lineage.price_book_item_id
     where public.servsync_private_saved_charge_fingerprint(legacy) <> lineage.legacy_fingerprint
        or public.servsync_private_migrated_price_book_fingerprint(item) <> lineage.migrated_item_fingerprint
  ) or exists (
    select 1 from public.contractor_saved_charge_price_book_lineage lineage
     where not exists (select 1 from public.contractor_saved_estimate_charges legacy where legacy.id = lineage.legacy_saved_charge_id)
        or not exists (select 1 from public.contractor_price_book_items item where item.id = lineage.price_book_item_id)
  ) then
    raise exception 'Guarded rollback refused because retained evidence or a migrated Price Book item changed.';
  end if;
end
$$;

drop trigger contractor_saved_charge_price_book_lineage_immutable on public.contractor_saved_charge_price_book_lineage;
drop trigger contractor_saved_estimate_charges_retired_read_only on public.contractor_saved_estimate_charges;

create temporary table servsync_saved_charge_rollback_items on commit drop as
select price_book_item_id from public.contractor_saved_charge_price_book_lineage;

drop table public.contractor_saved_charge_price_book_lineage;

delete from public.contractor_price_book_items item
using servsync_saved_charge_rollback_items rollback_item
where item.id = rollback_item.price_book_item_id;
drop function public.servsync_private_saved_charge_fingerprint(public.contractor_saved_estimate_charges);
drop function public.servsync_private_migrated_price_book_fingerprint(public.contractor_price_book_items);
drop function public.servsync_private_reject_retired_saved_charge_write();
drop function public.servsync_private_reject_saved_charge_lineage_write();

alter table public.contractor_saved_estimate_charges no force row level security;

create trigger contractor_saved_estimate_charges_touch_updated_at
  before update on public.contractor_saved_estimate_charges
  for each row execute function public.touch_updated_at();

create policy "Saved estimate charges: contractor account reads"
  on public.contractor_saved_estimate_charges for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));
create policy "Saved estimate charges: estimate settings managers create"
  on public.contractor_saved_estimate_charges for insert to authenticated
  with check (public.current_user_can_manage_contractor_estimate_settings(contractor_id));
create policy "Saved estimate charges: estimate settings managers update"
  on public.contractor_saved_estimate_charges for update to authenticated
  using (public.current_user_can_manage_contractor_estimate_settings(contractor_id))
  with check (public.current_user_can_manage_contractor_estimate_settings(contractor_id));
create policy "Saved estimate charges: estimate settings managers delete"
  on public.contractor_saved_estimate_charges for delete to authenticated
  using (public.current_user_can_manage_contractor_estimate_settings(contractor_id));

grant select on table public.contractor_saved_estimate_charges to authenticated;
grant insert (contractor_id, name, description, line_type, charge_type, amount_cents, default_quantity, unit, active, sort_order)
  on table public.contractor_saved_estimate_charges to authenticated;
grant update (name, description, line_type, charge_type, amount_cents, default_quantity, unit, active, sort_order)
  on table public.contractor_saved_estimate_charges to authenticated;
grant delete on table public.contractor_saved_estimate_charges to authenticated;

notify pgrst, 'reload schema';

commit;
