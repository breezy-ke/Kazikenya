"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarDays, Check, Circle, Hourglass, Lock, MapPin, MessageCircle, Phone, ShieldCheck, Star,
} from "lucide-react";
import { callPayments, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { BOOKING_SELECT, useSettings } from "@/lib/queries";
import { countyName } from "@/lib/data";
import { cn, displayPhone, firstName, formatDate, formatKES } from "@/lib/utils";
import type { Booking, BookingEvent, BookingStatus, Dispute, MiniProfile, Payout, Review } from "@/lib/types";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Avatar, StatusBadge, VerifiedBadge } from "@/components/bits";
import { Button, Card, EmptyState, Field, Input, PageLoader, Textarea } from "@/components/ui";
import { MpesaPaySheet } from "@/components/mpesa-pay";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";

type Row = Booking & { buyer: MiniProfile; provider: MiniProfile };
const FLOW: BookingStatus[] = ["requested", "awaiting_payment", "funded", "in_progress", "delivered", "completed"];
const REASONS = ["not_done", "poor_quality", "no_show", "overcharge", "other"] as const;

function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const errMsg = useErrorMessage();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [payOpen, setPayOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("not_done");
  const [details, setDetails] = useState("");
  const [price, setPrice] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const [b, ev, po, rv, dp] = await Promise.all([
        supabase.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle(),
        supabase.from("booking_events").select("*").eq("booking_id", id).order("created_at"),
        supabase.from("payouts").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
        supabase.from("reviews").select("*").eq("booking_id", id),
        supabase.from("disputes").select("*").eq("booking_id", id).maybeSingle(),
      ]);
      if (b.error) throw b.error;
      return {
        booking: b.data as unknown as Row | null,
        events: (ev.data ?? []) as BookingEvent[],
        payouts: (po.data ?? []) as Payout[],
        reviews: (rv.data ?? []) as Review[],
        dispute: dp.data as Dispute | null,
      };
    },
  });

  const booking = q.data?.booking;
  const contactQ = useQuery({
    queryKey: ["contact", id, booking?.status],
    enabled: !!booking && ["funded", "in_progress", "delivered", "completed", "disputed"].includes(booking.status),
    queryFn: async () => {
      const { data } = await supabase.rpc("get_counterpart_contact", { p_booking: id });
      return (data as { phone: string | null }[] | null)?.[0]?.phone ?? null;
    },
  });

  // Live updates when the other party acts.
  useEffect(() => {
    const ch = supabase
      .channel(`booking-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["booking", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  if (q.isLoading) return <PageLoader />;
  if (!booking || !user) {
    return (
      <>
        <TopBar />
        <EmptyState icon={<AlertTriangle className="size-8" />} title={t("common.notFound")} />
      </>
    );
  }

  const isBuyer = booking.buyer_id === user.id;
  const other = isBuyer ? booking.provider : booking.buyer;
  const pct = Math.round(Number(booking.commission_rate) * 100);
  const fee = booking.commission_amount ?? Math.round(booking.amount * Number(booking.commission_rate));
  const net = booking.payout_amount ?? booking.amount - fee;
  const myReview = q.data!.reviews.find((r) => r.reviewer_id === user.id);
  const theirReview = q.data!.reviews.find((r) => r.reviewer_id !== user.id);
  const payout = q.data!.payouts[0];
  const s = booking.status;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["booking", id] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
  };

  async function rpc(name: string, args: Record<string, unknown>, okMsg?: string) {
    setBusy(name);
    const { error } = await supabase.rpc(name, args);
    setBusy(null);
    if (error) {
      toast(errMsg(error), "error");
      return false;
    }
    if (okMsg) toast(okMsg);
    refresh();
    return true;
  }

  async function release() {
    setBusy("release");
    try {
      await callPayments("release", { booking_id: id });
      setConfirmOpen(false);
      toast(t("bk.released"));
      refresh();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function submitDispute() {
    const ok = await rpc("open_dispute", { p_booking: id, p_reason: reason, p_details: details.trim() });
    if (ok) setDisputeOpen(false);
  }

  async function submitReview() {
    if (!rating) return;
    setBusy("review");
    const { error } = await supabase.from("reviews").insert({
      booking_id: id,
      reviewer_id: user!.id,
      reviewee_id: other.id,
      rating,
      comment: comment.trim(),
    });
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    toast(t("bk.reviewThanks"));
    refresh();
    if (rating >= 4 && isBuyer) {
      try {
        if (!localStorage.getItem("kk-asked-rate")) {
          localStorage.setItem("kk-asked-rate", "1");
          setTimeout(() => toast(locale === "sw" ? "Unaipenda KaziKenya? Tupe nyota kwenye Play Store ⭐" : "Enjoying KaziKenya? Rate us on the Play Store ⭐", "info"), 1500);
        }
      } catch {
        /* ignore */
      }
    }
  }

  async function message() {
    const { data, error } = await supabase.rpc("start_conversation", { p_other: other.id, p_i_am_buyer: isBuyer });
    if (error) return toast(errMsg(error), "error");
    router.push(`/inbox/${data}`);
  }

  // Contextual explanation of where things stand.
  const hint =
    s === "requested"
      ? isBuyer
        ? t("bk.waitingProvider", { name: firstName(other.full_name) })
        : null
      : s === "awaiting_payment"
        ? isBuyer
          ? t("bk.payNote")
          : t("bk.waitingPayment")
        : s === "funded" && !isBuyer
          ? t("bk.fundedPro")
          : s === "delivered"
            ? isBuyer
              ? t("bk.autoRelease", { hours: settings?.auto_release_hours ?? 72 })
              : t("bk.deliveredPro")
            : s === "disputed"
              ? t("bk.disputeOpen")
              : null;

  const flowIdx = FLOW.indexOf(s);
  const terminalBad = ["declined", "cancelled", "refunded"].includes(s);

  return (
    <>
      <TopBar title={booking.title} sub={t("bk.ref", { ref: booking.ref })} />
      <div className="space-y-4 px-4 pb-36 pt-4">
        {/* Status */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={s} />
            <span className="text-xl font-extrabold">{formatKES(booking.amount)}</span>
          </div>
          {!terminalBad && (
            <ol className="mt-4 flex items-center gap-1" aria-label={t("bk.timeline")}>
              {FLOW.map((st, i) => (
                <li key={st} className={cn("h-1.5 flex-1 rounded-full", i <= flowIdx || s === "disputed" ? "bg-brand" : "bg-line")} />
              ))}
            </ol>
          )}
          {hint && (
            <p className={cn("mt-3 flex items-start gap-2 text-sm", s === "disputed" ? "text-danger" : "text-ink-2")}>
              {s === "disputed" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Hourglass className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
              {hint}
            </p>
          )}
        </Card>

        {/* Counterpart */}
        <Card className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{isBuyer ? t("bk.provider") : t("bk.client")}</p>
          <div className="flex items-center gap-3">
            <Link href={isBuyer ? `/p/${other.id}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={other.avatar_url} name={other.full_name} size={48} />
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate font-bold">
                  {other.full_name} <VerifiedBadge level={other.verification_level} compact />
                </p>
                <p className="truncate text-xs text-muted">{[other.town, countyName(other.county_id)].filter(Boolean).join(", ")}</p>
              </div>
            </Link>
            <Button size="sm" variant="secondary" onClick={message} aria-label={t("common.message")}>
              <MessageCircle className="size-4" aria-hidden />
            </Button>
          </div>
          {contactQ.data ? (
            <div className="mt-3 flex gap-2">
              <a href={`tel:+${contactQ.data}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-soft text-sm font-semibold text-brand-soft-ink">
                <Phone className="size-4" aria-hidden /> {displayPhone(contactQ.data)}
              </a>
              <a
                href={`https://wa.me/${contactQ.data}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center justify-center rounded-xl bg-[#25d366]/15 px-4 text-sm font-semibold text-[#128c4a] dark:text-[#5ee39a]"
              >
                {t("common.whatsapp")}
              </a>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              <Lock className="size-3.5 shrink-0" aria-hidden /> {t("bk.contactLocked")}
            </p>
          )}
        </Card>

        {/* Details */}
        <Card className="space-y-2.5 p-4 text-sm">
          {booking.description && <p className="whitespace-pre-line leading-relaxed text-ink-2">{booking.description}</p>}
          {booking.scheduled_for && (
            <p className="flex items-center gap-2 text-ink-2">
              <CalendarDays className="size-4 text-muted" aria-hidden /> {t("bk.scheduled", { date: formatDate(booking.scheduled_for, locale) })}
            </p>
          )}
          {(booking.town || booking.county_id) && (
            <p className="flex items-center gap-2 text-ink-2">
              <MapPin className="size-4 text-muted" aria-hidden /> {[booking.town, countyName(booking.county_id)].filter(Boolean).join(", ")}
            </p>
          )}
        </Card>

        {/* Money */}
        <Card className="p-4 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-muted">{t("bk.amount")}</span>
            <span className="font-semibold">{formatKES(booking.amount)}</span>
          </div>
          {isBuyer ? (
            <div className="mt-1 flex justify-between border-t border-line pt-2 text-base">
              <span className="font-bold">{t("bk.youPay")}</span>
              <span className="font-extrabold">{formatKES(booking.amount)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between py-1">
                <span className="text-muted">{t("bk.fee", { pct })}</span>
                <span className="font-semibold">− {formatKES(fee)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-base">
                <span className="font-bold">{t("bk.youGet")}</span>
                <span className="font-extrabold text-brand">{formatKES(net)}</span>
              </div>
            </>
          )}
          {payout && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
              <ShieldCheck className="size-4 text-brand" aria-hidden />
              <span className="font-semibold">{payout.kind === "refund" ? t("wallet.refund") : t("bk.payout")}:</span>
              {t(`bk.payoutStatus.${payout.status}`)}
              {payout.mpesa_receipt && <span className="ml-auto font-mono text-muted">{payout.mpesa_receipt}</span>}
            </p>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
            {t("pp.escrowNote")}
          </p>
        </Card>

        {/* Dispute */}
        {q.data?.dispute && (
          <Card className="border-danger/30 bg-danger-soft/40 p-4 text-sm">
            <p className="flex items-center gap-2 font-bold text-danger">
              <AlertTriangle className="size-4" aria-hidden />
              {t(`bk.disputeReason.${q.data.dispute.reason}`)}
            </p>
            {q.data.dispute.details && <p className="mt-1.5 text-ink-2">{q.data.dispute.details}</p>}
            {q.data.dispute.resolution_note && <p className="mt-2 text-muted">{q.data.dispute.resolution_note}</p>}
          </Card>
        )}

        {/* Review */}
        {s === "completed" && (
          <Card className="p-4">
            {myReview ? (
              <>
                <p className="text-sm font-bold">{t("bk.yourReview")}</p>
                <div className="mt-1.5 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={cn("size-5", i <= myReview.rating ? "fill-gold text-gold" : "fill-line text-line")} aria-hidden />
                  ))}
                </div>
                {myReview.comment && <p className="mt-2 text-sm text-ink-2">{myReview.comment}</p>}
              </>
            ) : (
              <>
                <p className="font-bold">{t("bk.review")}</p>
                <div className="mt-3 flex justify-center gap-2" role="radiogroup" aria-label={t("bk.review")}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      role="radio"
                      aria-checked={rating === i}
                      aria-label={t("rev.stars", { n: i })}
                      onClick={() => setRating(i)}
                      className="p-1 transition active:scale-90"
                    >
                      <Star className={cn("size-9", i <= rating ? "fill-gold text-gold" : "fill-transparent text-line")} />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <div className="animate-pop mt-3 space-y-3">
                    <Textarea rows={3} maxLength={1500} placeholder={t("bk.reviewPh")} value={comment} onChange={(e) => setComment(e.target.value)} />
                    <Button block loading={busy === "review"} onClick={submitReview}>
                      {t("bk.reviewSubmit")}
                    </Button>
                  </div>
                )}
              </>
            )}
            {theirReview && (
              <div className="mt-4 border-t border-line pt-3 text-sm">
                <p className="font-semibold">{other.full_name}:</p>
                <p className="text-muted">
                  {"★".repeat(theirReview.rating)} {theirReview.comment}
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Timeline */}
        {!!q.data?.events.length && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-bold text-muted">{t("bk.timeline")}</h2>
            <ol className="relative ml-3 border-l-2 border-line pl-5">
              {q.data.events.map((e, i) => (
                <li key={e.id} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[29px] top-0.5 flex size-4 items-center justify-center rounded-full bg-bg">
                    {i === q.data!.events.length - 1 ? <Circle className="size-3.5 fill-brand text-brand" /> : <Check className="size-3.5 text-brand" />}
                  </span>
                  <p className="text-sm font-semibold">{t(`status.${e.to_status}`)}</p>
                  <p className="text-xs text-muted">{formatDate(e.created_at, locale, true)}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {/* Actions */}
      <ActionBar>
        {isBuyer && s === "requested" && (
          <Button variant="danger" block size="lg" loading={busy === "cancel_booking"} onClick={() => confirm(t("bk.cancelConfirm")) && rpc("cancel_booking", { p_booking: id })}>
            {t("bk.cancel")}
          </Button>
        )}
        {isBuyer && s === "awaiting_payment" && (
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => confirm(t("bk.cancelConfirm")) && rpc("cancel_booking", { p_booking: id })}>
              {t("common.cancel")}
            </Button>
            <Button block size="lg" className="bg-[#00a651] text-white hover:bg-[#008f45]" onClick={() => setPayOpen(true)}>
              {t("bk.pay", { amount: formatKES(booking.amount) })}
            </Button>
          </div>
        )}
        {isBuyer && (s === "funded" || s === "in_progress") && (
          <Button variant="outline" block size="lg" onClick={() => setDisputeOpen(true)}>
            <AlertTriangle className="size-4" aria-hidden /> {t("bk.dispute")}
          </Button>
        )}
        {isBuyer && s === "delivered" && (
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => setDisputeOpen(true)} aria-label={t("bk.dispute")}>
              <AlertTriangle className="size-5" />
            </Button>
            <Button block size="lg" onClick={() => setConfirmOpen(true)}>
              {t("bk.confirm")}
            </Button>
          </div>
        )}

        {!isBuyer && s === "requested" && (
          <div className="flex gap-2">
            <Button variant="danger" size="lg" loading={busy === "respond_booking"} onClick={() => rpc("respond_booking", { p_booking: id, p_accept: false })}>
              {t("bk.decline")}
            </Button>
            <Button
              block
              size="lg"
              onClick={() => {
                setPrice(String(booking.amount));
                setAcceptOpen(true);
              }}
            >
              {t("bk.accept")}
            </Button>
          </div>
        )}
        {!isBuyer && s === "awaiting_payment" && (
          <Button variant="secondary" block size="lg" onClick={() => confirm(t("bk.cancelConfirm")) && rpc("cancel_booking", { p_booking: id })}>
            {t("bk.cancel")}
          </Button>
        )}
        {!isBuyer && s === "funded" && (
          <Button block size="lg" loading={busy === "start_booking"} onClick={() => rpc("start_booking", { p_booking: id })}>
            {t("bk.start")}
          </Button>
        )}
        {!isBuyer && s === "in_progress" && (
          <Button block size="lg" loading={busy === "mark_delivered"} onClick={() => rpc("mark_delivered", { p_booking: id })}>
            <Check className="size-5" aria-hidden /> {t("bk.markDone")}
          </Button>
        )}
        {!isBuyer && s === "delivered" && (
          <Button variant="outline" block size="lg" onClick={() => setDisputeOpen(true)}>
            {t("bk.dispute")}
          </Button>
        )}
      </ActionBar>

      <MpesaPaySheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        amount={booking.amount}
        purpose="escrow"
        bookingId={id}
        onPaid={refresh}
      />

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("bk.confirmTitle")}>
        <p className="text-ink-2">{t("bk.confirmBody", { amount: formatKES(booking.amount), name: other.full_name })}</p>
        <div className="mt-6 flex gap-3 pb-3">
          <Button variant="secondary" size="lg" onClick={() => setConfirmOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button block size="lg" loading={busy === "release"} onClick={release}>
            {t("bk.confirm")}
          </Button>
        </div>
      </Sheet>

      <Sheet open={acceptOpen} onClose={() => setAcceptOpen(false)} title={t("bk.accept")}>
        <div className="space-y-4 pb-3">
          <Field label={t("bk.acceptAt")} htmlFor="price">
            <Input id="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {Number(price) >= 50 && (
            <p className="text-sm text-muted">
              {t("bk.youGet")}: <strong className="text-ink">{formatKES(Number(price) * (1 - Number(booking.commission_rate)))}</strong>
            </p>
          )}
          <Button
            block
            size="lg"
            loading={busy === "respond_booking"}
            disabled={Number(price) < 50}
            onClick={async () => {
              const ok = await rpc("respond_booking", { p_booking: id, p_accept: true, p_amount: Number(price) });
              if (ok) setAcceptOpen(false);
            }}
          >
            {t("bk.accept")}
          </Button>
        </div>
      </Sheet>

      <Sheet open={disputeOpen} onClose={() => setDisputeOpen(false)} title={t("bk.disputeTitle")}>
        <div className="space-y-4 pb-3">
          <div className="space-y-2" role="radiogroup">
            {REASONS.map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason(r)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left font-semibold",
                  reason === r ? "border-brand bg-brand-soft" : "border-line",
                )}
              >
                {t(`bk.disputeReason.${r}`)}
                {reason === r && <Check className="size-5 text-brand" aria-hidden />}
              </button>
            ))}
          </div>
          <Field label={t("bk.disputeDetails")} htmlFor="dd">
            <Textarea id="dd" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <Button variant="danger" block size="lg" loading={busy === "open_dispute"} onClick={submitDispute}>
            {t("bk.disputeSubmit")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function ActionBar({ children }: { children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.some(Boolean) : !!children;
  if (!has) return null;
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl px-4 py-3">{children}</div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <BookingDetail />
      </AppShell>
    </RequireAuth>
  );
}
