"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Check, Crown, Lock, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/queries";
import { cn, formatDate, formatKES } from "@/lib/utils";
import type { Payment, Payout } from "@/lib/types";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Badge, Button, Card, PageLoader, Segmented } from "@/components/ui";
import { MpesaPaySheet } from "@/components/mpesa-pay";

function WalletInner() {
  const { t, locale } = useI18n();
  const { user, provider, refresh } = useAuth();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"payouts" | "payments">(provider ? "payouts" : "payments");
  const [proOpen, setProOpen] = useState(false);

  const q = useQuery({
    queryKey: ["wallet", user?.id],
    queryFn: async () => {
      const [po, pay, escrow] = await Promise.all([
        supabase.from("payouts").select("*").eq("provider_id", user!.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("payments").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("bookings").select("amount,commission_rate").eq("provider_id", user!.id).in("status", ["funded", "in_progress", "delivered", "disputed"]),
      ]);
      return {
        payouts: (po.data ?? []) as Payout[],
        payments: (pay.data ?? []) as Payment[],
        escrow: (escrow.data ?? []).reduce((s, b) => s + Math.round(b.amount * (1 - Number(b.commission_rate))), 0),
      };
    },
  });

  if (q.isLoading) return <PageLoader />;
  const earned = q.data!.payouts.filter((p) => p.kind === "payout" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const proActive = !!(provider?.is_pro && provider.pro_until && new Date(provider.pro_until) > new Date());

  return (
    <>
      <TopBar title={t("wallet.title")} />
      <div className="space-y-5 px-4 py-5">
        {provider && (
          <div className="hero-gradient relative overflow-hidden rounded-[28px] p-5 text-white">
            <span className="kente-dots absolute inset-0 opacity-40" aria-hidden />
            <div className="relative">
              <p className="flex items-center gap-2 text-sm text-white/80">
                <Wallet className="size-4" aria-hidden /> {t("wallet.earned")}
              </p>
              <p className="mt-1 text-[34px] font-extrabold tracking-tight">{formatKES(earned)}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <Lock className="size-3.5" aria-hidden /> {t("wallet.inEscrow")}: {formatKES(q.data!.escrow)}
              </p>
            </div>
          </div>
        )}

        {provider && (
          <Card id="pro" className={cn("scroll-mt-20 p-5", proActive && "border-gold/60 ring-2 ring-gold/25")}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <Crown className="size-5 text-gold" aria-hidden /> {t("wallet.proTitle")}
              </h2>
              <span className="text-sm font-bold">{t("wallet.proPrice", { price: formatKES(settings?.pro_price_kes ?? 299) })}</span>
            </div>
            {proActive && <Badge tone="gold" className="mt-2">{t("wallet.proActive", { date: formatDate(provider.pro_until, locale) })}</Badge>}
            <ul className="mt-4 space-y-2 text-sm">
              {[t("wallet.proBenefit1", { n: settings?.free_quotes_per_month ?? 10 }), t("wallet.proBenefit2"), t("wallet.proBenefit3")].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden /> {b}
                </li>
              ))}
            </ul>
            <Button block size="lg" variant="accent" className="mt-5" onClick={() => setProOpen(true)}>
              {proActive ? t("wallet.proRenew") : t("wallet.proBuy")}
            </Button>
          </Card>
        )}

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            ...(provider ? [{ value: "payouts" as const, label: t("wallet.payouts") }] : []),
            { value: "payments" as const, label: t("wallet.payments") },
          ]}
        />

        {tab === "payouts" ? (
          q.data!.payouts.length ? (
            <ul className="space-y-2">
              {q.data!.payouts.map((p) => (
                <li key={p.id}>
                  <Link href={`/bookings/${p.booking_id}`} className="flex items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3.5">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-ink">
                      <ArrowDownLeft className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{p.kind === "refund" ? t("wallet.refund") : t("bk.payout")}</p>
                      <p className="text-xs text-muted">
                        {formatDate(p.created_at, locale)} {p.mpesa_receipt && `· ${p.mpesa_receipt}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-brand">+{formatKES(p.amount)}</p>
                      <p className="text-[11px] text-muted">{t(`bk.payoutStatus.${p.status}`)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-surface-2 p-5 text-center text-sm text-muted">{t("wallet.noPayouts")}</p>
          )
        ) : q.data!.payments.length ? (
          <ul className="space-y-2">
            {q.data!.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3.5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-ink">
                  <ArrowUpRight className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{p.purpose === "escrow" ? t("wallet.escrow") : t("wallet.subscription")}</p>
                  <p className="text-xs text-muted">
                    {formatDate(p.created_at, locale, true)} {p.mpesa_receipt && `· ${p.mpesa_receipt}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold">−{formatKES(p.amount)}</p>
                  <Badge tone={p.status === "success" ? "brand" : p.status === "pending" ? "warn" : "neutral"} className="mt-0.5 px-2 py-0.5 text-[10px]">
                    {p.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-surface-2 p-5 text-center text-sm text-muted">{t("wallet.noPayments")}</p>
        )}
      </div>

      <MpesaPaySheet
        open={proOpen}
        onClose={() => setProOpen(false)}
        amount={settings?.pro_price_kes ?? 299}
        purpose="subscription"
        onPaid={async () => {
          await refresh();
          qc.invalidateQueries({ queryKey: ["wallet", user?.id] });
        }}
      />
    </>
  );
}

export default function WalletPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <WalletInner />
      </AppShell>
    </RequireAuth>
  );
}
