"use server";

import { createSessionForIdpAndUpdateCookie } from "@/lib/server/cookie";
import {
  CONSENT_VERSION,
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  CookieConsent,
  hasConsents,
  localPartProblem,
  MAX_MAILBOX_ALIASES,
  normalizeDomain,
  normalizeLocalPart,
  parseCookieConsent,
  parseSignupState,
  serializeSignupState,
  SIGNUP_COOKIE_MAX_AGE_SECONDS,
  SIGNUP_COOKIE_NAME,
  SignupState,
  SignupWho,
} from "@/lib/signup";
import {
  addHumanUser,
  addIDPLink,
  generateRecoveryCodes,
  getLoginSettings,
  getSession,
  listAuthenticationMethodTypes,
  registerTOTP,
  setUserMetadata,
  verifyTOTPRegistration,
} from "@/lib/zitadel";
import { Code, ConnectError } from "@zitadel/client";
import { getTranslations } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { completeFlowOrGetUrl } from "../client";
import { getSessionCookieByLoginName } from "../cookies";
import { createLogger } from "../logger";
import { getServiceConfig } from "../service-url";
import { checkMFAFactors } from "../verify-helper";
import {
  activateMailbox,
  checkMailbox,
  clientIpFrom,
  createSignupOrg,
  listSignupDomains,
  recordConsent,
  reserveMailbox,
} from "./daenerys-signup";
import { registerPasskeyLink, verifyPasskeyRegistration } from "./passkeys";
import { issueChallenge, verifySolution } from "./pow";
import { allow } from "./rate-limit";

const logger = createLogger("signup");

type FlowResult = { error: string } | { redirect: string } | { samlData: { url: string; fields: Record<string, string> } };

async function readSignupState(): Promise<SignupState | null> {
  const jar = await cookies();
  return parseSignupState(jar.get(SIGNUP_COOKIE_NAME)?.value);
}

async function writeSignupState(state: SignupState) {
  const jar = await cookies();
  jar.set(SIGNUP_COOKIE_NAME, serializeSignupState(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SIGNUP_COOKIE_MAX_AGE_SECONDS,
  });
}

async function clearSignupState() {
  const jar = await cookies();
  jar.delete(SIGNUP_COOKIE_NAME);
}

async function readCookieConsent(): Promise<CookieConsent | null> {
  const jar = await cookies();
  return parseCookieConsent(jar.get(COOKIE_CONSENT_COOKIE_NAME)?.value);
}

/** The cookie banner: "allow all" or "necessary only" (functional cookies such as "welcome back" off). */
export async function setCookieConsent(choice: CookieConsent): Promise<void> {
  if (choice !== "all" && choice !== "necessary") {
    return;
  }
  const jar = await cookies();
  jar.set(COOKIE_CONSENT_COOKIE_NAME, choice, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_CONSENT_MAX_AGE_SECONDS,
  });
}

/** Proof-of-work for the mailbox form (lib/pow.ts): the browser solves it while the person types. */
export async function issueSignupChallenge(): Promise<{ challenge: string; difficulty: number }> {
  return issueChallenge();
}

async function ipKey(action: string): Promise<string> {
  return `${action}:${clientIpFrom(await headers()) ?? "unknown"}`;
}

/** Step 1: who the account is for and the two consents. */
export async function startSignup(input: {
  who: SignupWho;
  terms: boolean;
  pd: boolean;
  requestId?: string;
  organization?: string;
}): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations("signup");
  if (input.who !== "personal" && input.who !== "team") {
    return { error: t("errors.generic") };
  }
  if (!input.terms || !input.pd) {
    return { error: t("errors.consents") };
  }
  if (!allow(await ipKey("start"), 30, 60 * 60 * 1000)) {
    return { error: t("errors.tooMany") };
  }
  await writeSignupState({
    who: input.who,
    terms: CONSENT_VERSION,
    pd: CONSENT_VERSION,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.organization ? { organization: input.organization } : {}),
  });
  return { ok: true };
}

export type MailboxNameStatus =
  "available" | "taken" | "held" | "reserved_name" | "invalid" | "short" | "domain" | "limited" | "unavailable";

export type MailboxNameAnswer = {
  status: MailboxNameStatus;
  address: string;
  aliases: { address: string; available: boolean }[];
};

function statusOf(reason: string | undefined, available: boolean): MailboxNameStatus {
  if (available) return "available";
  switch (reason) {
    case "taken":
    case "held":
    case "reserved_name":
    case "invalid":
    case "short":
    case "domain":
      return reason;
    default:
      return "taken";
  }
}

