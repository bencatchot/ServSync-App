-- Candidate only. Apply after Discover safety. No existing messages are updated.
begin;

create table discover_safety_private.job_message_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  message_id uuid not null,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('spam','inappropriate','harassment','privacy','other')),
  evidence text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  unique (message_id, reporter_id)
);
alter table discover_safety_private.job_message_reports enable row level security;
revoke all on discover_safety_private.job_message_reports from public,anon,authenticated,service_role;
create index job_message_reports_pending_idx on discover_safety_private.job_message_reports (created_at)
  where reviewed_at is null;

-- Derive the parties from the canonical job, never from caller-supplied account IDs.
create function discover_safety_private.eligible_job_parties(p_job_id uuid)
returns table(homeowner_id uuid,owner_id uuid,contractor_id uuid,can_block boolean)
language sql stable security definer set search_path=''
as $$
  select j.homeowner_user_id, cp.owner_user_id, cp.id,
   auth.uid() in (j.homeowner_user_id,cp.owner_user_id)
  from public.inspections j join public.contractor_profiles cp on cp.id=j.contractor_id
  where j.id=p_job_id and auth.uid() is not null and j.homeowner_user_id is not null
    and cp.owner_user_id is not null and j.homeowner_user_id<>cp.owner_user_id
    and (auth.uid()=j.homeowner_user_id or auth.uid()=cp.owner_user_id or exists(
       select 1 from public.contractor_team_members m where m.contractor_id=cp.id
       and m.user_id=auth.uid() and m.status='active'
       and public.current_user_can_access_contractor(cp.id)));
$$;
revoke all on function discover_safety_private.eligible_job_parties(uuid)
  from public,anon,authenticated,service_role;

create function public.servsync_job_safety_permissions(p_job_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select coalesce((select jsonb_build_object('can_report',true,'can_block',p.can_block,
    'is_homeowner',auth.uid()=p.homeowner_id) from discover_safety_private.eligible_job_parties(p_job_id) p),
    '{"can_report":false,"can_block":false,"is_homeowner":false}'::jsonb);
$$;

create function public.servsync_block_job_counterparty(p_job_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v record;
begin
 select * into v from discover_safety_private.eligible_job_parties(p_job_id);
 if not found or v.can_block is distinct from true then
   raise exception 'Only the homeowner or contractor owner can block in this job.' using errcode='42501';
 end if;
 perform discover_safety_private.lock_pair(v.homeowner_id,v.owner_id);
 insert into discover_safety_private.blocks(homeowner_id,contractor_owner_id)
  values (v.homeowner_id,v.owner_id) on conflict do nothing;
 return true;
end;
$$;

create function public.servsync_report_job_message(p_job_id uuid,p_message_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v record; v_id uuid; v_body text; v_reason text := lower(trim(p_reason));
begin
 if v_reason is null or v_reason not in ('spam','inappropriate','harassment','privacy','other') then
   raise exception 'Choose a reporting reason.' using errcode='22023';
 end if;
 select * into v from discover_safety_private.eligible_job_parties(p_job_id);
 if not found then raise exception 'Job conversation unavailable.' using errcode='42501'; end if;
 -- Only report a message actually sent by the other side of this exact job.
 select m.body into v_body from public.workflow_messages m
 where m.id=p_message_id and m.context_type='job' and m.inspection_id=p_job_id
   and m.homeowner_user_id=v.homeowner_id and m.contractor_id=v.contractor_id
   and m.deleted_at is null and m.sender_user_id<>auth.uid()
   and case when auth.uid()=v.homeowner_id then m.sender_role='contractor'
      else m.sender_role='homeowner' and m.sender_user_id=v.homeowner_id end;
 if v_body is null then raise exception 'Message unavailable.' using errcode='42501'; end if;
 insert into discover_safety_private.job_message_reports(job_id,message_id,reporter_id,reason,evidence)
  values(p_job_id,p_message_id,auth.uid(),v_reason,v_body)
  on conflict(message_id,reporter_id) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from discover_safety_private.job_message_reports where message_id=p_message_id and reporter_id=auth.uid();
 end if;
 return v_id;
end;
$$;

create function public.servsync_list_job_message_reports()
returns table(id uuid,reason text,evidence text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not coalesce(public.current_user_is_platform_admin(),false) then
  raise exception 'Not authorized.' using errcode='42501';
 end if;
 return query select r.id,r.reason,r.evidence,r.created_at
   from discover_safety_private.job_message_reports r where r.reviewed_at is null
   order by case when r.reason in ('privacy','harassment') then 0 else 1 end,r.created_at,r.id limit 100;
end;
$$;

create function public.servsync_review_job_message_report(p_report_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not coalesce(public.current_user_is_platform_admin(),false) then
  raise exception 'Not authorized.' using errcode='42501';
 end if;
 -- Close the case and discard the temporary evidence copy. Do not alter the
 -- parties’ original history, receipts, invoices, or messages.
 update discover_safety_private.job_message_reports set reviewed_at=clock_timestamp(),
   reviewer_id=auth.uid(),evidence='' where id=p_report_id and reviewed_at is null;
 return found;
end;
$$;
revoke all on function public.servsync_job_safety_permissions(uuid),
 public.servsync_block_job_counterparty(uuid), public.servsync_report_job_message(uuid,uuid,text),
 public.servsync_list_job_message_reports(), public.servsync_review_job_message_report(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.servsync_job_safety_permissions(uuid),
 public.servsync_block_job_counterparty(uuid), public.servsync_report_job_message(uuid,uuid,text),
 public.servsync_list_job_message_reports(), public.servsync_review_job_message_report(uuid)
 to authenticated;
notify pgrst, 'reload schema';
commit;
