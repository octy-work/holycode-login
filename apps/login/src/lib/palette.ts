/**
 * Палитра HolyCode в профиле ID (решение владельца 19.11.2026; эталон —
 * switcher/palettes.js в монорепо holycode). Выбор цветов один на все сервисы:
 *   • метаданные профиля `holycode.palette` (пишет PUT /api/auth/preferences
 *     Daenerys) — побеждают;
 *   • иначе cookie `hc_palette` на `.<домен платформы>`;
 *   • иначе «Классика» (фиолетовая схема форка, ничего не меняется).
 *
 * Сервисы перекрашивают зашитые литералы в CSSOM; у форка весь акцент уже на
 * токенах `--hc-*` (globals.scss), поэтому здесь достаточно переопределить
 * токены акцента. Цвета считаются по тем же правилам, что recolorColor эталона:
 * фиолетовый текст → `accent` палитры с той же яркостью L (в OKLCH), сплошная
 * заливка средней яркости → `cta.solid`, полупрозрачные подсветки → `tint`,
 * голубой → `second`. Фон и поверхности форка не трогаем — только акцент полосы,
 * меню и кнопок. Выбора «Цвета» в меню профиля нет: палитра только применяется.
 */

export const PALETTE_COOKIE = "hc_palette";
export const PALETTE_METADATA_KEY = "holycode.palette";
export const DEFAULT_PALETTE = "classic";

type Accent = { h: number; cMul: number; cMax: number; lMin: number };
type Tint = { l: number; c: number; h: number; aMul: number };
type Cta = { solid: string; from?: string; to?: string; fg: string };
export type PaletteSpec = { accent: Accent; tint: Tint; second: { h: number; cMax: number }; cta: Cta };

/** Ключи и акцентные части `recolor` из palettes.js эталона (classic — без перекраски). */
export const PALETTE_SPECS: Readonly<Record<string, PaletteSpec | null>> = Object.freeze({
  classic: null,
  midnight: {
    accent: { h: 130, cMul: 0.8, cMax: 0.17, lMin: 0.5 },
    tint: { l: 0.45, c: 0.17, h: 272, aMul: 1.25 },
    second: { h: 202, cMax: 0.12 },
    cta: { solid: "#8dc957", from: "#a9de5c", to: "#2bc4cf", fg: "#0b0d2a" },
  },
  twitter: {
    accent: { h: 245, cMul: 0.75, cMax: 0.16, lMin: 0 },
    tint: { l: 0.62, c: 0.15, h: 245, aMul: 1 },
    second: { h: 235, cMax: 0.12 },
    cta: { solid: "#1d9bf0", fg: "#ffffff" },
  },
  claude: {
    accent: { h: 40, cMul: 0.65, cMax: 0.15, lMin: 0 },
    tint: { l: 0.62, c: 0.13, h: 40, aMul: 1 },
    second: { h: 190, cMax: 0.07 },
    cta: { solid: "#c96442", fg: "#ffffff" },
  },
  "neo-brutalism": {
    accent: { h: 27, cMul: 1, cMax: 0.23, lMin: 0 },
    tint: { l: 0.65, c: 0.22, h: 27, aMul: 1 },
    second: { h: 101, cMax: 0.19 },
    cta: { solid: "#ff3b3b", fg: "#000000" },
  },
  business: {
    accent: { h: 262, cMul: 0.6, cMax: 0.14, lMin: 0 },
    tint: { l: 0.5, c: 0.13, h: 262, aMul: 1.1 },
    second: { h: 250, cMax: 0.08 },
    cta: { solid: "#3a5bc7", fg: "#ffffff" },
  },
  neutral: {
    accent: { h: 286, cMul: 0, cMax: 0, lMin: 0 },
    tint: { l: 0.8, c: 0, h: 286, aMul: 0.7 },
    second: { h: 286, cMax: 0 },
    cta: { solid: "#fafafa", fg: "#18181b" },
  },
  octy: {
    accent: { h: 119, cMul: 0.9, cMax: 0.2, lMin: 0.8 },
    tint: { l: 0.82, c: 0.19, h: 119, aMul: 0.75 },
    second: { h: 250, cMax: 0.1 },
    cta: { solid: "#dafc04", fg: "#000000" },
  },
  blackcoach: {
    accent: { h: 70, cMul: 0.8, cMax: 0.17, lMin: 0.72 },
    tint: { l: 0.74, c: 0.16, h: 68, aMul: 0.8 },
    second: { h: 250, cMax: 0.1 },
    cta: { solid: "#f59e0b", fg: "#000000" },
  },
});

