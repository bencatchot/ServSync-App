-- ServSync scheduled Marketing destination invalidation v1.
--
-- Moves a not-yet-submitted schedule to Needs Attention when its reviewed
-- provider connection identity changes. Existing provider reconciliation and
-- terminal publication history are not modified.

begin;

do $$
begin
  if to_regclass('public.marketing_publication_packages') is null
     or to_regclass('public.marketing_publishing_controls') is null
     or to_regprocedure('public.servsync_private_retire_stale_marketing_packages()') is null then
    raise exception 'Missing Marketing publishing queue prerequisite.';
  end if;
end;
$$;

create or replace function public.servsync_private_retire_stale_marketing_packages()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
volatile
as $$
begin
  if tg_table_name = 'marketing_content_items' then
    update public.marketing_publication_packages
       set status = 'retired', retired_reason = 'Content revision or approval changed.', updated_at = now()
     where workspace_id = new.workspace_id and content_id = new.id
       and status in ('needs_review','ready')
       and (content_revision <> new.revision_number or new.status <> 'approved');
  elsif tg_table_name = 'marketing_content_media_pairings' then
    update public.marketing_publication_packages
       set status = 'retired', retired_reason = 'Media approval changed.', updated_at = now()
     where workspace_id = new.workspace_id and media_pairing_id = new.id
       and status in ('needs_review','ready') and new.status <> 'approved';
  elsif tg_table_name = 'marketing_provider_connections' then
    update public.marketing_publications
       set status = 'failed',
           failure_category = 'provider_auth',
           failure_message = 'The publishing destination changed. Review the post and authorize a new schedule.',
           retry_eligible = false,
           updated_at = now()
     where workspace_id = new.workspace_id
       and provider_connection_id = new.id
       and status = 'scheduled'
       and provider_request_started_at is null
       and (provider_connection_revision <> new.identity_revision
         or new.connection_status <> 'connected'
         or new.readiness_status <> 'ready'
         or provider_destination_key is distinct from new.destination_key);

    update public.marketing_publication_packages
       set status = 'retired', retired_reason = 'Publishing destination changed.', updated_at = now()
     where workspace_id = new.workspace_id and provider_connection_id = new.id
       and status in ('needs_review','ready')
       and (provider_connection_revision <> new.identity_revision
         or new.connection_status <> 'connected'
         or new.readiness_status <> 'ready'
         or provider_destination_key is distinct from new.destination_key);
  end if;
  return new;
end;
$$;

revoke all on function public.servsync_private_retire_stale_marketing_packages()
  from public, anon, authenticated, service_role;

commit;
