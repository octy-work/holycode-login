import { getAllSessions } from "@/lib/cookies";
import { findValidSession } from "@/lib/session";
import { listSessions, ServiceConfig } from "@/lib/zitadel";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";

/**
 * The browser's current signed-in session, if any: a device sign-in (HolyAgent, CLI)
 * is then approved with it on one screen instead of asking for the password again.
 */
export async function findDeviceSession(serviceConfig: ServiceConfig): Promise<Session | undefined> {
  const cookies = await getAllSessions(true);
  const ids = cookies.map((c) => c.id).filter(Boolean);
  if (!ids.length) {
    return undefined;
  }
  try {
    const response = await listSessions({ serviceConfig, ids });
    return await findValidSession({ serviceConfig, sessions: response?.sessions ?? [] });
  } catch {
    // stale ids in the cookie or an API hiccup: behave as "not signed in"
    return undefined;
  }
}
