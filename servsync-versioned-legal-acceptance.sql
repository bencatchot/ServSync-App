-- ServSync legal acceptance foundation. PREPARED ONLY: shared installation needs approval.
-- No existing account is backfilled. No current release is activated by this file.
begin;

create table public.servsync_legal_policy_bundles (
  bundle_id text primary key,
  policy_text text not null,
  policy_sha256 text generated always as (encode(extensions.digest(policy_text, 'sha256'), 'hex')) stored,
  archived_at timestamptz not null default clock_timestamp(),
  constraint servsync_policy_identity check (coalesce((policy_text::jsonb ->> 'bundleId') = bundle_id, false)),
  constraint servsync_policy_documents check (coalesce(
    (policy_text::jsonb -> 'pages') ?& array['terms', 'privacy', 'acceptable-use', 'contractor-agreement']
    and (policy_text::jsonb -> 'assent') ?& array['homeowner', 'contractor']
  , false)),
  unique (bundle_id, policy_sha256)
);

-- Separate mutable release pointer; changing it cannot change historical text.
create table public.servsync_legal_current_release (
  singleton boolean primary key default true check (singleton),
  bundle_id text not null references public.servsync_legal_policy_bundles(bundle_id),
  activated_at timestamptz not null default clock_timestamp()
);

create table public.servsync_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  -- Intentionally no auth.users FK/cascade: closure must not silently erase evidence.
  -- UUID is still personal data; privacy retention review applies.
  actor_user_id uuid not null,
  bundle_id text not null,
  policy_sha256 text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  signup_context text not null check (signup_context in ('standard', 'contractor_invitation', 'local_customer_claim')),
  account_role text not null check (account_role in ('homeowner', 'contractor')),
  terms_agreed boolean not null check (terms_agreed),
  privacy_acknowledged boolean not null check (privacy_acknowledged),
  acceptable_use_agreed boolean not null check (acceptable_use_agreed),
  contractor_agreed boolean not null,
  us_adult_confirmed boolean not null check (us_adult_confirmed),
  assent_text text not null,
  evidence_kind text not null default 'signup_submission' check (evidence_kind = 'signup_submission'),
  foreign key (bundle_id, policy_sha256) references public.servsync_legal_policy_bundles(bundle_id, policy_sha256),
  unique (actor_user_id, bundle_id, evidence_kind),
  check (contractor_agreed = (account_role = 'contractor')),
  check (signup_context = 'standard' or account_role = 'homeowner')
);

alter table public.servsync_legal_policy_bundles owner to postgres;
alter table public.servsync_legal_current_release owner to postgres;
alter table public.servsync_legal_acceptances owner to postgres;
alter table public.servsync_legal_policy_bundles enable row level security;
alter table public.servsync_legal_policy_bundles force row level security;
alter table public.servsync_legal_current_release enable row level security;
alter table public.servsync_legal_current_release force row level security;
alter table public.servsync_legal_acceptances enable row level security;
alter table public.servsync_legal_acceptances force row level security;
revoke all on public.servsync_legal_policy_bundles, public.servsync_legal_current_release, public.servsync_legal_acceptances from public, anon, authenticated, service_role;
grant select on public.servsync_legal_acceptances to authenticated, service_role;
create policy servsync_legal_read_own on public.servsync_legal_acceptances for select to authenticated
  using (actor_user_id = auth.uid());

create function public.servsync_reject_legal_evidence_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = '42501', message = 'Legal evidence is append-only.';
end;
$$;
alter function public.servsync_reject_legal_evidence_mutation() owner to postgres;
revoke all on function public.servsync_reject_legal_evidence_mutation() from public, anon, authenticated, service_role;
create trigger servsync_policy_immutable before update or delete or truncate on public.servsync_legal_policy_bundles
  for each statement execute function public.servsync_reject_legal_evidence_mutation();
