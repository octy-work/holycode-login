import { beforeEach, describe, expect, test, vi } from "vitest";
import { LAST_LOGIN_COOKIE_NAME, LAST_LOGIN_MAX_AGE_SECONDS, serializeLastLogin } from "../last-login";
import { clearLastLogin, readLastLogin, rememberLastLogin } from "./last-login";

const jar = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => jar),
}));

describe("hc_last_login cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jar.get.mockReturnValue(undefined);
  });

  test("remembers the account and the way in: HttpOnly, SameSite=Lax, ~180 days, whole host", async () => {
    await rememberLastLogin({ loginName: "event74@ya.ru", displayName: "Event", method: "password" });

    expect(jar.set).toHaveBeenCalledWith({
      name: LAST_LOGIN_COOKIE_NAME,
      value: expect.any(String),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LAST_LOGIN_MAX_AGE_SECONDS,
    });
    expect(JSON.parse(jar.set.mock.calls[0][0].value)).toEqual({ v: 1, l: "event74@ya.ru", n: "Event", m: "password" });
    expect(LAST_LOGIN_MAX_AGE_SECONDS).toBe(180 * 24 * 60 * 60);
  });

  test("keeps the earlier ways of the same account", async () => {
    jar.get.mockReturnValue({
      value: serializeLastLogin({ loginName: "event74@ya.ru", method: "idp:392465682232508420", others: [] }),
    });

    await rememberLastLogin({ loginName: "event74@ya.ru", method: "password" });

    const written = JSON.parse(jar.set.mock.calls[0][0].value);
    expect(written).toEqual({ v: 1, l: "event74@ya.ru", m: "password", o: ["idp:392465682232508420"] });
  });

  test("does nothing without a login name or with an unexpected method", async () => {
    await rememberLastLogin({ loginName: undefined, method: "password" });
    await rememberLastLogin({ loginName: "a@b.c", method: "idp:not valid" as never });
    expect(jar.set).not.toHaveBeenCalled();
  });

  test("never breaks the sign-in when the cookie can't be written", async () => {
    jar.set.mockImplementationOnce(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    await expect(rememberLastLogin({ loginName: "a@b.c", method: "passkey" })).resolves.toBeUndefined();
  });

  test("reads and clears", async () => {
    jar.get.mockReturnValue({ value: serializeLastLogin({ loginName: "a@b.c", method: "passkey", others: [] }) });
    expect(await readLastLogin()).toEqual({ loginName: "a@b.c", method: "passkey", others: [] });

    jar.get.mockReturnValue({ value: "{broken" });
    expect(await readLastLogin()).toBeNull();

    await clearLastLogin();
    expect(jar.delete).toHaveBeenCalledWith({ name: LAST_LOGIN_COOKIE_NAME, path: "/" });
  });
});
