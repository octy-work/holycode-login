"use server";

import { isClassifiedError } from "@/lib/grpc/interceptors/error-classification";
import { createLogger } from "@/lib/logger";
import { recordAuthAttempt, recordAuthFailure } from "@/lib/metrics";
import { create } from "@zitadel/client";
import { CredentialsCheckErrorSchema } from "@zitadel/proto/zitadel/message_pb";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { LoginSettings } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { User, UserState } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { parseLoginStep } from "../one-screen";
import { getServiceConfig } from "../service-url";
import { getLockoutSettings, getLoginSettings, listAuthenticationMethodTypes, searchUsers } from "../zitadel";
import { createSessionAndUpdateCookie } from "./cookie";
import { clearLastLogin } from "./last-login";
import { sendLoginname } from "./loginname";
import { finishPasswordLogin } from "./password-continue";

const logger = createLogger("sign-in");

export type SignInCommand = {
  loginName: string;
  /** Empty or missing: find the account's way in (the login-name step of upstream). */
  password?: string;
  requestId?: string;
  organization?: string;
  defaultOrganization?: string;
  suffix?: string;
};

export type PasskeyOffer = { loginName: string; organization?: string; altPassword: boolean };

export type SignInResult =
  | { redirect: string }
  | { error: string }
  | { samlData: { url: string; fields: Record<string, string> } }
  /** Stay on the screen and ask for the password (the field gets the focus). */
  | { passwordRequired: true }
  /** The account signs in with a passkey: show the passkey button (and the password, if it has one). */
  | { passkey: PasskeyOffer };

/**
 * HolyCode one-screen sign-in (e-mail and password together, /loginname).
 *
 * With a password: one Session API call with the user and password checks, then the
 * same continuation as the password step (password change, e-mail verification,
 * second factor, completing the request). A wrong password and an unknown account
 * answer the same while enumeration protection (ignoreUnknownUsernames) is on.
 *
 * Without a password, or for an account that has none: the login-name step decides
 * the way in as before — a provider-only account goes straight to its provider, a
 * passkey account gets the passkey button, and an account with a password (or an
 * unknown one, under enumeration protection) is asked for it on the same screen.
 */
export async function signIn(command: SignInCommand): Promise<SignInResult> {
  const password = command.password ?? "";
  if (!password) {
    return findWayIn(command, false);
  }
  return signInWithPassword(command, password);
}

/** "Not me": forget the remembered account on this browser. */
export async function forgetLastLogin(): Promise<void> {
  await clearLastLogin();
}

async function findWayIn(command: SignInCommand, passwordGiven: boolean): Promise<SignInResult> {
  const t = await getTranslations("loginname");

  const res = await sendLoginname({
    loginName: command.loginName,
    requestId: command.requestId,
    organization: command.organization,
    defaultOrganization: command.defaultOrganization,
    suffix: command.suffix,
    preferPassword: true,
  });

  if (!res) {
    return { error: t("errors.internalError") };
  }

  if ("redirect" in res && res.redirect) {
    const step = parseLoginStep(res.redirect);
    if (step?.path === "/password") {
      // Known password account, or the decoy for an unknown one: both look the same.
      return passwordGiven ? { error: t("signIn.errors.invalidCredentials") } : { passwordRequired: true };
    }
    if (step?.path === "/passkey") {
      const loginName = step.params.get("loginName") || command.loginName;
      const organization = step.params.get("organization") || undefined;
      return {
        passkey: {
          loginName,
          ...(organization ? { organization } : {}),
          altPassword: step.params.get("altPassword") === "true",
        },
      };
    }
    return { redirect: res.redirect };
  }

  if ("samlData" in res && res.samlData) {
    return { samlData: res.samlData };
  }

  if ("error" in res && res.error) {
    return { error: res.error };
  }

  return { error: t("errors.internalError") };
}

function loginNameMismatch(
  user: User,
  settings: LoginSettings | undefined,
  loginName: string,
  concatLoginname: string,
): boolean {
  const humanUser = user.type.case === "human" ? user.type.value : undefined;
  if (settings?.disableLoginWithEmail && settings?.disableLoginWithPhone) {
    return user.preferredLoginName !== concatLoginname;
  }
  if (settings?.disableLoginWithEmail) {
    return user.preferredLoginName !== concatLoginname && humanUser?.phone?.phone !== loginName;
  }
  if (settings?.disableLoginWithPhone) {
    return user.preferredLoginName !== concatLoginname && humanUser?.email?.email !== loginName;
  }
  return false;
}

