import { describe, expect, test, vi } from "vitest";
import {
  blockingAccounts,
  buildSilentSignInUrl,
  classifyStatus,
  createDaenerysClient,
  daenerysApiUrl,
  daenerysRequest,
  isKeyEntry,
  normalizeAccounts,
  normalizeActivity,
  normalizeApiKeys,
  normalizeDevice,
  normalizeSessions,
  normalizeUser,
  planSilentSignIn,
  profileReturnTo,
  readSsoMarker,
  SILENT_SSO_KEY,
  SILENT_SSO_WINDOW_MS,
  stripSsoMarker,
} from "./daenerys";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fetchSequence(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new TypeError("Failed to fetch");
    return next;
  });
  return { impl, calls };
}

describe("Daenerys requests from the profile", () => {
  test("go with the .holycode.org cookie and come back as data", async () => {
    const { impl, calls } = fetchSequence([json(200, { ok: true, user: { user_id: "u1" } })]);
    const result = await daenerysRequest("/api/auth/me", { fetchImpl: impl, baseUrl: "https://daenerys-api.holycode.org/" });
    expect(result).toEqual({ ok: true, status: 200, data: { ok: true, user: { user_id: "u1" } } });
    expect(calls[0].url).toBe("https://daenerys-api.holycode.org/api/auth/me");
    expect(calls[0].init).toMatchObject({ credentials: "include", method: "GET" });
  });

  test("an expired access cookie is renewed once through the refresh cookie, then retried", async () => {
    const { impl, calls } = fetchSequence([
      json(401, { error: "unauthorized" }),
      json(200, { ok: true }), // POST /api/auth/refresh
      json(200, { ok: true, sessions: [] }),
    ]);
    const result = await daenerysRequest("/api/auth/sessions", { fetchImpl: impl });
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.url)).toEqual([
      "https://daenerys-api.holycode.org/api/auth/sessions",
      "https://daenerys-api.holycode.org/api/auth/refresh",
      "https://daenerys-api.holycode.org/api/auth/sessions",
    ]);
    expect(calls[1].init).toMatchObject({ method: "POST", credentials: "include" });
  });

  test("no refresh cookie either: unauthorized, and no loop", async () => {
    const { impl, calls } = fetchSequence([json(401, { error: "unauthorized" }), json(401, { error: "missing_token" })]);
    const result = await daenerysRequest("/api/auth/me", { fetchImpl: impl });
    expect(result).toMatchObject({ ok: false, status: 401, reason: "unauthorized", code: "unauthorized" });
    expect(calls).toHaveLength(2);
  });

  test("a route that does not exist yet is 'missing', a conflict carries its code and body", async () => {
    const { impl } = fetchSequence([
      json(404, { error: "not_found" }),
      json(409, { error: "too_many_accounts", code: "too_many_accounts", message: "Limit reached", limit: 10 }),
    ]);
    expect(await daenerysRequest("/api/auth/activity", { fetchImpl: impl })).toMatchObject({ ok: false, reason: "missing" });
    const conflict = await daenerysRequest("/api/auth/accounts", { fetchImpl: impl, method: "POST", body: { name: "x" } });
    expect(conflict).toMatchObject({ ok: false, reason: "conflict", code: "too_many_accounts", message: "Limit reached" });
  });

  test("a network failure (CORS, offline) is 'network'", async () => {
    const { impl } = fetchSequence([]);
    expect(await daenerysRequest("/api/auth/me", { fetchImpl: impl })).toEqual({ ok: false, status: 0, reason: "network" });
  });

  test("status classes", () => {
    expect(classifyStatus(401)).toBe("unauthorized");
    expect(classifyStatus(403)).toBe("forbidden");
    expect(classifyStatus(404)).toBe("missing");
    expect(classifyStatus(405)).toBe("missing");
    expect(classifyStatus(409)).toBe("conflict");
    expect(classifyStatus(422)).toBe("invalid");
    expect(classifyStatus(500)).toBe("error");
  });

  test("the client calls the contract's routes", async () => {
    const { impl, calls } = fetchSequence(Array.from({ length: 9 }, () => json(200, { ok: true })));
    const client = createDaenerysClient({ fetchImpl: impl, baseUrl: "https://d.example" });
    await client.me();
    await client.sessions();
    await client.revokeSession("s1");
    await client.revokeApiKey("pat_1");
    await client.logoutAll({ revokeKeys: true });
    await client.activity({ limit: 20, before: "2026-09-27T00:00:00Z" });
    await client.createAccount("Event74");
    await client.requestDeletion();
    await client.cancelDeletion();
    expect(calls.map((c) => `${c.init?.method} ${c.url.replace("https://d.example", "")}`)).toEqual([
      "GET /api/auth/me",
      "GET /api/auth/sessions",
      "DELETE /api/auth/sessions/s1",
      "DELETE /api/auth/api-keys/pat_1",
      "POST /api/auth/logout-all",
      "GET /api/auth/activity?limit=20&before=2026-09-27T00%3A00%3A00Z",
      "POST /api/auth/accounts",
      "POST /api/auth/me/delete",
      "DELETE /api/auth/me/delete",
    ]);
    expect(JSON.parse(calls[4].init?.body as string)).toEqual({ revoke_keys: true });
    expect(JSON.parse(calls[7].init?.body as string)).toEqual({ confirm: true });
  });

  test("base url: configured or the production one", () => {
    expect(daenerysApiUrl(undefined)).toBe("https://daenerys-api.holycode.org");
    expect(daenerysApiUrl("http://localhost:4010/")).toBe("http://localhost:4010");
  });
});

