import { beforeEach, describe, expect, test, vi } from "vitest";
import { createNewSessionFromIdpIntent } from "./idp";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/cookies", () => ({ getSessionCookieById: vi.fn() }));
vi.mock("../cookies", () => ({ getSessionCookieById: vi.fn() }));
vi.mock("../fingerprint", () => ({ getOrSetFingerprintId: vi.fn() }));
vi.mock("./host", () => ({ getPublicHost: vi.fn(() => "id.example") }));
vi.mock("../service-url", () => ({ getServiceConfig: vi.fn(() => ({ serviceConfig: { baseUrl: "https://id.example" } })) }));
vi.mock("../zitadel", () => ({
  getUserByID: vi.fn(),
  getLoginSettings: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  startIdentityProviderFlow: vi.fn(),
  startLDAPIdentityProviderFlow: vi.fn(),
}));
vi.mock("./cookie", () => ({ createSessionForIdpAndUpdateCookie: vi.fn() }));
vi.mock("../verify-helper", () => ({ checkEmailVerification: vi.fn(), checkMFAFactors: vi.fn() }));
vi.mock("../client", () => ({ completeFlowOrGetUrl: vi.fn() }));
vi.mock("./last-login", () => ({ rememberLastLogin: vi.fn() }));

describe("createNewSessionFromIdpIntent — HolyCode last sign-in", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const zitadel = await import("../zitadel");
    const cookie = await import("./cookie");
    const client = await import("../client");
    vi.mocked(zitadel.getUserByID).mockResolvedValue({
      user: { userId: "u1", details: { resourceOwner: "org1" }, type: { case: "human", value: {} } },
    } as any);
    vi.mocked(zitadel.getLoginSettings).mockResolvedValue({} as any);
    vi.mocked(zitadel.listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
    vi.mocked(cookie.createSessionForIdpAndUpdateCookie).mockResolvedValue({
      id: "s1",
      factors: { user: { id: "u1", loginName: "event74@ya.ru", displayName: "Event", organizationId: "org1" } },
    } as any);
    vi.mocked(client.completeFlowOrGetUrl).mockResolvedValue({ redirect: "https://chat.example/callback" });
  });

  test("remembers the account and the provider it came through", async () => {
    const { rememberLastLogin } = await import("./last-login");

    const res = await createNewSessionFromIdpIntent({
      userId: "u1",
      idpIntent: { idpIntentId: "i1", idpIntentToken: "t1" },
      idpId: "392465682232508420",
      requestId: "oidc_1",
    });

    expect(res).toEqual({ redirect: "https://chat.example/callback" });
    expect(vi.mocked(rememberLastLogin)).toHaveBeenCalledWith({
      loginName: "event74@ya.ru",
      displayName: "Event",
      method: "idp:392465682232508420",
    });
  });

  test("nothing to remember when the session could not be created", async () => {
    const { rememberLastLogin } = await import("./last-login");
    const cookie = await import("./cookie");
    vi.mocked(cookie.createSessionForIdpAndUpdateCookie).mockResolvedValue(undefined as any);

    const res = await createNewSessionFromIdpIntent({
      userId: "u1",
      idpIntent: { idpIntentId: "i1", idpIntentToken: "t1" },
      idpId: "392465682232508420",
    });

    expect(res).toEqual({ error: "Could not create session" });
    expect(vi.mocked(rememberLastLogin)).not.toHaveBeenCalled();
  });
});
