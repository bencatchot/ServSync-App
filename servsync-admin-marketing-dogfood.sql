-- FB-037I Admin Marketing dogfood v1.
-- Adds internal managed product-media drafting and honest AI text usage evidence.
-- This migration does not enable contractor rollout or provider submissions.

begin;

do $$
begin
  if to_regclass('public.marketing_content_creation_requests') is null
     or to_regclass('public.marketing_content_source_assets') is null
     or to_regclass('public.marketing_media_lifecycles') is null
     or to_regprocedure('public.servsync_get_marketing_creation_context(uuid)') is null
     or to_regprocedure('public.servsync_reserve_marketing_content_creation(uuid,uuid,text,uuid,uuid,text,text,text)') is null
     or to_regprocedure('public.servsync_get_marketing_usage_summary(uuid)') is null then
    raise exception 'FB-037I Marketing creation prerequisites are missing.';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname in ('marketing_content_creation_source_check','marketing_content_source_kind_check')
      and pg_get_constraintdef(oid) like '%managed_asset%'
  ) then
    raise exception 'FB-037I managed product-media contract is already installed.';
  end if;
end;
$$;

alter table public.marketing_content_creation_requests
  drop constraint marketing_content_creation_source_check,
  drop constraint marketing_content_creation_source_shape_check,
  add constraint marketing_content_creation_source_check
    check (source_kind in ('job','marketing_upload','managed_asset','simple')),
  add constraint marketing_content_creation_source_shape_check check (
    (source_kind='job' and source_job_id is not null and source_asset_id is not null)
    or (source_kind in ('marketing_upload','managed_asset') and source_job_id is null and source_asset_id is not null)
    or (source_kind='simple' and source_job_id is null and source_asset_id is null)
  );

alter table public.marketing_content_source_assets
  drop constraint marketing_content_source_kind_check,
  drop constraint marketing_content_source_shape_check,
  add constraint marketing_content_source_kind_check
    check (source_kind in ('job','marketing_upload','managed_asset')),
  add constraint marketing_content_source_shape_check check (
    (source_kind='job' and source_job_id is not null)
    or (source_kind in ('marketing_upload','managed_asset') and source_job_id is null)
  );

create or replace function public.servsync_get_marketing_creation_context(p_contractor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,storage stable as $$
declare v_workspace_id uuid; v_profile public.marketing_business_profiles;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'read');
  select * into v_profile from public.marketing_business_profiles where workspace_id=v_workspace_id;
  return jsonb_build_object(
    'workspace_id',v_workspace_id,
    'profile',case when v_profile.id is null then null else jsonb_build_object(
      'profile_id',v_profile.id,'profile_version',v_profile.profile_version,
      'marketing_name',v_profile.marketing_name,'business_summary',v_profile.business_summary,
      'service_focus',to_jsonb(v_profile.service_focus),'tone_style',v_profile.tone_style,
      'generation_ready',v_profile.profile_status='ready') end,
    'product_media',case when p_contractor_id is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'asset_id',asset.id,
        'label',initcap(replace(coalesce(asset.recorder_scenario,asset.media_variant,'ServSync product media'),'-',' ')),
        'asset_type',asset.asset_type,
        'media_variant',asset.media_variant,
        'duration_seconds',asset.duration_seconds
      ) order by asset.created_at desc,asset.id)
      from public.marketing_media_assets asset
      join public.marketing_media_lifecycles lifecycle
        on lifecycle.asset_id=asset.id and lifecycle.workspace_id=asset.workspace_id
      where asset.workspace_id=v_workspace_id and asset.source='demo_recorder'
        and asset.validation_status='passed' and asset.sensitive_data_check='passed'
        and lifecycle.state not in ('purging','purged','abandoned')),'[]'::jsonb) end,
    'jobs',case when p_contractor_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'job_id',job.id,'title',job.name,'summary',nullif(btrim(job.summary),''),
        'status',job.job_status,'completed_at',job.completed_at,
        'work_items',coalesce((select jsonb_agg(jsonb_build_object(
          'title',item.title,'customer_description',nullif(btrim(item.customer_description),'')) order by item.created_at,item.id)
          from public.job_work_items item where item.inspection_id=job.id and item.completion_status='completed'),'[]'::jsonb),
        'media',coalesce((select jsonb_agg(jsonb_build_object(
          'path',object.name,'mime_type',object.metadata->>'mimetype',
          'file_size_bytes',(object.metadata->>'size')::bigint) order by object.name)
          from storage.objects object
          where object.bucket_id='inspection-media'
            and split_part(object.name,'/',1)=p_contractor_id::text
            and coalesce(object.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','video/mp4')
            and jsonb_path_exists(coalesce(job.rooms_with_findings,'[]'::jsonb),
              '$.** ? (@.type() == "string" && @ == $path)',jsonb_build_object('path',object.name))),'[]'::jsonb)
      ) order by coalesce(job.completed_at,job.updated_at) desc,job.id)
      from public.inspections job where job.contractor_id=p_contractor_id
        and job.job_status in ('completed','closed')),'[]'::jsonb) end
  );
