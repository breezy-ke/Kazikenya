"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, Check, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, firstName } from "@/lib/utils";
import { Button, Field, Input, PageLoader } from "@/components/ui";
import { CountySelect } from "@/components/county-select";
import { RequireAuth } from "@/components/shell";
import { useToast } from "@/components/toast";
import type { Locale } from "@/lib/types";

function OnboardingInner() {
  const { t, locale, setLocale } = useI18n();
  const { user, profile, refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const next = params.get("next") || "/";

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [county, setCounty] = useState<number | null>(null);
  const [town, setTown] = useState("");
  const [role, setRole] = useState<"hire" | "work" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    if (profile) {
      setName((n) => n || profile.full_name || "");
      setCounty((c) => c ?? profile.county_id);
      setTown((tw) => tw || profile.town || "");
      if (profile.onboarded && !finishing.current) router.replace(next);
    }
  }, [profile, next, router]);

  async function finish() {
    if (!user || !role) return;
    finishing.current = true;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name.trim(), county_id: county, town: town.trim() || null, locale, onboarded: true })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      finishing.current = false;
      return toast(error.message, "error");
    }
    await refresh();
    toast(t("onb.welcome", { name: firstName(name) }));
    router.replace(role === "work" ? "/me/provider?setup=1" : next);
  }

  const total = 3;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-[max(env(safe-area-inset-top),24px)]">
      <div className="mb-8 flex items-center gap-2" aria-label={t("onb.step", { n: step, total })}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition", i < step ? "bg-brand" : "bg-line")} />
        ))}
      </div>

      {step === 1 && (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return setErr(t("err.required"));
            setErr(null);
            setStep(2);
          }}
        >
          <p className="text-sm font-semibold text-accent">{t("onb.step", { n: 1, total })}</p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">{t("onb.nameTitle")}</h1>
          <div className="mt-8 space-y-6">
            <Field label={t("onb.nameLabel")} htmlFor="name" hint={t("onb.nameHint")} error={err}>
              <Input id="name" autoComplete="name" autoFocus placeholder={t("onb.namePh")} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("onb.langTitle")}>
              <div className="grid grid-cols-2 gap-3">
                {(["en", "sw"] as Locale[]).map((l) => (
                  <button
                    type="button"
                    key={l}
                    onClick={() => setLocale(l)}
                    aria-pressed={locale === l}
                    className={cn(
                      "flex h-14 items-center justify-center gap-2 rounded-2xl border-2 font-semibold transition",
                      locale === l ? "border-brand bg-brand-soft text-brand-soft-ink" : "border-line bg-surface",
                    )}
                  >
                    {locale === l && <Check className="size-4" aria-hidden />}
                    {l === "en" ? "English" : "Kiswahili"}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Button type="submit" size="lg" block className="mt-auto">
            {t("common.continue")}
          </Button>
        </form>
      )}

      {step === 2 && (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!county) return setErr(t("err.required"));
            setErr(null);
            setStep(3);
          }}
        >
          <p className="text-sm font-semibold text-accent">{t("onb.step", { n: 2, total })}</p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">{t("onb.locTitle")}</h1>
          <p className="mt-2 text-muted">{t("onb.locSub")}</p>
          <div className="mt-8 space-y-5">
            <Field label={t("common.county")} htmlFor="county" error={err}>
              <CountySelect id="county" value={county} onChange={setCounty} />
            </Field>
            <Field label={t("common.town")} htmlFor="town" optional={t("common.optional")}>
              <Input id="town" placeholder={t("common.townPh")} value={town} onChange={(e) => setTown(e.target.value)} />
            </Field>
          </div>
          <div className="mt-auto flex gap-3">
            <Button type="button" variant="secondary" size="lg" onClick={() => setStep(1)}>
              {t("common.back")}
            </Button>
            <Button type="submit" size="lg" block>
              {t("common.continue")}
            </Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="flex flex-1 flex-col">
          <p className="text-sm font-semibold text-accent">{t("onb.step", { n: 3, total })}</p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight">{t("onb.roleTitle")}</h1>
          <div className="mt-8 space-y-3">
            {(
              [
                { v: "hire", icon: Search, title: t("onb.roleHire"), sub: t("onb.roleHireSub") },
                { v: "work", icon: Briefcase, title: t("onb.roleWork"), sub: t("onb.roleWorkSub") },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setRole(o.v)}
                aria-pressed={role === o.v}
                className={cn(
                  "flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition",
                  role === o.v ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <span className={cn("flex size-12 items-center justify-center rounded-2xl", o.v === "hire" ? "bg-brand text-brand-ink" : "bg-accent text-white")}>
                  <o.icon className="size-6" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-[17px] font-bold">{o.title}</span>
                  <span className="block text-sm text-muted">{o.sub}</span>
                </span>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border-2",
                    role === o.v ? "border-brand bg-brand text-brand-ink" : "border-line",
                  )}
                >
                  {role === o.v && <Check className="size-4" aria-hidden />}
                </span>
              </button>
            ))}
            <p className="pt-1 text-center text-sm text-muted">{t("onb.roleBoth")}</p>
          </div>
          <div className="mt-auto flex gap-3 pt-6">
            <Button variant="secondary" size="lg" onClick={() => setStep(2)}>
              {t("common.back")}
            </Button>
            <Button size="lg" block disabled={!role} loading={busy} onClick={finish}>
              {t("onb.finish")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth allowUnonboarded>
      <Suspense fallback={<PageLoader />}>
        <OnboardingInner />
      </Suspense>
    </RequireAuth>
  );
}
