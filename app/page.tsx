"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Bell, BadgeCheck, ChevronRight, Crown, HandCoins, Lock, Search, ShieldCheck, Star, Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { BOOKING_SELECT, useBadges, useCategories, useProviderSearch } from "@/lib/queries";
import { countyName } from "@/lib/data";
import { firstName, formatKES } from "@/lib/utils";
import type { Booking, MiniProfile } from "@/lib/types";
import { AppShell, Fab } from "@/components/shell";
import { ButtonLink, Card, IconButton, SectionHeader, Skeleton } from "@/components/ui";
import { Avatar, CategoryTile, Logo, StatusBadge } from "@/components/bits";
import { ProviderMiniCard } from "@/components/provider-card";
import { JobCard, JobCardSkeleton, useJobFeed } from "@/components/job-card";

function SearchBox({ big }: { big?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/explore${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
      className={`flex items-center gap-2 rounded-2xl bg-surface p-1.5 pl-4 shadow-[var(--shadow-float)] ${big ? "h-16" : "h-14"}`}
    >
      <Search className="size-5 shrink-0 text-muted" aria-hidden />
      <input
        aria-label={t("common.search")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("landing.searchPh")}
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
        enterKeyHint="search"
      />
      <button type="submit" className="flex h-full items-center rounded-xl bg-accent px-4 font-bold text-white transition hover:bg-accent-strong active:scale-95">
        {t("common.search")}
      </button>
    </form>
  );
}

function CategoryGrid() {
  const { t, catName } = useI18n();
  const { data, isLoading } = useCategories();
  const local = (data ?? []).filter((c) => c.kind === "local").slice(0, 7);
  return (
    <section className="mt-7">
      <SectionHeader
        title={t("home.categories")}
        action={
          <Link href="/explore" className="text-sm font-semibold text-brand">
            {t("common.seeAll")}
          </Link>
        }
      />
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="mx-auto aspect-square w-16 rounded-2xl" />)
          : local.map((c, i) => (
              <Link key={c.id} href={`/explore?cat=${c.id}`} className="group flex flex-col items-center gap-1.5 text-center">
                <CategoryTile icon={c.icon} index={i} className="size-16 transition group-active:scale-95" />
                <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-ink-2">{catName(c)}</span>
              </Link>
            ))}
        {!isLoading && (
          <Link href="/explore" className="group flex flex-col items-center gap-1.5 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl border-2 border-dashed border-line text-muted transition group-active:scale-95">
              <ArrowRight className="size-6" aria-hidden />
            </span>
            <span className="text-[12px] font-semibold leading-tight text-ink-2">{t("common.seeAll")}</span>
          </Link>
        )}
      </div>
    </section>
  );
}

