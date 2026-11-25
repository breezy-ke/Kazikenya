"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, sw, type DictKey } from "./dictionary";
import type { Category, Locale } from "./types";
import { errorKey, errorText } from "./utils";

type Vars = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: DictKey, vars?: Vars) => string;
  catName: (c: Pick<Category, "name_en" | "name_sw"> | null | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "kazikenya-locale";

function interpolate(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved === "en" || saved === "sw") setLocaleState(saved);
      else if (navigator.language?.toLowerCase().startsWith("sw")) setLocaleState("sw");
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = locale === "sw" ? sw : en;
    return {
      locale,
      setLocale,
      t: (key, vars) => interpolate(dict[key] ?? en[key] ?? key, vars),
      catName: (c) => (c ? (locale === "sw" ? c.name_sw : c.name_en) : ""),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Turns a Supabase/DB error into a friendly, translated message. */
export function useErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (err: unknown) => {
      const k = errorKey(err);
      return k ? t(k as DictKey) : errorText(err);
    },
    [t],
  );
}
