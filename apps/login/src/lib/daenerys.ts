/**
 * HolyCode profile: the browser-side client for Daenerys, the platform's
 * management server (organizations, service sessions, activity, access keys,
 * profile deletion). Contract: apps/daenerys-api/docs/profile-api.md in the
 * holycode repository (27.09.2026).
 *
 * Authentication is the `holy_auth_token` cookie on .holycode.org, which the
 * browser sends from id.holycode.org too — every request goes with
 * `credentials: "include"`. An expired access cookie is renewed once through
 * the refresh cookie (POST /api/auth/refresh), exactly as the HolyCode apps do.
 * Daenerys reflects the profile's origin in CORS with credentials; mutating
 * requests by cookie need the Origin header, which browsers send anyway.
 *
 * Nothing here throws for a missing route, a refused cookie or a network
 * failure: every call answers with `{ ok: false, reason }` and the page shows
 * the block as unavailable. Pure helpers (planning, normalising) are exported
 * for tests; `fetch`, `location` and `sessionStorage` are always passed in.
 */

export const DEFAULT_DAENERYS_API_URL = "https://daenerys-api.holycode.org";

export function daenerysApiUrl(configured?: string | null): string {
  const value = (configured ?? "").trim().replace(/\/+$/, "");
  return value || DEFAULT_DAENERYS_API_URL;
}

export type DaenerysFailure = "network" | "unauthorized" | "forbidden" | "missing" | "conflict" | "invalid" | "error";

export type DaenerysResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; reason: DaenerysFailure; code?: string; message?: string; data?: unknown };

export function classifyStatus(status: number): DaenerysFailure {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404 || status === 405 || status === 501) return "missing";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "invalid";
  return "error";
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RequestOptions = {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: unknown;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** Renew the access cookie once on 401 (default). */
  refresh?: boolean;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorParts(data: unknown): { code?: string; message?: string } {
  if (data && typeof data === "object") {
    const d = data as { message?: unknown; error?: unknown; code?: unknown };
    const code =
      typeof d.code === "string" && d.code ? d.code : typeof d.error === "string" && d.error ? d.error : undefined;
    const message = typeof d.message === "string" && d.message ? d.message : undefined;
    return { code, message };
  }
  return {};
}

export async function daenerysRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<DaenerysResult<T>> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = daenerysApiUrl(options.baseUrl);
  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
  };

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, init);
  } catch {
    return { ok: false, status: 0, reason: "network" };
  }

  if (response.status === 401 && options.refresh !== false) {
    const renewed = await renewAccessCookie({ baseUrl, fetchImpl });
    if (renewed) {
      return daenerysRequest<T>(path, { ...options, refresh: false });
    }
  }

  const data = await readJson(response);
  if (!response.ok) {
    return { ok: false, status: response.status, reason: classifyStatus(response.status), ...errorParts(data), data };
  }
  return { ok: true, status: response.status, data: data as T };
}

