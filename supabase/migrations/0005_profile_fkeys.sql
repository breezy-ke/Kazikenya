-- Direct FKs to profiles so the API can embed provider name/avatar on bookings and quotes.
alter table public.bookings
  add constraint bookings_provider_profile_fkey foreign key (provider_id) references public.profiles(id);
alter table public.quotes
  add constraint quotes_provider_profile_fkey foreign key (provider_id) references public.profiles(id) on delete cascade;
create index if not exists quotes_job_idx on public.quotes(job_id);
create index if not exists portfolio_provider_idx on public.portfolio_items(provider_id);
create index if not exists payments_booking_idx on public.payments(booking_id);
create index if not exists payouts_booking_idx on public.payouts(booking_id);
create index if not exists disputes_raised_idx on public.disputes(raised_by);
create index if not exists conversations_provider_idx on public.conversations(provider_id);
create index if not exists messages_sender_idx on public.messages(sender_id);
create index if not exists reviews_reviewer_idx on public.reviews(reviewer_id);
create index if not exists verifications_user_idx on public.verifications(user_id);
create index if not exists favorites_provider_idx on public.favorites(provider_id);
