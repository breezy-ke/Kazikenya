"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button, Spinner } from "@/components/ui";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const [error, setError] = useState<string | null>(params.get("error_description"));
  const next = params.get("next") || "/";

  useEffect(() => {
    const code = params.get("code");
    if (!code) return;
    // supabase-js usually exchanges the code automatically (detectSessionInUrl); this is a safe fallback.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        supabase.auth.exchangeCodeForSession(code).then(({ error }) => error && setError(error.message));
      }
    });
  }, [params]);

  useEffect(() => {
    if (user && profile) router.replace(profile.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`);
  }, [user, profile, next, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      {error ? (
        <>
          <p className="font-semibold text-danger">{error}</p>
          <Button onClick={() => router.replace("/login")}>{t("common.retry")}</Button>
        </>
      ) : (
        <>
          <Spinner className="size-8" />
          <p className="text-muted">{t("auth.signingIn")}</p>
        </>
      )}
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
