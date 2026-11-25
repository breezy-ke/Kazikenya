# Publishing KaziKenya on Google Play (Trusted Web Activity)

The Android app is a thin, native wrapper (TWA) around the hosted PWA: one codebase, instant updates, ~1 MB download.

## Prerequisites

- The site deployed on HTTPS at your domain (see LAUNCH.md).
- Google Play Console account (one-time USD 25). Register as an **organisation** with your business D-U-N-S number.
- Node 18+, JDK 17 and the Android SDK (Bubblewrap can install them for you).

## 1. Generate the Android project

```bash
npm i -g @bubblewrap/cli
mkdir android && cd android
bubblewrap init --manifest https://kazikenya.co.ke/manifest.webmanifest
# or reuse the prepared config:
cp ../twa-manifest.json . && bubblewrap update
```

Keep package id `ke.co.kazikenya.app` (it is referenced by the "Rate KaziKenya" link). Create the signing key when prompted and **back up `android.keystore` and its passwords** (never commit them — they're git-ignored).

## 2. Build

```bash
bubblewrap build        # → app-release-bundle.aab (+ test APK)
```

Install `app-release-signed.apk` on a phone to test.

## 3. Digital Asset Links (removes the browser URL bar)

1. Play Console → your app → **Setup → App integrity → App signing** → copy the **SHA-256 certificate fingerprint**.
2. Put it in `public/.well-known/assetlinks.json` (replace the placeholder; you can list both upload and Play signing fingerprints), then deploy.
3. Verify: `https://kazikenya.co.ke/.well-known/assetlinks.json` loads, and the installed app shows no URL bar.

## 4. Store listing

| Field | Suggestion |
|---|---|
| App name | KaziKenya: Fundis & Freelancers |
| Short description (80) | Hire trusted fundis near you. Pay safely with M-Pesa escrow. All 47 counties. |
| Category | Business (or Lifestyle) |
| Icon | `public/icons/play-store-512.png` |
| Feature graphic | 1024×500 — adapt `public/og.png` |
| Screenshots | 4–8 phone screenshots (home, explore, provider profile, quotes, M-Pesa pay, chat, Kiswahili). Use real or clearly-demo accounts, not "(Test)" names. |
| Privacy policy | `https://kazikenya.co.ke/privacy` |
| Account deletion URL | `https://kazikenya.co.ke/privacy` (section "Your rights") |

**Data safety form:** collects name, phone, email, approximate location (county/town), photos, government ID (optional, verification), financial info (payment records, not card numbers), messages. Encrypted in transit; users can request deletion.

**Financial features declaration:** declare that the app facilitates payments via M-Pesa (a licensed third party); KaziKenya does not offer loans.

## 5. Release

1. **Internal testing** track → upload the `.aab`, add 10–20 testers.
2. **Closed testing** with ≥12 testers for 14 days (required for new personal developer accounts).
3. **Production** — staged rollout 20% → 100%.

Updates to the website are live instantly; only rebuild the `.aab` when changing the app name, icons, package settings or `appVersionCode`.

## What drives a 4.8★ rating

- Cold start < 3 s on a mid-range Android over 3G (current Lighthouse mobile: Performance ~90, Accessibility 100, SEO 100).
- Never a blank screen: skeletons, offline page, retry buttons, clear errors in English & Kiswahili.
- Money safety is visible on every payment screen (escrow, receipts, dispute button).
- In-app review prompt fires only after a successful 4–5★ booking.
- Reply to every Play review within 24 hours; fix 1–2★ issues first.
