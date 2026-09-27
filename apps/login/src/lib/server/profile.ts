"use server";

import { getAllSessions, removeSessionFromCookie, setLanguageCookie } from "@/lib/cookies";
import { LANGS } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import {
  canRemoveSignInMethod,
  isPlausibleEmail,
  parseThemePreference,
  PROFILE_SHORT_PREFIX,
  profilePath,
  ProfileSection,
  resolveProfilePrefix,
  summarizeAuthMethods,
  THEME_METADATA_KEY,
  validateNameForm,
} from "@/lib/profile";
import { getServiceConfig } from "@/lib/service-url";
import {
  deleteSession,
  getSecuritySettings,
  getUserByID,
  listAuthenticationMethodTypes,
  listIDPLinks,
  listPasskeys,
  passwordReset,
  removeIDPLink,
  removePasskey,
  removeTOTP,
  ServiceConfig,
  setHumanEmail,
  setUserMetadata,
  updateHumanProfile,
} from "@/lib/zitadel";
import { AuthFactorState, HumanUser } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { getPublicHost, getPublicHostWithProtocol } from "./host";
import { redirectToIdp, RedirectToIdpState } from "./idp";
import { loadProfileSession, ProfileSessionContext } from "./profile-session";
import { rememberReturnTo } from "./return-to";
import { resendVerification } from "./verify";

const logger = createLogger("profile");

export type ActionResult = { ok: true } | { error: string };
export type FlowResult = { redirect: string } | { error: string };

type Ctx = ProfileSessionContext & { serviceConfig: ServiceConfig; t: Awaited<ReturnType<typeof getTranslations>> };

/** Every profile action: the signed-in person of this browser, or a translated refusal. */
async function requireProfile(): Promise<Ctx | { error: string }> {
  const t = await getTranslations("profile");
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const ctx = await loadProfileSession(serviceConfig);
  if (!ctx) {
    return { error: t("errors.noSession") };
  }
  return { ...ctx, serviceConfig, t };
}

function failed(ctx: Ctx, what: string, error: unknown): { error: string } {
  logger.warn(`profile: ${what} failed`, { error: error instanceof Error ? error.message : String(error) });
  return { error: ctx.t("errors.failed") };
}

async function humanOf(ctx: Ctx): Promise<HumanUser | undefined> {
  const response = await getUserByID({ serviceConfig: ctx.serviceConfig, userId: ctx.userId });
  return response.user?.type.case === "human" ? response.user.type.value : undefined;
}

/**
 * Where a flow started from the profile returns to. Behind traefik (the browser
 * is at id.holycode.org/me) the public short address; anywhere else the
 * profile under the app's basePath.
 */
async function returnTargetFor(section: ProfileSection): Promise<string> {
  const _headers = await headers();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const prefix = resolveProfilePrefix(_headers, basePath);
  if (prefix === PROFILE_SHORT_PREFIX) {
    return `${getPublicHostWithProtocol(_headers)}${profilePath(PROFILE_SHORT_PREFIX, section)}`;
  }
  return profilePath(PROFILE_SHORT_PREFIX, section);
}

async function rememberReturn(section: ProfileSection): Promise<void> {
  const _headers = await headers();
  const target = await returnTargetFor(section);
  await rememberReturnTo(target, getPublicHost(_headers));
}

function userParams(ctx: ProfileSessionContext): URLSearchParams {
  const params = new URLSearchParams({ loginName: ctx.loginName });
  if (ctx.organizationId) {
    params.set("organization", ctx.organizationId);
  }
  return params;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export async function saveName(input: {
  givenName: string;
  familyName: string;
  displayName: string;
}): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  const form = validateNameForm({
    givenName: String(input.givenName ?? ""),
    familyName: String(input.familyName ?? ""),
    displayName: String(input.displayName ?? ""),
  });
  if (!form.ok) {
    return { error: ctx.t(`errors.name.${form.field}`) };
  }

  try {
    await updateHumanProfile({
      serviceConfig: ctx.serviceConfig,
      userId: ctx.userId,
      profile: { givenName: form.givenName, familyName: form.familyName, displayName: form.displayName },
    });
    return { ok: true };
  } catch (error) {
    return failed(ctx, "saveName", error);
  }
}

