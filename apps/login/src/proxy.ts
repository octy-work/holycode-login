import { NextRequest, NextResponse } from "next/server";
import { buildCSP, daenerysConnectOrigin, TAURI_IPC_ORIGINS } from "./lib/csp";
import { applyCustomHeaders } from "./lib/custom-headers";
import { createLogger } from "./lib/logger";
import { fetchLiveSession, gateReturnTarget, isGatedProfilePath, pickMostRecentSessionCookie } from "./lib/profile-gate";
import { getPublicHost } from "./lib/server/host";
import { getIframeOrigins, resolveAuthToken } from "./lib/server/security-settings";
import { constructUrl, getServiceConfig } from "./lib/service-url";

const logger = createLogger("middleware");

export const config = {
  matcher: ["/.well-known/:path*", "/oauth/:path*", "/oidc/:path*", "/idps/callback/:path*", "/saml/:path*", "/:path*"],
};

export async function proxy(request: NextRequest) {
  // Add the original URL as a header to all requests
  const requestHeaders = new Headers(request.headers);

  // Extract "organization" search param from the URL and set it as a header if available
  const organization = request.nextUrl.searchParams.get("organization");
  if (organization) {
    requestHeaders.set("x-zitadel-i18n-organization", organization);
  }

  // Internal infrastructure routes — skip middleware entirely.
  // /healthy and /ready are Kubernetes/Docker health probes that must respond
  // without depending on a ZITADEL backend.
  const skipPaths = ["/healthy", "/ready"];
  if (skipPaths.includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const { serviceConfig } = getServiceConfig(request.headers);
  const { baseUrl, publicHost, instanceHost } = serviceConfig;

  // HolyCode profile (/me): without a live session answer a real 303 to
  // /me/enter here, before the page streams — a redirect() inside the page
  // lands behind the layout's Suspense boundary and comes out as 200 + a
  // client-side redirect, which curl and link previews never follow.
  if ((request.method === "GET" || request.method === "HEAD") && isGatedProfilePath(request.nextUrl.pathname)) {
    const cookie = pickMostRecentSessionCookie(request.cookies.get("sessions")?.value);
    let live: boolean | null = cookie ? null : false;
    if (cookie) {
      try {
        const token = await resolveAuthToken();
        live = await fetchLiveSession({
          baseUrl,
          token,
          instanceHost,
          publicHost,
          customHeaders: (set, remove) => applyCustomHeaders({ set, remove }),
          cookie,
        });
      } catch (err) {
        logger.warn("Profile gate: could not verify the session, leaving it to the page", {
          error: err instanceof Error ? err.message : String(err),
        });
        live = null;
      }
    }
    if (live === false) {
      // The public origin: the host the person sees and the scheme traefik
      // terminated (x-forwarded-proto), since between the proxy and this
      // container the request is plain http.
      let publicHostName: string | null;
      try {
        publicHostName = getPublicHost(request.headers);
      } catch {
        publicHostName = null;
      }
      const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const protocol = forwardedProto ? `${forwardedProto}:` : request.nextUrl.protocol;
      const publicOrigin = publicHostName ? `${protocol}//${publicHostName}` : "";
      const target = gateReturnTarget(request.nextUrl.pathname, request.headers.get("x-replaced-path"), publicOrigin);
      const enterPath = `/me/enter?to=${encodeURIComponent(target)}`;
      const enter = publicOrigin
        ? `${publicOrigin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${enterPath}`
        : constructUrl(request, enterPath).toString();
      return NextResponse.redirect(enter, { status: 303, headers: { "Cache-Control": "no-store" } });
    }
  }

  // Build CSP headers using security settings fetched directly from the
  // ZITADEL API (no self-loopback through the load balancer).
  const responseHeaders = new Headers();

  const cspFetchEnabled = process.env.CSP_FETCH_ENABLED !== "false";

  // HolyCode: the profile page (/me) fetches Daenerys from the browser (also the public
  // HolyAgent release list), and inside the HolyAgent window talks to the shell over Tauri IPC.
  const connectOrigins = [daenerysConnectOrigin(process.env.NEXT_PUBLIC_DAENERYS_API_URL), ...TAURI_IPC_ORIGINS];

  if (cspFetchEnabled) {
    try {
      const iframeOrigins = await getIframeOrigins(baseUrl, instanceHost, publicHost);

      responseHeaders.set("Content-Security-Policy", buildCSP({ serviceUrl: baseUrl, iframeOrigins, connectOrigins }));

      if (!iframeOrigins) {
        responseHeaders.set("X-Frame-Options", "deny");
      }
    } catch (err) {
      logger.error("Failed to load security settings for CSP, using default CSP", {
        error: err instanceof Error ? err.message : String(err),
      });
      responseHeaders.set("Content-Security-Policy", buildCSP({ serviceUrl: baseUrl, connectOrigins }));
      responseHeaders.set("X-Frame-Options", "deny");
    }
  } else {
    responseHeaders.set("Content-Security-Policy", buildCSP({ serviceUrl: baseUrl, connectOrigins }));
    responseHeaders.set("X-Frame-Options", "deny");
  }

  // Only proxy paths need to be rewritten to the ZITADEL backend
  const proxyPaths = ["/.well-known/", "/oauth/", "/oidc/", "/idps/callback/", "/saml/", "/assets/"];
  const isMatched = proxyPaths.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (!isMatched) {
    return NextResponse.next({
      request: { headers: requestHeaders },
      headers: responseHeaders,
    });
  }

  // Proxy-specific headers
  if (publicHost) {
    requestHeaders.set("x-zitadel-public-host", publicHost);
  }
  if (instanceHost) {
    requestHeaders.set("x-zitadel-instance-host", instanceHost);
  }

  // Apply headers from CUSTOM_REQUEST_HEADERS environment variable
  applyCustomHeaders({
    set: (key, value) => requestHeaders.set(key, value),
    remove: (key) => requestHeaders.delete(key),
  });

  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Headers", "*");

  request.nextUrl.href = `${baseUrl}${request.nextUrl.pathname}${request.nextUrl.search}`;

  return NextResponse.rewrite(request.nextUrl, {
    request: {
      headers: requestHeaders,
    },
    headers: responseHeaders,
  });
}
