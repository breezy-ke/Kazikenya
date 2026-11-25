"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function NetworkBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 2500);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online && !showBack) return null;
  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 px-4 pb-2 pt-[max(env(safe-area-inset-top),8px)] text-sm font-semibold ${
        online ? "bg-brand text-brand-ink" : "bg-ink text-bg"
      }`}
    >
      {!online && <WifiOff className="size-4" aria-hidden />}
      {online ? t("common.backOnline") : t("common.offlineTitle")}
    </div>
  );
}
