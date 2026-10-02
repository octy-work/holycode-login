"use client";

import { coerceToArrayBuffer, coerceToBase64Url } from "@/helpers/base64";
import { handleServerActionResponse } from "@/lib/client-utils";
import { confirmPasskeySetup, confirmTotpSetup, startPasskeySetup, startTotpSetup } from "@/lib/server/signup";
import { DevicePhoneMobileIcon, FingerPrintIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { OptionCardButton } from "./option-card";
import { Spinner } from "./spinner";
import { usePasskeyLabelKind } from "./use-discoverable-passkey";

/**
 * HolyCode registration, step 5 (owner's decision Q7): a mailbox in our domain gets
 * a second factor before Daenerys switches it on — with one stolen password a
 * stranger would own an address in our domain. Touch ID / Face ID (a passkey) or an
 * authenticator app; either one, then the mailbox is activated and step 6 follows.
 */
export function SignupProtect({ address }: { address: string }) {
  const t = useTranslations("signup");
  const router = useRouter();
  const passkeyKind = usePasskeyLabelKind(null);
  const [way, setWay] = useState<"choose" | "totp">("choose");
  const [totp, setTotp] = useState<{ uri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const done = (res: Parameters<typeof handleServerActionResponse>[0]) => {
    if (!handleServerActionResponse(res, router, () => {}, setError)) {
      setError(t("errors.generic"));
    }
  };

  async function withPasskey() {
    setError("");
    setLoading(true);
    try {
      const resp = await startPasskeySetup();
      if (!resp || "error" in resp) {
        setError((resp && "error" in resp && resp.error) || t("errors.passkey"));
        return;
      }
      const options = (resp.publicKeyCredentialCreationOptions ?? {}) as CredentialCreationOptions;
      if (!options.publicKey) {
        setError(t("errors.passkey"));
        return;
      }
      options.publicKey.challenge = coerceToArrayBuffer(options.publicKey.challenge, "challenge");
      options.publicKey.user.id = coerceToArrayBuffer(options.publicKey.user.id, "userid");
      options.publicKey.excludeCredentials = (options.publicKey.excludeCredentials ?? []).map((cred) => ({
        ...cred,
        id: coerceToArrayBuffer(cred.id as unknown as string, "excludeCredentials.id"),
      }));
      // The account inside the passkey, so it signs in without typing the login.
      options.publicKey.authenticatorSelection = {
        ...(options.publicKey.authenticatorSelection ?? {}),
        residentKey: options.publicKey.authenticatorSelection?.residentKey ?? "preferred",
      };
      let credential: PublicKeyCredential | null;
      try {
        credential = (await navigator.credentials.create(options)) as PublicKeyCredential | null;
      } catch {
        setError(t("errors.passkeyCancelled"));
        return;
      }
      const response = credential?.response as AuthenticatorAttestationResponse | undefined;
      if (!credential || !response?.attestationObject || !response?.clientDataJSON) {
        setError(t("errors.passkey"));
        return;
      }
      done(
        await confirmPasskeySetup({
          passkeyId: resp.passkeyId,
          publicKeyCredential: {
            id: credential.id,
            rawId: coerceToBase64Url(credential.rawId, "rawId"),
            type: credential.type,
            response: {
              attestationObject: coerceToBase64Url(response.attestationObject, "attestationObject"),
              clientDataJSON: coerceToBase64Url(response.clientDataJSON, "clientDataJSON"),
            },
          },
        }),
      );
    } catch {
      setError(t("errors.passkey"));
    } finally {
      setLoading(false);
    }
  }

  async function openTotp() {
    setError("");
    setLoading(true);
    try {
      const res = await startTotpSetup();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setTotp(res);
      setWay("totp");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  async function confirmTotp() {
    setError("");
    setLoading(true);
    try {
      done(await confirmTotpSetup(code));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  const errorBlock = error && (
    <div className="mt-3" data-testid="error">
      <Alert>{error}</Alert>
    </div>
  );

  if (way === "totp" && totp) {
    return (
      <>
        <div className="flex w-full flex-col space-y-1 text-left">
          <h1>{t("protect.totpTitle")}</h1>
          <p className="ztdl-p">{t("protect.totpDescription")}</p>
        </div>
        <div className="mt-4 w-full">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-xl bg-white p-2">
              <QRCodeSVG className="h-32 w-32" value={totp.uri} />
            </div>
            <div className="text-hc-text-2 min-w-0 text-[12.5px] leading-snug">
              {t("protect.totpManual")}
              <code
                className="text-hc-text mt-1 block font-mono text-[12px] tracking-wider break-all"
                data-testid="totp-secret"
              >
                {totp.secret}
              </code>
            </div>
          </div>
          <div className="mt-4">
            <TextInput
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              label={t("protect.totpCode")}
              hideErrorLine
              data-testid="totp-code"
            />
          </div>
          {errorBlock}
          <Button
            type="button"
            className="mt-4"
            variant={ButtonVariants.Primary}
            disabled={loading || code.replace(/\D/g, "").length !== 6}
            onClick={confirmTotp}
            data-testid="totp-confirm"
          >
            {loading && <Spinner className="h-5 w-5" />}
            {t("protect.confirm")}
          </Button>
          <Button type="button" className="mt-2" variant={ButtonVariants.Ghost} onClick={() => setWay("choose")}>
            {t("back")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex w-full flex-col space-y-1 text-left">
        <h1>{t("protect.title")}</h1>
        <p className="ztdl-p">{t("protect.description", { address })}</p>
      </div>
      <div className="mt-4 flex w-full flex-col gap-2.5" data-testid="signup-protect">
        {passkeyKind && (
          <OptionCardButton
            icon={<FingerPrintIcon />}
            title={t(`protect.kind.${passkeyKind}`)}
            description={t("protect.passkeyDescription")}
            onClick={withPasskey}
            disabled={loading}
            data-testid="protect-passkey"
          />
        )}
        <OptionCardButton
          icon={<DevicePhoneMobileIcon />}
          title={t("protect.totp")}
          description={t("protect.totpHint")}
          onClick={openTotp}
          disabled={loading}
          data-testid="protect-totp"
        />
        {loading && (
          <div className="flex justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {errorBlock}
      </div>
    </>
  );
}