end;
$$;

create or replace function public.servsync_bind_marketing_content_source(
  p_contractor_id uuid,p_content_id uuid,p_asset_id uuid,p_source_kind text,p_source_job_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth volatile as $$
declare v_workspace_id uuid; v_content public.marketing_content_items; v_asset public.marketing_media_assets;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'create_edit');
  select * into strict v_content from public.marketing_content_items where id=p_content_id and workspace_id=v_workspace_id for update;
  if v_content.status not in ('idea','draft') or p_source_kind not in ('job','marketing_upload','managed_asset') then
    raise exception 'Content source cannot be changed.' using errcode='55000';
  end if;
  select asset.* into strict v_asset from public.marketing_media_assets asset
    join public.marketing_media_lifecycles lifecycle on lifecycle.asset_id=asset.id and lifecycle.workspace_id=asset.workspace_id
    where asset.id=p_asset_id and asset.workspace_id=v_workspace_id
      and lifecycle.state not in ('purging','purged','abandoned');
  if (p_source_kind='job' and (p_source_job_id is null or v_asset.source<>'job_media_derivative'))
     or (p_source_kind='marketing_upload' and (p_source_job_id is not null or v_asset.source<>'marketing_upload'))
     or (p_source_kind='managed_asset' and (p_contractor_id is not null or p_source_job_id is not null
       or v_asset.source<>'demo_recorder' or v_asset.validation_status<>'passed' or v_asset.sensitive_data_check<>'passed')) then
    raise exception 'Marketing source does not match the selected asset.' using errcode='22023';
  end if;
  insert into public.marketing_content_source_assets(workspace_id,content_id,asset_id,source_kind,source_job_id,selected_by)
    values(v_workspace_id,v_content.id,v_asset.id,p_source_kind,p_source_job_id,auth.uid())
    on conflict(content_id) do update set asset_id=excluded.asset_id,source_kind=excluded.source_kind,
      source_job_id=excluded.source_job_id,selected_by=excluded.selected_by,selected_at=now();
  return jsonb_build_object('content_id',v_content.id,'asset_id',v_asset.id);
end;
$$;

