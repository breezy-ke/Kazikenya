"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { displayPhone, normalizeKenyanPhone } from "@/lib/utils";
import { Button, Field, Input, PageLoader } from "@/components/ui";
import { Logo } from "@/components/bits";
import { TopBar } from "@/components/shell";

type Method = "phone" | "email";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
      <path fill="#4285F4" d="M21.4 10.6H12v3.5h5.5c-.3 1.4-1.4 2.6-2.6 3.3l3.1 2.4c1.8-1.7 2.9-4.2 2.9-7.2 0-.7-.1-1.3-.2-2z" />
      <path fill="#FBBC05" d="M6.3 14.2c-.2-.6-.3-1.3-.3-2.1s.1-1.4.3-2.1L3.1 7.6C2.4 9 2 10.5 2 12.1s.4 3.1 1.1 4.5l3.2-2.4z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.1-2.4c-.9.6-2 1-3.5 1-2.7 0-4.9-1.8-5.7-4.2l-3.2 2.4C4.8 19.6 8.1 22 12 22z" />
    </svg>
  );
}

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { user, profile, ready } = useAuth();

  const [method, setMethod] = useState<Method>("phone");
  const [step, setStep] = useState<"enter" | "code">("enter");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // Already signed in → continue.
  useEffect(() => {
    if (ready && user && profile) {
      router.replace(profile.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`);
    }
  }, [ready, user, profile, next, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const target = method === "phone" ? normalizeKenyanPhone(phone) : email.trim().toLowerCase();

  async function send() {
    setError(null);
    if (method === "phone" && !target) return setError(t("auth.invalidPhone"));
    if (method === "email" && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t("auth.invalidEmail"));
    setBusy(true);
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({ phone: `+${target}` })
        : await supabase.auth.signInWithOtp({ email: target!, options: { emailRedirectTo: redirect } });
    setBusy(false);
    if (error) {
      if (method === "phone" && /provider|sms|disabled|unsupported/i.test(error.message)) setError(t("auth.smsUnavailable"));
      else setError(error.message);
      return;
    }
    setStep("code");
    setCooldown(45);
  }

  async function verify(token = code) {
    if (token.length < 6) return;
    setError(null);
    setBusy(true);
    const { error } =
      method === "phone"
        ? await supabase.auth.verifyOtp({ phone: `+${target}`, token, type: "sms" })
        : await supabase.auth.verifyOtp({ email: target!, token, type: "email" });
    setBusy(false);
    if (error) {
      setError(t("auth.invalidCode"));
      setCode("");
      if ("vibrate" in navigator) navigator.vibrate?.(40);
    }
    // success → the effect above redirects once the profile loads
  }

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
    }
  }

  if (ready && user) return <PageLoader />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <TopBar transparent back={step === "code" ? false : "/"} />
      <div className="flex flex-1 flex-col px-6 pb-8">
        {step === "enter" ? (
          <>
            <div className="mb-8 mt-2">
              <Logo />
              <h1 className="mt-6 text-[28px] font-extrabold leading-tight tracking-tight">{t("auth.title")}</h1>
              <p className="mt-2 text-muted">{t("auth.sub")}</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="space-y-4"
            >
              {method === "phone" ? (
                <Field label={t("auth.phone")} htmlFor="phone" error={error}>
                  <div className="flex gap-2">
                    <span className="flex h-12 items-center gap-1.5 rounded-2xl border border-line bg-surface-2 px-3 text-[15px] font-semibold">
                      <span aria-hidden>🇰🇪</span> +254
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder={t("auth.phonePh")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      invalid={!!error}
                      autoFocus
                    />
                  </div>
                </Field>
              ) : (
                <Field label={t("auth.emailLabel")} htmlFor="email" error={error}>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder={t("auth.emailPh")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    invalid={!!error}
                    autoFocus
                  />
                </Field>
              )}
              <Button type="submit" block size="lg" loading={busy}>
                {busy ? t("auth.sending") : t("auth.sendCode")}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted">
              <span className="h-px flex-1 bg-line" />
              {t("common.or")}
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="space-y-3">
              <Button variant="outline" block size="lg" onClick={google} disabled={busy}>
                <GoogleIcon /> {t("auth.google")}
              </Button>
              <Button
                variant="ghost"
                block
                onClick={() => {
                  setError(null);
                  setMethod(method === "phone" ? "email" : "phone");
                }}
              >
                {method === "phone" ? <Mail className="size-5" /> : <Phone className="size-5" />}
                {method === "phone" ? t("auth.email") : t("auth.usePhone")}
              </Button>
            </div>

            <div className="mt-auto pt-10">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>
                  {t("auth.terms").split(/(Terms|Privacy Policy|Masharti|Sera ya Faragha)/).map((part, i) =>
                    /^(Terms|Masharti)$/.test(part) ? (
                      <Link key={i} href="/terms" className="font-semibold text-ink underline">
                        {part}
                      </Link>
                    ) : /^(Privacy Policy|Sera ya Faragha)$/.test(part) ? (
                      <Link key={i} href="/privacy" className="font-semibold text-ink underline">
                        {part}
                      </Link>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                </span>
              </p>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <h1 className="text-[26px] font-extrabold tracking-tight">{t("auth.codeTitle")}</h1>
            <p className="mt-2 text-muted">
              {t("auth.codeSentTo", { to: method === "phone" ? displayPhone(target) : (target ?? "") })}{" "}
              <button
                className="font-semibold text-brand underline"
                onClick={() => {
                  setStep("enter");
                  setCode("");
                  setError(null);
                }}
              >
                {t("auth.changeNumber")}
              </button>
            </p>
            {method === "email" && <p className="mt-1 text-sm text-muted">{t("auth.codeEmailHint")}</p>}

            <form
              className="mt-8 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
            >
              <Field error={error}>
                <Input
                  ref={codeRef}
                  aria-label={t("auth.codeTitle")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(v);
                    if (v.length === 6) verify(v);
                  }}
                  className="h-16 text-center text-3xl font-bold tracking-[0.5em]"
                  invalid={!!error}
                />
              </Field>
              <Button type="submit" block size="lg" loading={busy} disabled={code.length < 6}>
                {busy ? t("auth.verifying") : t("auth.verify")}
              </Button>
              <Button type="button" variant="ghost" block disabled={cooldown > 0 || busy} onClick={send}>
                {cooldown > 0 ? t("auth.resendIn", { s: cooldown }) : t("auth.resend")}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginInner />
    </Suspense>
  );
}
