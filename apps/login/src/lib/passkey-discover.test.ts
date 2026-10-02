import { describe, expect, test } from "vitest";
import { passkeyLabelKind, userIdFromHandle } from "./passkey-discover";

const mac =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const windows =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const android =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

describe("passkeyLabelKind", () => {
  test("names the button after the device's own biometrics", () => {
    expect(
      passkeyLabelKind({ userAgent: mac, platform: "MacIntel", maxTouchPoints: 0, hasPlatformAuthenticator: true }),
    ).toBe("touchId");
    expect(passkeyLabelKind({ userAgent: iphone, platform: "iPhone", hasPlatformAuthenticator: true })).toBe("faceId");
    expect(passkeyLabelKind({ userAgent: windows, platform: "Win32", hasPlatformAuthenticator: true })).toBe("windowsHello");
    expect(passkeyLabelKind({ userAgent: android, platform: "Linux armv8l", hasPlatformAuthenticator: true })).toBe(
      "fingerprint",
    );
  });

  test("the User-Agent wins over a misleading platform (emulators, Android on desktop)", () => {
    expect(
      passkeyLabelKind({ userAgent: android, platform: "MacIntel", maxTouchPoints: 5, hasPlatformAuthenticator: true }),
    ).toBe("fingerprint");
    expect(passkeyLabelKind({ userAgent: mac, hasPlatformAuthenticator: true })).toBe("touchId");
  });

  test("an iPad says it is a Mac, touch points give it away", () => {
    expect(
      passkeyLabelKind({ userAgent: mac, platform: "MacIntel", maxTouchPoints: 5, hasPlatformAuthenticator: true }),
    ).toBe("faceId");
  });

  test("without Touch ID or Windows Hello it is just a passkey (phone or security key)", () => {
    expect(passkeyLabelKind({ userAgent: mac, platform: "MacIntel", hasPlatformAuthenticator: false })).toBe("passkey");
    expect(
      passkeyLabelKind({
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        platform: "Linux x86_64",
        hasPlatformAuthenticator: true,
      }),
    ).toBe("passkey");
  });
});

describe("userIdFromHandle", () => {
  const b64url = (s: string) =>
    Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  test("decodes the Zitadel user id from the userHandle", () => {
    expect(userIdFromHandle(b64url("392454771388186628"))).toBe("392454771388186628");
  });

  test("refuses anything that is not a plain id", () => {
    expect(userIdFromHandle("")).toBeNull();
    expect(userIdFromHandle(undefined)).toBeNull();
    expect(userIdFromHandle(b64url("a b"))).toBeNull();
    expect(userIdFromHandle(b64url("x".repeat(65)))).toBeNull();
    expect(userIdFromHandle("not base64!")).toBeNull();
  });
});