/** Step 3: is the mailbox name free (and in which of the alias domains). */
export async function checkMailboxName(input: {
  local: string;
  domain: string;
  aliases: string[];
}): Promise<MailboxNameAnswer> {
  const local = normalizeLocalPart(input.local);
  const address = `${local}@${input.domain}`;
  const problem = localPartProblem(local);
  if (problem) {
    return { status: problem, address, aliases: [] };
  }
  if (!allow(await ipKey("check"), 60, 60 * 1000)) {
    return { status: "limited", address, aliases: [] };
  }
  const domains = await listSignupDomains();
  const allowed = new Set(domains.map((d) => d.domain));
  if (!allowed.has(input.domain)) {
    return { status: domains.length ? "domain" : "unavailable", address, aliases: [] };
  }
  const aliases = (input.aliases ?? []).filter((d) => allowed.has(d) && d !== input.domain).slice(0, domains.length);
  const _headers = await headers();
  const result = await checkMailbox({ local, domain: input.domain, aliases, clientIp: clientIpFrom(_headers) });
  if (!result.ok) {
    return { status: result.status === 429 ? "limited" : "unavailable", address, aliases: [] };
  }
  return {
    status: statusOf(result.data.reason, !!result.data.available),
    address: result.data.address || address,
    aliases: (result.data.aliases ?? []).map((a) => ({ address: a.address, available: !!a.available })),
  };
}

async function journalConsent(userId: string) {
  const cookieConsent = (await readCookieConsent()) ?? "necessary";
  const _headers = await headers();
  const journaled = await recordConsent({
    userId,
    version: CONSENT_VERSION,
    cookies: cookieConsent,
    clientIp: clientIpFrom(_headers),
    userAgent: _headers.get("user-agent") ?? undefined,
  });
  if (journaled.ok) {
    return;
  }
  // Daenerys unreachable or not configured yet: keep the mark on the user in Zitadel
  // so the consent is never lost; the journal can be backfilled from it.
  logger.warn("Consent journal unavailable, writing the mark to Zitadel metadata", { code: journaled.code });
  try {
    const { serviceConfig } = getServiceConfig(_headers);
    await setUserMetadata({
      serviceConfig,
      userId,
      entries: [
        {
          key: "hc_consent",
          value: JSON.stringify({
            terms: CONSENT_VERSION,
            privacy: CONSENT_VERSION,
            pd: CONSENT_VERSION,
            cookies: cookieConsent,
            at: new Date().toISOString(),
          }),
        },
      ],
    });
  } catch (error) {
    logger.error("Could not record the consent anywhere", { error: String(error) });
  }
}

export type CompleteIdpSignupCommand = {
  idpId: string;
  idpUserId: string;
  idpUserName?: string;
  idpIntent: { idpIntentId: string; idpIntentToken: string };
  organization: string;
  requestId?: string;
  firstName: string;
  lastName: string;
  /** The address the provider gave (used for "my e-mail"). */
  ownEmail: string;
  mail: { kind: "own" } | { kind: "hosted"; local: string; domain: string; aliases: string[] };
  /** Ticked on this screen when the person came straight from a provider button (no step 1). */
  consents?: { terms: boolean; pd: boolean };
  /** Proof-of-work, required for a new mailbox. */
  pow?: { challenge: string; nonce: string };
};

/**
 * Steps 3–4 after a provider confirmed the person (replaces upstream's
 * registerUserAndLinkToIDP for HolyCode): consents, then the account with either the
 * provider's e-mail or a reserved HolyCode mailbox, the provider link and a session.
 * A new mailbox goes on to the second-factor step; Daenerys switches it on there.
 */
