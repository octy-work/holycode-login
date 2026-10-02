import { DynamicTheme } from "@/components/dynamic-theme";
import { RecoveryCodeForm } from "@/components/recovery-code-form";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings } from "@/lib/zitadel";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("recoveryCode");
  return { title: t("title") };
}

/** HolyCode: second factor by a single-use recovery code (from /mfa or the authenticator step). */
export default async function Page(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { loginName, sessionId, organization, requestId } = await props.searchParams;
  const { serviceConfig } = getServiceConfig(await headers());
  const branding = await getBrandingSettings({ serviceConfig, organization });

  return (
    <DynamicTheme branding={branding}>
      <RecoveryCodeForm loginName={loginName} sessionId={sessionId} organization={organization} requestId={requestId} />
    </DynamicTheme>
  );
}
