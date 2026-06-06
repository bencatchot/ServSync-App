-- ServSync email notification prep.
-- Paste into the Supabase SQL Editor.
-- Run after servsync-admin-reports.sql.
-- No email provider required — the edge function is gated by EMAIL_ENABLED env var.

begin;

-- Add email preference column to profiles
alter table public.profiles
  add column if not exists email_notifications_enabled boolean not null default true;

-- RPC for users to toggle their own email preference
create or replace function public.servsync_update_email_preferences(p_enabled boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles
     set email_notifications_enabled = p_enabled,
         updated_at = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.servsync_update_email_preferences(boolean) to authenticated;

-- ── How to activate emails when ready ───────────────────────────────────────
--
-- 1. Deploy the edge function:
--      supabase functions deploy send-notification-email
--
-- 2. In Supabase Dashboard → Project Settings → Edge Functions, add:
--      EMAIL_ENABLED = true
--      RESEND_API_KEY = re_xxxxx        (or SENDGRID_API_KEY / etc.)
--      EMAIL_FROM = noreply@yourapp.com
--
-- 3. In Supabase Dashboard → Database → Webhooks, create a webhook:
--      Table:  public.notifications
--      Events: INSERT
--      Type:   Supabase Edge Function
--      Function: send-notification-email
--
-- That's it — no further SQL changes needed.

notify pgrst, 'reload schema';

commit;
