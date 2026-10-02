/**
 * HolyCode registration (owner's decisions of 02.10.2026, Q2–Q8):
 *
 * - Step 1 — who the account is for and the consents: the terms and privacy policy
 *   together, the consent to personal data processing separately (152-FZ since
 *   01.09.2025 wants it as its own document).
 * - Step 2 — "who you are": an account at a provider (Apple, Google, GitHub, Yandex)
 *   or, once an SMS gateway exists, a phone. Self-registration without it is closed;
 *   an invitation is an anchor of its own (the inviting admin vouches).
 * - Step 3 — the e-mail: a new mailbox in a HolyCode domain (plus up to two aliases
 *   of the same name in other domains) or the person's own address.
 * - A new mailbox is switched on by Daenerys only after a second factor (passkey or
 *   TOTP) is set — the check is Daenerys's, not this form's.
 *
 * The wizard keeps its state between the steps and across the provider's redirect
 * in the `hc_signup` cookie. Nothing in it is trusted for access: the consents are
 * written to Daenerys's journal for the created user, a reservation id is only
 * honoured by Daenerys for the user whose e-mail is the reserved address.
 *
 * Pure helpers only — safe for client, server and tests.
 */

/** Version of the terms, privacy policy and personal-data consent the person accepts. */
export const CONSENT_VERSION = "2026-10-02";

export const SIGNUP_COOKIE_NAME = "hc_signup";
export const SIGNUP_COOKIE_MAX_AGE_SECONDS = 60 * 60;

export const COOKIE_CONSENT_COOKIE_NAME = "hc_cookie_consent";
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type SignupWho = "personal" | "team";
export type CookieConsent = "all" | "necessary";

export type SignupReservation = { id: string; address: string; aliases: string[] };

export type SignupState = {
  who: SignupWho;
  /** Accepted versions; absent until the person ticked the boxes. */
  terms?: string;
  pd?: string;
  requestId?: string;
  organization?: string;
  /** The reserved mailbox, between creating the account and switching the mailbox on. */
  reservation?: SignupReservation;
};

type Wire = {
  v: 1;
  w: SignupWho;
  t?: string;
  p?: string;
  r?: string;
  o?: string;
  m?: { i: string; a: string; x?: string[] };
};

const VERSION_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_:.-]{1,200}$/;
const ADDRESS_RE = /^[a-z0-9._-]{1,64}@[a-z0-9.-]{1,253}$/;

export function parseSignupState(raw: string | undefined | null): SignupState | null {
  if (!raw || raw.length > 4096) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") {
    return null;
  }
  const w = data as Partial<Wire>;
  if (w.v !== 1 || (w.w !== "personal" && w.w !== "team")) {
    return null;
  }
  const state: SignupState = { who: w.w };
  if (typeof w.t === "string" && VERSION_RE.test(w.t)) state.terms = w.t;
  if (typeof w.p === "string" && VERSION_RE.test(w.p)) state.pd = w.p;
  if (typeof w.r === "string" && ID_RE.test(w.r)) state.requestId = w.r;
  if (typeof w.o === "string" && ID_RE.test(w.o)) state.organization = w.o;
  if (
    w.m &&
    typeof w.m === "object" &&
    typeof w.m.i === "string" &&
    ID_RE.test(w.m.i) &&
    typeof w.m.a === "string" &&
    ADDRESS_RE.test(w.m.a)
  ) {
    const aliases = Array.isArray(w.m.x)
      ? w.m.x.filter((a): a is string => typeof a === "string" && ADDRESS_RE.test(a)).slice(0, 2)
      : [];
    state.reservation = { id: w.m.i, address: w.m.a, aliases };
  }
  return state;
}

export function serializeSignupState(state: SignupState): string {
  const wire: Wire = { v: 1, w: state.who };
  if (state.terms) wire.t = state.terms;
  if (state.pd) wire.p = state.pd;
  if (state.requestId) wire.r = state.requestId;
  if (state.organization) wire.o = state.organization;
  if (state.reservation) {
    wire.m = { i: state.reservation.id, a: state.reservation.address };
    if (state.reservation.aliases.length) wire.m.x = state.reservation.aliases.slice(0, 2);
  }
  return JSON.stringify(wire);
}

/** Both consents are given (for the current version). */
export function hasConsents(state: SignupState | null): boolean {
  return !!state && state.terms === CONSENT_VERSION && state.pd === CONSENT_VERSION;
}

export function parseCookieConsent(raw: string | undefined | null): CookieConsent | null {
  return raw === "all" || raw === "necessary" ? raw : null;
}

/** Functional cookies ("welcome back") are written unless the person chose "necessary only". */
export function functionalCookiesAllowed(consent: CookieConsent | null): boolean {
  return consent !== "necessary";
}

export type MailboxDomain = { domain: string; group: "holycode" | "product" };

export const MAX_MAILBOX_ALIASES = 2;

/** What the person typed → the local part as Daenerys checks it. */
export function normalizeLocalPart(input: string): string {
  return (input || "").trim().toLowerCase().replace(/@.*$/, "");
}

/**
 * The same rules as Daenerys (apps/daenerys-api/src/id-signup), checked here only to
 * answer at once: 4–64 characters, latin letters, digits, dot, dash, underscore,
 * starting and ending with a letter or digit, no two dots in a row. Reserved names
 * and taken addresses are Daenerys's answer.
 */
export function localPartProblem(local: string): "short" | "invalid" | null {
  if (local.length < 4) {
    return local.length && !/^[a-z0-9._-]+$/.test(local) ? "invalid" : "short";
  }
  if (local.length > 64 || !/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(local) || local.includes("..")) {
    return "invalid";
  }
  return null;
}

/** Name suggestions from the person's name: "Rodion Otletov" → rodion.otletov, rodion, r.otletov. */
export function suggestLocalParts(firstName: string, lastName: string): string[] {
  const translit = (s: string) =>
    transliterate(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const first = translit(firstName);
  const last = translit(lastName);
  const out = [
    first && last ? `${first}.${last}` : "",
    first,
    first && last ? `${first[0]}.${last}` : "",
    last && first ? `${last}.${first}` : "",
  ];
  return out.filter((s, i) => s && !localPartProblem(s) && out.indexOf(s) === i);
}

const RU: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function transliterate(input: string): string {
  return Array.from(input || "")
    .map((ch) => {
      const lower = ch.toLowerCase();
      return lower in RU ? RU[lower] : ch;
    })
    .join("");
}
