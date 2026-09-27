import "server-only";

import { Cookie, getMostRecentSessionCookie } from "@/lib/cookies";
import { createLogger } from "@/lib/logger";
import { isSessionValid } from "@/lib/session";
import { getSession, ServiceConfig } from "@/lib/zitadel";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";

const logger = createLogger("profile-session");

export type ProfileSessionContext = {
  session: Session;
  sessionCookie: Cookie;
  userId: string;
  loginName: string;
  organizationId?: string;
};

/**
 * Who is looking at the profile: the most recent session of this browser (the
 * `sessions` cookie of Login V2, as /accounts reads it), loaded from Zitadel and
 * accepted only when it is fully signed in — primary factor verified, second
 * factor where the account has one, not expired. Anything less → null, and the
 * caller sends the person to the sign-in screen.
 */
export async function loadProfileSession(serviceConfig: ServiceConfig): Promise<ProfileSessionContext | null> {
  const sessionCookie = await getMostRecentSessionCookie();
  if (!sessionCookie?.id || !sessionCookie.token) {
    return null;
  }

  let session: Session | undefined;
  try {
    const response = await getSession({ serviceConfig, sessionId: sessionCookie.id, sessionToken: sessionCookie.token });
    session = response?.session;
  } catch (error) {
    // Gone, terminated, or the cookie token is stale: no session, not an error page.
    logger.warn("Could not load the profile session", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }

  if (!session?.factors?.user?.id || !session.factors.user.loginName) {
    return null;
  }

  const valid = await isSessionValid({ serviceConfig, session });
  if (!valid) {
    return null;
  }

  return {
    session,
    sessionCookie,
    userId: session.factors.user.id,
    loginName: session.factors.user.loginName,
    organizationId: session.factors.user.organizationId || undefined,
  };
}