create or replace function public.servsync_reserve_marketing_content_creation(
  p_contractor_id uuid,p_client_request_id uuid,p_source_kind text,p_source_job_id uuid,
  p_source_asset_id uuid,p_owner_brief text,p_provider text,p_model text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth volatile as $$
declare v_workspace_id uuid; v_request public.marketing_content_creation_requests; v_profile public.marketing_business_profiles;
  v_source jsonb:='{}'::jsonb; v_job public.inspections; v_asset public.marketing_media_assets; v_global public.marketing_global_cost_controls;
  v_fingerprint text; v_entitlements jsonb; v_spend bigint;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'create_edit');
  if p_client_request_id is null or p_source_kind not in ('job','marketing_upload','managed_asset','simple')
     or char_length(btrim(coalesce(p_owner_brief,''))) not between 3 and 1000
     or p_provider<>'openai' or char_length(btrim(coalesce(p_model,''))) not between 3 and 100 then
    raise exception 'Invalid Marketing draft request.' using errcode='22023';
  end if;
  select * into strict v_profile from public.marketing_business_profiles where workspace_id=v_workspace_id and profile_status='ready';
  if p_source_kind='job' then
    select * into strict v_job from public.inspections where id=p_source_job_id and contractor_id=p_contractor_id and job_status in ('completed','closed');
    select * into strict v_asset from public.marketing_media_assets where id=p_source_asset_id and workspace_id=v_workspace_id and source='job_media_derivative';
    v_source:=jsonb_build_object('job_status',v_job.job_status,
      'completed_work',coalesce((select jsonb_agg(jsonb_build_object('title',item.title,'customer_description',nullif(btrim(item.customer_description),'')) order by item.created_at,item.id)
        from public.job_work_items item where item.inspection_id=v_job.id and item.completion_status='completed'),'[]'::jsonb));
  elsif p_source_kind='marketing_upload' then
    if p_source_job_id is not null then raise exception 'Invalid Marketing draft source.' using errcode='22023'; end if;
    select asset.* into strict v_asset from public.marketing_media_assets asset
      join public.marketing_media_lifecycles lifecycle on lifecycle.asset_id=asset.id and lifecycle.workspace_id=asset.workspace_id
      where asset.id=p_source_asset_id and asset.workspace_id=v_workspace_id and asset.source='marketing_upload'
        and lifecycle.state not in ('purging','purged','abandoned');
    v_source:=jsonb_build_object('media_type',v_asset.asset_type,'mime_type',v_asset.mime_type);
  elsif p_source_kind='managed_asset' then
    if p_contractor_id is not null or p_source_job_id is not null then raise exception 'ServSync product media is internal-only.' using errcode='42501'; end if;
    select asset.* into strict v_asset from public.marketing_media_assets asset
      join public.marketing_media_lifecycles lifecycle on lifecycle.asset_id=asset.id and lifecycle.workspace_id=asset.workspace_id
      where asset.id=p_source_asset_id and asset.workspace_id=v_workspace_id and asset.source='demo_recorder'
        and asset.validation_status='passed' and asset.sensitive_data_check='passed'
        and lifecycle.state not in ('purging','purged','abandoned');
    v_source:=jsonb_strip_nulls(jsonb_build_object('media_type',v_asset.asset_type,
      'product_scenario',v_asset.recorder_scenario,'media_variant',v_asset.media_variant,
      'duration_seconds',v_asset.duration_seconds));
  elsif p_source_job_id is not null or p_source_asset_id is not null then
    raise exception 'Invalid simple post source.' using errcode='22023';
  end if;
  select * into strict v_global from public.marketing_global_cost_controls where singleton;
  v_entitlements:=public.servsync_private_effective_marketing_entitlements(v_workspace_id);
  v_spend:=public.servsync_private_current_marketing_spend(null);
  if not v_global.generation_enabled or coalesce((v_entitlements->>'generation_enabled')::boolean,false) is not true
     or (v_global.monthly_budget_microusd is not null
       and v_spend*100>=v_global.monthly_budget_microusd*v_global.hard_stop_percent) then
    raise exception 'Marketing drafting is temporarily paused.' using errcode='54000';
  end if;
  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',v_workspace_id,'request_id',p_client_request_id,
    'source_kind',p_source_kind,'job_id',p_source_job_id,'asset_id',p_source_asset_id,'brief',btrim(p_owner_brief),
    'profile_version',v_profile.profile_version,'provider',p_provider,'model',p_model)::text,'utf8'),'sha256'),'hex');
  insert into public.marketing_content_creation_requests(
    workspace_id,client_request_id,source_kind,source_job_id,source_asset_id,owner_brief,
    profile_id,profile_version,profile_snapshot,source_snapshot,request_fingerprint_sha256,
    provider,model,created_by
  ) values(v_workspace_id,p_client_request_id,p_source_kind,p_source_job_id,p_source_asset_id,btrim(p_owner_brief),
    v_profile.id,v_profile.profile_version,public.servsync_private_marketing_profile_snapshot(v_profile),v_source,
    v_fingerprint,p_provider,btrim(p_model),auth.uid())
  on conflict(workspace_id,client_request_id) do nothing returning * into v_request;
  if v_request.id is null then
    select * into strict v_request from public.marketing_content_creation_requests
      where workspace_id=v_workspace_id and client_request_id=p_client_request_id;
    if v_request.request_fingerprint_sha256<>v_fingerprint then
      raise exception 'Marketing draft request conflicts with an existing request.' using errcode='23505';
    end if;
  end if;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,
    'content_id',v_request.content_id,'replayed',v_request.created_at<now()-interval '1 millisecond');
