-- ServSync homeowner document room-link foundation.
-- Do not apply to production without separate approval.
--
-- Scope:
--   - Adds an optional home_rooms link for homeowner document metadata.
--   - Keeps existing home_documents RLS, grants, storage buckets, and storage
--     policies unchanged.
--   - Adds same-home validation so a document can only reference a room that
--     belongs to the document's home.
--   - Adds no UI, no shared-home document expansion, no contractor visibility,
--     no photo tagging, no report/job media tagging, and no Home Map behavior.

begin;

alter table public.home_documents
  add column if not exists home_room_id uuid references public.home_rooms(id) on delete set null;

comment on column public.home_documents.home_room_id is
  'Optional link to a durable home_rooms row for future homeowner document room-tagging UI. Room notes are not copied or exposed through documents.';

create index if not exists home_documents_home_room_created_idx
  on public.home_documents(home_id, home_room_id, created_at desc);

create index if not exists home_documents_owner_home_room_created_idx
  on public.home_documents(homeowner_user_id, home_id, home_room_id, created_at desc);

create or replace function public.home_documents_validate_home_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_home_id uuid;
begin
  if new.home_room_id is null then
    return new;
  end if;

  if new.home_id is null then
    raise exception 'Home room link requires a document home.';
  end if;

  select hr.home_id
    into v_room_home_id
    from public.home_rooms hr
   where hr.id = new.home_room_id;

  if v_room_home_id is null then
    raise exception 'Home room not found.';
  end if;

  if v_room_home_id is distinct from new.home_id then
    raise exception 'Home document room must belong to the same home as the document.';
  end if;

  return new;
end;
$$;

comment on function public.home_documents_validate_home_room() is
  'Validates optional home_documents.home_room_id links. Allows null links, rejects unassigned document room links, and blocks cross-home room links without exposing room notes.';

drop trigger if exists home_documents_validate_home_room_trigger on public.home_documents;
create trigger home_documents_validate_home_room_trigger
  before insert or update of home_id, home_room_id
  on public.home_documents
  for each row execute function public.home_documents_validate_home_room();

revoke all on function public.home_documents_validate_home_room() from public;
revoke all on function public.home_documents_validate_home_room() from anon;
revoke all on function public.home_documents_validate_home_room() from authenticated;

notify pgrst, 'reload schema';

commit;
