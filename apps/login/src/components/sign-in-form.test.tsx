import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SignInForm } from "./sign-in-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.provider ? `${key}:${values.provider}` : key,
}));

vi.mock("@/lib/server/sign-in", () => ({
  signIn: vi.fn(),
  forgetLastLogin: vi.fn(),
}));

vi.mock("@/lib/server/password", () => ({
  resetPassword: vi.fn(),
}));

vi.mock("@/lib/server/idp", () => ({
  redirectToIdp: vi.fn(),
}));

vi.mock("@/lib/server/passkeys", () => ({
  sendPasskey: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({
  updateOrCreateSession: vi.fn(),
}));

vi.mock("@/lib/server/passkey-discover", () => ({
  startDiscoveredPasskey: vi.fn(),
}));

const apple = { id: "392465682232508420", name: "Apple", type: IdentityProviderType.APPLE } as any;
const github = { id: "392465683138478084", name: "GitHub", type: IdentityProviderType.GITHUB } as any;
const loginSettings = { allowLocalAuthentication: true, disableLoginWithPhone: true } as any;

const baseProps = {
  requestId: "oidc_1",
  organization: undefined,
  defaultOrganization: "org1",
  loginSettings,
  submit: false,
  identityProviders: [apple, github],
  allowRegister: true,
  remembered: null,
  startWith: "form" as const,
};

describe("SignInForm — first visit (one screen)", () => {
  let signIn: any;

  beforeEach(async () => {
    const mod = await import("@/lib/server/sign-in");
    signIn = vi.mocked(mod.signIn);
    signIn.mockReset();
    push.mockReset();
  });
  afterEach(cleanup);

  test("login and password on one screen, providers and register below", () => {
    const { getByTestId, getByText } = render(<SignInForm {...baseProps} />);

    expect(getByTestId("username-text-input")).toHaveFocus();
    expect(getByTestId("password-text-input")).toHaveAttribute("type", "password");
    expect(getByTestId("password-text-input")).toHaveAttribute("autocomplete", "current-password");
    expect(getByTestId("reset-button")).toHaveTextContent("signIn.forgotPassword");
    expect(getByTestId("submit-button")).toHaveTextContent("signIn.submit");
    expect(getByText("signIn.or")).toBeInTheDocument();
    expect(getByTestId("idp-buttons")).toBeInTheDocument();
    expect(getByTestId("register-button")).toBeInTheDocument();
  });

  test("with a prefilled login name the password field gets the focus", () => {
    const { getByTestId } = render(<SignInForm {...baseProps} loginName="event74@ya.ru" />);
    expect(getByTestId("username-text-input")).toHaveValue("event74@ya.ru");
    expect(getByTestId("password-text-input")).toHaveFocus();
  });

  test("submits login and password together, keeping the request parameters", async () => {
    signIn.mockResolvedValue({ redirect: "/signedin" });
    const { getByTestId } = render(<SignInForm {...baseProps} organization="org9" suffix="ya.ru" />);

    fireEvent.change(getByTestId("username-text-input"), { target: { value: "event74" } });
    fireEvent.change(getByTestId("password-text-input"), { target: { value: "pw" } });
    await act(async () => {
      fireEvent.click(getByTestId("submit-button"));
    });

    expect(signIn).toHaveBeenCalledWith({
      loginName: "event74",
      password: "pw",
      requestId: "oidc_1",
      organization: "org9",
      defaultOrganization: "org1",
      suffix: "ya.ru",
    });
    expect(push).toHaveBeenCalledWith("/signedin");
  });

  test("without a password: asks for it on the same screen", async () => {
    signIn.mockResolvedValue({ passwordRequired: true });
    const { getByTestId } = render(<SignInForm {...baseProps} />);

    fireEvent.change(getByTestId("username-text-input"), { target: { value: "event74@ya.ru" } });
    await act(async () => {
      fireEvent.click(getByTestId("submit-button"));
    });

    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ loginName: "event74@ya.ru", password: undefined }));
    await waitFor(() => expect(getByTestId("password-text-input")).toHaveFocus());
    expect(getByTestId("password-required")).toHaveTextContent("signIn.passwordRequired");
    expect(push).not.toHaveBeenCalled();
  });

  test("a wrong login or password is shown in the form", async () => {
    signIn.mockResolvedValue({ error: "Wrong login or password." });
    const { getByTestId } = render(<SignInForm {...baseProps} />);

    fireEvent.change(getByTestId("username-text-input"), { target: { value: "event74@ya.ru" } });
    fireEvent.change(getByTestId("password-text-input"), { target: { value: "bad" } });
    await act(async () => {
      fireEvent.click(getByTestId("submit-button"));
    });

    expect(getByTestId("error")).toHaveTextContent("Wrong login or password.");
  });

  test("a passkey account gets the passkey button (password kept when the account has one)", async () => {
    signIn.mockResolvedValue({ passkey: { loginName: "event74@ya.ru", altPassword: true } });
    const { getByTestId, queryByTestId } = render(<SignInForm {...baseProps} />);

    fireEvent.change(getByTestId("username-text-input"), { target: { value: "event74@ya.ru" } });
    await act(async () => {
      fireEvent.click(getByTestId("submit-button"));
    });

    expect(getByTestId("passkey-button")).toHaveTextContent("signIn.passkey");
    expect(queryByTestId("password-text-input")).toBeInTheDocument();
  });

  test("no provider-choice screen: a provider redirect is followed", async () => {
    signIn.mockResolvedValue({ redirect: "/idp/apple/start" });
    const { getByTestId, queryByTestId } = render(<SignInForm {...baseProps} />);

    fireEvent.change(getByTestId("username-text-input"), { target: { value: "event74@ya.ru" } });
    await act(async () => {
      fireEvent.click(getByTestId("submit-button"));
    });

    expect(push).toHaveBeenCalledWith("/idp/apple/start");
    expect(queryByTestId("idp-choice")).toBeNull();
  });

  test("upstream submit=true continues with the prefilled login name", async () => {
    signIn.mockResolvedValue({ passwordRequired: true });
    await act(async () => {
      render(<SignInForm {...baseProps} loginName="event74@ya.ru" submit />);
    });
    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ loginName: "event74@ya.ru", password: undefined }));
  });
});

