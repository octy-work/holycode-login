import { DeviceCodeForm } from "@/components/device-code-form";
import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { normalizeUserCode } from "@/lib/device-code";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getDefaultOrg, getDeviceAuthorizationRequest } from "@/lib/zitadel";
import { Organization } from "@zitadel/proto/zitadel/org/v2/org_pb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("device");
  return { title: t("usercode.title") };
}

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;

  const userCode = searchParams?.user_code;
  const organization = searchParams?.organization;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  // The app opens verification_uri_complete (?user_code=…): no code form, straight to
  // the confirmation. A wrong or expired code falls back to the form with a message.
  let codeNotFound = false;
  if (userCode) {
    const code = normalizeUserCode(userCode);
    const found = await getDeviceAuthorizationRequest({ serviceConfig, userCode: code }).catch(() => undefined);
    const id = found?.deviceAuthorizationRequest?.id;
    if (id) {
      const params = new URLSearchParams({ requestId: `device_${id}`, user_code: code });
      if (organization) {
        params.set("organization", organization);
      }
      redirect(`/device/consent?${params}`);
    }
    codeNotFound = true;
  }

  let defaultOrganization;
  if (!organization) {
    const org: Organization | null = await getDefaultOrg({ serviceConfig });
    if (org) {
      defaultOrganization = org.id;
    }
  }

  const branding = await getBrandingSettings({ serviceConfig, organization: organization ?? defaultOrganization });

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="usercode.title" namespace="device" />
        </h1>
        <p className="ztdl-p">
          <Translated i18nKey="usercode.description" namespace="device" />
        </p>
      </div>

      <div className="w-full">
        <DeviceCodeForm userCode={userCode} codeNotFound={codeNotFound}></DeviceCodeForm>
      </div>
    </DynamicTheme>
  );
}
