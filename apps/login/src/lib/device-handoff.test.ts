import { createSign, generateKeyPairSync } from "crypto";
import { describe, expect, test } from "vitest";
import {
  consumeHandoff,
  isHandoffReturnTarget,
  mintHandoff,
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
  test("HolyCode apps and the local desktop runtime only", () => {
    expect(isHandoffReturnTarget("https://agent.holycode.org/?desktop=1")).toBe(true);
    expect(isHandoffReturnTarget("http://127.0.0.1:5176/")).toBe(true);
    expect(isHandoffReturnTarget("http://localhost:5176/x")).toBe(true);
    expect(isHandoffReturnTarget("https://app.holycode.org/")).toBe(true);
    expect(isHandoffReturnTarget("http://agent.holycode.org/")).toBe(false);
    expect(isHandoffReturnTarget("https://evil.example/")).toBe(false);
    expect(isHandoffReturnTarget("https://agent.holycode.org.evil.example/")).toBe(false);
    expect(isHandoffReturnTarget("javascript:alert(1)")).toBe(false);
    expect(isHandoffReturnTarget(null)).toBe(false);
  });
});
