begin;

create temp table servsync_finalization_fingerprints(
  label text primary key,
  count bigint,
  fingerprint text
) on commit drop;

do $fingerprints$
declare
  relation record;
begin
  for relation in
    select schemaname, tablename
      from pg_tables
     where schemaname = 'public'
  loop
    execute format(
      'insert into servsync_finalization_fingerprints select %L,count(*)::bigint,md5(coalesce(string_agg(md5(to_jsonb(row_value)::text),'''' order by md5(to_jsonb(row_value)::text)),'''')) from %I.%I row_value',
      relation.schemaname || '.' || relation.tablename,
      relation.schemaname,
      relation.tablename
    );
  end loop;
end
$fingerprints$;

insert into servsync_finalization_fingerprints
select 'auth.users', count(*), md5(coalesce(string_agg(
  md5((to_jsonb(row_value)
    - 'encrypted_password' - 'confirmation_token' - 'recovery_token'
    - 'email_change_token_new' - 'email_change' - 'email_change_token_current'
    - 'reauthentication_token' - 'phone_change_token' - 'phone_change')::text),
  '' order by id), ''))
from auth.users row_value;

insert into servsync_finalization_fingerprints
select 'auth.identities', count(*), md5(coalesce(string_agg(
  md5((to_jsonb(row_value) - 'identity_data')::text), '' order by id), ''))
from auth.identities row_value;

insert into servsync_finalization_fingerprints
select 'storage.buckets', count(*), md5(coalesce(string_agg(
  md5(to_jsonb(row_value)::text), '' order by id), ''))
from storage.buckets row_value;

insert into servsync_finalization_fingerprints
select 'storage.objects', count(*), md5(coalesce(string_agg(
  md5(to_jsonb(row_value)::text), '' order by id), ''))
from storage.objects row_value;

select label, count, fingerprint
  from servsync_finalization_fingerprints
 order by label;

rollback;
