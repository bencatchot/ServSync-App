-- Disposable below-ACL guard test. All temporary grants are rolled back.
begin;

grant insert, update, delete, truncate on public.trade_section_instances to service_role;
grant insert, update, delete, truncate on public.trade_section_revisions to service_role;

set role service_role;
select set_config('servsync.trade_section_change_kind', 'created', false);
select set_config('servsync.trade_section_source_kind', 'authenticated_rpc', false);
select set_config('servsync.trade_section_revision_write', 'allowed', false);

do $test$
begin
  begin
    insert into public.trade_section_instances default values;
    raise exception 'Expected forged service_role instance insert to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role instance insert to fail.' then raise; end if;
    if position('controlled mutation boundary' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.trade_section_instances set updated_at = updated_at;
    raise exception 'Expected forged service_role instance update to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role instance update to fail.' then raise; end if;
    if position('controlled mutation boundary' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.trade_section_instances;
    raise exception 'Expected forged service_role instance delete to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role instance delete to fail.' then raise; end if;
    if position('controlled mutation boundary' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    truncate public.trade_section_revisions, public.trade_section_instances;
    raise exception 'Expected forged service_role instance truncate to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role instance truncate to fail.' then raise; end if;
    if position('cannot be truncated' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    insert into public.trade_section_revisions default values;
    raise exception 'Expected forged service_role revision insert to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role revision insert to fail.' then raise; end if;
    if position('append-only and immutable' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.trade_section_revisions set recorded_at = recorded_at;
    raise exception 'Expected forged service_role revision update to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role revision update to fail.' then raise; end if;
    if position('append-only and immutable' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.trade_section_revisions;
    raise exception 'Expected forged service_role revision delete to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role revision delete to fail.' then raise; end if;
    if position('append-only and immutable' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    truncate public.trade_section_revisions;
    raise exception 'Expected forged service_role revision truncate to fail.';
  exception when others then
    if sqlerrm = 'Expected forged service_role revision truncate to fail.' then raise; end if;
    if position('cannot be truncated' in sqlerrm) = 0 then raise; end if;
  end;
end;
$test$;

reset role;
rollback;
