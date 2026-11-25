# KaziKenya

**Trusted fundis & freelancers in all 47 counties — paid safely via M-Pesa escrow.**

KaziKenya links people who need work done (clients) with service providers (fundis, cleaners, mama fua, mechanics, tutors, designers, developers…) anywhere in Kenya. It is a mobile-first installable web app (PWA) that ships to the Google Play Store as a Trusted Web Activity.

## Features

| Area | What it does |
|---|---|
| Matching | **Post & quote** (client posts a job, nearby pros quote) and **browse & book** (search pros by service, county, rating, price) |
| Payments | Lipa na M-Pesa STK push → **escrow** → release on confirmation (or auto-release after 72h) → B2C payout to the provider minus **7%** commission |
| Monetisation | 7% commission + **KaziKenya Pro** (KES 299/month): unlimited quotes (free = 10/month), PRO badge, top placement |
| Trust | Tiered badges: phone → **ID Verified** (ID + selfie, admin-reviewed) → **Pro Verified** (certificates); ratings & reviews; disputes with payment freeze; phone numbers hidden until escrow is funded; anti-off-platform warnings in chat |
| Comms | Realtime chat, in-app notifications (bilingual), job alerts to matching providers, browser/Android notifications |
| Reach | All 47 counties, **English + Kiswahili**, light/dark mode, works on slow 3G, offline fallback, images compressed client-side to save bundles |
| Admin | Stats dashboard, verification review, dispute resolution, payout processing, user suspension, platform settings (commission, Pro price, quotas) |

## Stack

- **Next.js 16** (App Router, React 19) + **Tailwind CSS 4**, TanStack Query, lucide icons
- **Supabase**: Postgres with row-level security on every table, Auth (phone OTP, Google, email), Realtime, Storage, Edge Functions, pg_cron
- **M-Pesa Daraja** (STK Push + B2C) via the `mpesa` edge function
- **Africa's Talking** SMS for login codes via the `sms-hook` edge function
- Play Store packaging with **Bubblewrap (TWA)**

```
app/                 screens (one folder per route)
components/          UI kit, shell, cards, M-Pesa sheet
lib/                 supabase client, auth, i18n dictionary (EN/SW), queries, utils
supabase/migrations  database schema, security and business logic (applied in order)
supabase/functions   mpesa (payments/escrow/payouts), sms-hook (Africa's Talking)
e2e/                 end-to-end smoke test (Playwright)
docs/                launch & Play Store guides
```

## Run locally

```bash
cp .env.example .env.local     # already points at the live "kazikenya" Supabase project
npm install
npm run dev                    # http://localhost:3000
```

`npm run build && npm start` for a production build. `npm run icons` regenerates app icons.

## Money flow (escrow state machine)

```
requested ─▶ awaiting_payment ─▶ funded ─▶ in_progress ─▶ delivered ─▶ completed
   │  (provider accepts)   │ (M-Pesa)         (provider)    (provider)  (client confirms / 72h auto)
   └▶ declined             └▶ cancelled                └──────▶ disputed ─▶ completed | refunded (admin)
```

All transitions are enforced in Postgres functions (`accept_quote`, `request_booking`, `respond_booking`, `start_booking`, `mark_delivered`, `open_dispute`, `release_booking`, `refund_booking`) — the app cannot skip a step or move money directly.

## Going live

See **[docs/LAUNCH.md](docs/LAUNCH.md)** (Supabase auth, SMS, M-Pesa keys, hosting, first admin) and **[docs/PLAY_STORE.md](docs/PLAY_STORE.md)** (Android packaging & listing).

Until Daraja keys are added, payments run in **demo mode**: they succeed instantly, are flagged `simulated`, and the app shows "Demo mode — no real money moves".

## Testing

`e2e/full-flow.mjs` drives two browsers (client + provider) on a Pixel 7 viewport through the whole loop: onboarding → provider setup → job post → job alert → quote → accept → M-Pesa escrow → start → done → release → review → payout → Kiswahili/dark mode.

```bash
npm run build && npx next start -p 3100 &
BASE=http://localhost:3100 E2E_PASSWORD=… node e2e/full-flow.mjs
```

It needs two confirmed email/password test users; `e2e/reset.sql` resets them.
