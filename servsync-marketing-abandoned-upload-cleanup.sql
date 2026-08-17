-- ServSync abandoned pre-finalization Marketing upload cleanup v1.
--
-- Extends the bounded exact-object cleanup worker to remove reserved private
-- upload bytes that never reached asset finalization. Canonical Job media is
-- excluded. No provider or publication operation is performed.

begin;

do $$
begin
  if to_regclass('public.marketing_media_intakes') is null
     or to_regclass('public.marketing_workspace_entitlements') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Missing Marketing abandoned-upload cleanup prerequisite.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'marketing_media_intakes'
      and column_name in ('purge_claimed_at','purge_claim_token')
  ) or to_regprocedure('public.servsync_claim_abandoned_marketing_upload_purges(integer)') is not null then
    raise exception 'Marketing abandoned-upload cleanup target already exists.';
  end if;
end;
$$;

alter table public.marketing_media_intakes
  add column purge_claimed_at timestamptz null,
  add column purge_claim_token uuid null,
  add constraint marketing_media_intakes_purge_claim_check check (
    (status = 'purging' and purge_claimed_at is not null and purge_claim_token is not null)
    or (status <> 'purging' and purge_claimed_at is null and purge_claim_token is null)
  );

create index marketing_media_intakes_abandoned_upload_idx
  on public.marketing_media_intakes(last_activity_at, id)
  where source_kind = 'marketing_upload' and status = 'upload_pending';

create function public.servsync_claim_abandoned_marketing_upload_purges(p_limit integer default 5)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public volatile as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 20 then
    raise exception 'Invalid abandoned Marketing upload purge limit.' using errcode = '22023';
  end if;
  with eligible as (
    select intake.id, gen_random_uuid() as claim_token
    from public.marketing_media_intakes intake
    where intake.source_kind = 'marketing_upload'
      and intake.status = 'upload_pending'
      and intake.last_activity_at <= now() - make_interval(days =>
        (public.servsync_private_effective_marketing_entitlements(intake.workspace_id)->>'abandoned_media_expiration_days')::integer)
    order by intake.last_activity_at, intake.id
    for update of intake skip locked limit p_limit
  ), updated as (
    update public.marketing_media_intakes intake set
      status = 'purging', purge_claimed_at = now(), purge_claim_token = eligible.claim_token,
      updated_at = now()
    from eligible where intake.id = eligible.id
    returning intake.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'intake_id', updated.id, 'workspace_id', updated.workspace_id,
    'claim_token', updated.purge_claim_token,
    'source_bucket', updated.source_bucket, 'source_path', updated.source_path,
    'poster_bucket', updated.poster_bucket, 'poster_path', updated.poster_path,
    'source_file_size_bytes', updated.file_size_bytes,
    'poster_file_size_bytes', updated.poster_file_size_bytes
  ) order by updated.id), '[]'::jsonb) into v_result from updated;
  return v_result;
end;
$$;

create function public.servsync_complete_abandoned_marketing_upload_purge(
  p_intake_id uuid, p_claim_token uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, storage volatile as $$
declare v_intake public.marketing_media_intakes;
begin
  select * into strict v_intake from public.marketing_media_intakes where id = p_intake_id for update;
  if v_intake.status = 'purged' then
    return jsonb_build_object('intake_id', p_intake_id, 'state', 'purged', 'replayed', true);
  end if;
  if v_intake.source_kind <> 'marketing_upload' or v_intake.status <> 'purging'
     or v_intake.purge_claim_token <> p_claim_token or v_intake.consumed_asset_id is not null then
    raise exception 'Abandoned Marketing upload purge claim is stale.' using errcode = '40001';
  end if;
  if exists (
    select 1 from storage.objects object
    where (object.bucket_id = v_intake.source_bucket and object.name = v_intake.source_path)
       or (object.bucket_id = v_intake.poster_bucket and object.name = v_intake.poster_path)
  ) then
    raise exception 'Abandoned Marketing upload bytes still exist.' using errcode = '55000';
  end if;
  update public.marketing_media_intakes set
    status = 'purged', purge_claimed_at = null, purge_claim_token = null,
    last_activity_at = now(), updated_at = now()
  where id = p_intake_id;
  insert into public.marketing_usage_events (
    workspace_id, client_request_id, usage_category, bytes_processed,
    cost_status, outcome, metadata
  ) values (
    v_intake.workspace_id, p_claim_token, 'storage_purge',
    v_intake.file_size_bytes + coalesce(v_intake.poster_file_size_bytes, 0),
    'unavailable', 'succeeded', jsonb_build_object('intake_id', p_intake_id, 'pre_finalization', true)
  ) on conflict (workspace_id, client_request_id, usage_category) do nothing;
  return jsonb_build_object('intake_id', p_intake_id, 'state', 'purged', 'replayed', false);
end;
$$;

create function public.servsync_fail_abandoned_marketing_upload_purge(
  p_intake_id uuid, p_claim_token uuid, p_reason text
)
returns void language plpgsql security definer
set search_path = pg_catalog, public volatile as $$
declare v_intake public.marketing_media_intakes; v_reason text := btrim(coalesce(p_reason,''));
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'Invalid abandoned upload purge failure.' using errcode = '22023';
  end if;
  select * into strict v_intake from public.marketing_media_intakes where id = p_intake_id for update;
  if v_intake.status <> 'purging' or v_intake.purge_claim_token <> p_claim_token then
    raise exception 'Abandoned Marketing upload purge claim is stale.' using errcode = '40001';
  end if;
  update public.marketing_media_intakes set
    status = 'upload_pending', purge_claimed_at = null, purge_claim_token = null,
    updated_at = now()
  where id = p_intake_id;
end;
$$;

alter function public.servsync_claim_abandoned_marketing_upload_purges(integer) owner to postgres;
alter function public.servsync_complete_abandoned_marketing_upload_purge(uuid,uuid) owner to postgres;
alter function public.servsync_fail_abandoned_marketing_upload_purge(uuid,uuid,text) owner to postgres;

revoke all on function public.servsync_claim_abandoned_marketing_upload_purges(integer) from public, anon, authenticated, service_role;
revoke all on function public.servsync_complete_abandoned_marketing_upload_purge(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.servsync_fail_abandoned_marketing_upload_purge(uuid,uuid,text) from public, anon, authenticated, service_role;

grant execute on function public.servsync_claim_abandoned_marketing_upload_purges(integer) to service_role;
grant execute on function public.servsync_complete_abandoned_marketing_upload_purge(uuid,uuid) to service_role;
grant execute on function public.servsync_fail_abandoned_marketing_upload_purge(uuid,uuid,text) to service_role;

notify pgrst, 'reload schema';

commit;