export const PALETTE_IDS: readonly string[] = Object.freeze(Object.keys(PALETTE_SPECS));

export function normalizePalette(value: unknown): string | null {
  const id = String(value ?? "")
    .trim()
    .toLowerCase();
  return PALETTE_IDS.includes(id) ? id : null;
}

/** Значение метаданных ID (строка или байты) → ключ палитры или null (незнакомый ключ — тоже null). */
export function parsePalettePreference(raw: string | Uint8Array | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  return normalizePalette(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
}

/** Профиль ID → cookie hc_palette → classic. */
export function resolvePalette(fromProfile: unknown, fromCookie: unknown): string {
  return normalizePalette(fromProfile) ?? normalizePalette(fromCookie) ?? DEFAULT_PALETTE;
}

// Исходные фиолетовые токены форка в OKLCH (L, C): #7c3aed, #8b5cf6, #a78bfa, #6d28d9; голубой #06b6d4.
const SOURCE = {
  p600: [0.541, 0.247],
  p500: [0.606, 0.219],
  p400: [0.709, 0.159],
  linkLight: [0.491, 0.241],
  cyan: [0.715, 0.126],
} as const;

const round = (x: number) => Math.round(x * 1000) / 1000;
const oklch = (l: number, c: number, h: number, alpha = 1) =>
  `oklch(${round(Math.min(1, Math.max(0, l)))} ${round(Math.max(0, c))} ${round(h)}${alpha < 1 ? ` / ${round(alpha)}` : ""})`;

/** Фиолетовый текст/рамка → акцент палитры; в светлой теме без lMin (лайм на белом не читается). */
function accent(spec: PaletteSpec, [l, c]: readonly [number, number], dark: boolean): string {
  const L = dark ? Math.max(l, spec.accent.lMin) : l;
  return oklch(L, Math.min(c * spec.accent.cMul, spec.accent.cMax), spec.accent.h);
}

const tint = (spec: PaletteSpec, alpha: number) =>
  oklch(spec.tint.l, spec.tint.c, spec.tint.h, Math.min(1, alpha * spec.tint.aMul));

/** Светлая ли заливка (у «Нейтральной» кнопка почти белая — на белой карточке её не видно). */
function isPale(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 225;
}

/** Токены акцента `--hc-*` одной темы для палитры. */
export function paletteTokens(spec: PaletteSpec, dark: boolean): Record<string, string> {
  // В светлой теме бледная кнопка меняется местами с текстом на ней.
  const swap = !dark && isPale(spec.cta.solid);
  const solid = swap ? spec.cta.fg : spec.cta.solid;
  const fg = swap ? spec.cta.solid : spec.cta.fg;
  return {
    "--hc-p600": solid,
    "--hc-p500": accent(spec, SOURCE.p500, dark),
    "--hc-p400": accent(spec, SOURCE.p400, dark),
    "--hc-link": dark ? accent(spec, SOURCE.p400, dark) : accent(spec, SOURCE.linkLight, dark),
    "--hc-soft": tint(spec, dark ? 0.16 : 0.08),
    "--hc-ring": tint(spec, dark ? 0.22 : 0.16),
    "--hc-btn-from": swap ? solid : (spec.cta.from ?? solid),
    "--hc-btn-to": swap ? solid : (spec.cta.to ?? solid),
    "--hc-btn-shadow": tint(spec, 0.35),
    "--hc-btn-shadow-hover": tint(spec, 0.45),
    "--hc-on-accent": fg,
    "--hc-cyan": oklch(SOURCE.cyan[0], Math.min(SOURCE.cyan[1], spec.second.cMax), spec.second.h),
    "--hc-glow": `radial-gradient(70% 60% at 50% -10%, ${tint(spec, dark ? 0.24 : 0.14)}, transparent 60%)`,
  };
}

/**
 * CSS палитры для `<style>` страницы: селекторы старше `:root` / `.dark` из
 * globals.scss и сами следуют переключателю темы. classic и незнакомый ключ → "".
 */
export function paletteCss(id: string | null | undefined): string {
  const spec = PALETTE_SPECS[normalizePalette(id) ?? DEFAULT_PALETTE];
  if (!spec) return "";
  const block = (tokens: Record<string, string>) =>
    Object.entries(tokens)
      .map(([name, value]) => `${name}:${value};`)
      .join("");
  return `html:not(.dark){${block(paletteTokens(spec, false))}}html.dark{${block(paletteTokens(spec, true))}}`;
}
