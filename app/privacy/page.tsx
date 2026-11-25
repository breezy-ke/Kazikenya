"use client";

import { LegalPage } from "@/components/legal";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="25 November 2026"
      sections={[
        {
          h: "Who we are",
          p: [
            "KaziKenya is operated by Digital Craft Consultancy, the data controller for personal data processed through the app. We process personal data in line with the Kenya Data Protection Act, 2019 and the regulations of the Office of the Data Protection Commissioner (ODPC).",
          ],
        },
        {
          h: "What we collect",
          p: [
            "Account data: name, phone number, email (if you use email or Google sign-in), county, town and profile photo.",
            "Provider data: services, rates, skills, portfolio photos and M-Pesa payout number.",
            "Verification data (optional): national ID number, ID photos, selfie and professional certificates.",
            "Activity data: jobs, quotes, bookings, messages, reviews and payment records (amount, M-Pesa receipt, status). We never see or store your M-Pesa PIN.",
          ],
        },
        {
          h: "Why we use it",
          p: [
            "To run the marketplace (matching, bookings, chat and notifications), to process M-Pesa payments, escrow and payouts, to verify identities and prevent fraud, to resolve disputes, to provide support, and to meet legal obligations such as tax and anti-money-laundering requirements.",
          ],
        },
        {
          h: "Who can see your data",
          p: [
            "Your public profile (name, photo, county/town, services, ratings and reviews) is visible to other users. Your phone number is only shared with the other party after payment for a booking is secured in escrow.",
            "Verification documents are stored encrypted in a private bucket and are only accessible to our verification team.",
            "We share data with service providers that help us run KaziKenya: Supabase (hosting and database), Safaricom (M-Pesa payments), Africa's Talking (SMS codes) and Google (optional sign-in). We do not sell personal data.",
          ],
        },
        {
          h: "How long we keep it",
          p: [
            "We keep account data while your account is active. Payment records are kept for 7 years as required by Kenyan tax law. Verification documents are deleted within 90 days after review unless needed for an open fraud or dispute case.",
          ],
        },
        {
          h: "Your rights",
          p: [
            "Under the Data Protection Act you can request access to, correction of, or deletion of your personal data, object to processing, and request data portability. Email support@kazikenya.co.ke from your registered phone or email. You can also lodge a complaint with the ODPC (www.odpc.go.ke).",
            "To delete your account and data, use Account → Edit profile → Delete account, or email us. We will complete deletion within 30 days, except records we must legally keep.",
          ],
        },
        {
          h: "Security",
          p: [
            "Data is encrypted in transit (TLS) and at rest. Access is restricted by row-level security so users can only read their own private data. Report a security issue to support@kazikenya.co.ke.",
          ],
        },
      ]}
    />
  );
}
