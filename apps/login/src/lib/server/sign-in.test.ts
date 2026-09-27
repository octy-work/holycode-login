import { UserState } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { forgetLastLogin, signIn } from "./sign-in";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({})),
}));

vi.mock("@zitadel/client", () => ({
  create: vi.fn((_schema, data) => data),
}));

vi.mock("../service-url", () => ({
  getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://id.example" } })),
}));

vi.mock("../zitadel", () => ({
  getLoginSettings: vi.fn(),
  searchUsers: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  getLockoutSettings: vi.fn(),
}));

vi.mock("./cookie", () => ({
  createSessionAndUpdateCookie: vi.fn(),
}));

vi.mock("./loginname", () => ({
  sendLoginname: vi.fn(),
}));

vi.mock("./password-continue", () => ({
  finishPasswordLogin: vi.fn(),
}));

vi.mock("./last-login", () => ({
  clearLastLogin: vi.fn(),
}));

vi.mock("@/lib/grpc/interceptors/error-classification", () => ({
  isClassifiedError: vi.fn(() => false),
}));

vi.mock("@/lib/metrics", () => ({
  recordAuthAttempt: vi.fn(),
  recordAuthFailure: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(
    async (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
  ),
}));

const passwordUser = {
  userId: "u1",
  preferredLoginName: "event74@ya.ru",
  state: UserState.ACTIVE,
  details: { resourceOwner: "org1" },
  type: { case: "human", value: { email: { email: "event74@ya.ru" } } },
};

describe("signIn (one-screen sign-in)", () => {
  let mocks: {
    getLoginSettings: any;
    searchUsers: any;
    listAuthenticationMethodTypes: any;
    getLockoutSettings: any;
    createSessionAndUpdateCookie: any;
    sendLoginname: any;
    finishPasswordLogin: any;
    clearLastLogin: any;
  };

  const settings = (overrides: Record<string, unknown> = {}) => ({
    allowLocalAuthentication: true,
    ignoreUnknownUsernames: true,
    disableLoginWithPhone: true,
    passwordCheckLifetime: { seconds: BigInt(864000) },
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const zitadel = await import("../zitadel");
    const cookie = await import("./cookie");
    const loginname = await import("./loginname");
    const cont = await import("./password-continue");
    const lastLogin = await import("./last-login");
    mocks = {
      getLoginSettings: vi.mocked(zitadel.getLoginSettings),
      searchUsers: vi.mocked(zitadel.searchUsers),
      listAuthenticationMethodTypes: vi.mocked(zitadel.listAuthenticationMethodTypes),
      getLockoutSettings: vi.mocked(zitadel.getLockoutSettings),
      createSessionAndUpdateCookie: vi.mocked(cookie.createSessionAndUpdateCookie),
      sendLoginname: vi.mocked(loginname.sendLoginname),
      finishPasswordLogin: vi.mocked(cont.finishPasswordLogin),
      clearLastLogin: vi.mocked(lastLogin.clearLastLogin),
    };
    mocks.getLoginSettings.mockResolvedValue(settings());
  });

  describe("without a password — find the way in", () => {
    test("asks for the password on the same screen, preferring it over a linked provider", async () => {
      mocks.sendLoginname.mockResolvedValue({ redirect: "/password?loginName=event74%40ya.ru&requestId=oidc_1" });

      const res = await signIn({ loginName: "event74@ya.ru", requestId: "oidc_1", organization: "org1", suffix: "x" });

      expect(res).toEqual({ passwordRequired: true });
      expect(mocks.sendLoginname).toHaveBeenCalledWith({
        loginName: "event74@ya.ru",
        requestId: "oidc_1",
        organization: "org1",
        defaultOrganization: undefined,
        suffix: "x",
        preferPassword: true,
      });
      expect(mocks.createSessionAndUpdateCookie).not.toHaveBeenCalled();
    });

    test("a provider-only account goes straight to its provider (no choice screen)", async () => {
      mocks.sendLoginname.mockResolvedValue({ redirect: "https://appleid.apple.com/auth/authorize?state=1" });

      expect(await signIn({ loginName: "event74@ya.ru" })).toEqual({
        redirect: "https://appleid.apple.com/auth/authorize?state=1",
      });
    });

    test("a passkey account gets the passkey button (with the password as an alternative)", async () => {
      mocks.sendLoginname.mockResolvedValue({
        redirect: "/passkey?loginName=event74%40ya.ru&altPassword=true&requestId=oidc_1&organization=org1",
      });

      expect(await signIn({ loginName: "event74@ya.ru", requestId: "oidc_1" })).toEqual({
        passkey: { loginName: "event74@ya.ru", organization: "org1", altPassword: true },
      });
    });

    test("passes errors, SAML posts and other steps through unchanged", async () => {
      mocks.sendLoginname.mockResolvedValueOnce({ error: "nope" });
      expect(await signIn({ loginName: "x" })).toEqual({ error: "nope" });

      mocks.sendLoginname.mockResolvedValueOnce({ samlData: { url: "https://idp/saml", fields: { a: "b" } } });
      expect(await signIn({ loginName: "x" })).toEqual({ samlData: { url: "https://idp/saml", fields: { a: "b" } } });

      mocks.sendLoginname.mockResolvedValueOnce({ redirect: "/verify?loginName=x&invite=true" });
      expect(await signIn({ loginName: "x" })).toEqual({ redirect: "/verify?loginName=x&invite=true" });

      mocks.sendLoginname.mockResolvedValueOnce(undefined);
      expect(await signIn({ loginName: "x" })).toEqual({ error: "loginname.errors.internalError" });
    });
  });

  describe("with a password — one session call with user and password checks", () => {
    beforeEach(() => {
      mocks.searchUsers.mockResolvedValue({ result: [passwordUser] });
      mocks.listAuthenticationMethodTypes.mockResolvedValue({
        authMethodTypes: [AuthenticationMethodType.PASSWORD, AuthenticationMethodType.IDP],
      });
    });

    test("checks the password in the same call that creates the session, then continues like the password step", async () => {
      const session = { id: "s1", factors: { user: { id: "u1", loginName: "event74@ya.ru" } } };
      mocks.createSessionAndUpdateCookie.mockResolvedValue({ session, sessionCookie: { id: "s1" } });
      mocks.finishPasswordLogin.mockResolvedValue({ redirect: "https://chat.example/callback" });

      const res = await signIn({ loginName: "event74@ya.ru", password: "secret", requestId: "oidc_1" });

      expect(res).toEqual({ redirect: "https://chat.example/callback" });
      expect(mocks.createSessionAndUpdateCookie).toHaveBeenCalledTimes(1);
      expect(mocks.createSessionAndUpdateCookie).toHaveBeenCalledWith({
        checks: { user: { search: { case: "userId", value: "u1" } }, password: { password: "secret" } },
        requestId: "oidc_1",
        lifetime: { seconds: BigInt(864000) },
      });
      expect(mocks.finishPasswordLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          session,
          sessionCookie: { id: "s1" },
          user: passwordUser,
          passwordChecked: true,
          requestId: "oidc_1",
        }),
      );
      expect(mocks.sendLoginname).not.toHaveBeenCalled();
    });

    test("searches with the org suffix like the login-name step", async () => {
      mocks.createSessionAndUpdateCookie.mockResolvedValue({ session: {}, sessionCookie: {} });
      mocks.finishPasswordLogin.mockResolvedValue({ redirect: "/signedin" });

      await signIn({ loginName: "event74", password: "secret", organization: "org1", suffix: "ya.ru" });

      expect(mocks.searchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ searchValue: "event74", organizationId: "org1", suffix: "ya.ru" }),
      );
    });

    test("wrong password and unknown account answer the same under enumeration protection", async () => {
      mocks.createSessionAndUpdateCookie.mockRejectedValue(
        Object.assign(new Error("Errors.User.Password.Invalid"), { findDetails: () => [{ failedAttempts: 2 }] }),
      );
      const wrongPassword = await signIn({ loginName: "event74@ya.ru", password: "bad" });

      mocks.searchUsers.mockResolvedValue({ result: [] });
      // The login-name step answers an unknown account with the decoy password step.
      mocks.sendLoginname.mockResolvedValue({ redirect: "/password?loginName=nobody%40ya.ru" });
      const unknown = await signIn({ loginName: "nobody@ya.ru", password: "bad" });

      expect(wrongPassword).toEqual({ error: "loginname.signIn.errors.invalidCredentials" });
      expect(unknown).toEqual(wrongPassword);
      expect(mocks.getLockoutSettings).not.toHaveBeenCalled();
    });

    test("without enumeration protection a wrong password reports the attempts left", async () => {
      mocks.getLoginSettings.mockResolvedValue(settings({ ignoreUnknownUsernames: false }));
      mocks.getLockoutSettings.mockResolvedValue({ maxPasswordAttempts: BigInt(10) });
      mocks.createSessionAndUpdateCookie.mockRejectedValue(
        Object.assign(new Error("Errors.User.Password.Invalid"), { findDetails: () => [{ failedAttempts: 3 }] }),
      );

      const res = await signIn({ loginName: "event74@ya.ru", password: "bad" });

      expect(res).toEqual({
        error: 'password.errors.failedToAuthenticate {"failedAttempts":3,"maxPasswordAttempts":"10","lockoutMessage":""}',
      });
    });

    test("without enumeration protection a locked account says so", async () => {
      const { isClassifiedError } = await import("@/lib/grpc/interceptors/error-classification");
      vi.mocked(isClassifiedError).mockReturnValue(true);
      mocks.getLoginSettings.mockResolvedValue(settings({ ignoreUnknownUsernames: false }));
      mocks.createSessionAndUpdateCookie.mockRejectedValue(new Error("Errors.User.Locked (COMMAND-JLK35)"));

      expect(await signIn({ loginName: "event74@ya.ru", password: "pw" })).toEqual({
        error: "password.errors.accountLockedContactAdmin",
      });
      vi.mocked(isClassifiedError).mockReturnValue(false);
    });

    test("an account without a password is led to its way in instead (provider)", async () => {
      mocks.listAuthenticationMethodTypes.mockResolvedValue({ authMethodTypes: [AuthenticationMethodType.IDP] });
      mocks.sendLoginname.mockResolvedValue({ redirect: "https://appleid.apple.com/auth/authorize?state=2" });

      const res = await signIn({ loginName: "event74@ya.ru", password: "typed-anyway" });

      expect(res).toEqual({ redirect: "https://appleid.apple.com/auth/authorize?state=2" });
      expect(mocks.createSessionAndUpdateCookie).not.toHaveBeenCalled();
    });

    test("an account with only a passkey gets the passkey button", async () => {
      mocks.listAuthenticationMethodTypes.mockResolvedValue({ authMethodTypes: [AuthenticationMethodType.PASSKEY] });
      mocks.sendLoginname.mockResolvedValue({ redirect: "/passkey?loginName=event74%40ya.ru&altPassword=false" });

      expect(await signIn({ loginName: "event74@ya.ru", password: "typed-anyway" })).toEqual({
        passkey: { loginName: "event74@ya.ru", altPassword: false },
      });
      expect(mocks.createSessionAndUpdateCookie).not.toHaveBeenCalled();
    });

    test("a login name the policy does not accept (e-mail login off) is treated as unknown", async () => {
      mocks.getLoginSettings.mockResolvedValue(settings({ disableLoginWithEmail: true, disableLoginWithPhone: true }));
      mocks.searchUsers.mockResolvedValue({ result: [{ ...passwordUser, preferredLoginName: "event74" }] });
      mocks.sendLoginname.mockResolvedValue({ redirect: "/password?loginName=event74%40ya.ru" });

      expect(await signIn({ loginName: "event74@ya.ru", password: "secret" })).toEqual({
        error: "loginname.signIn.errors.invalidCredentials",
      });
      expect(mocks.createSessionAndUpdateCookie).not.toHaveBeenCalled();
    });

    test("an initial (not yet set up) account goes the login-name way", async () => {
      mocks.searchUsers.mockResolvedValue({ result: [{ ...passwordUser, state: UserState.INITIAL }] });
      mocks.sendLoginname.mockResolvedValue({ error: "loginname.errors.initialUserNotSupported" });

      expect(await signIn({ loginName: "event74@ya.ru", password: "secret" })).toEqual({
        error: "loginname.errors.initialUserNotSupported",
      });
    });

    test("no local sign-in allowed: only what the login-name step offers", async () => {
      mocks.getLoginSettings.mockResolvedValue(settings({ allowLocalAuthentication: false }));
      mocks.sendLoginname.mockResolvedValue({ redirect: "https://idp.example/authorize" });

      expect(await signIn({ loginName: "event74@ya.ru", password: "secret" })).toEqual({
        redirect: "https://idp.example/authorize",
      });
      expect(mocks.searchUsers).not.toHaveBeenCalled();
    });
  });

  test("forgetLastLogin clears the remembered account", async () => {
    await forgetLastLogin();
    expect(mocks.clearLastLogin).toHaveBeenCalledTimes(1);
  });
});
