"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Briefcase, Crown, Scale, ShieldCheck, Users, Wallet } from "lucide-react";
import { callPayments, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { countyName } from "@/lib/data";
import { cn, displayPhone, formatDate, formatKES } from "@/lib/utils";
import type { Booking, Dispute, Payout, PlatformSettings, Verification } from "@/lib/types";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Badge, Button, Card, Chip, Field, Input, PageLoader, Skeleton } from "@/components/ui";
import { useToast } from "@/components/toast";

type Tab = "overview" | "verifications" | "disputes" | "payouts" | "users" | "settings";

interface Stats {
  users: number; providers: number; pro_providers: number; open_jobs: number; active_bookings: number;
  escrow_held: number; gmv: number; commission: number; subscription_revenue: number;
  pending_verifications: number; open_disputes: number; by_county: { name: string; providers: number }[];
}

function Overview() {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as Stats;
    },
  });
  if (!data) return <Skeleton className="h-64 rounded-3xl" />;
  const tiles = [
    { icon: Users, label: "Users", value: data.users.toLocaleString() },
    { icon: Briefcase, label: "Providers", value: `${data.providers} (${data.pro_providers} Pro)` },
    { icon: Briefcase, label: "Open jobs", value: data.open_jobs },
    { icon: Wallet, label: "Active bookings", value: data.active_bookings },
    { icon: ShieldCheck, label: "Escrow held", value: formatKES(data.escrow_held) },
    { icon: Banknote, label: "GMV (completed)", value: formatKES(data.gmv) },
    { icon: Banknote, label: "Commission", value: formatKES(data.commission) },
    { icon: Crown, label: "Pro revenue", value: formatKES(data.subscription_revenue) },
  ];
  return (
    <div className="space-y-4">
      {(data.pending_verifications > 0 || data.open_disputes > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.pending_verifications > 0 && <Badge tone="warn">{data.pending_verifications} {t("admin.verifications")}</Badge>}
          {data.open_disputes > 0 && <Badge tone="danger">{data.open_disputes} {t("admin.disputes")}</Badge>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-4">
            <tile.icon className="size-5 text-brand" aria-hidden />
            <p className="mt-2 text-lg font-extrabold tabular-nums">{tile.value}</p>
            <p className="text-xs text-muted">{tile.label}</p>
          </Card>
        ))}
      </div>
      {!!data.by_county.length && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">Providers by county</p>
          <ul className="space-y-2">
            {data.by_county.map((c) => (
              <li key={c.name} className="flex items-center gap-3 text-sm">
                <span className="w-28 truncate">{c.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(c.providers / data.by_county[0].providers) * 100}%` }} />
                </span>
                <span className="w-8 text-right font-semibold tabular-nums">{c.providers}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Verifications() {
  const { t, locale } = useI18n();
  const errMsg = useErrorMessage();
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ["admin-verifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("verifications")
        .select("*, user:profiles!verifications_user_id_fkey(full_name,county_id)")
        .eq("status", "pending")
        .order("created_at");
      const rows = (data ?? []) as (Verification & { user: { full_name: string; county_id: number | null } })[];
      // Short-lived signed URLs for private documents.
      const withUrls = await Promise.all(
        rows.map(async (v) => {
          const paths = [v.doc_front_path, v.doc_back_path, v.selfie_path, v.cert_path].filter(Boolean) as string[];
          const { data: signed } = paths.length ? await supabase.storage.from("verifications").createSignedUrls(paths, 600) : { data: [] };
          return { ...v, urls: (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[] };
        }),
      );
      return withUrls;
    },
  });

  async function review(id: string, approve: boolean) {
    const { error } = await supabase.rpc("review_verification", { p_id: id, p_approve: approve, p_note: note[id] || null });
    if (error) return toast(errMsg(error), "error");
    qc.invalidateQueries({ queryKey: ["admin-verifications"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  }

  if (isLoading) return <Skeleton className="h-40 rounded-3xl" />;
  if (!data?.length) return <p className="p-8 text-center text-muted">{t("admin.none")}</p>;
  return (
    <ul className="space-y-3">
      {data.map((v) => (
        <li key={v.id}>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold">{v.user?.full_name}</p>
              <Badge tone="info">{v.kind === "id" ? "National ID" : v.cert_name}</Badge>
            </div>
            <p className="text-xs text-muted">
              {countyName(v.user?.county_id)} · {formatDate(v.created_at, locale, true)} {v.id_number && `· ID ${v.id_number}`}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {v.urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="size-full object-cover" />
                </a>
              ))}
            </div>
            <Input className="mt-3 h-10 text-sm" placeholder="Note to user (if rejecting)" value={note[v.id] ?? ""} onChange={(e) => setNote({ ...note, [v.id]: e.target.value })} />
            <div className="mt-3 flex gap-2">
              <Button variant="danger" size="sm" className="flex-1" onClick={() => review(v.id, false)}>
                {t("admin.reject")}
              </Button>
              <Button size="sm" className="flex-1" onClick={() => review(v.id, true)}>
                {t("admin.approve")}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Disputes() {
  const { t, locale } = useI18n();
  const errMsg = useErrorMessage();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("disputes")
        .select("*, booking:bookings(*), raiser:profiles!disputes_raised_by_fkey(full_name)")
        .eq("status", "open")
        .order("created_at");
      return (data ?? []) as (Dispute & { booking: Booking; raiser: { full_name: string } })[];
    },
  });

  async function resolve(d: Dispute & { booking: Booking }, toProvider: boolean) {
    setBusy(d.id);
    try {
      await callPayments(toProvider ? "release" : "refund", { booking_id: d.booking_id, note: "Resolved by KaziKenya team" });
      toast("Resolved");
      qc.invalidateQueries({ queryKey: ["admin-disputes"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <Skeleton className="h-40 rounded-3xl" />;
  if (!data?.length) return <p className="p-8 text-center text-muted">{t("admin.none")}</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.id}>
          <Card className="p-4">
            <Link href={`/bookings/${d.booking_id}`} className="font-bold underline">
              {d.booking.title}
            </Link>
            <p className="text-xs text-muted">
              Ref {d.booking.ref} · {formatKES(d.booking.amount)} · {formatDate(d.created_at, locale, true)}
            </p>
            <p className="mt-2 text-sm">
              <strong>{d.raiser?.full_name}:</strong> {t(`bk.disputeReason.${d.reason}`)}
            </p>
            {d.details && <p className="mt-1 text-sm text-ink-2">{d.details}</p>}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" loading={busy === d.id} onClick={() => resolve(d, false)}>
                {t("admin.refundBuyer")}
              </Button>
              <Button size="sm" className="flex-1" loading={busy === d.id} onClick={() => resolve(d, true)}>
                {t("admin.releaseProvider")}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Payouts() {
  const { t, locale } = useI18n();
  const errMsg = useErrorMessage();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payouts")
        .select("*, person:profiles!payouts_provider_id_fkey(full_name)")
        .in("status", ["pending", "processing", "failed"])
        .order("created_at");
      return (data ?? []) as (Payout & { person: { full_name: string } })[];
    },
  });

  async function processAll() {
    setBusy(true);
    try {
      const r = await callPayments<{ processed: number; b2c: boolean; live: boolean }>("process_payouts", {});
      toast(`Processed ${r.processed}${r.live && !r.b2c ? " — B2C not configured: pay manually and mark as paid" : ""}`, "info");
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string) {
    const receipt = prompt("M-Pesa transaction code for this manual payout:");
    if (!receipt) return;
    try {
      await callPayments("mark_paid", { payout_id: id, receipt: receipt.trim().toUpperCase() });
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  if (isLoading) return <Skeleton className="h-40 rounded-3xl" />;
  return (
    <div className="space-y-3">
      <Button block onClick={processAll} loading={busy}>
        {t("admin.retry")}
      </Button>
      {!data?.length ? (
        <p className="p-8 text-center text-muted">{t("admin.none")}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {p.person?.full_name} · {p.kind}
                </p>
                <p className="text-xs text-muted">
                  {displayPhone(p.phone)} · {formatDate(p.created_at, locale)} {p.result_desc && `· ${p.result_desc}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold">{formatKES(p.amount)}</p>
                <button onClick={() => markPaid(p.id)} className="text-xs font-semibold text-brand underline">
                  Mark paid
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UsersTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(id);
  }, [q]);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin-users", debounced],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_users", { p_q: debounced || null, p_limit: 100 });
      if (error) throw error;
      return data as { id: string; full_name: string; phone: string | null; email: string | null; county_id: number | null; is_provider: boolean; verification_level: number; suspended: boolean; created_at: string }[];
    },
  });
  async function toggle(id: string, suspended: boolean) {
    const { error } = await supabase.rpc("admin_set_suspended", { p_user: id, p_suspended: !suspended });
    if (error) return toast(error.message, "error");
    refetch();
  }
  return (
    <div className="space-y-3">
      <Input placeholder="Search name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? (
        <Skeleton className="h-40 rounded-3xl" />
      ) : (
        <ul className="space-y-2">
          {data?.map((u) => (
            <li key={u.id} className={cn("flex items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3", u.suspended && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {u.full_name || "—"} {u.is_provider && <Badge tone="brand" className="ml-1 px-1.5 py-0 text-[10px]">Provider</Badge>}
                </p>
                <p className="truncate text-xs text-muted">
                  {u.phone ? displayPhone(u.phone) : u.email} · {countyName(u.county_id)} · L{u.verification_level} · {formatDate(u.created_at, locale)}
                </p>
              </div>
              <Button size="sm" variant={u.suspended ? "secondary" : "danger"} onClick={() => toggle(u.id, u.suspended)}>
                {u.suspended ? t("admin.unsuspend") : t("admin.suspend")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsTab() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from("platform_settings").select("*").single().then(({ data }) => setS(data as PlatformSettings));
  }, []);
  if (!s) return <Skeleton className="h-40 rounded-3xl" />;
  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({
        commission_rate: Number(s!.commission_rate),
        pro_price_kes: Number(s!.pro_price_kes),
        free_quotes_per_month: Number(s!.free_quotes_per_month),
        auto_release_hours: Number(s!.auto_release_hours),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setBusy(false);
    if (error) return toast(error.message, "error");
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast(t("pro.saved"));
  }
  const f = (k: keyof PlatformSettings, label: string, step = "1") => (
    <Field label={label} htmlFor={k}>
      <Input id={k} type="number" step={step} value={String(s[k])} onChange={(e) => setS({ ...s, [k]: e.target.value as unknown as number })} />
    </Field>
  );
  return (
    <Card className="space-y-4 p-4">
      {f("commission_rate", "Commission rate (0.07 = 7%)", "0.005")}
      {f("pro_price_kes", "Pro price (KES / month)")}
      {f("free_quotes_per_month", "Free quotes per month")}
      {f("auto_release_hours", "Auto-release escrow after (hours)")}
      <Button block onClick={save} loading={busy}>
        {t("common.save")}
      </Button>
    </Card>
  );
}

function Admin() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    if (profile && !profile.is_admin) router.replace("/");
  }, [profile, router]);
  if (!profile?.is_admin) return <PageLoader />;
  const tabs: { v: Tab; label: string; icon: React.ElementType }[] = [
    { v: "overview", label: t("admin.overview"), icon: Banknote },
    { v: "verifications", label: t("admin.verifications"), icon: ShieldCheck },
    { v: "disputes", label: t("admin.disputes"), icon: Scale },
    { v: "payouts", label: t("admin.payouts"), icon: Wallet },
    { v: "users", label: t("admin.users"), icon: Users },
    { v: "settings", label: t("admin.settings"), icon: Crown },
  ];
  return (
    <>
      <TopBar title={t("admin.title")} back="/me" />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
        {tabs.map((x) => (
          <Chip key={x.v} active={tab === x.v} onClick={() => setTab(x.v)}>
            <x.icon className="size-4" aria-hidden /> {x.label}
          </Chip>
        ))}
      </div>
      <div className="px-4 py-4">
        {tab === "overview" && <Overview />}
        {tab === "verifications" && <Verifications />}
        {tab === "disputes" && <Disputes />}
        {tab === "payouts" && <Payouts />}
        {tab === "users" && <UsersTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <Admin />
      </AppShell>
    </RequireAuth>
  );
}