export async function completeIdpSignup(command: CompleteIdpSignupCommand): Promise<FlowResult> {
  const t = await getTranslations("signup");
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const state = await readSignupState();
  const consentsGiven = hasConsents(state) || (!!command.consents?.terms && !!command.consents?.pd);
  if (!consentsGiven) {
    return { error: t("errors.consents") };
  }

  const loginSettings = await getLoginSettings({ serviceConfig, organization: command.organization });
  if (!loginSettings?.allowRegister) {
    return { error: t("errors.registerClosed") };
  }

  const firstName = command.firstName.trim();
  const lastName = command.lastName.trim();
  if (!firstName || !lastName) {
    return { error: t("errors.name") };
  }

  let email = command.ownEmail.trim();
  let emailVerified = false;
  let reservation: SignupState["reservation"] | undefined;

  if (!allow(await ipKey("complete"), 10, 60 * 60 * 1000)) {
    return { error: t("errors.tooMany") };
  }

  if (command.mail.kind === "hosted") {
    const hosted = command.mail;
    if (!command.pow || !verifySolution(command.pow.challenge, command.pow.nonce)) {
      return { error: t("errors.pow") };
    }
    const local = normalizeLocalPart(hosted.local);
    if (localPartProblem(local)) {
      return { error: t("errors.mailboxInvalid") };
    }
    const domains = (await listSignupDomains()).map((d) => d.domain);
    if (!domains.includes(hosted.domain)) {
      return { error: t("errors.mailboxUnavailable") };
    }
    const aliases = (hosted.aliases ?? [])
      .filter((d) => domains.includes(d) && d !== hosted.domain)
      .slice(0, MAX_MAILBOX_ALIASES);
    const reserved = await reserveMailbox({
      local,
      domain: hosted.domain,
      aliases,
      clientIp: clientIpFrom(_headers),
    });
    if (!reserved.ok) {
      if (reserved.status === 409) return { error: t("errors.mailboxTaken") };
      if (reserved.status === 429) return { error: t("errors.tooMany") };
      return { error: t("errors.mailboxUnavailable") };
    }
    email = reserved.data.address;
    emailVerified = true;
    reservation = { id: reserved.data.reservation_id, address: reserved.data.address, aliases: reserved.data.aliases ?? [] };
  } else if (!email) {
    return { error: t("errors.noEmail") };
  }

  let userId: string;
  try {
    const added = await addHumanUser({
      serviceConfig,
      email,
      firstName,
      lastName,
      organization: command.organization,
      emailVerified,
    });
    userId = added.userId;
  } catch (error) {
    if (error instanceof ConnectError && error.code === Code.AlreadyExists) {
      return { error: t("errors.accountExists") };
    }
    logger.error("Could not create the user", { error: String(error) });
    return { error: t("errors.generic") };
  }

  const link = await addIDPLink({
    serviceConfig,
    idp: { id: command.idpId, userId: command.idpUserId, userName: command.idpUserName ?? "" },
    userId,
  }).catch((error) => {
    logger.error("Could not link the provider", { error: String(error) });
    return null;
  });
  if (!link) {
    return { error: t("errors.generic") };
  }

  const session = await createSessionForIdpAndUpdateCookie({
    requestId: command.requestId,
    userId,
    idpIntent: command.idpIntent,
    lifetime: loginSettings?.externalLoginCheckLifetime,
  }).catch((error) => {
    logger.error("Could not create the session", { error: String(error) });
    return null;
  });
  if (!session || !session.factors?.user) {
    return { error: t("errors.generic") };
  }

  await journalConsent(userId);

  if (reservation) {
    await writeSignupState({
      who: state?.who ?? "personal",
      terms: CONSENT_VERSION,
      pd: CONSENT_VERSION,
      ...(command.requestId ? { requestId: command.requestId } : {}),
      organization: command.organization,
      reservation,
    });
    return { redirect: "/register/protect" };
  }

  if (state?.who === "team") {
    // "For a team": name the organization before going on (/register/organization).
    await writeSignupState({
      who: "team",
      terms: CONSENT_VERSION,
      pd: CONSENT_VERSION,
      ...(command.requestId ? { requestId: command.requestId } : {}),
      organization: command.organization,
      team: session.factors.user.loginName,
    });
    return { redirect: "/register/organization" };
  }

  await clearSignupState();

  const methods = await listAuthenticationMethodTypes({ serviceConfig, userId }).catch(() => null);
  const mfa = await checkMFAFactors(
    serviceConfig,
    session,
    loginSettings,
    methods?.authMethodTypes ?? [],
    command.organization,
    command.requestId,
  );
  if (mfa?.redirect) {
    return mfa;
  }

  return completeFlowOrGetUrl(
    command.requestId && session.id
      ? { sessionId: session.id, requestId: command.requestId, organization: session.factors.user.organizationId }
      : { loginName: session.factors.user.loginName, organization: session.factors.user.organizationId },
    loginSettings?.defaultRedirectUri,
  );
}

/** The registration in progress at the second-factor step: its reservation and its session. */
async function protectContext(): Promise<
  | {
      ok: true;
      state: SignupState & { reservation: NonNullable<SignupState["reservation"]> };
      userId: string;
      sessionId: string;
    }
  | { ok: false }
