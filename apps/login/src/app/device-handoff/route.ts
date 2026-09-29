import { applyCustomHeaders } from "@/lib/custom-headers";
import { deviceHandoffClients, mintHandoff, verifyDeviceIdToken } from "@/lib/device-handoff";
import { createLogger } from "@/lib/logger";
import { getServiceConfig } from "@/lib/service-url";
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

/**
 * Daenerys, finishing a device sign-in: `{ id_token }` of the device client →
 * `{ url }`, a one-time link that gives the app window the ID session the
 * person approved with (see lib/device-handoff.ts). 404 when there is none.
 */
export async function POST(request: NextRequest) {
  const clientIds = deviceHandoffClients();
  if (!clientIds.length) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  let idToken = "";
  try {
    idToken = String((await request.json())?.id_token || "");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { serviceConfig } = getServiceConfig(request.headers);
  const publicHost = serviceConfig.publicHost;
  if (!serviceConfig.baseUrl || !publicHost) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

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
  const url = `https://${publicHost}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/me/enter?handoff=${code}`;
  return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
}
