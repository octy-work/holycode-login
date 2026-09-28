import { ServiceEntry } from "@/lib/services";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MobileNav, MobileNavProps, SHEET_HISTORY_KEY } from "./mobile-nav";
import { isTextEntry, keyboardOpenFrom } from "./use-keyboard-open";

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
  { key: "panel", name: "Daenerys", url: "https://daenerys.holycode.org/", icon: "panel", kind: "app" },
  { key: "profile", name: "Профиль", url: "https://id.holycode.org/me", icon: "profile", kind: "profile" },
  { key: "mail", name: "Почта", url: "https://mail.holycode.org/", icon: "mail", kind: "mail", status: { text: "1 новое" } },
];
const MEMBER_SERVICES = OWNER_SERVICES.filter((s) => s.key !== "panel");

const USER = { fullName: "Родион Отлетов", loginName: "owner@example.test", email: "owner@example.test", avatarUrl: "" };

function renderNav(props: Partial<MobileNavProps> = {}) {
  const navigate = vi.fn();
  const utils = render(
    <div>
      <input data-testid="field" />
      <MobileNav
        section="security"
        prefix="/me"
        basePath="/ui/v2/login"
        counters={{}}
        services={OWNER_SERVICES}
        org={ORG}
        current="profile"
        adminUrl="https://chat.holycode.org/admin"
        canOpenAdmin
        user={USER}
        getReturnTo={() => PROFILE}
        navigate={navigate}
        {...props}
      />
    </div>,
  );
  return { ...utils, navigate };
}

const sheetOf = (container: HTMLElement) => container.querySelector("[data-testid=services-sheet]");
const tileKeys = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-testid^=sheet-tile-]")).map((el) => el.getAttribute("data-service"));

beforeEach(() => {
  window.history.replaceState({}, "", "/me/security");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  document.documentElement.style.overflow = "";
});

describe("the phone's bottom bar of the profile", () => {
  test("four sections, then 'Services' last; the current section is marked, a counter shows a badge; only under 768 px", () => {
    const { getByTestId, container } = renderNav({ counters: { data: 2 } });
    const nav = getByTestId("mobile-nav");
    expect(nav.tagName).toBe("NAV");
    expect(nav).toHaveAttribute("aria-label", "mobileNav.label");
    expect(nav.className).toContain("md:hidden");
    expect(nav.className).toContain("h-[calc(56px+env(safe-area-inset-bottom))]"); // the border included
    expect(nav.className).toContain("pb-[env(safe-area-inset-bottom)]");

    const places = Array.from(nav.querySelectorAll("li")).map((li) => li.firstElementChild as HTMLElement);
    expect(places.map((el) => el.getAttribute("data-testid"))).toEqual([
      "mobile-nav-home",
      "mobile-nav-data",
      "mobile-nav-security",
      "mobile-nav-orgs",
      "mobile-nav-services",
    ]);
    expect(places.slice(0, 4).map((el) => el.getAttribute("href"))).toEqual(["/me", "/me/data", "/me/security", "/me/orgs"]);
    expect(places.map((el) => el.lastElementChild?.textContent)).toEqual([
      "nav.short.home",
      "nav.short.data",
      "nav.short.security",
      "nav.short.orgs",
      "mobileNav.services",
    ]);
    expect(getByTestId("mobile-nav-security")).toHaveAttribute("aria-current", "page");
    expect(getByTestId("mobile-nav-home")).not.toHaveAttribute("aria-current");
    expect(getByTestId("mobile-nav-badge-data")).toHaveTextContent("2");
    expect(container.querySelector("[data-testid=mobile-nav-badge-home]")).toBeNull();

    const services = getByTestId("mobile-nav-services");
    expect(services.tagName).toBe("BUTTON");
    expect(services).toHaveTextContent("mobileNav.services");
    expect(services).toHaveAttribute("aria-haspopup", "dialog");
    expect(services).toHaveAttribute("aria-expanded", "false");
    expect(services.querySelectorAll("svg circle")).toHaveLength(9); // the nine-dot grid
    expect(sheetOf(container)).toBeNull();
  });

  test("the long prefix: the same four links under the basePath", () => {
    const { container } = renderNav({ prefix: "/ui/v2/login/me", section: "home" });
    const hrefs = Array.from(container.querySelectorAll("[data-testid=mobile-nav] a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/ui/v2/login/me", "/ui/v2/login/me/data", "/ui/v2/login/me/security", "/ui/v2/login/me/orgs"]);
  });
});

