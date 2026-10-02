import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SignupStart } from "./signup-start";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, string>) => (values?.provider ? `${key}:${values.provider}` : key);
  return { useTranslations: () => t, useLocale: () => "ru" };
});
vi.mock("@/lib/server/signup", () => ({ startSignup: vi.fn() }));
vi.mock("@/lib/server/idp", () => ({ redirectToIdp: vi.fn() }));

const google = { id: "g1", name: "Google", type: IdentityProviderType.GOOGLE } as any;

describe("SignupStart — who and consents, then a provider", () => {
  let startSignup: any;
  beforeEach(async () => {
    startSignup = vi.mocked((await import("@/lib/server/signup")).startSignup);
    startSignup.mockReset();
  });
  afterEach(cleanup);

  test("continue stays off until both consents are ticked", async () => {
    startSignup.mockResolvedValue({ ok: true });
    const { getByTestId } = render(<SignupStart identityProviders={[google]} requestId="oidc_1" />);

    expect(getByTestId("who-personal")).toHaveAttribute("aria-checked", "true");
    expect(getByTestId("signup-continue")).toBeDisabled();
    fireEvent.click(getByTestId("consent-terms"));
    expect(getByTestId("signup-continue")).toBeDisabled();
    fireEvent.click(getByTestId("consent-pd"));
    expect(getByTestId("signup-continue")).not.toBeDisabled();

    fireEvent.click(getByTestId("who-team"));
    await act(async () => {
      fireEvent.click(getByTestId("signup-continue"));
    });
    expect(startSignup).toHaveBeenCalledWith({
      who: "team",
      terms: true,
      pd: true,
      requestId: "oidc_1",
      organization: undefined,
    });
    expect(getByTestId("signup-anchor")).toHaveTextContent("anchor.continueWith:Google");
  });

  test("back returns to the first step", async () => {
    startSignup.mockResolvedValue({ ok: true });
    const { getByTestId, queryByTestId } = render(<SignupStart identityProviders={[google]} />);
    fireEvent.click(getByTestId("consent-terms"));
    fireEvent.click(getByTestId("consent-pd"));
    await act(async () => {
      fireEvent.click(getByTestId("signup-continue"));
    });
    fireEvent.click(getByTestId("signup-back"));
    expect(queryByTestId("signup-anchor")).toBeNull();
    expect(getByTestId("signup-who")).toBeInTheDocument();
  });

  test("a refused step 1 shows the reason", async () => {
    startSignup.mockResolvedValue({ error: "errors.consents" });
    const { getByTestId } = render(<SignupStart identityProviders={[google]} />);
    fireEvent.click(getByTestId("consent-terms"));
    fireEvent.click(getByTestId("consent-pd"));
    await act(async () => {
      fireEvent.click(getByTestId("signup-continue"));
    });
    expect(getByTestId("error")).toHaveTextContent("errors.consents");
  });
});
