import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { sendLoginname } from "@/lib/server/loginname";
import { afterEach, describe, expect, test, vi } from "vitest";
import { UsernameForm } from "./username-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));

vi.mock("@/lib/server/loginname", () => ({
  sendLoginname: vi.fn(),
}));

describe("UsernameForm", () => {
  afterEach(cleanup);

  test("should autofocus the loginName input on mount", () => {
    const { getByTestId } = render(
      <UsernameForm loginName="" requestId={undefined} loginSettings={undefined} submit={false} allowRegister={false} />,
    );
    expect(getByTestId("username-text-input")).toHaveFocus();
  });

  test("an account that only signs in with a provider gets a choice, not a silent redirect", async () => {
    vi.mocked(sendLoginname).mockResolvedValue({
      idpChoice: { url: "https://appleid.apple.com/auth?x=1", name: "Apple", type: IdentityProviderType.APPLE, loginName: "event74@ya.ru" },
    } as never);
    const { getByTestId, queryByTestId } = render(
      <UsernameForm loginName="event74@ya.ru" requestId="r1" loginSettings={undefined} submit={true} allowRegister={false} />,
    );
    await waitFor(() => expect(getByTestId("idp-choice")).toBeTruthy());
    expect(getByTestId("idp-choice").textContent).toContain("idpOnly.description:event74@ya.ru|Apple");
    expect(getByTestId("idp-choice-continue").getAttribute("href")).toBe("https://appleid.apple.com/auth?x=1");
    fireEvent.click(getByTestId("idp-choice-other"));
    expect(queryByTestId("idp-choice")).toBeNull();
    expect(getByTestId("username-text-input")).toBeTruthy();
  });

  test("an account with a password next to the provider gets both", async () => {
    vi.mocked(sendLoginname).mockResolvedValue({
      idpChoice: {
        url: "https://github.com/login/oauth/authorize?x=1",
        name: "GitHub",
        type: IdentityProviderType.GITHUB,
        loginName: "dev@example.com",
        passwordUrl: "/password?loginName=dev%40example.com",
      },
    } as never);
    const { getByTestId } = render(
      <UsernameForm loginName="dev@example.com" requestId={undefined} loginSettings={undefined} submit={true} allowRegister={false} />,
    );
    await waitFor(() => expect(getByTestId("idp-choice-password")).toBeTruthy());
    expect(getByTestId("idp-choice-continue").getAttribute("href")).toContain("github.com");
  });
});
