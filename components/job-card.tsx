"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, MessageSquareQuote, Wifi, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCategoryMap } from "@/lib/queries";
import { countyName } from "@/lib/data";
import { formatKES, timeAgo } from "@/lib/utils";
import type { Job } from "@/lib/types";
import { Badge, Skeleton } from "./ui";
import { CategoryTile } from "./bits";

export function budgetText(j: Pick<Job, "budget_min" | "budget_max">, fallback: string) {
  if (j.budget_min && j.budget_max) return `${formatKES(j.budget_min)} – ${formatKES(j.budget_max, false)}`;
  if (j.budget_max) return `≤ ${formatKES(j.budget_max)}`;
  if (j.budget_min) return `${formatKES(j.budget_min)}+`;
  return fallback;
}

export function JobCard({ job, showStatus }: { job: Job; showStatus?: boolean }) {
  const { t, catName, locale } = useI18n();
  const cats = useCategoryMap();
  const cat = cats.get(job.category_id);
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-[var(--radius-card)] border border-line/70 bg-surface p-4 shadow-[var(--shadow-card)] transition active:scale-[0.99] hover:border-brand/30"
    >
      <div className="flex items-start gap-3">
        <CategoryTile icon={cat?.icon ?? "wrench"} index={(job.category_id ?? 0) % 6} className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[15px] font-bold leading-snug">{job.title}</h3>
            {job.urgency === "asap" && (
              <Badge tone="danger" className="shrink-0">
                <Zap className="size-3" aria-hidden /> {t("jobs.urgency.asap")}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs font-medium text-muted">{catName(cat)}</p>
        </div>
      </div>
      {job.description && <p className="mt-2.5 line-clamp-2 text-sm text-ink-2">{job.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        <span className="font-bold text-ink">{budgetText(job, t("jobs.budgetAny"))}</span>
        <span className="inline-flex items-center gap-1">
          {job.is_remote ? <Wifi className="size-3.5" aria-hidden /> : <MapPin className="size-3.5" aria-hidden />}
          {job.is_remote ? t("common.remote") : [job.town, countyName(job.county_id)].filter(Boolean).join(", ")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {timeAgo(job.created_at, locale)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquareQuote className="size-3.5" aria-hidden />
          {job.quotes_count ? t("jobs.quotesCount", { n: job.quotes_count }) : t("jobs.beFirst")}
        </span>
        {showStatus && (
          <Badge tone={job.status === "open" ? "brand" : "neutral"} className="ml-auto">
            {t(`jobs.status.${job.status}`)}
          </Badge>
        )}
      </div>
    </Link>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-line/70 bg-surface p-4">
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-3 h-3.5 w-full" />
      <Skeleton className="mt-3 h-3 w-2/3" />
    </div>
  );
}

/** Open jobs matching a provider's services, in their county or remote. */
export function useJobFeed(limit = 30) {
  const { user, profile, provider } = useAuth();
  return useQuery({
    queryKey: ["job-feed", user?.id, profile?.county_id, limit],
    enabled: !!user && !!provider,
    queryFn: async () => {
      const { data: pc } = await supabase.from("provider_categories").select("category_id").eq("provider_id", user!.id);
      const catIds = (pc ?? []).map((r) => r.category_id as number);
      if (!catIds.length) return [] as Job[];
      let q = supabase.from("jobs").select("*").eq("status", "open").neq("buyer_id", user!.id).in("category_id", catIds);
      if (profile?.county_id) {
        q = provider?.remote_ok ? q.or(`county_id.eq.${profile.county_id},is_remote.eq.true`) : q.eq("county_id", profile.county_id);
      }
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data as Job[];
    },
  });
}
