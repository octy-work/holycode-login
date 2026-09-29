/**
 * Brand of this login container — runtime, per deployment.
 *
 * One image serves HolyCode ID (id.holycode.org, compose service `zitadel-login`) and the
 * organisation sign-in instances (id.octy.ru and others, service `zitadel-login-orgs`).
 * With a word-mark the card shows the HolyCode emblem and "HolyCode"; with an empty
 * word-mark ("tenant mode") it shows the logo, accent colour and icon from the instance's
 * own label policy, so id.octy.ru looks like Octy on the HolyCode layout.
 *
 * HC_BRAND_WORDMARK (runtime) → NEXT_PUBLIC_BRAND_WORDMARK (build time) → "Holy|Code".
 * The part before "|" gets the gradient.
 */
export const DEFAULT_WORDMARK = "Holy|Code";

type BrandEnv = { HC_BRAND_WORDMARK?: string; NEXT_PUBLIC_BRAND_WORDMARK?: string };

export function brandWordmarkFromEnv(env: BrandEnv = process.env as BrandEnv): string {
  if (typeof env.HC_BRAND_WORDMARK === "string") {
    return env.HC_BRAND_WORDMARK.trim();
  }
  if (typeof env.NEXT_PUBLIC_BRAND_WORDMARK === "string") {
    return env.NEXT_PUBLIC_BRAND_WORDMARK.trim();
  }
  return DEFAULT_WORDMARK;
}

export function isTenantBrand(wordmark: string | undefined): boolean {
  return typeof wordmark === "string" && wordmark.trim() === "";
}

type Rgb = [number, number, number];

/** "#abc" / "#aabbcc" → [r, g, b]; anything else → null. */
export function hexToRgb(value: string | undefined): Rgb | null {
  const hex = String(value || "")
    .trim()
    .replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as Rgb;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  }
  return null;
}

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
const mix = (color: Rgb, other: Rgb, share: number): Rgb => color.map((c, i) => c + (other[i] - c) * share) as Rgb;
const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** The --hc-* accent tokens for one theme from the label policy's primary colour. */
export function accentTokens(color: Rgb, dark: boolean): Record<string, string> {
  const light = luminance(color);
  // Links sit on the card: a lime link on white or a navy link on near-black is unreadable.
  const link = dark ? (light < 0.2 ? mix(color, WHITE, 0.4) : color) : light > 0.4 ? mix(color, BLACK, 0.5) : color;
  return {
    "--hc-p600": toHex(color),
    "--hc-p500": toHex(mix(color, WHITE, 0.12)),
    "--hc-p400": toHex(mix(color, WHITE, 0.3)),
    "--hc-link": toHex(link),
    "--hc-soft": rgba(color, dark ? 0.16 : 0.08),
    "--hc-ring": rgba(color, dark ? 0.22 : 0.16),
    "--hc-btn-from": toHex(color),
    "--hc-btn-to": toHex(mix(color, WHITE, 0.12)),
    "--hc-btn-shadow": rgba(color, 0.35),
    "--hc-btn-shadow-hover": rgba(color, 0.45),
    "--hc-on-accent": light > 0.45 ? "#0b0b12" : "#ffffff",
    "--hc-glow": `radial-gradient(70% 60% at 50% -10%, ${rgba(color, dark ? 0.24 : 0.14)}, transparent 60%)`,
  };
}

/**
 * CSS that re-colours the HolyCode theme with the instance's primary colours (tenant mode).
 * A missing colour for one theme borrows the other; no valid colour → "" (HolyCode purple stays).
 * Selectors outrank `:root` / `.dark` of globals.scss and follow the theme toggle by themselves.
 */
export function tenantAccentCss(lightPrimary?: string, darkPrimary?: string): string {
  const light = hexToRgb(lightPrimary) || hexToRgb(darkPrimary);
  const dark = hexToRgb(darkPrimary) || hexToRgb(lightPrimary);
  if (!light || !dark) {
    return "";
  }
  const block = (tokens: Record<string, string>) =>
    Object.entries(tokens)
      .map(([name, value]) => `${name}:${value};`)
      .join("");
  return `html:not(.dark){${block(accentTokens(light, false))}}html.dark{${block(accentTokens(dark, true))}}`;
}
