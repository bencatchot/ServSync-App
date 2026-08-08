begin;

drop function public.servsync_get_trade_pack_work_type_version(uuid, text, integer);
drop function public.servsync_list_available_trade_pack_work_types(uuid);
drop function public.servsync_resolve_trade_pack_capability(uuid, text);

drop table public.contractor_trade_pack_capability_grants;
drop table public.trade_pack_work_type_versions;
drop table public.trade_pack_work_types;
drop table public.trade_pack_capabilities;
drop table public.trade_pack_trades;
drop table public.trade_pack_workflow_families;

drop function public.servsync_trade_pack_guard_capability_grant();
drop function public.servsync_trade_pack_guard_definition_version();
drop function public.servsync_trade_pack_guard_work_type_identity();
drop function public.servsync_trade_pack_guard_catalog_identity();
drop function public.servsync_trade_pack_touch_updated_at();
drop function public.servsync_trade_pack_definition_contract_is_valid(jsonb);
drop function public.servsync_trade_pack_jsonb_has_exact_keys(jsonb, text[]);

commit;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'trade_pack_workflow_families',
    'trade_pack_trades',
    'trade_pack_capabilities',
    'trade_pack_work_types',
    'trade_pack_work_type_versions',
    'contractor_trade_pack_capability_grants'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      raise exception 'Rollback left relation public.%.', v_name;
    end if;
  end loop;

  if exists (
    select 1
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.proname like 'servsync%trade_pack%'
  ) then
    raise exception 'Rollback left a Trade Pack function.';
  end if;
end;
$$;
