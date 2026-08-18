begin;

do $$
begin
  if to_regclass('public.help_media_assets') is null then
    raise exception 'Help Studio media foundation must be installed before duration validation.';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.help_media_assets'::regclass
      and conname = 'help_assets_ready_video_duration_check'
  ) then
    raise exception 'Help ready-video duration validation is already installed.';
  end if;
  if exists (
    select 1 from public.help_media_assets
    where upload_status = 'ready' and asset_kind = 'video' and duration_seconds is null
  ) then
    raise exception 'A ready Help video is missing duration metadata.';
  end if;
end;
$$;

alter table public.help_media_assets
  add constraint help_assets_ready_video_duration_check check (
    upload_status <> 'ready' or asset_kind <> 'video' or duration_seconds is not null
  );

commit;