> {
  const state = await readSignupState();
  if (!state?.reservation) {
    return { ok: false };
  }
  const cookie = await getSessionCookieByLoginName({
    loginName: state.reservation.address,
    organization: state.organization,
  });
  if (!cookie) {
    return { ok: false };
  }
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const response = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token }).catch(() => null);
  const userId = response?.session?.factors?.user?.id;
  if (!userId) {
    return { ok: false };
  }
  return {
    ok: true,
    state: state as SignupState & { reservation: NonNullable<SignupState["reservation"]> },
    userId,
    sessionId: cookie.id,
  };
}

/** For the protect page: the address being set up, or null when there is no registration in progress. */
export async function currentSignupMailbox(): Promise<{ address: string; aliases: string[] } | null> {
  const ctx = await protectContext();
  return ctx.ok ? { address: ctx.state.reservation.address, aliases: ctx.state.reservation.aliases } : null;
}

async function switchMailboxOn(ctx: Extract<Awaited<ReturnType<typeof protectContext>>, { ok: true }>): Promise<FlowResult> {
  const t = await getTranslations("signup");
  const activated = await activateMailbox({ reservationId: ctx.state.reservation.id, userId: ctx.userId });
  if (!activated.ok) {
    logger.warn("Mailbox activation refused", { code: activated.code, status: activated.status });
    if (activated.code === "second_factor_required") return { error: t("errors.secondFactor") };
    if (activated.code === "anchor_required") return { error: t("errors.anchor") };
    return { error: t("errors.activation") };
  }
  const address = activated.data.address || ctx.state.reservation.address;
  const aliases = activated.data.aliases ?? ctx.state.reservation.aliases;
  await writeSignupState({ ...ctx.state, reservation: undefined, activated: address });
  const params = new URLSearchParams({ address });
  if (aliases.length) params.set("aliases", aliases.join(","));
  return { redirect: `/register/done?${params}` };
}

/** Step 5, authenticator app: the secret and its otpauth:// URI for the QR code. */
export async function startTotpSetup(): Promise<{ uri: string; secret: string } | { error: string }> {
  const t = await getTranslations("signup");
  const ctx = await protectContext();
  if (!ctx.ok) {
    return { error: t("errors.noSignup") };
  }
  const { serviceConfig } = getServiceConfig(await headers());
  try {
    const registered = await registerTOTP({ serviceConfig, userId: ctx.userId });
    return { uri: registered.uri, secret: registered.secret };
  } catch (error) {
    logger.error("Could not start TOTP registration", { error: String(error) });
    return { error: t("errors.generic") };
  }
}

export async function confirmTotpSetup(code: string): Promise<FlowResult> {
  const t = await getTranslations("signup");
  const ctx = await protectContext();
  if (!ctx.ok) {
    return { error: t("errors.noSignup") };
  }
  const digits = (code || "").replace(/\D/g, "");
  if (digits.length !== 6) {
    return { error: t("errors.totpCode") };
  }
  const { serviceConfig } = getServiceConfig(await headers());
  try {
    await verifyTOTPRegistration({ serviceConfig, code: digits, userId: ctx.userId });
  } catch {
    return { error: t("errors.totpCode") };
  }
  return switchMailboxOn(ctx);
}

/** Step 5, passkey: the creation options (the browser makes the key), then the check. */
export async function startPasskeySetup() {
  const t = await getTranslations("signup");
  const ctx = await protectContext();
  if (!ctx.ok) {
    return { error: t("errors.noSignup") };
  }
  return registerPasskeyLink({ sessionId: ctx.sessionId });
}

export async function confirmPasskeySetup(input: { passkeyId: string; publicKeyCredential: unknown }): Promise<FlowResult> {
  const t = await getTranslations("signup");
  const ctx = await protectContext();
  if (!ctx.ok) {
    return { error: t("errors.noSignup") };
  }
  try {
    await verifyPasskeyRegistration({
      passkeyId: input.passkeyId,
      publicKeyCredential: input.publicKeyCredential,
      sessionId: ctx.sessionId,
    });
  } catch (error) {
    logger.warn("Passkey registration failed", { error: String(error) });
    return { error: t("errors.passkey") };
  }
  return switchMailboxOn(ctx);
}