/** Failed password attempts Zitadel reports with a wrong password (CredentialsCheckError detail). */
function failedPasswordAttempts(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  if ("failedAttempts" in error && typeof (error as { failedAttempts: unknown }).failedAttempts === "number") {
    return (error as { failedAttempts: number }).failedAttempts;
  }
  const findDetails = (error as { findDetails?: unknown }).findDetails;
  if (typeof findDetails === "function") {
    try {
      const details = findDetails.call(error, CredentialsCheckErrorSchema) as { failedAttempts?: number }[];
      if (details?.[0] && typeof details[0].failedAttempts === "number") {
        return details[0].failedAttempts;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function signInWithPassword(command: SignInCommand, password: string): Promise<SignInResult> {
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const t = await getTranslations("loginname");
  const tPassword = await getTranslations("password");

  // Same context as the login-name step, so enumeration protection is decided alike.
  const loginSettingsByContext = await getLoginSettings({ serviceConfig, organization: command.organization });
  if (!loginSettingsByContext) {
    return { error: t("errors.couldNotGetLoginSettings") };
  }

  if (!loginSettingsByContext.allowLocalAuthentication) {
    // No local sign-in here at all: whatever the login-name step offers (a provider).
    return findWayIn(command, true);
  }

  const ignoreUnknownUsernames = !!loginSettingsByContext.ignoreUnknownUsernames;
  const invalidCredentials = { error: t("signIn.errors.invalidCredentials") };
  const concatLoginname = command.suffix ? `${command.loginName}@${command.suffix}` : command.loginName;

  recordAuthAttempt("password", command.organization);

  const searchResult = await searchUsers({
    serviceConfig,
    searchValue: command.loginName,
    organizationId: command.organization,
    loginSettings: loginSettingsByContext,
    suffix: command.suffix,
  });

  const user =
    searchResult && "result" in searchResult && searchResult.result?.length === 1 && searchResult.result[0].userId
      ? searchResult.result[0]
      : undefined;

  // Unknown, ambiguous, not a password account, or anything unusual: the login-name
  // step answers exactly as it does without a password (a decoy "ask for the
  // password" turns into the same error a wrong password gets).
  if (!user) {
    return findWayIn(command, true);
  }

  const userLoginSettings = await getLoginSettings({ serviceConfig, organization: user.details?.resourceOwner });

  if (
    loginNameMismatch(user, userLoginSettings, command.loginName, concatLoginname) ||
    user.state === UserState.INITIAL ||
    !userLoginSettings?.allowLocalAuthentication
  ) {
    return findWayIn(command, true);
  }

  const methods = await listAuthenticationMethodTypes({ serviceConfig, userId: user.userId });
  if (!methods.authMethodTypes?.includes(AuthenticationMethodType.PASSWORD)) {
    // No password on this account: lead to its way in (provider, passkey, invite).
    return findWayIn(command, true);
  }

  let created;
  try {
    created = await createSessionAndUpdateCookie({
      checks: create(ChecksSchema, {
        user: { search: { case: "userId", value: user.userId } },
        password: { password },
      }),
      requestId: command.requestId,
      lifetime: userLoginSettings?.passwordCheckLifetime ?? loginSettingsByContext.passwordCheckLifetime,
    });
  } catch (error) {
    const failedAttempts = failedPasswordAttempts(error);
    recordAuthFailure(
      "password",
      failedAttempts !== undefined ? "invalid_password" : "session_creation_failed",
      command.organization,
    );

    if (ignoreUnknownUsernames) {
      return invalidCredentials;
    }

    if (isClassifiedError(error) && error.message?.includes("Errors.User.NotActive")) {
      return { error: t("errors.userNotActive") };
    }

    if (isClassifiedError(error) && error.message?.includes("Errors.User.Locked")) {
      return { error: tPassword("errors.accountLockedContactAdmin").trim() };
    }

    if (failedAttempts !== undefined) {
      const lockoutSettings = await getLockoutSettings({ serviceConfig, orgId: user.details?.resourceOwner });
      const maxAttempts = lockoutSettings?.maxPasswordAttempts;
      const hasLimit = maxAttempts !== undefined && maxAttempts > BigInt(0);
      const locked = hasLimit && BigInt(failedAttempts) >= maxAttempts;

      return {
        error: tPassword(hasLimit ? "errors.failedToAuthenticate" : "errors.failedToAuthenticateNoLimit", {
          failedAttempts,
          maxPasswordAttempts: hasLimit ? String(maxAttempts) : "?",
          lockoutMessage: locked ? tPassword("errors.accountLockedContactAdmin") : "",
        }),
      };
    }

    logger.warn("Could not create a session with the password check", {
      error: error instanceof Error ? error.message : String(error),
    });
    return invalidCredentials;
  }

  return finishPasswordLogin({
    serviceConfig,
    t: tPassword,
    session: created.session,
    sessionCookie: created.sessionCookie,
    user,
    loginSettingsByContext,
    loginSettingsByUser: userLoginSettings,
    passwordChecked: true,
    organization: command.organization,
    defaultOrganization: command.defaultOrganization,
    requestId: command.requestId,
  });
}
