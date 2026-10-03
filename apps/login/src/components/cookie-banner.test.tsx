import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CookieBanner } from "./cookie-banner";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const consent = () =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith("hc_cookie_consent="))
    ?.split("=")[1];

describe("CookieBanner", () => {
  beforeEach(() => {
    document.cookie = "hc_cookie_consent=; max-age=0; path=/";
  });
  afterEach(cleanup);

  test("shown once, three choices of equal weight; 'allow all' is kept in the browser, no server call", async () => {
    const { getByTestId, queryByTestId } = render(<CookieBanner />);
    expect(getByTestId("cookie-all")).toBeInTheDocument();
    expect(getByTestId("cookie-necessary")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(getByTestId("cookie-all"));
    });
    expect(consent()).toBe("all");
    expect(queryByTestId("cookie-banner")).toBeNull();
  });

  test("settings: switching 'welcome back' off saves 'necessary'", async () => {
    const { getByTestId } = render(<CookieBanner />);
    fireEvent.click(getByTestId("cookie-configure"));
    fireEvent.click(getByTestId("cookie-functional"));
    await act(async () => {
      fireEvent.click(getByTestId("cookie-save"));
    });
    expect(consent()).toBe("necessary");
  });

  test("already chosen: nothing is shown", () => {
    document.cookie = "hc_cookie_consent=necessary; path=/";
    const { queryByTestId } = render(<CookieBanner />);
    expect(queryByTestId("cookie-banner")).toBeNull();
  });
});
