import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { themeInitScript } from "@/lib/theme";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kazikenya.co.ke";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "KaziKenya — Trusted fundis & freelancers in all 47 counties", template: "%s · KaziKenya" },
  description:
    "Find verified plumbers, electricians, cleaners, mama fua, mechanics, tutors, designers and developers anywhere in Kenya. Get quotes, chat, and pay safely with M-Pesa escrow.",
  applicationName: "KaziKenya",
  keywords: ["fundi", "Kenya jobs", "plumber Nairobi", "mama fua", "M-Pesa", "freelance Kenya", "kazi"],
  appleWebApp: { capable: true, statusBarStyle: "default", title: "KaziKenya" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "KaziKenya",
    title: "KaziKenya — Get it done by trusted local pros",
    description: "Verified fundis & freelancers in all 47 counties. Pay safely with M-Pesa escrow.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0a120e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kfnelxnsuejinrcceeap.supabase.co"} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
