"use client";

import Link from "next/link";
import { MapPin, Wifi } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCategoryMap } from "@/lib/queries";
import { formatKES } from "@/lib/utils";
import type { ProviderSearchRow } from "@/lib/types";
import { Avatar, ProBadge, RatingInline, VerifiedBadge } from "./bits";
import { Skeleton } from "./ui";

export function ProviderCard({ p }: { p: ProviderSearchRow }) {
  const { t, catName } = useI18n();
  const cats = useCategoryMap();
  const unit = p.rate_unit === "hour" ? t("common.perHour") : p.rate_unit === "day" ? t("common.perDay") : t("common.perJob");
  const primaryCat = p.category_ids?.[0] ? cats.get(p.category_ids[0]) : undefined;
  return (
    <Link
      href={`/p/${p.id}`}
      className="flex gap-3.5 rounded-[var(--radius-card)] border border-line/70 bg-surface p-4 shadow-[var(--shadow-card)] transition active:scale-[0.99] hover:border-brand/30"
    >
      <div className="relative">
        <Avatar src={p.avatar_url} name={p.full_name} size={60} />
        <span
          aria-label={p.available ? t("badge.available") : t("badge.busy")}
          className={`absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-surface ${p.available ? "bg-[#22c55e]" : "bg-muted"}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[15px] font-bold">{p.full_name}</h3>
          <VerifiedBadge level={p.verification_level} compact />
          {p.is_pro && <ProBadge />}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-ink-2">{p.headline || catName(primaryCat)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <RatingInline avg={Number(p.rating_avg)} count={p.rating_count} />
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {[p.town, p.county_name].filter(Boolean).join(", ")}
          </span>
          {p.remote_ok && (
            <span className="inline-flex items-center gap-1">
              <Wifi className="size-3.5" aria-hidden />
              {t("common.remote")}
            </span>
          )}
        </div>
      </div>
      {p.rate_kes ? (
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-muted">{t("common.from")}</p>
          <p className="text-sm font-extrabold">{formatKES(p.rate_kes)}</p>
          <p className="text-[11px] text-muted">{unit}</p>
        </div>
      ) : null}
    </Link>
  );
}

export function ProviderCardSkeleton() {
  return (
    <div className="flex gap-3.5 rounded-[var(--radius-card)] border border-line/70 bg-surface p-4">
      <Skeleton className="size-[60px] rounded-full" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

/** Compact vertical card for horizontal carousels. */
export function ProviderMiniCard({ p }: { p: ProviderSearchRow }) {
  const { t, catName } = useI18n();
  const cats = useCategoryMap();
  const cat = p.category_ids?.[0] ? cats.get(p.category_ids[0]) : undefined;
  return (
    <Link
      href={`/p/${p.id}`}
      className="flex w-40 shrink-0 snap-start flex-col items-center rounded-[var(--radius-card)] border border-line/70 bg-surface p-4 text-center shadow-[var(--shadow-card)] transition active:scale-[0.98]"
    >
      <Avatar src={p.avatar_url} name={p.full_name} size={64} />
      <div className="mt-2.5 flex max-w-full items-center gap-1">
        <span className="truncate text-sm font-bold">{p.full_name.split(" ")[0]}</span>
        <VerifiedBadge level={p.verification_level} compact />
      </div>
      <p className="line-clamp-1 text-xs text-muted">{catName(cat)}</p>
      <div className="mt-2">
        <RatingInline avg={Number(p.rating_avg)} count={p.rating_count} />
      </div>
      {p.is_pro && (
        <span className="mt-2">
          <ProBadge />
        </span>
      )}
      <span className="sr-only">{t("pp.book")}</span>
    </Link>
  );
}
