import "server-only";

import {
  isLastLoginMethod,
  LAST_LOGIN_COOKIE_NAME,
  LAST_LOGIN_MAX_AGE_SECONDS,
  LastLogin,
  LastLoginMethod,
  nextLastLogin,
  parseLastLogin,
  serializeLastLogin,
} from "@/lib/last-login";
import { createLogger } from "@/lib/logger";
import { cookies } from "next/headers";

// Deliberately NOT a "use server" module: writing the cookie must only happen
// from our own server code after a verified sign-in, never as a callable action.

const logger = createLogger("last-login");

export async function readLastLogin(): Promise<LastLogin | null> {
  try {
    const jar = await cookies();
    return parseLastLogin(jar.get(LAST_LOGIN_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

/**
 * Remember the account and the way it just signed in. Must be called from a server
 * action (cookies can't be set while rendering). Never fails the sign-in itself.
 */
export async function rememberLastLogin(entry: {
  loginName?: string;
  displayName?: string;
  method: LastLoginMethod;
}): Promise<void> {
  if (!entry.loginName || !isLastLoginMethod(entry.method)) {
    return;
  }
  try {
    const jar = await cookies();
    const previous = parseLastLogin(jar.get(LAST_LOGIN_COOKIE_NAME)?.value);
    const next = nextLastLogin(previous, {
      loginName: entry.loginName,
      displayName: entry.displayName,
      method: entry.method,
    });
    jar.set({
      name: LAST_LOGIN_COOKIE_NAME,
      value: serializeLastLogin(next),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LAST_LOGIN_MAX_AGE_SECONDS,
    });
  } catch (error) {
    logger.warn("Could not remember the last sign-in", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function clearLastLogin(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete({ name: LAST_LOGIN_COOKIE_NAME, path: "/" });
  } catch (error) {
    logger.warn("Could not clear the last sign-in", { error: error instanceof Error ? error.message : String(error) });
  }
}
