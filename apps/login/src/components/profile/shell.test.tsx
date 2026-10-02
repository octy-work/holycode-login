import { resetHolyAgentReleaseWatch } from "@/lib/holyagent-release";
import { RELEASES } from "@/lib/holyagent-release.fixture";
import { summarizeAuthMethods } from "@/lib/profile";
import { fallbackServices } from "@/lib/services";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ProfileShell } from "./shell";
import { PROFILE_NAV_COLLAPSED_KEY } from "./sidebar";
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
    { key: "panel", name: "Daenerys", url: "https://daenerys.holycode.org", icon: "panel", kind: "app", visible: true },
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

function installFetch(
  services: Response | (() => Response) = () => json(404, { error: "not_found" }),
  releases: () => Response = () => json(404, { error: "not_found" }),
) {
  const urls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/api/auth/me")) return json(200, ME);
    if (url.includes("/api/auth/sessions")) return json(200, SESSIONS);
    if (url.includes("/api/auth/activity")) return json(200, ACTIVITY);
    if (url.endsWith("/api/services")) return typeof services === "function" ? services() : services;
    if (url.includes("/api/releases/public")) return releases();
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
const barHrefs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-testid=mobile-nav] a")).map((a) => a.getAttribute("href"));

describe("the profile at its short public address (traefik rewrite) and at the long one", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetHolyAgentReleaseWatch();
    window.history.replaceState({}, "", "/");
  });

  test("/me/security: short links, and the Daenerys blocks load like anywhere else", async () => {
    window.history.replaceState({}, "", "/me/security");
    const urls = installFetch();
    const { container, findByTestId, findAllByTestId, getByTestId } = render(
      <ProfileShell view={viewAt("/me")} counters={{}} />,
    );

    expect(navHrefs(container)).toEqual(["/me", "/me/data", "/me/security", "/me/keys", "/me/orgs", "/me/settings"]);
    expect(barHrefs(container)).toEqual(["/me", "/me/data", "/me/security", "/me/orgs"]);
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

  test("the directory from Daenerys: an owner gets the panel tile and the admin row, in the switcher and in the phone's sheet", async () => {
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

    fireEvent.keyDown(window, { key: "Escape" });

    // the phone: the bottom bar's "Services" opens the sheet with the same services
    fireEvent.click(getByTestId("mobile-nav-services"));
    const sheetTiles = Array.from(container.querySelectorAll("[data-testid^=sheet-tile-]")).map((el) =>
      el.getAttribute("data-service"),
    );
    expect(sheetTiles).toEqual(["chat", "build", "agent", "panel", "profile", "mail", "admin"]);
    expect(getByTestId("sheet-tile-profile")).toHaveAttribute("aria-current", "page");
    expect(getByTestId("services-sheet")).toHaveTextContent("title · Event74");
    expect(getByTestId("sheet-account-org")).toHaveTextContent("Event74");
    expect(getByTestId("sheet-account-data")).toHaveAttribute("href", "/me/data");
    expect(getByTestId("sheet-switch-user")).toHaveAttribute("href", "/ui/v2/login/accounts");
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
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(getByTestId("mobile-nav-services"));
    expect(getByTestId("services-sheet")).toBeInTheDocument();
    expect(queryByTestId("sheet-tile-panel")).toBeNull();
    expect(queryByTestId("sheet-tile-admin")).toBeNull();
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
      "/ui/v2/login/me/keys",
      "/ui/v2/login/me/orgs",
      "/ui/v2/login/me/settings",
    ]);
    expect(barHrefs(container)).toEqual([
      "/ui/v2/login/me",
      "/ui/v2/login/me/data",
      "/ui/v2/login/me/security",
      "/ui/v2/login/me/orgs",
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

describe("the common top bar (owner's decision of 02.10.2026, option A)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetHolyAgentReleaseWatch();
    delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
    window.history.replaceState({}, "", "/");
  });

  test("left: the grid, the mark and «Profile»; right: the avatar — no cloud in a browser", async () => {
    window.history.replaceState({}, "", "/me/security");
    installFetch(json(200, SERVICES_OWNER), () => json(200, RELEASES));
    const { getByTestId, queryByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    const bar = getByTestId("profile-topbar");
    expect(bar).toHaveAttribute("role", "banner");
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("md:h-[52px]");
    const order = Array.from(bar.querySelectorAll("[data-testid]")).map((el) => el.getAttribute("data-testid"));
    expect(order.indexOf("service-switcher")).toBeLessThan(order.indexOf("topbar-brand"));
    expect(order.indexOf("topbar-brand")).toBeLessThan(order.indexOf("account-menu"));
    expect(getByTestId("topbar-brand")).toHaveAttribute("href", "/me");
    expect(getByTestId("app-title")).toHaveTextContent("name");
    expect(queryByTestId("service-back-link")).toBeNull(); // opened directly, no return_to
    await waitFor(() => expect(getByTestId("profile-shell").getAttribute("data-services-source")).toBe("server"));
    expect(queryByTestId("topbar-holyagent-update")).toBeNull();
  });

  test("the avatar menu: the profile's sections, «Download HolyAgent» with the DMG, switch user and sign out", async () => {
    window.history.replaceState({}, "", "/me/security");
    const urls = installFetch(undefined, () => json(200, RELEASES));
    const { getByTestId, container } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    await waitFor(() =>
      expect(
        urls.some((u) => u.startsWith("https://daenerys-api.holycode.org/api/releases/public?app_id=com.holyagent.desktop")),
      ).toBe(true),
    );
    // no 2FA (password + provider only): the yellow dot on the avatar and the pill on the row
    expect(getByTestId("avatar-attention")).toBeInTheDocument();
    fireEvent.click(getByTestId("avatar-menu-trigger"));
    expect(getByTestId("user-menu-name")).toHaveTextContent("Родион Отлетов");
    expect(getByTestId("user-menu")).toHaveTextContent("@owner · owner@example.test");
    expect(getByTestId("user-menu-profile")).toHaveAttribute("href", "/me");
    expect(getByTestId("user-menu-security")).toHaveAttribute("href", "/me/security");
    expect(getByTestId("user-menu-security")).toHaveTextContent("attention.no_2fa");
    expect(getByTestId("user-menu-keys")).toHaveAttribute("href", "/me/keys");
    expect(getByTestId("user-menu-settings")).toHaveAttribute("href", "/me/settings");
    expect(getByTestId("user-menu-switch-user")).toHaveAttribute("href", "/ui/v2/login/accounts");
    expect(getByTestId("user-menu-sign-out")).toHaveAttribute("href", "/ui/v2/login/logout");
    await waitFor(() => expect(getByTestId("user-menu-holyagent")).toHaveAttribute("data-state", "download"));
    const agent = getByTestId("user-menu-holyagent");
    expect(agent).toHaveAttribute("href", "https://daenerys.holycode.org/api/updates/download/desktop-release-0.1.864.dmg");
    expect(agent).toHaveAttribute("target", "_blank");
    expect(agent).toHaveTextContent("holyagent.download");
    expect(agent).toHaveTextContent("holyagent.downloadSub:0.1.864,?");
    const rows = Array.from(container.querySelectorAll("[data-testid=user-menu] [data-testid^=user-menu-]")).map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(rows).toEqual([
      "user-menu-name",
      "user-menu-profile",
      "user-menu-security",
      "user-menu-keys",
      "user-menu-settings",
      "user-menu-holyagent",
      "user-menu-switch-user",
      "user-menu-sign-out",
    ]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector("[data-testid=user-menu]")).toBeNull();
  });

  test("inside the HolyAgent shell with an older version: the cloud in the bar and the update first in the menu", async () => {
    window.history.replaceState({}, "", "/me");
    installFetch(undefined, () => json(200, RELEASES));
    const invoke = vi.fn(async (cmd: string) => {
      if (cmd === "desktop_get_app_version") return "0.1.858";
      if (cmd === "desktop_install_update") return { started: true };
      return null;
    });
    (window as Window & { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
    const { findByTestId, getByTestId, container } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    const cloud = await findByTestId("topbar-holyagent-update");
    expect(cloud).toHaveAttribute("data-state", "update");
    expect(cloud).toHaveAttribute("aria-label", "holyagent.update:0.1.864,0.1.858");
    fireEvent.click(getByTestId("avatar-menu-trigger"));
    const first = container.querySelector("[data-testid=user-menu] [role=menuitem]");
    expect(first).toHaveAttribute("data-testid", "user-menu-holyagent");
    expect(first).toHaveAttribute("data-state", "update");
    expect(first).not.toHaveAttribute("href");
    fireEvent.click(cloud);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("desktop_install_update", {
        url: "https://daenerys.holycode.org/api/updates/download/desktop-release-0.1.864.app.zip",
        version: "0.1.864",
      }),
    );
  });

  test("the same version inside the shell: no cloud, no HolyAgent row", async () => {
    window.history.replaceState({}, "", "/me");
    installFetch(undefined, () => json(200, RELEASES));
    const invoke = vi.fn(async (cmd: string) => (cmd === "desktop_get_app_version" ? "0.1.864" : null));
    (window as Window & { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
    const { getByTestId, queryByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("desktop_get_app_version", undefined));
    fireEvent.click(getByTestId("avatar-menu-trigger"));
    await waitFor(() => expect(getByTestId("user-menu-profile")).toBeInTheDocument());
    expect(queryByTestId("topbar-holyagent-update")).toBeNull();
    expect(queryByTestId("user-menu-holyagent")).toBeNull();
  });

  test("«← Back to HolyBuild» by return_to: kept for the tab, removed from the address, not nested into the tiles", async () => {
    window.history.replaceState({}, "", "/me/security?return_to=" + encodeURIComponent("https://build.holycode.org/board"));
    installFetch(json(200, SERVICES_OWNER));
    const { findByTestId, getByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    const back = await findByTestId("service-back-link");
    expect(back).toHaveAttribute("href", "https://build.holycode.org/board");
    expect(back).toHaveTextContent("topbar.backTo:HolyBuild");
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem("hc_profile_return_to")).toBe("https://build.holycode.org/board");
    fireEvent.click(getByTestId("service-switcher-trigger"));
    const chat = new URL(getByTestId("service-tile-chat").getAttribute("href")!);
    expect(chat.searchParams.get("return_to")).toBe(window.location.href);
    expect(chat.searchParams.get("return_to")).not.toContain("return_to");
    cleanup();

    // the next section is a full page load without the parameter: the way back stays
    window.history.replaceState({}, "", "/me/keys");
    const again = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    expect(await again.findByTestId("service-back-link")).toHaveAttribute("href", "https://build.holycode.org/board");
  });

  test("return_to from a foreign domain gives no back link", async () => {
    window.history.replaceState({}, "", "/me?return_to=" + encodeURIComponent("https://evil.example/"));
    installFetch();
    const { getByTestId, queryByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    await waitFor(() => expect(getByTestId("profile-shell").getAttribute("data-daenerys-status")).toBe("ready"));
    expect(queryByTestId("service-back-link")).toBeNull();
  });
});

describe("the sidebar at the left edge (owner's decision of 02.10.2026, as in HolyAgent and Daenerys)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetHolyAgentReleaseWatch();
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
  });

  test("the sidebar is the shell's first child, beside the content — not inside the centered column", async () => {
    window.history.replaceState({}, "", "/me/security");
    installFetch();
    const { getByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{ security: 2 }} />);
    const shell = getByTestId("profile-shell");
    const sidebar = getByTestId("profile-sidebar");
    const content = getByTestId("profile-content");

    // the shell fills the viewport under the 52 px bar on wide screens, the two side by side
    expect(shell.className).toContain("md:fixed");
    expect(shell.className).toContain("md:top-[52px]");
    expect(shell.className).toContain("md:flex");
    expect(shell.firstElementChild).toBe(sidebar);
    expect(sidebar.nextElementSibling).toBe(content);
    // the 980 px column and its own scroll are on the right only
    expect(content.className).toContain("md:overflow-y-auto");
    expect(content.querySelector(".max-w-\\[980px\\]")).not.toBeNull();
    expect(sidebar.closest(".max-w-\\[980px\\]")).toBeNull();
    expect(sidebar.closest(".mx-auto")).toBeNull();
    // 240 px for the whole height, hidden on phones (the bottom bar is there)
    expect(sidebar.className).toContain("w-60");
    expect(sidebar.className).toContain("h-full");
    expect(sidebar.className).toContain("hidden");
    expect(sidebar.className).toContain("md:flex");
    expect(sidebar.className).toContain("hc-sidenav");
    expect(getByTestId("profile-nav")).toHaveTextContent("title");
    expect(getByTestId("profile-nav-security")).toHaveTextContent("2");
    await waitFor(() => expect(shell.getAttribute("data-daenerys-status")).toBe("ready"));
  });

  test("the active item is the common filled frame — no side stripe", async () => {
    window.history.replaceState({}, "", "/me/security");
    installFetch();
    const { getByTestId } = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    const active = getByTestId("profile-nav-security");
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("hc-sidenav-item");
    // the old marker was shadow-[inset_2px_0_0_var(--hc-p500)]
    expect(active.className).not.toMatch(/inset_\d|border-l|before:/);
    for (const s of ["home", "data", "keys", "orgs", "settings"]) {
      expect(getByTestId(`profile-nav-${s}`)).not.toHaveAttribute("aria-current");
      expect(getByTestId(`profile-nav-${s}`).className).toContain("hc-sidenav-item");
    }
    await waitFor(() => expect(getByTestId("profile-shell").getAttribute("data-daenerys-status")).toBe("ready"));
  });

  test("the styles: the reference numbers of HolyAgent/Daenerys, light and dark, without a stripe", () => {
    const scss = readFileSync(resolve(__dirname, "../../styles/globals.scss"), "utf8");
    const rule = (selector: string) => {
      const at = scss.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThanOrEqual(0);
      return scss.slice(at, scss.indexOf("}", at)).replace(/\s+/g, " ");
    };
    const item = rule(".hc-sidenav-item");
    expect(item).toContain("border: 1px solid transparent");
    expect(item).toContain("border-radius: 0.9rem");
    expect(item).toContain("padding: 0.72rem 0.8rem");
    expect(item).toContain("gap: 0.75rem");

    const dark = rule('.dark .hc-sidenav-item[aria-current="page"]');
    expect(dark).toContain("color: #fff");
    expect(dark).toContain("border-color: rgba(124, 58, 237, 0.34)");
    expect(dark).toContain("linear-gradient(135deg, rgba(56, 189, 248, 0.14), rgba(124, 58, 237, 0.22))");
    expect(dark).toContain("inset 0 0 0 1px rgba(124, 58, 237, 0.18), 0 14px 30px rgba(6, 11, 30, 0.22)");

    const light = rule('.hc-sidenav-item[aria-current="page"]');
    expect(light).toContain("color: #4c1d95");
    expect(light).toContain("border-color: rgba(124, 58, 237, 0.35)");
    expect(light).toContain("linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(124, 58, 237, 0.16))");
    expect(light).toContain("inset 0 0 0 1px rgba(124, 58, 237, 0.12)");

    for (const r of [item, dark, light]) {
      // a stripe would be a one-sided border, a pseudo-element or an offset inset shadow
      expect(r).not.toMatch(/border-left|inset \d+px 0 0|inset [1-9]/);
    }
    expect(scss).not.toMatch(/hc-sidenav-item[^{]*::?before/);

    const sidebarDark = rule(".dark .hc-sidenav");
    expect(sidebarDark).toContain("radial-gradient(circle at top left, rgba(124, 58, 237, 0.16), transparent 34%)");
    expect(sidebarDark).toContain("linear-gradient(180deg, rgba(18, 18, 40, 0.98) 0%, rgba(12, 12, 28, 1) 100%)");
    expect(rule(".hc-sidenav")).toContain("border-right: 1px solid var(--hc-border)");
  });

  test("collapse to icons with «‹‹» at the bottom; the choice is kept in localStorage", async () => {
    window.history.replaceState({}, "", "/me/security");
    installFetch();
    const first = render(<ProfileShell view={viewAt("/me")} counters={{ security: 1 }} />);
    const toggle = first.getByTestId("profile-sidebar-toggle");
    expect(first.getByTestId("profile-sidebar")).toHaveAttribute("data-collapsed", "false");
    expect(toggle).toHaveAttribute("aria-label", "nav.collapse");
    // the toggle is the sidebar's last block, below the items
    expect(first.getByTestId("profile-sidebar").lastElementChild?.contains(toggle)).toBe(true);

    fireEvent.click(toggle);
    const sidebar = first.getByTestId("profile-sidebar");
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(sidebar.className).toContain("w-16");
    expect(window.localStorage.getItem(PROFILE_NAV_COLLAPSED_KEY)).toBe("1");
    // icons only: the label becomes the item's tooltip, the counter a dot
    const security = first.getByTestId("profile-nav-security");
    expect(security.querySelector("[data-i18n-key]")).toBeNull();
    expect(security).toHaveAttribute("title", "nav.security (1)");
    expect(first.getByTestId("profile-nav")).not.toHaveTextContent("title");
    expect(first.getByTestId("profile-sidebar-toggle")).toHaveAttribute("aria-label", "nav.expand");
    await waitFor(() => expect(first.getByTestId("profile-shell").getAttribute("data-daenerys-status")).toBe("ready"));
    first.unmount();

    // the next page load starts collapsed
    installFetch();
    const second = render(<ProfileShell view={viewAt("/me")} counters={{}} />);
    await waitFor(() => expect(second.getByTestId("profile-sidebar")).toHaveAttribute("data-collapsed", "true"));
    fireEvent.click(second.getByTestId("profile-sidebar-toggle"));
    expect(second.getByTestId("profile-sidebar")).toHaveAttribute("data-collapsed", "false");
    expect(window.localStorage.getItem(PROFILE_NAV_COLLAPSED_KEY)).toBe("0");
    await waitFor(() => expect(second.getByTestId("profile-shell").getAttribute("data-daenerys-status")).toBe("ready"));
  });
});
