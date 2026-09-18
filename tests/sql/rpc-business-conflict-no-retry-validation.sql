\set ON_ERROR_STOP on
-- Disposable local database only; uses the existing queue validation fixtures.
\ir ../../servsync-marketing-media-retirement-control.sql
\ir ../../servsync-contractor-marketing-content-creation.sql
\ir ../../servsync-help-studio-foundation.sql
\ir ../../servsync-help-studio-recording-workflow.sql
\ir ../../servsync-help-studio-recording-package-validation-forward-fix.sql
\ir ../../servsync-help-narration-caption-foundation.sql

create function public.unrelated_serialization_probe() returns void language plpgsql as $$
begin raise exception 'A genuine serialization failure' using errcode='40001'; end;
$$;
create temp table before_functions as
select p.oid, p.proname, to_jsonb(p) - 'prosrc' - 'proargdefaults' as metadata, pg_get_functiondef(p.oid) as definition,
       obj_description(p.oid, 'pg_proc') as comment
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f';
create temp table before_packages as select * from public.marketing_publication_packages;
create temp table before_publications as select * from public.marketing_publications;
create temp table before_events as select * from public.marketing_publication_events;

\ir ../../servsync-rpc-business-conflict-no-retry.sql
-- Safe to resume after a lost response or rerun after installation.
\ir ../../servsync-rpc-business-conflict-no-retry.sql

do $$
declare v_expected integer;
begin
  select count(*) into v_expected from before_functions
  where proname like 'servsync_%' and position('''40001''' in definition)>0;
  if v_expected <> 32 then raise exception 'Expected all 32 affected function fixtures, got %', v_expected; end if;
  if exists (
    select 1 from before_functions b join pg_proc p on p.oid=b.oid
    where b.metadata is distinct from (to_jsonb(p)-'prosrc'-'proargdefaults')
      or b.comment is distinct from obj_description(p.oid, 'pg_proc')
      or pg_get_functiondef(p.oid) is distinct from case when b.proname like 'servsync_%'
        then regexp_replace(b.definition, '(errcode[[:space:]]*=[[:space:]]*)''40001''', '\1''PT409''', 'gi')
        else b.definition end
  ) then raise exception 'Migration changed more than the intended error codes or missed a function'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'servsync_%' and p.prosrc like '%''40001''%') then
    raise exception 'A ServSync function still emits a retryable business conflict';
  end if;
  if exists (select * from before_packages except select * from public.marketing_publication_packages)
    or exists (select * from public.marketing_publication_packages except select * from before_packages)
    or exists (select * from before_publications except select * from public.marketing_publications)
    or exists (select * from public.marketing_publications except select * from before_publications)
    or exists (select * from before_events except select * from public.marketing_publication_events)
    or exists (select * from public.marketing_publication_events except select * from before_events) then
    raise exception 'Migration changed business records';
  end if;
end $$;

begin;
-- Store fixture identities as postgres, then exercise the real authenticated RPC.
do $$
declare v_package public.marketing_publication_packages;
begin
  select * into strict v_package from public.marketing_publication_packages where status='needs_attention' limit 1;
  v_package.id := gen_random_uuid();
  v_package.client_request_id := gen_random_uuid();
  v_package.package_fingerprint := repeat('e',64);
  v_package.status := 'published';
  insert into public.marketing_publication_packages select (v_package).*;
  perform set_config('test.published_id',v_package.id::text,true);
end $$;
select set_config('test.retired_id',id::text,false),
       set_config('test.retired_fingerprint',package_fingerprint,false)
from public.marketing_publication_packages where status='retired' limit 1;
select set_config('test.active_id',id::text,false),
       set_config('test.active_fingerprint',package_fingerprint,false)
from public.marketing_publication_packages where status='needs_attention' limit 1;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
begin
  begin
    perform public.servsync_record_marketing_package_preview(
      '20000000-0000-4000-8000-000000000001', current_setting('test.published_id')::uuid,repeat('e',64));
    raise exception 'Published package preview unexpectedly succeeded';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.servsync_record_marketing_package_preview(
      '20000000-0000-4000-8000-000000000001', current_setting('test.retired_id')::uuid,
      current_setting('test.retired_fingerprint'));
    raise exception 'Retired package preview unexpectedly succeeded';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'Marketing package changed; reload and try again.' then raise; end if;
  end;
  begin
    perform public.servsync_record_marketing_package_preview(
      '20000000-0000-4000-8000-000000000001', current_setting('test.active_id')::uuid,repeat('f',64));
    raise exception 'Wrong fingerprint unexpectedly succeeded';
  exception when sqlstate 'PT409' then null; end;
  perform public.servsync_record_marketing_package_preview(
    '20000000-0000-4000-8000-000000000001', current_setting('test.active_id')::uuid,
    current_setting('test.active_fingerprint'));
  begin
    perform public.servsync_record_marketing_package_preview(
      '20000000-0000-4000-8000-000000000002', current_setting('test.active_id')::uuid,
      current_setting('test.active_fingerprint'));
    raise exception 'Cross-tenant preview unexpectedly succeeded';
  exception when sqlstate '42501' then null; end;
end $$;
rollback;

select '32 functions repaired; exact definitions, metadata, data, idempotence, conflicts, valid preview and tenant denial passed' as result;
