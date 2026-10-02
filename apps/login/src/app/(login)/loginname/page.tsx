import { DynamicTheme } from "@/components/dynamic-theme";
import { SignInForm } from "@/components/sign-in-form";
import { resolveRememberedView, sameLoginName } from "@/lib/last-login";
import { passkeyLabelKind } from "@/lib/passkey-discover";
import { readLastLogin } from "@/lib/server/last-login";
import { getServiceConfig } from "@/lib/service-url";
import { getActiveIdentityProviders, getBrandingSettings, getDefaultOrg, getLoginSettings } from "@/lib/zitadel";
import { Organization } from "@zitadel/proto/zitadel/org/v2/org_pb";
import { PasskeysType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("loginname");
  return { title: t("title") };
}

/**
 * HolyCode: the sign-in screen — the choice of ways in (passkey, login or e-mail,
 * providers; 02.10.2026), the login form with login and password together, and
 * "welcome back" for the account this browser signed in with last time
 * (see SignInForm, lib/last-login.ts). The /password step stays for other entries
 * (passkey "use password", account picker fallbacks).
 */
export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;

  const loginName = searchParams?.loginName;
  const requestId = searchParams?.requestId;
  const organization = searchParams?.organization;
  const orgDomain = searchParams?.orgDomain;
  const submit: boolean = searchParams?.submit === "true";
  // HolyCode: `?via=login` opens the login form instead of the choice of ways in.
  const startWith = searchParams?.via === "login" ? "form" : "choose";

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  let defaultOrganization;
  if (!organization) {
    const org: Organization | null = await getDefaultOrg({ serviceConfig });
    if (org) {
      defaultOrganization = org.id;
    }
  }

  const loginSettings = await getLoginSettings({ serviceConfig, organization: organization ?? defaultOrganization });

  const identityProviders = await getActiveIdentityProviders({
    serviceConfig,
    orgId: organization ?? defaultOrganization,
  }).then((resp) => {
    return resp.identityProviders;
  });

  const branding = await getBrandingSettings({ serviceConfig, organization: organization ?? defaultOrganization });

  const offeredIdps = loginSettings?.allowExternalIdp && identityProviders?.length ? identityProviders : [];

  // With an org domain suffix the login name may only be the local part.
  const fullLoginName = loginName && orgDomain && !loginName.includes("@") ? `${loginName}@${orgDomain}` : loginName;

  // A login_hint from the request wins over what this browser remembers: the
  // remembered account is used only without a hint or when the hint is that account.
  const lastLogin = await readLastLogin();
  const remembered =
    lastLogin &&
    (!loginName || sameLoginName(fullLoginName, lastLogin.loginName) || sameLoginName(loginName, lastLogin.loginName))
      ? resolveRememberedView(lastLogin, {
          allowLocalAuthentication: !!loginSettings?.allowLocalAuthentication,
          passkeysAllowed: loginSettings?.passkeysType !== PasskeysType.NOT_ALLOWED,
          identityProviders: offeredIdps,
        })
      : null;

  return (
    <DynamicTheme branding={branding}>
      <SignInForm
        loginName={loginName}
        requestId={requestId}
        organization={organization} // stick to "organization" as we still want to do user discovery based on the searchParams not the default organization, later the organization is determined by the found user
        defaultOrganization={defaultOrganization}
        loginSettings={loginSettings}
        suffix={orgDomain}
        hideSuffix={branding?.hideLoginNameSuffix}
        submit={submit}
        identityProviders={offeredIdps}
        allowRegister={!!loginSettings?.allowRegister}
        remembered={remembered}
        startWith={startWith}
        passkeysAllowed={loginSettings?.passkeysType !== PasskeysType.NOT_ALLOWED}
        passkeyKindHint={passkeyLabelKind({ userAgent: _headers.get("user-agent") ?? "", hasPlatformAuthenticator: true })}
      />
    </DynamicTheme>
  );
}
