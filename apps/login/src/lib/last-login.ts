/**
 * HolyCode: "welcome back" — the account and the way this browser signed in last time.
 *
 * Kept in a first-party cookie on the login host (`hc_last_login`) so the sign-in
 * screen can greet a returning person with their account and put the method they
 * used last time first. It is a UI hint only: nothing in the flow trusts it (anyone
 * can write any value into their own browser), and the page never looks the stored
 * login name up — it is shown as stored and sent to the same server actions a typed
 * login name goes to. Written by the server after a successful sign-in (password,
 * IdP callback, passkey), cleared by "Not me".
 *
 * Pure helpers only (parse/serialize/merge/decide) — safe for client and server.
 */

import { IdentityProvider } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";

export const LAST_LOGIN_COOKIE_NAME = "hc_last_login";

/** ~180 days. */
export const LAST_LOGIN_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type LastLoginMethod = "password" | "passkey" | `idp:${string}`;

export type LastLogin = {
  loginName: string;
  displayName?: string;
  /** The way the last successful sign-in on this browser went. */
  method: LastLoginMethod;
  /** Other ways this account signed in on this browser before, most recent first. */
  others: LastLoginMethod[];
};

const MAX_LOGIN_NAME = 320;
const MAX_DISPLAY_NAME = 200;
const MAX_OTHERS = 3;
const METHOD_RE = /^(password|passkey|idp:[A-Za-z0-9_-]{1,64})$/;

export function isLastLoginMethod(value: unknown): value is LastLoginMethod {
  return typeof value === "string" && METHOD_RE.test(value);
}

export function idpIdOfMethod(method: LastLoginMethod | undefined): string | undefined {
  return method && method.startsWith("idp:") ? method.slice(4) : undefined;
}

export function sameLoginName(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Compact on-the-wire form: {"v":1,"l":loginName,"n":displayName,"m":method,"o":[others]} */
type Wire = { v: 1; l: string; n?: string; m: LastLoginMethod; o?: LastLoginMethod[] };

export function parseLastLogin(raw: string | undefined | null): LastLogin | null {
  if (!raw || raw.length > 2048) {
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
  if (w.v !== 1 || typeof w.l !== "string" || !isLastLoginMethod(w.m)) {
    return null;
  }
  const loginName = w.l.trim();
  if (!loginName || loginName.length > MAX_LOGIN_NAME) {
    return null;
  }
  const displayName = typeof w.n === "string" && w.n.trim() && w.n.length <= MAX_DISPLAY_NAME ? w.n.trim() : undefined;
  const others = Array.isArray(w.o)
    ? w.o
        .filter(isLastLoginMethod)
        .filter((m, i, all) => m !== w.m && all.indexOf(m) === i)
        .slice(0, MAX_OTHERS)
    : [];

  return { loginName, ...(displayName ? { displayName } : {}), method: w.m, others };
}

export function serializeLastLogin(value: LastLogin): string {
  const wire: Wire = { v: 1, l: value.loginName, m: value.method };
  if (value.displayName) {
    wire.n = value.displayName.slice(0, MAX_DISPLAY_NAME);
  }
  if (value.others.length) {
    wire.o = value.others.slice(0, MAX_OTHERS);
  }
  return JSON.stringify(wire);
}

/**
 * The record after a successful sign-in. The same account keeps its earlier ways
 * in `others` (so "Continue with Apple" stays offered after a password sign-in);
 * another account starts from scratch.
 */
export function nextLastLogin(
  previous: LastLogin | null,
  entry: { loginName: string; displayName?: string; method: LastLoginMethod },
): LastLogin {
  const loginName = entry.loginName.trim().slice(0, MAX_LOGIN_NAME);
  const displayName = entry.displayName?.trim() ? entry.displayName.trim().slice(0, MAX_DISPLAY_NAME) : undefined;
  const history = previous && sameLoginName(previous.loginName, loginName) ? [previous.method, ...previous.others] : [];
  const others = history.filter((m, i, all) => m !== entry.method && all.indexOf(m) === i).slice(0, MAX_OTHERS);

  return { loginName, ...(displayName ? { displayName } : {}), method: entry.method, others };
}

/** What the returning-person screen leads with. */
export type RememberedPrimary = { kind: "password" } | { kind: "passkey" } | { kind: "idp"; idpId: string };

export type RememberedView = {
  loginName: string;
  displayName?: string;
  primary: RememberedPrimary;
  /** Remembered providers other than the primary one, shown as full-width secondary buttons. */
  rememberedIdpIds: string[];
  /** A passkey was used here before but is not the primary way. */
  passkeyRemembered: boolean;
};

/**
 * Decides the returning-person screen from the cookie and what the instance allows
 * right now. A provider that is no longer active, or a method the login policy has
 * turned off, is skipped; with nothing usable left, the regular form is shown (null).
 */
export function resolveRememberedView(
  lastLogin: LastLogin | null,
  options: {
    allowLocalAuthentication: boolean;
    passkeysAllowed: boolean;
    identityProviders: Pick<IdentityProvider, "id">[];
  },
): RememberedView | null {
  if (!lastLogin) {
    return null;
  }
  const activeIdp = (id: string | undefined) => !!id && options.identityProviders.some((idp) => idp.id === id);
  const usable = (m: LastLoginMethod) =>
    m === "password"
      ? options.allowLocalAuthentication
      : m === "passkey"
        ? options.allowLocalAuthentication && options.passkeysAllowed
        : activeIdp(idpIdOfMethod(m));

  const ordered = [lastLogin.method, ...lastLogin.others].filter(usable);
  let primary: RememberedPrimary | null = null;
  const first = ordered[0];
  if (first === "password") {
    primary = { kind: "password" };
  } else if (first === "passkey") {
    primary = { kind: "passkey" };
  } else if (first) {
    primary = { kind: "idp", idpId: idpIdOfMethod(first) as string };
  } else if (options.allowLocalAuthentication) {
    // The remembered way is gone (provider switched off); the password still works.
    primary = { kind: "password" };
  }

  if (!primary) {
    return null;
  }

  const rememberedIdpIds = ordered
    .map(idpIdOfMethod)
    .filter((id): id is string => !!id && !(primary.kind === "idp" && primary.idpId === id));

  return {
    loginName: lastLogin.loginName,
    ...(lastLogin.displayName ? { displayName: lastLogin.displayName } : {}),
    primary,
    rememberedIdpIds,
    passkeyRemembered: primary.kind !== "passkey" && ordered.includes("passkey"),
  };
}
