import { summarizeAuthMethods } from "@/lib/profile";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ProfileShell } from "./shell";
import { ProfileView } from "./types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useLocale: () => "ru",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("@/components/theme-wrapper", () => ({
  ThemeWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/cookies", () => ({
  setLanguageCookie: vi.fn(),
}));

vi.mock("@/lib/server/profile", () => ({
  beginFlow: vi.fn(),
  beginProviderLink: vi.fn(),
  changeEmail: vi.fn(),
  deletePasskey: vi.fn(),
  disableTotp: vi.fn(),
  saveLanguage: vi.fn(),
  saveName: vi.fn(),
  saveTheme: vi.fn(),
  sendPasswordResetToMe: vi.fn(),
  signOutEverywhere: vi.fn(),
  unlinkProvider: vi.fn(),
}));

/** What production Daenerys answers (shortened), exactly as the security section test uses it. */
const ME = {
  ok: true,
  user: { user_id: "u1", name: "Owner", email: "owner@example.test", username: "owner" },
  accounts: [{ account_id: "org-1", name: "Event74", role: "owner", is_active: true, account_type: "workspace" }],
  active_account_id: "org-1",
  pending_deletion: null,
};
const SESSIONS = {
  ok: true,
  total: 2,
  scope: "owner",
  sessions: [
    {
      session_id: "sess_old",
      current: false,
      source: "auth.oidc",
      issued_at: "2026-09-27T18:47:55.785Z",
      last_seen_at: "2026-09-27T19:12:53.245Z",
      expires_at: "2026-10-27T18:47:56.000Z",
      device: { browser: "", os: "", kind: "unknown" },
      ip: "",
      city: "",
      api_key: null,
    },
    {
      session_id: "sess_now",
      current: true,
      source: "auth.oidc",
      issued_at: "2026-09-27T18:47:56.756Z",
      last_seen_at: "2026-09-27T19:11:22.031Z",
      expires_at: "2026-10-27T18:47:56.000Z",
      device: { browser: "Chrome 152", os: "macOS", kind: "desktop" },
      ip: "212.58.102.61",
      city: "",
      api_key: null,
    },
  ],
};
const ACTIVITY = {
  ok: true,
  entries: [
    {
      at: "2026-09-27T18:53:11.702Z",
      action: "login",
      detail: "HolyCode ID",
      device: { browser: "Safari 18", os: "macOS", kind: "desktop" },
      ip: "212.58.102.61",
      city: "",
      self: true,
    },
  ],
  next_before: "2026-09-27T18:47:55.794Z",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function installFetch() {
  const urls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/api/auth/me")) return json(200, ME);
    if (url.includes("/api/auth/sessions")) return json(200, SESSIONS);
    if (url.includes("/api/auth/activity")) return json(200, ACTIVITY);
    return json(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", impl);
  return urls;
}

function viewAt(prefix: string): ProfileView {
  return {
    section: "security",
    prefix,
    basePath: "/ui/v2/login",
    publicHost: "id.holycode.org",
    user: {
      id: "u1",
      loginName: "owner@example.test",
      username: "owner@example.test",
      handle: "@owner",
      givenName: "Родион",
      familyName: "Отлетов",
      displayName: "Родион",
      fullName: "Родион Отлетов",
      salutation: "Родион",
      email: "owner@example.test",
      emailVerified: true,
      avatarUrl: "",
      preferredLanguage: "",
      organizationId: "org",
    },
    methods: summarizeAuthMethods([1, 3] as never),
    passkeys: [],
    linkedIdps: [],
    availableIdps: [],
    factors: { totp: false, u2f: 0, otpEmail: false, otpSms: false },
    settings: {
      passkeysAllowed: true,
      secondFactors: ["totp"],
      allowExternalIdp: true,
      hidePasswordReset: false,
      allowLocalAuthentication: true,
    },
    recommendations: [],
    theme: null,
    sessionId: "s1",
    daenerysUrl: "",
    links: { services: [], adminUrl: "https://chat.test/admin", mailAdminUrl: "https://chat.test/admin/mail", keysUrl: "" },
  };
}

const navHrefs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-testid=profile-nav] a")).map((a) => a.getAttribute("href"));

describe("the profile at its short public address (traefik rewrite) and at the long one", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  test("/me/security: short links, and the Daenerys blocks load like anywhere else", async () => {
    window.history.replaceState({}, "", "/me/security");
    const urls = installFetch();
    const { container, findByTestId, findAllByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);

    expect(navHrefs(container)).toEqual(["/me", "/me/data", "/me/security", "/me/orgs", "/me/settings"]);
    await findByTestId("session-sess_now");
    expect(await findByTestId("session-sess_old")).toHaveTextContent("security.session.unknownDevice");
    expect(await findAllByTestId("activity-entry")).toHaveLength(1);
    await waitFor(() => expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(0));
    expect(container.querySelectorAll("[data-testid=daenerys-unavailable]")).toHaveLength(0);
    expect(container.querySelector("[data-testid=profile-shell]")?.getAttribute("data-daenerys-status")).toBe("ready");
    expect(container.querySelector("#sessions")?.getAttribute("data-status")).toBe("ready");
    expect(container.querySelector("#activity")?.getAttribute("data-status")).toBe("ready");
    expect(urls.filter((u) => u.includes("/api/auth/me"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/api/auth/sessions"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/api/auth/activity?limit=50"))).toHaveLength(1);
    // no silent sign-in was attempted: the session was there
    expect(window.sessionStorage.getItem("hc_profile_sso_silent")).toBeNull();
  });

  test("/ui/v2/login/me/security: long links, same blocks", async () => {
    window.history.replaceState({}, "", "/ui/v2/login/me/security");
    installFetch();
    const { container, findByTestId, findAllByTestId } = render(
      <ProfileShell view={viewAt("/ui/v2/login/me")} counters={{}} />,
    );

    expect(navHrefs(container)).toEqual([
      "/ui/v2/login/me",
      "/ui/v2/login/me/data",
      "/ui/v2/login/me/security",
      "/ui/v2/login/me/orgs",
      "/ui/v2/login/me/settings",
    ]);
    await findByTestId("session-sess_now");
    expect(await findAllByTestId("activity-entry")).toHaveLength(1);
    await waitFor(() => expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(0));
  });

  test("the browser's address wins over the server's guess of the prefix", async () => {
    // The server saw no x-replaced-path (guessed the long prefix), but the browser is at /me/security.
    window.history.replaceState({}, "", "/me/security");
    installFetch();
    const { container, findByTestId } = render(<ProfileShell view={viewAt("/ui/v2/login/me")} counters={{}} />);
    await waitFor(() => expect(navHrefs(container)[2]).toBe("/me/security"));
    await findByTestId("session-sess_now");
  });
});
