"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Crown, FileQuestion, MapPin, MessageCircle, MessageSquareQuote, Wifi, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { useCategoryMap, useSettings } from "@/lib/queries";
import { countyName } from "@/lib/data";
import { formatKES, timeAgo } from "@/lib/utils";
import type { Job, MiniProfile, Quote } from "@/lib/types";
import { AppShell, TopBar } from "@/components/shell";
import { Avatar, CategoryTile, ProBadge, RatingInline, VerifiedBadge } from "@/components/bits";
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageLoader, Textarea } from "@/components/ui";
import { budgetText } from "@/components/job-card";
import { useToast } from "@/components/toast";
import { Sheet } from "@/components/sheet";

type QuoteRow = Quote & {
  provider: MiniProfile;
  pp: { rating_avg: number; rating_count: number; jobs_completed: number; is_pro: boolean; pro_until: string | null } | null;
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { t, catName, locale } = useI18n();
  const errMsg = useErrorMessage();
  const { user, provider, ready } = useAuth();
  const { data: settings } = useSettings();
  const cats = useCategoryMap();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [eta, setEta] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const jobQ = useQuery({
    queryKey: ["job", id, user?.id],
    enabled: ready,
    queryFn: async () => {
      const { data: job, error } = await supabase
        .from("jobs")
        .select("*, buyer:profiles!jobs_buyer_id_fkey(id,full_name,avatar_url,verification_level,county_id,town)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      let quotes: QuoteRow[] = [];
      let booking: { id: string } | null = null;
      if (job && user) {
        const { data: qs } = await supabase
          .from("quotes")
          .select(
            "*, provider:profiles!quotes_provider_profile_fkey(id,full_name,avatar_url,verification_level,county_id,town), pp:provider_profiles!quotes_provider_id_fkey(rating_avg,rating_count,jobs_completed,is_pro,pro_until)",
          )
          .eq("job_id", id)
          .order("created_at", { ascending: true });
        quotes = (qs ?? []) as unknown as QuoteRow[];
        if (job.status !== "open") {
          const { data: b } = await supabase.from("bookings").select("id").eq("job_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          booking = b;
        }
      }
      return { job: job as (Job & { buyer: MiniProfile }) | null, quotes, booking };
    },
  });

  if (!ready || jobQ.isLoading) return <PageLoader />;
  const job = jobQ.data?.job;
  if (!job) {
    return (
      <AppShell>
        <TopBar />
        <EmptyState icon={<FileQuestion className="size-8" />} title={t("err.NOT_AVAILABLE")} action={<ButtonLink href="/">{t("common.goHome")}</ButtonLink>} />
      </AppShell>
    );
  }

  const cat = cats.get(job.category_id);
  const isOwner = user?.id === job.buyer_id;
  const myQuote = jobQ.data!.quotes.find((q) => q.provider_id === user?.id);
  const visibleQuotes = jobQ.data!.quotes.filter((q) => q.status !== "withdrawn");
  const proActive = !!(provider?.is_pro && provider.pro_until && new Date(provider.pro_until) > new Date());
  const freeLimit = settings?.free_quotes_per_month ?? 10;
  const monthStart = new Date().toISOString().slice(0, 7);
  const used = provider && provider.quotes_month?.slice(0, 7) === monthStart ? provider.quotes_used : 0;
  const left = Math.max(0, freeLimit - used);

  const refresh = () => qc.invalidateQueries({ queryKey: ["job", id] });

  async function sendQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!amount || Number(amount) < 50) return toast(t("err.amount"), "error");
    setBusy("quote");
    const { error } = await supabase.from("quotes").insert({
      job_id: id,
      provider_id: user.id,
      amount: Number(amount),
      message: msg.trim(),
      eta_days: Math.max(0, Math.min(365, Number(eta) || 1)),
    });
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    setQuoteOpen(false);
    toast(t("jobs.quoteSent"));
    qc.invalidateQueries({ queryKey: ["me", user.id] });
    refresh();
  }

  async function accept(q: QuoteRow) {
    setBusy(q.id);
    const { data, error } = await supabase.rpc("accept_quote", { p_quote: q.id });
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    toast(t("jobs.accepted"));
    router.push(`/bookings/${data}`);
  }

  async function withdraw() {
    if (!myQuote) return;
    setBusy("withdraw");
    const { error } = await supabase.rpc("withdraw_quote", { p_quote: myQuote.id });
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    refresh();
  }

  async function closeJob() {
    setBusy("close");
    const { error } = await supabase.from("jobs").update({ status: "closed" }).eq("id", id);
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    toast(t("jobs.closed"));
    refresh();
  }

  async function messageUser(other: string, iAmBuyer: boolean) {
    const { data, error } = await supabase.rpc("start_conversation", { p_other: other, p_i_am_buyer: iAmBuyer });
    if (error) return toast(errMsg(error), "error");
    router.push(`/inbox/${data}`);
  }

  return (
    <AppShell hideNav>
      <TopBar title={catName(cat)} sub={timeAgo(job.created_at, locale)} />
      <div className="pb-32">
        <section className="px-4 pt-5">
          <div className="flex items-start gap-3">
            <CategoryTile icon={cat?.icon ?? "wrench"} index={job.category_id % 6} className="size-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">{job.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={job.status === "open" ? "brand" : "neutral"}>{t(`jobs.status.${job.status}`)}</Badge>
                {job.urgency === "asap" && (
                  <Badge tone="danger">
                    <Zap className="size-3" aria-hidden /> {t("jobs.urgency.asap")}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Card className="p-3.5">
              <p className="text-xs text-muted">{t("jobs.budget")}</p>
              <p className="mt-0.5 font-extrabold">{budgetText(job, t("jobs.budgetAny"))}</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted">{t("jobs.urgency")}</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-bold">
                <CalendarClock className="size-4 text-accent" aria-hidden />
                {t(`jobs.urgency.${job.urgency}`)}
              </p>
            </Card>
          </div>

          <p className="mt-4 flex items-center gap-2 text-sm text-ink-2">
            {job.is_remote ? <Wifi className="size-4 text-muted" aria-hidden /> : <MapPin className="size-4 text-muted" aria-hidden />}
            {job.is_remote ? t("common.remote") : [job.town, countyName(job.county_id)].filter(Boolean).join(", ")}
          </p>

          {job.description && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{job.description}</p>}

          {!!job.photos.length && (
            <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
              {job.photos.map((p) => (
                <button key={p} onClick={() => setPhoto(p)} className="size-28 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {!isOwner && job.buyer && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <Avatar src={job.buyer.avatar_url} name={job.buyer.full_name} size={40} />
              <div className="flex-1 text-sm">
                <p className="flex items-center gap-1 font-bold">
                  {job.buyer.full_name} <VerifiedBadge level={job.buyer.verification_level} compact />
                </p>
                <p className="text-xs text-muted">{t("bk.client")}</p>
              </div>
              {user && provider && (
                <Button size="sm" variant="outline" onClick={() => messageUser(job.buyer_id, false)}>
                  <MessageCircle className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          )}
        </section>

        {/* Buyer: quotes */}
        {isOwner && (
          <section className="mt-7 px-4">
            <h2 className="mb-3 flex items-center gap-2 text-[17px] font-bold">
              <MessageSquareQuote className="size-5 text-brand" aria-hidden />
              {t("jobs.quotes")} <span className="text-muted">({visibleQuotes.length})</span>
            </h2>
            {jobQ.data!.booking && (
              <ButtonLink href={`/bookings/${jobQ.data!.booking.id}`} block className="mb-3">
                {t("work.bookings")} →
              </ButtonLink>
            )}
            {visibleQuotes.length ? (
              <ul className="space-y-3">
                {visibleQuotes.map((q) => (
                  <li key={q.id}>
                    <Card className={`p-4 ${q.status === "accepted" ? "border-brand ring-2 ring-brand/20" : ""}`}>
                      <div className="flex items-center gap-3">
                        <Link href={`/p/${q.provider_id}`}>
                          <Avatar src={q.provider?.avatar_url} name={q.provider?.full_name} size={48} />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/p/${q.provider_id}`} className="flex items-center gap-1 font-bold">
                            <span className="truncate">{q.provider?.full_name}</span>
                            <VerifiedBadge level={q.provider?.verification_level ?? 0} compact />
                            {q.pp?.is_pro && q.pp.pro_until && new Date(q.pp.pro_until) > new Date() && <ProBadge />}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                            <RatingInline avg={Number(q.pp?.rating_avg ?? 0)} count={q.pp?.rating_count ?? 0} />
                            <span>· {t("pp.jobs", { n: q.pp?.jobs_completed ?? 0 })}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-extrabold">{formatKES(q.amount)}</p>
                          <p className="flex items-center justify-end gap-1 text-xs text-muted">
                            <Clock className="size-3" aria-hidden /> {q.eta_days}d
                          </p>
                        </div>
                      </div>
                      {q.message && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-2">{q.message}</p>}
                      {job.status === "open" && q.status === "pending" && (
                        <div className="mt-4 flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => messageUser(q.provider_id, true)}>
                            <MessageCircle className="size-4" aria-hidden /> {t("common.message")}
                          </Button>
                          <Button size="sm" className="flex-[1.5]" loading={busy === q.id} onClick={() => accept(q)}>
                            {t("jobs.accept")}
                          </Button>
                        </div>
                      )}
                      {q.status !== "pending" && (
                        <Badge tone={q.status === "accepted" ? "brand" : "neutral"} className="mt-3">
                          {q.status === "accepted" ? t("jobs.status.assigned") : t("status.declined")}
                        </Badge>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center">
                <p className="font-bold">{t("jobs.noQuotes")}</p>
                <p className="mt-1 text-sm text-muted">{t("jobs.noQuotesSub")}</p>
              </div>
            )}
            {job.status === "open" && (
              <Button variant="ghost" block className="mt-4 text-danger" loading={busy === "close"} onClick={closeJob}>
                {t("jobs.closeJob")}
              </Button>
            )}
          </section>
        )}

        {/* Provider: my quote */}
        {!isOwner && myQuote && (
          <section className="mt-7 px-4">
            <h2 className="mb-3 text-[17px] font-bold">{t("jobs.yourQuote")}</h2>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xl font-extrabold">{formatKES(myQuote.amount)}</p>
                <Badge tone={myQuote.status === "accepted" ? "brand" : myQuote.status === "pending" ? "warn" : "neutral"}>
                  {myQuote.status === "accepted" ? t("jobs.status.assigned") : myQuote.status === "pending" ? t("jobs.status.open") : t("status.declined")}
                </Badge>
              </div>
              {myQuote.message && <p className="mt-2 text-sm text-ink-2">{myQuote.message}</p>}
              {myQuote.status === "pending" && (
                <Button variant="ghost" size="sm" className="mt-3 text-danger" loading={busy === "withdraw"} onClick={withdraw}>
                  {t("jobs.withdraw")}
                </Button>
              )}
            </Card>
          </section>
        )}
      </div>

      {/* Bottom action */}
      {!isOwner && job.status === "open" && !myQuote && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl px-4 py-3">
            {!user ? (
              <ButtonLink href={`/login?next=/jobs/${id}`} block size="lg">
                {t("common.signIn")}
              </ButtonLink>
            ) : !provider ? (
              <ButtonLink href="/me/provider?setup=1" block size="lg">
                {t("jobs.becomeProvider")}
              </ButtonLink>
            ) : (
              <>
                <p className="mb-2 text-center text-xs text-muted">
                  {proActive ? t("jobs.unlimited") : t("jobs.quotaLeft", { n: left, total: freeLimit })}
                </p>
                {!proActive && left === 0 ? (
                  <ButtonLink href="/wallet#pro" block size="lg" variant="accent">
                    <Crown className="size-5" aria-hidden /> {t("wallet.proBuy")}
                  </ButtonLink>
                ) : (
                  <Button block size="lg" onClick={() => setQuoteOpen(true)}>
                    {t("jobs.sendQuote")}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Sheet open={quoteOpen} onClose={() => setQuoteOpen(false)} title={t("jobs.sendQuote")}>
        <form onSubmit={sendQuote} className="space-y-4 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("jobs.quoteAmount")} htmlFor="qa">
              <Input id="qa" inputMode="numeric" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("jobs.eta")} htmlFor="eta">
              <Input id="eta" inputMode="numeric" value={eta} onChange={(e) => setEta(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </Field>
          </div>
          {amount && Number(amount) >= 50 && settings && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("bk.youGet")}: <strong className="text-ink">{formatKES(Number(amount) * (1 - Number(settings.commission_rate)))}</strong> ·{" "}
              {t("bk.fee", { pct: Math.round(Number(settings.commission_rate) * 100) })}
            </p>
          )}
          <Field label={t("jobs.quoteMsg")} htmlFor="qm">
            <Textarea id="qm" rows={4} maxLength={2000} placeholder={t("jobs.quoteMsgPh")} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </Field>
          <Button type="submit" block size="lg" loading={busy === "quote"}>
            {t("jobs.sendQuote")}
          </Button>
        </form>
      </Sheet>

      <Sheet open={!!photo} onClose={() => setPhoto(null)} title={t("jobs.photos")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" className="w-full rounded-2xl" />}
      </Sheet>
    </AppShell>
  );
}
