-- Production-only rollout compatibility for the first immutable publication.
--
-- This guard preserves all existing identity checks and permits exactly one
-- null-to-snapshot queue authorization backfill. The queue migration replaces
-- this function with its final strict terminal guard after the backfill.

begin;

create or replace function public.servsync_private_guard_marketing_publication_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_backfill_columns constant text[] := array[
    'package_id',
    'package_fingerprint',
    'provider_connection_revision',
    'authorization_action',
    'authorization_request_id',
    'authorized_by',
    'authorized_at',
    'authorization_timezone'
  ];
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.content_id is distinct from old.content_id
     or new.content_revision is distinct from old.content_revision
     or new.content_snapshot is distinct from old.content_snapshot
     or new.media_pairing_id is distinct from old.media_pairing_id
     or new.media_snapshot is distinct from old.media_snapshot
     or new.provider_connection_id is distinct from old.provider_connection_id
     or new.provider is distinct from old.provider
     or new.provider_destination_key is distinct from old.provider_destination_key
     or new.provider_destination_label is distinct from old.provider_destination_label
     or new.publication_mode is distinct from old.publication_mode
     or new.scheduled_at is distinct from old.scheduled_at
     or new.client_request_id is distinct from old.client_request_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Marketing publication authorization snapshot is immutable.';
  end if;

  if old.status in ('published', 'cancelled') then
    if v_old -> 'package_id' = 'null'::jsonb
       and jsonb_typeof(v_new -> 'package_id') = 'string'
       and v_old -> 'package_fingerprint' = 'null'::jsonb
       and (v_new ->> 'package_fingerprint') ~ '^[a-f0-9]{64}$'
       and v_old -> 'provider_connection_revision' = 'null'::jsonb
       and (v_new ->> 'provider_connection_revision')::bigint >= 1
       and v_old -> 'authorization_action' = 'null'::jsonb
       and v_new ->> 'authorization_action' = old.publication_mode
       and v_old -> 'authorization_request_id' = 'null'::jsonb
       and v_new ->> 'authorization_request_id' = old.client_request_id::text
       and v_old -> 'authorized_by' = 'null'::jsonb
       and v_new ->> 'authorized_by' = old.created_by::text
       and v_old -> 'authorized_at' = 'null'::jsonb
       and (v_new ->> 'authorized_at')::timestamptz = old.created_at
       and v_old -> 'authorization_timezone' = 'null'::jsonb
       and v_new ->> 'authorization_timezone' = 'UTC'
       and (v_new - v_backfill_columns) = (v_old - v_backfill_columns) then
      return new;
    end if;

    raise exception 'Terminal Marketing publications are immutable.';
  end if;

  return new;
end;
$$;

commit;
