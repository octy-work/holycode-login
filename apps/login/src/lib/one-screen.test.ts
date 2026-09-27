import { describe, expect, test } from "vitest";
import { parseLoginStep, passwordStepToSignInScreen } from "./one-screen";

describe("parseLoginStep", () => {
  test("recognises the password and passkey steps", () => {
    expect(parseLoginStep("/password?loginName=a%40b.c")?.path).toBe("/password");
    const passkey = parseLoginStep("/passkey?loginName=a%40b.c&altPassword=true&organization=o1");
    expect(passkey?.path).toBe("/passkey");
    expect(passkey?.params.get("loginName")).toBe("a@b.c");
    expect(passkey?.params.get("altPassword")).toBe("true");
  });

  test("ignores other pages, absolute and protocol-relative URLs", () => {
    expect(parseLoginStep("/password/set?loginName=a")).toBeNull();
    expect(parseLoginStep("/verify?loginName=a")).toBeNull();
    expect(parseLoginStep("https://appleid.apple.com/auth/authorize?x=1")).toBeNull();
    expect(parseLoginStep("//evil.example/password?x=1")).toBeNull();
    expect(parseLoginStep(undefined)).toBeNull();
  });
});

describe("passwordStepToSignInScreen", () => {
  test("moves the password step onto the one screen with the same parameters", () => {
    expect(passwordStepToSignInScreen("/password?loginName=a%40b.c&requestId=oidc_1&organization=o1")).toBe(
      "/loginname?loginName=a%40b.c&requestId=oidc_1&organization=o1",
    );
  });

  test("leaves every other redirect alone", () => {
    expect(passwordStepToSignInScreen("/passkey?loginName=a")).toBe("/passkey?loginName=a");
    expect(passwordStepToSignInScreen("https://idp.example/authorize")).toBe("https://idp.example/authorize");
    expect(passwordStepToSignInScreen("/password/set?code=1")).toBe("/password/set?code=1");
  });
});
