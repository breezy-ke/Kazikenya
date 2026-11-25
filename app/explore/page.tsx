"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MapPin, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { searchProviders, useCategories } from "@/lib/queries";
import { countyName } from "@/lib/data";
import { cn } from "@/lib/utils";
import { AppShell, Fab } from "@/components/shell";
import { Button, ButtonLink, Chip, EmptyState, Field, PageLoader, Switch } from "@/components/ui";
import { CategoryIcon } from "@/components/bits";
import { CountySelect } from "@/components/county-select";
import { ProviderCard, ProviderCardSkeleton } from "@/components/provider-card";
import { Sheet } from "@/components/sheet";

const PAGE = 20;
const SORTS = ["recommended", "rating", "price_low", "jobs"] as const;

function ExploreInner() {
  const { t, catName } = useI18n();
  const { profile } = useAuth();
  const { data: categories } = useCategories();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const cat = sp.get("cat") ? Number(sp.get("cat")) : null;
  const countyParam = sp.get("county");
  const county = countyParam === "all" ? null : countyParam ? Number(countyParam) : profile?.county_id ?? null;
  const q = sp.get("q") ?? "";
  const sort = (sp.get("sort") as (typeof SORTS)[number]) ?? "recommended";
  const verified = sp.get("verified") === "1";
  const remote = sp.get("remote") === "1";

  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setDraft(q), [q]);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const params = useMemo(
    () => ({ category: cat, county: remote ? null : county, q, sort, verified, remote: remote || null }),
    [cat, county, q, sort, verified, remote],
  );

  const query = useInfiniteQuery({
    queryKey: ["explore", params],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => searchProviders({ ...params, limit: PAGE, offset: pageParam }),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
  const rows = query.data?.pages.flat() ?? [];
  const activeFilters = (verified ? 1 : 0) + (remote ? 1 : 0) + (sort !== "recommended" ? 1 : 0);

  return (
    <>
      <div className="safe-top sticky top-0 z-30 border-b border-line/60 bg-bg/92 backdrop-blur-xl">
        <div className="px-4 pb-3 pt-3">
          <h1 className="mb-3 text-[22px] font-extrabold tracking-tight">{t("explore.title")}</h1>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: draft.trim() || null });
              (document.activeElement as HTMLElement)?.blur();
            }}
            className="flex gap-2"
          >
            <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
              <Search className="size-5 shrink-0 text-muted" aria-hidden />
              <input
                aria-label={t("common.search")}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("explore.searchPh")}
                enterKeyHint="search"
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted/80"
              />
              {draft && (
                <button type="button" aria-label={t("common.clear")} onClick={() => (setDraft(""), update({ q: null }))} className="rounded-full p-1 text-muted">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label={t("common.filters")}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface"
            >
              <SlidersHorizontal className="size-5" />
              {activeFilters > 0 && (
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">
                  {activeFilters}
                </span>
              )}
            </button>
          </form>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          <Chip active={!cat} onClick={() => update({ cat: null })}>
            {t("explore.allCategories")}
          </Chip>
          {categories?.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => update({ cat: String(c.id) })}>
              <CategoryIcon icon={c.icon} className="size-4" />
              {catName(c)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {query.isLoading ? t("common.loading") : rows.length === 1 && !query.hasNextPage ? t("explore.results1") : t("explore.results", { n: rows.length + (query.hasNextPage ? "+" : "") })}
          </p>
          {!remote && (
            <label className="relative flex items-center gap-1.5 text-sm font-semibold text-brand">
              <MapPin className="size-4" aria-hidden />
              <span>{county ? countyName(county) : t("common.allCounties")}</span>
              <span className="absolute inset-0 opacity-0">
                <CountySelect allowAll value={county} onChange={(v) => update({ county: v ? String(v) : "all" })} />
              </span>
            </label>
          )}
        </div>

        <div className="space-y-3">
          {query.isLoading
            ? Array.from({ length: 5 }).map((_, i) => <ProviderCardSkeleton key={i} />)
            : rows.map((p) => <ProviderCard key={p.id} p={p} />)}
        </div>

        {!query.isLoading && !rows.length && (
          <EmptyState
            icon={<SearchX className="size-8" />}
            title={t("explore.noResults")}
            body={t("explore.noResultsSub")}
            action={
              <div className="flex flex-col gap-2">
                <ButtonLink href="/jobs/new" variant="accent">
                  {t("nav.postJob")}
                </ButtonLink>
                {county && (
                  <Button variant="ghost" onClick={() => update({ county: "all" })}>
                    {t("common.allCounties")}
                  </Button>
                )}
              </div>
            }
          />
        )}

        {query.hasNextPage && (
          <Button variant="outline" block className="mt-4" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {t("explore.loadMore")}
          </Button>
        )}
      </div>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t("common.filters")}>
        <div className="space-y-6 pb-4">
          <Field label={t("explore.sort")}>
            <div className="flex flex-wrap gap-2">
              {SORTS.map((s) => (
                <Chip key={s} active={sort === s} onClick={() => update({ sort: s === "recommended" ? null : s })}>
                  {t(`explore.sort.${s}`)}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={t("common.county")}>
            <CountySelect allowAll value={county} onChange={(v) => update({ county: v ? String(v) : "all" })} />
          </Field>
          <div className="space-y-3">
            <Switch checked={verified} onChange={(v) => update({ verified: v ? "1" : null })} label={t("explore.verifiedOnly")} />
            <Switch checked={remote} onChange={(v) => update({ remote: v ? "1" : null })} label={t("explore.remoteOnly")} />
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => update({ sort: null, verified: null, remote: null })}
              className={cn(!activeFilters && "invisible")}
            >
              {t("common.clear")}
            </Button>
            <Button block onClick={() => setFiltersOpen(false)}>
              {t("common.apply")}
            </Button>
          </div>
        </div>
      </Sheet>
      <Fab href="/jobs/new" label={t("nav.postJob")} />
    </>
  );
}

export default function ExplorePage() {
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <ExploreInner />
      </Suspense>
    </AppShell>
  );
}
