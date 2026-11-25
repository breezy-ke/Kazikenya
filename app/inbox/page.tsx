"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { CONV_SELECT, type ConvRow } from "@/lib/queries";
import { AppShell, RequireAuth } from "@/components/shell";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { Avatar, VerifiedBadge } from "@/components/bits";


function InboxList() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONV_SELECT)
        .or(`buyer_id.eq.${user!.id},provider_id.eq.${user!.id}`)
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as ConvRow[];
    },
  });

  return (
    <>
      <div className="safe-top sticky top-0 z-30 border-b border-line/60 bg-bg/92 px-4 py-3 backdrop-blur-xl">
        <h1 className="text-[22px] font-extrabold tracking-tight">{t("inbox.title")}</h1>
      </div>
      {isLoading ? (
        <div className="space-y-1 p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : data?.length ? (
        <ul className="divide-y divide-line/60">
          {data.map((c) => {
            const meBuyer = c.buyer_id === user!.id;
            const other = meBuyer ? c.provider : c.buyer;
            const unread = meBuyer ? c.buyer_unread : c.provider_unread;
            return (
              <li key={c.id}>
                <Link href={`/inbox/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2 active:bg-surface-2">
                  <Avatar src={other?.avatar_url} name={other?.full_name} size={52} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={cn("truncate text-[15px]", unread ? "font-extrabold" : "font-semibold")}>{other?.full_name}</p>
                      <VerifiedBadge level={other?.verification_level ?? 0} compact />
                      <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(c.last_message_at, locale)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={cn("truncate text-sm", unread ? "font-semibold text-ink" : "text-muted")}>{c.last_message ?? "…"}</p>
                      {unread > 0 && (
                        <span className="ml-auto min-w-[20px] shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-accent-ink">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<MessageCircle className="size-8" />}
          title={t("inbox.empty")}
          body={t("inbox.emptySub")}
          action={<ButtonLink href="/explore">{t("nav.explore")}</ButtonLink>}
        />
      )}
    </>
  );
}

export default function InboxPage() {
  return (
    <RequireAuth>
      <AppShell>
        <InboxList />
      </AppShell>
    </RequireAuth>
  );
}
