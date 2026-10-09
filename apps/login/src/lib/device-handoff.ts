import { createLogger } from "@/lib/logger";
import { timestampMs } from "@zitadel/client";
import { createPublicKey, randomBytes, verify } from "crypto";

const logger = createLogger("device-handoff");

/**
 * The ID session for the app window after a device sign-in (HolyAgent).
 *
 * The person approves the device in the system browser, so the ID session lives
 * there; the app's own window (WKWebView, its own cookies) would ask to sign in
 * again when it opens the profile. On approval the browser's session is noted
 * here; Daenerys, finishing the same sign-in, proves it with the fresh id_token
 * of the device client and gets a one-time link; the app window opens it, gets
 * the same session cookie and goes back. Only the device that ran the flow ever
 * sees that id_token, so only it gets the link.
 *
 * In memory: one login container; a restart only means "sign in in the window
 * once more". Kept on globalThis so route handlers and server actions share it.
 */

export type HandoffSession = {
  id: string;
  token: string;
  loginName: string;
  organization?: string;
  creationTs: string;
  expirationTs: string;
  changeTs: string;
};

type Approval = { userId: string; session: HandoffSession; at: number };
type Handoff = { userId: string; session: HandoffSession; exp: number };

const APPROVAL_TTL_MS = 10 * 60_000;
const HANDOFF_TTL_MS = 5 * 60_000;

type Store = { approvals: Map<string, Approval>; handoffs: Map<string, Handoff> };
const STORE_KEY = Symbol.for("holycode.deviceHandoff");

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { approvals: new Map(), handoffs: new Map() };
  }
  return g[STORE_KEY]!;
}

function sweep(now: number) {
  const { approvals, handoffs } = store();
  approvals.forEach((a, key) => {
    if (a.at + APPROVAL_TTL_MS <= now) approvals.delete(key);
  });
  handoffs.forEach((h, key) => {
    if (h.exp <= now) handoffs.delete(key);
  });
}

/** A device request was approved with this browser session. */
export function rememberDeviceApproval(userId: string, session: HandoffSession, now = Date.now()) {
  if (!userId || !session?.id || !session?.token) return;
  sweep(now);
  store().approvals.set(userId, { userId, session, at: now });
  logger.info("device approval noted", { user: userId.slice(-6) });
}

/** One-time code for the latest approval of this person, if it is fresh. */
export function mintHandoff(userId: string, now = Date.now()): string | undefined {
  sweep(now);
  const { approvals, handoffs } = store();
  const approval = approvals.get(userId);
  if (!approval) {
    logger.warn("no device approval for handoff", { user: userId.slice(-6), approvals: approvals.size });
    return undefined;
  }
  approvals.delete(userId);
  const code = randomBytes(32).toString("base64url");
  handoffs.set(code, { userId, session: approval.session, exp: now + HANDOFF_TTL_MS });
  logger.info("handoff link issued", { user: userId.slice(-6) });
  return code;
}

/** The session behind a one-time code; the code is gone after this. */
export function consumeHandoff(code: string, now = Date.now()): HandoffSession | undefined {
  if (!code) return undefined;
  sweep(now);
  const { handoffs } = store();
  const handoff = handoffs.get(code);
  if (!handoff) {
    logger.warn("handoff link unknown or used");
    return undefined;
  }
  handoffs.delete(code);
  const live = handoff.exp > now;
  logger.info(live ? "handoff link used" : "handoff link expired", { user: handoff.userId.slice(-6) });
  return live ? handoff.session : undefined;
}

/**
 * A code for a session the caller already holds the token of (Daenerys, after
 * a password sign-in it ran through the Session API): no device approval is
 * needed, the token itself proves the session is theirs. Nothing new is
 * granted — the same cookie entry the browser would get for that session.
 */
export function mintHandoffForSession(userId: string, session: HandoffSession, now = Date.now()): string | undefined {
  if (!userId || !session?.id || !session?.token) return undefined;
  sweep(now);
  const code = randomBytes(32).toString("base64url");
  store().handoffs.set(code, { userId, session, exp: now + HANDOFF_TTL_MS });
  logger.info("handoff link issued for a session", { user: userId.slice(-6) });
  return code;
}

type ZitadelTimestamp = Parameters<typeof timestampMs>[0];
type ZitadelSessionLike = {
  factors?: {
    user?: { id?: string; loginName?: string; organizationId?: string };
    password?: { verifiedAt?: ZitadelTimestamp };
    webAuthN?: { verifiedAt?: ZitadelTimestamp };
    intent?: { verifiedAt?: ZitadelTimestamp };
  };
  creationDate?: ZitadelTimestamp;
  expirationDate?: ZitadelTimestamp;
  changeDate?: ZitadelTimestamp;
};

