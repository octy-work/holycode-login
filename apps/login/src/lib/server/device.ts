"use server";

import { getSessionCookieById } from "@/lib/cookies";
import { isSessionValid } from "@/lib/session";
import { authorizeOrDenyDeviceAuthorization, getSession } from "@/lib/zitadel";
import { headers } from "next/headers";
import { getServiceConfig } from "../service-url";

export async function completeDeviceAuthorization(
  deviceAuthorizationId: string,
  session?: { sessionId: string; sessionToken: string },
) {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  // without the session, device auth request is denied
  return authorizeOrDenyDeviceAuthorization({ serviceConfig, deviceAuthorizationId, session });
}

/**
 * "Allow" on the device screen when the browser is already signed in: approve the
 * request with that session (re-checked here), no second sign-in.
 */
export async function approveDeviceWithSession(
  deviceAuthorizationId: string,
  sessionId: string,
): Promise<{ ok: true } | { error: "session" | "failed" }> {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const cookie = await getSessionCookieById({ sessionId });
  if (!cookie) {
    return { error: "session" };
  }
  const current = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token }).catch(
    () => undefined,
  );
  if (!current?.session || !(await isSessionValid({ serviceConfig, session: current.session }))) {
    return { error: "session" };
  }

  try {
    await authorizeOrDenyDeviceAuthorization({
      serviceConfig,
      deviceAuthorizationId,
      session: { sessionId: cookie.id, sessionToken: cookie.token },
    });
    return { ok: true };
  } catch {
    return { error: "failed" };
  }
}