/** Step 6: back to the service the person came from (or the default page). */
export async function continueAfterSignup(input: { address: string }): Promise<FlowResult> {
  const t = await getTranslations("signup");
  const state = await readSignupState();
  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const cookie = await getSessionCookieByLoginName({ loginName: input.address, organization: state?.organization });
  if (cookie && state?.who === "team") {
    await writeSignupState({ ...state, team: cookie.loginName, activated: undefined });
    return { redirect: "/register/organization" };
  }
  await clearSignupState();
  if (!cookie) {
    return { redirect: "/loginname" };
  }
  const loginSettings = await getLoginSettings({ serviceConfig, organization: state?.organization });
  const result = await completeFlowOrGetUrl(
    state?.requestId
      ? { sessionId: cookie.id, requestId: state.requestId, organization: cookie.organization }
      : { loginName: cookie.loginName, organization: cookie.organization },
    loginSettings?.defaultRedirectUri,
  );
  return result && typeof result === "object" ? result : { error: t("errors.generic") };
}

/**
 * Step 6: ten single-use recovery codes, issued once right after the mailbox is on
 * (the `activated` mark in the wizard's cookie and the session of that account).
 * Later codes come from the profile.
 */
export async function generateSignupRecoveryCodes(): Promise<{ codes: string[] } | { error: string }> {
  const t = await getTranslations("signup");
  const state = await readSignupState();
  if (!state?.activated) {
    return { error: t("done.codes.gone") };
  }
  const cookie = await getSessionCookieByLoginName({ loginName: state.activated, organization: state.organization });
  if (!cookie) {
    return { error: t("done.codes.gone") };
  }
  const { serviceConfig } = getServiceConfig(await headers());
  const session = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token }).catch(() => null);
  const userId = session?.session?.factors?.user?.id;
  if (!userId) {
    return { error: t("done.codes.gone") };
  }
  await writeSignupState({ ...state, activated: undefined });
  try {
    const generated = await generateRecoveryCodes({ serviceConfig, userId, count: 10 });
    return { codes: generated.recoveryCodes };
  } catch (error) {
    logger.warn("Could not issue recovery codes", { error: String(error) });
    return { error: t("done.codes.failed") };
  }
}

/** For the organization page: the account that is naming its organization, or null. */
export async function currentSignupTeam(): Promise<string | null> {
  const state = await readSignupState();
  return state?.who === "team" && state.team ? state.team : null;
}

async function teamContext() {
  const state = await readSignupState();
  if (!state?.team) return null;
  const cookie = await getSessionCookieByLoginName({ loginName: state.team, organization: state.organization });
  if (!cookie) return null;
  const { serviceConfig } = getServiceConfig(await headers());
  const session = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token }).catch(() => null);
  const userId = session?.session?.factors?.user?.id;
  return userId ? { state, cookie, userId, serviceConfig } : null;
}

/**
 * "For a team": the organization (Daenerys `POST /api/id/org`, the person is its
 * owner), then the organization's admin — with the domain to connect, if given.
 */
export async function createSignupOrganization(input: { name: string; domain?: string }): Promise<FlowResult> {
  const t = await getTranslations("signup");
  const name = (input.name || "").trim();
  if (name.length < 2 || name.length > 80) {
    return { error: t("org.errors.name") };
  }
  let domain: string | null = null;
  if (input.domain && input.domain.trim()) {
    domain = normalizeDomain(input.domain);
    if (!domain) return { error: t("org.errors.domain") };
  }
  const ctx = await teamContext();
  if (!ctx) {
    return { error: t("errors.noSignup") };
  }
  const created = await createSignupOrg({ userId: ctx.userId, name });
  if (!created.ok) {
    logger.warn("Organization not created", { code: created.code, status: created.status });
    return { error: t("org.errors.create") };
  }
  await clearSignupState();
  const base = (process.env.HC_ORG_ADMIN_URL || "https://chat.holycode.org/admin").replace(/\/+$/, "");
  const params = new URLSearchParams({ org: created.data.account_id });
  if (domain) params.set("domain", domain);
  return { redirect: `${base}?${params}` };
}

/** "For a team", later: go on to the service now, name the organization in the admin. */
export async function skipSignupOrganization(): Promise<FlowResult> {
  const t = await getTranslations("signup");
  const ctx = await teamContext();
  await clearSignupState();
  if (!ctx) {
    return { redirect: "/loginname" };
  }
  const loginSettings = await getLoginSettings({ serviceConfig: ctx.serviceConfig, organization: ctx.state.organization });
  const result = await completeFlowOrGetUrl(
    ctx.state.requestId
      ? { sessionId: ctx.cookie.id, requestId: ctx.state.requestId, organization: ctx.cookie.organization }
      : { loginName: ctx.cookie.loginName, organization: ctx.cookie.organization },
    loginSettings?.defaultRedirectUri,
  );
  return result && typeof result === "object" ? result : { error: t("errors.generic") };
}
