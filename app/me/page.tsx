"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck, Briefcase, ChevronRight, FileText, Gauge, Globe, HelpCircle, LogOut, Moon, Share2, Shield, Star, UserPen, Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTheme, type ThemePref } from "@/lib/theme";
import { countyName } from "@/lib/data";
import { cn } from "@/lib/utils";
import { AppShell, RequireAuth } from "@/components/shell";
import { Card } from "@/components/ui";
import { Avatar, ProBadge, VerifiedBadge } from "@/components/bits";
import { useToast } from "@/components/toast";

const VERSION = "1.0.0";

function Row({
  icon: Icon,
  label,
  href,
  onClick,
  right,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  href?: string;
  onClick?: () => void;
  right?: React.ReactNode;
  tone?: "danger";
}) {
  const inner = (
    <>
      <span className={cn("flex size-9 items-center justify-center rounded-xl", tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink-2")}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className={cn("flex-1 text-[15px] font-semibold", tone === "danger" && "text-danger")}>{label}</span>
      {right ?? (href && <ChevronRight className="size-5 text-muted" aria-hidden />)}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2";
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <span className="flex rounded-xl bg-surface-2 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={(e) => {
            e.stopPropagation();
            onChange(o.v);
          }}
          className={cn("rounded-[10px] px-2.5 py-1.5 text-xs font-bold transition", value === o.v ? "bg-surface text-ink shadow-sm" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

function Account() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { profile, provider, user, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();
  if (!profile) return null;
  const proActive = !!(provider?.is_pro && provider.pro_until && new Date(provider.pro_until) > new Date());

  async function share() {
    const url = window.location.origin;
    const text = t("me.shareText");
    if (navigator.share) navigator.share({ title: "KaziKenya", text, url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast(t("common.copied"));
    }
  }

  return (
    <>
      <div className="safe-top px-4 pb-2 pt-5">
        <h1 className="sr-only">{t("me.title")}</h1>
        <Link href="/me/edit" className="flex items-center gap-4 rounded-[var(--radius-card)] border border-line/70 bg-surface p-4 shadow-[var(--shadow-card)]">
          <Avatar src={profile.avatar_url} name={profile.full_name} size={64} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-lg font-extrabold">
              {profile.full_name} <VerifiedBadge level={profile.verification_level} compact /> {proActive && <ProBadge />}
            </p>
            <p className="truncate text-sm text-muted">{user?.phone ? `+${user.phone}` : user?.email}</p>
            <p className="truncate text-xs text-muted">{[profile.town, countyName(profile.county_id)].filter(Boolean).join(", ")}</p>
          </div>
          <UserPen className="size-5 text-muted" aria-hidden />
        </Link>
      </div>

      {!provider && (
        <div className="px-4 pt-3">
          <Link href="/me/provider?setup=1" className="hero-gradient relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-card)] p-5 text-white">
            <span className="kente-dots absolute inset-0 opacity-40" aria-hidden />
            <Briefcase className="relative size-8 shrink-0" aria-hidden />
            <span className="relative flex-1">
              <span className="block font-bold">{t("me.becomeProvider")}</span>
              <span className="block text-sm text-white/80">{t("me.becomeProviderSub")}</span>
            </span>
            <ChevronRight className="relative size-5" aria-hidden />
          </Link>
        </div>
      )}

      <div className="space-y-4 px-4 py-4">
        <Card className="divide-y divide-line/70 overflow-hidden">
          {provider && <Row icon={Briefcase} label={t("me.providerProfile")} href="/me/provider" />}
          {provider && <Row icon={UserPen} label={t("me.viewPublic")} href={`/p/${profile.id}`} />}
          <Row
            icon={BadgeCheck}
            label={t("me.verify")}
            href="/verify"
            right={
              <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                {t(`verify.level${Math.min(2, profile.verification_level)}` as "verify.level0")}
                <ChevronRight className="size-5" aria-hidden />
              </span>
            }
          />
          <Row icon={Wallet} label={t("me.wallet")} href="/wallet" />
        </Card>

        <Card className="divide-y divide-line/70 overflow-hidden">
          <Row
            icon={Globe}
            label={t("me.language")}
            onClick={() => setLocale(locale === "en" ? "sw" : "en")}
            right={
              <Toggle
                value={locale}
                onChange={setLocale}
                options={[
                  { v: "en", label: "EN" },
                  { v: "sw", label: "SW" },
                ]}
              />
            }
          />
          <Row
            icon={Moon}
            label={t("me.theme")}
            right={
              <Toggle<ThemePref>
                value={theme}
                onChange={setTheme}
                options={[
                  { v: "system", label: t("me.theme.system") },
                  { v: "light", label: t("me.theme.light") },
                  { v: "dark", label: t("me.theme.dark") },
                ]}
              />
            }
          />
        </Card>

        <Card className="divide-y divide-line/70 overflow-hidden">
          <Row icon={Share2} label={t("me.share")} onClick={share} />
          <Row icon={Star} label={t("me.rate")} href="https://play.google.com/store/apps/details?id=ke.co.kazikenya.app" />
          <Row icon={HelpCircle} label={t("me.help")} href="mailto:support@kazikenya.co.ke" />
          <Row icon={FileText} label={t("me.terms")} href="/terms" />
          <Row icon={Shield} label={t("me.privacy")} href="/privacy" />
          {profile.is_admin && <Row icon={Gauge} label={t("me.admin")} href="/admin" />}
        </Card>

        <Card className="overflow-hidden">
          <Row
            icon={LogOut}
            label={t("common.signOut")}
            tone="danger"
            onClick={async () => {
              await signOut();
              router.replace("/");
            }}
          />
        </Card>
        <p className="pt-2 text-center text-xs text-muted">
          KaziKenya · {t("me.version", { v: VERSION })}
        </p>
      </div>
    </>
  );
}

export default function MePage() {
  return (
    <RequireAuth>
      <AppShell>
        <Account />
      </AppShell>
    </RequireAuth>
  );
}