export async function saveLanguage(code: string): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  const language = String(code ?? "")
    .trim()
    .toLowerCase();
  if (!LANGS.some((l) => l.code === language)) {
    return { error: ctx.t("errors.unknownLanguage") };
  }

  try {
    const human = await humanOf(ctx);
    if (!human?.profile) {
      return { error: ctx.t("errors.failed") };
    }
    await updateHumanProfile({
      serviceConfig: ctx.serviceConfig,
      userId: ctx.userId,
      profile: {
        givenName: human.profile.givenName,
        familyName: human.profile.familyName,
        preferredLanguage: language,
      },
    });
    await setLanguageCookie(language);
    return { ok: true };
  } catch (error) {
    return failed(ctx, "saveLanguage", error);
  }
}

export async function saveTheme(value: string): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  const theme = parseThemePreference(value);
  if (!theme) {
    return { error: ctx.t("errors.unknownTheme") };
  }

  try {
    await setUserMetadata({
      serviceConfig: ctx.serviceConfig,
      userId: ctx.userId,
      entries: [{ key: THEME_METADATA_KEY, value: theme }],
    });
    return { ok: true };
  } catch (error) {
    return failed(ctx, "saveTheme", error);
  }
}

/**
 * A new sign-in e-mail: set on the account at once and confirmed through the
 * link the ID sends to the new address (the same /verify screen as after
 * registration). The login name and the username do not change.
 */
export async function changeEmail(value: string): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  const email = String(value ?? "").trim();
  if (!isPlausibleEmail(email)) {
    return { error: ctx.t("errors.invalidEmail") };
  }

  try {
    const human = await humanOf(ctx);
    if (human?.email?.email?.toLowerCase() === email.toLowerCase() && human.email.isVerified) {
      return { error: ctx.t("errors.sameEmail") };
    }
    const _headers = await headers();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const urlTemplate = `${getPublicHostWithProtocol(_headers)}${basePath}/verify?code={{.Code}}&userId={{.UserID}}&organization={{.OrgID}}`;
    await setHumanEmail({ serviceConfig: ctx.serviceConfig, userId: ctx.userId, email, urlTemplate });
    return { ok: true };
  } catch (error) {
    return failed(ctx, "changeEmail", error);
  }
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

async function signInCounts(ctx: Ctx) {
  const [methods, passkeys, links] = await Promise.all([
    listAuthenticationMethodTypes({ serviceConfig: ctx.serviceConfig, userId: ctx.userId }),
    listPasskeys({ serviceConfig: ctx.serviceConfig, userId: ctx.userId }),
    listIDPLinks({ serviceConfig: ctx.serviceConfig, userId: ctx.userId }),
  ]);
  return {
    methods: summarizeAuthMethods(methods.authMethodTypes),
    passkeys: passkeys.result.filter((p) => p.state === AuthFactorState.READY).length,
    idps: links.result.length,
  };
}

export async function unlinkProvider(input: { idpId: string; linkedUserId: string }): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  try {
    const counts = await signInCounts(ctx);
    if (!canRemoveSignInMethod(counts.methods, "idp", counts)) {
      return { error: ctx.t("errors.lastMethod") };
    }
    await removeIDPLink({
      serviceConfig: ctx.serviceConfig,
      userId: ctx.userId,
      idpId: String(input.idpId ?? ""),
      linkedUserId: String(input.linkedUserId ?? ""),
    });
    return { ok: true };
  } catch (error) {
    return failed(ctx, "unlinkProvider", error);
  }
}

export async function deletePasskey(passkeyId: string): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  try {
    const counts = await signInCounts(ctx);
    if (!canRemoveSignInMethod(counts.methods, "passkey", counts)) {
      return { error: ctx.t("errors.lastMethod") };
    }
    await removePasskey({ serviceConfig: ctx.serviceConfig, userId: ctx.userId, passkeyId: String(passkeyId ?? "") });
    return { ok: true };
  } catch (error) {
    return failed(ctx, "deletePasskey", error);
  }
}

