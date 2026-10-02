import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CookieBanner } from "./cookie-banner";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/server/signup", () => ({ setCookieConsent: vi.fn() }));

describe("CookieBanner", () => {
  let setCookieConsent: any;
  beforeEach(async () => {
    setCookieConsent = vi.mocked((await import("@/lib/server/signup")).setCookieConsent);
    setCookieConsent.mockReset();
    document.cookie = "hc_cookie_consent=; max-age=0; path=/";
  });
  afterEach(cleanup);

  test("shown once, three choices of equal weight; 'allow all' is remembered", async () => {
    const { getByTestId, queryByTestId } = render(<CookieBanner />);
    expect(getByTestId("cookie-all")).toBeInTheDocument();
    expect(getByTestId("cookie-necessary")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(getByTestId("cookie-all"));
    });
    expect(setCookieConsent).toHaveBeenCalledWith("all");
    expect(queryByTestId("cookie-banner")).toBeNull();
  });

  test("settings: switching 'welcome back' off saves 'necessary'", async () => {
    const { getByTestId } = render(<CookieBanner />);
    fireEvent.click(getByTestId("cookie-configure"));
    fireEvent.click(getByTestId("cookie-functional"));
    await act(async () => {
      fireEvent.click(getByTestId("cookie-save"));
    });
    expect(setCookieConsent).toHaveBeenCalledWith("necessary");
  });

  test("already chosen: nothing is shown", () => {
    document.cookie = "hc_cookie_consent=necessary; path=/";
    const { queryByTestId } = render(<CookieBanner />);
    expect(queryByTestId("cookie-banner")).toBeNull();
  });
});
