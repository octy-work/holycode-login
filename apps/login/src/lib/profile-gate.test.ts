import { describe, expect, test, vi } from "vitest";
import {
  fetchLiveSession,
  gatedSection,
  gateReturnTarget,
  isGatedProfilePath,
  isLiveSession,
  pickMostRecentSessionCookie,
} from "./profile-gate";

const NOW = Date.parse("2026-09-27T20:00:00Z");

describe("profile gate — which paths", () => {
  test("/me and its sections are gated, /me/enter and everything else is not", () => {
    expect(isGatedProfilePath("/me")).toBe(true);
    expect(isGatedProfilePath("/me/security")).toBe(true);
    expect(isGatedProfilePath("/me/billing")).toBe(true);
    expect(isGatedProfilePath("/me/enter")).toBe(false);
    expect(isGatedProfilePath("/me/enter/")).toBe(false);
    expect(isGatedProfilePath("/member")).toBe(false);
    expect(isGatedProfilePath("/loginname")).toBe(false);
  });

  test("return target: the public short address behind traefik, the relative path elsewhere", () => {
    expect(gatedSection("/me")).toBe("home");
    expect(gatedSection("/me/data")).toBe("data");
    expect(gatedSection("/me/billing")).toBe("home");
    expect(gateReturnTarget("/me/security", "/me/security", "https://id.holycode.org")).toBe(
      "https://id.holycode.org/me/security",
    );
    expect(gateReturnTarget("/me", "/me", "https://id.holycode.org")).toBe("https://id.holycode.org/me");
    expect(gateReturnTarget("/me/data", null, "http://127.0.0.1:3011")).toBe("/me/data");
    expect(gateReturnTarget("/me/billing", null, "")).toBe("/me");
  });
});

describe("profile gate — the sessions cookie", () => {
  const entry = (id: string, changeTs: string, expirationTs?: string) => ({
    id,
    token: `t-${id}`,
    loginName: "a@b.c",
    changeTs,
    expirationTs,
  });

  test("picks the most recently changed entry", () => {
    const raw = JSON.stringify([entry("s1", "100"), entry("s2", "300"), entry("s3", "200")]);
    expect(pickMostRecentSessionCookie(raw, NOW)?.id).toBe("s2");
  });

  test("nothing for a missing, broken, empty or expired cookie", () => {
    expect(pickMostRecentSessionCookie(undefined)).toBeNull();
    expect(pickMostRecentSessionCookie("")).toBeNull();
    expect(pickMostRecentSessionCookie("{broken")).toBeNull();
    expect(pickMostRecentSessionCookie("[]")).toBeNull();
    expect(pickMostRecentSessionCookie(JSON.stringify([{ loginName: "a@b.c" }]))).toBeNull();
    expect(pickMostRecentSessionCookie(JSON.stringify([entry("s1", "100", String(NOW - 1000))]), NOW)).toBeNull();
    expect(pickMostRecentSessionCookie(JSON.stringify([entry("s1", "100", String(NOW + 1000))]), NOW)?.id).toBe("s1");
  });
});

describe("profile gate — what counts as a live session", () => {
  const future = "2026-09-28T20:00:00Z";
  const past = "2026-09-27T19:00:00Z";

  test("a verified primary factor on an unexpired session with a user", () => {
    expect(
      isLiveSession(
        { session: { expirationDate: future, factors: { user: { id: "u1" }, password: { verifiedAt: past } } } },
        NOW,
      ),
    ).toBe(true);
    expect(
      isLiveSession(
        { session: { factors: { user: { id: "u1" }, webAuthN: { verifiedAt: past, userVerified: true } } } },
        NOW,
      ),
    ).toBe(true);
    expect(isLiveSession({ session: { factors: { user: { id: "u1" }, intent: { verifiedAt: past } } } }, NOW)).toBe(true);
  });

  test("not: identify-only, a presence-only WebAuthn check, an expired session, no user, garbage", () => {
    expect(isLiveSession({ session: { factors: { user: { id: "u1" } } } }, NOW)).toBe(false);
    expect(
      isLiveSession(
        { session: { factors: { user: { id: "u1" }, webAuthN: { verifiedAt: past, userVerified: false } } } },
        NOW,
      ),
    ).toBe(false);
    expect(
      isLiveSession(
        { session: { expirationDate: past, factors: { user: { id: "u1" }, password: { verifiedAt: past } } } },
        NOW,
      ),
    ).toBe(false);
    expect(isLiveSession({ session: { factors: { password: { verifiedAt: past } } } }, NOW)).toBe(false);
    expect(isLiveSession(null, NOW)).toBe(false);
    expect(isLiveSession("nope", NOW)).toBe(false);
  });
});

describe("profile gate — GetSession over Connect JSON", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const base = {
    baseUrl: "https://id.holycode.org",
    token: "pat",
    instanceHost: "id.holycode.org",
    publicHost: "id.holycode.org",
    cookie: { id: "s1", token: "tok" },
    now: NOW,
  };

  test("asks Zitadel for the cookie's session with the service token and host headers", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return json(200, { session: { factors: { user: { id: "u1" }, password: { verifiedAt: "2026-09-27T19:00:00Z" } } } });
    });
    const live = await fetchLiveSession({
      ...base,
      fetchImpl,
      customHeaders: (set) => set("x-custom", "1"),
    });
    expect(live).toBe(true);
    expect(calls[0].url).toBe("https://id.holycode.org/zitadel.session.v2.SessionService/GetSession");
    expect(calls[0].init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ sessionId: "s1", sessionToken: "tok" });
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer pat",
      "x-zitadel-instance-host": "id.holycode.org",
      "x-zitadel-public-host": "id.holycode.org",
      "x-custom": "1",
    });
  });

  test("gone or refused → no session; a transport failure or a 5xx → undecided", async () => {
    expect(await fetchLiveSession({ ...base, fetchImpl: async () => json(404, { code: 5 }) })).toBe(false);
    expect(await fetchLiveSession({ ...base, fetchImpl: async () => json(403, { code: 7 }) })).toBe(false);
    expect(await fetchLiveSession({ ...base, fetchImpl: async () => json(500, {}) })).toBeNull();
    expect(
      await fetchLiveSession({
        ...base,
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    ).toBeNull();
    expect(
      await fetchLiveSession({
        ...base,
        fetchImpl: async () => json(200, { session: { factors: { user: { id: "u1" } } } }),
      }),
    ).toBe(false);
  });
});
