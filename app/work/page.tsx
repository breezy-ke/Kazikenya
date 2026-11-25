"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, ClipboardList, Inbox, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { BOOKING_SELECT, useCategoryMap } from "@/lib/queries";
import { formatKES, timeAgo } from "@/lib/utils";
import type { Booking, Job, MiniProfile } from "@/lib/types";
import { AppShell, Fab, RequireAuth } from "@/components/shell";
import { ButtonLink, Chip, EmptyState, PageLoader, Segmented, Skeleton } from "@/components/ui";
import { Avatar, StatusBadge } from "@/components/bits";
import { JobCard, JobCardSkeleton, useJobFeed } from "@/components/job-card";

type Tab = "bookings" | "posted" | "feed";
type BookingRow = Booking & { buyer: MiniProfile; provider: MiniProfile };

function BookingsList() {
  const { t, catName, locale } = useI18n();
  const { user, provider } = useAuth();
  const cats = useCategoryMap();
  const [role, setRole] = useState<"all" | "client" | "pro">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["bookings", "list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .or(`buyer_id.eq.${user!.id},provider_id.eq.${user!.id}`)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
  });

  const rows = (data ?? []).filter((b) => role === "all" || (role === "client" ? b.buyer_id === user!.id : b.provider_id === user!.id));

  return (
    <div>
      {provider && (
        <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
          <Chip active={role === "all"} onClick={() => setRole("all")}>
            {t("common.all")}
          </Chip>
          <Chip active={role === "client"} onClick={() => setRole("client")}>
            {t("work.asClient")}
          </Chip>
          <Chip active={role === "pro"} onClick={() => setRole("pro")}>
            {t("work.asPro")}
          </Chip>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="space-y-2.5">
          {rows.map((b) => {
            const asBuyer = b.buyer_id === user!.id;
            const other = asBuyer ? b.provider : b.buyer;
            const needsMe =
              (asBuyer && (b.status === "awaiting_payment" || b.status === "delivered")) ||
              (!asBuyer && (b.status === "requested" || b.status === "funded"));
            return (
              <li key={b.id}>
                <Link
                  href={`/bookings/${b.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3.5 shadow-[var(--shadow-card)] transition active:scale-[0.99]"
                >
                  <div className="relative">
                    <Avatar src={other?.avatar_url} name={other?.full_name} size={46} />
                    {needsMe && <span className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-surface bg-accent" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{b.title}</p>
                    <p className="truncate text-xs text-muted">
                      {asBuyer ? t("bk.provider") : t("bk.client")}: {other?.full_name} · {catName(cats.get(b.category_id ?? 0))}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{timeAgo(b.updated_at, locale)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-sm font-extrabold">{formatKES(b.amount)}</span>
                    <StatusBadge status={b.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Briefcase className="size-8" />}
          title={t("work.empty")}
          body={t("work.emptySub")}
          action={<ButtonLink href="/explore">{t("nav.explore")}</ButtonLink>}
        />
      )}
    </div>
  );
}

function PostedJobs() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-jobs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("buyer_id", user!.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Job[];
    },
  });
  if (isLoading)
    return (
      <div className="space-y-3">
        <JobCardSkeleton />
        <JobCardSkeleton />
      </div>
    );
  if (!data?.length)
    return (
      <EmptyState
        icon={<ClipboardList className="size-8" />}
        title={t("jobs.myEmpty")}
        body={t("jobs.myEmptySub")}
        action={
          <ButtonLink href="/jobs/new" variant="accent">
            {t("nav.postJob")}
          </ButtonLink>
        }
      />
    );
  return (
    <div className="space-y-3">
      {data.map((j) => (
        <JobCard key={j.id} job={j} showStatus />
      ))}
    </div>
  );
}

function Feed() {
  const { t } = useI18n();
  const { provider } = useAuth();
  const feed = useJobFeed(50);
  if (!provider)
    return (
      <EmptyState
        icon={<Search className="size-8" />}
        title={t("me.becomeProvider")}
        body={t("me.becomeProviderSub")}
        action={<ButtonLink href="/me/provider?setup=1">{t("pro.publish")}</ButtonLink>}
      />
    );
  if (feed.isLoading)
    return (
      <div className="space-y-3">
        <JobCardSkeleton />
        <JobCardSkeleton />
        <JobCardSkeleton />
      </div>
    );
  if (!feed.data?.length)
    return (
      <EmptyState
        icon={<Inbox className="size-8" />}
        title={t("jobs.feedEmpty")}
        body={t("jobs.feedEmptySub")}
        action={
          <ButtonLink href="/me/provider" variant="outline">
            {t("me.providerProfile")}
          </ButtonLink>
        }
      />
    );
  return (
    <div className="space-y-3">
      {feed.data.map((j) => (
        <JobCard key={j.id} job={j} />
      ))}
    </div>
  );
}

function WorkInner() {
  const { t } = useI18n();
  const { provider } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (sp.get("tab") as Tab) || "bookings";
  const setTab = (v: Tab) => router.replace(`${pathname}?tab=${v}`, { scroll: false });

  const options: { value: Tab; label: string }[] = [
    { value: "bookings", label: t("work.bookings") },
    { value: "posted", label: t("work.posted") },
  ];
  if (provider) options.push({ value: "feed", label: t("work.feed") });

  return (
    <>
      <div className="safe-top sticky top-0 z-30 border-b border-line/60 bg-bg/92 px-4 pb-3 pt-3 backdrop-blur-xl">
        <h1 className="mb-3 text-[22px] font-extrabold tracking-tight">{t("work.title")}</h1>
        <Segmented value={tab} onChange={setTab} options={options} />
      </div>
      <div className="px-4 py-4">
        {tab === "bookings" && <BookingsList />}
        {tab === "posted" && <PostedJobs />}
        {tab === "feed" && <Feed />}
      </div>
      <Fab href="/jobs/new" label={t("nav.postJob")} />
    </>
  );
}

export default function WorkPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Suspense fallback={<PageLoader />}>
          <WorkInner />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
