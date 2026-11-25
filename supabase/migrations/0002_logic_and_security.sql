-- KaziKenya business logic, triggers and row level security.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_service() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres','supabase_admin');
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- Bilingual in-app notification. Picks the user's language.
create or replace function public.notify(p_user uuid, p_type text, p_title_en text, p_title_sw text,
  p_body_en text, p_body_sw text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare v_locale text;
begin
  select locale into v_locale from public.profiles where id = p_user;
  insert into public.notifications(user_id, type, title, body, link)
  values (p_user, p_type,
          case when v_locale = 'sw' then p_title_sw else p_title_en end,
          coalesce(case when v_locale = 'sw' then p_body_sw else p_body_en end, ''),
          p_link);
end $$;
revoke execute on function public.notify from public, anon, authenticated;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger provider_profiles_touch before update on public.provider_profiles for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();
create trigger payouts_touch before update on public.payouts for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New user -> profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.profile_private(user_id, phone, email, mpesa_phone)
  values (new.id, nullif(new.phone,''), new.email, nullif(new.phone,''))
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_contact_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profile_private
     set phone = coalesce(nullif(new.phone,''), phone),
         email = coalesce(new.email, email),
         mpesa_phone = coalesce(mpesa_phone, nullif(new.phone,''))
   where user_id = new.id;
  return new;
end $$;
create trigger on_auth_user_updated after update of phone, email on auth.users
  for each row execute function public.handle_user_contact_change();

-- Users can't promote themselves.
create or replace function public.guard_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not (public.is_service() or public.is_admin()) then
    new.is_admin := old.is_admin;
    new.verification_level := old.verification_level;
    new.suspended := old.suspended;
    new.is_provider := old.is_provider;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- Provider computed/paid columns are system-managed.
create or replace function public.guard_provider_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_service() then
      new.is_pro := false; new.pro_until := null; new.rating_avg := 0; new.rating_count := 0;
      new.jobs_completed := 0; new.quotes_used := 0;
    end if;
  elsif not public.is_service() then
    new.is_pro := old.is_pro; new.pro_until := old.pro_until;
    new.rating_avg := old.rating_avg; new.rating_count := old.rating_count;
    new.jobs_completed := old.jobs_completed;
    new.quotes_used := old.quotes_used; new.quotes_month := old.quotes_month;
  end if;
  new.search := to_tsvector('simple',
      coalesce(new.headline,'') || ' ' || coalesce(new.about,'') || ' ' || array_to_string(new.skills, ' ') || ' ' ||
      coalesce((select full_name || ' ' || coalesce(town,'') from public.profiles where id = new.id), ''));
  return new;
end $$;
create trigger provider_profiles_guard before insert or update on public.provider_profiles
  for each row execute function public.guard_provider_profile();

create or replace function public.mark_is_provider() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set is_provider = true where id = new.id;
  return new;
end $$;
create trigger provider_profiles_mark after insert on public.provider_profiles
  for each row execute function public.mark_is_provider();

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
create or replace function public.before_quote_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_pp public.provider_profiles;
  v_limit int;
  v_month date := date_trunc('month', now())::date;
begin
  select * into v_job from public.jobs where id = new.job_id;
  if v_job.id is null or v_job.status <> 'open' then
    raise exception 'JOB_NOT_OPEN' using hint = 'This job is no longer accepting quotes';
  end if;
  if v_job.buyer_id = new.provider_id then
    raise exception 'OWN_JOB' using hint = 'You cannot quote on your own job';
  end if;
  select * into v_pp from public.provider_profiles where id = new.provider_id for update;
  if v_pp.id is null then raise exception 'NOT_PROVIDER'; end if;
  if (select suspended from public.profiles where id = new.provider_id) then
    raise exception 'SUSPENDED';
  end if;
  if v_pp.quotes_month <> v_month then
    update public.provider_profiles set quotes_month = v_month, quotes_used = 0 where id = v_pp.id;
    v_pp.quotes_used := 0;
  end if;
  select free_quotes_per_month into v_limit from public.platform_settings;
  if not (v_pp.is_pro and coalesce(v_pp.pro_until, now()) >= now()) and v_pp.quotes_used >= v_limit then
    raise exception 'QUOTE_LIMIT' using hint = 'Free plan quote limit reached. Upgrade to Pro for unlimited quotes.';
  end if;
  new.status := 'pending';
  return new;
end $$;
create trigger quotes_before_insert before insert on public.quotes
  for each row execute function public.before_quote_insert();

create or replace function public.after_quote_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs; v_name text;
begin
  update public.provider_profiles set quotes_used = quotes_used + 1 where id = new.provider_id;
  update public.jobs set quotes_count = quotes_count + 1 where id = new.job_id returning * into v_job;
  select full_name into v_name from public.profiles where id = new.provider_id;
  perform public.notify(v_job.buyer_id, 'quote',
    'New quote: KES ' || to_char(new.amount, 'FM999,999,999'),
    'Bei mpya: KES ' || to_char(new.amount, 'FM999,999,999'),
    v_name || ' quoted on "' || v_job.title || '"',
    v_name || ' ametuma bei kwa "' || v_job.title || '"',
    '/jobs/' || v_job.id);
  return new;
end $$;
create trigger quotes_after_insert after insert on public.quotes
  for each row execute function public.after_quote_insert();

create or replace function public.withdraw_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.quotes set status = 'withdrawn'
   where id = p_quote and provider_id = auth.uid() and status = 'pending';
  if not found then raise exception 'NOT_ALLOWED'; end if;
  update public.jobs set quotes_count = greatest(quotes_count - 1, 0)
   where id = (select job_id from public.quotes where id = p_quote);
end $$;

-- ---------------------------------------------------------------------------
-- Booking lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.log_booking_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_buyer_name text; v_prov_name text; v_link text := '/bookings/' || new.id;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  insert into public.booking_events(booking_id, actor_id, from_status, to_status)
  values (new.id, auth.uid(), case when tg_op = 'UPDATE' then old.status end, new.status);

  select full_name into v_buyer_name from public.profiles where id = new.buyer_id;
  select full_name into v_prov_name from public.profiles where id = new.provider_id;

  case new.status
    when 'requested' then
      perform public.notify(new.provider_id, 'booking', 'New booking request', 'Ombi jipya la kazi',
        v_buyer_name || ' wants to book you: ' || new.title, v_buyer_name || ' anataka kukuajiri: ' || new.title, v_link);
    when 'awaiting_payment' then
      perform public.notify(new.buyer_id, 'booking', 'Ready for payment', 'Tayari kwa malipo',
        'Pay KES ' || to_char(new.amount,'FM999,999,999') || ' into escrow to confirm ' || v_prov_name,
        'Lipa KES ' || to_char(new.amount,'FM999,999,999') || ' kwenye escrow kumthibitisha ' || v_prov_name, v_link);
    when 'declined' then
      perform public.notify(new.buyer_id, 'booking', 'Booking declined', 'Ombi limekataliwa',
        v_prov_name || ' is not available for: ' || new.title, v_prov_name || ' hapatikani kwa: ' || new.title, v_link);
    when 'funded' then
      perform public.notify(new.provider_id, 'booking', 'Payment secured — start the job', 'Malipo yamehifadhiwa — anza kazi',
        'KES ' || to_char(new.amount,'FM999,999,999') || ' is held safely in escrow for ' || new.title,
        'KES ' || to_char(new.amount,'FM999,999,999') || ' imehifadhiwa kwa usalama kwa ' || new.title, v_link);
    when 'in_progress' then
      perform public.notify(new.buyer_id, 'booking', 'Work has started', 'Kazi imeanza',
        v_prov_name || ' started: ' || new.title, v_prov_name || ' ameanza: ' || new.title, v_link);
    when 'delivered' then
      perform public.notify(new.buyer_id, 'booking', 'Job marked as done', 'Kazi imekamilika',
        'Confirm to release payment to ' || v_prov_name, 'Thibitisha ili kumlipa ' || v_prov_name, v_link);
    when 'completed' then
      perform public.notify(new.provider_id, 'payout', 'Payment released', 'Malipo yametolewa',
        'KES ' || to_char(coalesce(new.payout_amount,0),'FM999,999,999') || ' is on its way to your M-Pesa',
        'KES ' || to_char(coalesce(new.payout_amount,0),'FM999,999,999') || ' inatumwa kwa M-Pesa yako', v_link);
    when 'cancelled' then
      perform public.notify(case when auth.uid() = new.buyer_id then new.provider_id else new.buyer_id end,
        'booking', 'Booking cancelled', 'Kazi imesitishwa', new.title, new.title, v_link);
    when 'disputed' then
      perform public.notify(case when auth.uid() = new.buyer_id then new.provider_id else new.buyer_id end,
        'dispute', 'A dispute was opened', 'Mzozo umefunguliwa',
        'Our team will review "' || new.title || '" within 24 hours',
        'Timu yetu itakagua "' || new.title || '" ndani ya saa 24', v_link);
    when 'refunded' then
      perform public.notify(new.buyer_id, 'payout', 'Refund issued', 'Pesa imerudishwa',
        'KES ' || to_char(new.amount,'FM999,999,999') || ' is being refunded to your M-Pesa',
        'KES ' || to_char(new.amount,'FM999,999,999') || ' inarudishwa kwa M-Pesa yako', v_link);
    else null;
  end case;
  return new;
end $$;
create trigger bookings_log after insert or update of status on public.bookings
  for each row execute function public.log_booking_change();

-- Buyer accepts a quote -> booking awaiting payment.
create or replace function public.accept_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_q public.quotes; v_job public.jobs; v_booking uuid; v_rate numeric;
begin
  select * into v_q from public.quotes where id = p_quote for update;
  select * into v_job from public.jobs where id = v_q.job_id for update;
  if v_job.buyer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if v_job.status <> 'open' or v_q.status <> 'pending' then raise exception 'NOT_AVAILABLE'; end if;
  select commission_rate into v_rate from public.platform_settings;

  update public.quotes set status = 'accepted' where id = v_q.id;
  update public.quotes set status = 'rejected' where job_id = v_job.id and id <> v_q.id and status = 'pending';
  update public.jobs set status = 'assigned' where id = v_job.id;

  insert into public.bookings(buyer_id, provider_id, job_id, quote_id, category_id, title, description,
                              amount, county_id, town, status, commission_rate)
  values (v_job.buyer_id, v_q.provider_id, v_job.id, v_q.id, v_job.category_id, v_job.title, v_job.description,
          v_q.amount, v_job.county_id, v_job.town, 'awaiting_payment', v_rate)
  returning id into v_booking;

  perform public.notify(v_q.provider_id, 'quote', 'Your quote was accepted 🎉', 'Bei yako imekubaliwa 🎉',
    v_job.title || ' — waiting for the client''s escrow payment',
    v_job.title || ' — tunasubiri malipo ya mteja kwenye escrow', '/bookings/' || v_booking);
  return v_booking;
end $$;

-- Buyer books a provider directly.
create or replace function public.request_booking(p_provider uuid, p_category smallint, p_title text,
  p_description text, p_amount int, p_county smallint, p_town text, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rate numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_provider = auth.uid() then raise exception 'OWN_PROFILE'; end if;
  if not exists (select 1 from public.provider_profiles pp join public.profiles p on p.id = pp.id
                 where pp.id = p_provider and pp.available and not p.suspended) then
    raise exception 'PROVIDER_UNAVAILABLE';
  end if;
  if char_length(coalesce(p_title,'')) < 3 then raise exception 'TITLE_REQUIRED'; end if;
  select commission_rate into v_rate from public.platform_settings;
  insert into public.bookings(buyer_id, provider_id, category_id, title, description, amount, county_id, town,
                              scheduled_for, status, commission_rate)
  values (auth.uid(), p_provider, p_category, p_title, coalesce(p_description,''), p_amount, p_county, p_town,
          p_date, 'requested', v_rate)
  returning id into v_id;
  return v_id;
end $$;

-- Provider accepts (optionally with a revised price) or declines a direct request.
create or replace function public.respond_booking(p_booking uuid, p_accept boolean, p_amount int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings
     set status = case when p_accept then 'awaiting_payment' else 'declined' end,
         amount = case when p_accept and p_amount is not null then p_amount else amount end
   where id = p_booking and provider_id = auth.uid() and status = 'requested';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

create or replace function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  update public.bookings set status = 'cancelled'
   where id = p_booking and auth.uid() in (buyer_id, provider_id)
     and status in ('requested','awaiting_payment')
  returning * into v_b;
  if v_b.id is null then raise exception 'NOT_ALLOWED'; end if;
  if v_b.job_id is not null then
    update public.jobs set status = 'open' where id = v_b.job_id and status = 'assigned';
    update public.quotes set status = 'withdrawn' where id = v_b.quote_id;
  end if;
end $$;

create or replace function public.start_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'in_progress'
   where id = p_booking and provider_id = auth.uid() and status = 'funded';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

create or replace function public.mark_delivered(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'delivered', delivered_at = now()
   where id = p_booking and provider_id = auth.uid() and status in ('funded','in_progress');
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

create or replace function public.open_dispute(p_booking uuid, p_reason text, p_details text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.bookings set status = 'disputed'
   where id = p_booking and auth.uid() in (buyer_id, provider_id)
     and status in ('funded','in_progress','delivered');
  if not found then raise exception 'NOT_ALLOWED'; end if;
  insert into public.disputes(booking_id, raised_by, reason, details)
  values (p_booking, auth.uid(), p_reason, coalesce(p_details,''))
  returning id into v_id;
  return v_id;
end $$;

-- Service-only money transitions (called from edge functions with the service role).
create or replace function public.fund_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'funded', funded_at = now()
   where id = p_booking and status = 'awaiting_payment';
end $$;

create or replace function public.release_booking(p_booking uuid, p_actor uuid) returns public.payouts
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings; v_comm int; v_pay public.payouts; v_phone text; v_is_admin boolean;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  select is_admin into v_is_admin from public.profiles where id = p_actor;
  if v_b.id is null then raise exception 'NOT_FOUND'; end if;
  if not (
       (p_actor = v_b.buyer_id and v_b.status in ('funded','in_progress','delivered'))
    or (coalesce(v_is_admin,false) and v_b.status in ('funded','in_progress','delivered','disputed'))
    or (p_actor is null and v_b.status = 'delivered')  -- auto-release job
  ) then raise exception 'NOT_ALLOWED'; end if;

  v_comm := round(v_b.amount * v_b.commission_rate);
  update public.bookings set status = 'completed', completed_at = now(),
         commission_amount = v_comm, payout_amount = v_b.amount - v_comm
   where id = v_b.id;
  update public.provider_profiles set jobs_completed = jobs_completed + 1 where id = v_b.provider_id;
  if v_b.job_id is not null then update public.jobs set status = 'closed' where id = v_b.job_id; end if;
  update public.disputes set status = 'resolved_provider', resolved_by = p_actor, resolved_at = now()
   where booking_id = v_b.id and status = 'open';

  select coalesce(mpesa_phone, phone) into v_phone from public.profile_private where user_id = v_b.provider_id;
  insert into public.payouts(booking_id, provider_id, kind, amount, phone)
  values (v_b.id, v_b.provider_id, 'payout', v_b.amount - v_comm, coalesce(v_phone, ''))
  returning * into v_pay;
  return v_pay;
end $$;

create or replace function public.refund_booking(p_booking uuid, p_actor uuid, p_note text) returns public.payouts
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings; v_pay public.payouts; v_phone text;
begin
  if not coalesce((select is_admin from public.profiles where id = p_actor), false) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_b from public.bookings where id = p_booking for update;
  if v_b.status not in ('funded','in_progress','delivered','disputed') then raise exception 'NOT_ALLOWED'; end if;
  update public.bookings set status = 'refunded' where id = v_b.id;
  update public.disputes set status = 'resolved_buyer', resolved_by = p_actor, resolved_at = now(),
         resolution_note = p_note where booking_id = v_b.id and status = 'open';
  if v_b.job_id is not null then update public.jobs set status = 'closed' where id = v_b.job_id; end if;
  select coalesce(mpesa_phone, phone) into v_phone from public.profile_private where user_id = v_b.buyer_id;
  insert into public.payouts(booking_id, provider_id, kind, amount, phone)
  values (v_b.id, v_b.buyer_id, 'refund', v_b.amount, coalesce(v_phone,''))
  returning * into v_pay;
  return v_pay;
end $$;

create or replace function public.activate_pro(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_days int;
begin
  select pro_days into v_days from public.platform_settings;
  update public.provider_profiles
     set is_pro = true,
         pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => v_days)
   where id = p_user;
  perform public.notify(p_user, 'pro', 'Welcome to KaziKenya Pro ⭐', 'Karibu KaziKenya Pro ⭐',
    'Unlimited quotes, Pro badge and top placement are now active.',
    'Bei bila kikomo, beji ya Pro na nafasi ya juu sasa vimewashwa.', '/wallet');
end $$;

create or replace function public.expire_pro() returns void
language sql security definer set search_path = public as $$
  update public.provider_profiles set is_pro = false where is_pro and pro_until < now();
$$;

revoke execute on function public.fund_booking, public.release_booking, public.refund_booking,
  public.activate_pro, public.expire_pro from public, anon, authenticated;

-- Contact details unlock once escrow is funded.
create or replace function public.get_counterpart_contact(p_booking uuid)
returns table(phone text) language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking;
  if v_b.id is null or auth.uid() not in (v_b.buyer_id, v_b.provider_id)
     or v_b.status not in ('funded','in_progress','delivered','completed','disputed') then
    return;
  end if;
  return query select pp.phone from public.profile_private pp
   where pp.user_id = case when auth.uid() = v_b.buyer_id then v_b.provider_id else v_b.buyer_id end;
end $$;

-- ---------------------------------------------------------------------------
-- Reviews -> provider rating
-- ---------------------------------------------------------------------------
create or replace function public.before_review_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = new.booking_id;
  if v_b.status <> 'completed' then raise exception 'BOOKING_NOT_COMPLETED'; end if;
  if new.reviewer_id = v_b.buyer_id then new.reviewee_id := v_b.provider_id;
  elsif new.reviewer_id = v_b.provider_id then new.reviewee_id := v_b.buyer_id;
  else raise exception 'NOT_ALLOWED'; end if;
  return new;
end $$;
create trigger reviews_before_insert before insert on public.reviews
  for each row execute function public.before_review_insert();

create or replace function public.after_review_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.provider_profiles pp
     set rating_avg = s.avg, rating_count = s.cnt
    from (select avg(r.rating)::numeric(3,2) avg, count(*) cnt
            from public.reviews r join public.bookings b on b.id = r.booking_id
           where r.reviewee_id = new.reviewee_id and b.provider_id = new.reviewee_id) s
   where pp.id = new.reviewee_id;
  perform public.notify(new.reviewee_id, 'review', 'New ' || new.rating || '★ review', 'Tathmini mpya ya nyota ' || new.rating,
    left(new.comment, 120), left(new.comment, 120), '/me');
  return new;
end $$;
create trigger reviews_after_insert after insert on public.reviews
  for each row execute function public.after_review_insert();

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.start_conversation(p_other uuid, p_i_am_buyer boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_buyer uuid; v_prov uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_other = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if p_i_am_buyer then v_buyer := auth.uid(); v_prov := p_other;
  else v_buyer := p_other; v_prov := auth.uid(); end if;
  select id into v_id from public.conversations
   where (buyer_id = v_buyer and provider_id = v_prov) or (buyer_id = v_prov and provider_id = v_buyer)
   limit 1;
  if v_id is null then
    insert into public.conversations(buyer_id, provider_id) values (v_buyer, v_prov) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.after_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message = left(new.body, 140), last_message_at = new.created_at,
         buyer_unread = case when new.sender_id = buyer_id then buyer_unread else buyer_unread + 1 end,
         provider_unread = case when new.sender_id = provider_id then provider_unread else provider_unread + 1 end
   where id = new.conversation_id;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.after_message_insert();

create or replace function public.mark_conversation_read(p_conv uuid) returns void
language sql security definer set search_path = public as $$
  update public.conversations
     set buyer_unread = case when buyer_id = auth.uid() then 0 else buyer_unread end,
         provider_unread = case when provider_id = auth.uid() then 0 else provider_unread end
   where id = p_conv and auth.uid() in (buyer_id, provider_id);
$$;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
create or replace function public.before_verification_insert() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_service() then
    new.user_id := auth.uid();
    new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null; new.reviewer_note := null;
  end if;
  if exists (select 1 from public.verifications where user_id = new.user_id and kind = new.kind and status = 'pending') then
    raise exception 'ALREADY_PENDING';
  end if;
  return new;
end $$;
create trigger verifications_before_insert before insert on public.verifications
  for each row execute function public.before_verification_insert();

create or replace function public.review_verification(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.verifications;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update public.verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewer_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'pending' returning * into v;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if p_approve then
    update public.profiles
       set verification_level = greatest(verification_level, case when v.kind = 'id' then 1 else 2 end)
     where id = v.user_id;
    perform public.notify(v.user_id, 'verification', 'You''re verified ✅', 'Umethibitishwa ✅',
      case when v.kind = 'id' then 'Your ID Verified badge is now live.' else 'Your Pro Verified badge is now live.' end,
      case when v.kind = 'id' then 'Beji yako ya Kitambulisho sasa inaonekana.' else 'Beji yako ya Pro Verified sasa inaonekana.' end,
      '/me');
  else
    perform public.notify(v.user_id, 'verification', 'Verification needs attention', 'Uthibitisho unahitaji marekebisho',
      coalesce(p_note, 'Please resubmit clearer documents.'), coalesce(p_note, 'Tafadhali tuma tena picha zilizo wazi.'), '/verify');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update public.profiles set suspended = p_suspended where id = p_user;
end $$;

create or replace function public.admin_stats() returns json
language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  select json_build_object(
    'users', (select count(*) from public.profiles),
    'providers', (select count(*) from public.provider_profiles),
    'pro_providers', (select count(*) from public.provider_profiles where is_pro and pro_until > now()),
    'open_jobs', (select count(*) from public.jobs where status = 'open'),
    'active_bookings', (select count(*) from public.bookings where status in ('funded','in_progress','delivered')),
    'escrow_held', (select coalesce(sum(amount),0) from public.bookings where status in ('funded','in_progress','delivered','disputed')),
    'gmv', (select coalesce(sum(amount),0) from public.bookings where status = 'completed'),
    'commission', (select coalesce(sum(commission_amount),0) from public.bookings where status = 'completed'),
    'subscription_revenue', (select coalesce(sum(amount),0) from public.payments where purpose = 'subscription' and status = 'success'),
    'pending_verifications', (select count(*) from public.verifications where status = 'pending'),
    'open_disputes', (select count(*) from public.disputes where status = 'open'),
    'by_county', (select coalesce(json_agg(t), '[]') from (
        select c.name, count(pp.id) providers from public.counties c
          left join public.profiles p on p.county_id = c.id
          left join public.provider_profiles pp on pp.id = p.id
         group by c.name having count(pp.id) > 0 order by 2 desc limit 10) t)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Provider search
-- ---------------------------------------------------------------------------
create or replace function public.search_providers(
  p_category smallint default null, p_county smallint default null, p_q text default null,
  p_remote boolean default null, p_verified boolean default false, p_sort text default 'recommended',
  p_limit int default 20, p_offset int default 0)
returns table(
  id uuid, full_name text, avatar_url text, county_id smallint, county_name text, town text,
  verification_level smallint, headline text, rate_kes int, rate_unit text, years_experience smallint,
  remote_ok boolean, available boolean, is_pro boolean, rating_avg numeric, rating_count int,
  jobs_completed int, category_ids smallint[])
language sql stable security definer set search_path = public as $$
  select pp.id, p.full_name, p.avatar_url, p.county_id, c.name, p.town, p.verification_level,
         pp.headline, pp.rate_kes, pp.rate_unit, pp.years_experience, pp.remote_ok, pp.available,
         (pp.is_pro and coalesce(pp.pro_until, now()) >= now()), pp.rating_avg, pp.rating_count, pp.jobs_completed,
         coalesce((select array_agg(pc.category_id) from public.provider_categories pc where pc.provider_id = pp.id), '{}')
    from public.provider_profiles pp
    join public.profiles p on p.id = pp.id
    left join public.counties c on c.id = p.county_id
   where not p.suspended and p.onboarded
     and (p_category is null or exists (select 1 from public.provider_categories pc
                                        where pc.provider_id = pp.id and pc.category_id = p_category))
     and (p_county is null or p.county_id = p_county or (coalesce(p_remote, false) and pp.remote_ok))
     and (p_remote is null or not p_remote or pp.remote_ok)
     and (not coalesce(p_verified,false) or p.verification_level >= 1)
     and (p_q is null or p_q = '' or pp.search @@ plainto_tsquery('simple', p_q)
          or p.full_name ilike '%' || p_q || '%' or pp.headline ilike '%' || p_q || '%')
   order by
     case when p_sort = 'rating' then pp.rating_avg end desc nulls last,
     case when p_sort = 'price_low' then pp.rate_kes end asc nulls last,
     case when p_sort = 'jobs' then pp.jobs_completed end desc nulls last,
     (pp.is_pro and coalesce(pp.pro_until, now()) >= now()) desc,
     pp.available desc,
     (pp.rating_avg * ln(pp.rating_count + 2)) + p.verification_level * 0.5 + ln(pp.jobs_completed + 1) desc,
     pp.created_at desc
   limit least(p_limit, 50) offset p_offset;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.counties enable row level security;
alter table public.categories enable row level security;
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_categories enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.favorites enable row level security;
alter table public.jobs enable row level security;
alter table public.quotes enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.verifications enable row level security;
alter table public.disputes enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;

create policy "read counties" on public.counties for select using (true);
create policy "read categories" on public.categories for select using (true);
create policy "admin categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "read settings" on public.platform_settings for select using (true);
create policy "admin settings" on public.platform_settings for update using (public.is_admin()) with check (public.is_admin());

create policy "read profiles" on public.profiles for select using (true);
create policy "update own profile" on public.profiles for update
  using (id = (select auth.uid()) or public.is_admin()) with check (id = (select auth.uid()) or public.is_admin());

create policy "own private" on public.profile_private for select using (user_id = (select auth.uid()) or public.is_admin());
create policy "update own private" on public.profile_private for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read providers" on public.provider_profiles for select using (true);
create policy "create own provider" on public.provider_profiles for insert with check (id = (select auth.uid()));
create policy "update own provider" on public.provider_profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read provider cats" on public.provider_categories for select using (true);
create policy "own provider cats ins" on public.provider_categories for insert with check (provider_id = (select auth.uid()));
create policy "own provider cats del" on public.provider_categories for delete using (provider_id = (select auth.uid()));

create policy "read portfolio" on public.portfolio_items for select using (true);
create policy "own portfolio ins" on public.portfolio_items for insert with check (provider_id = (select auth.uid()));
create policy "own portfolio del" on public.portfolio_items for delete using (provider_id = (select auth.uid()));

create policy "own favorites" on public.favorites for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read jobs" on public.jobs for select using (
  status = 'open' or buyer_id = (select auth.uid()) or public.is_admin()
  or exists (select 1 from public.quotes q where q.job_id = jobs.id and q.provider_id = (select auth.uid())));
create policy "create own jobs" on public.jobs for insert with check (buyer_id = (select auth.uid()) and status = 'open');
create policy "update own jobs" on public.jobs for update
  using (buyer_id = (select auth.uid())) with check (buyer_id = (select auth.uid()) and status in ('open','closed','cancelled','assigned'));

create policy "read quotes" on public.quotes for select using (
  provider_id = (select auth.uid()) or public.is_admin()
  or exists (select 1 from public.jobs j where j.id = quotes.job_id and j.buyer_id = (select auth.uid())));
create policy "create own quotes" on public.quotes for insert with check (provider_id = (select auth.uid()));

create policy "read own bookings" on public.bookings for select using (
  (select auth.uid()) in (buyer_id, provider_id) or public.is_admin());
create policy "read own booking events" on public.booking_events for select using (
  public.is_admin() or exists (select 1 from public.bookings b where b.id = booking_events.booking_id
                               and (select auth.uid()) in (b.buyer_id, b.provider_id)));

create policy "read own payments" on public.payments for select using (user_id = (select auth.uid()) or public.is_admin());
create policy "read own payouts" on public.payouts for select using (provider_id = (select auth.uid()) or public.is_admin());

create policy "read own conversations" on public.conversations for select using (
  (select auth.uid()) in (buyer_id, provider_id));
create policy "read own messages" on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = messages.conversation_id
          and (select auth.uid()) in (c.buyer_id, c.provider_id)));
create policy "send messages" on public.messages for insert with check (
  sender_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = messages.conversation_id
          and (select auth.uid()) in (c.buyer_id, c.provider_id)));

create policy "read reviews" on public.reviews for select using (true);
create policy "write own reviews" on public.reviews for insert with check (reviewer_id = (select auth.uid()));

create policy "read own verifications" on public.verifications for select using (user_id = (select auth.uid()) or public.is_admin());
create policy "submit verification" on public.verifications for insert with check (user_id = (select auth.uid()));

create policy "read own disputes" on public.disputes for select using (
  public.is_admin() or exists (select 1 from public.bookings b where b.id = disputes.booking_id
                               and (select auth.uid()) in (b.buyer_id, b.provider_id)));
create policy "admin disputes" on public.disputes for update using (public.is_admin()) with check (public.is_admin());

create policy "own notifications" on public.notifications for select using (user_id = (select auth.uid()));
create policy "read notifications" on public.notifications for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete notifications" on public.notifications for delete using (user_id = (select auth.uid()));

create policy "file reports" on public.reports for insert with check (reporter_id = (select auth.uid()));
create policy "admin reports" on public.reports for select using (public.is_admin());

-- Realtime
alter publication supabase_realtime add table public.messages, public.conversations, public.notifications,
  public.bookings, public.payments, public.quotes;
