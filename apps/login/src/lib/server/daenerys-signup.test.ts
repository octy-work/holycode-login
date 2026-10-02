import { afterEach, describe, expect, test, vi } from "vitest";
import { clientIpFrom, listSignupDomains, resetSignupDomainsCache, signupRequest } from "./daenerys-signup";

const env = { DAENERYS_ID_SIGNUP_TOKEN: "tok", DAENERYS_ID_SIGNUP_URL: "https://dny.test/" };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("signupRequest", () => {
  test("without the token the API is off and nothing is sent", async () => {
    const fetchImpl = vi.fn();
    expect(await signupRequest("/api/id/signup/domains", { env: {}, fetchImpl })).toEqual({
      ok: false,
      status: 503,
      code: "signup_disabled",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("sends the token and the person's IP, returns the body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { available: true }));
    const res = await signupRequest("/api/id/mailbox/check", {
      env,
      fetchImpl,
      body: { local: "rodion" },
      clientIp: "1.2.3.4",
    });
    expect(res).toEqual({ ok: true, data: { available: true } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://dny.test/api/id/mailbox/check");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "X-HC-Client-IP": "1.2.3.4" });
  });

  test("errors keep the code and Retry-After", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(429, { code: "rate_limited" }, { "retry-after": "30" }));
    expect(await signupRequest("/x", { env, fetchImpl, body: {} })).toEqual({
      ok: false,
      status: 429,
      code: "rate_limited",
      retryAfter: 30,
    });
  });

  test("a network failure is an answer, not an exception", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await signupRequest("/x", { env, fetchImpl })).toEqual({ ok: false, status: 0, code: "network" });
  });
});

describe("listSignupDomains", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    resetSignupDomainsCache();
  });

  test("keeps valid domains in order, caches them, [] when the API is off", async () => {
    expect(await listSignupDomains({ fetchImpl: vi.fn() })).toEqual([]);

    process.env.DAENERYS_ID_SIGNUP_TOKEN = "tok";
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        domains: [
          { domain: "holycode.org", group: "holycode" },
          { domain: "sozv.one", group: "product" },
          { domain: "Bad Domain!", group: "product" },
        ],
      }),
    );
    const domains = await listSignupDomains({ fetchImpl, now: 1000 });
    expect(domains).toEqual([
      { domain: "holycode.org", group: "holycode" },
      { domain: "sozv.one", group: "product" },
    ]);
    await listSignupDomains({ fetchImpl, now: 2000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("clientIpFrom", () => {
  test("first hop of X-Forwarded-For, then X-Real-IP", () => {
    const h = (values: Record<string, string>) => ({ get: (n: string) => values[n] ?? null });
    expect(clientIpFrom(h({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIpFrom(h({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIpFrom(h({}))).toBeUndefined();
  });
});
