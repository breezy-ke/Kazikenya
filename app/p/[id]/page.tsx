"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Clock, Flag, Heart, MapPin, MessageCircle, Share2, ShieldCheck, Star, Wifi } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCategoryMap } from "@/lib/queries";
import { countyName } from "@/lib/data";
import { cn, errorKey, errorText, formatDate, formatKES, timeAgo } from "@/lib/utils";
import type { DictKey } from "@/lib/dictionary";
import type { Profile, ProviderProfile } from "@/lib/types";
import { AppShell, TopBar } from "@/components/shell";
import { Avatar, CategoryIcon, ProBadge, RatingInline, Stars, VerifiedBadge } from "@/components/bits";
import { Badge, Button, ButtonLink, Card, EmptyState, IconButton, PageLoader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Sheet } from "@/components/sheet";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  reviewer: { full_name: string; avatar_url: string | null } | null;
}

export default function ProviderPage() {
  const { id } = useParams<{ id: string }>();
  const { t, catName, locale } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useCategoryMap();
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["provider", id],
    queryFn: async () => {
      const [p, pp, pc, port, rev] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("provider_profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("provider_categories").select("category_id").eq("provider_id", id),
        supabase.from("portfolio_items").select("id,image_url,caption").eq("provider_id", id).order("created_at", { ascending: false }).limit(12),
        supabase
          .from("reviews")
          .select("id,rating,comment,created_at,reviewer:profiles!reviews_reviewer_id_fkey(full_name,avatar_url),booking:bookings!inner(provider_id)")
          .eq("reviewee_id", id)
          .eq("booking.provider_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return {
        profile: p.data as Profile | null,
        provider: pp.data as ProviderProfile | null,
        categories: (pc.data ?? []).map((r) => r.category_id as number),
        portfolio: (port.data ?? []) as { id: string; image_url: string; caption: string }[],
        reviews: (rev.data ?? []) as unknown as ReviewRow[],
      };
    },
  });

  const fav = useQuery({
    queryKey: ["fav", user?.id, id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("favorites").select("provider_id").eq("user_id", user!.id).eq("provider_id", id).maybeSingle();
      return !!data;
    },
  });

  if (q.isLoading) return <PageLoader />;
  const profile = q.data?.profile;
  const provider = q.data?.provider;
  if (!profile || !provider) {
    return (
      <AppShell>
        <TopBar />
        <EmptyState icon={<Briefcase className="size-8" />} title={t("common.notFound")} />
      </AppShell>
    );
  }

  const isMe = user?.id === id;
  const unit = provider.rate_unit === "hour" ? t("common.perHour") : provider.rate_unit === "day" ? t("common.perDay") : t("common.perJob");
  const proActive = provider.is_pro && provider.pro_until && new Date(provider.pro_until) > new Date();
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: q.data!.reviews.filter((r) => r.rating === s).length }));

  async function toggleFav() {
    if (!user) return router.push(`/login?next=/p/${id}`);
    if (fav.data) await supabase.from("favorites").delete().eq("user_id", user.id).eq("provider_id", id);
    else await supabase.from("favorites").insert({ user_id: user.id, provider_id: id });
    qc.invalidateQueries({ queryKey: ["fav", user.id, id] });
  }

  async function message() {
    if (!user) return router.push(`/login?next=/p/${id}`);
    setBusy(true);
    const { data, error } = await supabase.rpc("start_conversation", { p_other: id, p_i_am_buyer: true });
    setBusy(false);
    if (error) return toast(errorKey(error) ? t(errorKey(error) as DictKey) : errorText(error), "error");
    router.push(`/inbox/${data}`);
  }

  async function share() {
    const url = `${window.location.origin}/p/${id}`;
    const text = `${profile!.full_name} — ${provider!.headline}`;
    if (navigator.share) navigator.share({ title: "KaziKenya", text, url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(url);
      toast(t("common.copied"));
    }
  }

  async function report() {
    if (!user) return router.push(`/login?next=/p/${id}`);
    await supabase.from("reports").insert({ reporter_id: user.id, target_user_id: id, reason: "profile" });
    toast(locale === "sw" ? "Asante, tutakagua." : "Thanks — our team will review this profile.", "info");
  }

  return (
    <AppShell hideNav>
      <TopBar
        right={
          <>
            <IconButton label={t("common.share")} onClick={share}>
              <Share2 className="size-5" />
            </IconButton>
            {!isMe && (
              <IconButton label={fav.data ? t("pp.saved") : t("pp.save")} onClick={toggleFav}>
                <Heart className={cn("size-5", fav.data && "fill-danger text-danger")} />
              </IconButton>
            )}
          </>
        }
      />

      <div className="pb-32">
        {isMe && <p className="mx-4 mt-3 rounded-2xl bg-info-soft px-4 py-2.5 text-sm font-semibold text-info">{t("pp.yourProfile")}</p>}

        <section className="px-4 pt-4 text-center">
          <div className="relative mx-auto w-fit">
            <Avatar src={profile.avatar_url} name={profile.full_name} size={104} className="mx-auto" />
            {proActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                <ProBadge />
              </span>
            )}
          </div>
          <h1 className="mt-4 flex items-center justify-center gap-1.5 text-2xl font-extrabold tracking-tight">
            {profile.full_name}
            <VerifiedBadge level={profile.verification_level} compact />
          </h1>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-2">{provider.headline}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <VerifiedBadge level={profile.verification_level} />
            <Badge tone={provider.available ? "brand" : "neutral"}>{provider.available ? t("badge.available") : t("badge.busy")}</Badge>
            {provider.remote_ok && (
              <Badge tone="info">
                <Wifi className="size-3.5" aria-hidden /> {t("common.remote")}
              </Badge>
            )}
          </div>
        </section>

        <section className="mx-4 mt-5 grid grid-cols-3 divide-x divide-line rounded-[var(--radius-card)] border border-line/70 bg-surface py-3.5 text-center">
          <div>
            <p className="flex items-center justify-center gap-1 text-lg font-extrabold">
              <Star className="size-4 fill-gold text-gold" aria-hidden />
              {provider.rating_count ? Number(provider.rating_avg).toFixed(1) : "—"}
            </p>
            <p className="text-xs text-muted">{t("pp.reviews")} ({provider.rating_count})</p>
          </div>
          <div>
            <p className="text-lg font-extrabold">{provider.jobs_completed}</p>
            <p className="text-xs text-muted">{t("home.jobsDone")}</p>
          </div>
          <div>
            <p className="text-lg font-extrabold">{provider.years_experience}+</p>
            <p className="text-xs text-muted">{locale === "sw" ? "Miaka" : "Years"}</p>
          </div>
        </section>

        <section className="mx-4 mt-4 space-y-2 text-sm text-ink-2">
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-muted" aria-hidden />
            {[profile.town, countyName(profile.county_id)].filter(Boolean).join(", ")}
          </p>
          <p className="flex items-center gap-2">
            <Clock className="size-4 text-muted" aria-hidden />
            {t("pp.memberSince", { date: formatDate(profile.created_at, locale) })}
          </p>
          {provider.rate_kes ? (
            <p className="flex items-center gap-2">
              <Briefcase className="size-4 text-muted" aria-hidden />
              {t("common.from")} <strong className="text-ink">{formatKES(provider.rate_kes)}</strong> {unit}
            </p>
          ) : null}
        </section>

        {!!q.data?.categories.length && (
          <section className="mt-5 flex flex-wrap gap-2 px-4">
            {q.data.categories.map((cid) => {
              const c = cats.get(cid);
              return c ? (
                <Link key={cid} href={`/explore?cat=${cid}`} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-soft-ink">
                  <CategoryIcon icon={c.icon} className="size-4" />
                  {catName(c)}
                </Link>
              ) : null;
            })}
          </section>
        )}

        {provider.about && (
          <section className="mt-6 px-4">
            <h2 className="mb-2 text-[17px] font-bold">{t("pp.about")}</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{provider.about}</p>
          </section>
        )}

        {!!provider.skills.length && (
          <section className="mt-6 px-4">
            <h2 className="mb-2 text-[17px] font-bold">{t("pp.skills")}</h2>
            <div className="flex flex-wrap gap-2">
              {provider.skills.map((s) => (
                <span key={s} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {!!q.data?.portfolio.length && (
          <section className="mt-6">
            <h2 className="mb-2 px-4 text-[17px] font-bold">{t("pp.portfolio")}</h2>
            <div className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto px-4">
              {q.data.portfolio.map((p) => (
                <button key={p.id} onClick={() => setPhoto(p.image_url)} className="size-36 shrink-0 snap-start overflow-hidden rounded-2xl bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image_url} alt={p.caption || ""} loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7 px-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold">{t("pp.reviews")}</h2>
            <RatingInline avg={Number(provider.rating_avg)} count={provider.rating_count} />
          </div>
          {q.data?.reviews.length ? (
            <>
              <div className="mb-4 space-y-1.5">
                {dist.map((d) => (
                  <div key={d.s} className="flex items-center gap-2 text-xs text-muted">
                    <span className="w-3">{d.s}</span>
                    <Star className="size-3 fill-gold text-gold" aria-hidden />
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-gold" style={{ width: `${(d.n / q.data!.reviews.length) * 100}%` }} />
                    </span>
                    <span className="w-5 text-right">{d.n}</span>
                  </div>
                ))}
              </div>
              <ul className="space-y-3">
                {q.data.reviews.map((r) => (
                  <li key={r.id}>
                    <Card className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar src={r.reviewer?.avatar_url} name={r.reviewer?.full_name} size={36} />
                        <div className="flex-1">
                          <p className="text-sm font-bold">{r.reviewer?.full_name}</p>
                          <Stars value={r.rating} size={12} />
                        </div>
                        <span className="text-xs text-muted">{timeAgo(r.created_at, locale)}</span>
                      </div>
                      {r.comment && <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{r.comment}</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">{t("pp.noReviews")}</p>
          )}
        </section>

        {!isMe && (
          <button onClick={report} className="mx-auto mt-8 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Flag className="size-3.5" aria-hidden /> {t("pp.report")}
          </button>
        )}
      </div>

      {!isMe && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl px-4 pt-3">
            <p className="mb-2.5 flex items-center justify-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-brand" aria-hidden />
              {t("pp.escrowNote")}
            </p>
            <div className="flex gap-3 pb-3">
              <Button variant="outline" size="lg" onClick={message} loading={busy} className="flex-1">
                <MessageCircle className="size-5" aria-hidden /> {t("pp.requestQuote")}
              </Button>
              {provider.available ? (
                <ButtonLink href={user ? `/book/${id}` : `/login?next=/book/${id}`} size="lg" className="flex-[1.4]">
                  {t("pp.book")}
                </ButtonLink>
              ) : (
                <Button size="lg" disabled className="flex-[1.4]">
                  {t("pp.unavailable")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {isMe && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-4 backdrop-blur-xl">
          <ButtonLink href="/me/provider" block size="lg" variant="secondary" className="mx-auto max-w-2xl">
            {t("common.edit")}
          </ButtonLink>
        </div>
      )}

      <Sheet open={!!photo} onClose={() => setPhoto(null)} title={t("pp.portfolio")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" className="w-full rounded-2xl" />}
      </Sheet>
    </AppShell>
  );
}
