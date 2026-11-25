"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Camera, CheckCircle2, Clock, FileUp, Lock, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import type { Verification } from "@/lib/types";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Badge, Button, ButtonLink, Card, Field, Input, PageLoader } from "@/components/ui";
import { useToast } from "@/components/toast";

function FilePick({ label, file, onPick, accept = "image/*", capture }: { label: string; file: File | null; onPick: (f: File) => void; accept?: string; capture?: "user" | "environment" }) {
  const preview = file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
  return (
    <label className={cn("flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 border-dashed text-center text-xs font-semibold", file ? "border-brand" : "border-line text-muted")}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-full object-cover" />
      ) : file ? (
        <>
          <FileUp className="size-6 text-brand" aria-hidden />
          <span className="px-2 text-ink">{file.name}</span>
        </>
      ) : (
        <>
          <Camera className="size-6" aria-hidden />
          <span className="px-2">{label}</span>
        </>
      )}
      <input type="file" accept={accept} capture={capture} className="sr-only" aria-label={label} onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
    </label>
  );
}

function StatusPill({ v }: { v?: Verification }) {
  const { t } = useI18n();
  if (!v) return null;
  if (v.status === "approved")
    return (
      <Badge tone="brand">
        <CheckCircle2 className="size-3.5" aria-hidden /> {t("verify.approved")}
      </Badge>
    );
  if (v.status === "pending")
    return (
      <Badge tone="warn">
        <Clock className="size-3.5" aria-hidden /> {t("verify.pending")}
      </Badge>
    );
  return (
    <Badge tone="danger">
      <XCircle className="size-3.5" aria-hidden /> {t("verify.rejected")}
    </Badge>
  );
}

function VerifyInner() {
  const { t } = useI18n();
  const errMsg = useErrorMessage();
  const { user, profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const welcome = useSearchParams().get("welcome") === "1";

  const [idNumber, setIdNumber] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [certName, setCertName] = useState("");
  const [cert, setCert] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["verifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("verifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return (data ?? []) as Verification[];
    },
  });
  if (q.isLoading || !profile) return <PageLoader />;
  const latestId = q.data?.find((v) => v.kind === "id");
  const latestPro = q.data?.find((v) => v.kind === "pro");
  const level = profile.verification_level;

  async function submitId() {
    if (!user || !front || !selfie || idNumber.trim().length < 6) return toast(t("err.required"), "error");
    setBusy("id");
    try {
      const [f, b, s] = await Promise.all([
        uploadFile("verifications", user.id, front),
        back ? uploadFile("verifications", user.id, back) : Promise.resolve(null),
        uploadFile("verifications", user.id, selfie),
      ]);
      const { error } = await supabase.from("verifications").insert({
        user_id: user.id,
        kind: "id",
        id_number: idNumber.trim(),
        doc_front_path: f.path,
        doc_back_path: b?.path ?? null,
        selfie_path: s.path,
      });
      if (error) throw error;
      toast(t("verify.pending"));
      qc.invalidateQueries({ queryKey: ["verifications", user.id] });
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function submitPro() {
    if (!user || !cert || certName.trim().length < 3) return toast(t("err.required"), "error");
    setBusy("pro");
    try {
      const c = await uploadFile("verifications", user.id, cert);
      const { error } = await supabase.from("verifications").insert({ user_id: user.id, kind: "pro", cert_path: c.path, cert_name: certName.trim() });
      if (error) throw error;
      toast(t("verify.pending"));
      qc.invalidateQueries({ queryKey: ["verifications", user.id] });
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const steps = [t("verify.level0"), t("verify.level1"), t("verify.level2")];

  return (
    <>
      <TopBar title={t("verify.title")} back={welcome ? "/" : true} />
      <div className="space-y-5 px-4 py-5">
        <p className="text-muted">{t("verify.sub")}</p>

        <ol className="flex items-center gap-2">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <span className={cn("flex size-9 items-center justify-center rounded-full", i <= level ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted")}>
                {i <= level ? <CheckCircle2 className="size-5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-[11px] font-semibold leading-tight", i <= level ? "text-ink" : "text-muted")}>{s}</span>
            </li>
          ))}
        </ol>

        {/* ID verification */}
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-bold">
                <BadgeCheck className="size-5 text-info" aria-hidden /> {t("verify.idTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted">{t("verify.idSub")}</p>
            </div>
            <StatusPill v={latestId} />
          </div>
          {latestId?.status === "rejected" && latestId.reviewer_note && <p className="mt-2 rounded-xl bg-danger-soft p-2.5 text-sm text-danger">{latestId.reviewer_note}</p>}
          {level < 1 && latestId?.status !== "pending" && (
            <div className="mt-4 space-y-4">
              <Field label={t("verify.idNumber")} htmlFor="idn">
                <Input id="idn" inputMode="numeric" maxLength={10} value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <FilePick label={t("verify.front")} file={front} onPick={setFront} capture="environment" />
                <FilePick label={t("verify.back")} file={back} onPick={setBack} capture="environment" />
                <FilePick label={t("verify.selfie")} file={selfie} onPick={setSelfie} capture="user" />
              </div>
              <Button block loading={busy === "id"} onClick={submitId}>
                {t("verify.submit")}
              </Button>
            </div>
          )}
        </Card>

        {/* Pro verification */}
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-bold">
                <ShieldCheck className="size-5 text-info" aria-hidden /> {t("verify.proTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted">{t("verify.proSub")}</p>
            </div>
            <StatusPill v={latestPro} />
          </div>
          {level < 1 ? (
            <p className="mt-3 text-sm font-semibold text-muted">{t("verify.needId")}</p>
          ) : (
            level < 2 &&
            latestPro?.status !== "pending" && (
              <div className="mt-4 space-y-4">
                <Field label={t("verify.certName")} htmlFor="cn">
                  <Input id="cn" placeholder={t("verify.certNamePh")} value={certName} onChange={(e) => setCertName(e.target.value)} />
                </Field>
                <div className="w-1/2">
                  <FilePick label={t("verify.certFile")} file={cert} onPick={setCert} accept="image/*,application/pdf" />
                </div>
                <Button block loading={busy === "pro"} onClick={submitPro}>
                  {t("verify.submit")}
                </Button>
              </div>
            )
          )}
        </Card>

        <p className="flex items-start gap-2 text-xs text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("verify.privacy")}
        </p>
        {welcome && (
          <ButtonLink href="/" variant="ghost" block>
            {t("common.next")} →
          </ButtonLink>
        )}
      </div>
    </>
  );
}

export default function VerifyPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <Suspense fallback={<PageLoader />}>
          <VerifyInner />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
