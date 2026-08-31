-- Allow an approved, rights-acknowledged Marketing MP4 upload to use the
-- existing managed Facebook video publishing path. Job media and unfinished
-- compositions remain ineligible.

begin;

do $$
begin
  if to_regprocedure('public.servsync_prepare_marketing_publication_media(uuid,integer)') is null
     or to_regclass('public.marketing_media_assets') is null
     or to_regclass('public.marketing_media_intakes') is null then
    raise exception 'Marketing media intake and managed-video publishing must be installed first.';
  end if;
  if coalesce(
    obj_description(
      'public.servsync_prepare_marketing_publication_media(uuid,integer)'::regprocedure,
      'pg_proc'
    ),
    ''
  ) = 'servsync-uploaded-marketing-video-publishing-eligibility-v1' then
    raise exception 'Uploaded Marketing video publishing eligibility is already installed.';
  end if;
end;
$$;

create or replace function public.servsync_prepare_marketing_publication_media(
  p_publication_id uuid,
  p_attempt_number integer
)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,storage
as $$
declare
  v_publication public.marketing_publications;
  v_connection public.marketing_provider_connections;
  v_pairing public.marketing_content_media_pairings;
  v_asset public.marketing_media_assets;
  v_object storage.objects;
begin
  select publication.* into strict v_publication
  from public.marketing_publications publication
  join public.marketing_workspaces workspace on workspace.id=publication.workspace_id
  where publication.id=p_publication_id
    and workspace.workspace_key='servsync_internal'
    and workspace.workspace_kind='internal'
    and workspace.contractor_id is null
  for share of publication;
  if v_publication.status<>'publishing' or v_publication.attempt_count<>p_attempt_number
     or v_publication.provider<>'facebook' or v_publication.media_pairing_id is null
     or jsonb_typeof(v_publication.media_snapshot)<>'object'
     or (v_publication.content_snapshot->>'content_revision')::bigint<>v_publication.content_revision then
    raise exception 'Managed Marketing publication authorization is invalid.' using errcode='55000';
  end if;

  select * into strict v_connection from public.marketing_provider_connections
  where id=v_publication.provider_connection_id and workspace_id=v_publication.workspace_id
    and provider='facebook' and connection_status='connected'
    and destination_key=v_publication.provider_destination_key;
  if coalesce((v_connection.capabilities->>'media')::boolean,false) is not true
     or coalesce((v_connection.capabilities->>'publishing_enabled')::boolean,false) is not true then
    raise exception 'Facebook managed-video publishing is not enabled.' using errcode='55000';
  end if;

  select * into strict v_pairing from public.marketing_content_media_pairings
  where id=v_publication.media_pairing_id and workspace_id=v_publication.workspace_id
    and content_id=v_publication.content_id and content_revision=v_publication.content_revision
    and status='approved';
  select * into strict v_asset from public.marketing_media_assets asset
  where asset.id=v_pairing.asset_id and asset.workspace_id=v_publication.workspace_id
    and asset.validation_status='passed'
    and (
      (
        asset.media_variant in ('silent_product_demo_master','narrated_marketing_derivative')
        and asset.sensitive_data_check='passed'
        and asset.pacing_review='passed'
      )
      or (
        asset.media_variant='uploaded_marketing_source'
        and asset.source='marketing_upload'
        and asset.sensitive_data_check='user_acknowledged'
        and asset.pacing_review='not_required'
        and asset.source_intake_id is not null
        and asset.ephemeral
        and exists (
          select 1 from public.marketing_media_intakes intake
          where intake.id=asset.source_intake_id
            and intake.workspace_id=asset.workspace_id
            and intake.source_kind='marketing_upload'
            and intake.rights_acknowledgement_version='marketing_media_rights_v1'
            and intake.acknowledged_by is not null
            and intake.acknowledged_at is not null
            and intake.status='consumed'
            and intake.consumed_asset_id=asset.id
        )
      )
    );

  if v_publication.media_snapshot->>'pairing_id'<>v_pairing.id::text
     or v_publication.media_snapshot->>'asset_id'<>v_asset.id::text
     or v_publication.media_snapshot->>'storage_bucket'<>v_asset.storage_bucket
     or v_publication.media_snapshot->>'storage_path'<>v_asset.storage_path
     or v_publication.media_snapshot->>'mime_type'<>v_asset.mime_type
     or v_publication.media_snapshot->>'sha256'<>v_asset.sha256
     or (v_publication.media_snapshot->>'file_size_bytes')::bigint<>v_asset.file_size_bytes
     or v_asset.storage_bucket<>'marketing-assets' or v_asset.mime_type<>'video/mp4'
     or v_asset.file_size_bytes not between 1 and 104857600 then
    raise exception 'Managed Marketing media no longer matches the immutable publication snapshot.' using errcode='55000';
  end if;
  if v_asset.media_variant='narrated_marketing_derivative'
     and position(v_asset.ai_narration_disclosure_text in (v_publication.content_snapshot->>'body'))=0 then
    raise exception 'The required public AI narration disclosure is missing.' using errcode='22023';
  end if;

  select * into strict v_object from storage.objects
  where bucket_id=v_asset.storage_bucket and name=v_asset.storage_path;
  if coalesce(v_object.metadata->>'mimetype','')<>v_asset.mime_type
     or coalesce((v_object.metadata->>'size')::bigint,-1)<>v_asset.file_size_bytes then
    raise exception 'Managed Marketing Storage metadata mismatch.' using errcode='55000';
  end if;

  return jsonb_build_object(
    'pairing_id',v_pairing.id,'asset_id',v_asset.id,
    'storage_bucket',v_asset.storage_bucket,'storage_path',v_asset.storage_path,
    'mime_type',v_asset.mime_type,'file_size_bytes',v_asset.file_size_bytes,
    'sha256',v_asset.sha256
  );
end;
$$;

comment on function public.servsync_prepare_marketing_publication_media(uuid,integer)
  is 'servsync-uploaded-marketing-video-publishing-eligibility-v1';
alter function public.servsync_prepare_marketing_publication_media(uuid,integer) owner to postgres;
revoke all on function public.servsync_prepare_marketing_publication_media(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.servsync_prepare_marketing_publication_media(uuid,integer)
  to service_role;

notify pgrst,'reload schema';
commit;
