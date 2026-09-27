import { summarizeAuthMethods } from "@/lib/profile";
import { fallbackServices } from "@/lib/services";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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

/** GET /api/services as production Daenerys answers an owner: the panel is in the list. */
const SERVICES_OWNER = {
  ok: true,
  services: [
    { key: "chat", name: "HolyCode", url: "https://chat.holycode.org", icon: "chat", kind: "app", visible: true },
    { key: "build", name: "HolyBuild", url: "https://build.holycode.org", icon: "build", kind: "app", visible: true },
    { key: "agent", name: "HolyAgent", url: "https://agent.holycode.org", icon: "agent", kind: "app", visible: true },
    { key: "panel", name: "Панель", url: "https://daenerys.holycode.org", icon: "panel", kind: "app", visible: true },
    { key: "profile", name: "Профиль", url: "https://id.holycode.org/me", icon: "profile", kind: "profile", visible: true },
    { key: "mail", name: "Почта", url: "https://mail.holycode.org", icon: "mail", kind: "mail", visible: true },
  ],
  org: { account_id: "org-1", name: "Event74", role: "owner" },
};
/** The same for a member: no panel, and the role does not open the admin. */
const SERVICES_MEMBER = {
  ...SERVICES_OWNER,
  services: SERVICES_OWNER.services.filter((s) => s.key !== "panel"),
  org: { account_id: "org-1", name: "Event74", role: "member" },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function installFetch(services: Response | (() => Response) = () => json(404, { error: "not_found" })) {
  const urls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/api/auth/me")) return json(200, ME);
    if (url.includes("/api/auth/sessions")) return json(200, SESSIONS);
    if (url.includes("/api/auth/activity")) return json(200, ACTIVITY);
    if (url.endsWith("/api/services")) return typeof services === "function" ? services() : services;
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
    links: {
      services: fallbackServices(""),
      adminUrl: "https://chat.test/admin",
      mailAdminUrl: "https://chat.test/admin/mail",
      keysUrl: "",
    },
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
    const { container, findByTestId, findAllByTestId, getByTestId } = render(
      <ProfileShell view={viewAt("/me")} counters={{}} />,
    );

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
    expect(urls.filter((u) => u.endsWith("/api/services"))).toHaveLength(1);
    // no silent sign-in was attempted: the session was there
    expect(window.sessionStorage.getItem("hc_profile_sso_silent")).toBeNull();

    // the directory route is not there (404): the switcher shows the fallback — no panel, no admin,
    // but the links still carry the active organization of the session and the way back
    await waitFor(() =>
      expect(container.querySelector("[data-testid=profile-shell]")?.getAttribute("data-services-source")).toBe("fallback"),
    );
    expect(container.querySelector("nav[aria-label=HolyCode]")).toBeNull();
    fireEvent.click(getByTestId("service-switcher-trigger"));
    const keys = Array.from(container.querySelectorAll("[data-testid^=service-tile-]")).map((el) =>
      el.getAttribute("data-service"),
    );
    expect(keys).toEqual(["chat", "build", "agent", "profile", "mail"]);
    const chat = new URL(getByTestId("service-tile-chat").getAttribute("href")!);
    expect(chat.origin).toBe("https://chat.holycode.org");
    expect(chat.searchParams.get("org")).toBe("org-1");
    expect(chat.searchParams.get("return_to")).toBe(window.location.href);
    expect(container.querySelector("[data-testid=service-menu-admin]")).not.toBeNull(); // owner of org-1 by the session
    expect(getByTestId("service-menu-prefs")).toHaveAttribute("href", "/me/settings");
    expect(getByTestId("service-menu-prefs")).toHaveTextContent("switcher.theme.system · RU");
  });

  test("the directory from Daenerys: an owner gets the panel tile and the admin row, in the switcher and in the avatar menu", async () => {
    window.history.replaceState({}, "", "/me/security");
    installFetch(json(200, SERVICES_OWNER));
    const { container, getByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    await waitFor(() =>
      expect(container.querySelector("[data-testid=profile-shell]")?.getAttribute("data-services-source")).toBe("server"),
    );
    fireEvent.click(getByTestId("service-switcher-trigger"));
    expect(getByTestId("service-menu")).toHaveTextContent("title · Event74");
    const panel = getByTestId("service-tile-panel");
    const href = new URL(panel.getAttribute("href")!);
    expect(href.origin).toBe("https://daenerys.holycode.org");
    expect(href.searchParams.get("org")).toBe("org-1");
    expect(getByTestId("service-tile-profile")).toHaveAttribute("aria-current", "page");
    const admin = new URL(getByTestId("service-menu-admin").getAttribute("href")!);
    expect(admin.origin + admin.pathname).toBe("https://chat.test/admin");
    expect(admin.searchParams.get("org")).toBe("org-1");

    // the phone: the avatar opens a menu with the same services
    fireEvent.click(getByTestId("avatar-menu-trigger"));
    const links = Array.from(container.querySelectorAll("[data-testid^=service-link-]")).map((el) =>
      el.getAttribute("data-service"),
    );
    expect(links).toEqual(["chat", "build", "agent", "panel", "profile", "mail", "admin"]);
    expect(getByTestId("avatar-menu-data")).toHaveAttribute("href", "/me/data");
    expect(getByTestId("avatar-menu-switch-user")).toHaveAttribute("href", "/accounts");
  });

  test("the directory from Daenerys: a member gets neither the panel nor the admin", async () => {
    window.history.replaceState({}, "", "/me/security");
    installFetch(json(200, SERVICES_MEMBER));
    const { container, getByTestId, queryByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    await waitFor(() =>
      expect(container.querySelector("[data-testid=profile-shell]")?.getAttribute("data-services-source")).toBe("server"),
    );
    fireEvent.click(getByTestId("service-switcher-trigger"));
    expect(queryByTestId("service-tile-panel")).toBeNull();
    expect(queryByTestId("service-menu-admin")).toBeNull();
    expect(getByTestId("service-tile-build")).toHaveAttribute("href", expect.stringContaining("org=org-1"));
    fireEvent.click(getByTestId("avatar-menu-trigger"));
    expect(queryByTestId("service-link-panel")).toBeNull();
    expect(queryByTestId("service-link-admin")).toBeNull();
  });

  test("no Daenerys session at all (401 everywhere): the fallback list, without an organization in the links", async () => {
    window.history.replaceState({}, "", "/me/security?sso_error=login_required");
    const impl = vi.fn(async () => json(401, { error: "unauthorized" }));
    vi.stubGlobal("fetch", impl);
    const { container, getByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    await waitFor(() =>
      expect(container.querySelector("[data-testid=profile-shell]")?.getAttribute("data-daenerys-status")).toBe(
        "unauthorized",
      ),
    );
    expect(container.querySelector("[data-testid=profile-shell]")?.getAttribute("data-services-source")).toBe("fallback");
    fireEvent.click(getByTestId("service-switcher-trigger"));
    const chat = new URL(getByTestId("service-tile-chat").getAttribute("href")!);
    expect(chat.searchParams.get("org")).toBeNull();
    expect(chat.searchParams.get("return_to")).toBe(window.location.href);
    expect(container.querySelector("[data-testid=service-tile-panel]")).toBeNull();
    expect(container.querySelector("[data-testid=service-menu-admin]")).toBeNull();
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
