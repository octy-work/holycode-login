import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearReturnTo,
  peekReturnTo,
  rememberReturnTo,
  RETURN_TO_COOKIE,
  RETURN_TO_MAX_AGE_SECONDS,
  takeReturnTo,
} from "./return-to";

const jar = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => jar),
}));

describe("hc_return_to cookie (back to the profile after a flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jar.get.mockReturnValue(undefined);
  });

  test("remembers the profile: HttpOnly, Lax, 15 minutes, whole host", async () => {
    expect(await rememberReturnTo("https://id.holycode.org/me/security", "id.holycode.org")).toBe(true);
    expect(jar.set).toHaveBeenCalledWith({
      name: RETURN_TO_COOKIE,
      value: "https://id.holycode.org/me/security",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RETURN_TO_MAX_AGE_SECONDS,
    });
    expect(RETURN_TO_MAX_AGE_SECONDS).toBe(15 * 60);
  });

  test("refuses anything but the profile on this host", async () => {
    expect(await rememberReturnTo("https://evil.example/me", "id.holycode.org")).toBe(false);
    expect(await rememberReturnTo("/loginname", "id.holycode.org")).toBe(false);
    expect(await rememberReturnTo("https://id.holycode.org/me", "chat.holycode.org")).toBe(false);
    expect(jar.set).not.toHaveBeenCalled();
  });

  test("takes the target once and re-validates what the browser sent back", async () => {
    jar.get.mockReturnValue({ value: "/me/data" });
    expect(await takeReturnTo()).toBe("/me/data");
    expect(jar.delete).toHaveBeenCalledWith({ name: RETURN_TO_COOKIE, path: "/" });

    jar.get.mockReturnValue({ value: "https://evil.example/me" });
    expect(await takeReturnTo("id.holycode.org")).toBeNull();
    expect(await peekReturnTo("id.holycode.org")).toBeNull();
  });

  test("keeps working while rendering, where cookies cannot be written", async () => {
    jar.get.mockReturnValue({ value: "/me" });
    jar.delete.mockImplementationOnce(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    expect(await takeReturnTo()).toBe("/me");

    jar.set.mockImplementationOnce(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    expect(await rememberReturnTo("/me")).toBe(false);

    await clearReturnTo();
    expect(jar.delete).toHaveBeenCalledTimes(2);
  });
});
