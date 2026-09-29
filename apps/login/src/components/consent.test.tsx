import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConsentScreen } from "./consent";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/server/device", () => ({
  approveDeviceWithSession: vi.fn(),
  completeDeviceAuthorization: vi.fn(),
}));

const session = { id: "s1", displayName: "Rodion Otletov", loginName: "event74@ya.ru" };

describe("ConsentScreen (device sign-in)", () => {
  let approve: ReturnType<typeof vi.fn>;
  let complete: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/lib/server/device");
    approve = vi.mocked(mod.approveDeviceWithSession);
    complete = vi.mocked(mod.completeDeviceAuthorization);
  });

  afterEach(cleanup);

  test("signed in: shows the code and the account, one click approves with that session", async () => {
    approve.mockResolvedValue({ ok: true });
    render(
      <ConsentScreen
        deviceAuthorizationRequestId="dev1"
        appName="HolyAgent"
        userCode="KVQW-RWBV"
        session={session}
        loginUrl="/loginname?requestId=device_dev1"
      />,
    );
    expect(screen.getByTestId("device-user-code")).toHaveTextContent("KVQW-RWBV");
    expect(screen.getByTestId("device-account")).toHaveTextContent("Rodion Otletov");
    fireEvent.click(screen.getByTestId("submit-button"));
    await waitFor(() => expect(screen.getByTestId("device-done")).toBeInTheDocument());
    expect(approve).toHaveBeenCalledWith("dev1", "s1");
  });

  test("not signed in: the main button leads to sign-in, nothing is approved", () => {
    render(
      <ConsentScreen
        deviceAuthorizationRequestId="dev1"
        appName="HolyAgent"
        userCode="KVQW-RWBV"
        loginUrl="/loginname?requestId=device_dev1"
      />,
    );
    expect(screen.getByTestId("submit-button").closest("a")).toHaveAttribute("href", "/loginname?requestId=device_dev1");
    expect(approve).not.toHaveBeenCalled();
  });

  test("expired browser session: explains and keeps the screen", async () => {
    approve.mockResolvedValue({ error: "session" });
    render(
      <ConsentScreen
        deviceAuthorizationRequestId="dev1"
        userCode="KVQW-RWBV"
        session={session}
        loginUrl="/loginname?requestId=device_dev1"
      />,
    );
    fireEvent.click(screen.getByTestId("submit-button"));
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("confirm.sessionGone"));
  });

  test("deny", async () => {
    complete.mockResolvedValue({});
    render(<ConsentScreen deviceAuthorizationRequestId="dev1" userCode="KVQW-RWBV" session={session} loginUrl="/x" />);
    fireEvent.click(screen.getByTestId("deny-button"));
    await waitFor(() => expect(screen.getByTestId("device-denied")).toBeInTheDocument());
    expect(complete).toHaveBeenCalledWith("dev1");
  });
});
