import "server-only";

import { completeFlowOrGetUrl } from "@/lib/client";
import { createLogger } from "@/lib/logger";
import { recordAuthFailure, recordAuthSuccess } from "@/lib/metrics";
import { checkEmailVerification, checkMFAFactors, checkPasswordChangeRequired } from "@/lib/verify-helper";
import {
  getLoginSettings,
  getPasswordExpirySettings,
  getUserByID,
  listAuthenticationMethodTypes,
  ServiceConfig,
} from "@/lib/zitadel";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { User, UserState } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { rememberLastLogin } from "./last-login";

// Deliberately NOT a "use server" module: this continues a sign-in whose password
// was already verified, so it must never be reachable as a server action.

const logger = createLogger("password");

export type PasswordLoginResult =
  { error: string } | { redirect: string } | { samlData: { url: string; fields: Record<string, string> } };

/**
 * Everything after the password check succeeded: password change, e-mail
 * verification, second factor, then completing the OIDC/SAML/device request or
 * the default redirect. Shared by the password step (sendPassword) and the
 * one-screen sign-in (signIn); moved out of sendPassword unchanged.
 * On success the account and "password" are remembered for the next visit.
 */
export async function finishPasswordLogin(command: {
  serviceConfig: ServiceConfig;
  t: (key: string, values?: Record<string, string | number>) => string;
  session: Session | undefined;
  sessionCookie: { id: string } | undefined;
  user: User | undefined;
  loginSettingsByContext: LoginSettings | undefined;
  loginSettingsByUser: LoginSettings | undefined;
  passwordChecked: boolean;
  organization?: string;
  defaultOrganization?: string;
  requestId?: string;
}): Promise<PasswordLoginResult> {
  const result = await continueAfterPassword(command);

  if (!("error" in result) && command.session?.factors?.user?.loginName) {
    await rememberLastLogin({
      loginName: command.session.factors.user.loginName,
      displayName: command.session.factors.user.displayName,
      method: "password",
    });
  }

  return result;
}

async function continueAfterPassword({
  serviceConfig,
  t,
  session,
  sessionCookie,
  user,
  loginSettingsByContext,
  loginSettingsByUser,
  passwordChecked,
  organization,
  defaultOrganization,
  requestId,
}: Parameters<typeof finishPasswordLogin>[0]): Promise<PasswordLoginResult> {
  if (!session?.factors?.user?.id) {
    recordAuthFailure("password", "session_invalid", organization);
    if (loginSettingsByContext?.ignoreUnknownUsernames) {
      return { error: t("errors.failedToAuthenticateNoLimit") };
    }
    return { error: t("errors.couldNotCreateSessionForUser") };
  }

  if (!user) {
    const userResponse = await getUserByID({ serviceConfig, userId: session?.factors?.user?.id });
    if (!userResponse.user) {
      recordAuthFailure("password", "user_not_found", organization);
      return { error: t("errors.userNotFound") };
    }
    user = userResponse.user;
  }

  if (!session?.factors?.user?.id || !sessionCookie) {
    recordAuthFailure("password", "session_invalid", organization);
    if (loginSettingsByContext?.ignoreUnknownUsernames) {
      return { error: t("errors.failedToAuthenticateNoLimit") };
    }
    return { error: t("errors.couldNotCreateSessionForUser") };
  }

  if (!loginSettingsByUser) {
    loginSettingsByUser = await getLoginSettings({
      serviceConfig,
      organization: organization ?? session.factors?.user?.organizationId ?? defaultOrganization,
    });
  }

  const humanUser = user.type.case === "human" ? user.type.value : undefined;

  const expirySettings = await getPasswordExpirySettings({
    serviceConfig,
    orgId: organization ?? session.factors?.user?.organizationId,
  });

  // check if the user has to change password first
  const passwordChangedCheck = checkPasswordChangeRequired(expirySettings, session, humanUser, organization, requestId);

  if (passwordChangedCheck?.redirect) {
    return passwordChangedCheck;
  }

  // throw error if user is in initial state here and do not continue
  if (user.state === UserState.INITIAL) {
    recordAuthFailure("password", "user_initial_state", organization);
    return { error: t("errors.initialUserNotSupported") };
  }

  // check to see if user was verified
  const emailVerificationCheck = await checkEmailVerification(session, humanUser, organization, requestId);

  if (emailVerificationCheck?.redirect) {
    return emailVerificationCheck;
  }

  // if password, check if user has MFA methods
  let authMethods;
  if (passwordChecked && session.factors?.user?.id) {
    const response = await listAuthenticationMethodTypes({ serviceConfig, userId: session.factors.user.id });
    if (response.authMethodTypes && response.authMethodTypes.length) {
      authMethods = response.authMethodTypes;
    }
  }

  if (!authMethods) {
    recordAuthFailure("password", "no_auth_methods", organization);
    return { error: t("errors.couldNotVerifyPassword") };
  }

  const mfaFactorCheck = await checkMFAFactors(
    serviceConfig,
    session,
    loginSettingsByUser,
    authMethods,
    organization,
    requestId,
  );

  if (mfaFactorCheck?.redirect) {
    return mfaFactorCheck;
  }

  let result: Awaited<ReturnType<typeof completeFlowOrGetUrl>>;

  if (requestId && session.id) {
    // OIDC/SAML flow
    logger.info("Password auth: OIDC/SAML flow with requestId:", { requestId, sessionId: session.id });
    result = await completeFlowOrGetUrl(
      {
        sessionId: session.id,
        requestId,
        organization: organization ?? session.factors?.user?.organizationId,
      },
      loginSettingsByUser?.defaultRedirectUri,
    );
  } else {
    // Regular flow (no requestId)
    logger.info("Password auth: Regular flow with loginName:", { loginName: session.factors.user.loginName });
    result = await completeFlowOrGetUrl(
      {
        loginName: session.factors.user.loginName,
        organization: session.factors?.user?.organizationId,
      },
      loginSettingsByUser?.defaultRedirectUri,
    );
  }

  if (result && typeof result === "object") {
    if ("redirect" in result) {
      recordAuthSuccess("password", organization);
    } else if ("error" in result) {
      recordAuthFailure("password", "flow_error", organization);
    }
    return result;
  }

  recordAuthFailure("password", "navigation_failed", organization);
  return { error: "Authentication completed but navigation failed" };
}
