-- ServSync field work draft deletion.
-- Paste into Supabase SQL Editor once after servsync-inspections.sql.

create or replace function public.servsync_delete_inspection(
  p_inspection_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
begin
  select id
    into v_contractor_id
    from public.contractor_profiles
   where owner_user_id = auth.uid()
   limit 1;

  if v_contractor_id is null then
    raise exception 'Contractor profile not found.';
  end if;

  delete from public.inspections
   where id = p_inspection_id
     and contractor_id = v_contractor_id
     and status = 'draft';

  if not found then
    raise exception 'Draft field work not found, already finalized, or not owned by this contractor.';
  end if;
end;
$$;

grant execute on function public.servsync_delete_inspection(uuid) to authenticated;

notify pgrst, 'reload schema';
