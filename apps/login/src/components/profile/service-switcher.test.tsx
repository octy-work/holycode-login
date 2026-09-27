import { fallbackServices, ServiceEntry } from "@/lib/services";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ServiceLinks, ServiceSwitcher } from "./service-switcher";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ru",
}));

const PROFILE = "https://id.holycode.org/me/security";
const ORG = { account_id: "acct-event74", name: "Event74", role: "owner" };

/** What production Daenerys answers an owner (the panel is in the list) and a member (it is not). */
const OWNER_SERVICES: ServiceEntry[] = [
  { key: "chat", name: "HolyCode", url: "https://chat.holycode.org/", icon: "chat", kind: "app" },
  {
    key: "build",
    name: "HolyBuild",
    url: "https://build.holycode.org/",
    icon: "build",
    kind: "app",
    status: { text: "3 сборки идут" },
  },
  { key: "agent", name: "HolyAgent", url: "https://agent.holycode.org/", icon: "agent", kind: "app" },
  { key: "panel", name: "Панель", url: "https://daenerys.holycode.org/", icon: "panel", kind: "app" },
  { key: "profile", name: "Профиль", url: "https://id.holycode.org/me", icon: "profile", kind: "profile" },
  { key: "mail", name: "Почта", url: "https://mail.holycode.org/", icon: "mail", kind: "mail" },
];
const MEMBER_SERVICES = OWNER_SERVICES.filter((s) => s.key !== "panel");

const tiles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-testid^=service-tile-]")).map((el) => el.getAttribute("data-service"));

describe("the service switcher in the profile header", () => {
  afterEach(() => {
    cleanup();
  });

  test("the grid button opens the menu; the tiles are links with ?org= and ?return_to=, the profile says 'you are here'", () => {
    const { container, getByTestId } = render(
      <ServiceSwitcher
        services={OWNER_SERVICES}
        org={ORG}
        current="profile"
        getReturnTo={() => PROFILE}
        adminUrl="https://chat.holycode.org/admin"
        canOpenAdmin
        prefsSummary="тёмная · RU"
        prefsHref="/me/settings"
      />,
    );
    expect(container.querySelector("[data-testid=service-menu]")).toBeNull();
    const trigger = getByTestId("service-switcher-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(getByTestId("service-menu")).toHaveTextContent("title · Event74");
    expect(tiles(container)).toEqual(["chat", "build", "agent", "panel", "profile", "mail"]);

    const build = getByTestId("service-tile-build");
    expect(build.tagName).toBe("A");
    const href = new URL(build.getAttribute("href")!);
    expect(href.origin + href.pathname).toBe("https://build.holycode.org/");
    expect(href.searchParams.get("org")).toBe("acct-event74");
    expect(href.searchParams.get("return_to")).toBe(PROFILE);
    expect(build).toHaveTextContent("3 сборки идут");

    const profile = getByTestId("service-tile-profile");
    expect(profile.tagName).toBe("BUTTON");
    expect(profile).toHaveAttribute("aria-current", "page");
    expect(profile).toHaveTextContent("youAreHere");

    // mail has no organization of its own but still carries the way back
    const mail = new URL(getByTestId("service-tile-mail").getAttribute("href")!);
    expect(mail.searchParams.get("return_to")).toBe(PROFILE);

    // the admin row goes to the chat's admin, with the same organization
    const admin = getByTestId("service-menu-admin");
    const adminHref = new URL(admin.getAttribute("href")!);
    expect(adminHref.origin + adminHref.pathname).toBe("https://chat.holycode.org/admin");
    expect(adminHref.searchParams.get("org")).toBe("acct-event74");
    expect(admin).toHaveTextContent("orgAdmin");
    expect(admin).toHaveTextContent("orgAdminHint");

    const prefs = getByTestId("service-menu-prefs");
    expect(prefs).toHaveAttribute("href", "/me/settings");
    expect(prefs).toHaveTextContent("prefsFromId");
    expect(prefs).toHaveTextContent("тёмная · RU");
  });

  test("a member sees no panel and no admin row; the hints come by key when the server sent none", () => {
    const { container, getByTestId, queryByTestId } = render(
      <ServiceSwitcher
        services={MEMBER_SERVICES}
        org={{ ...ORG, role: "member" }}
        getReturnTo={() => PROFILE}
        adminUrl="https://chat.holycode.org/admin"
        canOpenAdmin={false}
        prefsSummary="светлая · EN"
        prefsHref="/me/settings"
      />,
    );
    fireEvent.click(getByTestId("service-switcher-trigger"));
    expect(tiles(container)).toEqual(["chat", "build", "agent", "profile", "mail"]);
    expect(queryByTestId("service-tile-panel")).toBeNull();
    expect(queryByTestId("service-menu-admin")).toBeNull();
    expect(getByTestId("service-tile-agent")).toHaveTextContent("hint.agent");
    expect(getByTestId("service-menu-prefs")).toBeInTheDocument();
  });

  test("the fallback (no Daenerys): production addresses without the panel, links without an organization, names by key", () => {
    const { container, getByTestId, queryByTestId } = render(
      <ServiceSwitcher services={fallbackServices("")} org={null} getReturnTo={() => PROFILE} />,
    );
    fireEvent.click(getByTestId("service-switcher-trigger"));
    expect(getByTestId("service-menu")).toHaveTextContent("title");
    expect(getByTestId("service-menu")).not.toHaveTextContent("·");
    expect(tiles(container)).toEqual(["chat", "build", "agent", "profile", "mail"]);
    expect(queryByTestId("service-tile-panel")).toBeNull();
    const chat = new URL(getByTestId("service-tile-chat").getAttribute("href")!);
    expect(chat.searchParams.get("org")).toBeNull();
    expect(chat.searchParams.get("return_to")).toBe(PROFILE);
    expect(getByTestId("service-tile-mail")).toHaveTextContent("name.mail");
    expect(queryByTestId("service-menu-admin")).toBeNull();
    expect(queryByTestId("service-menu-prefs")).toBeNull();
  });

  test("closes on Escape and on a click outside; a tile click closes it too", () => {
    const { container, getByTestId } = render(
      <div>
        <button type="button" data-testid="outside">
          outside
        </button>
        <ServiceSwitcher services={OWNER_SERVICES} org={ORG} getReturnTo={() => PROFILE} />
      </div>,
    );
    const trigger = getByTestId("service-switcher-trigger");
    fireEvent.click(trigger);
    expect(container.querySelector("[data-testid=service-menu]")).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector("[data-testid=service-menu]")).toBeNull();

    fireEvent.click(trigger);
    expect(container.querySelector("[data-testid=service-menu]")).not.toBeNull();
    fireEvent.pointerDown(getByTestId("outside"));
    expect(container.querySelector("[data-testid=service-menu]")).toBeNull();

    // a click inside the menu does not close it
    fireEvent.click(trigger);
    fireEvent.pointerDown(getByTestId("service-menu"));
    expect(container.querySelector("[data-testid=service-menu]")).not.toBeNull();

    // a tile click closes it (the browser then follows the link)
    fireEvent.click(getByTestId("service-tile-chat"));
    expect(container.querySelector("[data-testid=service-menu]")).toBeNull();
  });
});