describe("the services sheet", () => {
  test("'Services' opens it: the directory's tiles, 'you are here', status.text, Admin; More in Profile; the account and the organization", () => {
    const { getByTestId, container } = renderNav();
    const trigger = getByTestId("mobile-nav-services");
    fireEvent.click(trigger);

    const sheet = getByTestId("services-sheet");
    expect(sheet).toHaveAttribute("role", "dialog");
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", sheet.id);
    expect(document.getElementById(sheet.getAttribute("aria-labelledby")!)).toHaveTextContent("title · Event74");
    expect(document.activeElement).toBe(sheet);
    expect(window.history.state?.[SHEET_HISTORY_KEY]).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");

    expect(tileKeys(container)).toEqual(["chat", "build", "agent", "panel", "profile", "mail", "admin"]);
    const build = getByTestId("sheet-tile-build");
    expect(build.tagName).toBe("A");
    expect(build).not.toHaveAttribute("role");
    const href = new URL(build.getAttribute("href")!);
    expect(href.origin + href.pathname).toBe("https://build.holycode.org/");
    expect(href.searchParams.get("org")).toBe("acct-event74");
    expect(href.searchParams.get("return_to")).toBe(PROFILE);
    expect(build).toHaveTextContent("HolyBuild");
    expect(build).toHaveTextContent("3 сборки идут");
    expect(getByTestId("sheet-tile-mail")).toHaveTextContent("1 новое");
    expect(getByTestId("sheet-tile-agent")).toHaveTextContent("hint.agent");

    const profile = getByTestId("sheet-tile-profile");
    expect(profile.tagName).toBe("BUTTON");
    expect(profile).toHaveAttribute("aria-current", "page");
    expect(profile).toHaveTextContent("youAreHere");

    const admin = new URL(getByTestId("sheet-tile-admin").getAttribute("href")!);
    expect(admin.origin + admin.pathname).toBe("https://chat.holycode.org/admin");
    expect(admin.searchParams.get("org")).toBe("acct-event74");
    expect(getByTestId("sheet-tile-admin")).toHaveTextContent("mobileNav.admin");
    expect(getByTestId("sheet-tile-admin")).toHaveTextContent("orgAdminHint");

    expect(sheet).toHaveTextContent("mobileNav.more");
    const settings = getByTestId("sheet-more-settings");
    expect(settings).toHaveAttribute("href", "/me/settings");
    expect(settings).toHaveTextContent("nav.settings");
    expect(settings).not.toHaveAttribute("aria-current");
    expect(container.querySelector("[data-testid=services-sheet-more] a[href$=security]")).toBeNull();

    expect(getByTestId("sheet-account-data")).toHaveAttribute("href", "/me/data");
    expect(getByTestId("sheet-account-data")).toHaveTextContent("Родион Отлетов");
    expect(getByTestId("sheet-account-data")).toHaveTextContent("owner@example.test");
    expect(getByTestId("services-sheet-account")).toHaveAttribute("aria-label", "mobileNav.account");
    expect(getByTestId("sheet-account-org")).toHaveAttribute("href", "/me/orgs");
    expect(getByTestId("sheet-account-org")).toHaveTextContent("mobileNav.org");
    expect(getByTestId("sheet-account-org")).toHaveTextContent("Event74");
    expect(getByTestId("sheet-switch-user")).toHaveAttribute("href", "/ui/v2/login/accounts");
    expect(getByTestId("sheet-switch-user")).toHaveTextContent("mobileNav.switchUser");
  });

  test("a member: no panel, no Admin; no organization — no chip and no organization in the links", () => {
    const { getByTestId, container, queryByTestId } = renderNav({
      services: MEMBER_SERVICES,
      org: null,
      canOpenAdmin: false,
    });
    fireEvent.click(getByTestId("mobile-nav-services"));
    expect(tileKeys(container)).toEqual(["chat", "build", "agent", "profile", "mail"]);
    expect(queryByTestId("sheet-account-org")).toBeNull();
    const title = document.getElementById(getByTestId("services-sheet").getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("title");
    const chat = new URL(getByTestId("sheet-tile-chat").getAttribute("href")!);
    expect(chat.searchParams.get("org")).toBeNull();
    expect(chat.searchParams.get("return_to")).toBe(PROFILE);
  });

  test("on Settings (a 'More' section) no tab is current, 'Services' is marked and Settings in the sheet is current", () => {
    const { getByTestId, container } = renderNav({ section: "settings" });
    expect(container.querySelectorAll("[data-testid=mobile-nav] a[aria-current]")).toHaveLength(0);
    expect(getByTestId("mobile-nav-services")).toHaveAttribute("data-more-active", "true");
    fireEvent.click(getByTestId("mobile-nav-services"));
    expect(getByTestId("sheet-more-settings")).toHaveAttribute("aria-current", "page");
  });

  test("closes on Escape (focus back to 'Services'), a tap outside, the handle and the current tile — and gives its history entry back", () => {
    const back = vi.spyOn(window.history, "back");
    const { getByTestId, container } = renderNav();
    const trigger = getByTestId("mobile-nav-services");

    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sheetOf(container)).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
    expect(back).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.overflow).toBe("");

    window.history.replaceState({}, "", "/me/security");
    fireEvent.click(trigger);
    fireEvent.click(getByTestId("services-sheet-backdrop"));
    expect(sheetOf(container)).toBeNull();

    fireEvent.click(trigger);
    // a tap inside the sheet does not close it
    fireEvent.click(getByTestId("services-sheet"));
    expect(sheetOf(container)).not.toBeNull();
    fireEvent.click(getByTestId("services-sheet-handle"));
    expect(sheetOf(container)).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(getByTestId("sheet-tile-profile"));
    expect(sheetOf(container)).toBeNull();
    expect(back).toHaveBeenCalledTimes(4);
  });

  test("'back' closes it without leaving the page", async () => {
    const { getByTestId, container, navigate } = renderNav();
    fireEvent.click(getByTestId("mobile-nav-services"));
    expect(window.history.state?.[SHEET_HISTORY_KEY]).toBe(true);
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(sheetOf(container)).toBeNull());
    expect(window.location.pathname).toBe("/me/security");
    expect(window.history.state?.[SHEET_HISTORY_KEY]).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  test("a swipe down closes it; a short pull springs back; from the content only when scrolled to the top", () => {
    const { getByTestId, container } = renderNav();
    fireEvent.click(getByTestId("mobile-nav-services"));
    const sheet = getByTestId("services-sheet");
    const handle = getByTestId("services-sheet-handle");

    // a short pull: the sheet follows the finger, then springs back
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 115 }] });
    expect(sheet.style.transform).toBe("translateY(15px)");
    fireEvent.touchEnd(sheet, { touches: [] });
    expect(sheet.style.transform).toBe("");
    expect(sheetOf(container)).not.toBeNull();

    // content scrolled down: a pull scrolls it, the sheet stays
    sheet.scrollTop = 40;
    fireEvent.touchStart(getByTestId("sheet-tile-chat"), { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 450 }] });
    fireEvent.touchEnd(sheet, { touches: [] });
    expect(sheetOf(container)).not.toBeNull();

    // at the top: a long pull from the tiles closes it
    sheet.scrollTop = 0;
    fireEvent.touchStart(getByTestId("sheet-tile-chat"), { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 420 }] });
    fireEvent.touchEnd(sheet, { touches: [] });
    expect(sheetOf(container)).toBeNull();
  });

  test("a link in the sheet takes the sheet's history entry over; a modified click is left to the browser", () => {
    const back = vi.spyOn(window.history, "back");
    const { getByTestId, container, navigate } = renderNav();
    fireEvent.click(getByTestId("mobile-nav-services"));

    // Cmd-click: a new tab, the sheet stays
    fireEvent.click(getByTestId("sheet-tile-chat"), { metaKey: true });
    expect(navigate).not.toHaveBeenCalled();
    expect(sheetOf(container)).not.toBeNull();

    const href = getByTestId("sheet-tile-chat").getAttribute("href");
    fireEvent.click(getByTestId("sheet-tile-chat"));
    expect(navigate).toHaveBeenCalledWith(href, "replace");
    expect(sheetOf(container)).toBeNull();
    expect(back).not.toHaveBeenCalled();

    // without the sheet's entry (pushState refused): an ordinary navigation
    vi.spyOn(window.history, "pushState").mockImplementation(() => {
      throw new Error("refused");
    });
    fireEvent.click(getByTestId("mobile-nav-services"));
    fireEvent.click(getByTestId("sheet-more-settings"));
    expect(navigate).toHaveBeenLastCalledWith("/me/settings", "assign");
  });

  test("coming back from the bfcache: the sheet is closed", () => {
    const { getByTestId, container } = renderNav();
    fireEvent.click(getByTestId("mobile-nav-services"));
    act(() => {
      const event = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });
    expect(sheetOf(container)).toBeNull();
  });
});

