"use client";

import { approveDeviceWithSession, completeDeviceAuthorization } from "@/lib/server/device";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { FormActions } from "./form-actions";
import { Spinner } from "./spinner";

type State = "idle" | "approving" | "done" | "denied";

/**
 * Device sign-in (HolyAgent, CLI): one screen. The code is shown to compare with the
 * app (a link with someone else's code must not sign their device in); signed in
 * already → "Allow" approves with that session, otherwise sign in and /signedin
 * finishes the request.
 */
export function ConsentScreen({
  deviceAuthorizationRequestId,
  appName,
  userCode,
  session,
  loginUrl,
}: {
  deviceAuthorizationRequestId: string;
  appName?: string;
  userCode: string;
  session?: { id: string; displayName: string; loginName: string };
  loginUrl: string;
}) {
  const t = useTranslations("device");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string>("");

  async function allow() {
    if (!session) return;
    setError("");
    setState("approving");
    const result = await approveDeviceWithSession(deviceAuthorizationRequestId, session.id).catch(() => ({
      error: "failed" as const,
    }));
    if ("ok" in result) {
      setState("done");
      return;
    }
    setState("idle");
    setError(result.error === "session" ? t("confirm.sessionGone") : t("confirm.failed"));
  }

  async function deny() {
    setError("");
    setState("approving");
    const ok = await completeDeviceAuthorization(deviceAuthorizationRequestId)
      .then(() => true)
      .catch(() => false);
    setState(ok ? "denied" : "idle");
    if (!ok) setError(t("confirm.failed"));
  }

  if (state === "done" || state === "denied") {
    return (
      <div className="flex w-full flex-col items-center gap-3 py-2 text-center" data-testid={`device-${state}`}>
        {state === "done" && <CheckCircleIcon className="text-hc-ok h-12 w-12" aria-hidden="true" />}
        <p className="text-hc-text text-[15px] font-semibold">
          {state === "done" ? t("confirm.doneTitle") : t("confirm.deniedTitle")}
        </p>
        <p className="ztdl-p">{state === "done" ? t("confirm.done", { appName: appName ?? "" }) : t("confirm.denied")}</p>
      </div>
    );
  }

  const busy = state === "approving";

  return (
    <div className="flex w-full flex-col space-y-4">
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-hc-muted text-[12.5px]">{t("confirm.code")}</span>
        <div
          className="bg-hc-input border-hc-input-border text-hc-text w-full rounded-[14px] border py-3 text-center font-mono text-[28px] font-extrabold tracking-[0.2em]"
          data-testid="device-user-code"
        >
          {userCode}
        </div>
        <span className="text-hc-muted text-center text-[12.5px]">{t("confirm.match", { appName: appName ?? "" })}</span>
      </div>

      {session && (
        <p className="ztdl-p text-center" data-testid="device-account">
          {t("confirm.as")} <span className="text-hc-text font-semibold">{session.displayName}</span>
          {session.loginName && session.loginName !== session.displayName && (
            <span className="text-hc-muted"> · {session.loginName}</span>
          )}
        </p>
      )}

      {error && (
        <div data-testid="error">
          <Alert>{error}</Alert>
        </div>
      )}

      <FormActions
        className="mt-1"
        primary={
          session ? (
            <Button
              type="button"
              variant={ButtonVariants.Primary}
              disabled={busy}
              onClick={allow}
              data-testid="submit-button"
            >
              {busy && <Spinner className="h-5 w-5" />}
              {t("confirm.allow")}
            </Button>
          ) : (
            <Link href={loginUrl} className="block w-full">
              <Button type="button" variant={ButtonVariants.Primary} data-testid="submit-button">
                {t("confirm.signIn")}
              </Button>
            </Link>
          )
        }
        secondary={
          <span className="flex flex-wrap items-center justify-center gap-x-3">
            {session && (
              <Link
                href={loginUrl}
                className="text-hc-link hover:text-hc-p500 text-sm font-medium"
                data-testid="other-account"
              >
                {t("confirm.otherAccount")}
              </Link>
            )}
            <Button onClick={deny} disabled={busy} variant={ButtonVariants.Ghost} data-testid="deny-button">
              {t("confirm.deny")}
            </Button>
          </span>
        }
      />
    </div>
  );
}
