"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./ui";
import { useI18n } from "@/lib/i18n";

/** Mobile-first bottom sheet (centered dialog on wide screens). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={t("common.close")} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="animate-sheet relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-surface pb-[max(env(safe-area-inset-bottom),16px)] shadow-[var(--shadow-float)] outline-none sm:rounded-[28px]"
      >
        <div className="sticky top-0 z-10 bg-surface/95 px-5 pb-2 pt-3 backdrop-blur">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
            <IconButton label={t("common.close")} onClick={onClose} className="-mr-2">
              <X className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="px-5 pb-2">{children}</div>
      </div>
    </div>
  );
}
