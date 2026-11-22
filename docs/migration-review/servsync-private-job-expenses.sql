-- Review/isolated QA only. Not in automatic rollout or backend parity manifests.
-- No changes to existing job, estimate, invoice, role or Storage policies.
begin;

create schema if not exists servsync_expense_private authorization postgres;
revoke all on schema servsync_expense_private from public, anon, authenticated;

create table servsync_expense_private.assignments (
  contractor_id uuid not null,
  job_id uuid not null references public.inspections(id) on delete cascade,
  member_id uuid not null references public.contractor_team_members(id) on delete cascade,
  primary key(job_id,member_id)
);

create table servsync_expense_private.entries (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete restrict,
  job_id uuid references public.inspections(id) on delete restrict,
  estimate_id uuid references public.estimates(id) on delete restrict,
  actor_id uuid not null,
  request_id uuid not null,
  amount_cents integer not null check(amount_cents > 0),
  purchase_date date not null,
  category text not null check(category in ('Materials','Labor','Subcontractors','Equipment','Permits','Other')),
  vendor text not null default '' check(char_length(vendor)<=140),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  unique(contractor_id,actor_id,request_id),
  check(num_nonnulls(job_id,estimate_id)=1)
);
create index expense_entries_job on servsync_expense_private.entries(contractor_id,job_id,created_at desc,id) where voided_at is null;
create index expense_entries_estimate on servsync_expense_private.entries(contractor_id,estimate_id,created_at desc,id) where voided_at is null;

-- Receipt bytes cannot appear in even an internal list projection.
create table servsync_expense_private.receipts (
  entry_id uuid primary key references servsync_expense_private.entries(id) on delete restrict,
  media_type text not null check(media_type in ('image/jpeg','image/png')),
  data bytea not null check(octet_length(data) between 1 and 3145728)
);

alter table servsync_expense_private.assignments enable row level security;
alter table servsync_expense_private.assignments force row level security;
alter table servsync_expense_private.entries enable row level security;
alter table servsync_expense_private.entries force row level security;
alter table servsync_expense_private.receipts enable row level security;
alter table servsync_expense_private.receipts force row level security;
revoke all on all tables in schema servsync_expense_private from public, anon, authenticated;

-- Explicit expense authority. Platform admins have no expense privilege merely by
-- being admins. Resolve the contractor from the current identity, never submitted data.
create function servsync_expense_private.scope(p_kind text,p_id uuid)
returns table(contractor_id uuid,estimate_id uuid,job_id uuid,manager boolean,tech_member_id uuid,accepted_pre_tax_cents integer)
language sql stable security definer set search_path = '' as $$
  with principal as (
    select cp.id,
      (cp.owner_user_id=auth.uid() or coalesce(member.role in ('admin','office'),false)) as manager,
      case when member.role='field_tech' then member.id end as tech_member_id
    from public.servsync_current_contractor_profile() context
    join public.contractor_profiles cp on cp.id=context.id and cp.account_status='active'
    left join public.contractor_team_members member
      on member.contractor_id=cp.id and member.user_id=auth.uid() and member.status='active'
    where auth.uid() is not null
      and not coalesce((auth.jwt()->>'is_anonymous')='true',false)
      and (cp.owner_user_id=auth.uid() or member.role in ('admin','office','field_tech'))
  ), job as (
    select i.id,i.estimate_id,i.job_status
    from principal p
    join public.inspections i on i.contractor_id=p.id and i.id=p_id
    where p_kind='job'
      and (p.manager or (i.job_status in ('scheduled','in_progress','completed') and exists (
        select 1 from servsync_expense_private.assignments a
        where a.contractor_id=p.id and a.job_id=i.id and a.member_id=p.tech_member_id
      )))
  ), estimate as (
    select e.id,e.inspection_id,e.status,e.subtotal_cents
    from principal p join public.estimates e on e.contractor_id=p.id and (
      (p_kind='estimate' and p.manager and e.id=p_id)
      or (p_kind='job' and e.status='accepted' and exists (select 1 from job j where j.estimate_id=e.id and j.id=e.inspection_id))
    )
  )
  select p.id,e.id,j.id,p.manager,p.tech_member_id,
    case when p.manager and e.status='accepted' then e.subtotal_cents end
  from principal p left join job matched on true
  left join estimate e on true
  left join public.inspections j on j.contractor_id=p.id and (
    (p_kind='job' and j.id=matched.id)
    or (p_kind='estimate' and e.status='accepted' and j.id=e.inspection_id and j.estimate_id=e.id)
  )
  where (p_kind='job' and matched.id is not null) or (p_kind='estimate' and e.id is not null)
