-- Guarded rollback for Durable Trade Section Instances v1.
-- Safe only before the foundation contains any durable instance history.

begin;

do $$
begin
  if to_regclass('public.trade_section_instances') is null
     or to_regclass('public.trade_section_revisions') is null then
    raise exception 'Durable Trade Section Instances v1 is not installed.';
  end if;
  if exists (select 1 from public.trade_section_instances)
     or exists (select 1 from public.trade_section_revisions) then
    raise exception 'Durable Trade Section history exists and cannot be rolled back safely.';
  end if;
end;
$$;

drop trigger if exists contractor_work_drafts_sync_trade_sections on public.contractor_work_drafts;
drop trigger if exists inspections_sync_trade_sections on public.inspections;
drop trigger if exists contractor_local_homes_map_trade_sections on public.contractor_local_homes;

drop function public.servsync_list_trade_section_revisions(uuid);
drop function public.servsync_list_trade_section_instances(uuid,uuid);
drop function public.servsync_set_trade_section_lifecycle(uuid,bigint,text);
drop function public.servsync_update_trade_section_values(uuid,bigint,jsonb);
drop function public.servsync_create_trade_section_instance(uuid,uuid,text,integer,uuid,jsonb,integer,uuid);
drop function public.servsync_private_map_claimed_trade_sections();
drop function public.servsync_private_sync_trade_section_job_lineage();
drop function public.servsync_private_sync_trade_section_draft_lineage();

drop table public.trade_section_revisions;
drop table public.trade_section_instances;

drop function public.servsync_private_guard_trade_section_truncate();
drop function public.servsync_private_guard_trade_section_revision();
drop function public.servsync_private_record_trade_section_revision();
drop function public.servsync_private_guard_trade_section_instance();
drop function public.servsync_private_trade_section_instance_is_mutable(uuid);
drop function public.servsync_private_trade_section_access_role(uuid);
drop function public.servsync_trade_section_values_are_valid(jsonb,jsonb);

notify pgrst, 'reload schema';

commit;
