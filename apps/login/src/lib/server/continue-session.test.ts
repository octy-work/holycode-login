import { timestampFromDate } from "@zitadel/client";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { continueWithSession, firstFactorStillValid } from "./session";

// HolyCode, 28.09.2026: a signed-in session that only lacks the second factor
// (2FA was turned on after sign-in) must ask for the code, not send the person
// to Apple again; re-authentication keeps the method used last time.

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("../service-url", () => ({ getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://id.example" } })) }));
vi.mock("../client", () => ({ completeFlowOrGetUrl: vi.fn() }));
vi.mock("../session", () => ({ isSessionValid: vi.fn() }));
vi.mock("../verify-helper", () => ({ checkMFAFactors: vi.fn() }));
vi.mock("./loginname", () => ({ sendLoginname: vi.fn() }));
vi.mock("@/lib/server/cookie", () => ({ createSessionAndUpdateCookie: vi.fn(), setSessionAndUpdateCookie: vi.fn() }));
vi.mock("../cookies", () => ({
  getMostRecentSessionCookie: vi.fn(),
  getSessionCookieById: vi.fn(),
  getSessionCookieByLoginName: vi.fn(),
  removeSessionFromCookie: vi.fn(),
}));
vi.mock("./host", () => ({ getPublicHost: vi.fn(() => "id.example") }));
vi.mock("@/lib/zitadel", () => ({
  getLoginSettings: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  deleteSession: vi.fn(),
  getSecuritySettings: vi.fn(),
  humanMFAInitSkipped: vi.fn(),
  listUsers: vi.fn(),
}));

const TEN_DAYS = { seconds: BigInt(864000), nanos: 0 };
const minutesAgo = (minutes: number) => timestampFromDate(new Date(Date.now() - minutes * 60_000));

function session(factors: Record<string, unknown>) {
  return {
    id: "s1",
    factors: { user: { id: "u1", loginName: "event74@ya.ru", organizationId: "org1" }, ...factors },
  } as any;
}

describe("firstFactorStillValid", () => {
  test("password or provider sign-in within the policy lifetime", () => {
    const settings = { passwordCheckLifetime: TEN_DAYS, externalLoginCheckLifetime: TEN_DAYS } as any;
    expect(firstFactorStillValid(session({ password: { verifiedAt: minutesAgo(120) } }), settings)).toBe(true);
    expect(firstFactorStillValid(session({ intent: { verifiedAt: minutesAgo(120) } }), settings)).toBe(true);
    expect(firstFactorStillValid(session({ password: { verifiedAt: minutesAgo(60 * 24 * 11) } }), settings)).toBe(false);
    expect(firstFactorStillValid(session({}), settings)).toBe(false);
    expect(firstFactorStillValid(session({ password: { verifiedAt: minutesAgo(1) } }), undefined)).toBe(false);
  });
});

describe("continueWithSession", () => {
  let mocks: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    const zitadel = await import("@/lib/zitadel");
    const sessionLib = await import("../session");
    const verify = await import("../verify-helper");
    const loginname = await import("./loginname");
    const client = await import("../client");
    mocks = {
      getLoginSettings: vi.mocked(zitadel.getLoginSettings),
      listAuthenticationMethodTypes: vi.mocked(zitadel.listAuthenticationMethodTypes),
      isSessionValid: vi.mocked(sessionLib.isSessionValid),
      checkMFAFactors: vi.mocked(verify.checkMFAFactors),
      sendLoginname: vi.mocked(loginname.sendLoginname),
      completeFlowOrGetUrl: vi.mocked(client.completeFlowOrGetUrl),
    };
    mocks.getLoginSettings.mockResolvedValue({ passwordCheckLifetime: TEN_DAYS, externalLoginCheckLifetime: TEN_DAYS });
    mocks.listAuthenticationMethodTypes.mockResolvedValue({
      authMethodTypes: [AuthenticationMethodType.PASSWORD, AuthenticationMethodType.IDP, AuthenticationMethodType.TOTP],
    });
    mocks.isSessionValid.mockResolvedValue(false);
  });

  test("only the second factor is missing — straight to the code, no provider", async () => {
    mocks.checkMFAFactors.mockResolvedValue({ redirect: "/otp/time-based?loginName=event74%40ya.ru&requestId=oidc_1" });

    const res = await continueWithSession({ ...session({ password: { verifiedAt: minutesAgo(130) } }), requestId: "oidc_1" });

    expect(res).toEqual({ redirect: "/otp/time-based?loginName=event74%40ya.ru&requestId=oidc_1" });
    expect(mocks.sendLoginname).not.toHaveBeenCalled();
  });

  test("the first factor has expired — sign in again with the password used last time", async () => {
    mocks.sendLoginname.mockResolvedValue({ redirect: "/password?loginName=event74%40ya.ru" });

    const res = await continueWithSession({
      ...session({ password: { verifiedAt: minutesAgo(60 * 24 * 11) } }),
      requestId: "oidc_1",
    });

    expect(mocks.checkMFAFactors).not.toHaveBeenCalled();
    expect(mocks.sendLoginname).toHaveBeenCalledWith(expect.objectContaining({ preferPassword: true, requestId: "oidc_1" }));
    expect(res).toEqual({ redirect: "/password?loginName=event74%40ya.ru" });
  });

  test("a provider sign-in keeps the provider on re-authentication", async () => {
    mocks.sendLoginname.mockResolvedValue({ redirect: "https://appleid.apple.com/auth" });

    await continueWithSession({ ...session({ intent: { verifiedAt: minutesAgo(60 * 24 * 11) } }), requestId: "oidc_1" });

    expect(mocks.sendLoginname).toHaveBeenCalledWith(expect.objectContaining({ preferPassword: false }));
  });
});