describe("SignInForm — welcome back", () => {
  let signIn: any;
  let forgetLastLogin: any;

  beforeEach(async () => {
    const mod = await import("@/lib/server/sign-in");
    signIn = vi.mocked(mod.signIn);
    forgetLastLogin = vi.mocked(mod.forgetLastLogin);
    signIn.mockReset();
    forgetLastLogin.mockReset();
  });
  afterEach(cleanup);

  test("password last: who, 'Not me', the password in focus, the remembered provider below", async () => {
    signIn.mockResolvedValue({ redirect: "/signedin" });
    const remembered = {
      loginName: "event74@ya.ru",
      primary: { kind: "password" as const },
      rememberedIdpIds: [apple.id],
      passkeyRemembered: false,
    };
    const { getByTestId, queryByTestId, getByText } = render(<SignInForm {...baseProps} remembered={remembered} />);

    expect(getByTestId("remembered-account")).toHaveTextContent("event74@ya.ru");
    expect(getByText("e")).toBeInTheDocument(); // initial (upper-cased by CSS)
    expect(getByTestId("not-me")).toHaveTextContent("returning.notMe");
    expect(getByTestId("password-text-input")).toHaveFocus();
    expect(queryByTestId("username-text-input")).toBeNull();
    expect(getByTestId(`idp-button-${apple.id}`)).toHaveTextContent("signIn.continueWith:Apple");

    fireEvent.change(getByTestId("password-text-input"), { target: { value: "pw" } });
    await act(async () => {
      fireEvent.click(getByTestId("submit-button"));
    });
    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ loginName: "event74@ya.ru", password: "pw" }));
  });

  test("an empty password is asked for right there, without a round trip", async () => {
    const remembered = {
      loginName: "event74@ya.ru",
      primary: { kind: "password" as const },
      rememberedIdpIds: [],
      passkeyRemembered: false,
    };
    const { getByTestId } = render(<SignInForm {...baseProps} remembered={remembered} />);

    await act(async () => {
      fireEvent.click(getByTestId("submit-button"));
    });

    expect(signIn).not.toHaveBeenCalled();
    expect(getByTestId("password-required")).toBeInTheDocument();
    expect(getByTestId("password-text-input")).toHaveFocus();
  });

  test("provider last: its button leads, the password is one tap away", () => {
    const remembered = {
      loginName: "event74@ya.ru",
      primary: { kind: "idp" as const, idpId: apple.id },
      rememberedIdpIds: [],
      passkeyRemembered: false,
    };
    const { getByTestId, queryByTestId } = render(<SignInForm {...baseProps} remembered={remembered} />);

    const primary = getByTestId(`idp-button-${apple.id}`).querySelector("button");
    expect(primary?.className).toContain("hc-btn-primary");
    expect(queryByTestId("password-text-input")).toBeNull();

    fireEvent.click(getByTestId("use-password-button"));
    expect(getByTestId("password-text-input")).toBeInTheDocument();
    // Apple stays offered as a secondary button.
    expect(getByTestId(`idp-button-${apple.id}`).querySelector("button")?.className).not.toContain("hc-btn-primary");
  });

  test("passkey last: the passkey button leads", () => {
    const remembered = {
      loginName: "event74@ya.ru",
      primary: { kind: "passkey" as const },
      rememberedIdpIds: [],
      passkeyRemembered: false,
    };
    const { getByTestId } = render(<SignInForm {...baseProps} remembered={remembered} />);
    expect(getByTestId("passkey-button").className).toContain("hc-btn-primary");
  });

  test("'Not me' forgets the account and shows the empty form", async () => {
    const remembered = {
      loginName: "event74@ya.ru",
      primary: { kind: "password" as const },
      rememberedIdpIds: [],
      passkeyRemembered: false,
    };
    const { getByTestId, queryByTestId } = render(<SignInForm {...baseProps} remembered={remembered} />);

    await act(async () => {
      fireEvent.click(getByTestId("not-me"));
    });

    expect(forgetLastLogin).toHaveBeenCalledTimes(1);
    expect(queryByTestId("remembered-account")).toBeNull();
    expect(getByTestId("username-text-input")).toHaveValue("");
  });
});

