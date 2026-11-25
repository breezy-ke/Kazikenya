"use client";

import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui";

export default function OfflinePage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="mb-5 flex size-20 items-center justify-center rounded-[28px] bg-brand-soft text-brand-soft-ink">
        <WifiOff className="size-9" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold">{t("common.offlineTitle")}</h1>
      <p className="mt-2 max-w-xs text-muted">{t("common.offlineBody")}</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
