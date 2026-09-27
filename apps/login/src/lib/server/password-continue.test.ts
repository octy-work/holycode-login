import { UserState } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { finishPasswordLogin } from "./password-continue";

vi.mock("@/lib/client", () => ({
  completeFlowOrGetUrl: vi.fn(),
}));

vi.mock("@/lib/verify-helper", () => ({
  checkEmailVerification: vi.fn(),
  checkMFAFactors: vi.fn(),
  checkPasswordChangeRequired: vi.fn(),
}));

vi.mock("@/lib/zitadel", () => ({
  getLoginSettings: vi.fn(),
  getPasswordExpirySettings: vi.fn(),
  getUserByID: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
}));

vi.mock("@/lib/metrics", () => ({
  recordAuthFailure: vi.fn(),
  recordAuthSuccess: vi.fn(),
}));

vi.mock("./last-login", () => ({
  rememberLastLogin: vi.fn(),
}));

describe("finishPasswordLogin", () => {
  const session = {
    id: "s1",
    factors: { user: { id: "u1", loginName: "event74@ya.ru", displayName: "Event", organizationId: "org1" } },
  } as any;
  const user = { userId: "u1", state: UserState.ACTIVE, type: { case: "human", value: {} } } as any;
  const base = {
    serviceConfig: { baseUrl: "https://id.example" } as any,
    t: (key: string) => key,
    session,
    sessionCookie: { id: "s1" },
    user,
    loginSettingsByContext: { ignoreUnknownUsernames: true } as any,
    loginSettingsByUser: { defaultRedirectUri: "https://chat.example" } as any,
    passwordChecked: true,
    requestId: "oidc_1",
  };

  let mocks: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    const client = await import("@/lib/client");
    const verify = await import("@/lib/verify-helper");
    const zitadel = await import("@/lib/zitadel");
    const lastLogin = await import("./last-login");
    mocks = {
      completeFlowOrGetUrl: vi.mocked(client.completeFlowOrGetUrl),
      checkMFAFactors: vi.mocked(verify.checkMFAFactors),
      listAuthenticationMethodTypes: vi.mocked(zitadel.listAuthenticationMethodTypes),
      rememberLastLogin: vi.mocked(lastLogin.rememberLastLogin),
    };
    mocks.listAuthenticationMethodTypes.mockResolvedValue({ authMethodTypes: [AuthenticationMethodType.PASSWORD] });
  });

  test("completes the request and remembers the account with the password", async () => {
    mocks.completeFlowOrGetUrl.mockResolvedValue({ redirect: "https://chat.example/callback" });

    const res = await finishPasswordLogin(base);

    expect(res).toEqual({ redirect: "https://chat.example/callback" });
    expect(mocks.completeFlowOrGetUrl).toHaveBeenCalledWith(
      { sessionId: "s1", requestId: "oidc_1", organization: "org1" },
      "https://chat.example",
    );
    expect(mocks.rememberLastLogin).toHaveBeenCalledWith({
      loginName: "event74@ya.ru",
      displayName: "Event",
      method: "password",
    });
  });

  test("a second factor still to come counts as a password sign-in too", async () => {
    mocks.checkMFAFactors.mockResolvedValue({ redirect: "/otp/time-based?loginName=event74%40ya.ru" });

    const res = await finishPasswordLogin(base);

    expect(res).toEqual({ redirect: "/otp/time-based?loginName=event74%40ya.ru" });
    expect(mocks.rememberLastLogin).toHaveBeenCalledTimes(1);
  });

  test("nothing is remembered when the sign-in fails", async () => {
    mocks.listAuthenticationMethodTypes.mockResolvedValue({ authMethodTypes: [] });

    const res = await finishPasswordLogin(base);

    expect(res).toEqual({ error: "errors.couldNotVerifyPassword" });
    expect(mocks.rememberLastLogin).not.toHaveBeenCalled();
  });
});
