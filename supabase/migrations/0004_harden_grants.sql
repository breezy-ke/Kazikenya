-- Tighten function exposure flagged by the Supabase security advisor.

alter function public.is_service() set search_path = public;
alter function public.touch_updated_at() set search_path = public;

-- Trigger functions are never called through the API.
revoke execute on function
  public.handle_new_user(), public.handle_user_contact_change(), public.mark_is_provider(),
  public.before_quote_insert(), public.after_quote_insert(), public.log_booking_change(),
  public.before_review_insert(), public.after_review_insert(), public.after_message_insert(),
  public.guard_profile(), public.guard_provider_profile(), public.before_verification_insert(),
  public.touch_updated_at()
from public, anon, authenticated;

-- Actions require a signed-in user.
revoke execute on function
  public.accept_quote(uuid), public.request_booking(uuid, smallint, text, text, int, smallint, text, date),
  public.respond_booking(uuid, boolean, int), public.cancel_booking(uuid), public.start_booking(uuid),
  public.mark_delivered(uuid), public.open_dispute(uuid, text, text), public.withdraw_quote(uuid),
  public.get_counterpart_contact(uuid), public.start_conversation(uuid, boolean),
  public.mark_conversation_read(uuid), public.review_verification(uuid, boolean, text),
  public.admin_set_suspended(uuid, boolean), public.admin_stats()
from public, anon;

grant execute on function
  public.accept_quote(uuid), public.request_booking(uuid, smallint, text, text, int, smallint, text, date),
  public.respond_booking(uuid, boolean, int), public.cancel_booking(uuid), public.start_booking(uuid),
  public.mark_delivered(uuid), public.open_dispute(uuid, text, text), public.withdraw_quote(uuid),
  public.get_counterpart_contact(uuid), public.start_conversation(uuid, boolean),
  public.mark_conversation_read(uuid), public.review_verification(uuid, boolean, text),
  public.admin_set_suspended(uuid, boolean), public.admin_stats()
to authenticated;

-- Public: provider directory search (anon browsing before sign-up is a key conversion path).
grant execute on function public.search_providers(smallint, smallint, text, boolean, boolean, text, int, int) to anon, authenticated;
