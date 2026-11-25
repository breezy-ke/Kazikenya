"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

const ToastContext = createContext<((text: string, kind?: Kind) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { id, kind, text }]);
    if ("vibrate" in navigator && kind === "error") navigator.vibrate?.(30);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), kind === "error" ? 5000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)]"
      >
        {items.map((i) => {
          const Icon = i.kind === "success" ? CheckCircle2 : i.kind === "error" ? AlertCircle : Info;
          return (
            <div
              key={i.id}
              role={i.kind === "error" ? "alert" : "status"}
              className={cn(
                "animate-pop pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-[var(--shadow-float)]",
                i.kind === "success" && "bg-brand text-brand-ink",
                i.kind === "error" && "bg-danger text-white",
                i.kind === "info" && "bg-ink text-bg",
              )}
            >
              <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
              <span className="leading-snug">{i.text}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
