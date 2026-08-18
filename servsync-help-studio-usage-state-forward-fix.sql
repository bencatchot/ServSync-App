begin;

do $$
begin
  if to_regprocedure('public.servsync_get_help_media_usage()') is null
     or to_regclass('public.help_walkthroughs') is null
     or to_regclass('public.help_media_assets') is null then
    raise exception 'Help Studio foundation must be installed before the usage-state forward fix.';
  end if;
end;
$$;

create or replace function public.servsync_get_help_media_usage()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
declare v_workspace_id uuid;
begin
  v_workspace_id := public.servsync_private_require_help_admin();
  return (
    select jsonb_build_object(
      'total_assets', count(*) filter (where upload_status = 'ready'),
      'total_bytes', coalesce(sum(file_size_bytes) filter (where upload_status = 'ready'), 0),
      'video_assets', count(*) filter (where upload_status = 'ready' and asset_kind = 'video'),
      'poster_assets', count(*) filter (where upload_status = 'ready' and asset_kind = 'poster'),
      'published_walkthroughs', (
        select count(*) from public.help_walkthroughs
        where workspace_id = v_workspace_id
          and state in ('published', 'needs_review')
          and published_revision is not null
      ),
      'unpublished_walkthroughs', (
        select count(*) from public.help_walkthroughs
        where workspace_id = v_workspace_id
          and not (state in ('published', 'needs_review') and published_revision is not null)
      )
    ) from public.help_media_assets where workspace_id = v_workspace_id
  );
end;
$$;

alter function public.servsync_get_help_media_usage() owner to postgres;
revoke all on function public.servsync_get_help_media_usage() from public, anon, authenticated, service_role;
grant execute on function public.servsync_get_help_media_usage() to authenticated;

commit;
