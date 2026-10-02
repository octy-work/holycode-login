import "server-only";

import { createLogger } from "@/lib/logger";
import { MailboxDomain } from "@/lib/signup";

/**
 * HolyCode: server-to-server client for Daenerys's registration API
 * (apps/daenerys-api/docs/id-signup-api.md in the holycode repository, 02.10.2026):
 * mail domains, checking and reserving a mailbox name, switching the mailbox on,
 * the consent journal.
 *
 * Authenticated with `DAENERYS_ID_SIGNUP_TOKEN`; without it every call answers
 * "unavailable" and the registration simply offers no HolyCode mailbox. The person's
 * IP goes along for Daenerys's limits. Nothing here throws.
 */

const logger = createLogger("daenerys-signup");

export const DEFAULT_SIGNUP_API_URL = "https://daenerys-api.holycode.org";

export function signupApiConfig(env: Record<string, string | undefined> = process.env) {
  const url = (env.DAENERYS_ID_SIGNUP_URL || DEFAULT_SIGNUP_API_URL).trim().replace(/\/+$/, "");
  const token = (env.DAENERYS_ID_SIGNUP_TOKEN || "").trim();
  return { url, token, enabled: !!token };
}

export type SignupApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; retryAfter?: number };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function signupRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    clientIp?: string;
    userAgent?: string;
    env?: Record<string, string | undefined>;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<SignupApiResult<T>> {
  const { url, token, enabled } = signupApiConfig(options.env);
  if (!enabled) {
    return { ok: false, status: 503, code: "signup_disabled" };
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    // Daenerys requires the person's IP on check/reserve (its limits) and hashes IP and
    // User-Agent into the consent journal; "0.0.0.0" when the proxy did not pass one.
    headers["X-HC-Client-IP"] = options.clientIp || "0.0.0.0";
    if (options.userAgent) headers["X-HC-Client-User-Agent"] = options.userAgent.slice(0, 512);
    const response = await fetchImpl(`${url}${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: "no-store",
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (response.ok) {
      return { ok: true, data: data as T };
    }
    const code =
      data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string"
        ? (data as { code: string }).code
        : data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : `http_${response.status}`;
    const retry = Number(response.headers.get("retry-after"));
    return { ok: false, status: response.status, code, ...(retry > 0 ? { retryAfter: retry } : {}) };
  } catch (error) {
    logger.warn("Daenerys signup API unreachable", { path, error: String(error) });
    return { ok: false, status: 0, code: "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** The person's IP from the proxy headers (first hop of X-Forwarded-For, or X-Real-IP). */
export function clientIpFrom(headers: { get(name: string): string | null }): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first || headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : undefined;
}

let domainsCache: { at: number; domains: MailboxDomain[] } | null = null;
const DOMAINS_TTL_MS = 5 * 60 * 1000;

/** Domains a new mailbox can be in; [] when the API is off or unreachable (then no mailbox is offered). */
export async function listSignupDomains(options: { fetchImpl?: FetchLike; now?: number } = {}): Promise<MailboxDomain[]> {
  const now = options.now ?? Date.now();
  if (domainsCache && now - domainsCache.at < DOMAINS_TTL_MS) {
    return domainsCache.domains;
  }
  const result = await signupRequest<{ domains?: { domain?: unknown; group?: unknown }[] }>("/api/id/signup/domains", {
    fetchImpl: options.fetchImpl,
  });
  if (!result.ok) {
    return [];
  }
  const domains = (result.data?.domains ?? [])
    .filter((d) => typeof d.domain === "string" && /^[a-z0-9.-]{3,253}$/.test(d.domain as string))
    .map((d) => ({
      domain: d.domain as string,
      group: d.group === "holycode" ? ("holycode" as const) : ("product" as const),
    }));
  domainsCache = { at: now, domains };
  return domains;
}

export function resetSignupDomainsCache() {
  domainsCache = null;
}

export type MailboxAvailability = {
  address: string;
  available: boolean;
  reason?: string;
  aliases: { address: string; available: boolean; reason?: string }[];
};

export function checkMailbox(input: { local: string; domain: string; aliases: string[]; clientIp?: string }) {
  return signupRequest<MailboxAvailability>("/api/id/mailbox/check", {
    body: { local: input.local, domain: input.domain, aliases: input.aliases },
    clientIp: input.clientIp,
  });
}

export function reserveMailbox(input: { local: string; domain: string; aliases: string[]; clientIp?: string }) {
  return signupRequest<{ reservation_id: string; address: string; aliases: string[]; expires_at?: string }>(
    "/api/id/mailbox/reserve",
    { body: { local: input.local, domain: input.domain, aliases: input.aliases }, clientIp: input.clientIp },
  );
}

export function activateMailbox(input: { reservationId: string; userId: string }) {
  return signupRequest<{ address: string; aliases: string[]; mailbox_id?: string }>("/api/id/mailbox/activate", {
    body: { reservation_id: input.reservationId, user_id: input.userId },
    timeoutMs: 30000,
  });
}

export function recordConsent(input: {
  userId: string;
  version: string;
  cookies: "all" | "necessary";
  clientIp?: string;
  userAgent?: string;
}) {
  return signupRequest<{ ok: boolean }>("/api/id/consent", {
    body: {
      user_id: input.userId,
      documents: { terms: input.version, privacy: input.version, pd: input.version },
      cookies: input.cookies,
    },
    clientIp: input.clientIp,
    userAgent: input.userAgent,
  });
}

/** "For a team": an organization owned by the person (Daenerys `POST /api/id/org`). */
export function createSignupOrg(input: { userId: string; name: string }) {
  return signupRequest<{ account_id: string; name: string; created?: boolean }>("/api/id/org", {
    body: { user_id: input.userId, name: input.name },
  });
}
