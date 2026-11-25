import type { Locale } from "./types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatKES(n: number | null | undefined, withSymbol = true): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = Math.round(n).toLocaleString("en-KE");
  return withSymbol ? `KES ${s}` : s;
}

export function timeAgo(iso: string, locale: Locale = "en"): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const sw = locale === "sw";
  if (diff < 60) return sw ? "sasa hivi" : "just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return sw ? `dakika ${m} zilizopita` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return sw ? `saa ${h} zilizopita` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return sw ? `siku ${d} zilizopita` : `${d}d ago`;
  return new Date(iso).toLocaleDateString(sw ? "sw-KE" : "en-KE", { day: "numeric", month: "short" });
}

export function formatDate(iso: string | null | undefined, locale: Locale = "en", withTime = false): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(locale === "sw" ? "sw-KE" : "en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Normalise any Kenyan mobile format (07.., 01.., +254.., 254..) to 2547XXXXXXXX / 2541XXXXXXXX. */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let n = digits;
  if (n.startsWith("0") && n.length === 10) n = "254" + n.slice(1);
  else if ((n.startsWith("7") || n.startsWith("1")) && n.length === 9) n = "254" + n;
  if (/^254(7|1)\d{8}$/.test(n)) return n;
  return null;
}

export function displayPhone(p: string | null | undefined): string {
  if (!p) return "";
  const n = normalizeKenyanPhone(p);
  if (!n) return p;
  return `0${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "K";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Resize + re-encode images client-side to save users' data bundles (typically 4MB → ~150KB). */
export async function compressImage(file: File, maxSize = 1280, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
    if (!blob) return file;
    return blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Map database exception codes to translation keys. */
export function errorKey(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const codes = [
    "QUOTE_LIMIT", "JOB_NOT_OPEN", "OWN_JOB", "NOT_PROVIDER", "SUSPENDED", "NOT_ALLOWED", "NOT_AVAILABLE",
    "PROVIDER_UNAVAILABLE", "OWN_PROFILE", "ALREADY_PENDING", "BOOKING_NOT_COMPLETED", "AUTH_REQUIRED", "INVALID_PHONE",
  ];
  for (const c of codes) if (msg.includes(c)) return `err.${c}`;
  if (/duplicate key/i.test(msg)) return "err.DUPLICATE";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "err.NETWORK";
  return "";
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
}
