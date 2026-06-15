-- ServSync estimate-to-job support provenance cleanup.
--
-- Keeps the tracked schema aligned with the current accepted-estimate -> job
-- workflow without replacing the newer servsync_create_job_from_estimate RPC
-- definitions in later SQL patches.

begin;

create unique index if not exists inspections_unique_estimate_job_idx
  on public.inspections(estimate_id)
  where estimate_id is not null;

drop policy if exists "Estimates: contractor team reads" on public.estimates;
create policy "Estimates: contractor team reads"
  on public.estimates for select to authenticated
  using (public.current_user_can_access_contractor(contractor_id));

drop policy if exists "Estimate lines: contractor team reads" on public.estimate_line_items;
create policy "Estimate lines: contractor team reads"
  on public.estimate_line_items for select to authenticated
  using (
    exists (
      select 1
        from public.estimates e
       where e.id = estimate_line_items.estimate_id
         and public.current_user_can_access_contractor(e.contractor_id)
    )
  );

notify pgrst, 'reload schema';

commit;
