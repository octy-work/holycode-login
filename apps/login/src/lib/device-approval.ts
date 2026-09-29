import { rememberDeviceApproval } from "@/lib/device-handoff";
import { getSession, ServiceConfig } from "@/lib/zitadel";

type CookieLike = {
  id: string;
  token: string;
  loginName: string;
  organization?: string;
  creationTs: string;
  expirationTs: string;
  changeTs: string;
};

/** After a device request was approved with this browser session: note it for the app window's handoff. */
export async function rememberApprovalForCookie(serviceConfig: ServiceConfig, cookie: CookieLike, userId?: string) {
  let id = userId;
  if (!id) {
    const current = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token }).catch(
      () => undefined,
    );
    id = current?.session?.factors?.user?.id;
  }
  if (!id) return;
  const { id: sessionId, token, loginName, organization, creationTs, expirationTs, changeTs } = cookie;
  rememberDeviceApproval(id, { id: sessionId, token, loginName, organization, creationTs, expirationTs, changeTs });
}