describe("SignInForm — the choice of ways in (02.10.2026)", () => {
  let startDiscoveredPasskey: any;
  let sendPasskey: any;
  const originalCredential = (window as any).PublicKeyCredential;
  const originalCredentials = (navigator as any).credentials;

  const withWebAuthn = (get: (...args: any[]) => Promise<any>) => {
    (window as any).PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    };
    Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
  };
  const buffer = (s: string) => new TextEncoder().encode(s).buffer;

  beforeEach(async () => {
    startDiscoveredPasskey = vi.mocked((await import("@/lib/server/passkey-discover")).startDiscoveredPasskey);
    sendPasskey = vi.mocked((await import("@/lib/server/passkeys")).sendPasskey);
    startDiscoveredPasskey.mockReset();
    sendPasskey.mockReset();
    push.mockReset();
  });
  afterEach(() => {
    cleanup();
    (window as any).PublicKeyCredential = originalCredential;
    Object.defineProperty(navigator, "credentials", { value: originalCredentials, configurable: true });
  });

  const props = { ...baseProps, startWith: "choose" as const, passkeysAllowed: true };

  test("starts with the ways in: login or e-mail, providers as named buttons, register", () => {
    const { getByTestId, queryByTestId } = render(<SignInForm {...props} />);

    expect(getByTestId("choose-login")).toHaveTextContent("chooser.login");
    expect(queryByTestId("username-text-input")).toBeNull();
    expect(getByTestId("idp-buttons")).toHaveTextContent("chooser.continueWith:Apple");
    expect(getByTestId("idp-buttons")).toHaveTextContent("chooser.continueWith:GitHub");
    expect(getByTestId("register-button")).toBeInTheDocument();
    // jsdom has no WebAuthn: no passkey button.
    expect(queryByTestId("discover-passkey")).toBeNull();
  });

  test("'login or e-mail' opens the form, 'All ways' brings the choice back", () => {
    const { getByTestId, queryByTestId } = render(<SignInForm {...props} />);

    fireEvent.click(getByTestId("choose-login"));
    expect(getByTestId("username-text-input")).toHaveFocus();
    expect(getByTestId("password-text-input")).toBeInTheDocument();

    fireEvent.click(getByTestId("back-to-choice"));
    expect(queryByTestId("username-text-input")).toBeNull();
    expect(getByTestId("choose-login")).toBeInTheDocument();
  });

  test("a login hint goes straight to the form", () => {
    const { getByTestId, queryByTestId } = render(<SignInForm {...props} loginName="event74@ya.ru" />);
    expect(getByTestId("username-text-input")).toHaveValue("event74@ya.ru");
    expect(queryByTestId("back-to-choice")).toBeNull();
  });

  test("with WebAuthn the passkey button leads, named after the device", async () => {
    withWebAuthn(vi.fn());
    const { findByTestId, getByTestId } = render(<SignInForm {...props} />);

    expect(await findByTestId("discover-passkey")).toHaveTextContent("chooser.passkey.touchId");
    expect(getByTestId("discover-passkey").className).toContain("hc-btn-primary");
    expect(getByTestId("choose-login").className).not.toContain("hc-btn-primary");
  });

  test("the server's guess puts the button in the first paint; no WebAuthn hides it", async () => {
    withWebAuthn(vi.fn());
    const first = render(<SignInForm {...props} passkeyKindHint="touchId" />);
    expect(first.getByTestId("discover-passkey")).toHaveTextContent("chooser.passkey.touchId");
    first.unmount();

    (window as any).PublicKeyCredential = undefined;
    const second = render(<SignInForm {...props} passkeyKindHint="touchId" />);
    await waitFor(() => expect(second.queryByTestId("discover-passkey")).toBeNull());
  });

  test("two touches: the first finds the account, the second answers its challenge", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        id: "c1",
        rawId: buffer("c1"),
        type: "public-key",
        response: { userHandle: buffer("392454771388186628") },
      })
      .mockResolvedValueOnce({
        id: "c1",
        rawId: buffer("c1"),
        type: "public-key",
        response: {
          authenticatorData: buffer("a"),
          clientDataJSON: buffer("{}"),
          signature: buffer("s"),
          userHandle: buffer("392454771388186628"),
        },
      });
    withWebAuthn(get);
    startDiscoveredPasskey.mockResolvedValue({ sessionId: "s1", publicKey: { challenge: "AAAA", allowCredentials: [] } });
    sendPasskey.mockResolvedValue({ redirect: "/signedin" });

    const { findByTestId } = render(<SignInForm {...props} />);
    const discover = await findByTestId("discover-passkey");
    await act(async () => {
      fireEvent.click(discover);
    });

    expect(get.mock.calls[0][0].publicKey.allowCredentials).toBeUndefined();
    expect(startDiscoveredPasskey).toHaveBeenCalledWith({ userHandle: expect.any(String), requestId: "oidc_1" });

    const confirm = await findByTestId("discover-confirm");
    expect(confirm).toHaveTextContent("chooser.confirm.touchId");
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(sendPasskey).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s1", requestId: "oidc_1" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/signedin"));
  });

  test("a passkey without an account in it: says so and stays on the choice", async () => {
    withWebAuthn(
      vi.fn().mockResolvedValue({ id: "c1", rawId: buffer("c1"), type: "public-key", response: { userHandle: null } }),
    );
    const { findByTestId, getByTestId } = render(<SignInForm {...props} />);

    const discover = await findByTestId("discover-passkey");
    await act(async () => {
      fireEvent.click(discover);
    });

    expect(startDiscoveredPasskey).not.toHaveBeenCalled();
    expect(getByTestId("error")).toHaveTextContent("discover.noAccount");
    expect(getByTestId("choose-login")).toBeInTheDocument();
  });
});
