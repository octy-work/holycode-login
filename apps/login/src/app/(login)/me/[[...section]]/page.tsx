import { ProfileShell } from "@/components/profile/shell";
import { AvailableIdp, LinkedIdp, ProfileView, SecondFactorKind } from "@/components/profile/types";
import { idpTypeToIdentityProviderType } from "@/lib/idp";
import {
  fullName,
  normalizeLanguageTag,
  parseProfileSection,
  parseThemePreference,
  PROFILE_SHORT_PREFIX,
  profilePath,
  ProfileSection,
  publicHandle,
  recommendationsBySection,
  resolveProfilePrefix,
  salutation,
  securityRecommendations,
  summarizeAuthMethods,
  THEME_METADATA_KEY,
} from "@/lib/profile";
import { getPublicHost, getPublicHostWithProtocol } from "@/lib/server/host";
import { loadProfileSession } from "@/lib/server/profile-session";
import { getServiceConfig } from "@/lib/service-url";
import { fallbackServices } from "@/lib/services";
import {
  getActiveIdentityProviders,
  getBrandingSettings,
  getIDPByID,
  getLoginSettings,
  getUserByID,
  listAuthenticationFactors,
  listAuthenticationMethodTypes,
  listIDPLinks,
  listPasskeys,
  listUserMetadata,
  ServiceConfig,
} from "@/lib/zitadel";
import { IdentityProvider, PasskeysType, SecondFactorType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { AuthFactorState } from "@zitadel/proto/zitadel/user/v2/user_pb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

function secondFactorKinds(types: SecondFactorType[] | undefined): SecondFactorKind[] {
  const out: SecondFactorKind[] = [];
  for (const type of types ?? []) {
    if (type === SecondFactorType.OTP) out.push("totp");
    else if (type === SecondFactorType.U2F) out.push("u2f");
    else if (type === SecondFactorType.OTP_EMAIL) out.push("otpEmail");
    else if (type === SecondFactorType.OTP_SMS) out.push("otpSms");
  }
  return out;
}

async function resolveLinkedIdps(
  serviceConfig: ServiceConfig,
  links: { idpId: string; userId: string; userName: string }[],
  active: IdentityProvider[],
): Promise<LinkedIdp[]> {
  const out: LinkedIdp[] = [];
  for (const link of links) {
    const known = active.find((idp) => idp.id === link.idpId);
    if (known) {
      out.push({
        idpId: link.idpId,
        name: known.name,
        type: known.type,
        linkedUserId: link.userId,
        linkedUserName: link.userName,
      });
      continue;
    }
    // A provider that is linked but no longer offered for sign-in (switched off): still shown, by its own name.
    try {
      const idp = await getIDPByID({ serviceConfig, id: link.idpId });
      out.push({
        idpId: link.idpId,
        name: idp?.name ?? link.idpId,
        type: idp ? idpTypeToIdentityProviderType(idp.type) : 0,
        linkedUserId: link.userId,
        linkedUserName: link.userName,
      });
    } catch {
      out.push({ idpId: link.idpId, name: link.idpId, type: 0, linkedUserId: link.userId, linkedUserName: link.userName });
    }
  }
  return out;
}

export default async function Page(props: { params: Promise<{ section?: string[] }> }) {
  const { section: segments } = await props.params;
  const section = parseProfileSection(segments);

  const _headers = await headers();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const prefix = resolveProfilePrefix(_headers, basePath);
  const publicHost = getPublicHost(_headers);
  const shortForm = prefix === PROFILE_SHORT_PREFIX;

  // Where the browser should be for a section: the public short address behind
  // traefik, the app-relative path (Next adds the basePath) anywhere else.
  const publicTarget = (s: ProfileSection) =>
    shortForm
      ? `${getPublicHostWithProtocol(_headers)}${profilePath(PROFILE_SHORT_PREFIX, s)}`
      : profilePath(PROFILE_SHORT_PREFIX, s);

  if (!section) {
    redirect(publicTarget("home"));
  }

  const { serviceConfig } = getServiceConfig(_headers);
  const ctx = await loadProfileSession(serviceConfig);
  if (!ctx) {
    redirect(`/me/enter?to=${encodeURIComponent(publicTarget(section))}`);
  }

  const [
    userResponse,
    methodTypes,
    passkeys,
    idpLinks,
    factors,
    metadata,
    loginSettings,
    activeIdps,
    linkableIdps,
    branding,
  ] = await Promise.all([
    getUserByID({ serviceConfig, userId: ctx.userId }),
    listAuthenticationMethodTypes({ serviceConfig, userId: ctx.userId }),
    listPasskeys({ serviceConfig, userId: ctx.userId }),
    listIDPLinks({ serviceConfig, userId: ctx.userId }),
    listAuthenticationFactors({ serviceConfig, userId: ctx.userId }).catch(() => ({ result: [] })),
    listUserMetadata({ serviceConfig, userId: ctx.userId }).catch(() => ({ metadata: [] })),
    getLoginSettings({ serviceConfig, organization: ctx.organizationId }),
    getActiveIdentityProviders({ serviceConfig, orgId: ctx.organizationId }).then((r) => r.identityProviders ?? []),
    getActiveIdentityProviders({ serviceConfig, orgId: ctx.organizationId, linking_allowed: true }).then(
      (r) => r.identityProviders ?? [],
    ),
    getBrandingSettings({ serviceConfig, organization: ctx.organizationId }),
  ]);

  const user = userResponse.user;
  const human = user?.type.case === "human" ? user.type.value : undefined;
  if (!user || !human) {
    // Machine users have no profile of this kind.
    redirect("/loginname");
  }

  const methods = summarizeAuthMethods(methodTypes.authMethodTypes);
  const linkedIdps = await resolveLinkedIdps(serviceConfig, idpLinks.result, activeIdps);
  const linkedIds = new Set(linkedIdps.map((l) => l.idpId));
  const availableIdps: AvailableIdp[] = loginSettings?.allowExternalIdp
    ? linkableIdps.filter((idp) => !linkedIds.has(idp.id)).map((idp) => ({ id: idp.id, name: idp.name, type: idp.type }))
    : [];

  const readyFactors = factors.result.filter((f) => f.state === AuthFactorState.READY);
  const secondFactors = secondFactorKinds(loginSettings?.secondFactors);
  const passkeysAllowed =
    !!loginSettings?.allowLocalAuthentication && loginSettings?.passkeysType !== PasskeysType.NOT_ALLOWED;

  const recommendations = securityRecommendations({
    methods,
    emailVerified: !!human.email?.isVerified,
    passkeysAllowed,
    secondFactorsOffered: secondFactors.length > 0,
  });

  const themeEntry = metadata.metadata.find((m) => m.key === THEME_METADATA_KEY);

  const view: ProfileView = {
    section,
    prefix,
    basePath,
    publicHost,
    user: {
      id: user.userId,
      loginName: ctx.loginName,
      username: user.username,
      handle: publicHandle(user.username),
      givenName: human.profile?.givenName ?? "",
      familyName: human.profile?.familyName ?? "",
      displayName: human.profile?.displayName ?? "",
      fullName: fullName(human.profile, ctx.loginName),
      salutation: salutation(human.profile),
      email: human.email?.email ?? "",
      emailVerified: !!human.email?.isVerified,
      avatarUrl: human.profile?.avatarUrl ?? "",
      preferredLanguage: normalizeLanguageTag(human.profile?.preferredLanguage),
      organizationId: ctx.organizationId ?? "",
    },
    methods,
    passkeys: passkeys.result.filter((p) => p.state === AuthFactorState.READY).map((p) => ({ id: p.id, name: p.name })),
    linkedIdps,
    availableIdps,
    factors: {
      totp: readyFactors.some((f) => f.type.case === "otp"),
      u2f: readyFactors.filter((f) => f.type.case === "u2f").length,
      otpEmail: readyFactors.some((f) => f.type.case === "otpEmail"),
      otpSms: readyFactors.some((f) => f.type.case === "otpSms"),
    },
    settings: {
      passkeysAllowed,
      secondFactors,
      allowExternalIdp: !!loginSettings?.allowExternalIdp,
      hidePasswordReset: !!loginSettings?.hidePasswordReset,
      allowLocalAuthentication: !!loginSettings?.allowLocalAuthentication,
    },
    recommendations,
    theme: parseThemePreference(themeEntry?.value),
    sessionId: ctx.sessionCookie.id,
    daenerysUrl: process.env.NEXT_PUBLIC_DAENERYS_API_URL ?? "",
    links: {
      services: fallbackServices(process.env.HC_PROFILE_SERVICES),
      adminUrl: process.env.HC_PROFILE_ADMIN_URL ?? "https://chat.holycode.org/admin",
      mailAdminUrl: process.env.HC_PROFILE_MAIL_ADMIN_URL ?? "https://chat.holycode.org/admin/mail",
      keysUrl: process.env.HC_PROFILE_KEYS_URL ?? "https://chat.holycode.org/settings/security",
    },
  };

  return <ProfileShell view={view} branding={branding} counters={recommendationsBySection(recommendations)} />;
}
