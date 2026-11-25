"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, SendHorizontal, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { Message } from "@/lib/types";
import { RequireAuth, TopBar } from "@/components/shell";
import { Avatar, VerifiedBadge } from "@/components/bits";
import { PageLoader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CONV_SELECT, type ConvRow } from "@/lib/queries";

const PHONE_RE = /(\+?254|0)\s?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}/;

function Chat() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const errMsg = useErrorMessage();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const conv = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select(CONV_SELECT).eq("id", id).single();
      if (error) throw error;
      return data as unknown as ConvRow;
    },
  });

  const history = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      return data as Message[];
    },
  });

  useEffect(() => {
    if (history.data) setMessages(history.data);
  }, [history.data]);

  // Realtime: new messages in this conversation.
  useEffect(() => {
    const ch = supabase
      .channel(`chat-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.sender_id !== user?.id) supabase.rpc("mark_conversation_read", { p_conv: id }).then(() => qc.invalidateQueries({ queryKey: ["badges"] }));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, user?.id, qc]);

  useEffect(() => {
    supabase.rpc("mark_conversation_read", { p_conv: id }).then(() => {
      qc.invalidateQueries({ queryKey: ["badges"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    });
  }, [id, qc]);

  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const grouped = useMemo(() => {
    const out: { day: string; items: Message[] }[] = [];
    for (const m of messages) {
      const day = formatDate(m.created_at, locale);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages, locale]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !user) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, conversation_id: id, sender_id: user.id, body, created_at: new Date().toISOString() }]);
    setText("");
    const { data, error } = await supabase.from("messages").insert({ conversation_id: id, sender_id: user.id, body }).select("*").single();
    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(body);
      return toast(errMsg(error), "error");
    }
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId);
      return without.some((m) => m.id === data.id) ? without : [...without, data as Message];
    });
    inputRef.current?.focus();
  }

  if (conv.isLoading) return <PageLoader />;
  const c = conv.data;
  if (!c || !user) return null;
  const other = c.buyer_id === user.id ? c.provider : c.buyer;
  const otherIsProvider = c.provider_id === other.id;
  const showPhoneWarning = PHONE_RE.test(text);

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <TopBar
        back="/inbox"
        title={other.full_name}
        right={
          otherIsProvider ? (
            <Link href={`/p/${other.id}`} className="mr-1 rounded-full">
              <Avatar src={other.avatar_url} name={other.full_name} size={36} />
            </Link>
          ) : (
            <Avatar src={other.avatar_url} name={other.full_name} size={36} className="mr-1" />
          )
        }
      />

      <div className="flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        <p className="mx-auto mb-4 flex max-w-sm items-center justify-center gap-1.5 rounded-xl bg-brand-soft px-3 py-2 text-center text-xs font-medium text-brand-soft-ink">
          <ShieldCheck className="size-4 shrink-0" aria-hidden /> {t("inbox.safety")}
        </p>
        {!messages.length && !history.isLoading && (
          <div className="mt-10 flex flex-col items-center text-center">
            <Avatar src={other.avatar_url} name={other.full_name} size={72} />
            <p className="mt-3 flex items-center gap-1 font-bold">
              {other.full_name} <VerifiedBadge level={other.verification_level} compact />
            </p>
          </div>
        )}
        {grouped.map((g) => (
          <div key={g.day}>
            <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{g.day}</p>
            <div className="space-y-1.5">
              {g.items.map((m, i) => {
                const mine = m.sender_id === user.id;
                const prevSame = g.items[i - 1]?.sender_id === m.sender_id;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start", !prevSame && "pt-1.5")}>
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-[15px] leading-snug",
                        mine ? "rounded-br-md bg-brand text-brand-ink" : "rounded-bl-md border border-line/70 bg-surface text-ink",
                        m.id.startsWith("tmp-") && "opacity-60",
                      )}
                    >
                      {m.body}
                      <span className={cn("ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10px]", mine ? "text-brand-ink/70" : "text-muted")}>
                        {new Date(m.created_at).toLocaleTimeString(locale === "sw" ? "sw-KE" : "en-KE", { hour: "2-digit", minute: "2-digit" })}
                        {mine && !m.id.startsWith("tmp-") && <CheckCheck className="size-3" aria-hidden />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="safe-bottom border-t border-line bg-surface/95 px-3 pt-2 backdrop-blur-xl">
        {showPhoneWarning && (
          <p className="mb-2 flex items-start gap-1.5 rounded-xl bg-warn-soft px-3 py-2 text-xs font-medium text-warn-ink">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("inbox.phoneWarning")}
          </p>
        )}
        <div className="flex items-end gap-2 pb-2">
          <textarea
            ref={inputRef}
            rows={1}
            aria-label={t("inbox.typePh")}
            placeholder={t("inbox.typePh")}
            value={text}
            maxLength={4000}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-36 min-h-12 flex-1 resize-none rounded-3xl border border-line bg-bg px-4 py-3 text-[16px] leading-snug outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label={t("inbox.send")}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition active:scale-90 disabled:opacity-40"
          >
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <Chat />
    </RequireAuth>
  );
}
