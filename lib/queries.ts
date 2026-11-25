"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type { Category, Conversation, MiniProfile, PlatformSettings, ProviderSearchRow } from "./types";

/** Booking row with both parties' public profile embedded. */
export const BOOKING_SELECT =
  "*, buyer:profiles!bookings_buyer_id_fkey(id,full_name,avatar_url,verification_level,county_id,town), provider:profiles!bookings_provider_profile_fkey(id,full_name,avatar_url,verification_level,county_id,town)";

export type ConvRow = Conversation & { buyer: MiniProfile; provider: MiniProfile };
export const CONV_SELECT =
  "*, buyer:profiles!conversations_buyer_id_fkey(id,full_name,avatar_url,verification_level,county_id,town), provider:profiles!conversations_provider_id_fkey(id,full_name,avatar_url,verification_level,county_id,town)";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort");
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useCategoryMap() {
  const { data } = useCategories();
  const map = new Map<number, Category>();
  data?.forEach((c) => map.set(c.id, c));
  return map;
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("*").single();
      if (error) throw error;
      return data as PlatformSettings;
    },
  });
}

export interface SearchParams {
  category?: number | null;
  county?: number | null;
  q?: string;
  remote?: boolean | null;
  verified?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
}

export async function searchProviders(p: SearchParams) {
  const { data, error } = await supabase.rpc("search_providers", {
    p_category: p.category ?? null,
    p_county: p.county ?? null,
    p_q: p.q?.trim() || null,
    p_remote: p.remote ?? null,
    p_verified: p.verified ?? false,
    p_sort: p.sort ?? "recommended",
    p_limit: p.limit ?? 20,
    p_offset: p.offset ?? 0,
  });
  if (error) throw error;
  return data as ProviderSearchRow[];
}

export function useProviderSearch(p: SearchParams, enabled = true) {
  return useQuery({
    queryKey: ["search", p],
    enabled,
    queryFn: () => searchProviders(p),
    placeholderData: (prev) => prev,
  });
}

/** Unread notifications + messages, kept live with Supabase Realtime. */
export function useBadges() {
  const { user } = useAuth();
  const uid = user?.id;

  const q = useQuery({
    queryKey: ["badges", uid],
    enabled: !!uid,
    staleTime: 15_000,
    queryFn: async () => {
      const [n, convs] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid!).eq("read", false),
        supabase.from("conversations").select("buyer_id, buyer_unread, provider_unread").or(`buyer_id.eq.${uid},provider_id.eq.${uid}`),
      ]);
      const messages = (convs.data ?? []).reduce(
        (sum, c: { buyer_id: string; buyer_unread: number; provider_unread: number }) =>
          sum + (c.buyer_id === uid ? c.buyer_unread : c.provider_unread),
        0,
      );
      return { notifications: n.count ?? 0, messages };
    },
  });

  return q.data ?? { notifications: 0, messages: 0 };
}

/** Single app-wide realtime subscription (mounted once in Providers). */
export function RealtimeBridge() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`badges-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ["badges", uid] });
        qc.invalidateQueries({ queryKey: ["notifications", uid] });
        if (payload.eventType === "INSERT") {
          qc.invalidateQueries({ queryKey: ["bookings"] });
          qc.invalidateQueries({ queryKey: ["booking"] });
          qc.invalidateQueries({ queryKey: ["job"] });
          qc.invalidateQueries({ queryKey: ["me", uid] });
          const n = payload.new as { title?: string; body?: string };
          if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
            navigator.serviceWorker?.ready
              .then((reg) => reg.showNotification(n.title ?? "KaziKenya", { body: n.body, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png" }))
              .catch(() => {});
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["badges", uid] });
        qc.invalidateQueries({ queryKey: ["conversations", uid] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);

  return null;
}
