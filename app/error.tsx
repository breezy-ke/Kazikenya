"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button, ButtonLink } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="mb-5 flex size-20 items-center justify-center rounded-[28px] bg-danger-soft text-danger">
        <TriangleAlert className="size-9" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold">{t("common.somethingWrong")}</h1>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>{t("common.retry")}</Button>
        <ButtonLink href="/" variant="outline">
          {t("common.goHome")}
        </ButtonLink>
      </div>
    </div>
  );
}