function tsString(value: ZitadelTimestamp | undefined): string {
  return value ? `${timestampMs(value)}` : "";
}

/**
 * The cookie entry for a Zitadel session (GET /v2/sessions/{id} with its
 * token). Only a session someone actually signed in to — password, passkey or
 * provider checked — and that has not expired; otherwise why not.
 */
export function handoffSessionFromZitadel(
  session: ZitadelSessionLike | undefined,
  token: string,
  now = Date.now(),
): { userId: string; session: HandoffSession } | { error: string } {
  const user = session?.factors?.user;
  const userId = String(user?.id || "");
  const loginName = String(user?.loginName || "");
  if (!session || !userId || !loginName || !token) return { error: "no_user" };
  const factors = session.factors!;
  if (!factors.password?.verifiedAt && !factors.webAuthN?.verifiedAt && !factors.intent?.verifiedAt) {
    return { error: "unchecked" };
  }
  const expirationTs = tsString(session.expirationDate);
  if (expirationTs && Number(expirationTs) <= now) return { error: "expired" };
  const entry: HandoffSession = {
    id: String((session as { id?: string }).id || ""),
    token,
    loginName,
    creationTs: tsString(session.creationDate),
    expirationTs,
    changeTs: tsString(session.changeDate),
  };
  if (user?.organizationId) entry.organization = String(user.organizationId);
  return { userId, session: entry };
}

// ---------------------------------------------------------------------------
// id_token of the device client
// ---------------------------------------------------------------------------

/** HolyAgent's device-code client on id.holycode.org; HC_DEVICE_HANDOFF_CLIENT_IDS overrides. */
const DEFAULT_DEVICE_CLIENTS = ["392609831602683908"];

export function deviceHandoffClients(): string[] {
  const raw = process.env.HC_DEVICE_HANDOFF_CLIENT_IDS;
  if (raw === undefined) return DEFAULT_DEVICE_CLIENTS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type Jwk = { kid?: string; alg?: string; kty?: string; n?: string; e?: string; [key: string]: unknown };

function decodePart(part: string): any {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/**
 * RS256 signature by a key of the instance, issuer, audience = a device client,
 * not expired and issued within the last ten minutes. Returns the subject.
 */
export function verifyDeviceIdToken(
  idToken: string,
  { issuer, clientIds, keys, now = Date.now() }: { issuer: string; clientIds: string[]; keys: Jwk[]; now?: number },
): { sub: string } | { error: string } {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) return { error: "malformed" };
  let header: any;
  let payload: any;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch {
    return { error: "malformed" };
  }
  if (header?.alg !== "RS256") return { error: "alg" };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { error: "key" };
  let valid = false;
  try {
    const key = createPublicKey({ key: jwk as any, format: "jwk" });
    valid = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
  } catch {
    valid = false;
  }
  if (!valid) return { error: "signature" };

  if (payload?.iss !== issuer) return { error: "issuer" };
  const aud: string[] = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
  if (!clientIds.some((c) => aud.includes(c))) return { error: "audience" };
  const nowSec = Math.floor(now / 1000);
  if (typeof payload?.exp !== "number" || payload.exp <= nowSec) return { error: "expired" };
  if (typeof payload?.iat !== "number" || payload.iat < nowSec - 600) return { error: "stale" };
  if (typeof payload?.sub !== "string" || !payload.sub) return { error: "subject" };
  return { sub: payload.sub };
}

// Where the one-time link may send the app window back to: the HolyCode apps
// of every contour (agent, app), mail and ID itself — the window opens the
// service it was asked for, not only the profile. HC_DEVICE_HANDOFF_RETURN_HOSTS
// adds hosts (comma-separated) without a rebuild.
const RETURN_SERVICE_NAMES = ["agent", "app", "mail", "id"];
const RETURN_ZONES = ["holycode.org", "ru.holycode.org", "us.holycode.org"];

export function handoffReturnHosts(extra: string | undefined = process.env.HC_DEVICE_HANDOFF_RETURN_HOSTS): string[] {
  const hosts = new Set<string>();
  for (const zone of RETURN_ZONES) {
    for (const name of RETURN_SERVICE_NAMES) hosts.add(`${name}.${zone}`);
  }
  for (const item of String(extra || "").split(",")) {
    const host = item.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return [...hosts];
}

/** Where the app window may be sent back to after the link: HolyCode services (https) and the local desktop runtime. */
export function isHandoffReturnTarget(value: string | null | undefined, hosts: string[] = handoffReturnHosts()): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (loopback) return url.protocol === "http:" || url.protocol === "https:";
  return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase());
}
