import { isProfileReturnTarget, PROFILE_SHORT_PREFIX } from "@/lib/profile";
import { getPublicHost } from "@/lib/server/host";
import { rememberReturnTo } from "@/lib/server/return-to";
import { constructUrl } from "@/lib/service-url";
import { NextRequest, NextResponse } from "next/server";

/**
 * HolyCode profile without a live session: remember where to come back to
 * (`to` — the profile on this host, validated) and go to the sign-in screen.
 * A route handler, because rendering the profile page cannot set cookies.
 */
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("to") ?? PROFILE_SHORT_PREFIX;
  let publicHost: string | undefined;
  try {
    publicHost = getPublicHost(request.headers);
  } catch {
    publicHost = undefined;
  }
  const target = isProfileReturnTarget(requested, publicHost) ? requested : PROFILE_SHORT_PREFIX;
  await rememberReturnTo(target, publicHost);

  const params = new URLSearchParams();
  const loginHint = request.nextUrl.searchParams.get("loginName");
  if (loginHint) {
    params.set("loginName", loginHint);
  }
  const query = params.toString();
  return NextResponse.redirect(constructUrl(request, `/loginname${query ? `?${query}` : ""}`), { status: 303 });
}
