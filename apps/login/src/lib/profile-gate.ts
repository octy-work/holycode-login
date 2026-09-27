/**
 * HolyCode profile: the session gate in front of /me, run by the proxy
 * (middleware) so a visitor without a live session gets a real HTTP 303 to
 * /me/enter before anything streams. The page itself keeps the full check
 * (second factor, e-mail policy); this gate answers the cheaper question
 * "is there any signed-in session in this browser at all?" — nothing for
 * curl, link previews, a cleared or expired cookie, or a session terminated
 * elsewhere.
 *
 * Runs in the proxy runtime: no connect-node transport, no next/headers —
 * Zitadel is called with a raw Connect-JSON fetch, like security-settings.ts.
 */

import { parseProfileSection, PROFILE_SHORT_PREFIX, profilePath, ProfileSection } from "./profile";

/** `/me` and `/me/<section>`; `/me/enter` (the way in) is never gated. */
export function isGatedProfilePath(pathname: string): boolean {
  if (!/^\/me(\/|$)/.test(pathname)) {
    return false;
  }
  return !/^\/me\/enter(\/|$)/.test(pathname);
}

/** The section behind a gated path, home for an unknown one (the page sends those home too). */
export function gatedSection(pathname: string): ProfileSection {
  const rest = pathname.replace(/^\/me\/?/, "");
  const segments = rest ? rest.split("/").filter(Boolean) : [];
  return parseProfileSection(segments) ?? "home";
}

/**
 * Where /me/enter should bring the person back to: the public short address
 * behind the traefik rewrite (`x-replaced-path` set), the relative profile
 * path anywhere else (Next resolves it under the basePath).
 */
export function gateReturnTarget(pathname: string, replacedPath: string | null, publicOrigin: string): string {
  const section = gatedSection(pathname);
  if (replacedPath && /^\/me(\/|$|\?)/.test(replacedPath)) {
    return `${publicOrigin}${profilePath(PROFILE_SHORT_PREFIX, section)}`;
  }
  return profilePath(PROFILE_SHORT_PREFIX, section);
}

export type SessionCookieEntry = { id: string; token: string; expirationTs?: string; changeTs?: string };

/**
 * The most recent entry of the Login V2 `sessions` cookie (the same choice as
 * getMostRecentSessionCookie: highest changeTs), or null when the cookie is
 * missing, unreadable, or that entry has already expired.
 */
export function pickMostRecentSessionCookie(raw: string | undefined | null, now = Date.now()): SessionCookieEntry | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }
  const entries = parsed.filter(
    (e): e is SessionCookieEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as SessionCookieEntry).id === "string" &&
      typeof (e as SessionCookieEntry).token === "string",
  );
  if (entries.length === 0) {
    return null;
  }
  const latest = entries.reduce((prev, current) => ((prev.changeTs ?? "") > (current.changeTs ?? "") ? prev : current));
  if (!latest.id || !latest.token) {
    return null;
  }
  const expires = Number(latest.expirationTs);
  if (latest.expirationTs && Number.isFinite(expires) && expires <= now) {
    return null;
  }
  return latest;
}

/** The parts of a GetSession answer the gate looks at (Connect JSON field names). */
type SessionJson = {
  session?: {
    expirationDate?: string;
    factors?: {
      user?: { id?: string };
      password?: { verifiedAt?: string };
      webAuthN?: { verifiedAt?: string; userVerified?: boolean };
      intent?: { verifiedAt?: string };
    };
  };
};

/**
 * A session counts as live when Zitadel still has it, it belongs to a user, it
 * has not expired, and a primary factor was verified: password, a user-verified
 * passkey, or a provider intent (the same rule as hasVerifiedPrimaryFactor).
 */
export function isLiveSession(data: unknown, now = Date.now()): boolean {
  const session = (data as SessionJson | null)?.session;
  if (!session?.factors?.user?.id) {
    return false;
  }
  if (session.expirationDate) {
    const expires = Date.parse(session.expirationDate);
    if (Number.isFinite(expires) && expires <= now) {
      return false;
    }
  }
  const f = session.factors;
  return !!(f.password?.verifiedAt || (f.webAuthN?.verifiedAt && f.webAuthN.userVerified) || f.intent?.verifiedAt);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * GetSession over Connect JSON. `false` for a session that is gone (404 /
 * permission denied), expired or not authenticated; a transport failure is
 * reported as `null` so the caller can decide (the proxy lets the page decide
 * then, rather than bouncing a signed-in person on a hiccup).
 */
export async function fetchLiveSession(input: {
  baseUrl: string;
  token: string;
  instanceHost?: string;
  publicHost?: string;
  customHeaders?: (set: (key: string, value: string) => void, remove: (key: string) => void) => void;
  cookie: SessionCookieEntry;
  fetchImpl?: FetchLike;
  now?: number;
}): Promise<boolean | null> {
  const doFetch: FetchLike = input.fetchImpl ?? ((url, init) => fetch(url, init));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${input.token}`,
  };
  if (input.instanceHost) {
    headers["x-zitadel-instance-host"] = input.instanceHost;
  }
  if (input.publicHost) {
    headers["x-zitadel-public-host"] = input.publicHost;
  }
  input.customHeaders?.(
    (key, value) => {
      headers[key] = value;
    },
    (key) => {
      delete headers[key];
    },
  );

  let response: Response;
  try {
    response = await doFetch(`${input.baseUrl}/zitadel.session.v2.SessionService/GetSession`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId: input.cookie.id, sessionToken: input.cookie.token }),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (response.status === 404 || response.status === 403 || response.status === 401) {
    // Gone, terminated, or the cookie token is stale: no session.
    return false;
  }
  if (!response.ok) {
    return null;
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  return isLiveSession(data, input.now);
}
