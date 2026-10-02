"use server";

import { isClassifiedError } from "@/lib/grpc/interceptors/error-classification";
import { createLogger } from "@/lib/logger";
import { create } from "@zitadel/client";
import { RequestChallengesSchema, UserVerificationRequirement } from "@zitadel/proto/zitadel/session/v2/challenge_pb";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { userIdFromHandle } from "../passkey-discover";
import { createSessionAndUpdateCookie } from "./cookie";
import { getPublicHost } from "./host";

const logger = createLogger("passkey-discover");

export type DiscoveredPasskeyResult = { sessionId: string; publicKey: Record<string, unknown> } | { error: string };

/**
 * Second half of the usernameless passkey sign-in (see lib/passkey-discover.ts):
 * the account named by the first assertion's `userHandle` gets a session with a
 * WebAuthn challenge, exactly as if its login name had been typed. Only the
 * session id and the challenge go back — no name or login of the account, so the
 * action cannot be used to look people up by id.
 */
export async function startDiscoveredPasskey(command: {
  userHandle: string;
  requestId?: string;
}): Promise<DiscoveredPasskeyResult> {
  const t = await getTranslations("loginname");
  const userId = userIdFromHandle(command.userHandle);
  if (!userId) {
    return { error: t("discover.notFound") };
  }

  const _headers = await headers();
  const host = getPublicHost(_headers);
  if (!host) {
    return { error: t("errors.internalError") };
  }
  const [hostname] = host.split(":");

  try {
    const result = await createSessionAndUpdateCookie({
      checks: create(ChecksSchema, { user: { search: { case: "userId", value: userId } } }),
      challenges: create(RequestChallengesSchema, {
        webAuthN: { domain: hostname, userVerificationRequirement: UserVerificationRequirement.REQUIRED },
      }),
      requestId: command.requestId,
    });
    const publicKey = result.challenges?.webAuthN?.publicKeyCredentialRequestOptions?.publicKey;
    if (!publicKey) {
      return { error: t("discover.notFound") };
    }
    return {
      sessionId: result.session.id,
      publicKey: publicKey as unknown as Record<string, unknown>,
    };
  } catch (error) {
    if (isClassifiedError(error) && error.isUserError) {
      logger.warn("Discovered passkey: no session for the account", { grpcCode: error.code });
    } else {
      logger.error("Discovered passkey: could not create the session", { error });
    }
    return { error: t("discover.notFound") };
  }
}
