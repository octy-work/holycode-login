import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("../service-url", () => ({ getServiceConfig: () => ({ serviceConfig: { baseUrl: "https://id.test" } }) }));
vi.mock("../zitadel", () => ({ getLoginSettings: vi.fn().mockResolvedValue({}) }));
vi.mock("../client", () => ({ completeFlowOrGetUrl: vi.fn() }));
vi.mock("./session", () => ({ updateOrCreateSession: vi.fn() }));

const session = await import("./session");
const client = await import("../client");
const { sendRecoveryCode } = await import("./recovery-code");

describe("sendRecoveryCode", () => {
  beforeEach(() => vi.clearAllMocks());

  test("checks the code in the session and finishes the request", async () => {
    vi.mocked(session.updateOrCreateSession).mockResolvedValue({
      sessionId: "s1",
      factors: { user: { loginName: "rodion@holycode.org", organizationId: "org1" } },
    } as any);
    vi.mocked(client.completeFlowOrGetUrl).mockResolvedValue({ redirect: "/signedin" } as any);

    const res = await sendRecoveryCode({ loginName: "rodion@holycode.org", requestId: "oidc_1", code: " ABCD-1234 " });

    expect(session.updateOrCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        loginName: "rodion@holycode.org",
        requestId: "oidc_1",
        checks: expect.objectContaining({ recoveryCode: expect.objectContaining({ code: "ABCD-1234" }) }),
      }),
    );
    expect(client.completeFlowOrGetUrl).toHaveBeenCalledWith(
      { sessionId: "s1", requestId: "oidc_1", organization: "org1" },
      undefined,
    );
    expect(res).toEqual({ redirect: "/signedin" });
  });

  test("a wrong or spent code is one message", async () => {
    vi.mocked(session.updateOrCreateSession).mockResolvedValue({ error: "Errors.User.RecoveryCode.Invalid" } as any);
    expect(await sendRecoveryCode({ loginName: "x", code: "nope" })).toEqual({ error: "errors.invalid" });
    expect(await sendRecoveryCode({ loginName: "x", code: "  " })).toEqual({ error: "errors.invalid" });
  });
});
