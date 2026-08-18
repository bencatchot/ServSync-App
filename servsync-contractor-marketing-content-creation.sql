-- FB-037H Contractor Content Creation v1.
-- Adds grounded draft creation, selected Job-media derivatives, and runtime-AI
-- request evidence on the shared Marketing workspace. No publication authority.

begin;

do $$
begin
  if to_regclass('public.marketing_workspaces') is null
     or to_regclass('public.marketing_media_intakes') is null
     or to_regclass('public.marketing_publication_packages') is null
     or to_regprocedure('public.servsync_private_marketing_workspace_for_context(uuid,text)') is null then
    raise exception 'FB-037H Marketing foundations are missing.';
  end if;
  if to_regclass('public.marketing_content_creation_requests') is not null
     or to_regclass('public.marketing_content_source_assets') is not null then
    raise exception 'FB-037H target objects already exist; refusing partial or repeated installation.';
  end if;
end $$;

alter table public.marketing_content_preparation_packages
  drop constraint marketing_preparation_packages_recipe_check,
  add constraint marketing_preparation_packages_recipe_check check (
    recipe_key in ('contractor_acquisition','homeowner_awareness','feature_promotion',
      'approved_direction_plan_v1','contractor_content_v1')
  );

create table public.marketing_content_source_assets (
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  content_id uuid primary key references public.marketing_content_items(id) on delete restrict,
  asset_id uuid not null references public.marketing_media_assets(id) on delete restrict,
  source_kind text not null,
  source_job_id uuid null references public.inspections(id) on delete restrict,
  selected_by uuid not null references public.profiles(id) on delete restrict,
  selected_at timestamptz not null default now(),
  constraint marketing_content_source_workspace_content foreign key (workspace_id,content_id)
    references public.marketing_content_items(workspace_id,id) on delete restrict,
  constraint marketing_content_source_workspace_asset foreign key (workspace_id,asset_id)
    references public.marketing_media_assets(workspace_id,id) on delete restrict,
  constraint marketing_content_source_kind_check check (source_kind in ('job','marketing_upload')),
  constraint marketing_content_source_shape_check check (
    (source_kind='job' and source_job_id is not null)
    or (source_kind='marketing_upload' and source_job_id is null)
  )
);

create table public.marketing_content_creation_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.marketing_workspaces(id) on delete restrict,
  client_request_id uuid not null,
  source_kind text not null,
  source_job_id uuid null references public.inspections(id) on delete restrict,
  source_asset_id uuid null references public.marketing_media_assets(id) on delete restrict,
  owner_brief text not null,
  profile_id uuid not null references public.marketing_business_profiles(id) on delete restrict,
  profile_version bigint not null,
  profile_snapshot jsonb not null,
  source_snapshot jsonb not null,
  request_fingerprint_sha256 text not null,
  provider text not null,
  model text not null,
  status text not null default 'reserved',
  claim_token uuid null,
  claimed_at timestamptz null,
  content_id uuid null references public.marketing_content_items(id) on delete restrict,
  input_tokens bigint null,
  output_tokens bigint null,
  failure_category text null,
  failure_message text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint marketing_content_creation_request_unique unique (workspace_id,client_request_id),
  constraint marketing_content_creation_workspace_identity unique (workspace_id,id),
  constraint marketing_content_creation_source_check check (source_kind in ('job','marketing_upload','simple')),
  constraint marketing_content_creation_source_shape_check check (
    (source_kind='job' and source_job_id is not null and source_asset_id is not null)
    or (source_kind='marketing_upload' and source_job_id is null and source_asset_id is not null)
    or (source_kind='simple' and source_job_id is null and source_asset_id is null)
  ),
  constraint marketing_content_creation_brief_check check (
    char_length(btrim(owner_brief)) between 3 and 1000 and owner_brief !~ '[[:cntrl:]]'
  ),
  constraint marketing_content_creation_snapshot_check check (
    jsonb_typeof(profile_snapshot)='object' and jsonb_typeof(source_snapshot)='object'
  ),
  constraint marketing_content_creation_fingerprint_check check (request_fingerprint_sha256 ~ '^[a-f0-9]{64}$'),
  constraint marketing_content_creation_provider_check check (provider='openai'),
  constraint marketing_content_creation_model_check check (char_length(model) between 3 and 100),
  constraint marketing_content_creation_status_check check (status in ('reserved','processing','completed','failed','uncertain')),
  constraint marketing_content_creation_claim_check check (
    (status='reserved' and claim_token is null and claimed_at is null)
    or (status in ('processing','completed','failed','uncertain') and claim_token is not null and claimed_at is not null)
  ),
  constraint marketing_content_creation_completion_check check (
    (status='completed' and content_id is not null and completed_at is not null)
    or (status<>'completed' and content_id is null and completed_at is null)
  ),
  constraint marketing_content_creation_tokens_check check (coalesce(input_tokens,0)>=0 and coalesce(output_tokens,0)>=0),
  constraint marketing_content_creation_failure_check check (
    (status in ('failed','uncertain') and failure_category is not null and char_length(failure_message) between 3 and 300)
    or (status not in ('failed','uncertain') and failure_category is null and failure_message is null)
  )
);