end;
$$;

create or replace function public.servsync_private_create_bound_marketing_pairing()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_source public.marketing_content_source_assets; v_asset public.marketing_media_assets; v_pairing_id uuid;
begin
  if new.status<>'approved' or old.status='approved' then return new; end if;
  select * into v_source from public.marketing_content_source_assets where content_id=new.id and workspace_id=new.workspace_id;
  if v_source.content_id is null then return new; end if;
  select * into strict v_asset from public.marketing_media_assets where id=v_source.asset_id and workspace_id=v_source.workspace_id;
  v_pairing_id:=gen_random_uuid();
  insert into public.marketing_content_media_pairings(
    id,workspace_id,content_id,content_revision,source_direction_id,source_direction_revision,
    asset_id,recorder_scenario,claim_demonstrated,status,created_by
  ) values(v_pairing_id,new.workspace_id,new.id,new.revision_number,new.source_direction_id,new.source_direction_revision,
    v_source.asset_id,coalesce(v_asset.recorder_scenario,case when v_source.source_kind='job' then 'job-media' else 'uploaded-marketing-media' end),
    case when v_source.source_kind='managed_asset' then 'Selected ServSync product media for this exact Marketing draft.'
      else 'Selected by the contractor for this exact Marketing draft.' end,'candidate',v_source.selected_by)
  on conflict(workspace_id,content_id,content_revision,asset_id) do nothing;
  if found then
    insert into public.marketing_content_media_pairing_events(workspace_id,pairing_id,from_status,to_status,actor_user_id)
      values(new.workspace_id,v_pairing_id,null,'candidate',v_source.selected_by);
  end if;
  return new;
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
  select count(*) into v_ready from public.marketing_publications where workspace_id=v_workspace_id and status in ('scheduled','publishing');
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

alter function public.servsync_get_marketing_creation_context(uuid) owner to postgres;
alter function public.servsync_bind_marketing_content_source(uuid,uuid,uuid,text,uuid) owner to postgres;
alter function public.servsync_reserve_marketing_content_creation(uuid,uuid,text,uuid,uuid,text,text,text) owner to postgres;
alter function public.servsync_private_create_bound_marketing_pairing() owner to postgres;
alter function public.servsync_get_marketing_usage_summary(uuid) owner to postgres;

revoke all on function public.servsync_get_marketing_creation_context(uuid) from public,anon,authenticated,service_role;
revoke all on function public.servsync_bind_marketing_content_source(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.servsync_reserve_marketing_content_creation(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.servsync_private_create_bound_marketing_pairing() from public,anon,authenticated,service_role;
revoke all on function public.servsync_get_marketing_usage_summary(uuid) from public,anon,authenticated,service_role;

grant execute on function public.servsync_get_marketing_creation_context(uuid) to authenticated;
grant execute on function public.servsync_bind_marketing_content_source(uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.servsync_reserve_marketing_content_creation(uuid,uuid,text,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.servsync_get_marketing_usage_summary(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
