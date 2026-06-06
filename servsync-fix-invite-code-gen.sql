-- ServSync fix: replace gen_random_bytes() with gen_random_uuid().
-- Paste into the Supabase SQL Editor.
--
-- gen_random_bytes() requires the pgcrypto extension.
-- gen_random_uuid() is built-in (PostgreSQL 13+) and needs no extension.
-- Both produce a cryptographically random 12-char uppercase hex invite code.

begin;

create or replace function public.servsync_generate_invite_code()
returns text
language sql
as $$
  select upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

create or replace function public.servsync_regenerate_permanent_qr()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_code text;
  v_attempts int := 0;
begin
  loop
    v_new_code := servsync_generate_invite_code();
    begin
      update public.contractor_profiles
         set permanent_invite_code = v_new_code,
             updated_at = now()
       where owner_user_id = auth.uid();
      return v_new_code;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 10 then raise exception 'Could not generate unique code'; end if;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
