"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "kazikenya-theme";

const ThemeContext = createContext<{ theme: ThemePref; setTheme: (t: ThemePref) => void } | null>(null);

/** Inline script run before paint so there's no light/dark flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`;

function applyThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) meta.setAttribute("content", bg);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");

  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") setThemeState(t);
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    requestAnimationFrame(applyThemeColor);
  }, []);

  useEffect(() => {
    applyThemeColor();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => applyThemeColor();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
