"use client";

import { coerceToArrayBuffer, coerceToBase64Url } from "@/helpers/base64";
import { handleServerActionResponse } from "@/lib/client-utils";
import { sendPasskey } from "@/lib/server/passkeys";
import { updateOrCreateSession } from "@/lib/server/session";
import { create, JsonObject } from "@zitadel/client";
import { RequestChallengesSchema, UserVerificationRequirement } from "@zitadel/proto/zitadel/session/v2/challenge_pb";
import { Checks } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Passkey sign-in from the one screen, without leaving it: request a WebAuthn
 * challenge for the account, let the browser ask for Touch ID / the security
 * key, then verify it (same server actions as the /passkey page).
 *
 * Zitadel (v4.19) creates the challenge only for a known user — the session
 * needs the user check first — so there is no usernameless / conditional-UI
 * passkey sign-in; the button appears once the account is known.
 */
export function usePasskeySignIn({
  requestId,
  onError,
  onSamlData,
}: {
  requestId?: string;
  onError: (message: string) => void;
  onSamlData: (data: { url: string; fields: Record<string, string> }) => void;
}) {
  const t = useTranslations("passkey");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const start = useCallback(
    async ({ loginName, organization }: { loginName: string; organization?: string }) => {
      onError("");
      setPending(true);
      try {
        const challenge = await updateOrCreateSession({
          loginName,
          organization,
          requestId,
          challenges: create(RequestChallengesSchema, {
            webAuthN: { domain: "", userVerificationRequirement: UserVerificationRequirement.REQUIRED },
          }),
        });

        if (!challenge || ("error" in challenge && challenge.error)) {
          onError((challenge && "error" in challenge && challenge.error) || t("verify.errors.couldNotRequestChallenge"));
          return;
        }

        const publicKey =
          "challenges" in challenge
            ? challenge.challenges?.webAuthN?.publicKeyCredentialRequestOptions?.publicKey
            : undefined;
        if (!publicKey) {
          onError(t("verify.errors.couldNotRequestChallenge"));
          return;
        }

        let assertion: JsonObject | null;
        try {
          assertion = await getPasskeyAssertion(publicKey as unknown as PublicKeyJson);
        } catch (error) {
          onError(
            (error as { name?: string })?.name === "NotAllowedError"
              ? t("verify.errors.verificationCancelled")
              : t("verify.errors.verificationFailed"),
          );
          return;
        }
        if (!assertion) {
          onError(t("verify.errors.couldNotRetrievePasskey"));
          return;
        }

        const response = await sendPasskey({
          loginName,
          sessionId: "sessionId" in challenge ? challenge.sessionId : undefined,
          organization,
          checks: { webAuthN: { credentialAssertionData: assertion } } as unknown as Checks,
          requestId,
        });

        if (!handleServerActionResponse(response, router, onSamlData, onError)) {
          onError(t("verify.errors.noRedirectProvided"));
        }
      } catch {
        onError(t("verify.errors.couldNotVerifyPasskey"));
      } finally {
        setPending(false);
      }
    },
    [requestId, onError, onSamlData, router, t],
  );

  return { start, pending };
}

type PublicKeyJson = {
  challenge: string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  [key: string]: unknown;
};

/** navigator.credentials.get for Zitadel's options (base64url fields) → assertion JSON for the session check. */
export async function getPasskeyAssertion(publicKeyJson: PublicKeyJson): Promise<JsonObject | null> {
  const publicKey = {
    ...publicKeyJson,
    challenge: coerceToArrayBuffer(publicKeyJson.challenge, "publicKey.challenge"),
    allowCredentials: (publicKeyJson.allowCredentials ?? []).map((item) => ({
      ...item,
      id: coerceToArrayBuffer(item.id, "publicKey.allowCredentials.id"),
    })),
  } as unknown as PublicKeyCredentialRequestOptions;

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) {
    return null;
  }
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: coerceToBase64Url(new Uint8Array(credential.rawId), "rawId"),
    type: credential.type,
    response: {
      authenticatorData: coerceToBase64Url(new Uint8Array(response.authenticatorData), "authData"),
      clientDataJSON: coerceToBase64Url(new Uint8Array(response.clientDataJSON), "clientDataJSON"),
      signature: coerceToBase64Url(new Uint8Array(response.signature), "sig"),
      userHandle: coerceToBase64Url(new Uint8Array(response.userHandle ?? new ArrayBuffer(0)), "userHandle"),
    },
  };
}