describe("the bar and the on-screen keyboard", () => {
  class FakeViewport extends EventTarget {
    height = 800;
    width = 390;
    scale = 1;
  }
  let viewport: FakeViewport;

  beforeEach(() => {
    viewport = new FakeViewport();
    Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (window as { visualViewport?: unknown }).visualViewport;
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true, writable: true });
  });

  const resize = (height: number, scale = 1) =>
    act(() => {
      viewport.height = height;
      viewport.scale = scale;
      viewport.dispatchEvent(new Event("resize"));
    });

  test("hides only while the keyboard is open, never on scroll, the browser's toolbar or pinch-zoom", () => {
    const { getByTestId } = renderNav();
    const nav = getByTestId("mobile-nav");
    const field = getByTestId("field") as HTMLInputElement;

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(nav).not.toHaveAttribute("data-keyboard");

    // the browser's toolbar folds in and out: a few dozen px — stays
    resize(740);
    expect(nav).not.toHaveAttribute("data-keyboard");

    act(() => {
      field.focus();
    });
    resize(450);
    expect(nav).toHaveAttribute("data-keyboard", "open");
    expect(nav.className).toMatch(/(^|\s)hidden(\s|$)/);

    // pinch-zoom with the field focused: the visible area is the same window, stays
    resize(400, 2);
    expect(nav).not.toHaveAttribute("data-keyboard");

    resize(450);
    expect(nav).toHaveAttribute("data-keyboard", "open");
    resize(800);
    expect(nav).not.toHaveAttribute("data-keyboard");
    expect(nav.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  test("the rule itself: shrunk against the window — open; against the remembered height only with a focused field", () => {
    // iOS / Android Chrome: the window stays, the visible area shrinks
    expect(keyboardOpenFrom({ visible: 450, layout: 800, baseline: 800, editing: false })).toBe(true);
    // a toolbar, not a keyboard
    expect(keyboardOpenFrom({ visible: 700, layout: 800, baseline: 800, editing: true })).toBe(false);
    // Android resizes-content: the window shrank with the keyboard
    expect(keyboardOpenFrom({ visible: 450, layout: 450, baseline: 800, editing: true })).toBe(true);
    expect(keyboardOpenFrom({ visible: 450, layout: 450, baseline: 800, editing: false })).toBe(false);
    // a tall tablet: 18 % of the window, not 150 px
    expect(keyboardOpenFrom({ visible: 1200, layout: 1366, baseline: 1366, editing: true })).toBe(false);
    expect(keyboardOpenFrom({ visible: 0, layout: 800, baseline: 800, editing: true })).toBe(false);
  });

  test("text entries bring the keyboard up; buttons, checkboxes and the page do not", () => {
    const make = (html: string) => {
      const box = document.createElement("div");
      box.innerHTML = html;
      return box.firstElementChild;
    };
    expect(isTextEntry(make('<input type="email">'))).toBe(true);
    expect(isTextEntry(make("<input>"))).toBe(true);
    expect(isTextEntry(make("<textarea></textarea>"))).toBe(true);
    expect(isTextEntry(make('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(make("<input readonly>"))).toBe(false);
    expect(isTextEntry(make('<div contenteditable="true"></div>'))).toBe(true);
    expect(isTextEntry(make("<button></button>"))).toBe(false);
    expect(isTextEntry(document.body)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
