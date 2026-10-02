import { Alert } from "@/components/alert";
import { DynamicTheme } from "@/components/dynamic-theme";
import { SignupProtect } from "@/components/signup-protect";
import { currentSignupMailbox } from "@/lib/server/signup";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getDefaultOrg } from "@/lib/zitadel";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signup");
  return { title: t("protect.title") };
}

/** HolyCode registration, step 5: the second factor before the new mailbox is switched on. */
export default async function Page() {
  const t = await getTranslations("signup");
  const { serviceConfig } = getServiceConfig(await headers());
  const org = await getDefaultOrg({ serviceConfig }).catch(() => null);
  const branding = await getBrandingSettings({ serviceConfig, organization: org?.id });
  const mailbox = await currentSignupMailbox();

  return (
    <DynamicTheme branding={branding}>
      {mailbox ? (
        <SignupProtect address={mailbox.address} />
      ) : (
        <div className="flex w-full flex-col gap-3 text-left">
          <h1>{t("protect.title")}</h1>
          <Alert>{t("errors.noSignup")}</Alert>
          <Link href="/register" className="text-hc-link text-sm font-medium">
            {t("restart")}
          </Link>
        </div>
      )}
    </DynamicTheme>
  );
}
