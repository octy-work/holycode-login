import { timestampFromMs } from "@zitadel/client";
import { createSign, generateKeyPairSync } from "crypto";
import { describe, expect, test } from "vitest";
import {
  consumeHandoff,
  handoffReturnHosts,
  handoffSessionFromZitadel,
  isHandoffReturnTarget,
  mintHandoff,
  mintHandoffForSession,
  rememberDeviceApproval,
  verifyDeviceIdToken,
} from "./device-handoff";

const session = {
  id: "s1",
  token: "t1",
  loginName: "event74@ya.ru",
  creationTs: "1",
  expirationTs: "9999999999999",
  changeTs: "1",
};

describe("handoff store", () => {
  test("approval → one-time code → session, only once", () => {
    const now = 1_000_000;
    rememberDeviceApproval("u1", session, now);
    const code = mintHandoff("u1", now + 1000)!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(mintHandoff("u1", now + 2000)).toBeUndefined(); // approval used up
    expect(consumeHandoff(code, now + 3000)).toEqual(session);
    expect(consumeHandoff(code, now + 4000)).toBeUndefined();
  });

  test("stale approval or expired code gives nothing", () => {
    const now = 5_000_000;
    rememberDeviceApproval("u2", session, now);
    expect(mintHandoff("u2", now + 11 * 60_000)).toBeUndefined();
    rememberDeviceApproval("u3", session, now);
    const code = mintHandoff("u3", now)!;
    expect(consumeHandoff(code, now + 6 * 60_000)).toBeUndefined();
  });

  test("no approval for another person", () => {
    rememberDeviceApproval("u4", session, 9_000_000);
    expect(mintHandoff("someone-else", 9_000_001)).toBeUndefined();
  });

  test("a session the caller holds gets a code without an approval, one use, five minutes", () => {
    const now = 12_000_000;
    const code = mintHandoffForSession("u5", session, now)!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(consumeHandoff(code, now + 1000)).toEqual(session);
    expect(consumeHandoff(code, now + 2000)).toBeUndefined();
    const late = mintHandoffForSession("u5", session, now)!;
    expect(consumeHandoff(late, now + 5 * 60_000 + 1)).toBeUndefined();
    expect(mintHandoffForSession("", session, now)).toBeUndefined();
    expect(mintHandoffForSession("u5", { ...session, token: "" }, now)).toBeUndefined();
  });
});

describe("handoffSessionFromZitadel", () => {
  const now = 1_700_000_000_000;
  const zitadel = {
    id: "s9",
    factors: {
      user: { id: "u9", loginName: "owner@holycode.org", organizationId: "org1" },
      password: { verifiedAt: timestampFromMs(now - 1000) },
    },
    creationDate: timestampFromMs(now - 5000),
    expirationDate: timestampFromMs(now + 864_000_000),
    changeDate: timestampFromMs(now - 1000),
  };

  test("a checked, live session becomes the cookie entry", () => {
    expect(handoffSessionFromZitadel(zitadel, "tok", now)).toEqual({
      userId: "u9",
      session: {
        id: "s9",
        token: "tok",
        loginName: "owner@holycode.org",
        organization: "org1",
        creationTs: `${now - 5000}`,
        expirationTs: `${now + 864_000_000}`,
        changeTs: `${now - 1000}`,
      },
    });
  });

  test("passkey or provider counts as a check; nothing checked, expired or no user does not", () => {
    const { password, ...noPassword } = zitadel.factors;
    expect("userId" in handoffSessionFromZitadel({ ...zitadel, factors: { ...noPassword, webAuthN: { verifiedAt: timestampFromMs(now) } } }, "tok", now)).toBe(true);
    expect("userId" in handoffSessionFromZitadel({ ...zitadel, factors: { ...noPassword, intent: { verifiedAt: timestampFromMs(now) } } }, "tok", now)).toBe(true);
    expect(handoffSessionFromZitadel({ ...zitadel, factors: noPassword }, "tok", now)).toEqual({ error: "unchecked" });
    expect(handoffSessionFromZitadel({ ...zitadel, expirationDate: timestampFromMs(now - 1) }, "tok", now)).toEqual({ error: "expired" });
    expect(handoffSessionFromZitadel({ ...zitadel, factors: { ...zitadel.factors, user: { id: "" } } }, "tok", now)).toEqual({ error: "no_user" });
    expect(handoffSessionFromZitadel(undefined, "tok", now)).toEqual({ error: "no_user" });
    expect(handoffSessionFromZitadel(zitadel, "", now)).toEqual({ error: "no_user" });
  });
});