describe("Daenerys payloads", () => {
  test("user with a pending deletion", () => {
    expect(
      normalizeUser({
        ok: true,
        user: { user_id: "u1", name: "Rodion", email: "e@x", username: "event74" },
        pending_deletion: { scheduled_at: "2026-09-27T10:00:00Z", delete_at: "2026-10-04T10:00:00Z" },
      }),
    ).toEqual({
      userId: "u1",
      name: "Rodion",
      email: "e@x",
      username: "event74",
      pendingDeletion: { scheduledAt: "2026-09-27T10:00:00Z", deleteAt: "2026-10-04T10:00:00Z" },
    });
    expect(normalizeUser({ user: {} })).toBeNull();
  });

  test("organizations with the active one", () => {
    expect(
      normalizeAccounts({
        active_account_id: "org-2",
        accounts: [
          { account_id: "org-1", name: "Event74", role: "owner", account_type: "workspace" },
          { account_id: "org-2", name: "", slug: "acme", role: "member", is_active: true },
          { name: "no id" },
        ],
      }),
    ).toEqual([
      { id: "org-1", name: "Event74", role: "owner", active: false, type: "workspace" },
      { id: "org-2", name: "acme", role: "member", active: true, type: "" },
    ]);
  });

  test("sessions and access keys in one list, the current one first", () => {
    const list = normalizeSessions({
      sessions: [
        {
          session_id: "pat_1",
          current: false,
          source: "auth.api_key",
          issued_at: "2026-09-27T14:22:00Z",
          last_seen_at: "2026-09-27T19:31:00Z",
          expires_at: "2026-12-24T00:00:00Z",
          device: { browser: "curl", os: "", kind: "cli" },
          ip: "1.2.3.4",
          city: "",
          api_key: { key_id: "pat_1", name: "claude-code automation", token_preview: "dny_pat_…ab12", scopes: ["read"] },
        },
        {
          session_id: "s2",
          current: false,
          source: "auth.oidc",
          issued_at: "2026-09-27T17:00:00Z",
          last_seen_at: "2026-09-27T17:30:00Z",
          device: { browser: "Safari 17", os: "iOS", kind: "phone" },
          ip: "",
          city: "Tbilisi",
          api_key: null,
        },
        {
          session_id: "s1",
          current: true,
          source: "auth.oidc",
          issued_at: "2026-09-27T19:00:00Z",
          last_seen_at: "2026-09-27T19:31:00Z",
          device: "Mac · Safari",
          api_key: null,
        },
      ],
    });
    expect(list.map((s) => s.id)).toEqual(["s1", "pat_1", "s2"]);
    expect(list[0].device).toEqual({ browser: "Mac · Safari", os: "", kind: "" });
    expect(isKeyEntry(list[1])).toBe(true);
    expect(list[1].apiKey).toEqual({
      keyId: "pat_1",
      name: "claude-code automation",
      tokenPreview: "dny_pat_…ab12",
      scopes: ["read"],
    });
    expect(list[1].expiresAt).toBe("2026-12-24T00:00:00Z");
    expect(isKeyEntry(list[2])).toBe(false);
    expect(list[2].city).toBe("Tbilisi");
  });

  test('a session recorded before Daenerys kept the user agent has no device, not an "unknown" one', () => {
    const [old] = normalizeSessions({
      sessions: [{ session_id: "s0", source: "auth.oidc", device: { browser: "", os: "", kind: "unknown" }, api_key: null }],
    });
    expect(old.device).toBeNull();
    expect(normalizeDevice({ browser: "curl", kind: "unknown" })).toEqual({ browser: "curl", os: "", kind: "" });
  });

  test("activity page", () => {
    const page = normalizeActivity({
      entries: [
        {
          at: "2026-09-27T19:31:00Z",
          action: "login",
          detail: "HolyCode ID",
          device: { browser: "Safari", os: "macOS", kind: "desktop" },
          self: true,
        },
        { at: "", action: "login" },
        { at: "2026-09-27T14:22:00Z", action: "api_key.created", detail: "claude-code automation" },
      ],
      next_before: "2026-09-27T14:22:00Z",
    });
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]).toMatchObject({ action: "login", detail: "HolyCode ID", self: true, device: { os: "macOS" } });
    expect(page.entries[1].self).toBe(false);
    expect(page.nextBefore).toBe("2026-09-27T14:22:00Z");
  });

  test("access keys summary and blocking organizations", () => {
    expect(normalizeApiKeys({ items: [{ status: "active" }, { status: "revoked" }, { status: "active" }] })).toEqual({
      total: 3,
      active: 2,
    });
    expect(blockingAccounts({ accounts: [{ account_id: "org-1", name: "Event74", members: 2 }] })).toEqual([
      { id: "org-1", name: "Event74", members: 2 },
    ]);
  });
});

