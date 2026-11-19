/**
 * Контур «Все · Россия · США» — один выбор на все сервисы HolyCode (решение
 * владельца 19.11.2026; эталон — switcher/contourChoice.js в монорепо
 * holycode). Выбор живёт в двух местах:
 *   • cookie `hc_contour` на `.<домен платформы>` — общий для всех сервисов браузера;
 *   • профиль ID — метаданные `holycode.contour` (их пишет PUT /api/auth/preferences
 *     Daenerys). Значение из профиля побеждает cookie.
 *
 * В профиле ID данных по контурам нет, поэтому переключатель здесь только
 * показывает общий выбор (кнопки неактивны, подсказка «В этом сервисе данные не
 * делятся по контурам»). Как показывать — одна строка `PROFILE_CONTOUR_MODE`.
 */

import { platformDomainOf } from "./services";

/**
 * Переключатель контура в полосе профиля: "disabled" — виден, но не меняется;
 * "hidden" — не показывать вовсе. Решение «скрывать» — правка этой строки.
 */
export const PROFILE_CONTOUR_MODE: "disabled" | "hidden" = "disabled";

export const CONTOUR_COOKIE = "hc_contour";
export const CONTOUR_METADATA_KEY = "holycode.contour";
export const CONTOUR_CHOICES = ["all", "ru", "us"] as const;
export type Contour = (typeof CONTOUR_CHOICES)[number];
export const DEFAULT_CONTOUR: Contour = "all";

export function normalizeContour(value: unknown): Contour | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return (CONTOUR_CHOICES as readonly string[]).includes(text) ? (text as Contour) : null;
}

/** Значение метаданных ID (строка или байты) → контур или null. */
export function parseContourPreference(raw: string | Uint8Array | undefined | null): Contour | null {
  if (raw === undefined || raw === null) return null;
  return normalizeContour(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
}

/** Что показать: профиль ID → cookie hc_contour → «Все». */
export function resolveContour(fromProfile: unknown, fromCookie: unknown): Contour {
  return normalizeContour(fromProfile) ?? normalizeContour(fromCookie) ?? DEFAULT_CONTOUR;
}

/**
 * Общая cookie на всех поддоменах платформы на год (на localhost — без Domain).
 * Значение профиля дописывается в cookie, чтобы остальные сервисы этого браузера
 * сразу получили тот же выбор.
 */
export function writeSharedCookie(
  name: string,
  value: string,
  {
    doc = typeof document !== "undefined" ? document : null,
    publicHost = "",
  }: { doc?: Document | null; publicHost?: string } = {},
): boolean {
  if (!doc || !value) return false;
  const host = typeof location !== "undefined" ? location.hostname.toLowerCase() : "";
  const domain = platformDomainOf(publicHost || host);
  const onPlatform = !!host && (host === domain || host.endsWith(`.${domain}`));
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  try {
    doc.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${onPlatform ? `; Domain=.${domain}` : ""}${secure ? "; Secure" : ""}`;
    return true;
  } catch {
    return false;
  }
}

/** Значение cookie этой страницы или "". */
export function readCookie(name: string, doc: Document | null = typeof document !== "undefined" ? document : null): string {
  try {
    const match = String(doc?.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
