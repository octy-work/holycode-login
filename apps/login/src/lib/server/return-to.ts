import "server-only";

import { createLogger } from "@/lib/logger";
import { isProfileReturnTarget } from "@/lib/profile";
import { cookies } from "next/headers";

// Deliberately NOT a "use server" module: only our own server code decides where
// a flow returns to; this must never be a callable action.

const logger = createLogger("return-to");

/**
 * HolyCode profile: "come back to /me when the flow is done".
 *
 * The profile starts the existing sign-in, passkey, second-factor, password and
 * provider flows of the login app; all of them end in `resolveRedirectUri`
 * (lib/client.ts). This cookie tells that step to go back to the profile
 * instead of the default page. Short-lived, HttpOnly, and its value is checked
 * on both sides against `isProfileReturnTarget` — only the profile itself.
 */
export const RETURN_TO_COOKIE = "hc_return_to";

/** 15 minutes: long enough for a passkey prompt or a second-factor setup, no longer. */
export const RETURN_TO_MAX_AGE_SECONDS = 15 * 60;

export async function rememberReturnTo(target: string, publicHost?: string): Promise<boolean> {
  if (!isProfileReturnTarget(target, publicHost)) {
    logger.warn("Refusing a return target outside the profile", { target });
    return false;
  }
  try {
    const jar = await cookies();
    jar.set({
      name: RETURN_TO_COOKIE,
      value: target,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RETURN_TO_MAX_AGE_SECONDS,
    });
    return true;
  } catch (error) {
    logger.warn("Could not remember the return target", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/** The stored target (still validated), without touching the cookie. */
export async function peekReturnTo(publicHost?: string): Promise<string | null> {
  try {
    const jar = await cookies();
    const value = jar.get(RETURN_TO_COOKIE)?.value;
    return value && isProfileReturnTarget(value, publicHost) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The stored target, consumed. Deleting the cookie is only possible from a
 * server action or route handler; while rendering (the signed-in page) the
 * delete fails quietly and the cookie simply expires.
 */
export async function takeReturnTo(publicHost?: string): Promise<string | null> {
  const target = await peekReturnTo(publicHost);
  if (!target) {
    return null;
  }
  try {
    const jar = await cookies();
    jar.delete({ name: RETURN_TO_COOKIE, path: "/" });
  } catch {
    // rendering context: cannot write cookies, the value still counts
  }
  return target;
}

export async function clearReturnTo(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete({ name: RETURN_TO_COOKIE, path: "/" });
  } catch {
    // ignore
  }
}