/** POST /api/auth/refresh with the refresh cookie; the answer sets a fresh access cookie. */
export async function renewAccessCookie({
  baseUrl,
  fetchImpl,
}: {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<boolean> {
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  try {
    const response = await doFetch(`${daenerysApiUrl(baseUrl)}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Payloads (as the profile uses them)
// ---------------------------------------------------------------------------

export type PendingDeletion = { scheduledAt: string; deleteAt: string };

export type DaenerysUser = {
  userId: string;
  name: string;
  email: string;
  username: string;
  pendingDeletion: PendingDeletion | null;
};

export type Organization = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  type: string;
};

export type DeviceInfo = { browser: string; os: string; kind: string };

export type ServiceSession = {
  id: string;
  current: boolean;
  source: string;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  device: DeviceInfo | null;
  ip: string;
  city: string;
  /** Set for the access-key entries of the same list (`source: "auth.api_key"`). */
  apiKey: { keyId: string; name: string; tokenPreview: string; scopes: string[] } | null;
};

export type ActivityEntry = {
  at: string;
  action: string;
  detail: string;
  device: DeviceInfo | null;
  ip: string;
  city: string;
  self: boolean;
};

export type ActivityPage = { entries: ActivityEntry[]; nextBefore: string };

export type ApiKeysSummary = { total: number; active: number };

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function normalizeDevice(raw: unknown): DeviceInfo | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { browser: text, os: "", kind: "" } : null;
  }
  const d = obj(raw);
  const browser = str(d.browser).trim();
  const os = str(d.os).trim();
  const kind = str(d.kind).trim();
  return browser || os || kind ? { browser, os, kind } : null;
}

export function normalizePendingDeletion(raw: unknown): PendingDeletion | null {
  const d = obj(raw);
  const deleteAt = str(d.delete_at);
  return deleteAt ? { scheduledAt: str(d.scheduled_at), deleteAt } : null;
}

export function normalizeUser(data: unknown): DaenerysUser | null {
  const d = obj(data);
  const user = obj(d.user);
  if (!str(user.user_id)) return null;
  return {
    userId: str(user.user_id),
    name: str(user.name),
    email: str(user.email),
    username: str(user.username),
    pendingDeletion: normalizePendingDeletion(d.pending_deletion) ?? normalizePendingDeletion(user.pending_deletion),
  };
}

export function normalizeAccounts(data: unknown): Organization[] {
  const d = obj(data);
  const active = str(d.active_account_id);
  return arr(d.accounts)
    .map(obj)
    .filter((a) => str(a.account_id))
    .map((a) => ({
      id: str(a.account_id),
      name: str(a.name) || str(a.slug) || str(a.account_id),
      role: str(a.role) || "member",
      active: a.is_active === true || (!!active && str(a.account_id) === active),
      type: str(a.account_type),
    }));
}

export function normalizeSessions(data: unknown): ServiceSession[] {
  return arr(obj(data).sessions)
    .map(obj)
    .filter((s) => str(s.session_id))
    .map((s) => {
      const key = obj(s.api_key);
      return {
        id: str(s.session_id),
        current: bool(s.current),
        source: str(s.source),
        issuedAt: str(s.issued_at),
        lastSeenAt: str(s.last_seen_at),
        expiresAt: str(s.expires_at),
        device: normalizeDevice(s.device),
        ip: str(s.ip),
        city: str(s.city),
        apiKey: str(key.key_id)
          ? {
              keyId: str(key.key_id),
              name: str(key.name),
              tokenPreview: str(key.token_preview),
              scopes: arr(key.scopes).map(str).filter(Boolean),
            }
          : null,
      };
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function isKeyEntry(session: Pick<ServiceSession, "source" | "apiKey">): boolean {
  return session.source === "auth.api_key" || !!session.apiKey;
}

export function normalizeActivity(data: unknown): ActivityPage {
  const d = obj(data);
  return {
    entries: arr(d.entries)
      .map(obj)
      .filter((e) => str(e.at) && str(e.action))
      .map((e) => ({
        at: str(e.at),
        action: str(e.action),
        detail: str(e.detail),
        device: normalizeDevice(e.device),
        ip: str(e.ip),
        city: str(e.city),
        self: bool(e.self),
      })),
    nextBefore: str(d.next_before),
  };
}

export function normalizeApiKeys(data: unknown): ApiKeysSummary {
  const items = arr(obj(data).items).map(obj);
  return { total: items.length, active: items.filter((k) => str(k.status) === "active").length };
}

/** Organizations an owner has to hand over first (409 transfer_ownership_first). */
export function blockingAccounts(data: unknown): { id: string; name: string; members: number }[] {
  return arr(obj(data).accounts)
    .map(obj)
    .filter((a) => str(a.account_id))
    .map((a) => ({ id: str(a.account_id), name: str(a.name) || str(a.account_id), members: Number(a.members) || 0 }));
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export function createDaenerysClient({ baseUrl, fetchImpl }: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const call = <T>(path: string, options: Omit<RequestOptions, "baseUrl" | "fetchImpl"> = {}) =>
    daenerysRequest<T>(path, { ...options, baseUrl, fetchImpl });

  return {
    me: () => call<unknown>("/api/auth/me"),
    accounts: () => call<unknown>("/api/auth/accounts"),
    /** 201 with the new organization; the answer rotates the session cookies (the session now points at it). */
    createAccount: (name: string) => call<unknown>("/api/auth/accounts", { method: "POST", body: { name } }),
    idMethods: () => call<unknown>("/api/auth/id/methods"),
    apiKeys: () => call<unknown>("/api/auth/api-keys"),
    revokeApiKey: (keyId: string) => call<unknown>(`/api/auth/api-keys/${encodeURIComponent(keyId)}`, { method: "DELETE" }),
    sessions: () => call<unknown>("/api/auth/sessions"),
    revokeSession: (sessionId: string) =>
      call<unknown>(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
    /** Every Daenerys session of the person (and, on request, every access key); the cookies are cleared by the answer. */
    logoutAll: ({ revokeKeys = false }: { revokeKeys?: boolean } = {}) =>
      call<unknown>("/api/auth/logout-all", { method: "POST", body: { revoke_keys: revokeKeys }, refresh: false }),
    activity: ({ limit = 50, before }: { limit?: number; before?: string } = {}) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set("before", before);
      return call<unknown>(`/api/auth/activity?${params}`);
    },
    requestDeletion: () => call<unknown>("/api/auth/me/delete", { method: "POST", body: { confirm: true } }),
    cancelDeletion: () => call<unknown>("/api/auth/me/delete", { method: "DELETE" }),
  };
}

export type DaenerysClient = ReturnType<typeof createDaenerysClient>;

// ---------------------------------------------------------------------------
// Silent sign-in into Daenerys
// ---------------------------------------------------------------------------

/** sessionStorage: when this tab last went through the silent (prompt=none) round trip. */
export const SILENT_SSO_KEY = "hc_profile_sso_silent";
/** Not repeated within this window: a refused cookie must not become a redirect loop. */
export const SILENT_SSO_WINDOW_MS = 2 * 60 * 1000;

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export type SsoMarker = { sso: boolean; error: string };

/** `?sso=1` / `?sso_error=<code>` that Daenerys appends when it brings the browser back. */
export function readSsoMarker(href: string | undefined): SsoMarker {
  try {
    const params = new URL(href ?? "").searchParams;
    return { sso: params.get("sso") === "1", error: (params.get("sso_error") ?? "").trim().slice(0, 40) };
  } catch {
    return { sso: false, error: "" };
  }
}

/**
 * Whether the page may go to Daenerys for a silent sign-in now. Only when the
 * cookie is missing/refused (401), never right after a return marker (Daenerys
 * just answered — with or without a session), and once per tab within the window.
 */
export function planSilentSignIn(input: {
  reason: DaenerysFailure | null;
  marker: SsoMarker;
  tabStorage: StorageLike | null | undefined;
  now?: number;
}): "go" | "skip" {
  if (input.reason !== "unauthorized") return "skip";
  if (input.marker.sso || input.marker.error) return "skip";
  if (!input.tabStorage) return "skip";
  const now = input.now ?? Date.now();
  let last: number;
  try {
    last = Number(input.tabStorage.getItem(SILENT_SSO_KEY)) || 0;
  } catch {
    return "skip";
  }
  if (last > 0 && Math.abs(now - last) < SILENT_SSO_WINDOW_MS) return "skip";
  try {
    input.tabStorage.setItem(SILENT_SSO_KEY, String(now));
  } catch {
    return "skip";
  }
  return "go";
}

/** Where Daenerys brings the browser back: the public short address of the profile. */
export function profileReturnTo(location: { origin: string; pathname: string }): string {
  const path = /^\/me(\/|$)/.test(location.pathname) ? "/me" : location.pathname.replace(/\/+$/, "") || "/me";
  return `${location.origin}${path}`;
}

export function buildSilentSignInUrl(baseUrl: string | undefined, returnTo: string): string {
  const url = new URL(`${daenerysApiUrl(baseUrl)}/api/auth/oidc/start`);
  url.searchParams.set("prompt", "none");
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

/** The address bar without our return markers, for history.replaceState. */
export function stripSsoMarker(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("sso");
  url.searchParams.delete("sso_error");
  return `${url.pathname}${url.search}${url.hash}`;
}
