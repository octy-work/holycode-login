"use server";

import { create } from "@zitadel/client";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { completeFlowOrGetUrl } from "../client";
import { getServiceConfig } from "../service-url";
import { getLoginSettings } from "../zitadel";
import { updateOrCreateSession } from "./session";

/**
 * HolyCode: sign in with a single-use recovery code instead of the second factor
 * (lost phone, no authenticator). Zitadel v4.19 checks it in the session
 * (`checks.recoveryCode`) and spends it; the codes are issued at the end of the
 * registration and in the profile.
 */
export async function sendRecoveryCode(command: {
  loginName?: string;
  sessionId?: string;
  organization?: string;
  requestId?: string;
  code: string;
}): Promise<{ error: string } | { redirect: string } | { samlData: { url: string; fields: Record<string, string> } }> {
  const t = await getTranslations("recoveryCode");
  const code = (command.code || "").trim();
  if (!code || code.length > 64) {
    return { error: t("errors.invalid") };
  }

  const response = await updateOrCreateSession({
    loginName: command.loginName,
    sessionId: command.sessionId,
    organization: command.organization,
    requestId: command.requestId,
    checks: create(ChecksSchema, { recoveryCode: { code } }),
  }).catch(() => null);

  if (!response || ("error" in response && response.error) || !("sessionId" in response) || !response.factors?.user) {
    return { error: t("errors.invalid") };
  }

  const { serviceConfig } = getServiceConfig(await headers());
  const loginSettings = await getLoginSettings({ serviceConfig, organization: command.organization });
  const user = response.factors.user;
  const result = await completeFlowOrGetUrl(
    command.requestId && response.sessionId
      ? { sessionId: response.sessionId, requestId: command.requestId, organization: user.organizationId }
      : { loginName: user.loginName, organization: user.organizationId },
    loginSettings?.defaultRedirectUri,
  );
  return result && typeof result === "object" ? result : { error: t("errors.invalid") };
}
