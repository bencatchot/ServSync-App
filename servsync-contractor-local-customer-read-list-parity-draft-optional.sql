-- ServSync Contractor Local Customer Read/List Parity Draft-Optional v2.
-- Supersedes the immutable v1 migration for new environment alignment while
-- preserving identical role-shaped behavior when the complete Draft foundation
-- is installed. Apply after servsync-customer-management-edit-boundary.sql.

begin;

do $$
declare
  v_draft_relation_count integer;
  v_mismatch text;
begin
  if to_regclass('public.contractor_local_contacts') is null
     or to_regclass('public.contractor_local_homes') is null
     or to_regclass('public.contractor_team_members') is null
     or to_regclass('public.inspections') is null
     or to_regclass('public.estimates') is null
     or to_regclass('public.invoices') is null then
    raise exception 'Missing required local-customer or contractor-work tables.';
  end if;

  if to_regprocedure('public.servsync_current_contractor_profile()') is null
     or to_regprocedure('public.current_user_can_manage_contractor_customers(uuid)') is null then
    raise exception 'Missing required contractor identity or customer-management helpers.';
  end if;

  select count(*)
    into v_draft_relation_count
    from (values
      (to_regclass('public.contractor_work_drafts')),
      (to_regclass('public.contractor_work_draft_items')),
      (to_regclass('public.contractor_work_draft_launches'))
    ) draft_relation(oid)
   where oid is not null;

  if v_draft_relation_count not in (0, 3) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  if v_draft_relation_count = 3 then
    with expected(table_name, column_name, type_name, is_not_null) as (
      values
        ('contractor_work_drafts', 'id', 'uuid', true),
        ('contractor_work_drafts', 'contractor_id', 'uuid', true),
        ('contractor_work_drafts', 'local_contact_id', 'uuid', false),
        ('contractor_work_drafts', 'local_home_id', 'uuid', false),
        ('contractor_work_drafts', 'status', 'text', true),
        ('contractor_work_drafts', 'created_at', 'timestamp with time zone', true),
        ('contractor_work_draft_items', 'id', 'uuid', true),
        ('contractor_work_draft_items', 'draft_id', 'uuid', true),
        ('contractor_work_draft_items', 'contractor_id', 'uuid', true),
        ('contractor_work_draft_launches', 'id', 'uuid', true),
        ('contractor_work_draft_launches', 'draft_id', 'uuid', true),
        ('contractor_work_draft_launches', 'contractor_id', 'uuid', true),
        ('contractor_work_draft_launches', 'idempotency_key', 'uuid', true),
        ('contractor_work_draft_launches', 'requested_output', 'text', true),
        ('contractor_work_draft_launches', 'status', 'text', true),
        ('contractor_work_draft_launches', 'launched_estimate_id', 'uuid', false),
        ('contractor_work_draft_launches', 'launched_job_id', 'uuid', false),
        ('contractor_work_draft_launches', 'launched_invoice_id', 'uuid', false)
    )
    select string_agg(
      format('public.%I.%I', expected.table_name, expected.column_name),
      ', ' order by expected.table_name, expected.column_name
    )
      into v_mismatch
      from expected
      left join information_schema.columns column_info
        on column_info.table_schema = 'public'
       and column_info.table_name = expected.table_name
       and column_info.column_name = expected.column_name
       and column_info.data_type = expected.type_name
       and (column_info.is_nullable = 'NO') = expected.is_not_null
     where column_info.column_name is null;

    if v_mismatch is not null then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if exists (
      select 1
        from (values
          ('contractor_work_drafts'),
          ('contractor_work_draft_items'),
          ('contractor_work_draft_launches')
        ) expected_table(table_name)
        left join pg_class relation
          on relation.relnamespace = 'public'::regnamespace
         and relation.relname = expected_table.table_name
         and relation.relkind in ('r', 'p')
        left join pg_roles owner_role on owner_role.oid = relation.relowner
       where relation.oid is null
          or owner_role.rolname <> 'postgres'
          or not relation.relrowsecurity
    ) then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if to_regprocedure('public.servsync_get_work_draft(uuid)') is null
       or to_regprocedure('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)') is null
       or to_regprocedure('public.servsync_launch_work_draft(uuid,text,uuid)') is null then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if (
      select count(*)
        from pg_constraint constraint_row
       where (constraint_row.conrelid, constraint_row.conname, constraint_row.contype) in (
         ('public.contractor_work_drafts'::regclass, 'contractor_work_drafts_pkey', 'p'),
         ('public.contractor_work_drafts'::regclass, 'contractor_work_drafts_id_contractor_unique', 'u'),
         ('public.contractor_work_draft_items'::regclass, 'contractor_work_draft_items_pkey', 'p'),
         ('public.contractor_work_draft_items'::regclass, 'contractor_work_draft_items_contractor_match_fk', 'f'),
         ('public.contractor_work_draft_launches'::regclass, 'contractor_work_draft_launches_pkey', 'p'),
         ('public.contractor_work_draft_launches'::regclass, 'contractor_work_draft_launches_contractor_match_fk', 'f')
       )
    ) <> 6 then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if exists (
      select 1
        from (values
          ('public.servsync_get_work_draft(uuid)'),
          ('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)'),
          ('public.servsync_launch_work_draft(uuid,text,uuid)')
        ) expected_function(signature)
        left join pg_proc procedure_row on procedure_row.oid = to_regprocedure(expected_function.signature)
        left join pg_roles owner_role on owner_role.oid = procedure_row.proowner
       where procedure_row.oid is null
          or owner_role.rolname <> 'postgres'
          or not procedure_row.prosecdef
          or not (coalesce(procedure_row.proconfig, '{}'::text[]) @> array['search_path=public']::text[])
    ) then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;
  end if;
