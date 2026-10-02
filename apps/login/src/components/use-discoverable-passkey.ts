"use client";

import { coerceToBase64Url } from "@/helpers/base64";
import { handleServerActionResponse } from "@/lib/client-utils";
import { PasskeyLabelKind, passkeyLabelKind } from "@/lib/passkey-discover";
import { startDiscoveredPasskey } from "@/lib/server/passkey-discover";
import { sendPasskey } from "@/lib/server/passkeys";
import { Checks } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getPasskeyAssertion } from "./use-passkey-sign-in";

type PublicKeyJson = Parameters<typeof getPasskeyAssertion>[0];

/**
 * What the passkey button on this device is called, or null when the browser has no
 * WebAuthn at all (then the button is hidden). Starts from the server's guess by the
 * User-Agent (so the button is in the first paint and nothing jumps), then checks the
 * browser: without a platform authenticator it is just "a passkey".
 */
export function usePasskeyLabelKind(initial: PasskeyLabelKind | null = null): PasskeyLabelKind | null {
  const [kind, setKind] = useState<PasskeyLabelKind | null>(initial);
  useEffect(() => {
    let cancelled = false;
    const credential = typeof window !== "undefined" ? window.PublicKeyCredential : undefined;
    if (!credential || typeof navigator === "undefined" || !navigator.credentials) {
      setKind(null);
      return;
    }
    const decide = (hasPlatformAuthenticator: boolean) => {
      if (!cancelled) {
        setKind(
          passkeyLabelKind({
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            maxTouchPoints: navigator.maxTouchPoints,
            hasPlatformAuthenticator,
          }),
        );
      }
    };
    const check = credential.isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof check === "function") {
      check.call(credential).then(decide, () => decide(false));
    } else {
      decide(false);
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return kind;
}

/**
 * Usernameless passkey sign-in in two touches (see lib/passkey-discover.ts):
 * `discover()` lets the system pick a passkey of this site and finds the account,
 * `confirm()` answers Zitadel's challenge for it. Safari wants a tap for every
 * WebAuthn call, so the second touch has its own button.
 */
export function useDiscoverablePasskey({
  requestId,
  organization,
  onError,
  onSamlData,
}: {
  requestId?: string;
  organization?: string;
  onError: (message: string) => void;
  onSamlData: (data: { url: string; fields: Record<string, string> }) => void;
}) {
  const t = useTranslations("loginname");
  const tPasskey = useTranslations("passkey");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [found, setFound] = useState<{ sessionId: string; publicKey: PublicKeyJson } | null>(null);

  const discover = useCallback(async () => {
    onError("");
    setPending(true);
    try {
      let credential: PublicKeyCredential | null;
      try {
        credential = (await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rpId: window.location.hostname,
            userVerification: "preferred",
            timeout: 120000,
          },
        })) as PublicKeyCredential | null;
      } catch (error) {
        onError((error as { name?: string })?.name === "NotAllowedError" ? t("discover.cancelled") : t("discover.failed"));
        return;
      }
      const userHandle = (credential?.response as AuthenticatorAssertionResponse | undefined)?.userHandle;
      if (!credential || !userHandle || userHandle.byteLength === 0) {
        onError(t("discover.noAccount"));
        return;
      }
      const result = await startDiscoveredPasskey({
        userHandle: coerceToBase64Url(new Uint8Array(userHandle), "userHandle"),
        requestId,
      });
      if (!result || "error" in result) {
        onError((result && "error" in result && result.error) || t("discover.notFound"));
        return;
      }
      setFound({ sessionId: result.sessionId, publicKey: result.publicKey as unknown as PublicKeyJson });
    } catch {
      onError(t("discover.failed"));
    } finally {
      setPending(false);
    }
  }, [onError, requestId, t]);

  const confirm = useCallback(async () => {
    if (!found) {
      return;
    }
    onError("");
    setPending(true);
    try {
      let assertion;
      try {
        assertion = await getPasskeyAssertion(found.publicKey);
      } catch (error) {
        onError(
          (error as { name?: string })?.name === "NotAllowedError"
            ? tPasskey("verify.errors.verificationCancelled")
            : tPasskey("verify.errors.verificationFailed"),
        );
        return;
      }
      if (!assertion) {
        onError(tPasskey("verify.errors.couldNotRetrievePasskey"));
        return;
      }
      const response = await sendPasskey({
        sessionId: found.sessionId,
        organization,
        checks: { webAuthN: { credentialAssertionData: assertion } } as unknown as Checks,
        requestId,
      });
      if (!handleServerActionResponse(response, router, onSamlData, onError)) {
        onError(tPasskey("verify.errors.noRedirectProvided"));
      }
    } catch {
      onError(tPasskey("verify.errors.couldNotVerifyPasskey"));
    } finally {
      setPending(false);
    }
  }, [found, onError, onSamlData, organization, requestId, router, tPasskey]);

  const reset = useCallback(() => {
    setFound(null);
    onError("");
  }, [onError]);

  return { found: !!found, discover, confirm, reset, pending };
}