export async function disableTotp(): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  try {
    await removeTOTP({ serviceConfig: ctx.serviceConfig, userId: ctx.userId });
    return { ok: true };
  } catch (error) {
    return failed(ctx, "disableTotp", error);
  }
}

/** "If you forget your password": the ID mails the reset link to the sign-in address, right now. */
export async function sendPasswordResetToMe(): Promise<ActionResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  try {
    const _headers = await headers();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    await passwordReset({
      serviceConfig: ctx.serviceConfig,
      userId: ctx.userId,
      urlTemplate: `${getPublicHostWithProtocol(_headers)}${basePath}/password/set?code={{.Code}}&userId={{.UserID}}&organization={{.OrgID}}`,
    });
    return { ok: true };
  } catch (error) {
    return failed(ctx, "sendPasswordReset", error);
  }
}

export type ProfileFlow = "passkey" | "secondFactor" | "password" | "verifyEmail";

/**
 * Starts one of the login app's existing screens for the signed-in person and
 * remembers to come back to the profile when it is done.
 */
export async function beginFlow(kind: ProfileFlow, returnSection: ProfileSection): Promise<FlowResult> {
  const ctx = await requireProfile();
  if ("error" in ctx) return ctx;

  const params = userParams(ctx);
  const section: ProfileSection = returnSection === "data" ? "data" : "security";

  switch (kind) {
    case "passkey":
      await rememberReturn(section);
      return { redirect: `/passkey/set?${params}` };
    case "secondFactor":
      await rememberReturn(section);
      return { redirect: `/mfa/set?${params}` };
    case "password":
      await rememberReturn(section);
      return { redirect: `/password/change?${params}` };
    case "verifyEmail": {
      try {
        const sent = await resendVerification({ userId: ctx.userId, isInvite: false });
        if (sent && "error" in sent && sent.error) {
          return { error: sent.error };
        }
      } catch (error) {
        return failed(ctx, "verifyEmail", error);
      }
      await rememberReturn("data");
      params.set("userId", ctx.userId);
      params.set("codeSent", "true");
      return { redirect: `/verify?${params}` };
    }
    default:
      return { error: ctx.t("errors.failed") };
  }
}

/**
 * "Link a provider": the same server action as the provider tiles on the sign-in
 * screen, with the current session (explicit linking), and the profile as the
 * place to come back to.
 */
export async function beginProviderLink(prevState: RedirectToIdpState, formData: FormData): Promise<RedirectToIdpState> {
  const ctx = await requireProfile();
  if ("error" in ctx) return { error: ctx.error };

  await rememberReturn("data");
  const form = new FormData();
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      form.set(key, value);
    }
  });
  form.set("sessionId", ctx.sessionCookie.id);
  form.set("postErrorRedirectUrl", profilePath(PROFILE_SHORT_PREFIX, "data"));
  return redirectToIdp(prevState, form);
}

/**
 * "Sign out everywhere", the ID side: every session this browser holds in the
 * Login V2 cookie is terminated in Zitadel and dropped from the cookie. The
 * Daenerys sessions are ended by the browser (POST /api/auth/logout with
 * all_sessions) before this is called.
 */
export async function signOutEverywhere(): Promise<FlowResult> {
  const t = await getTranslations("profile");
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const sessions = await getAllSessions();
  let iFrameEnabled = false;
  try {
    const securitySettings = await getSecuritySettings({ serviceConfig });
    iFrameEnabled = !!securitySettings?.embeddedIframe?.enabled;
  } catch {
    // cookie flags only
  }

  for (const session of sessions) {
    try {
      await deleteSession({ serviceConfig, sessionId: session.id, sessionToken: session.token });
    } catch (error) {
      logger.warn("signOutEverywhere: could not delete a session", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      await removeSessionFromCookie({ session, iFrameEnabled });
    } catch (error) {
      logger.warn("signOutEverywhere: could not drop a cookie entry", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { error: t("errors.failed") };
    }
  }

  return { redirect: "/loginname" };
}
