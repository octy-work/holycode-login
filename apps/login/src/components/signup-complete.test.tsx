import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SignupComplete } from "./signup-complete";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, string>) => (values?.address ? `${key}:${values.address}` : key);
  return { useTranslations: () => t, useLocale: () => "ru" };
});
vi.mock("@/lib/server/signup", () => ({
  checkMailboxName: vi.fn(),
  completeIdpSignup: vi.fn(),
  issueSignupChallenge: vi.fn().mockResolvedValue({ challenge: "c1", difficulty: 16 }),
}));
vi.mock("@/lib/pow", () => ({ solvePow: vi.fn().mockResolvedValue("42") }));

const props = {
  idpUserId: "google-42",
  idpId: "idp1",
  idpIntent: { idpIntentId: "i1", idpIntentToken: "t1" },
  organization: "org1",
  requestId: "oidc_1",
  defaultValues: { email: "rodion@gmail.com", firstname: "Родион", lastname: "Отлетов" },
  domains: [
    { domain: "holycode.org", group: "holycode" as const },
    { domain: "sozv.one", group: "product" as const },
  ],
  needConsents: false,
};

describe("SignupComplete — the e-mail step", () => {
  let checkMailboxName: any;
  let completeIdpSignup: any;
  beforeEach(async () => {
    const mod = await import("@/lib/server/signup");
    checkMailboxName = vi.mocked(mod.checkMailboxName);
    completeIdpSignup = vi.mocked(mod.completeIdpSignup);
    checkMailboxName.mockReset();
    completeIdpSignup.mockReset();
    push.mockReset();
  });
  afterEach(cleanup);

  test("suggests a name from the person's name, checks it and offers the other domain as an alias", async () => {
    checkMailboxName.mockResolvedValue({
      status: "available",
      address: "rodion.otletov@holycode.org",
      aliases: [{ address: "rodion.otletov@sozv.one", available: true }],
    });
    completeIdpSignup.mockResolvedValue({ redirect: "/register/protect" });
    const { getByTestId } = render(<SignupComplete {...props} />);

    expect(getByTestId("mailbox-input")).toHaveValue("rodion.otletov");
    await waitFor(
      () => expect(getByTestId("mailbox-status")).toHaveTextContent("mailbox.available:rodion.otletov@holycode.org"),
      {
        timeout: 2000,
      },
    );
    expect(checkMailboxName).toHaveBeenCalledWith({
      local: "rodion.otletov",
      domain: "holycode.org",
      aliases: ["sozv.one"],
    });

    fireEvent.click(getByTestId("alias-sozv.one"));
    await act(async () => {
      fireEvent.click(getByTestId("signup-submit"));
    });
    expect(completeIdpSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        mail: { kind: "hosted", local: "rodion.otletov", domain: "holycode.org", aliases: ["sozv.one"] },
      }),
    );
    expect(push).toHaveBeenCalledWith("/register/protect");
  });

  test("a taken name keeps the button off", async () => {
    checkMailboxName.mockResolvedValue({ status: "taken", address: "rodion.otletov@holycode.org", aliases: [] });
    const { getByTestId } = render(<SignupComplete {...props} />);
    await waitFor(() => expect(getByTestId("mailbox-status")).toHaveTextContent("mailbox.status.taken"), { timeout: 2000 });
    expect(getByTestId("signup-submit")).toBeDisabled();
  });

  test("'my e-mail' uses the provider's address", async () => {
    completeIdpSignup.mockResolvedValue({ redirect: "/signedin" });
    checkMailboxName.mockResolvedValue({ status: "available", address: "x", aliases: [] });
    const { getByTestId } = render(<SignupComplete {...props} />);
    fireEvent.click(getByTestId("mail-mode-own"));
    expect(getByTestId("own-email-input")).toHaveValue("rodion@gmail.com");
    await act(async () => {
      fireEvent.click(getByTestId("signup-submit"));
    });
    expect(completeIdpSignup).toHaveBeenCalledWith(
      expect.objectContaining({ mail: { kind: "own" }, ownEmail: "rodion@gmail.com" }),
    );
  });

  test("no HolyCode domains: only the own e-mail, no tabs", () => {
    const { queryByTestId, getByTestId } = render(<SignupComplete {...props} domains={[]} />);
    expect(queryByTestId("mail-mode")).toBeNull();
    expect(getByTestId("own-mail")).toBeInTheDocument();
  });

  test("straight from a provider button: the consents are asked here", () => {
    checkMailboxName.mockResolvedValue({ status: "available", address: "x", aliases: [] });
    const { getByTestId } = render(<SignupComplete {...props} needConsents domains={[]} />);
    expect(getByTestId("signup-consents")).toBeInTheDocument();
    expect(getByTestId("signup-submit")).toBeDisabled();
    fireEvent.click(getByTestId("consent-terms"));
    fireEvent.click(getByTestId("consent-pd"));
    expect(getByTestId("signup-submit")).not.toBeDisabled();
  });
});
