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
        ('contractor_work_drafts', 'launched_invoice_id', 'uuid', false),
        ('contractor_work_drafts', 'launched_invoice_id_snapshot', 'uuid', false),
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
        ('contractor_work_draft_launches', 'launched_invoice_id', 'uuid', false),
        ('contractor_work_draft_launches', 'launched_invoice_id_snapshot', 'uuid', false)
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
          or relation.relforcerowsecurity
    ) then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if to_regprocedure('public.servsync_get_work_draft(uuid)') is null
       or to_regprocedure('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)') is null
       or to_regprocedure('public.servsync_launch_work_draft(uuid,text,uuid)') is null then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if exists (
      with expected(
        table_name,
        constraint_name,
        constraint_type,
        local_columns,
        referenced_table,
        referenced_columns,
        update_action,
        delete_action
      ) as (
        values
          ('contractor_work_drafts', 'contractor_work_drafts_pkey', 'p'::"char", array['id']::text[], null::text, null::text[], null::"char", null::"char"),
          ('contractor_work_drafts', 'contractor_work_drafts_id_contractor_unique', 'u'::"char", array['id', 'contractor_id']::text[], null::text, null::text[], null::"char", null::"char"),
          ('contractor_work_drafts', 'contractor_work_drafts_contractor_id_fkey', 'f'::"char", array['contractor_id']::text[], 'contractor_profiles', array['id']::text[], 'a'::"char", 'r'::"char"),
          ('contractor_work_drafts', 'contractor_work_drafts_local_contact_id_fkey', 'f'::"char", array['local_contact_id']::text[], 'contractor_local_contacts', array['id']::text[], 'a'::"char", 'n'::"char"),
          ('contractor_work_drafts', 'contractor_work_drafts_local_home_id_fkey', 'f'::"char", array['local_home_id']::text[], 'contractor_local_homes', array['id']::text[], 'a'::"char", 'n'::"char"),
          ('contractor_work_drafts', 'contractor_work_drafts_launched_invoice_id_fkey', 'f'::"char", array['launched_invoice_id']::text[], 'invoices', array['id']::text[], 'a'::"char", 'n'::"char"),
          ('contractor_work_draft_items', 'contractor_work_draft_items_pkey', 'p'::"char", array['id']::text[], null::text, null::text[], null::"char", null::"char"),
          ('contractor_work_draft_items', 'contractor_work_draft_items_draft_id_fkey', 'f'::"char", array['draft_id']::text[], 'contractor_work_drafts', array['id']::text[], 'a'::"char", 'c'::"char"),
          ('contractor_work_draft_items', 'contractor_work_draft_items_contractor_id_fkey', 'f'::"char", array['contractor_id']::text[], 'contractor_profiles', array['id']::text[], 'a'::"char", 'r'::"char"),
          ('contractor_work_draft_items', 'contractor_work_draft_items_contractor_match_fk', 'f'::"char", array['draft_id', 'contractor_id']::text[], 'contractor_work_drafts', array['id', 'contractor_id']::text[], 'a'::"char", 'c'::"char"),
          ('contractor_work_draft_launches', 'contractor_work_draft_launches_pkey', 'p'::"char", array['id']::text[], null::text, null::text[], null::"char", null::"char"),
          ('contractor_work_draft_launches', 'contractor_work_draft_launches_draft_id_fkey', 'f'::"char", array['draft_id']::text[], 'contractor_work_drafts', array['id']::text[], 'a'::"char", 'r'::"char"),
          ('contractor_work_draft_launches', 'contractor_work_draft_launches_contractor_id_fkey', 'f'::"char", array['contractor_id']::text[], 'contractor_profiles', array['id']::text[], 'a'::"char", 'r'::"char"),
          ('contractor_work_draft_launches', 'contractor_work_draft_launches_launched_estimate_id_fkey', 'f'::"char", array['launched_estimate_id']::text[], 'estimates', array['id']::text[], 'a'::"char", 'n'::"char"),
          ('contractor_work_draft_launches', 'contractor_work_draft_launches_launched_job_id_fkey', 'f'::"char", array['launched_job_id']::text[], 'inspections', array['id']::text[], 'a'::"char", 'n'::"char"),
          ('contractor_work_draft_launches', 'contractor_work_draft_launches_launched_invoice_id_fkey', 'f'::"char", array['launched_invoice_id']::text[], 'invoices', array['id']::text[], 'a'::"char", 'n'::"char"),
          ('contractor_work_draft_launches', 'contractor_work_draft_launches_contractor_match_fk', 'f'::"char", array['draft_id', 'contractor_id']::text[], 'contractor_work_drafts', array['id', 'contractor_id']::text[], 'a'::"char", 'r'::"char")
      ), actual as (
        select
          relation.relname as table_name,
          constraint_row.conname as constraint_name,
          constraint_row.contype as constraint_type,
          array(
            select attribute.attname::text
              from unnest(constraint_row.conkey) with ordinality key_column(attnum, position)
              join pg_attribute attribute
                on attribute.attrelid = constraint_row.conrelid
               and attribute.attnum = key_column.attnum
             order by key_column.position
          ) as local_columns,
          referenced_relation.relname as referenced_table,
          array(
            select attribute.attname::text
              from unnest(constraint_row.confkey) with ordinality key_column(attnum, position)
              join pg_attribute attribute
                on attribute.attrelid = constraint_row.confrelid
               and attribute.attnum = key_column.attnum
             order by key_column.position
          ) as referenced_columns,
          constraint_row.confupdtype as update_action,
          constraint_row.confdeltype as delete_action,
          constraint_row.convalidated,
          constraint_row.condeferrable,
          constraint_row.condeferred
        from pg_constraint constraint_row
        join pg_class relation on relation.oid = constraint_row.conrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        left join pg_class referenced_relation on referenced_relation.oid = constraint_row.confrelid
       where namespace.nspname = 'public'
         and relation.relname in (
           'contractor_work_drafts',
           'contractor_work_draft_items',
           'contractor_work_draft_launches'
         )
      )
      select 1
        from expected
        left join actual using (table_name, constraint_name)
       where actual.constraint_name is null
          or actual.constraint_type <> expected.constraint_type
          or actual.local_columns is distinct from expected.local_columns
          or actual.referenced_table is distinct from expected.referenced_table
          or (
            expected.referenced_table is not null
            and (
              actual.referenced_columns is distinct from expected.referenced_columns
              or actual.update_action <> expected.update_action
              or actual.delete_action <> expected.delete_action
            )
          )
          or not actual.convalidated
          or actual.condeferrable
          or actual.condeferred
    ) then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if exists (
      select 1
        from (values
          ('servsync_get_work_draft', 'public.servsync_get_work_draft(uuid)', array['p_draft_id']::text[], 0),
          ('servsync_save_work_draft', 'public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)', array['p_draft_id', 'p_metadata', 'p_items', 'p_removed_item_ids']::text[], 4),
          ('servsync_launch_work_draft', 'public.servsync_launch_work_draft(uuid,text,uuid)', array['p_draft_id', 'p_intended_output', 'p_idempotency_key']::text[], 0)
        ) expected_function(function_name, signature, argument_names, default_count)
        left join pg_proc procedure_row on procedure_row.oid = to_regprocedure(expected_function.signature)
        left join pg_roles owner_role on owner_role.oid = procedure_row.proowner
        left join pg_language language_row on language_row.oid = procedure_row.prolang
       where procedure_row.oid is null
          or (
            select count(*)
              from pg_proc overload
              join pg_namespace namespace on namespace.oid = overload.pronamespace
             where namespace.nspname = 'public'
               and overload.proname = expected_function.function_name
          ) <> 1
          or owner_role.rolname <> 'postgres'
          or not procedure_row.prosecdef
          or coalesce(procedure_row.proconfig, '{}'::text[]) <> array['search_path=public']::text[]
          or language_row.lanname <> 'plpgsql'
          or procedure_row.prorettype <> 'jsonb'::regtype
          or procedure_row.proargnames is distinct from expected_function.argument_names
          or procedure_row.pronargdefaults <> expected_function.default_count
          or has_function_privilege('public', procedure_row.oid, 'EXECUTE')
          or has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
          or exists (
            select 1
              from aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) function_acl
             where function_acl.privilege_type = 'EXECUTE'
               and function_acl.grantee not in (
                 procedure_row.proowner,
                 (select oid from pg_roles where rolname = 'authenticated')
               )
          )
    ) then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if exists (
      select 1
        from (values
          ('contractor_work_drafts'),
          ('contractor_work_draft_items'),
          ('contractor_work_draft_launches')
        ) expected_table(table_name)
        join pg_class relation
          on relation.relnamespace = 'public'::regnamespace
         and relation.relname = expected_table.table_name
       where not has_table_privilege('authenticated', relation.oid, 'SELECT')
          or has_table_privilege('authenticated', relation.oid, 'INSERT')
          or has_table_privilege('authenticated', relation.oid, 'UPDATE')
          or has_table_privilege('authenticated', relation.oid, 'DELETE')
          or has_table_privilege('authenticated', relation.oid, 'TRUNCATE')
          or has_table_privilege('authenticated', relation.oid, 'REFERENCES')
          or has_table_privilege('authenticated', relation.oid, 'TRIGGER')
          or has_table_privilege('public', relation.oid, 'SELECT')
          or has_table_privilege('anon', relation.oid, 'SELECT')
          or exists (
            select 1
              from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) table_acl
             where table_acl.grantee not in (
                 relation.relowner,
                 (select oid from pg_roles where rolname = 'authenticated')
               )
                or (
                  table_acl.grantee = (select oid from pg_roles where rolname = 'authenticated')
                  and table_acl.privilege_type <> 'SELECT'
                )
          )
          or exists (
            select 1
              from pg_attribute attribute
             where attribute.attrelid = relation.oid
               and attribute.attnum > 0
               and not attribute.attisdropped
               and attribute.attacl is not null
          )
    ) then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;

    if (
      select count(*)
        from pg_policy policy_row
       where policy_row.polrelid in (
         'public.contractor_work_drafts'::regclass,
         'public.contractor_work_draft_items'::regclass,
         'public.contractor_work_draft_launches'::regclass
       )
    ) <> 3 or exists (
      select 1
        from (values
          (
            'contractor_work_drafts',
            'Contractor work drafts: contractor team reads',
            '(current_user_can_access_contractor(contractor_id)ORcurrent_user_is_platform_admin())'
          ),
          (
            'contractor_work_draft_items',
            'Contractor work draft items: contractor team reads',
            '(EXISTS(SELECT1FROMcontractor_work_draftsdraftWHERE((draft.id=contractor_work_draft_items.draft_id)AND(draft.contractor_id=contractor_work_draft_items.contractor_id)AND(current_user_can_access_contractor(draft.contractor_id)ORcurrent_user_is_platform_admin()))))'
          ),
          (
            'contractor_work_draft_launches',
            'Contractor work draft launches: contractor team reads',
            '(EXISTS(SELECT1FROMcontractor_work_draftsdraftWHERE((draft.id=contractor_work_draft_launches.draft_id)AND(draft.contractor_id=contractor_work_draft_launches.contractor_id)AND(current_user_can_access_contractor(draft.contractor_id)ORcurrent_user_is_platform_admin()))))'
          )
        ) expected_policy(table_name, policy_name, policy_expression)
        left join pg_class relation
          on relation.relnamespace = 'public'::regnamespace
         and relation.relname = expected_policy.table_name
        left join pg_policy policy_row
          on policy_row.polrelid = relation.oid
         and policy_row.polname = expected_policy.policy_name
       where policy_row.oid is null
          or policy_row.polcmd <> 'r'
          or not policy_row.polpermissive
          or policy_row.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]
          or policy_row.polwithcheck is not null
          or regexp_replace(pg_get_expr(policy_row.polqual, policy_row.polrelid), '\s+', '', 'g') <> expected_policy.policy_expression
    ) then
      raise exception 'Durable Draft foundation is incomplete or incompatible.';
    end if;
  end if;
