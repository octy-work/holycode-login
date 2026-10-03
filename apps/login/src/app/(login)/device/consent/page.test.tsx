import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/service-url", () => ({ getServiceConfig: () => ({ serviceConfig: { baseUrl: "https://id.test" } }) }));
vi.mock("@/lib/zitadel", () => ({
  getDeviceAuthorizationRequest: vi.fn(),
  getDefaultOrg: vi.fn().mockResolvedValue({ id: "org1" }),
  getBrandingSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/device-session", () => ({ findDeviceSession: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/components/dynamic-theme", () => ({ DynamicTheme: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/brand-mark", () => ({ AppEmblem: () => null }));
vi.mock("@/components/consent", () => ({ ConsentScreen: () => <div data-testid="consent-screen" /> }));
vi.mock("@/components/translated", () => ({ Translated: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span> }));

const zitadel = await import("@/lib/zitadel");
const { default: Page } = await import("./page");

describe("device consent page", () => {
  afterEach(cleanup);

  test("a request Zitadel no longer has (approved or expired) is a message, not an error page", async () => {
    vi.mocked(zitadel.getDeviceAuthorizationRequest).mockRejectedValue(
      Object.assign(new Error("[not_found] Device Authorization Request does not exist"), { code: 5 }),
    );
    const ui = await Page({ searchParams: Promise.resolve({ user_code: "ABCD-EFGH", requestId: "device_1" }) });
    const { getByTestId, queryByTestId } = render(ui);
    expect(getByTestId("device-request-gone")).toHaveTextContent("gone.title");
    expect(queryByTestId("consent-screen")).toBeNull();
  });

  test("a live request shows the confirmation", async () => {
    vi.mocked(zitadel.getDeviceAuthorizationRequest).mockResolvedValue({
      deviceAuthorizationRequest: { id: "1", appName: "HolyAgent" },
    } as any);
    const ui = await Page({ searchParams: Promise.resolve({ user_code: "ABCD-EFGH", requestId: "device_1" }) });
    const { getByTestId } = render(ui);
    expect(getByTestId("consent-screen")).toBeInTheDocument();
  });
});
