/**
 * HolyCode service switcher — the directory of services and the links between
 * them (owner's decisions of 28.09.2026: one grid button next to the logo in
 * every service, six tiles, the list comes from Daenerys, never hard-coded).
 *
 * The directory is `GET /api/services` of Daenerys:
 *   { services: [{ key, name, url, icon, kind, status?: { text } }],
 *     org: { account_id, name, role } }
 * (contract: apps/daenerys-api/docs/services-api.md in the holycode repo).
 * Without a Daenerys session or when the call fails, the profile shows a
 * fallback: `HC_PROFILE_SERVICES` from the environment or the production
 * addresses. The panel is never in the fallback — it is for owners and admins
 * only, and that is the server's call.
 *
 * Link and normalising logic is the same as apps/holychat-web/src/switcher/href.js
 * in the holycode repository, so every service builds the same links:
 * `<url>?org=<account_id>&return_to=<where we are now>`.
 *
 * Pure functions, no window: unit-tested as they are.
 */

export type ServiceStatus = { text: string };

export type ServiceEntry = {
  key: string;
  name: string;
  url: string;
  icon: string;
  kind: string;
  status?: ServiceStatus;
};

export type ServiceOrg = { account_id: string; name: string; role: string };

export type ServicesDirectory = { services: ServiceEntry[]; org: ServiceOrg | null };

export const SERVICE_KEYS = Object.freeze(["chat", "build", "agent", "panel", "profile", "mail"] as const);
export type KnownServiceKey = (typeof SERVICE_KEYS)[number];

export const DEFAULT_SERVICES: readonly ServiceEntry[] = Object.freeze([
  Object.freeze({ key: "chat", name: "HolyCode", url: "https://chat.holycode.org/", icon: "chat", kind: "app" }),
  Object.freeze({ key: "build", name: "HolyBuild", url: "https://build.holycode.org/", icon: "build", kind: "app" }),
  Object.freeze({ key: "agent", name: "HolyAgent", url: "https://agent.holycode.org/", icon: "agent", kind: "app" }),
  Object.freeze({ key: "profile", name: "", url: "https://id.holycode.org/me", icon: "profile", kind: "profile" }),
  Object.freeze({ key: "mail", name: "", url: "https://mail.holycode.org/", icon: "mail", kind: "mail" }),
]);

/** Roles that may open the organization admin (the same rule as the chat's `canOpenAdmin`). */
export const ADMIN_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

const KEY_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_TEXT = 120;

function httpUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function shortText(value: unknown, max = MAX_TEXT): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/**
 * The link into a service: its address from the directory plus the active
 * organization and where to come back to. A plain link, same tab. A bad
 * address gives '' (the tile is then not a link).
 */
export function buildServiceHref(
  url: unknown,
  { org = "", returnTo = "" }: { org?: string; returnTo?: string } = {},
): string {
  let target: URL;
  try {
    target = new URL(String(url ?? ""));
  } catch {
    return "";
  }
  if (!/^https?:$/.test(target.protocol)) return "";
  const orgId = String(org ?? "").trim();
  if (orgId) target.searchParams.set("org", orgId);
  const back = String(returnTo ?? "").trim();
  if (back) target.searchParams.set("return_to", back);
  return target.toString();
}

/** One directory entry, or null when it has no key or no http(s) address. */
export function normalizeService(item: unknown): ServiceEntry | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const key = String(raw.key ?? "")
    .trim()
    .toLowerCase();
  const url = httpUrl(raw.url);
  if (!KEY_RE.test(key) || !url) return null;
  const statusRaw = raw.status && typeof raw.status === "object" ? (raw.status as Record<string, unknown>) : null;
  const statusText = statusRaw ? shortText(statusRaw.text) : "";
  const service: ServiceEntry = {
    key,
    name: shortText(raw.name, 60),
    url,
    icon: shortText(raw.icon, 40),
    kind: shortText(raw.kind, 40),
  };
  if (statusText) service.status = { text: statusText };
  return service;
}

/** The directory answer → { services, org }. Repeated keys: the first one wins. */
export function normalizeServices(payload: unknown): ServicesDirectory {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const services: ServiceEntry[] = [];
  for (const item of Array.isArray(data.services) ? data.services : []) {
    const service = normalizeService(item);
    if (!service || seen.has(service.key)) continue;
    seen.add(service.key);
    services.push(service);
  }
  const orgRaw = data.org && typeof data.org === "object" ? (data.org as Record<string, unknown>) : null;
  const accountId = orgRaw ? shortText(orgRaw.account_id) : "";
  const org: ServiceOrg | null = accountId
    ? { account_id: accountId, name: shortText(orgRaw!.name, 120), role: shortText(orgRaw!.role, 40).toLowerCase() }
    : null;
  return { services, org };
}

/** The service key a host name stands for (chat.holycode.org → chat, id.… → profile, daenerys.… → panel). */
const HOST_KEYS: Record<string, KnownServiceKey> = {
  chat: "chat",
  build: "build",
  agent: "agent",
  daenerys: "panel",
  panel: "panel",
  id: "profile",
  profile: "profile",
  mail: "mail",
};

function keyFromHost(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const label = host.split(".")[0].replace(/-dev$/, "");
    return HOST_KEYS[label] ?? "";
  } catch {
    return "";
  }
}

function keyFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/^holy/, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return KEY_RE.test(slug) ? slug : "";
}

/**
 * `HC_PROFILE_SERVICES` — the fallback list for the profile when Daenerys is not
 * there. Two shapes:
 *  - a JSON array of `{ key, name, url, icon?, kind?, status? }` (or `{ services: [...] }`),
 *    the same as `DAENERYS_SERVICES`;
 *  - the short form `key|Name|url,key|Name|url…`; the older `Name|url,Name|url` still
 *    works — the key is then read from the host (`chat.` → chat, `id.` → profile) or
 *    the name (`HolyBuild` → build).
 * Empty or rubbish → null (then the production addresses).
 */
export function parseServicesEnv(raw: string | undefined | null): ServiceEntry[] | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.startsWith("[") || text.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? (parsed as { services?: unknown }).services
        : null;
    if (!Array.isArray(list)) return null;
    const { services } = normalizeServices({ services: list });
    return services.length ? services : null;
  }
  const entries = text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split("|").map((p) => p.trim());
      if (parts.length >= 3) {
        const [key, name, url, icon = "", kind = ""] = parts;
        return { key, name, url, icon, kind };
      }
      if (parts.length === 2) {
        const [name, url] = parts;
        const key = keyFromHost(url) || keyFromName(name);
        return { key, name, url, icon: key, kind: key === "profile" || key === "mail" ? key : "app" };
      }
      return null;
    });
  const { services } = normalizeServices({ services: entries });
  return services.length ? services : null;
}

/** What the switcher shows without the directory: the environment's list or the production addresses. */
export function fallbackServices(envRaw: string | undefined | null = ""): ServiceEntry[] {
  return parseServicesEnv(envRaw) ?? DEFAULT_SERVICES.map((service) => ({ ...service }));
}

/** Owners and admins of the active organization may open its admin (domains, mail, people). */
export function canOpenAdmin(role: string | undefined | null): boolean {
  return ADMIN_ROLES.has(
    String(role ?? "")
      .trim()
      .toLowerCase(),
  );
}

/** `?org=` and `?return_to=` — what a service opened from the switcher reads back. */
export const ORG_PARAM = "org";
export const RETURN_TO_PARAM = "return_to";