$$;
revoke all on function servsync_expense_private.scope(text,uuid) from public, anon, authenticated;

create function public.servsync_job_expense_view(p_kind text,p_id uuid,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from servsync_expense_private.scope(p_kind,p_id);
  if not found then return jsonb_build_object('kind','unavailable'); end if;
  if not s.manager then return jsonb_build_object('kind','capture'); end if;
  return (
    with costs as (
      select e.id,e.amount_cents,e.vendor,e.purchase_date,e.category,e.created_at
      from servsync_expense_private.entries e
      where e.contractor_id=s.contractor_id and e.voided_at is null
        and (e.estimate_id=s.estimate_id or e.job_id=s.job_id)
    ), total as (
      select coalesce(sum(amount_cents::bigint),0) amount from costs
    ), page as (
      select c.*, r.entry_id is not null has_receipt
      from costs c
      left join servsync_expense_private.receipts r on r.entry_id=c.id
      where p_before is null or (c.created_at,c.id)<(p_before,p_before_id)
      order by c.created_at desc,c.id desc limit 25
    )
    select jsonb_build_object('kind','manage','costs_cents',total.amount,'accepted_pre_tax_cents',s.accepted_pre_tax_cents,
      'projected_gross_cents',s.accepted_pre_tax_cents-total.amount,'entries',
      coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb))
    from total
  );
end $$;

create function public.servsync_job_expense_submit(p_kind text,p_id uuid,p_request_id uuid,p_amount_cents integer,p_purchase_date date,
  p_category text,p_vendor text,p_media_type text default null,p_photo_base64 text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; new_id uuid; photo bytea;
begin
  select * into s from servsync_expense_private.scope(p_kind,p_id);
  if not found then raise insufficient_privilege using message = 'Expense submission unavailable.'; end if;
  if not s.manager then
    -- Serialize with membership/assignment revocation and scope changes on this job.
    perform 1 from servsync_expense_private.assignments a
      join public.contractor_team_members m on m.id=a.member_id and m.status='active' and m.role='field_tech'
      join public.inspections j on j.id=a.job_id and j.contractor_id=a.contractor_id and j.job_status in ('scheduled','in_progress','completed')
      where a.contractor_id=s.contractor_id and m.contractor_id=s.contractor_id and m.user_id=auth.uid()
        and a.job_id=s.job_id and a.member_id=s.tech_member_id
      for share of a,m,j;
    if not found then raise insufficient_privilege using message='Expense submission unavailable.'; end if;
  end if;
  if p_request_id is null or p_amount_cents is null or p_amount_cents<=0 or p_purchase_date is null
    or not isfinite(p_purchase_date)
    or p_category is null or p_category not in ('Materials','Labor','Subcontractors','Equipment','Permits','Other')
    or char_length(coalesce(p_vendor,''))>140 or (p_media_type is null)<>(p_photo_base64 is null) then
    raise invalid_parameter_value using message='Check the expense details.';
  end if;
  if p_photo_base64 is not null then
    if p_media_type not in ('image/jpeg','image/png') or char_length(p_photo_base64)>4194304 then
      raise invalid_parameter_value using message='Use a JPG or PNG receipt at most 3 MB.';
    end if;
    begin
      photo := decode(p_photo_base64,'base64');
    exception when data_exception then
      raise invalid_parameter_value using message='Could not read the receipt.';
    end;
    if octet_length(photo)>3145728
      or (p_media_type='image/png' and (octet_length(photo)<24 or substring(photo from 1 for 8)<>decode('89504e470d0a1a0a','hex')))
      or (p_media_type='image/jpeg' and (octet_length(photo)<5 or substring(photo from 1 for 3)<>decode('ffd8ff','hex'))) then
      raise invalid_parameter_value using message='Use a JPG or PNG receipt at most 3 MB.';
    end if;
  end if;
  insert into servsync_expense_private.entries(contractor_id,job_id,estimate_id,actor_id,request_id,amount_cents,purchase_date,category,vendor)
    values(s.contractor_id,case when p_kind='job' then p_id end,case when p_kind='estimate' then p_id end,
           auth.uid(),p_request_id,p_amount_cents,p_purchase_date,p_category,btrim(coalesce(p_vendor,'')))
    on conflict(contractor_id,actor_id,request_id) do nothing returning id into new_id;
  if new_id is null then
    if not exists(select 1 from servsync_expense_private.entries e
      left join servsync_expense_private.receipts r on r.entry_id=e.id
      where e.contractor_id=s.contractor_id and e.actor_id=auth.uid() and e.request_id=p_request_id
        and (e.estimate_id=s.estimate_id or e.job_id=s.job_id)
        and e.amount_cents=p_amount_cents and e.purchase_date=p_purchase_date and e.category=p_category
        and e.vendor=btrim(coalesce(p_vendor,''))
        and r.media_type is not distinct from p_media_type and r.data is not distinct from photo)
    then raise invalid_parameter_value using message='This expense submission could not be confirmed.'; end if;
    return;
  end if;
  if photo is not null then
    insert into servsync_expense_private.receipts values(new_id,p_media_type,photo);
  end if;
end $$;

create function public.servsync_job_expense_receipt(p_kind text,p_id uuid,p_expense_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record; response jsonb;
begin
  select * into s from servsync_expense_private.scope(p_kind,p_id);
  if not found or not s.manager then raise insufficient_privilege using message='Receipt unavailable.'; end if;
  select jsonb_build_object('media_type',r.media_type,'base64',replace(encode(r.data,'base64'),chr(10),''))
    into response from servsync_expense_private.entries e join servsync_expense_private.receipts r on r.entry_id=e.id
    where e.id=p_expense_id and e.voided_at is null and e.contractor_id=s.contractor_id
      and (e.estimate_id=s.estimate_id or e.job_id=s.job_id);
  if response is null then raise insufficient_privilege using message='Receipt unavailable.'; end if;
  return response;
end $$;

create function public.servsync_job_expense_void(p_kind text,p_id uuid,p_expense_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from servsync_expense_private.scope(p_kind,p_id);
  if not found or not s.manager then raise insufficient_privilege using message='Expense unavailable.'; end if;
  update servsync_expense_private.entries e set voided_at=now(),voided_by=auth.uid()
    where e.id=p_expense_id and e.voided_at is null and e.contractor_id=s.contractor_id
      and (e.estimate_id=s.estimate_id or e.job_id=s.job_id);
  if not found then raise insufficient_privilege using message='Expense unavailable.'; end if;
end $$;

-- Manager-only roster under this exact job; no emails or unrelated role data.
create function public.servsync_job_expense_techs(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from servsync_expense_private.scope('job',p_job_id);
  if not found or not s.manager then raise insufficient_privilege using message='Job assignment unavailable.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',coalesce(nullif(btrim(m.display_name),''),'Field technician'),
    'assigned',a.job_id is not null) order by m.display_name,m.id)
    from public.contractor_team_members m left join servsync_expense_private.assignments a
    on a.member_id=m.id and a.job_id=s.job_id and a.contractor_id=s.contractor_id
    where m.contractor_id=s.contractor_id and m.status='active' and m.role='field_tech'),'[]'::jsonb);