create trigger servsync_acceptance_immutable before update or delete or truncate on public.servsync_legal_acceptances
  for each statement execute function public.servsync_reject_legal_evidence_mutation();

create function public.servsync_current_legal_bundle()
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object('bundle_id', b.bundle_id, 'policy_sha256', b.policy_sha256)
  from public.servsync_legal_current_release c
  join public.servsync_legal_policy_bundles b using (bundle_id)
  where c.singleton
    and exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'servsync_capture_signup_legal_acceptance' and tgenabled = 'O')
    and b.policy_text::jsonb -> 'releaseReady' = 'true'::jsonb
    and nullif(b.policy_text::jsonb ->> 'operator', '') is not null
    and nullif(b.policy_text::jsonb ->> 'privacyEmail', '') is not null
    and (b.policy_text::jsonb ->> 'effectiveDate')::date <= current_date;
$$;
alter function public.servsync_current_legal_bundle() owner to postgres;
revoke all on function public.servsync_current_legal_bundle() from public, anon, authenticated, service_role;
grant execute on function public.servsync_current_legal_bundle() to anon, authenticated, service_role;

create function public.servsync_capture_signup_legal_acceptance()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_submission jsonb := new.raw_user_meta_data -> 'legal_acceptance';
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'homeowner');
  v_current text;
  v_bundle public.servsync_legal_policy_bundles;
  v_expected jsonb;
begin
  -- Same public-role normalization as the existing canonical profile trigger.
  if v_role not in ('homeowner', 'contractor') then v_role := 'homeowner'; end if;
  -- Lock the pointer through the transaction so activation cannot race validation.
  perform 1 from public.servsync_legal_current_release where singleton for share;
  v_current := public.servsync_current_legal_bundle() ->> 'bundle_id';
  if v_current is null then
    raise exception using errcode = '23514', message = 'SERVSYNC_LEGAL_RELEASE_NOT_READY';
  end if;
  select * into strict v_bundle from public.servsync_legal_policy_bundles where bundle_id = v_current;
  if v_submission is null or jsonb_typeof(v_submission) <> 'object'
     or coalesce(v_submission ->> 'context', '') not in ('standard', 'contractor_invitation', 'local_customer_claim')
     or (v_role = 'contractor' and v_submission ->> 'context' <> 'standard') then
    raise exception using errcode = '23514', message = 'SERVSYNC_LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  v_expected := jsonb_build_object(
    'bundle_id', v_current, 'terms_agreed', true, 'privacy_acknowledged', true,
    'acceptable_use_agreed', true, 'contractor_agreed', v_role = 'contractor',
    'us_adult_confirmed', true, 'context', v_submission ->> 'context'
  );
  -- Exact comparison rejects stale versions, false/string consent and client times.
  if v_submission is distinct from v_expected then
    raise exception using errcode = '23514', message = 'SERVSYNC_LEGAL_ACCEPTANCE_INVALID_OR_STALE';
  end if;
  insert into public.servsync_legal_acceptances (
    actor_user_id, bundle_id, policy_sha256, signup_context, account_role,
    terms_agreed, privacy_acknowledged, acceptable_use_agreed, contractor_agreed,
    us_adult_confirmed, assent_text
  ) values (
    new.id, v_bundle.bundle_id, v_bundle.policy_sha256, v_submission ->> 'context', v_role,
    true, true, true, v_role = 'contractor', true,
    v_bundle.policy_text::jsonb -> 'assent' ->> v_role
  );
  return new;
end;
$$;
alter function public.servsync_capture_signup_legal_acceptance() owner to postgres;
revoke all on function public.servsync_capture_signup_legal_acceptance() from public, anon, authenticated, service_role;
-- Signup enforcement is installed atomically with the release pointer by the separate activation script.

comment on table public.servsync_legal_acceptances is 'Append-only signup submission evidence, not proof of identity, email verification, renewed assent or marketing consent. No historical backfill.';
notify pgrst, 'reload schema';
commit;
