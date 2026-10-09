import { applyCustomHeaders } from "@/lib/custom-headers";
import {
  deviceHandoffClients,
  handoffSessionFromZitadel,
  mintHandoff,
  mintHandoffForSession,
  verifyDeviceIdToken,
} from "@/lib/device-handoff";
import { createLogger } from "@/lib/logger";
import { getServiceConfig } from "@/lib/service-url";
import { getSession, ServiceConfig } from "@/lib/zitadel";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const logger = createLogger("device-handoff");

let keysCache: { at: number; keys: any[] } | null = null;

async function instanceKeys(baseUrl: string, instanceHost?: string, publicHost?: string): Promise<any[]> {
  if (keysCache && Date.now() - keysCache.at < 5 * 60_000) {
    return keysCache.keys;
  }
  const headers = new Headers({ Accept: "application/json" });
  if (instanceHost) headers.set("x-zitadel-instance-host", instanceHost);
  if (publicHost) headers.set("x-zitadel-public-host", publicHost);
  applyCustomHeaders({ set: (k, v) => headers.set(k, v), remove: (k) => headers.delete(k) });
  const response = await fetch(`${baseUrl}/oauth/v2/keys`, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`keys: HTTP ${response.status}`);
  }
  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  keysCache = { at: Date.now(), keys };
  return keys;
}

function handoffUrl(publicHost: string, code: string) {
  return `https://${publicHost}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/me/enter?handoff=${code}`;
}

/**
 * `{ session_id, session_token }` of a Zitadel session the caller holds —
 * Daenerys after a password sign-in it ran through the Session API (the ID
 * session then lives nowhere but in Daenerys, and the app window still needs
 * the cookie). The token is checked by Zitadel itself (GET /v2/sessions with
 * the token), so this grants nothing the caller did not already have.
 */
async function handoffForSession(serviceConfig: ServiceConfig, publicHost: string, sessionId: string, sessionToken: string) {
  let response: Awaited<ReturnType<typeof getSession>> | undefined;
  try {
    response = await getSession({ serviceConfig, sessionId, sessionToken });
  } catch (error) {
    logger.warn("device handoff: session rejected by Zitadel", { error: String(error) });
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }
  const checked = handoffSessionFromZitadel(response?.session, sessionToken);
  if ("error" in checked) {
    logger.warn("device handoff: session not usable", { reason: checked.error });
    return NextResponse.json({ error: "invalid_session", reason: checked.error }, { status: 401 });
  }
  const code = mintHandoffForSession(checked.userId, { ...checked.session, id: sessionId });
  if (!code) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }
  return NextResponse.json({ url: handoffUrl(publicHost, code) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Daenerys asks for a one-time link that gives the app window an ID session
 * (see lib/device-handoff.ts); the answer is `{ url }`. Two proofs:
 * `{ id_token }` of the device client, finishing a device sign-in — the
 * session the person just approved with (404 when there is none); or
 * `{ session_id, session_token }` of a Zitadel session the caller holds
 * (password sign-in through Daenerys).
 */
export async function POST(request: NextRequest) {
  const clientIds = deviceHandoffClients();
  if (!clientIds.length) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { serviceConfig } = getServiceConfig(request.headers);
  const publicHost = serviceConfig.publicHost;
  if (!serviceConfig.baseUrl || !publicHost) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const sessionId = String(body?.session_id || "").trim();
  const sessionToken = String(body?.session_token || "").trim();
  if (sessionId || sessionToken) {
    if (!sessionId || !sessionToken || sessionId.length > 200 || sessionToken.length > 1024) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    return handoffForSession(serviceConfig, publicHost, sessionId, sessionToken);
  }

  const idToken = String(body?.id_token || "");

  let keys: any[];
  try {
    keys = await instanceKeys(serviceConfig.baseUrl, serviceConfig.instanceHost, publicHost);
  } catch (error) {
    logger.warn("device handoff: keys unavailable", { error: String(error) });
    return NextResponse.json({ error: "keys_unavailable" }, { status: 503 });
  }
  let checked = verifyDeviceIdToken(idToken, { issuer: `https://${publicHost}`, clientIds, keys });
  if ("error" in checked && checked.error === "key") {
    keysCache = null; // rotated keys
    keys = await instanceKeys(serviceConfig.baseUrl, serviceConfig.instanceHost, publicHost).catch(() => []);
    checked = verifyDeviceIdToken(idToken, { issuer: `https://${publicHost}`, clientIds, keys });
  }
  if ("error" in checked) {
    logger.warn("device handoff: id_token rejected", { reason: checked.error });
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const code = mintHandoff(checked.sub);
  if (!code) {
    return NextResponse.json({ error: "no_approval" }, { status: 404 });
  }
  return NextResponse.json({ url: handoffUrl(publicHost, code) }, { headers: { "Cache-Control": "no-store" } });
}