end;
$$;

create or replace function public.servsync_private_assert_canonical_customer_draft_foundation()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mismatch text;
begin
  if to_regclass('public.contractor_work_drafts') is null
     or to_regclass('public.contractor_work_draft_items') is null
     or to_regclass('public.contractor_work_draft_launches') is null then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  with expected(table_name, column_name, type_name, is_not_null) as (
    values
      ('contractor_work_drafts', 'id', 'uuid', true),
      ('contractor_work_drafts', 'contractor_id', 'uuid', true),
      ('contractor_work_drafts', 'local_contact_id', 'uuid', false),
      ('contractor_work_drafts', 'local_home_id', 'uuid', false),
      ('contractor_work_drafts', 'status', 'text', true),
      ('contractor_work_drafts', 'launched_invoice_id', 'uuid', false),
      ('contractor_work_drafts', 'launched_invoice_id_snapshot', 'uuid', false),
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
      ('contractor_work_draft_launches', 'launched_invoice_id', 'uuid', false),
      ('contractor_work_draft_launches', 'launched_invoice_id_snapshot', 'uuid', false)
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

  if v_mismatch is not null or exists (
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
        or relation.relforcerowsecurity
  ) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  if exists (
    with expected(table_name, constraint_name, constraint_type, definition) as (
      values
        ('contractor_work_drafts', 'contractor_work_drafts_pkey', 'p'::"char", 'PRIMARY KEY (id)'),
        ('contractor_work_drafts', 'contractor_work_drafts_id_contractor_unique', 'u'::"char", 'UNIQUE (id, contractor_id)'),
        ('contractor_work_drafts', 'contractor_work_drafts_contractor_id_fkey', 'f'::"char", 'FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(id) ON DELETE RESTRICT'),
        ('contractor_work_drafts', 'contractor_work_drafts_local_contact_id_fkey', 'f'::"char", 'FOREIGN KEY (local_contact_id) REFERENCES contractor_local_contacts(id) ON DELETE SET NULL'),
        ('contractor_work_drafts', 'contractor_work_drafts_local_home_id_fkey', 'f'::"char", 'FOREIGN KEY (local_home_id) REFERENCES contractor_local_homes(id) ON DELETE SET NULL'),
        ('contractor_work_drafts', 'contractor_work_drafts_launched_invoice_id_fkey', 'f'::"char", 'FOREIGN KEY (launched_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL'),
        ('contractor_work_draft_items', 'contractor_work_draft_items_pkey', 'p'::"char", 'PRIMARY KEY (id)'),
        ('contractor_work_draft_items', 'contractor_work_draft_items_draft_id_fkey', 'f'::"char", 'FOREIGN KEY (draft_id) REFERENCES contractor_work_drafts(id) ON DELETE CASCADE'),
        ('contractor_work_draft_items', 'contractor_work_draft_items_contractor_id_fkey', 'f'::"char", 'FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(id) ON DELETE RESTRICT'),
        ('contractor_work_draft_items', 'contractor_work_draft_items_contractor_match_fk', 'f'::"char", 'FOREIGN KEY (draft_id, contractor_id) REFERENCES contractor_work_drafts(id, contractor_id) ON DELETE CASCADE'),
        ('contractor_work_draft_launches', 'contractor_work_draft_launches_pkey', 'p'::"char", 'PRIMARY KEY (id)'),
        ('contractor_work_draft_launches', 'contractor_work_draft_launches_draft_id_fkey', 'f'::"char", 'FOREIGN KEY (draft_id) REFERENCES contractor_work_drafts(id) ON DELETE RESTRICT'),
        ('contractor_work_draft_launches', 'contractor_work_draft_launches_contractor_id_fkey', 'f'::"char", 'FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(id) ON DELETE RESTRICT'),
        ('contractor_work_draft_launches', 'contractor_work_draft_launches_launched_estimate_id_fkey', 'f'::"char", 'FOREIGN KEY (launched_estimate_id) REFERENCES estimates(id) ON DELETE SET NULL'),
        ('contractor_work_draft_launches', 'contractor_work_draft_launches_launched_job_id_fkey', 'f'::"char", 'FOREIGN KEY (launched_job_id) REFERENCES inspections(id) ON DELETE SET NULL'),
        ('contractor_work_draft_launches', 'contractor_work_draft_launches_launched_invoice_id_fkey', 'f'::"char", 'FOREIGN KEY (launched_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL'),
        ('contractor_work_draft_launches', 'contractor_work_draft_launches_contractor_match_fk', 'f'::"char", 'FOREIGN KEY (draft_id, contractor_id) REFERENCES contractor_work_drafts(id, contractor_id) ON DELETE RESTRICT')
    )
    select 1
      from expected
      left join pg_class relation
        on relation.relnamespace = 'public'::regnamespace
       and relation.relname = expected.table_name
      left join pg_constraint constraint_row
        on constraint_row.conrelid = relation.oid
       and constraint_row.conname = expected.constraint_name
     where constraint_row.oid is null
        or constraint_row.contype <> expected.constraint_type
        or pg_get_constraintdef(constraint_row.oid) <> expected.definition
        or not constraint_row.convalidated
        or constraint_row.condeferrable
        or constraint_row.condeferred
  ) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  if exists (
    select 1
      from (values
        ('servsync_get_work_draft', 'public.servsync_get_work_draft(uuid)', array['p_draft_id']::text[], 0),
        ('servsync_save_work_draft', 'public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)', array['p_draft_id', 'p_metadata', 'p_items', 'p_removed_item_ids']::text[], 4),
        ('servsync_launch_work_draft', 'public.servsync_launch_work_draft(uuid,text,uuid)', array['p_draft_id', 'p_intended_output', 'p_idempotency_key']::text[], 0)
      ) expected_function(function_name, signature, argument_names, default_count)
      left join pg_proc procedure_row on procedure_row.oid = to_regprocedure(expected_function.signature)
      left join pg_roles owner_role on owner_role.oid = procedure_row.proowner
      left join pg_language language_row on language_row.oid = procedure_row.prolang
     where procedure_row.oid is null
        or (
          select count(*)
            from pg_proc overload
            join pg_namespace namespace on namespace.oid = overload.pronamespace
           where namespace.nspname = 'public'
             and overload.proname = expected_function.function_name
        ) <> 1
        or owner_role.rolname <> 'postgres'
        or not procedure_row.prosecdef
        or coalesce(procedure_row.proconfig, '{}'::text[]) <> array['search_path=public']::text[]
        or language_row.lanname <> 'plpgsql'
        or procedure_row.prorettype <> 'jsonb'::regtype
        or procedure_row.proargnames is distinct from expected_function.argument_names
        or procedure_row.pronargdefaults <> expected_function.default_count
        or has_function_privilege('public', procedure_row.oid, 'EXECUTE')
        or has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
        or not has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
        or exists (
          select 1
            from aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) function_acl
           where function_acl.privilege_type = 'EXECUTE'
             and function_acl.grantee not in (
               procedure_row.proowner,
               (select oid from pg_roles where rolname = 'authenticated')
             )
        )
  ) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  if exists (
    select 1
      from (values
        ('contractor_work_drafts'),
        ('contractor_work_draft_items'),
        ('contractor_work_draft_launches')
      ) expected_table(table_name)
      join pg_class relation
        on relation.relnamespace = 'public'::regnamespace
       and relation.relname = expected_table.table_name
     where not has_table_privilege('authenticated', relation.oid, 'SELECT')
        or has_table_privilege('authenticated', relation.oid, 'INSERT')
        or has_table_privilege('authenticated', relation.oid, 'UPDATE')
        or has_table_privilege('authenticated', relation.oid, 'DELETE')
        or has_table_privilege('authenticated', relation.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', relation.oid, 'REFERENCES')
        or has_table_privilege('authenticated', relation.oid, 'TRIGGER')
        or has_table_privilege('public', relation.oid, 'SELECT')
        or has_table_privilege('anon', relation.oid, 'SELECT')
        or exists (
          select 1
            from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) table_acl
           where table_acl.grantee not in (
               relation.relowner,
               (select oid from pg_roles where rolname = 'authenticated')
             )
              or (
                table_acl.grantee = (select oid from pg_roles where rolname = 'authenticated')
                and table_acl.privilege_type <> 'SELECT'
              )
        )
        or exists (
          select 1
            from pg_attribute attribute
           where attribute.attrelid = relation.oid
             and attribute.attnum > 0
             and not attribute.attisdropped
             and attribute.attacl is not null
        )
  ) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
  end if;

  if (
    select count(*)
      from pg_policy policy_row
     where policy_row.polrelid in (
       'public.contractor_work_drafts'::regclass,
       'public.contractor_work_draft_items'::regclass,
       'public.contractor_work_draft_launches'::regclass
     )
  ) <> 3 or exists (
    select 1
      from (values
        ('contractor_work_drafts', 'Contractor work drafts: contractor team reads', '(current_user_can_access_contractor(contractor_id)ORcurrent_user_is_platform_admin())'),
        ('contractor_work_draft_items', 'Contractor work draft items: contractor team reads', '(EXISTS(SELECT1FROMcontractor_work_draftsdraftWHERE((draft.id=contractor_work_draft_items.draft_id)AND(draft.contractor_id=contractor_work_draft_items.contractor_id)AND(current_user_can_access_contractor(draft.contractor_id)ORcurrent_user_is_platform_admin()))))'),
        ('contractor_work_draft_launches', 'Contractor work draft launches: contractor team reads', '(EXISTS(SELECT1FROMcontractor_work_draftsdraftWHERE((draft.id=contractor_work_draft_launches.draft_id)AND(draft.contractor_id=contractor_work_draft_launches.contractor_id)AND(current_user_can_access_contractor(draft.contractor_id)ORcurrent_user_is_platform_admin()))))')
      ) expected_policy(table_name, policy_name, policy_expression)
      left join pg_class relation
        on relation.relnamespace = 'public'::regnamespace
       and relation.relname = expected_policy.table_name
      left join pg_policy policy_row
        on policy_row.polrelid = relation.oid
       and policy_row.polname = expected_policy.policy_name
     where policy_row.oid is null
        or policy_row.polcmd <> 'r'
        or not policy_row.polpermissive
        or policy_row.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]
        or policy_row.polwithcheck is not null
        or regexp_replace(pg_get_expr(policy_row.polqual, policy_row.polrelid), '\s+', '', 'g') <> expected_policy.policy_expression
  ) then
    raise exception 'Durable Draft foundation is incomplete or incompatible.';
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

  perform public.servsync_private_assert_canonical_customer_draft_foundation();
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

alter function public.servsync_private_assert_canonical_customer_draft_foundation() owner to postgres;
alter function public.servsync_private_customer_draft_foundation_available() owner to postgres;
alter function public.servsync_private_local_customer_has_readable_work(uuid, uuid, uuid) owner to postgres;

revoke all on function public.servsync_private_assert_canonical_customer_draft_foundation() from public, anon, authenticated;
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
alter function public.servsync_private_assert_canonical_customer_draft_foundation() owner to postgres;
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
