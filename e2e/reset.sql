-- Reset the two E2E test accounts (ids aaaaaaaa-…) to a fresh, un-onboarded state.
delete from public.reviews where reviewer_id::text like 'aaaaaaaa-%';
delete from public.payouts where provider_id::text like 'aaaaaaaa-%';
delete from public.payments where user_id::text like 'aaaaaaaa-%';
delete from public.disputes where raised_by::text like 'aaaaaaaa-%';
delete from public.bookings where buyer_id::text like 'aaaaaaaa-%' or provider_id::text like 'aaaaaaaa-%';
delete from public.jobs where buyer_id::text like 'aaaaaaaa-%';
delete from public.conversations where buyer_id::text like 'aaaaaaaa-%';
delete from public.notifications where user_id::text like 'aaaaaaaa-%';
delete from public.portfolio_items where provider_id::text like 'aaaaaaaa-%';
delete from public.provider_profiles where id::text like 'aaaaaaaa-%';
update public.profiles set onboarded = false, full_name = '', county_id = null, town = null, is_provider = false, locale = 'en'
 where id::text like 'aaaaaaaa-%';
