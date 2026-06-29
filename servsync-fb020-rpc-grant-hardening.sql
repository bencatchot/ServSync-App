revoke execute on function public.servsync_homeowner_respond_to_estimate(uuid, text) from public;
revoke execute on function public.servsync_homeowner_respond_to_estimate(uuid, text) from anon;
grant execute on function public.servsync_homeowner_respond_to_estimate(uuid, text) to authenticated;
revoke execute on function public.servsync_homeowner_view_invoice(uuid) from public;
revoke execute on function public.servsync_homeowner_view_invoice(uuid) from anon;
grant execute on function public.servsync_homeowner_view_invoice(uuid) to authenticated;
