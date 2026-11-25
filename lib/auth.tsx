"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Profile, ProviderProfile } from "./types";
import { useI18n } from "./i18n";

interface AuthValue {
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  provider: ProviderProfile | null;
  profileLoading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  const { setLocale, locale } = useI18n();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const profileQ = useQuery({
    queryKey: ["me", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: profile, error }, { data: provider }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
        supabase.from("provider_profiles").select("*").eq("id", userId!).maybeSingle(),
      ]);
      if (error) throw error;
      return { profile: profile as Profile | null, provider: provider as ProviderProfile | null };
    },
  });

  // Keep the UI language in sync with the saved profile preference (first load only).
  const savedLocale = profileQ.data?.profile?.locale;
  useEffect(() => {
    if (savedLocale && savedLocale !== locale && !sessionStorage.getItem("kk-locale-synced")) {
      setLocale(savedLocale);
    }
    if (savedLocale) sessionStorage.setItem("kk-locale-synced", "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLocale]);

  // Persist a language change to the profile so notifications arrive in the right language.
  useEffect(() => {
    if (userId && savedLocale && savedLocale !== locale && sessionStorage.getItem("kk-locale-synced")) {
      supabase.from("profiles").update({ locale }).eq("id", userId).then(() => {
        qc.invalidateQueries({ queryKey: ["me", userId] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["me", userId] });
  }, [qc, userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
    try {
      sessionStorage.removeItem("kk-locale-synced");
    } catch {
      /* ignore */
    }
  }, [qc]);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      profile: profileQ.data?.profile ?? null,
      provider: profileQ.data?.provider ?? null,
      profileLoading: !!userId && profileQ.isLoading,
      refresh,
      signOut,
    }),
    [ready, session, profileQ.data, profileQ.isLoading, userId, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
