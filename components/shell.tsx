"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, Briefcase, Compass, Home, MessageCircle, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useBadges } from "@/lib/queries";
import { IconButton, PageLoader } from "./ui";

const NAV = [
  { href: "/", key: "nav.home", icon: Home, match: (p: string) => p === "/" },
  { href: "/explore", key: "nav.explore", icon: Compass, match: (p: string) => p.startsWith("/explore") || p.startsWith("/p/") },
  { href: "/work", key: "nav.work", icon: Briefcase, match: (p: string) => p.startsWith("/work") || p.startsWith("/bookings") || p.startsWith("/jobs") },
  { href: "/inbox", key: "nav.inbox", icon: MessageCircle, match: (p: string) => p.startsWith("/inbox") },
  { href: "/me", key: "nav.me", icon: UserRound, match: (p: string) => p.startsWith("/me") || p.startsWith("/wallet") || p.startsWith("/verify") },
] as const;

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const { user } = useAuth();
  const badges = useBadges();
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface/92 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {NAV.map((item) => {
          const active = item.match(path);
          const Icon = item.icon;
          const count = item.href === "/inbox" && user ? badges.messages : 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition",
                  active ? "text-brand" : "text-muted",
                )}
              >
                <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-full transition", active && "bg-brand-soft")}>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  {count > 0 && (
                    <span className="absolute right-2 top-0 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] leading-[18px] text-white">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop side rail so the app also feels native on laptops/tablets. */
export function SideRail() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 px-2">
        <span className="inline-flex items-center gap-2 text-[19px] font-extrabold">
          Kazi<span className="text-accent">Kenya</span>
        </span>
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match(path);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition",
                active ? "bg-brand-soft text-brand-soft-ink" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/jobs/new"
        className="mt-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-white hover:bg-accent-strong"
      >
        <Plus className="size-5" aria-hidden /> {t("nav.postJob")}
      </Link>
    </aside>
  );
}

export function AppShell({ children, hideNav }: { children: React.ReactNode; hideNav?: boolean }) {
  return (
    <div className="flex min-h-dvh">
      <SideRail />
      <div className="min-w-0 flex-1">
        <main className={cn("mx-auto w-full max-w-2xl", !hideNav && "pb-24 lg:pb-10")}>{children}</main>
        {!hideNav && <BottomNav />}
      </div>
    </div>
  );
}

export function TopBar({
  title,
  back = true,
  right,
  sub,
  transparent,
}: {
  title?: string;
  back?: boolean | string;
  right?: React.ReactNode;
  sub?: string;
  transparent?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <header
      className={cn(
        "safe-top sticky top-0 z-30",
        transparent ? "bg-transparent" : "border-b border-line/60 bg-bg/90 backdrop-blur-xl",
      )}
    >
      <div className="flex h-14 items-center gap-1 px-2">
        {back && (
          <IconButton
            label={t("common.back")}
            onClick={() => {
              if (typeof back === "string") router.push(back);
              else if (window.history.length > 1) router.back();
              else router.push("/");
            }}
          >
            <ArrowLeft className="size-[22px]" />
          </IconButton>
        )}
        <div className={cn("min-w-0 flex-1", !back && "pl-3")}>
          {title && <h1 className="truncate text-[17px] font-bold leading-tight">{title}</h1>}
          {sub && <p className="truncate text-xs text-muted">{sub}</p>}
        </div>
        {right && <div className="flex items-center gap-1 pr-1">{right}</div>}
      </div>
    </header>
  );
}

/** Gate a page behind sign-in + onboarding. */
export function RequireAuth({ children, allowUnonboarded }: { children: React.ReactNode; allowUnonboarded?: boolean }) {
  const { ready, user, profile, profileLoading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(path)}`);
    } else if (!allowUnonboarded && profile && !profile.onboarded) {
      router.replace(`/onboarding?next=${encodeURIComponent(path)}`);
    }
  }, [ready, user, profile, router, path, allowUnonboarded]);

  if (!ready || !user || profileLoading || (!allowUnonboarded && profile && !profile.onboarded)) return <PageLoader />;
  return <>{children}</>;
}

export function Fab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-accent pl-4 pr-5 font-bold text-white shadow-[var(--shadow-float)] transition hover:bg-accent-strong active:scale-95 lg:hidden"
    >
      <Plus className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
