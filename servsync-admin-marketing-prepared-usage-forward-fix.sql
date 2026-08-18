begin;

do $$
begin
  if to_regclass('public.marketing_publication_packages') is null
     or to_regprocedure('public.servsync_get_marketing_usage_summary(uuid)') is null then
    raise exception 'FB-037I prepared-usage prerequisites are missing.';
  end if;
  if pg_get_functiondef('public.servsync_get_marketing_usage_summary(uuid)'::regprocedure)
       like '%from public.marketing_publication_packages%' then
    raise exception 'FB-037I prepared-usage forward fix is already installed.';
  end if;
end;
$$;

create or replace function public.servsync_get_marketing_usage_summary(p_contractor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth stable as $$
declare
  v_workspace_id uuid; v_workspace public.marketing_workspaces; v_entitlements jsonb;
  v_global public.marketing_global_cost_controls; v_generations integer; v_text_drafts integer; v_active integer;
  v_ready integer; v_workspace_spend bigint; v_global_spend bigint; v_active_bytes bigint; v_recent_text jsonb;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'read');
  select * into strict v_workspace from public.marketing_workspaces where id=v_workspace_id;
  v_entitlements:=public.servsync_private_effective_marketing_entitlements(v_workspace_id);
  select * into strict v_global from public.marketing_global_cost_controls where singleton;
  select count(*) into v_generations from public.marketing_usage_events where workspace_id=v_workspace_id
    and generation_consumed and occurred_at>=now()-interval '30 days';
  select count(*) into v_text_drafts from public.marketing_usage_events where workspace_id=v_workspace_id
    and usage_category='ai_text_generation' and occurred_at>=now()-interval '30 days';
  select jsonb_strip_nulls(jsonb_build_object('provider',usage.provider,'model',usage.model,
    'cost_status',usage.cost_status,'known_cost_microusd',usage.known_cost_microusd,
    'estimated_cost_microusd',usage.estimated_cost_microusd,'outcome',usage.outcome,
    'input_tokens',usage.input_tokens,'output_tokens',usage.output_tokens,'occurred_at',usage.occurred_at))
    into v_recent_text from public.marketing_usage_events usage
    where usage.workspace_id=v_workspace_id and usage.usage_category='ai_text_generation'
    order by usage.occurred_at desc,usage.id desc limit 1;
  v_active:=public.servsync_private_marketing_active_media_count(v_workspace_id);
  select count(*) into v_ready from public.marketing_publication_packages
    where workspace_id=v_workspace_id and status in ('ready','scheduled','publishing');
  select coalesce(sum(asset.file_size_bytes),0)::bigint into v_active_bytes
    from public.marketing_media_lifecycles lifecycle join public.marketing_media_assets asset on asset.id=lifecycle.asset_id
    where lifecycle.workspace_id=v_workspace_id and not lifecycle.retained_permanently
      and lifecycle.state in ('uploaded','preparing','generating','needs_review','ready','scheduled','publishing','provider_processing','retention');
  v_workspace_spend:=public.servsync_private_current_marketing_spend(v_workspace_id);
  v_global_spend:=public.servsync_private_current_marketing_spend(null);
  return jsonb_build_object(
    'workspace',jsonb_build_object('workspace_id',v_workspace.id,'workspace_kind',v_workspace.workspace_kind,'display_name',v_workspace.display_name),
    'entitlements',v_entitlements,
    'usage',jsonb_build_object('video_generations_rolling_30_days',v_generations,
      'ai_text_drafts_rolling_30_days',v_text_drafts,'active_media_slots',v_active,
      'active_media_bytes',v_active_bytes,'ready_scheduled_posts',v_ready,
      'workspace_cost_microusd_month',v_workspace_spend),
    'generation',jsonb_build_object('enabled',v_global.generation_enabled and coalesce((v_entitlements->>'generation_enabled')::boolean,false),
      'global_budget_configured',v_global.monthly_budget_microusd is not null,
      'global_warning',v_global.monthly_budget_microusd is not null and v_global_spend*100>=v_global.monthly_budget_microusd*v_global.warning_percent,
      'global_hard_stop',v_global.monthly_budget_microusd is not null and v_global_spend*100>=v_global.monthly_budget_microusd*v_global.hard_stop_percent,
      'recent_text_draft',v_recent_text),
    'recent_media',coalesce((select jsonb_agg(jsonb_build_object('asset_id',asset.id,'asset_type',asset.asset_type,
      'source',asset.source,'state',lifecycle.state,'mime_type',asset.mime_type,'file_size_bytes',asset.file_size_bytes,
      'poster_path',asset.poster_path,'purged_at',lifecycle.purged_at) order by lifecycle.created_at desc)
      from public.marketing_media_lifecycles lifecycle join public.marketing_media_assets asset on asset.id=lifecycle.asset_id
      where lifecycle.workspace_id=v_workspace_id),'[]'::jsonb)
  );
end;
$$;

alter function public.servsync_get_marketing_usage_summary(uuid) owner to postgres;
revoke all on function public.servsync_get_marketing_usage_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.servsync_get_marketing_usage_summary(uuid) to authenticated;

commit;