end;
$$;

create or replace function public.servsync_private_customer_draft_foundation_available()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_relation_count integer;
  v_mismatch text;
begin
  select count(*)
    into v_relation_count
    from (values
      (to_regclass('public.contractor_work_drafts')),
      (to_regclass('public.contractor_work_draft_items')),
      (to_regclass('public.contractor_work_draft_launches'))
    ) draft_relation(oid)
   where oid is not null;

  if v_relation_count = 0 then
    return false;
  end if;
  if v_relation_count <> 3 then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  with expected(table_name, column_name, type_name, is_not_null) as (
    values
      ('contractor_work_drafts', 'id', 'uuid', true),
      ('contractor_work_drafts', 'contractor_id', 'uuid', true),
      ('contractor_work_drafts', 'local_contact_id', 'uuid', false),
      ('contractor_work_drafts', 'local_home_id', 'uuid', false),
      ('contractor_work_drafts', 'status', 'text', true),
      ('contractor_work_drafts', 'created_at', 'timestamp with time zone', true),
      ('contractor_work_draft_items', 'id', 'uuid', true),
      ('contractor_work_draft_items', 'draft_id', 'uuid', true),
      ('contractor_work_draft_items', 'contractor_id', 'uuid', true),
      ('contractor_work_draft_launches', 'id', 'uuid', true),
      ('contractor_work_draft_launches', 'draft_id', 'uuid', true),
      ('contractor_work_draft_launches', 'contractor_id', 'uuid', true),
      ('contractor_work_draft_launches', 'idempotency_key', 'uuid', true),
      ('contractor_work_draft_launches', 'requested_output', 'text', true),
      ('contractor_work_draft_launches', 'status', 'text', true),
      ('contractor_work_draft_launches', 'launched_estimate_id', 'uuid', false),
      ('contractor_work_draft_launches', 'launched_job_id', 'uuid', false),
      ('contractor_work_draft_launches', 'launched_invoice_id', 'uuid', false)
  )
  select string_agg(
    format('public.%I.%I', expected.table_name, expected.column_name),
    ', ' order by expected.table_name, expected.column_name
  )
    into v_mismatch
    from expected
    left join information_schema.columns column_info
      on column_info.table_schema = 'public'
     and column_info.table_name = expected.table_name
     and column_info.column_name = expected.column_name
     and column_info.data_type = expected.type_name
     and (column_info.is_nullable = 'NO') = expected.is_not_null
   where column_info.column_name is null;

  if v_mismatch is not null
     or exists (
       select 1
         from (values
           ('contractor_work_drafts'),
           ('contractor_work_draft_items'),
           ('contractor_work_draft_launches')
         ) expected_table(table_name)
         left join pg_class relation
           on relation.relnamespace = 'public'::regnamespace
          and relation.relname = expected_table.table_name
          and relation.relkind in ('r', 'p')
         left join pg_roles owner_role on owner_role.oid = relation.relowner
        where relation.oid is null
           or owner_role.rolname <> 'postgres'
           or not relation.relrowsecurity
     )
     or to_regprocedure('public.servsync_get_work_draft(uuid)') is null
     or to_regprocedure('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)') is null
     or to_regprocedure('public.servsync_launch_work_draft(uuid,text,uuid)') is null
     or (
       select count(*)
         from pg_constraint constraint_row
        where (constraint_row.conrelid, constraint_row.conname, constraint_row.contype) in (
          ('public.contractor_work_drafts'::regclass, 'contractor_work_drafts_pkey', 'p'),
          ('public.contractor_work_drafts'::regclass, 'contractor_work_drafts_id_contractor_unique', 'u'),
          ('public.contractor_work_draft_items'::regclass, 'contractor_work_draft_items_pkey', 'p'),
          ('public.contractor_work_draft_items'::regclass, 'contractor_work_draft_items_contractor_match_fk', 'f'),
          ('public.contractor_work_draft_launches'::regclass, 'contractor_work_draft_launches_pkey', 'p'),
          ('public.contractor_work_draft_launches'::regclass, 'contractor_work_draft_launches_contractor_match_fk', 'f')
        )
     ) <> 6
     or exists (
       select 1
         from (values
           ('public.servsync_get_work_draft(uuid)'),
           ('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)'),
           ('public.servsync_launch_work_draft(uuid,text,uuid)')
         ) expected_function(signature)
         left join pg_proc procedure_row on procedure_row.oid = to_regprocedure(expected_function.signature)
         left join pg_roles owner_role on owner_role.oid = procedure_row.proowner
        where procedure_row.oid is null
           or owner_role.rolname <> 'postgres'
           or not procedure_row.prosecdef
           or not (coalesce(procedure_row.proconfig, '{}'::text[]) @> array['search_path=public']::text[])
     ) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  return true;
