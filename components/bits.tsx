"use client";

import {
  BadgeCheck, BrickWall, Bug, Calculator, Camera, Car, CarFront, ChefHat, Clapperboard, Code, Flame,
  GraduationCap, Hammer, Headset, House, Megaphone, PaintRoller, Palette, PartyPopper, PenLine, Ruler,
  Scissors, Shield, ShieldCheck, Shirt, Smartphone, Sparkles, Sprout, Star, Sun, Truck, WashingMachine,
  Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { BookingStatus } from "@/lib/types";
import { Badge } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  wrench: Wrench, zap: Zap, sparkles: Sparkles, shirt: Shirt, house: House, hammer: Hammer,
  "brick-wall": BrickWall, "paint-roller": PaintRoller, car: Car, "washing-machine": WashingMachine,
  smartphone: Smartphone, scissors: Scissors, ruler: Ruler, truck: Truck, sprout: Sprout, flame: Flame,
  sun: Sun, bug: Bug, "graduation-cap": GraduationCap, "chef-hat": ChefHat, "party-popper": PartyPopper,
  camera: Camera, "car-front": CarFront, shield: Shield, code: Code, palette: Palette, "pen-line": PenLine,
  megaphone: Megaphone, clapperboard: Clapperboard, calculator: Calculator, headset: Headset,
};

/** Warm, distinct tile colours so the category grid scans quickly. */
const TILE_TONES = [
  "bg-[#e3f3ea] text-[#0b5233] dark:bg-[#143224] dark:text-[#7fe0ad]",
  "bg-[#ffeedd] text-[#9a3f02] dark:bg-[#3a2212] dark:text-[#ffb986]",
  "bg-[#e6effd] text-[#1d4f9c] dark:bg-[#14243d] dark:text-[#8db8ff]",
  "bg-[#fdf3d7] text-[#7a5200] dark:bg-[#33290f] dark:text-[#f5cf6b]",
  "bg-[#f6e6f1] text-[#8a2a6b] dark:bg-[#33162a] dark:text-[#f2a3d6]",
  "bg-[#e5f5f6] text-[#11646b] dark:bg-[#10302f] dark:text-[#7ddbe0]",
];

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const I = ICONS[icon] ?? Wrench;
  return <I className={className} aria-hidden />;
}

export function CategoryTile({ icon, index, className }: { icon: string; index: number; className?: string }) {
  return (
    <span className={cn("flex items-center justify-center rounded-2xl", TILE_TONES[index % TILE_TONES.length], className)}>
      <CategoryIcon icon={icon} className="size-6" />
    </span>
  );
}

export function Avatar({
  src,
  name,
  size = 48,
  className,
  ring,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const style = { width: size, height: size, fontSize: Math.max(12, size * 0.36) };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={style}
        className={cn("shrink-0 rounded-full bg-surface-2 object-cover", ring && "ring-2 ring-surface", className)}
      />
    );
  }
  return (
    <span
      style={style}
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-strong font-bold text-brand-ink",
        ring && "ring-2 ring-surface",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= Math.round(value) ? "fill-gold text-gold" : "fill-line text-line"}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function RatingInline({ avg, count }: { avg: number; count: number }) {
  const { t } = useI18n();
  if (!count) return <Badge tone="accent">{t("badge.new")}</Badge>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold">
      <Star className="size-4 fill-gold text-gold" aria-hidden />
      {Number(avg).toFixed(1)}
      <span className="font-normal text-muted">({count})</span>
    </span>
  );
}

export function VerifiedBadge({ level, compact }: { level: number; compact?: boolean }) {
  const { t } = useI18n();
  if (level <= 0) return null;
  const label = level >= 2 ? t("badge.proVerified") : t("badge.idVerified");
  const Icon = level >= 2 ? ShieldCheck : BadgeCheck;
  if (compact) {
    return (
      <span title={label} aria-label={label} className="inline-flex text-info">
        <Icon className="size-[18px] fill-info/15" />
      </span>
    );
  }
  return (
    <Badge tone="info">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Badge>
  );
}

export function ProBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center rounded-md bg-gradient-to-r from-accent to-gold px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
      {t("badge.pro")}
    </span>
  );
}

const STATUS_TONE: Record<BookingStatus, "brand" | "accent" | "neutral" | "danger" | "info" | "warn"> = {
  requested: "warn",
  declined: "neutral",
  awaiting_payment: "accent",
  funded: "info",
  in_progress: "info",
  delivered: "accent",
  completed: "brand",
  cancelled: "neutral",
  disputed: "danger",
  refunded: "neutral",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <LogoMark className="size-8" />
      <span className={cn("text-[19px]", light ? "text-white" : "text-ink")}>
        Kazi<span className="text-accent">Kenya</span>
      </span>
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill="#0E5C39" />
      <path d="M20 16v32M20 33l15-17M26 27l13 21" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="46" cy="19" r="5.5" fill="#F2711C" />
    </svg>
  );
}
