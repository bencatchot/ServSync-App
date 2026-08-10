begin;

do $$
declare
  v_v2_definition text;
begin
  if to_regprocedure('public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb,bigint)') is null
     or to_regprocedure('public.servsync_create_internal_marketing_plan_v3(uuid,bigint,text,text,date,date,text,jsonb,bigint)') is not null then
    raise exception 'Marketing planner v3 migration identity mismatch.';
  end if;

  select pg_get_functiondef(
    'public.servsync_create_internal_marketing_plan(uuid,bigint,text,text,date,date,text,jsonb,bigint)'::regprocedure
  ) into v_v2_definition;

  if position('v_recommendation_version not between 1 and 2' in v_v2_definition) = 0 then
    raise exception 'Marketing planner v2 prerequisite differs.';
  end if;
end;
$$;

create function public.servsync_create_internal_marketing_plan_v3(
  p_client_request_id uuid,
  p_profile_version bigint,
  p_mode text,
  p_title text,
  p_planning_start date,
  p_planning_end date,
  p_owner_direction text,
  p_items jsonb,
  p_recommendation_contract_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_workspace_id uuid;
  v_profile public.marketing_business_profiles;
  v_plan public.marketing_plans;
  v_direction text := nullif(btrim(coalesce(p_owner_direction, '')), '');
  v_existing_recommendation_version bigint;
  v_recent jsonb;
begin
  if auth.uid() is null or not public.current_user_is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  select workspace.id into v_workspace_id
    from public.marketing_workspaces workspace
   where workspace.workspace_key = 'servsync_internal'
     and workspace.workspace_kind = 'internal'
     and workspace.contractor_id is null;

  if p_client_request_id is null then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_workspace_id::text || ':' || p_client_request_id::text, 0)
  );

  select * into v_plan
    from public.marketing_plans
   where workspace_id = v_workspace_id
     and client_request_id = p_client_request_id;

  if v_plan.id is not null then
    v_existing_recommendation_version := case
      when v_plan.plan_mode = 'recommended'
        then coalesce((v_plan.recent_content_context ->> 'recommendation_contract_version')::bigint, 1)
      else null
    end;
    if v_plan.profile_version <> p_profile_version
       or v_plan.plan_mode <> p_mode
       or v_plan.title <> btrim(coalesce(p_title, ''))
       or v_plan.planning_start <> p_planning_start
       or v_plan.planning_end <> p_planning_end
       or v_plan.owner_direction is distinct from v_direction
       or v_plan.items <> p_items
       or v_existing_recommendation_version is distinct from p_recommendation_contract_version then
      raise exception 'Marketing plan request conflicts with an existing request.' using errcode = '23505';
    end if;
    return jsonb_build_object('plan_id', v_plan.id, 'revision_number', v_plan.revision_number);
  end if;

  select * into v_profile
    from public.marketing_business_profiles
   where workspace_id = v_workspace_id
   for share;

  if v_profile.id is null
     or v_profile.profile_status <> 'ready'
     or v_profile.profile_version <> p_profile_version
     or p_mode <> 'recommended'
     or char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or p_planning_start is null
     or p_planning_end is null
     or p_planning_end < p_planning_start
     or p_planning_end > p_planning_start + 93
     or v_direction is not null
     or p_recommendation_contract_version <> 3
     or not public.servsync_private_marketing_plan_items_valid(p_items) then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
  end if;

  v_recent := public.servsync_private_internal_marketing_recent_context(v_workspace_id)
    || jsonb_build_object('recommendation_contract_version', 3);

  insert into public.marketing_plans (
    workspace_id, client_request_id, profile_version, plan_mode, plan_status,
    title, planning_start, planning_end, owner_direction, recent_content_context,
    items, revision_number, created_by
  ) values (
    v_workspace_id, p_client_request_id, p_profile_version, p_mode, 'draft',
    btrim(p_title), p_planning_start, p_planning_end, null, v_recent,
    p_items, 1, auth.uid()
  ) returning * into v_plan;

  insert into public.marketing_plan_revisions (
    workspace_id, plan_id, revision_number, plan_snapshot, actor_user_id
  ) values (
    v_plan.workspace_id,
    v_plan.id,
    v_plan.revision_number,
    to_jsonb(v_plan) - 'client_request_id',
    auth.uid()
  );

  return jsonb_build_object('plan_id', v_plan.id, 'revision_number', v_plan.revision_number);
exception
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception 'Invalid Marketing Plan.' using errcode = '22023';
end;
$$;

alter function public.servsync_create_internal_marketing_plan_v3(uuid,bigint,text,text,date,date,text,jsonb,bigint) owner to postgres;
revoke all on function public.servsync_create_internal_marketing_plan_v3(uuid,bigint,text,text,date,date,text,jsonb,bigint) from public, anon, service_role;
grant execute on function public.servsync_create_internal_marketing_plan_v3(uuid,bigint,text,text,date,date,text,jsonb,bigint) to authenticated;

comment on function public.servsync_create_internal_marketing_plan_v3(uuid,bigint,text,text,date,date,text,jsonb,bigint) is
  'Creates one planner-v3 internal Marketing recommendation while preserving the existing v1/v2 creation RPC and immutable historical evidence.';

notify pgrst, 'reload schema';

commit;
