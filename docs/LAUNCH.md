# Launch checklist

Everything below is configuration you do once in dashboards — no code changes needed.

## 1. Host the web app (≈10 min)

1. Import the GitHub repo into **Vercel** (free tier is fine to start).
2. Add environment variables (same as `.env.example`), with `NEXT_PUBLIC_SITE_URL=https://kazikenya.co.ke`.
3. Point your domain (e.g. `kazikenya.co.ke` from a KENIC registrar) at Vercel.

## 2. Supabase Auth (project `kazikenya`)

Dashboard → **Authentication**:

- **URL Configuration** → Site URL `https://kazikenya.co.ke`; Redirect URLs: `https://kazikenya.co.ke/auth/callback`, `http://localhost:3000/auth/callback`.
- **Providers → Phone**: enable.
- **Hooks → Send SMS hook**: HTTPS → `https://kfnelxnsuejinrcceeap.supabase.co/functions/v1/sms-hook`. Copy the generated secret.
- **Providers → Google**: create an OAuth client in Google Cloud Console (Web application, redirect URI `https://kfnelxnsuejinrcceeap.supabase.co/auth/v1/callback`) and paste the client ID/secret.
- **Email**: set up custom SMTP (e.g. Resend, Zoho) — the built-in sender is rate-limited and only for testing.

## 3. Africa's Talking SMS (login codes)

1. Create an account at africastalking.com, top up, and (recommended) register a Sender ID "KAZIKENYA".
2. Supabase → **Edge Functions → Secrets**: `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` (optional), `SEND_SMS_HOOK_SECRET` (from step 2).
3. Test: `AT_USERNAME=sandbox` + the AT simulator.

Cost guide: ~KES 0.80 per SMS.

## 4. M-Pesa (Daraja)

**Sandbox (test now, free):** create an app at developer.safaricom.co.ke with *Lipa Na M-Pesa Sandbox* and *M-Pesa Sandbox (B2C)*. Add secrets:

| Secret | Value |
|---|---|
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | from your Daraja app |
| `MPESA_ENV` | `sandbox` |

Shortcode `174379` and the public sandbox passkey are built in. Payments switch from demo to real sandbox STK pushes immediately.

**Production (real money):**

1. Register the business (eCitizen / BRS) and apply for a **Paybill** (or Till) with Safaricom, plus a **B2C** shortcode for payouts.
2. Go live on Daraja for both APIs.
3. Secrets: `MPESA_ENV=production`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`; for a Till also `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` and `MPESA_PARTY_B=<till>`.
4. Payouts: `MPESA_B2C_SHORTCODE`, `MPESA_B2C_INITIATOR`, `MPESA_B2C_SECURITY_CREDENTIAL` (the initiator password encrypted with Safaricom's certificate).

Without B2C secrets, payouts stay "pending"; pay providers manually and record the M-Pesa code in **Admin → Payouts → Mark paid**.

Callbacks are verified with a secret token derived from the service key; set `MPESA_CALLBACK_TOKEN` to override.

## 5. Make yourself admin

Sign up in the app, then in Supabase SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com' or phone = '2547XXXXXXXX');
```

Account → **Admin dashboard** appears.

## 6. Legal & compliance (Kenya)

- Register as a data controller/processor with the **ODPC** (Data Protection Act 2019) — required for platforms processing ID data.
- Escrow handling: talk to Safaricom/your bank about holding client funds; many marketplaces start with a dedicated trust account.
- Review `/terms` and `/privacy` with a lawyer and update the operator name/contacts.
- KRA: commission and Pro subscriptions are taxable revenue; the admin dashboard totals both.

## 7. Cold start (getting the first 4.8★ reviews)

- Recruit **20–50 founding providers per launch county** (start with Nairobi, Kiambu, Mombasa) — verify them personally, give them 3 months of free Pro.
- Seed demand via estate WhatsApp groups, churches, chamas and landlords/property managers.
- The app asks happy clients (4–5★ booking reviews) to rate it on the Play Store; respond to every Play review within 24h.
