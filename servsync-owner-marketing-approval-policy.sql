-- ServSync owner Marketing approval policy v1.
--
-- Allows the one-person internal workspace to approve a Draft directly while
-- preserving the submit/review lifecycle for contractor and future team workspaces.

begin;

do $$
declare
  v_definition text;
begin
  if to_regclass('public.marketing_workspaces') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regclass('public.marketing_content_status_events') is null
     or to_regprocedure('public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)') is null then
    raise exception 'FB-037K owner approval prerequisites are missing.';
  end if;

  v_definition := pg_get_functiondef(
    'public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)'::regprocedure
  );
  if v_definition like '%v_direct_owner_approval boolean%' then
    raise exception 'FB-037K owner approval policy is already installed.';
  end if;
  if v_definition not like '%v_from_status = ''draft'' and p_to_status = ''needs_approval''%'
     or v_definition not like '%A review reason between 3 and 1000 characters is required.%' then
    raise exception 'Unexpected Marketing Content transition prerequisite.';
  end if;
end;
$$;

create or replace function public.servsync_transition_marketing_content(
  p_contractor_id uuid,
  p_content_id uuid,
  p_expected_revision bigint,
  p_to_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
volatile
as $$
declare
  v_workspace_id uuid;
  v_workspace_kind text;
  v_item public.marketing_content_items;
  v_from_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_direct_owner_approval boolean;
begin
  v_workspace_id := public.servsync_private_marketing_workspace_for_context(p_contractor_id,
    case when p_to_status in ('approved', 'rejected') then 'approve' else 'create_edit' end);
  select workspace_kind into strict v_workspace_kind
    from public.marketing_workspaces where id = v_workspace_id;

  if p_content_id is null or p_expected_revision is null or p_expected_revision < 1
     or p_to_status not in ('draft', 'needs_approval', 'approved', 'rejected') then
    raise exception 'Invalid Marketing content transition.' using errcode = '22023';
  end if;
  select * into v_item from public.marketing_content_items
   where id = p_content_id and workspace_id = v_workspace_id for update;
  if v_item.id is null then raise exception 'Marketing content not found.' using errcode = 'P0002'; end if;
  if v_item.revision_number <> p_expected_revision then
    raise exception 'Marketing content changed; reload and try again.' using errcode = '40001';
  end if;

  v_from_status := v_item.status;
  v_direct_owner_approval := v_workspace_kind = 'internal'
    and v_from_status = 'draft' and p_to_status = 'approved';

  if not ((v_from_status = 'idea' and p_to_status = 'draft')
    or (v_from_status = 'draft' and p_to_status = 'needs_approval')
    or v_direct_owner_approval
    or (v_from_status = 'needs_approval' and p_to_status in ('approved', 'draft', 'rejected'))) then
    raise exception 'Invalid Marketing content transition.' using errcode = '55000';
  end if;
  if v_from_status = 'draft' and p_to_status in ('needs_approval', 'approved')
     and char_length(btrim(v_item.body)) = 0 then
    raise exception 'Marketing content body is required before approval.' using errcode = '22023';
  end if;
  if v_from_status = 'needs_approval' and p_to_status in ('draft', 'rejected') then
    if v_reason is null or char_length(v_reason) not between 3 and 1000 then
      raise exception 'A review reason between 3 and 1000 characters is required.' using errcode = '22023';
    end if;
  elsif v_reason is not null then
    raise exception 'A review reason is not valid for this transition.' using errcode = '22023';
  end if;

  update public.marketing_content_items set status = p_to_status,
    revision_number = revision_number + 1,
    submitted_at = case when v_from_status = 'draft' and p_to_status = 'needs_approval' then now() else submitted_at end,
    submitted_by = case when v_from_status = 'draft' and p_to_status = 'needs_approval' then auth.uid() else submitted_by end,
    reviewed_at = case
      when v_from_status = 'draft' and p_to_status = 'needs_approval' then null
      when v_direct_owner_approval or v_from_status = 'needs_approval' then now()
      else reviewed_at end,
    reviewed_by = case
      when v_from_status = 'draft' and p_to_status = 'needs_approval' then null
      when v_direct_owner_approval or v_from_status = 'needs_approval' then auth.uid()
      else reviewed_by end,
    review_note = case
      when v_from_status = 'draft' and p_to_status = 'needs_approval' then null
      when v_direct_owner_approval then null
      when v_from_status = 'needs_approval' then v_reason
      else review_note end,
    updated_at = now() where id = v_item.id returning * into v_item;

  insert into public.marketing_content_status_events (
    workspace_id, content_id, content_revision, from_status, to_status, reason, actor_user_id
  ) values (v_item.workspace_id, v_item.id, v_item.revision_number, v_from_status,
    v_item.status, v_reason, auth.uid());

  return jsonb_build_object('content_id', v_item.id, 'status', v_item.status,
    'revision_number', v_item.revision_number);
end;
$$;

alter function public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text) owner to postgres;
revoke all on function public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.servsync_transition_marketing_content(uuid,uuid,bigint,text,text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
