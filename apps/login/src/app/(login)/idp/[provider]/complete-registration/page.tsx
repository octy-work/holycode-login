import { DynamicTheme } from "@/components/dynamic-theme";
import { SignupComplete } from "@/components/signup-complete";
import { listSignupDomains } from "@/lib/server/daenerys-signup";
import { getServiceConfig } from "@/lib/service-url";
import { hasConsents, parseSignupState, SIGNUP_COOKIE_NAME } from "@/lib/signup";
import { getBrandingSettings, getLegalAndSupportSettings } from "@/lib/zitadel";
import { cookies, headers } from "next/headers";

/**
 * Complete registration page — a provider confirmed a person who has no account yet.
 *
 * HolyCode (02.10.2026): the e-mail step of the registration wizard — a new mailbox
 * in a HolyCode domain (domains from Daenerys) or the provider's address — plus the
 * name; the consents too when the person came straight from a provider button
 * without step 1 (no `hc_signup` cookie with them).
 */
export default async function CompleteRegistrationPage(props: {
  searchParams: Promise<Record<string | number | symbol, string | undefined>>;
  params: Promise<{ provider: string }>;
}) {
  const searchParams = await props.searchParams;
  const { id, token, requestId, organization, idpId, idpUserId, idpUserName, givenName, familyName, email } = searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  if (!id || !token || !idpId || !organization || !idpUserId) {
    throw new Error("Missing required parameters");
  }

  const [branding, legal, domains] = await Promise.all([
    getBrandingSettings({ serviceConfig, organization }),
    getLegalAndSupportSettings({ serviceConfig, organization }).catch(() => undefined),
    listSignupDomains(),
  ]);

  const jar = await cookies();
  const signup = parseSignupState(jar.get(SIGNUP_COOKIE_NAME)?.value);

  return (
    <DynamicTheme branding={branding}>
      <SignupComplete
        idpUserId={idpUserId}
        idpId={idpId}
        idpUserName={idpUserName}
        defaultValues={{
          email: email || "",
          firstname: givenName || "",
          lastname: familyName || "",
        }}
        requestId={requestId}
        organization={organization}
        idpIntent={{
          idpIntentId: id,
          idpIntentToken: token,
        }}
        domains={domains}
        needConsents={!hasConsents(signup)}
        legal={legal ?? undefined}
      />
    </DynamicTheme>
  );
}
