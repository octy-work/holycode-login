/**
 * HolyCode: passkey sign-in without typing the login (02.10.2026).
 *
 * Zitadel v4.19 builds a WebAuthn challenge only for a session that already knows
 * the user (internal/command/session_webauhtn.go), so a usernameless sign-in takes
 * two touches: the first `navigator.credentials.get` runs with an empty
 * `allowCredentials` — the system lists the passkeys of id.holycode.org — and its
 * `userHandle` names the account (Zitadel sets WebAuthnID to the user id); the
 * second answers Zitadel's challenge for that account. The first assertion is
 * never verified and is used only like a typed login name.
 *
 * Pure helpers only — safe for client, server and tests.
 */

export type PasskeyLabelKind = "touchId" | "faceId" | "windowsHello" | "fingerprint" | "passkey";

/**
 * What the passkey button is called on this device. Without a platform
 * authenticator (no Touch ID, no Windows Hello) a passkey can still come from a
 * phone or a security key — then it is just "a passkey".
 */
export function passkeyLabelKind(info: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  hasPlatformAuthenticator: boolean;
}): PasskeyLabelKind {
  if (!info.hasPlatformAuthenticator) {
    return "passkey";
  }
  const ua = info.userAgent || "";
  const platform = (info.platform || "").toLowerCase();
  if (/iphone|ipad|ipod/i.test(ua)) {
    return "faceId";
  }
  if (/android/i.test(ua)) {
    return "fingerprint";
  }
  // iPadOS reports itself as a Mac; touch points give it away.
  if (platform === "macintel" && (info.maxTouchPoints ?? 0) > 1) {
    return "faceId";
  }
  if (platform.startsWith("mac") || /macintosh/i.test(ua)) {
    return "touchId";
  }
  if (platform.startsWith("win") || /windows/i.test(ua)) {
    return "windowsHello";
  }
  return "passkey";
}

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** base64url `userHandle` of the first assertion → Zitadel user id, or null for anything else. */
export function userIdFromHandle(userHandle: string | undefined | null): string | null {
  if (!userHandle || userHandle.length > 128 || !/^[A-Za-z0-9_-]+={0,2}$/.test(userHandle)) {
    return null;
  }
  let decoded: string;
  try {
    const base64 = userHandle.replace(/-/g, "+").replace(/_/g, "/");
    decoded = Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return null;
  }
  return USER_ID_RE.test(decoded) ? decoded : null;
}
