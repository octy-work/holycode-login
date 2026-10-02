import { afterEach, describe, expect, test, vi } from "vitest";
import { backName, openServiceInDesktop, rememberReturnTo, RETURN_TO_STORAGE_KEY } from "./topbar";

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("openServiceInDesktop — a tab of the HolyAgent window instead of leaving it", () => {
  test("no bridge (a browser): the plain link is left alone", () => {
    expect(openServiceInDesktop({ key: "chat" }, "https://app.holycode.org/", null, { invoke: null })).toBe(false);
  });

  test("the shell: desktop_open_service with the key, the address and the title", async () => {
    const invoke = vi.fn(async () => null);
    const preventDefault = vi.fn();
    const taken = openServiceInDesktop(
      { key: "build", name: "HolyBuild" },
      "https://build.holycode.org/",
      { button: 0, preventDefault },
      { invoke },
    );
    expect(taken).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("desktop_open_service", {
        key: "build",
        url: "https://build.holycode.org/",
        title: "HolyBuild",
      }),
    );
  });

  test("Cmd+click or a middle click stays the browser's", () => {
    const invoke = vi.fn(async () => null);
    expect(openServiceInDesktop({ key: "build" }, "https://b.test/", { button: 0, metaKey: true }, { invoke })).toBe(false);
    expect(openServiceInDesktop({ key: "build" }, "https://b.test/", { button: 1 }, { invoke })).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  test("a shell without the command: the system browser", async () => {
    const invoke = vi.fn(async (cmd: string) => {
      if (cmd === "desktop_open_service") throw new Error("unknown command");
      return null;
    });
    openServiceInDesktop({ key: "mail" }, "https://mail.holycode.org/", null, { invoke });
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("desktop_open_external_url", { url: "https://mail.holycode.org/" }),
    );
  });
});

describe("rememberReturnTo", () => {
  test("from the address into the tab's storage, the parameter leaves the address", () => {
    window.history.replaceState({}, "", "/me/security?tab=1&return_to=" + encodeURIComponent("https://app.holycode.org/x"));
    expect(rememberReturnTo()).toBe("https://app.holycode.org/x");
    expect(window.location.pathname + window.location.search).toBe("/me/security?tab=1");
    expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe("https://app.holycode.org/x");
    window.history.replaceState({}, "", "/me/keys");
    expect(rememberReturnTo()).toBe("https://app.holycode.org/x");
  });

  test("nothing anywhere → ''", () => {
    window.history.replaceState({}, "", "/me");
    expect(rememberReturnTo()).toBe("");
  });
});

describe("backName", () => {
  test("directory name, else by key, else the host", () => {
    expect(backName({ href: "", host: "app.holycode.org", key: "chat", name: "HolyCode" })).toBe("HolyCode");
    expect(backName({ href: "", host: "mail.holycode.org", key: "mail", name: "" }, (k) => `name.${k}`)).toBe("name.mail");
    expect(backName({ href: "", host: "x.holycode.org", key: "", name: "" })).toBe("x.holycode.org");
    expect(backName(null)).toBe("");
  });
});
