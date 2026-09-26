"use client";

import { clearSession } from "@/lib/server/session";
import { timestampDate } from "@zitadel/client";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import moment from "moment";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { Avatar } from "./avatar";
import { isSessionPrimaryFactorAndLifetimeValid } from "./session-item";
import { Translated } from "./translated";

export function SessionClearItem({ session, reload }: { session: Session; reload: () => void }) {
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

  const [error, setError] = useState<string | null>(null);

  // TODO: To we have to call this?
  useRouter();

  return (
    <>
      <button
        onClick={async () => {
          if (await clearSessionId(session.id)) {
            reload();
          }
        }}
        className="group bg-hc-input border-hc-input-border hover:border-hc-err focus-visible:ring-hc-ring flex w-full flex-row items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-all focus-visible:ring-[3px] focus-visible:outline-none"
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
              {verifiedAt && (
                <Translated
                  i18nKey="verifiedAt"
                  namespace="logout"
                  data={{ time: moment(timestampDate(verifiedAt)).fromNow() }}
                />
              )}
            </span>
          ) : (
            verifiedAt && (
              <span className="text-hc-muted text-[12px]">
                expired {session.expirationDate && moment(timestampDate(session.expirationDate)).fromNow()}
              </span>
            )
          )}
        </div>

        <div className="flex shrink-0 flex-row items-center gap-2">
          <div className="text-hc-err bg-hc-err-bg hidden items-center justify-center rounded-full px-2 py-[2px] text-xs transition-all group-hover:flex">
            <Translated i18nKey="clear" namespace="logout" />
          </div>

          {valid ? (
            <div className="bg-hc-ok h-2 w-2 rounded-full"></div>
          ) : (
            <div className="bg-hc-err h-2 w-2 rounded-full"></div>
          )}
        </div>
      </button>
      {error && <Alert>{error}</Alert>}
    </>
  );
}
