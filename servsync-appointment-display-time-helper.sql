-- ServSync appointment display-time helper.
-- Safe to run on production or sandbox. This restores the helper used by
-- appointment and unified visit RPCs without changing data, RLS, or tables.

begin;

create or replace function public.servsync_appointment_display_time(p_proposed_at timestamptz)
returns text
language sql
stable
as $$
  select to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM "UTC"');
$$;

grant execute on function public.servsync_appointment_display_time(timestamptz) to authenticated;

commit;