describe("verifyDeviceIdToken", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as any), kid: "k1", alg: "RS256" };
  const nowSec = 2_000_000_000;
  const sign = (payload: object, header: object = { alg: "RS256", kid: "k1" }) => {
    const h = Buffer.from(JSON.stringify(header)).toString("base64url");
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const s = createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url");
    return `${h}.${p}.${s}`;
  };
  const good = { iss: "https://id.holycode.org", aud: ["dev-client"], sub: "u1", iat: nowSec - 5, exp: nowSec + 600 };
  const opts = { issuer: "https://id.holycode.org", clientIds: ["dev-client"], keys: [jwk], now: nowSec * 1000 };

  test("valid token of the device client", () => {
    expect(verifyDeviceIdToken(sign(good), opts)).toEqual({ sub: "u1" });
  });

  test("another client, issuer, old or tampered token is refused", () => {
    expect(verifyDeviceIdToken(sign({ ...good, aud: "web-client" }), opts)).toEqual({ error: "audience" });
    expect(verifyDeviceIdToken(sign({ ...good, iss: "https://id.octy.ru" }), opts)).toEqual({ error: "issuer" });
    expect(verifyDeviceIdToken(sign({ ...good, iat: nowSec - 3600 }), opts)).toEqual({ error: "stale" });
    expect(verifyDeviceIdToken(sign({ ...good, exp: nowSec - 1 }), opts)).toEqual({ error: "expired" });
    const [h, , s] = sign(good).split(".");
    const forged = Buffer.from(JSON.stringify({ ...good, sub: "admin" })).toString("base64url");
    expect(verifyDeviceIdToken(`${h}.${forged}.${s}`, opts)).toEqual({ error: "signature" });
    expect(verifyDeviceIdToken(sign(good, { alg: "none", kid: "k1" }), opts)).toEqual({ error: "alg" });
    expect(verifyDeviceIdToken("junk", opts)).toEqual({ error: "malformed" });
  });
});

describe("isHandoffReturnTarget", () => {
  test("HolyCode services of every contour and the local desktop runtime only", () => {
    expect(isHandoffReturnTarget("https://agent.holycode.org/?desktop=1")).toBe(true);
    expect(isHandoffReturnTarget("http://127.0.0.1:5176/")).toBe(true);
    expect(isHandoffReturnTarget("http://localhost:5176/x")).toBe(true);
    expect(isHandoffReturnTarget("https://app.holycode.org/")).toBe(true);
    expect(isHandoffReturnTarget("https://agent.ru.holycode.org/?desktop=1")).toBe(true);
    expect(isHandoffReturnTarget("https://app.us.holycode.org/")).toBe(true);
    expect(isHandoffReturnTarget("https://mail.holycode.org/")).toBe(true);
    expect(isHandoffReturnTarget("https://id.holycode.org/ui/v2/login/me")).toBe(true);
    expect(isHandoffReturnTarget("https://ID.holycode.org/")).toBe(true);
    expect(isHandoffReturnTarget("https://build.holycode.org/")).toBe(false);
    expect(isHandoffReturnTarget("https://holycode.org/")).toBe(false);
    expect(isHandoffReturnTarget("http://agent.holycode.org/")).toBe(false);
    expect(isHandoffReturnTarget("https://evil.example/")).toBe(false);
    expect(isHandoffReturnTarget("https://agent.holycode.org.evil.example/")).toBe(false);
    expect(isHandoffReturnTarget("https://user:pw@agent.holycode.org/")).toBe(false);
    expect(isHandoffReturnTarget("javascript:alert(1)")).toBe(false);
    expect(isHandoffReturnTarget(null)).toBe(false);
  });

  test("HC_DEVICE_HANDOFF_RETURN_HOSTS adds hosts", () => {
    const hosts = handoffReturnHosts(" Build.holycode.org, ,chat.holycode.test");
    expect(hosts).toContain("build.holycode.org");
    expect(hosts).toContain("chat.holycode.test");
    expect(hosts).toContain("agent.holycode.org");
    expect(isHandoffReturnTarget("https://build.holycode.org/", hosts)).toBe(true);
    expect(isHandoffReturnTarget("https://build.holycode.org/", handoffReturnHosts(""))).toBe(false);
  });
});
