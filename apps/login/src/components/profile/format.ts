import { DeviceInfo } from "@/lib/daenerys";

/** "27.09.2026, 19:31" in the page's locale; the raw text when the value is not a date. */
export function formatWhen(iso: string | undefined, locale: string): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

export function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

/** Less than two minutes ago counts as "now". */
export function isJustNow(iso: string | undefined, now = Date.now()): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && now - ms < 2 * 60 * 1000;
}

/** "Mac · Safari", "iPhone · Safari", or what is known of the device. */
export function describeDevice(device: DeviceInfo | null): string {
  if (!device) return "";
  const kind = device.kind.toLowerCase() === "unknown" ? "" : device.kind;
  return [device.os || kind, device.browser].filter(Boolean).join(" · ");
}

/** Joins the non-empty parts with " · ". */
export function dots(...parts: (string | undefined | null | false)[]): string {
  return parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");
}
