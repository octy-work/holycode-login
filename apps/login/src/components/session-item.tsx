"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { passwordStepToSignInScreen } from "@/lib/one-screen";
import { sendLoginname } from "@/lib/server/loginname";
import { clearSession, continueWithSession, ContinueWithSessionCommand } from "@/lib/server/session";
import { XCircleIcon } from "@heroicons/react/24/solid";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Timestamp, timestampDate } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import moment from "moment";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Avatar } from "./avatar";
import { Translated } from "./translated";

export function isSessionPrimaryFactorAndLifetimeValid(session: Partial<Session>): {
  valid: boolean;
  verifiedAt?: Timestamp;
} {
  const validPassword = session?.factors?.password?.verifiedAt;
  const validPasskey = session?.factors?.webAuthN?.verifiedAt;
  const validIDP = session?.factors?.intent?.verifiedAt;

  const stillValid = session.expirationDate ? timestampDate(session.expirationDate) > new Date() : true;

  const verifiedAt = validPassword || validPasskey || validIDP;
  const valid = !!((validPassword || validPasskey || validIDP) && stillValid);

  return { valid, verifiedAt };
}

export function SessionItem({ session, reload, requestId }: { session: Session; reload: () => void; requestId?: string }) {
  const currentLocale = useLocale();
  moment.locale(currentLocale === "zh" ? "zh-cn" : currentLocale);
  const t = useTranslations("error");

  const [_loading, setLoading] = useState<boolean>(false);

  /**
   * Returns true when the session was removed (server-side and from the cookie).
   * On failure the error is shown and the card must stay in the list.
   */
  async function clearSessionId(id: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const response = await clearSession({ sessionId: id });
      if (response && "error" in response && response.error) {
        setError(response.error);
        return false;
      }
      return true;
    } catch {
      setError(t("couldNotClearSession"));
      return false;
    } finally {
      setLoading(false);
    }
  }

  const { valid, verifiedAt } = isSessionPrimaryFactorAndLifetimeValid(session);
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  return (
    <>
      <Tooltip.Root delayDuration={300}>
        {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
        <Tooltip.Trigger asChild>
          <button
            onClick={async () => {
              if (valid && session?.factors?.user) {
                const sessionPayload: ContinueWithSessionCommand = session;
                if (requestId) {
                  sessionPayload.requestId = requestId;
                }

                const callbackResponse = await continueWithSession(sessionPayload);

                handleServerActionResponse(callbackResponse, router, setSamlData, (e) => setError(e));
              } else if (session.factors?.user) {
                setLoading(true);
                try {
                  const res = await sendLoginname({
                    loginName: session.factors?.user?.loginName,
                    organization: session.factors.user.organizationId,
                    requestId: requestId,
                    preferPassword: true,
                  });

                  // HolyCode: a password is entered on the one sign-in screen.
                  if (res && "redirect" in res && res.redirect) {
                    res.redirect = passwordStepToSignInScreen(res.redirect);
                  }
                  handleServerActionResponse(res, router, setSamlData, (e) => setError(e));
                } catch {
                  setError("An internal error occurred");
                } finally {
                  setLoading(false);
                }
              }
            }}
            className="group bg-hc-input border-hc-input-border hover:border-hc-p500 focus-visible:ring-hc-ring flex w-full flex-row items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-all focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <div>
              <Avatar
                size="base"
                loginName={session.factors?.user?.loginName as string}
                name={session.factors?.user?.displayName ?? ""}
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-start overflow-hidden">
              <span className="text-hc-text w-full truncate text-[15px] leading-tight font-semibold">
                {session.factors?.user?.displayName || session.factors?.user?.loginName}
              </span>
              {session.factors?.user?.displayName && (
                <span className="text-hc-muted w-full truncate text-[12.5px]">{session.factors?.user?.loginName}</span>
              )}
              {valid ? (
                <span className="text-hc-muted text-[12px]">
                  <Translated i18nKey="verified" namespace="accounts" />{" "}
                  {verifiedAt && moment(timestampDate(verifiedAt)).fromNow()}
                </span>
              ) : (
                verifiedAt && (
                  <span className="text-hc-muted text-[12px]">
                    <Translated i18nKey="expired" namespace="accounts" />{" "}
                    {session.expirationDate && moment(timestampDate(session.expirationDate)).fromNow()}
                  </span>
                )
              )}
            </div>

            <div className="flex shrink-0 flex-row items-center gap-2">
              {valid ? (
                <div className="bg-hc-ok h-2 w-2 rounded-full"></div>
              ) : (
                <div className="bg-hc-err h-2 w-2 rounded-full"></div>
              )}

              <XCircleIcon
                className="text-hc-muted hover:text-hc-err h-5 w-5 transition-colors"
                onClick={async (event: React.MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (await clearSessionId(session.id)) {
                    reload();
                  }
                }}
              />
            </div>
          </button>
        </Tooltip.Trigger>
        {valid && session.expirationDate && (
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-hc-card border-hc-border text-hc-text z-50 rounded-lg border px-3 py-2 text-xs shadow-xl select-none"
              sideOffset={5}
            >
              Expires {moment(timestampDate(session.expirationDate)).fromNow()}
              <Tooltip.Arrow className="fill-hc-border" />
            </Tooltip.Content>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
      {error && <Alert>{error}</Alert>}
    </>
  );
}