end;
$$;

create or replace function public.servsync_private_local_customer_has_readable_work(
  p_contractor_id uuid,
  p_local_contact_id uuid,
  p_local_home_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_work boolean;
begin
  if p_contractor_id is null or p_local_contact_id is null then
    return false;
  end if;

  select exists (
    select 1 from public.inspections job
     where job.contractor_id = p_contractor_id
       and job.local_contact_id = p_local_contact_id
       and (p_local_home_id is null or job.local_home_id = p_local_home_id)
    union all
    select 1 from public.estimates estimate
     where estimate.contractor_id = p_contractor_id
       and estimate.local_contact_id = p_local_contact_id
       and (p_local_home_id is null or estimate.local_home_id = p_local_home_id)
    union all
    select 1 from public.invoices invoice
     where invoice.contractor_id = p_contractor_id
       and invoice.local_contact_id = p_local_contact_id
       and (p_local_home_id is null or invoice.local_home_id = p_local_home_id)
  ) into v_has_work;

  if v_has_work or not public.servsync_private_customer_draft_foundation_available() then
    return coalesce(v_has_work, false);
  end if;

  execute $draft_work$
    select exists (
      select 1
        from public.contractor_work_drafts draft
       where draft.contractor_id = $1
         and draft.local_contact_id = $2
         and ($3 is null or draft.local_home_id = $3)
    )
  $draft_work$
    into v_has_work
    using p_contractor_id, p_local_contact_id, p_local_home_id;

  return coalesce(v_has_work, false);
end;
$$;

alter function public.servsync_private_customer_draft_foundation_available() owner to postgres;
alter function public.servsync_private_local_customer_has_readable_work(uuid, uuid, uuid) owner to postgres;

revoke all on function public.servsync_private_customer_draft_foundation_available() from public, anon, authenticated;
revoke all on function public.servsync_private_local_customer_has_readable_work(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.servsync_private_local_customer_read_context()
returns table (
  contractor_id uuid,
  access_role text
)
language sql
stable
security definer
set search_path = public
as $$
  with current_contractor as (
    select cp.id, cp.owner_user_id
      from public.servsync_current_contractor_profile() cp
     limit 1
  )
  select
    current_contractor.id,
    case
      when current_contractor.owner_user_id = auth.uid() then 'owner'
      else member.role
    end
    from current_contractor
    left join public.contractor_team_members member
      on member.contractor_id = current_contractor.id
     and member.user_id = auth.uid()
     and member.status = 'active'
   where auth.uid() is not null
     and (
       current_contractor.owner_user_id = auth.uid()
       or member.role in ('admin', 'office', 'field_tech', 'viewer')
     );
$$;

comment on function public.servsync_private_local_customer_read_context() is
  'Internal canonical contractor and active-role resolver for local-customer role-shaped reads.';

revoke all on function public.servsync_private_local_customer_read_context() from public;
revoke all on function public.servsync_private_local_customer_read_context() from anon;
revoke all on function public.servsync_private_local_customer_read_context() from authenticated;

create or replace function public.servsync_list_local_customer_summaries()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_result jsonb;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;

  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office', 'field_tech', 'viewer') then
    raise insufficient_privilege using message = 'Customer directory is unavailable.';
  end if;

  with visible_contacts as (
    select contact.*
      from public.contractor_local_contacts contact
     where contact.contractor_id = v_contractor_id
       and contact.homeowner_user_id is null
       and contact.claimed_at is null
       and not exists (
         select 1
           from public.contractor_local_homes claimed_home
          where claimed_home.contractor_id = contact.contractor_id
            and claimed_home.local_contact_id = contact.id
            and (claimed_home.home_id is not null or claimed_home.claimed_at is not null)
       )
       and (
         v_access_role <> 'viewer'
         or public.servsync_private_local_customer_has_readable_work(
           v_contractor_id,
           contact.id,
           null
         )
       )
  )
  select coalesce(jsonb_agg(rows.customer_payload order by rows.sort_name, rows.contact_id), '[]'::jsonb)
    into v_result
    from (
      select
        lower(contact.display_name) as sort_name,
        contact.id as contact_id,
        jsonb_build_object(
          'id', contact.id,
          'display_name', contact.display_name,
          'homes', coalesce(home_rows.homes, '[]'::jsonb)
        ) as customer_payload
        from visible_contacts contact
        left join lateral (
          select jsonb_agg(
            jsonb_build_object(
              'id', home.id,
              'nickname', home.nickname,
              'address_line1', home.address_line1,
              'address_line2', home.address_line2,
              'city', home.city,
              'state', home.state,
              'zip_code', home.zip_code
            ) order by home.created_at, home.id
          ) as homes
            from public.contractor_local_homes home
           where home.contractor_id = contact.contractor_id
             and home.local_contact_id = contact.id
             and home.home_id is null
             and home.claimed_at is null
             and (
               v_access_role <> 'viewer'
               or public.servsync_private_local_customer_has_readable_work(
                 v_contractor_id,
                 contact.id,
                 home.id
               )
             )
        ) home_rows on true
    ) rows;

  return v_result;
end;
$$;

comment on function public.servsync_list_local_customer_summaries() is
  'Lists unclaimed local-customer/property summaries for the current contractor, with tenant-wide redacted summaries for owner/admin/office/field tech and exact work-linked redacted summaries for viewers.';

create or replace function public.servsync_get_local_customer_management_detail(
  p_local_contact_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_access_role text;
  v_result jsonb;
begin
  select context.contractor_id, context.access_role
    into v_contractor_id, v_access_role
    from public.servsync_private_local_customer_read_context() context;

  if v_contractor_id is null
     or v_access_role not in ('owner', 'admin', 'office')
     or not public.current_user_can_manage_contractor_customers(v_contractor_id) then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  select jsonb_build_object(
    'id', contact.id,
    'contractor_id', contact.contractor_id,
    'homeowner_user_id', contact.homeowner_user_id,
    'display_name', contact.display_name,
    'phone', contact.phone,
    'email', contact.email,
    'notes', contact.notes,
    'claimed_at', contact.claimed_at,
    'created_at', contact.created_at,
    'updated_at', contact.updated_at,
    'homes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', home.id,
        'contractor_id', home.contractor_id,
        'local_contact_id', home.local_contact_id,
        'home_id', home.home_id,
        'claimed_at', home.claimed_at,
        'nickname', home.nickname,
        'address_line1', home.address_line1,
        'address_line2', home.address_line2,
        'city', home.city,
        'state', home.state,
        'zip_code', home.zip_code,
        'home_type', home.home_type,
        'year_built', home.year_built,
        'square_feet', home.square_feet,
        'notes', home.notes,
        'created_at', home.created_at,
        'updated_at', home.updated_at
      ) order by home.created_at, home.id)
        from public.contractor_local_homes home
       where home.contractor_id = contact.contractor_id
         and home.local_contact_id = contact.id
         and home.home_id is null
         and home.claimed_at is null
    ), '[]'::jsonb)
  )
    into v_result
    from public.contractor_local_contacts contact
   where contact.id = p_local_contact_id
     and contact.contractor_id = v_contractor_id
     and contact.homeowner_user_id is null
     and contact.claimed_at is null
     and not exists (
       select 1
         from public.contractor_local_homes claimed_home
        where claimed_home.contractor_id = contact.contractor_id
          and claimed_home.local_contact_id = contact.id
          and (claimed_home.home_id is not null or claimed_home.claimed_at is not null)
     );

  if v_result is null then
    raise insufficient_privilege using message = 'Local customer is unavailable.';
  end if;

  return v_result;
end;
$$;

comment on function public.servsync_get_local_customer_management_detail(uuid) is
  'Returns full unclaimed local-customer/property management detail to the current contractor owner or active admin/office member only.';

alter function public.servsync_private_local_customer_read_context() owner to postgres;
alter function public.servsync_private_customer_draft_foundation_available() owner to postgres;
alter function public.servsync_private_local_customer_has_readable_work(uuid, uuid, uuid) owner to postgres;
alter function public.servsync_list_local_customer_summaries() owner to postgres;
alter function public.servsync_get_local_customer_management_detail(uuid) owner to postgres;

revoke all on function public.servsync_list_local_customer_summaries() from public;
revoke all on function public.servsync_list_local_customer_summaries() from anon;
revoke all on function public.servsync_list_local_customer_summaries() from authenticated;
grant execute on function public.servsync_list_local_customer_summaries() to authenticated;

revoke all on function public.servsync_get_local_customer_management_detail(uuid) from public;
revoke all on function public.servsync_get_local_customer_management_detail(uuid) from anon;
revoke all on function public.servsync_get_local_customer_management_detail(uuid) from authenticated;
grant execute on function public.servsync_get_local_customer_management_detail(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
