/**
 * HolyCode one-screen sign-in: e-mail and password live on /loginname together.
 *
 * The login-name step (sendLoginname) still answers with the upstream next step —
 * "/password?…" or "/passkey?…" — and these helpers turn such an answer into what
 * the one screen does instead: ask for the password right there, or offer the
 * passkey button, or open the one screen prefilled.
 */

const BASE = "http://one-screen.local";

export type LoginStep = { path: "/password" | "/passkey"; params: URLSearchParams };

/** The upstream password/passkey step behind a relative redirect, or null for anything else. */
export function parseLoginStep(redirect: string | undefined): LoginStep | null {
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(redirect, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) {
    return null;
  }
  if (url.pathname === "/password" || url.pathname === "/passkey") {
    return { path: url.pathname, params: url.searchParams };
  }
  return null;
}

/**
 * "/password?loginName=…&requestId=…&organization=…" → the same parameters on the
 * one screen ("/loginname?…"), where the password field then gets the focus.
 * Any other redirect is returned unchanged.
 */
export function passwordStepToSignInScreen(redirect: string): string {
  const step = parseLoginStep(redirect);
  if (!step || step.path !== "/password") {
    return redirect;
  }
  const params = new URLSearchParams();
  for (const key of ["loginName", "requestId", "organization"]) {
    const value = step.params.get(key);
    if (value) {
      params.set(key, value);
    }
  }
  return "/loginname?" + params;
}