create index marketing_content_creation_workspace_idx
  on public.marketing_content_creation_requests(workspace_id,created_at desc,id);

create function public.servsync_private_marketing_profile_snapshot(p_profile public.marketing_business_profiles)
returns jsonb language sql immutable set search_path=pg_catalog as $$
  select jsonb_build_object(
    'marketing_name',p_profile.marketing_name,'business_summary',p_profile.business_summary,
    'audience_segments',to_jsonb(p_profile.audience_segments),'service_focus',to_jsonb(p_profile.service_focus),
    'primary_goal',p_profile.primary_goal,'geographic_focus',p_profile.geographic_focus,
    'tone_style',p_profile.tone_style,'emphasized_topics',to_jsonb(p_profile.emphasized_topics),
    'avoided_topics',to_jsonb(p_profile.avoided_topics),'profile_status',p_profile.profile_status
  );
$$;

create function public.servsync_private_ensure_contractor_marketing_profile(p_workspace_id uuid,p_contractor_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public volatile as $$
declare v_contractor public.contractor_profiles; v_profile public.marketing_business_profiles; v_focus text[];
begin
  select * into strict v_contractor from public.contractor_profiles
   where id=p_contractor_id and account_status='active';
  select * into v_profile from public.marketing_business_profiles where workspace_id=p_workspace_id;
  if v_profile.id is not null then return v_profile.id; end if;
  v_focus := case when cardinality(v_contractor.service_categories)>0
    then v_contractor.service_categories[1:20] else array['Home services']::text[] end;
  insert into public.marketing_business_profiles(
    workspace_id,marketing_name,business_summary,audience_segments,service_focus,
    primary_goal,tone_style,preferred_channels,emphasized_topics,profile_status
  ) values (
    p_workspace_id,nullif(btrim(v_contractor.business_name),''),
    case when char_length(btrim(v_contractor.business_summary))>=10 then btrim(v_contractor.business_summary)
      else coalesce(nullif(btrim(v_contractor.business_name),''),'This contractor') || ' provides local home services.' end,
    array['Homeowners'],v_focus,'Explain services and completed work clearly.',
    'Plainspoken, practical, and trustworthy.',array['social'],v_focus,'ready'
  ) returning * into v_profile;
  insert into public.marketing_business_profile_revisions(
    workspace_id,profile_id,profile_version,profile_snapshot,actor_user_id
  ) values (p_workspace_id,v_profile.id,v_profile.profile_version,
    public.servsync_private_marketing_profile_snapshot(v_profile),null);
  return v_profile.id;
end;
$$;

create function public.servsync_private_seed_contractor_marketing_profile()
returns trigger language plpgsql security definer set search_path=pg_catalog,public volatile as $$
begin
  if new.workspace_kind='contractor' then
    perform public.servsync_private_ensure_contractor_marketing_profile(new.id,new.contractor_id);
  end if;
  return new;
end;
$$;

create trigger marketing_workspace_contractor_profile
  after insert on public.marketing_workspaces for each row
  execute function public.servsync_private_seed_contractor_marketing_profile();

create function public.servsync_get_marketing_creation_context(p_contractor_id uuid default null)
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

create function public.servsync_prepare_job_marketing_derivative(
  p_contractor_id uuid,p_client_request_id uuid,p_job_id uuid,p_source_path text,
  p_mime_type text,p_file_size_bytes bigint,p_sha256 text,p_rights_acknowledged boolean
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,storage volatile as $$
declare v_registered jsonb; v_intake public.marketing_media_intakes; v_ext text;
begin
  v_registered:=public.servsync_register_job_marketing_media(p_contractor_id,p_client_request_id,p_job_id,
    p_source_path,p_mime_type,p_file_size_bytes,p_sha256,p_rights_acknowledged);
  select * into strict v_intake from public.marketing_media_intakes where id=(v_registered->>'intake_id')::uuid for update;
  if v_intake.status='consumed' then return jsonb_build_object('intake_id',v_intake.id,'asset_id',v_intake.consumed_asset_id,'replayed',true); end if;
  v_ext:=case p_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'mp4' end;
  update public.marketing_media_intakes set
    poster_bucket='marketing-assets',poster_path=v_intake.workspace_id::text||'/'||v_intake.id::text||'/poster.jpg',
    original_file_name='job-media.'||v_ext,status='upload_pending',updated_at=now(),last_activity_at=now()
   where id=v_intake.id returning * into v_intake;
  return jsonb_build_object('intake_id',v_intake.id,'source_bucket',v_intake.source_bucket,
    'source_path',v_intake.source_path,'derivative_bucket','marketing-assets',
    'derivative_path',v_intake.workspace_id::text||'/'||v_intake.id::text||'/media.'||v_ext,
    'poster_path',v_intake.poster_path,'replayed',false);
end;
$$;

create function public.servsync_finalize_job_marketing_derivative(
  p_contractor_id uuid,p_intake_id uuid,p_derivative_sha256 text,p_width integer,p_height integer,
  p_duration_seconds numeric,p_poster_sha256 text,p_poster_file_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,storage volatile as $$
declare v_workspace_id uuid; v_intake public.marketing_media_intakes; v_asset public.marketing_media_assets;
  v_source storage.objects; v_poster storage.objects; v_derivative_path text; v_ext text; v_max integer;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'create_edit');
  select * into strict v_intake from public.marketing_media_intakes where id=p_intake_id and workspace_id=v_workspace_id for update;
  if v_intake.status='consumed' then return jsonb_build_object('intake_id',v_intake.id,'asset_id',v_intake.consumed_asset_id,'replayed',true); end if;
  if v_intake.source_kind<>'job_media' or v_intake.status<>'upload_pending' then raise exception 'Invalid Job media derivative.' using errcode='22023'; end if;
  v_ext:=case v_intake.mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'mp4' end;
  v_derivative_path:=v_workspace_id::text||'/'||v_intake.id::text||'/media.'||v_ext;
  select * into strict v_source from storage.objects where bucket_id='marketing-assets' and name=v_derivative_path;
  select * into strict v_poster from storage.objects where bucket_id='marketing-assets' and name=v_intake.poster_path;
  v_max:=(public.servsync_private_effective_marketing_entitlements(v_workspace_id)->>'max_generated_video_seconds')::integer;
  if p_derivative_sha256<>v_intake.sha256 or p_derivative_sha256 !~ '^[a-f0-9]{64}$'
     or p_poster_sha256 !~ '^[a-f0-9]{64}$' or p_width not between 1 and 8192 or p_height not between 1 and 8192
     or coalesce(v_source.metadata->>'mimetype','')<>v_intake.mime_type
     or (v_source.metadata->>'size')::bigint<>v_intake.file_size_bytes
     or coalesce(v_poster.metadata->>'mimetype','')<>'image/jpeg'
     or (v_poster.metadata->>'size')::bigint<>p_poster_file_size_bytes
     or (v_intake.mime_type like 'image/%' and p_duration_seconds is not null)
     or (v_intake.mime_type='video/mp4' and (p_duration_seconds is null or p_duration_seconds<=0 or p_duration_seconds>v_max)) then
    raise exception 'Job media derivative validation failed.' using errcode='22023';
  end if;
  insert into public.marketing_media_assets(
    id,workspace_id,asset_type,source,storage_bucket,storage_path,mime_type,file_size_bytes,width,height,
    duration_seconds,sha256,validation_status,sensitive_data_check,pacing_review,media_variant,created_by,
    source_intake_id,ephemeral,poster_bucket,poster_path,poster_sha256,poster_file_size_bytes
  ) values (
    v_intake.id,v_workspace_id,case when v_intake.mime_type like 'image/%' then 'image' else 'video' end,
    'job_media_derivative','marketing-assets',v_derivative_path,v_intake.mime_type,v_intake.file_size_bytes,
    p_width,p_height,p_duration_seconds,p_derivative_sha256,'passed','user_acknowledged','not_required',
    'job_media_derivative',auth.uid(),v_intake.id,true,'marketing-assets',v_intake.poster_path,p_poster_sha256,p_poster_file_size_bytes
  ) returning * into v_asset;
  update public.marketing_media_intakes set status='consumed',consumed_asset_id=v_asset.id,width=p_width,height=p_height,
    duration_seconds=p_duration_seconds,poster_sha256=p_poster_sha256,poster_file_size_bytes=p_poster_file_size_bytes,
    updated_at=now(),last_activity_at=now() where id=v_intake.id;
  return jsonb_build_object('intake_id',v_intake.id,'asset_id',v_asset.id,'replayed',false);
end;
$$;

create or replace function public.servsync_private_can_upload_marketing_storage_object(p_name text)
returns boolean language sql security definer set search_path=pg_catalog,public,auth stable as $$
  select auth.uid() is not null and exists (
    select 1 from public.marketing_media_intakes intake
    where intake.status='upload_pending' and intake.acknowledged_by=auth.uid()
      and ((intake.source_kind='marketing_upload' and (intake.source_path=p_name or intake.poster_path=p_name))
        or (intake.source_kind='job_media' and
          (intake.workspace_id::text||'/'||intake.id::text||'/media.'||case intake.mime_type
            when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'mp4' end=p_name
           or intake.poster_path=p_name)))
      and (public.servsync_private_require_marketing_workspace(intake.workspace_id,'create_edit')->>'workspace_id')::uuid=intake.workspace_id
  );
$$;

create function public.servsync_bind_marketing_content_source(
  p_contractor_id uuid,p_content_id uuid,p_asset_id uuid,p_source_kind text,p_source_job_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth volatile as $$
declare v_workspace_id uuid; v_content public.marketing_content_items; v_asset public.marketing_media_assets;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'create_edit');
  select * into strict v_content from public.marketing_content_items where id=p_content_id and workspace_id=v_workspace_id for update;
  if v_content.status not in ('idea','draft') or p_source_kind not in ('job','marketing_upload') then raise exception 'Content source cannot be changed.' using errcode='55000'; end if;
  select * into strict v_asset from public.marketing_media_assets where id=p_asset_id and workspace_id=v_workspace_id;
  if (p_source_kind='job' and (p_source_job_id is null or v_asset.source<>'job_media_derivative'))
     or (p_source_kind='marketing_upload' and (p_source_job_id is not null or v_asset.source<>'marketing_upload')) then
    raise exception 'Marketing source does not match the selected asset.' using errcode='22023';
  end if;
  insert into public.marketing_content_source_assets(workspace_id,content_id,asset_id,source_kind,source_job_id,selected_by)
    values(v_workspace_id,v_content.id,v_asset.id,p_source_kind,p_source_job_id,auth.uid())
    on conflict(content_id) do update set asset_id=excluded.asset_id,source_kind=excluded.source_kind,
      source_job_id=excluded.source_job_id,selected_by=excluded.selected_by,selected_at=now();
  return jsonb_build_object('content_id',v_content.id,'asset_id',v_asset.id);
end;
$$;

create function public.servsync_reserve_marketing_content_creation(
  p_contractor_id uuid,p_client_request_id uuid,p_source_kind text,p_source_job_id uuid,
  p_source_asset_id uuid,p_owner_brief text,p_provider text,p_model text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth volatile as $$
declare v_workspace_id uuid; v_request public.marketing_content_creation_requests; v_profile public.marketing_business_profiles;
  v_source jsonb:='{}'::jsonb; v_job public.inspections; v_asset public.marketing_media_assets; v_global public.marketing_global_cost_controls;
  v_fingerprint text; v_entitlements jsonb; v_spend bigint;
begin
  v_workspace_id:=public.servsync_private_marketing_workspace_for_context(p_contractor_id,'create_edit');
  if p_client_request_id is null or p_source_kind not in ('job','marketing_upload','simple')
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
    select * into strict v_asset from public.marketing_media_assets where id=p_source_asset_id and workspace_id=v_workspace_id and source='marketing_upload';
    v_source:=jsonb_build_object('media_type',v_asset.asset_type,'mime_type',v_asset.mime_type);
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
  if v_request.id is null then select * into strict v_request from public.marketing_content_creation_requests
    where workspace_id=v_workspace_id and client_request_id=p_client_request_id;
    if v_request.request_fingerprint_sha256<>v_fingerprint then raise exception 'Marketing draft request conflicts with an existing request.' using errcode='23505'; end if;
  end if;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'content_id',v_request.content_id,'replayed',v_request.created_at<now()-interval '1 millisecond');
end;
$$;

create function public.servsync_claim_marketing_content_creation(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public volatile as $$
declare v_request public.marketing_content_creation_requests; v_global public.marketing_global_cost_controls;
  v_entitlements jsonb; v_spend bigint;
begin
  select * into strict v_request from public.marketing_content_creation_requests where id=p_request_id for update;
  if v_request.status='completed' then return jsonb_build_object('status','completed','content_id',v_request.content_id); end if;
  if v_request.status<>'reserved' then return jsonb_build_object('status',v_request.status); end if;
  select * into strict v_global from public.marketing_global_cost_controls where singleton;
  v_entitlements:=public.servsync_private_effective_marketing_entitlements(v_request.workspace_id);
  v_spend:=public.servsync_private_current_marketing_spend(null);
  if not v_global.generation_enabled or coalesce((v_entitlements->>'generation_enabled')::boolean,false) is not true
     or (v_global.monthly_budget_microusd is not null
       and v_spend*100>=v_global.monthly_budget_microusd*v_global.hard_stop_percent) then
    raise exception 'Marketing drafting is temporarily paused.' using errcode='54000';
  end if;
  update public.marketing_content_creation_requests set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),updated_at=now()
    where id=v_request.id returning * into v_request;
  return jsonb_build_object('status','processing','request_id',v_request.id,'claim_token',v_request.claim_token,
    'provider',v_request.provider,'model',v_request.model,'owner_brief',v_request.owner_brief,
    'profile',v_request.profile_snapshot,'source_kind',v_request.source_kind,'source',v_request.source_snapshot);
end;
$$;

create function public.servsync_complete_marketing_content_creation(
  p_request_id uuid,p_claim_token uuid,p_title text,p_body text,p_input_tokens bigint,p_output_tokens bigint
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public volatile as $$
declare v_request public.marketing_content_creation_requests; v_package public.marketing_content_preparation_packages;
  v_content public.marketing_content_items; v_usage public.marketing_usage_events;
begin
  select * into strict v_request from public.marketing_content_creation_requests where id=p_request_id for update;
  if v_request.status='completed' then return jsonb_build_object('content_id',v_request.content_id,'status','draft','replayed',true); end if;
  if v_request.status<>'processing' or v_request.claim_token<>p_claim_token then raise exception 'Marketing draft claim is stale.' using errcode='40001'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 160 or char_length(btrim(coalesce(p_body,''))) not between 10 and 3000
     or not public.servsync_private_marketing_copy_is_claim_safe(p_title||E'\n'||p_body) then
    raise exception 'Generated Marketing copy did not pass safety checks.' using errcode='22023';
  end if;
  insert into public.marketing_content_preparation_packages(
    workspace_id,preparation_request_id,preparation_source,recipe_key,truth_pack_version,
    brief_summary,item_count,request_fingerprint_sha256,prepared_by
  ) values(v_request.workspace_id,v_request.client_request_id,'runtime_ai','contractor_content_v1',
    'servsync-marketing-truth-v3',left(v_request.owner_brief,500),1,v_request.request_fingerprint_sha256,v_request.created_by)
  returning * into v_package;
  insert into public.marketing_content_items(
    workspace_id,client_request_id,title,content_type,body,channel_category,status,revision_number,created_by,
    preparation_package_id,preparation_sequence,preparation_source,intended_audience,content_role
  ) values(v_request.workspace_id,v_request.client_request_id,btrim(p_title),'social_post',btrim(p_body),'social','draft',1,
    v_request.created_by,v_package.id,1,'runtime_ai','homeowners','educational_post') returning * into v_content;
  insert into public.marketing_content_status_events(workspace_id,content_id,content_revision,from_status,to_status,reason,actor_user_id)
    values(v_request.workspace_id,v_content.id,1,null,'draft','Prepared from contractor-approved source context.',v_request.created_by);
  if v_request.source_asset_id is not null then
    insert into public.marketing_content_source_assets(workspace_id,content_id,asset_id,source_kind,source_job_id,selected_by)
      values(v_request.workspace_id,v_content.id,v_request.source_asset_id,v_request.source_kind,v_request.source_job_id,v_request.created_by);
  end if;
  insert into public.marketing_usage_events(workspace_id,client_request_id,usage_category,generation_consumed,
    provider,model,purpose,content_id,input_tokens,output_tokens,cost_status,outcome,metadata)
  values(v_request.workspace_id,v_request.client_request_id,'ai_text_generation',false,v_request.provider,v_request.model,
    'contractor_content_draft',v_content.id,p_input_tokens,p_output_tokens,'unavailable','succeeded',
    jsonb_build_object('request_id',v_request.id,'source_kind',v_request.source_kind)) returning * into v_usage;
  update public.marketing_content_creation_requests set status='completed',content_id=v_content.id,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,completed_at=now(),updated_at=now() where id=v_request.id;
  return jsonb_build_object('content_id',v_content.id,'status','draft','usage_event_id',v_usage.id,'replayed',false);
end;
$$;

create function public.servsync_fail_marketing_content_creation(
  p_request_id uuid,p_claim_token uuid,p_outcome text,p_failure_category text,p_failure_message text
)
returns void language plpgsql security definer set search_path=pg_catalog,public volatile as $$
declare v_request public.marketing_content_creation_requests; v_status text;
begin
  v_status:=case when p_outcome='uncertain' then 'uncertain' when p_outcome='failed' then 'failed' else null end;
  if v_status is null or char_length(btrim(coalesce(p_failure_category,''))) not between 3 and 80
     or char_length(btrim(coalesce(p_failure_message,''))) not between 3 and 300 then raise exception 'Invalid Marketing draft failure.' using errcode='22023'; end if;
  select * into strict v_request from public.marketing_content_creation_requests where id=p_request_id for update;
  if v_request.status<>'processing' or v_request.claim_token<>p_claim_token then raise exception 'Marketing draft claim is stale.' using errcode='40001'; end if;
  update public.marketing_content_creation_requests set status=v_status,failure_category=btrim(p_failure_category),
    failure_message=btrim(p_failure_message),updated_at=now() where id=v_request.id;
  insert into public.marketing_usage_events(workspace_id,client_request_id,usage_category,generation_consumed,
    provider,model,purpose,cost_status,outcome,metadata)
  values(v_request.workspace_id,v_request.client_request_id,'ai_text_generation',false,v_request.provider,v_request.model,
    'contractor_content_draft','unavailable',v_status,jsonb_build_object('request_id',v_request.id,'failure_category',p_failure_category))
  on conflict(workspace_id,client_request_id,usage_category) do nothing;
end;
$$;

create function public.servsync_private_create_bound_marketing_pairing()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_source public.marketing_content_source_assets; v_pairing_id uuid;
begin
  if new.status<>'approved' or old.status='approved' then return new; end if;
  select * into v_source from public.marketing_content_source_assets where content_id=new.id and workspace_id=new.workspace_id;
  if v_source.content_id is null then return new; end if;
  v_pairing_id:=gen_random_uuid();
  insert into public.marketing_content_media_pairings(
    id,workspace_id,content_id,content_revision,source_direction_id,source_direction_revision,
    asset_id,recorder_scenario,claim_demonstrated,status,created_by
  ) values(v_pairing_id,new.workspace_id,new.id,new.revision_number,new.source_direction_id,new.source_direction_revision,
    v_source.asset_id,case when v_source.source_kind='job' then 'job-media' else 'uploaded-marketing-media' end,
    'Selected by the contractor for this exact Marketing draft.','candidate',v_source.selected_by)
  on conflict(workspace_id,content_id,content_revision,asset_id) do nothing;
  if found then insert into public.marketing_content_media_pairing_events(workspace_id,pairing_id,from_status,to_status,actor_user_id)
    values(new.workspace_id,v_pairing_id,null,'candidate',v_source.selected_by); end if;
  return new;
end;
$$;

create trigger marketing_content_bound_asset_pairing
  after update of status on public.marketing_content_items for each row
  execute function public.servsync_private_create_bound_marketing_pairing();

alter table public.marketing_content_source_assets enable row level security;
alter table public.marketing_content_source_assets force row level security;
alter table public.marketing_content_creation_requests enable row level security;
alter table public.marketing_content_creation_requests force row level security;
revoke all privileges on table public.marketing_content_source_assets from public,anon,authenticated,service_role;
revoke all privileges on table public.marketing_content_creation_requests from public,anon,authenticated,service_role;

do $$ declare s text; begin
  foreach s in array array[
    'servsync_private_marketing_profile_snapshot(marketing_business_profiles)',
    'servsync_private_ensure_contractor_marketing_profile(uuid,uuid)',
    'servsync_private_seed_contractor_marketing_profile()',
    'servsync_get_marketing_creation_context(uuid)',
    'servsync_prepare_job_marketing_derivative(uuid,uuid,uuid,text,text,bigint,text,boolean)',
    'servsync_finalize_job_marketing_derivative(uuid,uuid,text,integer,integer,numeric,text,bigint)',
    'servsync_bind_marketing_content_source(uuid,uuid,uuid,text,uuid)',
    'servsync_reserve_marketing_content_creation(uuid,uuid,text,uuid,uuid,text,text,text)',
    'servsync_claim_marketing_content_creation(uuid)',
    'servsync_complete_marketing_content_creation(uuid,uuid,text,text,bigint,bigint)',
    'servsync_fail_marketing_content_creation(uuid,uuid,text,text,text)',
    'servsync_private_create_bound_marketing_pairing()'
  ] loop
    execute format('alter function public.%s owner to postgres',s);
    execute format('revoke all on function public.%s from public,anon,authenticated,service_role',s);
  end loop;
end $$;

grant execute on function public.servsync_get_marketing_creation_context(uuid) to authenticated;
grant execute on function public.servsync_prepare_job_marketing_derivative(uuid,uuid,uuid,text,text,bigint,text,boolean) to authenticated;
grant execute on function public.servsync_finalize_job_marketing_derivative(uuid,uuid,text,integer,integer,numeric,text,bigint) to authenticated;
grant execute on function public.servsync_bind_marketing_content_source(uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.servsync_reserve_marketing_content_creation(uuid,uuid,text,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.servsync_claim_marketing_content_creation(uuid) to service_role;
grant execute on function public.servsync_complete_marketing_content_creation(uuid,uuid,text,text,bigint,bigint) to service_role;
grant execute on function public.servsync_fail_marketing_content_creation(uuid,uuid,text,text,text) to service_role;

-- Seed existing contractor workspaces deterministically without touching the
-- established ServSync internal profile.
do $$ declare r record; begin
  for r in select id,contractor_id from public.marketing_workspaces where workspace_kind='contractor' loop
    perform public.servsync_private_ensure_contractor_marketing_profile(r.id,r.contractor_id);
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
