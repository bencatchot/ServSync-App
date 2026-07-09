-- ServSync provider-neutral integration foundation.
-- Paste this into the Supabase SQL Editor for the ServSync project.
--
-- Adds internal-only provider mapping and outbox tables for future reviewed
-- integrations. This does not enable any live provider sync, OAuth/token
-- storage, browser access, UI, payment, calendar, email, SMS, push, e-sign,
-- CRM import/export, offline sync, or workflow behavior.

begin;

create extension if not exists pgcrypto;

create table if not exists public.external_object_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_account_id text not null,
  provider_object_type text not null,
  provider_object_id text not null,
  provider_parent_object_id text,
  servsync_entity_type text not null,
  servsync_entity_id uuid not null,
  contractor_id uuid references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  mapping_status text not null default 'active',
  sync_direction text not null default 'linked',
  last_synced_at timestamptz,
  last_seen_at timestamptz,
  external_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_object_mappings_provider_check
    check (length(trim(provider)) > 0),
  constraint external_object_mappings_provider_account_id_check
    check (length(trim(provider_account_id)) > 0),
  constraint external_object_mappings_provider_object_type_check
    check (length(trim(provider_object_type)) > 0),
  constraint external_object_mappings_provider_object_id_check
    check (length(trim(provider_object_id)) > 0),
  constraint external_object_mappings_servsync_entity_type_check
    check (
      servsync_entity_type in (
        'contractor_profile',
        'homeowner_profile',
        'home',
        'home_document',
        'home_reminder',
        'contractor_local_contact',
        'contractor_local_home',
        'homeowner_contractor_connection',
        'service_request',
        'service_request_appointment',
        'contractor_calendar_event',
        'estimate',
        'estimate_line_item',
        'invoice',
        'invoice_line_item',
        'inspection',
        'job_work_item',
        'home_maintenance_log',
        'notification',
        'workflow_message',
        'workflow_activity_event',
        'service_agreement_template',
        'service_agreement_offer',
        'service_agreement',
        'contractor_price_book_item'
      )
    ),
  constraint external_object_mappings_mapping_status_check
    check (mapping_status in ('active', 'pending', 'conflict', 'failed', 'archived')),
  constraint external_object_mappings_sync_direction_check
    check (sync_direction in ('imported', 'exported', 'synced', 'linked')),
  constraint external_object_mappings_scope_check
    check (contractor_id is not null or homeowner_user_id is not null or home_id is not null)
);

comment on table public.external_object_mappings is
  'Internal provider-neutral mapping between ServSync records and future external provider objects. No browser/client access.';

comment on column public.external_object_mappings.metadata is
  'Private internal mapping metadata for future reviewed workers/RPCs. Do not expose to browser clients.';

create unique index if not exists external_object_mappings_provider_object_uidx
  on public.external_object_mappings(provider, provider_account_id, provider_object_type, provider_object_id);

create unique index if not exists external_object_mappings_servsync_entity_object_type_uidx
  on public.external_object_mappings(provider, provider_account_id, servsync_entity_type, servsync_entity_id, provider_object_type);

create index if not exists external_object_mappings_entity_idx
  on public.external_object_mappings(servsync_entity_type, servsync_entity_id);

create index if not exists external_object_mappings_contractor_provider_idx
  on public.external_object_mappings(contractor_id, provider)
  where contractor_id is not null;

create index if not exists external_object_mappings_homeowner_provider_idx
  on public.external_object_mappings(homeowner_user_id, provider)
  where homeowner_user_id is not null;

create index if not exists external_object_mappings_home_provider_idx
  on public.external_object_mappings(home_id, provider)
  where home_id is not null;

create index if not exists external_object_mappings_provider_status_idx
  on public.external_object_mappings(provider, mapping_status);

alter table public.external_object_mappings enable row level security;

drop trigger if exists external_object_mappings_touch_updated_at on public.external_object_mappings;
create trigger external_object_mappings_touch_updated_at
  before update on public.external_object_mappings
  for each row execute function public.touch_updated_at();

revoke all on table public.external_object_mappings from public;
revoke all on table public.external_object_mappings from anon;
revoke all on table public.external_object_mappings from authenticated;

create table if not exists public.integration_outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  channel text not null,
  provider text not null default '',
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  contractor_id uuid references public.contractor_profiles(id) on delete cascade,
  homeowner_user_id uuid references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  status text not null default 'pending',
  priority integer not null default 0,
  scheduled_for timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 10,
  locked_at timestamptz,
  locked_by text,
  processing_started_at timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  last_error_code text,
  last_error_message text,
  payload jsonb not null default '{}'::jsonb,
  result_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_outbox_events_event_key_check
    check (length(trim(event_key)) > 0),
  constraint integration_outbox_events_channel_check
    check (channel in ('accounting', 'payment', 'calendar', 'email', 'sms', 'push', 'document', 'crm', 'webhook', 'other')),
  constraint integration_outbox_events_event_type_check
    check (length(trim(event_type)) > 0),
  constraint integration_outbox_events_aggregate_type_check
    check (length(trim(aggregate_type)) > 0),
  constraint integration_outbox_events_status_check
    check (status in ('pending', 'locked', 'processing', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  constraint integration_outbox_events_attempt_count_check
    check (attempt_count >= 0),
  constraint integration_outbox_events_max_attempts_check
    check (max_attempts > 0),
  constraint integration_outbox_events_scope_check
    check (
      contractor_id is not null
      or homeowner_user_id is not null
      or home_id is not null
      or aggregate_id is not null
    )
);

comment on table public.integration_outbox_events is
  'Internal provider-neutral idempotent event queue for future reviewed integration workers. No browser/client access.';

comment on column public.integration_outbox_events.payload is
  'Private internal event payload. Future workers must sanitize before any external delivery.';

comment on column public.integration_outbox_events.result_metadata is
  'Private internal processing metadata. Do not expose to browser clients.';

create unique index if not exists integration_outbox_events_event_key_uidx
  on public.integration_outbox_events(event_key);

create index if not exists integration_outbox_events_processing_idx
  on public.integration_outbox_events(status, scheduled_for, priority desc);

create index if not exists integration_outbox_events_aggregate_idx
  on public.integration_outbox_events(aggregate_type, aggregate_id)
  where aggregate_id is not null;

create index if not exists integration_outbox_events_contractor_status_idx
  on public.integration_outbox_events(contractor_id, status)
  where contractor_id is not null;

create index if not exists integration_outbox_events_homeowner_status_idx
  on public.integration_outbox_events(homeowner_user_id, status)
  where homeowner_user_id is not null;

create index if not exists integration_outbox_events_home_status_idx
  on public.integration_outbox_events(home_id, status)
  where home_id is not null;

alter table public.integration_outbox_events enable row level security;

drop trigger if exists integration_outbox_events_touch_updated_at on public.integration_outbox_events;
create trigger integration_outbox_events_touch_updated_at
  before update on public.integration_outbox_events
  for each row execute function public.touch_updated_at();

revoke all on table public.integration_outbox_events from public;
revoke all on table public.integration_outbox_events from anon;
revoke all on table public.integration_outbox_events from authenticated;

notify pgrst, 'reload schema';

commit;