describe("'Other services' for the avatar menu on phones", () => {
  afterEach(() => {
    cleanup();
  });

  test("the same services as short tiles, plus 'Admin' for owners and admins", () => {
    const onSelect = vi.fn();
    const { container, getByTestId } = render(
      <ServiceLinks
        services={OWNER_SERVICES}
        org={ORG}
        getReturnTo={() => PROFILE}
        adminUrl="https://chat.holycode.org/admin"
        canOpenAdmin
        onSelect={onSelect}
      />,
    );
    const keys = Array.from(container.querySelectorAll("[data-testid^=service-link-]")).map((el) =>
      el.getAttribute("data-service"),
    );
    expect(keys).toEqual(["chat", "build", "agent", "panel", "profile", "mail", "admin"]);
    expect(getByTestId("service-link-build")).toHaveTextContent("short.build");
    expect(getByTestId("service-link-build")).not.toHaveTextContent("3 сборки идут");
    const build = new URL(getByTestId("service-link-build").getAttribute("href")!);
    expect(build.searchParams.get("org")).toBe("acct-event74");
    expect(build.searchParams.get("return_to")).toBe(PROFILE);
    expect(getByTestId("service-link-profile").tagName).toBe("BUTTON");
    expect(getByTestId("service-link-admin")).toHaveTextContent("short.admin");
    fireEvent.click(getByTestId("service-link-chat"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("a member: no panel, no admin", () => {
    const { container } = render(
      <ServiceLinks
        services={MEMBER_SERVICES}
        org={{ ...ORG, role: "member" }}
        getReturnTo={() => PROFILE}
        adminUrl="https://chat.holycode.org/admin"
        canOpenAdmin={false}
      />,
    );
    const keys = Array.from(container.querySelectorAll("[data-testid^=service-link-]")).map((el) =>
      el.getAttribute("data-service"),
    );
    expect(keys).toEqual(["chat", "build", "agent", "profile", "mail"]);
  });
});
