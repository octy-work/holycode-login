import { CopyCode } from "@/components/copy-code";
import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings } from "@/lib/zitadel";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verify");
  return { title: t("copy.title") };
}

/**
 * Target of the "Copy code" button in ID e-mails (instance mail template):
 * /ui/v2/login/code#FQ6US6.
 */
export default async function Page() {
  const { serviceConfig } = getServiceConfig(await headers());
  const branding = await getBrandingSettings({ serviceConfig });

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="copy.title" namespace="verify" />
        </h1>
        <p className="ztdl-p">
          <Translated i18nKey="copy.hint" namespace="verify" />
        </p>
      </div>
      <CopyCode />
    </DynamicTheme>
  );
}
