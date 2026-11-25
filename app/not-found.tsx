"use client";

import { SearchX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="mb-5 flex size-20 items-center justify-center rounded-[28px] bg-accent-soft text-accent-soft-ink">
        <SearchX className="size-9" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold">{t("common.notFound")}</h1>
      <ButtonLink href="/" className="mt-6">
        {t("common.goHome")}
      </ButtonLink>
    </div>
  );
}
