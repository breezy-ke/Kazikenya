"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Lock, Smartphone, XCircle } from "lucide-react";
import { callPayments, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { displayPhone, formatKES, normalizeKenyanPhone } from "@/lib/utils";
import type { Payment } from "@/lib/types";
import { Badge, Button, Field, Input, Spinner } from "./ui";
import { Sheet } from "./sheet";

type Stage = "form" | "waiting" | "success" | "failed";

/** Lipa na M-Pesa STK push flow with live status. */
export function MpesaPaySheet({
  open,
  onClose,
  amount,
  purpose,
  bookingId,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
  purpose: "escrow" | "subscription";
  bookingId?: string;
  onPaid: () => void;
}) {
  const { t } = useI18n();
  const errMsg = useErrorMessage();
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const paidOnce = useRef(false);

  const priv = useQuery({
    queryKey: ["private", user?.id],
    enabled: !!user && open,
    queryFn: async () => (await supabase.from("profile_private").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });

  useEffect(() => {
    if (open && !phone && priv.data) setPhone(displayPhone(priv.data.mpesa_phone || priv.data.phone || ""));
  }, [open, priv.data, phone]);

  useEffect(() => {
    if (!open) {
      setStage("form");
      setError(null);
      setPayment(null);
      paidOnce.current = false;
    }
  }, [open]);

  // Watch the payment row (realtime + polling fallback for flaky networks).
  useEffect(() => {
    if (!payment?.id || stage !== "waiting") return;
    let stopped = false;
    const apply = (p: Payment) => {
      setPayment(p);
      if (p.status === "success" && !paidOnce.current) {
        paidOnce.current = true;
        setStage("success");
        if ("vibrate" in navigator) navigator.vibrate?.([30, 50, 30]);
        onPaid();
      } else if (p.status === "failed" || p.status === "cancelled") {
        setStage("failed");
      }
    };
    const ch = supabase
      .channel(`pay-${payment.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${payment.id}` }, (e) =>
        apply(e.new as Payment),
      )
      .subscribe();
    const poll = setInterval(async () => {
      if (stopped) return;
      const { data } = await supabase.from("payments").select("*").eq("id", payment.id).single();
      if (data) apply(data as Payment);
    }, 3000);
    const timeout = setTimeout(() => {
      if (!paidOnce.current) setStage("failed");
    }, 120_000);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearTimeout(timeout);
      supabase.removeChannel(ch);
    };
  }, [payment?.id, stage, onPaid]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeKenyanPhone(phone);
    if (!n) return setError(t("err.INVALID_PHONE"));
    setError(null);
    setBusy(true);
    try {
      const res = await callPayments<{ payment: Payment }>("stk", { purpose, booking_id: bookingId, phone: n });
      setPayment(res.payment);
      if (res.payment.status === "success") {
        paidOnce.current = true;
        setStage("success");
        onPaid();
      } else setStage("waiting");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("mpesa.title")}>
      <div className="pb-3">
        <div className="mb-5 flex items-center justify-between rounded-2xl bg-[#00a651]/10 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#00843f] dark:text-[#4fd38a]">Lipa na M-Pesa</p>
            <p className="text-2xl font-extrabold">{formatKES(amount)}</p>
          </div>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#00a651] text-white">
            <Smartphone className="size-6" aria-hidden />
          </span>
        </div>

        {stage === "form" && (
          <form onSubmit={pay} className="space-y-4">
            <Field label={t("mpesa.phone")} htmlFor="mp" error={error}>
              <Input id="mp" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />
            </Field>
            <Button type="submit" block size="lg" loading={busy} className="bg-[#00a651] text-white hover:bg-[#008f45]">
              {t("mpesa.send")}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <Lock className="size-3.5" aria-hidden /> {purpose === "escrow" ? t("bk.payNote") : t("mpesa.secure")}
            </p>
          </form>
        )}

        {stage === "waiting" && (
          <div className="py-6 text-center" role="status">
            <div className="relative mx-auto mb-5 flex size-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#00a651]/20" />
              <span className="relative flex size-16 items-center justify-center rounded-full bg-[#00a651] text-white">
                <Smartphone className="size-8" aria-hidden />
              </span>
            </div>
            <h3 className="text-lg font-bold">{t("mpesa.waiting")}</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{t("mpesa.waitingSub", { amount: formatKES(amount) })}</p>
            <Spinner className="mx-auto mt-5" />
          </div>
        )}

        {stage === "success" && (
          <div className="animate-pop py-6 text-center" role="status">
            <CheckCircle2 className="mx-auto size-16 text-brand" aria-hidden />
            <h3 className="mt-3 text-lg font-bold">{t("mpesa.success")}</h3>
            {payment?.mpesa_receipt && <p className="mt-1 text-sm text-muted">{t("mpesa.receipt", { code: payment.mpesa_receipt })}</p>}
            {payment?.simulated && (
              <Badge tone="warn" className="mt-3">
                {t("mpesa.demo")}
              </Badge>
            )}
            <Button block size="lg" className="mt-6" onClick={onClose}>
              {t("common.done")}
            </Button>
          </div>
        )}

        {stage === "failed" && (
          <div className="py-6 text-center" role="alert">
            <XCircle className="mx-auto size-16 text-danger" aria-hidden />
            <h3 className="mt-3 text-lg font-bold">{payment?.status === "cancelled" ? t("mpesa.cancelled") : t("mpesa.failed")}</h3>
            {payment?.result_desc && <p className="mt-1 text-sm text-muted">{payment.result_desc}</p>}
            <Button block size="lg" className="mt-6" onClick={() => setStage("form")}>
              {t("common.retry")}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
