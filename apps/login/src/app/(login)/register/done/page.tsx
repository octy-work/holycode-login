import { DynamicTheme } from "@/components/dynamic-theme";
import { SignupDone } from "@/components/signup-done";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getDefaultOrg } from "@/lib/zitadel";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signup");
  return { title: t("done.title") };
}

const ADDRESS_RE = /^[a-z0-9._-]{1,64}@[a-z0-9.-]{1,253}$/;

/** HolyCode registration, step 6: the mailbox is on. The address is only shown, nothing trusts it. */
export default async function Page(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const searchParams = await props.searchParams;
  const address = ADDRESS_RE.test(searchParams.address ?? "") ? (searchParams.address as string) : "";
  const aliases = (searchParams.aliases ?? "")
    .split(",")
    .filter((a) => ADDRESS_RE.test(a))
    .slice(0, 2);
  const { serviceConfig } = getServiceConfig(await headers());
  const org = await getDefaultOrg({ serviceConfig }).catch(() => null);
  const branding = await getBrandingSettings({ serviceConfig, organization: org?.id });

  return (
    <DynamicTheme branding={branding}>
      <SignupDone
        address={address}
        aliases={aliases}
        webmailUrl={process.env.HC_WEBMAIL_URL || "https://mail.holycode.org"}
      />
    </DynamicTheme>
  );
}
