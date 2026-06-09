-- ServSync fix: local customer claim invite token generation.
-- Paste this into the Supabase SQL Editor after
-- servsync-local-customer-claim-invites.sql.
--
-- Some Supabase environments may not expose gen_random_bytes() to this
-- function. gen_random_uuid() is already available in this project, so this
-- keeps claim invite tokens random without depending on gen_random_bytes().

begin;

create or replace function public.servsync_generate_local_customer_claim_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  loop
    v_token := lower(
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '')
    );

    exit when not exists (
      select 1
        from public.contractor_local_customer_claim_invites
       where invite_token = v_token
    );
  end loop;

  return v_token;
end;
$$;

grant execute on function public.servsync_generate_local_customer_claim_token() to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification after applying:
-- select length(public.servsync_generate_local_customer_claim_token()) as token_length;