end $$;

create function public.servsync_set_job_expense_tech(p_job_id uuid,p_member_id uuid,p_assigned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from servsync_expense_private.scope('job',p_job_id);
  if not found or not s.manager or p_assigned is null then raise insufficient_privilege using message='Job assignment unavailable.'; end if;
  if p_assigned then
    perform 1 from public.contractor_team_members m where m.id=p_member_id and m.contractor_id=s.contractor_id
      and m.role='field_tech' and m.status='active' for share;
    if not found then raise insufficient_privilege using message='Job assignment unavailable.'; end if;
    insert into servsync_expense_private.assignments(contractor_id,job_id,member_id)
      values(s.contractor_id,s.job_id,p_member_id) on conflict do nothing;
  else
    delete from servsync_expense_private.assignments where contractor_id=s.contractor_id and job_id=s.job_id and member_id=p_member_id;
  end if;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.servsync_job_expense_view(text,uuid,timestamptz,uuid)',
    'public.servsync_job_expense_submit(text,uuid,uuid,integer,date,text,text,text,text)',
    'public.servsync_job_expense_receipt(text,uuid,uuid)',
    'public.servsync_job_expense_void(text,uuid,uuid)',
    'public.servsync_job_expense_techs(uuid)',
    'public.servsync_set_job_expense_tech(uuid,uuid,boolean)'
  ] loop
    execute 'alter function '||fn||' owner to postgres';
    execute 'revoke all on function '||fn||' from public, anon, authenticated';
    execute 'grant execute on function '||fn||' to authenticated';
  end loop;
end $$;

commit;