function RemoteRow() {
  const { t, catName } = useI18n();
  const { data } = useCategories();
  const remote = (data ?? []).filter((c) => c.kind === "remote");
  if (!remote.length) return null;
  return (
    <section className="mt-8">
      <SectionHeader title={t("home.remote")} />
      <div className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
        {remote.map((c, i) => (
          <Link
            key={c.id}
            href={`/explore?cat=${c.id}&remote=1`}
            className="flex shrink-0 snap-start items-center gap-2.5 rounded-2xl border border-line/70 bg-surface py-2 pl-2 pr-4 shadow-[var(--shadow-card)]"
          >
            <CategoryTile icon={c.icon} index={i + 2} className="size-10" />
            <span className="text-sm font-semibold">{catName(c)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TopProviders({ county }: { county: number | null }) {
  const { t } = useI18n();
  const near = useProviderSearch({ county, limit: 10 }, true);
  const fallback = useProviderSearch({ limit: 10 }, !!county && near.data?.length === 0);
  const list = near.data?.length ? near.data : fallback.data ?? [];
  const title = near.data?.length && county ? t("home.topNear", { county: countyName(county) }) : t("home.topKenya");
  if (!near.isLoading && !list.length) return null;
  return (
    <section className="mt-8">
      <SectionHeader
        title={title}
        action={
          <Link href={`/explore${county ? `?county=${county}` : ""}`} className="text-sm font-semibold text-brand">
            {t("common.seeAll")}
          </Link>
        }
      />
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {near.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 w-40 shrink-0 rounded-[var(--radius-card)]" />)
          : list.map((p) => <ProviderMiniCard key={p.id} p={p} />)}
      </div>
    </section>
  );
}

type BookingWithPeople = Booking & { buyer: MiniProfile; provider: MiniProfile };

function ActiveBookings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["bookings", "active", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .or(`buyer_id.eq.${user!.id},provider_id.eq.${user!.id}`)
        .in("status", ["requested", "awaiting_payment", "funded", "in_progress", "delivered", "disputed"])
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as unknown as BookingWithPeople[];
    },
  });
  if (!data?.length) return null;
  return (
    <section className="mt-7">
      <SectionHeader
        title={t("home.active")}
        action={
          <Link href="/work" className="text-sm font-semibold text-brand">
            {t("common.seeAll")}
          </Link>
        }
      />
      <div className="space-y-2.5 px-4">
        {data.map((b) => {
          const other = b.buyer_id === user!.id ? b.provider : b.buyer;
          return (
            <Link key={b.id} href={`/bookings/${b.id}`} className="flex items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3 shadow-[var(--shadow-card)]">
              <Avatar src={other?.avatar_url} name={other?.full_name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{b.title}</p>
                <p className="truncate text-xs text-muted">
                  {other?.full_name} · {formatKES(b.amount)}
                </p>
              </div>
              <StatusBadge status={b.status} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ProviderDashboard() {
  const { t } = useI18n();
  const { user, profile, provider } = useAuth();
  const feed = useJobFeed(3);
  const { data: earned } = useQuery({
    queryKey: ["earned", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("payouts").select("amount").eq("provider_id", user!.id).eq("kind", "payout").eq("status", "success");
      return (data ?? []).reduce((s, r) => s + (r.amount as number), 0);
    },
  });
  if (!provider) return null;
  const proActive = provider.is_pro && provider.pro_until && new Date(provider.pro_until) > new Date();
  return (
    <>
      <section className="mt-6 px-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">{t("home.providerStats")}</h2>
            <Link href="/wallet" className="text-sm font-semibold text-brand">
              {t("me.wallet")}
            </Link>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line text-center">
            <div>
              <Wallet className="mx-auto mb-1 size-5 text-brand" aria-hidden />
              <p className="text-base font-extrabold">{formatKES(earned ?? 0, false)}</p>
              <p className="text-[11px] text-muted">{t("home.earnings")} (KES)</p>
            </div>
            <div>
              <Star className="mx-auto mb-1 size-5 fill-gold text-gold" aria-hidden />
              <p className="text-base font-extrabold">{provider.rating_count ? Number(provider.rating_avg).toFixed(1) : "—"}</p>
              <p className="text-[11px] text-muted">{t("home.rating")}</p>
            </div>
            <div>
              <HandCoins className="mx-auto mb-1 size-5 text-accent" aria-hidden />
              <p className="text-base font-extrabold">{provider.jobs_completed}</p>
              <p className="text-[11px] text-muted">{t("home.jobsDone")}</p>
            </div>
          </div>
        </Card>
        <div className="mt-3 space-y-2">
          {(profile?.verification_level ?? 0) < 1 && (
            <Link href="/verify" className="flex items-center gap-3 rounded-2xl bg-info-soft p-3.5 text-info">
              <BadgeCheck className="size-6 shrink-0" aria-hidden />
              <span className="flex-1 text-sm font-semibold">{t("home.verifyNudge")}</span>
              <ChevronRight className="size-5" aria-hidden />
            </Link>
          )}
          {!proActive && (
            <Link href="/wallet#pro" className="flex items-center gap-3 rounded-2xl bg-accent-soft p-3.5 text-accent-soft-ink">
              <Crown className="size-6 shrink-0" aria-hidden />
              <span className="flex-1 text-sm font-semibold">{t("home.goPro")}</span>
              <ChevronRight className="size-5" aria-hidden />
            </Link>
          )}
        </div>
      </section>
      <section className="mt-7">
        <SectionHeader
          title={t("home.jobsNear")}
          action={
            <Link href="/work?tab=feed" className="text-sm font-semibold text-brand">
              {t("common.seeAll")}
            </Link>
          }
        />
        <div className="space-y-3 px-4">
          {feed.isLoading ? (
            <JobCardSkeleton />
          ) : feed.data?.length ? (
            feed.data.map((j) => <JobCard key={j.id} job={j} />)
          ) : (
            <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">{t("jobs.feedEmpty")}</p>
          )}
        </div>
      </section>
    </>
  );
}

function SignedOutSections() {
  const { t } = useI18n();
  const steps = [
    { icon: Search, title: t("landing.how1t"), body: t("landing.how1b") },
    { icon: Lock, title: t("landing.how2t"), body: t("landing.how2b") },
    { icon: BadgeCheck, title: t("landing.how3t"), body: t("landing.how3b") },
  ];
  return (
    <>
      <section className="mt-10 px-4">
        <h2 className="text-xl font-extrabold tracking-tight">{t("landing.howTitle")}</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-4 rounded-[var(--radius-card)] border border-line/70 bg-surface p-4">
              <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-ink">
                <s.icon className="size-6" aria-hidden />
                <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
              </span>
              <div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-8 px-4">
        <div className="flex gap-4 rounded-[var(--radius-card)] bg-brand-soft p-5 text-brand-soft-ink">
          <ShieldCheck className="size-8 shrink-0" aria-hidden />
          <div>
            <h3 className="font-bold">{t("landing.trustTitle")}</h3>
            <p className="mt-1 text-sm leading-relaxed opacity-90">{t("landing.trustBody")}</p>
          </div>
        </div>
      </section>
      <section className="mt-8 px-4">
        <div className="hero-gradient relative overflow-hidden rounded-[28px] p-6 text-white">
          <div className="kente-dots absolute inset-0 opacity-50" aria-hidden />
          <div className="relative">
            <h3 className="text-xl font-extrabold">{t("landing.proTitle")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/85">{t("landing.proBody")}</p>
            <ButtonLink href="/login?next=/me/provider?setup=1" variant="accent" className="mt-5">
              {t("landing.becomePro")} <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </section>
      <footer className="mt-10 px-4 pb-6 text-center text-xs text-muted">
        <div className="flex justify-center gap-4 font-semibold">
          <Link href="/terms">{t("me.terms")}</Link>
          <Link href="/privacy">{t("me.privacy")}</Link>
        </div>
        <p className="mt-3">{t("landing.footer")}</p>
      </footer>
    </>
  );
}

export default function HomePage() {
  const { t } = useI18n();
  const { user, profile, provider, ready } = useAuth();
  const badges = useBadges();
  const router = useRouter();
  const signedIn = ready && !!user;

  useEffect(() => {
    if (signedIn && profile && !profile.onboarded) router.replace("/onboarding");
  }, [signedIn, profile, router]);

  return (
    <AppShell>
      <header className="hero-gradient relative overflow-hidden rounded-b-[32px] px-4 pb-8 pt-[max(env(safe-area-inset-top),14px)] text-white lg:mt-4 lg:rounded-[32px]">
        <div className="kente-dots absolute inset-0 opacity-40" aria-hidden />
        <div className="relative">
          <div className="flex h-12 items-center justify-between">
            <Logo light />
            {signedIn ? (
              <IconButton label={t("notif.title")} className="text-white hover:bg-white/10" onClick={() => router.push("/notifications")}>
                <Bell className="size-[22px]" />
                {badges.notifications > 0 && (
                  <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px]">
                    {badges.notifications > 9 ? "9+" : badges.notifications}
                  </span>
                )}
              </IconButton>
            ) : ready ? (
              <Link href="/login" className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/25">
                {t("common.signIn")}
              </Link>
            ) : null}
          </div>

          {signedIn ? (
            <div className="mt-5">
              <p className="text-sm font-medium text-white/75">{t("home.greeting", { name: firstName(profile?.full_name) || "" })} 👋</p>
              <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight">{t("home.whereTo")}</h1>
            </div>
          ) : (
            <div className="mt-6">
              <h1 className="max-w-md text-[32px] font-extrabold leading-[1.1] tracking-tight">{t("landing.heroTitle")}</h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/85">{t("landing.heroSub")}</p>
            </div>
          )}
          <div className="mt-5">
            <SearchBox big={!signedIn} />
          </div>
          {!signedIn && (
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              {[t("landing.stat1"), t("landing.stat2"), t("landing.stat3")].map((s) => (
                <span key={s} className="rounded-full bg-white/12 px-3 py-1.5 backdrop-blur">
                  ✓ {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {signedIn && <ActiveBookings />}
      {signedIn && provider && <ProviderDashboard />}
      <CategoryGrid />
      <TopProviders county={profile?.county_id ?? null} />
      <RemoteRow />

      <section className="mt-8 px-4">
        <Card className="flex items-center gap-4 p-5">
          <div className="flex-1">
            <h3 className="font-bold">{t("home.postCtaTitle")}</h3>
            <p className="mt-1 text-sm text-muted">{t("home.postCtaBody")}</p>
          </div>
          <ButtonLink href="/jobs/new" variant="accent" size="sm" className="shrink-0">
            {t("nav.postJob")}
          </ButtonLink>
        </Card>
      </section>

      {!signedIn && ready && <SignedOutSections />}
      {signedIn && <Fab href="/jobs/new" label={t("nav.postJob")} />}
    </AppShell>
  );
}
