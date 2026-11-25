"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Bell, BellRing, Briefcase, Crown, MessageSquareQuote, Scale, Star, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Button, EmptyState, Skeleton } from "@/components/ui";

const ICON: Record<string, React.ElementType> = {
  quote: MessageSquareQuote,
  booking: Briefcase,
  payout: Wallet,
  review: Star,
  verification: BadgeCheck,
  dispute: Scale,
  pro: Crown,
  job: Briefcase,
};

function List() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPerm("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as AppNotification[];
    },
  });

  async function markAll() {
    await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications", user!.id] });
    qc.invalidateQueries({ queryKey: ["badges", user!.id] });
  }

  async function open(n: AppNotification) {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["badges", user!.id] });
      qc.invalidateQueries({ queryKey: ["notifications", user!.id] });
    }
    if (n.link) router.push(n.link);
  }

  const unread = data?.filter((n) => !n.read).length ?? 0;

  return (
    <>
      <TopBar
        title={t("notif.title")}
        right={
          unread > 0 ? (
            <Button variant="ghost" size="sm" onClick={markAll}>
              {t("notif.markAll")}
            </Button>
          ) : undefined
        }
      />
      {perm === "default" && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-accent-soft p-4 text-accent-soft-ink">
          <BellRing className="size-6 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-bold">{t("notif.enablePush")}</p>
            <p className="text-xs opacity-90">{t("notif.enablePushSub")}</p>
          </div>
          <Button size="sm" variant="accent" onClick={() => Notification.requestPermission().then(setPerm)}>
            {t("notif.enable")}
          </Button>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : data?.length ? (
        <ul className="py-2">
          {data.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button
                  onClick={() => open(n)}
                  className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2", !n.read && "bg-brand-soft/40")}
                >
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", n.read ? "bg-surface-2 text-muted" : "bg-brand text-brand-ink")}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[15px]", n.read ? "font-semibold" : "font-bold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.body}</span>}
                    <span className="mt-1 block text-xs text-muted">{timeAgo(n.created_at, locale)}</span>
                  </span>
                  {!n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Bell className="size-8" />} title={t("notif.empty")} />
      )}
    </>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <List />
      </AppShell>
    </RequireAuth>
  );
}
