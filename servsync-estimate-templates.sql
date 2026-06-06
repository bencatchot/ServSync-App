-- ServSync estimate templates v1.
-- Paste this into Supabase SQL Editor after servsync-estimates.sql.
-- This lets contractors save reusable estimate templates for future estimates.

begin;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(id) on delete cascade,
  name text not null default '',
  trade text not null default '',
  scope text not null default '',
  notes text not null default '',
  terms text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_templates_contractor_updated_idx
  on public.estimate_templates(contractor_id, updated_at desc);

drop trigger if exists estimate_templates_touch_updated_at on public.estimate_templates;
create trigger estimate_templates_touch_updated_at
  before update on public.estimate_templates
  for each row execute function public.touch_updated_at();

alter table public.estimate_templates enable row level security;

drop policy if exists "Estimate templates: contractor manages own" on public.estimate_templates;
create policy "Estimate templates: contractor manages own"
  on public.estimate_templates for all to authenticated
  using (
    contractor_id in (
      select id from public.contractor_profiles where owner_user_id = auth.uid()
    )
  )
  with check (
    contractor_id in (
      select id from public.contractor_profiles where owner_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.estimate_templates to authenticated;

notify pgrst, 'reload schema';

commit;
