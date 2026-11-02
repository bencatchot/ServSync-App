-- Disposable synthetic destination. Never install in a shared/live database.
begin;
do $$ begin
  if current_database() !~ '^servsync_destination_local_[a-f0-9]+$' or to_regnamespace('auth') is not null then raise exception 'Disposable destination required'; end if;
end $$;
create role practice_destination nologin;
create role practice_destination_reconcile nologin;
create table destination_drafts (
  id uuid primary key default gen_random_uuid(), operation_id uuid not null unique,
  contractor_id uuid not null, package_hash text not null,
  status text not null check(status='draft'), payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create table transfer_receipts (
  operation_id uuid primary key, contractor_id uuid not null, package_hash text not null,
  destination_id uuid references destination_drafts, status text not null check(status in ('complete','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '2160 hours',
  check((status='complete')=(destination_id is not null))
);
-- All access through narrow functions; no table grants, even to the recovery worker.
create function destination_result(operation uuid, contractor uuid, expected_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r transfer_receipts; d destination_drafts;
begin
  select * into d from destination_drafts where operation_id=operation;
  if found then
    if d.contractor_id<>contractor or d.package_hash<>expected_hash then raise exception 'Transfer identity conflict'; end if;
    return jsonb_build_object('operation_id',operation,'contractor_id',contractor,'package_hash',expected_hash,'status','complete','destination_id',d.id,'created_at',d.created_at,'expires_at',d.created_at+interval '2160 hours');
  end if;
  select * into r from transfer_receipts where operation_id=operation;
  if found then
    if r.contractor_id<>contractor or r.package_hash<>expected_hash then raise exception 'Transfer identity conflict'; end if;
    return to_jsonb(r);
  end if;
  return null;
end $$;
create function destination_deadline(operation uuid, deadline timestamptz) returns timestamptz
language plpgsql immutable set search_path=pg_catalog as $$
begin
  if substr(operation::text,15,1)<>'7' then raise exception 'Server-minted operation required'; end if;
  return least(deadline,to_timestamp((('x'||substr(replace(operation::text,'-',''),1,12))::bit(48)::bigint)::numeric/1000)+interval '10 minutes');
end $$;
create function destination_accept(operation uuid, contractor uuid, expected_hash text, deadline timestamptz, content jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare existing jsonb; destination uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(operation::text,0));
  existing:=destination_result(operation,contractor,expected_hash);
  if existing is not null then
    if existing->>'status'='cancelled' then raise exception 'Transfer admission cancelled'; end if;
    return existing;
  end if;
  -- Check after locking, not before a potentially long queue wait. Never renew a stale ID.
  if clock_timestamp()>=destination_deadline(operation,deadline) then raise exception 'Transfer admission expired'; end if;
  if content is null or octet_length(content::text)>1048576 then raise exception 'Invalid transfer content'; end if;
  insert into destination_drafts(operation_id,contractor_id,package_hash,status,payload) values(operation,contractor,expected_hash,'draft',content) returning id into destination;
  insert into transfer_receipts(operation_id,contractor_id,package_hash,destination_id,status) values(operation,contractor,expected_hash,destination,'complete');
  return destination_result(operation,contractor,expected_hash);
end $$;
create function destination_reconcile(operation uuid, contractor uuid, expected_hash text, deadline timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare existing jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(operation::text,0));
  existing:=destination_result(operation,contractor,expected_hash);
  if existing is not null then return existing; end if;
  if clock_timestamp()<destination_deadline(operation,deadline) then return null; end if;
  -- The same lock fences a delayed writer. Absence without this fence is NOT cancellation.
  insert into transfer_receipts(operation_id,contractor_id,package_hash,status) values(operation,contractor,expected_hash,'cancelled');
  return destination_result(operation,contractor,expected_hash);
end $$;
create function destination_prune(expected_database text) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare removed bigint;
begin
  if current_database()<>expected_database or current_database() !~ '^servsync_destination_local_[a-f0-9]+$' then raise exception 'Cleanup target mismatch'; end if;
  delete from transfer_receipts where expires_at<=clock_timestamp();
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function destination_result(uuid,uuid,text), destination_deadline(uuid,timestamptz), destination_accept(uuid,uuid,text,timestamptz,jsonb), destination_reconcile(uuid,uuid,text,timestamptz), destination_prune(text) from public;
grant execute on function destination_accept(uuid,uuid,text,timestamptz,jsonb), destination_result(uuid,uuid,text) to practice_destination;
grant execute on function destination_reconcile(uuid,uuid,text,timestamptz), destination_prune(text) to practice_destination_reconcile;
commit;
