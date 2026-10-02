import { Alert } from "@/components/alert";
import { DynamicTheme } from "@/components/dynamic-theme";
import { SignupOrganization } from "@/components/signup-organization";
import { currentSignupTeam } from "@/lib/server/signup";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getDefaultOrg } from "@/lib/zitadel";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signup");
  return { title: t("org.title") };
}

/** HolyCode registration "for a team": the organization step after the account is created. */
export default async function Page() {
  const t = await getTranslations("signup");
  const { serviceConfig } = getServiceConfig(await headers());
  const org = await getDefaultOrg({ serviceConfig }).catch(() => null);
  const branding = await getBrandingSettings({ serviceConfig, organization: org?.id });
  const account = await currentSignupTeam();

  return (
    <DynamicTheme branding={branding}>
      {account ? (
        <SignupOrganization account={account} />
      ) : (
        <div className="flex w-full flex-col gap-3 text-left">
          <h1>{t("org.title")}</h1>
          <Alert>{t("errors.noSignup")}</Alert>
          <Link href="/register" className="text-hc-link text-sm font-medium">
            {t("restart")}
          </Link>
        </div>
      )}
    </DynamicTheme>
  );
}
