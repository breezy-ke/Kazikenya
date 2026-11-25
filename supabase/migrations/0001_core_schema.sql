-- KaziKenya core schema
-- Marketplace linking service buyers and providers across Kenya's 47 counties.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.counties (
  id smallint primary key,            -- official county code 1..47
  name text not null unique
);

create table public.categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name_en text not null,
  name_sw text not null,
  icon text not null default 'wrench',  -- lucide icon name
  kind text not null default 'local' check (kind in ('local','remote')),
  sort smallint not null default 100
);

create table public.platform_settings (
  id boolean primary key default true check (id),   -- single row
  commission_rate numeric(5,4) not null default 0.07,
  pro_price_kes integer not null default 299,
  pro_days integer not null default 30,
  free_quotes_per_month integer not null default 10,
  auto_release_hours integer not null default 72,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings default values;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  county_id smallint references public.counties(id),
  town text,
  locale text not null default 'en' check (locale in ('en','sw')),
  is_provider boolean not null default false,
  is_admin boolean not null default false,
  verification_level smallint not null default 0,  -- 0 phone/email, 1 ID verified, 2 Pro verified
  onboarded boolean not null default false,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contact details are private: only the owner, admins, and (via RPC) a booked counterpart see them.
create table public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  email text,
  mpesa_phone text
);

create table public.provider_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  headline text not null default '',
  about text not null default '',
  rate_kes integer,                       -- typical starting price
  rate_unit text not null default 'job' check (rate_unit in ('job','hour','day')),
  years_experience smallint not null default 0,
  skills text[] not null default '{}',
  remote_ok boolean not null default false,
  available boolean not null default true,
  is_pro boolean not null default false,
  pro_until timestamptz,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  jobs_completed integer not null default 0,
  quotes_month date not null default date_trunc('month', now())::date,
  quotes_used integer not null default 0,
  search tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index provider_profiles_search_idx on public.provider_profiles using gin (search);

create table public.provider_categories (
  provider_id uuid references public.provider_profiles(id) on delete cascade,
  category_id smallint references public.categories(id) on delete cascade,
  primary key (provider_id, category_id)
);
create index provider_categories_cat_idx on public.provider_categories(category_id);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  image_url text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid references public.profiles(id) on delete cascade,
  provider_id uuid references public.provider_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, provider_id)
);

-- ---------------------------------------------------------------------------
-- Jobs & quotes (post-and-quote mode)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  category_id smallint not null references public.categories(id),
  title text not null check (char_length(title) between 5 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  county_id smallint references public.counties(id),
  town text,
  is_remote boolean not null default false,
  budget_min integer check (budget_min >= 0),
  budget_max integer check (budget_max >= 0),
  urgency text not null default 'flexible' check (urgency in ('asap','this_week','flexible')),
  photos text[] not null default '{}',
  status text not null default 'open' check (status in ('open','assigned','closed','cancelled')),
  quotes_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_open_idx on public.jobs(status, category_id, county_id, created_at desc);
create index jobs_buyer_idx on public.jobs(buyer_id, created_at desc);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  amount integer not null check (amount between 50 and 10000000),
  message text not null default '' check (char_length(message) <= 2000),
  eta_days smallint not null default 1 check (eta_days between 0 and 365),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique (job_id, provider_id)
);
create index quotes_provider_idx on public.quotes(provider_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Bookings (the contract + escrow lifecycle)
-- requested -> awaiting_payment -> funded -> in_progress -> delivered -> completed
--           \-> declined          \-> cancelled  (any pre-funded)   \-> disputed -> completed/refunded
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  buyer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.provider_profiles(id),
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  category_id smallint references public.categories(id),
  title text not null,
  description text not null default '',
  amount integer not null check (amount between 50 and 10000000),
  county_id smallint references public.counties(id),
  town text,
  scheduled_for date,
  status text not null default 'requested' check (status in
    ('requested','declined','awaiting_payment','funded','in_progress','delivered','completed','cancelled','disputed','refunded')),
  commission_rate numeric(5,4) not null default 0.07,
  commission_amount integer,
  payout_amount integer,
  funded_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> provider_id)
);
create index bookings_buyer_idx on public.bookings(buyer_id, created_at desc);
create index bookings_provider_idx on public.bookings(provider_id, created_at desc);

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events(booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Money: M-Pesa payments (in) and payouts (out). Written only by edge functions (service role).
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  purpose text not null check (purpose in ('escrow','subscription')),
  amount integer not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending','success','failed','cancelled')),
  merchant_request_id text,
  checkout_request_id text unique,
  mpesa_receipt text,
  result_code integer,
  result_desc text,
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_user_idx on public.payments(user_id, created_at desc);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  provider_id uuid not null references public.profiles(id),
  kind text not null default 'payout' check (kind in ('payout','refund')),
  amount integer not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending','processing','success','failed')),
  conversation_id text,
  originator_conversation_id text unique,
  mpesa_receipt text,
  result_desc text,
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payouts_provider_idx on public.payouts(provider_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  last_message text,
  last_message_at timestamptz not null default now(),
  buyer_unread integer not null default 0,
  provider_unread integer not null default 0,
  created_at timestamptz not null default now(),
  unique (buyer_id, provider_id),
  check (buyer_id <> provider_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conv_idx on public.messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Trust
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1500),
  created_at timestamptz not null default now(),
  unique (booking_id, reviewer_id)
);
create index reviews_reviewee_idx on public.reviews(reviewee_id, created_at desc);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('id','pro')),
  id_number text,
  doc_front_path text,
  doc_back_path text,
  selfie_path text,
  cert_path text,
  cert_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index verifications_status_idx on public.verifications(status, created_at);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  raised_by uuid not null references public.profiles(id),
  reason text not null check (reason in ('not_done','poor_quality','no_show','overcharge','other')),
  details text not null default '',
  status text not null default 'open' check (status in ('open','resolved_provider','resolved_buyer')),
  resolution_note text,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, read, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  target_job_id uuid references public.jobs(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
