/**
 * HolyCode profile (id.holycode.org/me): pure helpers shared by the page, the
 * server actions and the client components — sections and their addresses,
 * the way sign-in methods are summarised, the "account protection"
 * recommendations, and the theme preference kept in the user's ID metadata.
 *
 * No server or browser APIs here, so everything is unit-testable.
 */

import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";

export const PROFILE_SECTIONS = ["home", "data", "security", "orgs", "settings"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/**
 * The phone's bottom bar (< 768 px, owner's decision of 28.09.2026 — one bar in
 * every HolyCode service): four sections, then the "Services" button. What does
 * not fit goes to "More in Profile" in the services sheet.
 */
export const MOBILE_NAV_SECTIONS = ["home", "data", "security", "orgs"] as const satisfies readonly ProfileSection[];
export const MOBILE_MORE_SECTIONS = ["settings"] as const satisfies readonly ProfileSection[];

/** The public address of the profile: traefik rewrites id.holycode.org/me → <basePath>/me. */
export const PROFILE_SHORT_PREFIX = "/me";

/**
 * The URL segments after /me → section. `/me` is the home; `/me/data` etc. the
 * others. Anything else is unknown (null) and the page sends the person home.
 */
export function parseProfileSection(segments: string[] | undefined): ProfileSection | null {
  if (!segments || segments.length === 0) {
    return "home";
  }
  if (segments.length !== 1) {
    return null;
  }
  const [segment] = segments;
  return segment !== "home" && (PROFILE_SECTIONS as readonly string[]).includes(segment)
    ? (segment as ProfileSection)
    : null;
}

/** `/me` for the home, `/me/<section>` otherwise; never a trailing slash (Next would answer 308). */
export function profilePath(prefix: string, section: ProfileSection): string {
  const base = prefix.replace(/\/+$/, "") || PROFILE_SHORT_PREFIX;
  return section === "home" ? base : `${base}/${section}`;
}

/**
 * Which prefix the links on the page get. Behind traefik the browser is at
 * id.holycode.org/me/… and the rewrite leaves the original path in
 * `x-replaced-path`; then the short form keeps the address bar short. Anywhere
 * else (local run, direct access) the app lives under its basePath.
 */
export function resolveProfilePrefix(headers: { get(name: string): string | null }, basePath: string): string {
  const replaced = headers.get("x-replaced-path") ?? "";
  if (/^\/me(\/|$|\?)/.test(replaced)) {
    return PROFILE_SHORT_PREFIX;
  }
  return `${basePath.replace(/\/+$/, "")}${PROFILE_SHORT_PREFIX}`;
}

/** Where the browser is right now (client side): the same decision from the address bar. */
export function profilePrefixFromPathname(pathname: string, basePath: string): string {
  if (/^\/me(\/|$)/.test(pathname)) {
    return PROFILE_SHORT_PREFIX;
  }
  return `${basePath.replace(/\/+$/, "")}${PROFILE_SHORT_PREFIX}`;
}

const SECTION_PATH_RE = new RegExp(`^/me(/(${PROFILE_SECTIONS.filter((s) => s !== "home").join("|")}))?$`);

/**
 * A "return here after the flow" target may only be the profile itself: a
 * relative `/me[/section]` (resolved under the app's basePath by Next) or the
 * public `https://<this host>/me[/section]`. Anything else is refused, so the
 * cookie that carries it can never become an open redirect.
 */
export function isProfileReturnTarget(value: string | undefined | null, publicHost?: string): boolean {
  if (!value || value.length > 512) {
    return false;
  }
  if (value.startsWith("/")) {
    return !value.startsWith("//") && SECTION_PATH_RE.test(value);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) {
    return false;
  }
  if (publicHost && url.host.toLowerCase() !== publicHost.toLowerCase()) {
    return false;
  }
  return SECTION_PATH_RE.test(url.pathname);
}

// ---------------------------------------------------------------------------
// Sign-in methods
// ---------------------------------------------------------------------------

export type AuthMethodsSummary = {
  password: boolean;
  passkey: boolean;
  idp: boolean;
  totp: boolean;
  u2f: boolean;
  otpEmail: boolean;
  otpSms: boolean;
  /** Any second factor (TOTP, U2F, e-mail or SMS code). A passkey is counted separately. */
  secondFactor: boolean;
  /** Ways to get in without a password: passkey or a linked provider. */
  passwordless: boolean;
  /** How many independent ways in there are (password, passkey, provider). */
  primaryCount: number;
};

export function summarizeAuthMethods(types: readonly AuthenticationMethodType[] | undefined): AuthMethodsSummary {
  const has = (t: AuthenticationMethodType) => !!types?.includes(t);
  const password = has(AuthenticationMethodType.PASSWORD);
  const passkey = has(AuthenticationMethodType.PASSKEY);
  const idp = has(AuthenticationMethodType.IDP);
  const totp = has(AuthenticationMethodType.TOTP);
  const u2f = has(AuthenticationMethodType.U2F);
  const otpEmail = has(AuthenticationMethodType.OTP_EMAIL);
  const otpSms = has(AuthenticationMethodType.OTP_SMS);
  return {
    password,
    passkey,
    idp,
    totp,
    u2f,
    otpEmail,
    otpSms,
    secondFactor: totp || u2f || otpEmail || otpSms,
    passwordless: passkey || idp,
    primaryCount: [password, passkey, idp].filter(Boolean).length,
  };
}

export type Recommendation = "passkey" | "secondFactor" | "verifyEmail";

/**
 * "Account protection" on the home screen. A passkey is a second factor in
 * itself (possession + Touch ID), so with one there is nothing to add; the
 * second-factor advice is only given where the instance offers one.
 */
export function securityRecommendations(input: {
  methods: AuthMethodsSummary;
  emailVerified: boolean;
  passkeysAllowed: boolean;
  secondFactorsOffered: boolean;
}): Recommendation[] {
  const out: Recommendation[] = [];
  if (!input.methods.passkey && input.passkeysAllowed) {
    out.push("passkey");
  }
  if (!input.methods.passkey && !input.methods.secondFactor && input.secondFactorsOffered) {
    out.push("secondFactor");
  }
  if (!input.emailVerified) {
    out.push("verifyEmail");
  }
  return out;
}

/** Which sections carry a recommendation (the counter next to the section name). */
export function recommendationsBySection(recommendations: Recommendation[]): Partial<Record<ProfileSection, number>> {
  const out: Partial<Record<ProfileSection, number>> = {};
  for (const r of recommendations) {
    const section: ProfileSection = r === "verifyEmail" ? "data" : "security";
    out[section] = (out[section] ?? 0) + 1;
  }
  return out;
}

/**
 * Removing a way in must never leave the account without one. Passkeys and
 * providers are removed one at a time; the password only by setting a new one.
 */
export function canRemoveSignInMethod(
  methods: AuthMethodsSummary,
  kind: "passkey" | "idp",
  counts: { passkeys: number; idps: number },
): boolean {
  const remaining =
    (methods.password ? 1 : 0) +
    (kind === "passkey" ? Math.max(counts.passkeys - 1, 0) : counts.passkeys) +
    (kind === "idp" ? Math.max(counts.idps - 1, 0) : counts.idps);
  return remaining > 0;
}

// ---------------------------------------------------------------------------
// Theme preference (user metadata in the ID)
// ---------------------------------------------------------------------------

export const THEME_METADATA_KEY = "holycode.theme";
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function parseThemePreference(raw: string | Uint8Array | undefined | null): ThemePreference | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  const value = text.trim().toLowerCase();
  return (THEME_PREFERENCES as readonly string[]).includes(value) ? (value as ThemePreference) : null;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** The public handle shown in "Public data": `@event74` from a username or an e-mail-shaped username. */
export function publicHandle(username: string | undefined): string {
  const raw = (username ?? "").trim();
  if (!raw) {
    return "";
  }
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  return local ? `@${local}` : "";
}

/** Full name from the profile, falling back to the display name and the login name. */
export function fullName(
  profile: { givenName?: string; familyName?: string; displayName?: string } | undefined,
  loginName: string,
): string {
  const parts = [profile?.givenName, profile?.familyName].map((p) => (p ?? "").trim()).filter(Boolean);
  if (parts.length) {
    return parts.join(" ");
  }
  return profile?.displayName?.trim() || loginName;
}

/** What people address you as: the display name when it differs from the full name. */
export function salutation(profile: { givenName?: string; familyName?: string; displayName?: string } | undefined): string {
  const display = profile?.displayName?.trim() ?? "";
  const full = [profile?.givenName, profile?.familyName]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return display && display !== full ? display : profile?.givenName?.trim() || display;
}

const NAME_MAX = 200;

const LANGUAGE_TAG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

/**
 * The language kept in the ID, or "" when none is set: Zitadel answers "root",
 * "und" or an empty string for an unset preferredLanguage, and Intl would
 * happily display "root" as a language name.
 */
export function normalizeLanguageTag(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  const lower = value.toLowerCase();
  if (!value || lower === "root" || lower === "und" || lower === "unspecified" || !LANGUAGE_TAG_RE.test(value)) {
    return "";
  }
  return value;
}

/** Validates the name form; returns the trimmed values or the field that is wrong. */
export function validateNameForm(input: {
  givenName: string;
  familyName: string;
  displayName: string;
}):
  | { ok: true; givenName: string; familyName: string; displayName: string }
  | { ok: false; field: "givenName" | "familyName" | "displayName" } {
  const givenName = input.givenName.replace(/\s+/g, " ").trim();
  const familyName = input.familyName.replace(/\s+/g, " ").trim();
  const displayName = input.displayName.replace(/\s+/g, " ").trim();
  if (!givenName || givenName.length > NAME_MAX) {
    return { ok: false, field: "givenName" };
  }
  if (!familyName || familyName.length > NAME_MAX) {
    return { ok: false, field: "familyName" };
  }
  if (displayName.length > NAME_MAX) {
    return { ok: false, field: "displayName" };
  }
  return { ok: true, givenName, familyName, displayName: displayName || `${givenName} ${familyName}` };
}

export function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
