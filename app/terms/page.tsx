"use client";

import { LegalPage } from "@/components/legal";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="25 November 2026"
      sections={[
        {
          h: "1. About KaziKenya",
          p: [
            "KaziKenya (\"we\", \"us\") is an online marketplace operated by Digital Craft Consultancy that connects people who need services (\"Clients\") with independent service providers (\"Providers\") across Kenya's 47 counties.",
            "We are not a party to the agreement between a Client and a Provider and we do not employ Providers. Providers are independent and responsible for the quality, safety and legality of their work.",
          ],
        },
        {
          h: "2. Accounts",
          p: [
            "You must be at least 18 years old and provide accurate information, including your real name and a working phone number. You are responsible for activity on your account. One person may hold one account.",
            "We may suspend accounts that break these terms, provide false documents, harass other users or attempt to take payments outside the platform.",
          ],
        },
        {
          h: "3. Payments and escrow",
          p: [
            "Clients pay for bookings through M-Pesa into KaziKenya escrow. Funds are held until the Client confirms the job is complete, or automatically released after the auto-release period shown in the app if no problem is reported.",
            "When funds are released, the Provider receives the job amount less the KaziKenya service fee (currently 7%), sent to their registered M-Pesa number. Pro subscriptions are billed per 30-day period via M-Pesa and are non-refundable once activated.",
            "Paying or accepting payment for a KaziKenya booking outside the platform removes your escrow protection and may lead to account suspension.",
          ],
        },
        {
          h: "4. Cancellations and disputes",
          p: [
            "Either party may cancel a booking before payment is secured in escrow at no cost. After funding, either party can report a problem; payment is then frozen while our team reviews messages, photos and the booking history.",
            "Our team aims to resolve disputes within 24 hours (business days) and may release funds to the Provider, refund the Client, or split the outcome where appropriate. Our decision on escrowed funds is final for the purposes of the platform, without affecting your statutory rights.",
          ],
        },
        {
          h: "5. Verification and reviews",
          p: [
            "ID Verified and Pro Verified badges mean documents were reviewed by our team at a point in time; they are not a guarantee of future conduct. Reviews must be honest and relate to a real completed booking. We may remove reviews that are fake, abusive or irrelevant.",
          ],
        },
        {
          h: "6. Prohibited use",
          p: [
            "You may not use KaziKenya for illegal services, to post misleading jobs or profiles, to discriminate, to spam, or to collect other users' personal data for unrelated purposes.",
          ],
        },
        {
          h: "7. Liability",
          p: [
            "To the extent permitted by Kenyan law, KaziKenya is not liable for loss or damage arising from services performed by Providers. Our total liability to you in connection with a booking is limited to the fees we earned on that booking.",
          ],
        },
        {
          h: "8. Governing law",
          p: ["These terms are governed by the laws of Kenya. Disputes shall be subject to the jurisdiction of the courts of Kenya."],
        },
      ]}
    />
  );
}