describe("silent sign-in into Daenerys", () => {
  const storage = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
  };

  test("goes once when the cookie is missing, then not again within the window", () => {
    const tab = storage();
    const now = 1_000_000;
    expect(planSilentSignIn({ reason: "unauthorized", marker: { sso: false, error: "" }, tabStorage: tab, now })).toBe("go");
    expect(tab.map.get(SILENT_SSO_KEY)).toBe(String(now));
    expect(
      planSilentSignIn({ reason: "unauthorized", marker: { sso: false, error: "" }, tabStorage: tab, now: now + 1000 }),
    ).toBe("skip");
    expect(
      planSilentSignIn({
        reason: "unauthorized",
        marker: { sso: false, error: "" },
        tabStorage: tab,
        now: now + SILENT_SSO_WINDOW_MS + 1,
      }),
    ).toBe("go");
  });

  test("never right after Daenerys brought the browser back, never for other failures, never without storage", () => {
    expect(
      planSilentSignIn({ reason: "unauthorized", marker: { sso: false, error: "login_required" }, tabStorage: storage() }),
    ).toBe("skip");
    expect(planSilentSignIn({ reason: "unauthorized", marker: { sso: true, error: "" }, tabStorage: storage() })).toBe(
      "skip",
    );
    expect(planSilentSignIn({ reason: "network", marker: { sso: false, error: "" }, tabStorage: storage() })).toBe("skip");
    expect(planSilentSignIn({ reason: null, marker: { sso: false, error: "" }, tabStorage: storage() })).toBe("skip");
    expect(planSilentSignIn({ reason: "unauthorized", marker: { sso: false, error: "" }, tabStorage: null })).toBe("skip");
  });

  test("return address is the short public /me; the start URL carries prompt=none", () => {
    expect(profileReturnTo({ origin: "https://id.holycode.org", pathname: "/me/security" })).toBe(
      "https://id.holycode.org/me",
    );
    expect(profileReturnTo({ origin: "http://127.0.0.1:3011", pathname: "/ui/v2/login/me/data" })).toBe(
      "http://127.0.0.1:3011/ui/v2/login/me/data",
    );
    const url = new URL(buildSilentSignInUrl(undefined, "https://id.holycode.org/me"));
    expect(url.origin + url.pathname).toBe("https://daenerys-api.holycode.org/api/auth/oidc/start");
    expect(url.searchParams.get("prompt")).toBe("none");
    expect(url.searchParams.get("return_to")).toBe("https://id.holycode.org/me");
  });

  test("reads and strips the return markers", () => {
    expect(readSsoMarker("https://id.holycode.org/me?sso=1")).toEqual({ sso: true, error: "" });
    expect(readSsoMarker("https://id.holycode.org/me?sso_error=login_required")).toEqual({
      sso: false,
      error: "login_required",
    });
    expect(readSsoMarker("not a url")).toEqual({ sso: false, error: "" });
    expect(stripSsoMarker("https://id.holycode.org/me/security?sso=1&x=2#sessions")).toBe("/me/security?x=2#sessions");
  });
});
