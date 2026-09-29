import { AppEmblem } from "@/components/brand-mark";
import { ConsentScreen } from "@/components/consent";
import { DynamicTheme } from "@/components/dynamic-theme";
import { Translated } from "@/components/translated";
import { findDeviceSession } from "@/lib/device-session";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getDefaultOrg, getDeviceAuthorizationRequest } from "@/lib/zitadel";
import { Organization } from "@zitadel/proto/zitadel/org/v2/org_pb";
import { headers } from "next/headers";

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const searchParams = await props.searchParams;

  const userCode = searchParams?.user_code;
  const requestId = searchParams?.requestId;
  const organization = searchParams?.organization;

  if (!userCode || !requestId) {
    return (
      <div>
        <Translated i18nKey="noUserCode" namespace="error" />
      </div>
    );
  }

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);

  const { deviceAuthorizationRequest } = await getDeviceAuthorizationRequest({ serviceConfig, userCode });

  if (!deviceAuthorizationRequest) {
    return (
      <div>
        <Translated i18nKey="noDeviceRequest" namespace="error" />
      </div>
    );
  }

  let defaultOrganization;
  if (!organization) {
    const org: Organization | null = await getDefaultOrg({ serviceConfig });
    if (org) {
      defaultOrganization = org.id;
    }
  }

  const branding = await getBrandingSettings({ serviceConfig, organization: organization ?? defaultOrganization });

  const params = new URLSearchParams();

  if (requestId) {
    params.append("requestId", requestId);
  }

  if (organization) {
    params.append("organization", organization);
  }

  // Signed in already → one "Allow" with that session; otherwise sign in first, and
  // /signedin finishes the request (no second confirmation).
  const session = await findDeviceSession(serviceConfig);
  const user = session?.factors?.user;

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-3">
        <div className="bg-hc-input border-hc-input-border flex items-center gap-3 rounded-[14px] border p-3 text-left">
          <AppEmblem branding={branding} className="h-[42px] w-[42px] shrink-0 rounded-[11px]" />
          <div className="min-w-0">
            <div className="text-hc-text truncate text-[15px] leading-tight font-semibold">
              <Translated
                i18nKey="confirm.title"
                namespace="device"
                data={{ appName: deviceAuthorizationRequest?.appName }}
              />
            </div>
            <div className="text-hc-muted mt-0.5 text-[12.5px]">
              <Translated i18nKey="confirm.subtitle" namespace="device" />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full">
        <ConsentScreen
          deviceAuthorizationRequestId={deviceAuthorizationRequest?.id}
          appName={deviceAuthorizationRequest?.appName}
          userCode={userCode}
          session={
            session && user
              ? { id: session.id, displayName: user.displayName || user.loginName, loginName: user.loginName }
              : undefined
          }
          loginUrl={`/loginname?` + params}
        />
      </div>
    </DynamicTheme>
  );
}
