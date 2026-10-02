import { afterEach, describe, expect, test, vi } from "vitest";
import {
  compareVersions,
  createHolyAgentMenu,
  holyagentMenuState,
  holyagentReleasesUrl,
  HolyAgentState,
  installHolyAgentUpdate,
  pickHolyAgentRelease,
  resetHolyAgentReleaseWatch,
} from "./holyagent-release";
import { RELEASES } from "./holyagent-release.fixture";

const RELEASE = pickHolyAgentRelease(RELEASES)!;

type TauriWindow = Window & { __TAURI__?: unknown };

afterEach(() => {
  resetHolyAgentReleaseWatch();
  delete (window as TauriWindow).__TAURI__;
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("compareVersions", () => {
  test("three numbers, a leading v and tails do not matter", () => {
    expect(compareVersions("0.1.862", "0.1.858")).toBe(1);
    expect(compareVersions("0.1.858", "0.1.862")).toBe(-1);
    expect(compareVersions("v0.1.862", "0.1.862")).toBe(0);
    expect(compareVersions("0.2", "0.1.999")).toBe(1);
    expect(compareVersions("0.1.862-beta", "0.1.862")).toBe(0);
    expect(compareVersions("", "0.0.0")).toBe(0);
  });
});

describe("pickHolyAgentRelease", () => {
  test("the DMG for the browser and the .app.zip for the shell, Apple silicon first", () => {
    expect(RELEASE).toEqual({
      version: "0.1.864",
      dmgUrl: "https://daenerys.holycode.org/api/updates/download/desktop-release-0.1.864.dmg",
      zipUrl: "https://daenerys.holycode.org/api/updates/download/desktop-release-0.1.864.app.zip",
      notes: "HolyAgent 0.1.864",
      pubDate: "2026-10-02T15:01:01.346233+00:00",
    });
  });

  test("nothing usable → null", () => {
    expect(pickHolyAgentRelease(null)).toBeNull();
    expect(pickHolyAgentRelease({ releases: [] })).toBeNull();
    expect(
      pickHolyAgentRelease({ latest_version: "1.0.0", releases: [{ version: "1.0.0", target: "linux", url: "x" }] }),
    ).toBeNull();
  });
});

describe("holyagentMenuState", () => {
  test("a browser: download the DMG", () => {
    expect(holyagentMenuState({ release: RELEASE })).toEqual({
      state: "download",
      version: "0.1.864",
      href: RELEASE.dmgUrl,
      installedVersion: "",
    });
  });

  test("the shell with an older version: update; installing; up to date — nothing", () => {
    expect(holyagentMenuState({ release: RELEASE, desktop: true, installedVersion: "0.1.858" })).toEqual({
      state: "update",
      version: "0.1.864",
      href: "",
      installedVersion: "0.1.858",
    });
    expect(
      holyagentMenuState({ release: RELEASE, desktop: true, installedVersion: "0.1.858", installing: true })?.state,
    ).toBe("installing");
    expect(holyagentMenuState({ release: RELEASE, desktop: true, installedVersion: "0.1.864" })).toBeNull();
  });

  test("an old shell that does not say its version: as in a browser", () => {
    expect(holyagentMenuState({ release: RELEASE, desktop: true, installedVersion: "" })?.state).toBe("download");
  });
});

describe("holyagentReleasesUrl", () => {
  test("the profile's Daenerys API, production by default", () => {
    expect(holyagentReleasesUrl("")).toBe(
      "https://daenerys-api.holycode.org/api/releases/public?app_id=com.holyagent.desktop&latest_only=1",
    );
    expect(holyagentReleasesUrl("https://daenerys-api.octy.ru/")).toBe(
      "https://daenerys-api.octy.ru/api/releases/public?app_id=com.holyagent.desktop&latest_only=1",
    );
  });
});

describe("installHolyAgentUpdate", () => {
  test("the shell installs the .app.zip and is polled until success", async () => {
    const calls: [string, unknown][] = [];
    const invoke = vi.fn(async (cmd: string, payload?: unknown) => {
      calls.push([cmd, payload]);
      if (cmd === "desktop_install_update")
        return { started: true, log_path: "/tmp/u.log", target_app_path: "/Applications/HolyAgent.app" };
      if (cmd === "desktop_get_update_status") {
        const polls = calls.filter(([c]) => c === "desktop_get_update_status").length;
        return polls < 2 ? { last_line: "unpacking" } : { success: true, installed_version: "0.1.864" };
      }
      return null;
    });
    (window as TauriWindow).__TAURI__ = { core: { invoke } };
    const lines: string[] = [];
    const result = await installHolyAgentUpdate(RELEASE, { onStatus: (t) => lines.push(t), sleep: async () => {} });
    expect(result).toEqual({ ok: true, version: "0.1.864" });
    expect(calls[0]).toEqual(["desktop_install_update", { url: RELEASE.zipUrl, version: "0.1.864" }]);
    expect(calls[1]).toEqual([
      "desktop_get_update_status",
      { logPath: "/tmp/u.log", targetAppPath: "/Applications/HolyAgent.app", expectedVersion: "0.1.864" },
    ]);
    expect(lines).toEqual(["unpacking"]);
  });

  test("the installer did not start: the DMG opens in the system browser", async () => {
    const invoke = vi.fn(async (cmd: string) => (cmd === "desktop_install_update" ? { started: false } : null));
    (window as TauriWindow).__TAURI__ = { core: { invoke } };
    const result = await installHolyAgentUpdate(RELEASE, { sleep: async () => {} });
    expect(result).toEqual({ ok: false, reason: "not_started", text: "" });
    expect(invoke).toHaveBeenCalledWith("desktop_open_external_url", { url: RELEASE.dmgUrl });
  });

  test("no bridge (a browser): the link opens in a new tab", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const result = await installHolyAgentUpdate(RELEASE);
    expect(result.ok).toBe(false);
    expect(open).toHaveBeenCalledWith(RELEASE.dmgUrl, "_blank", "noopener");
  });
});

describe("createHolyAgentMenu", () => {
  test("one request per page, without cookies, to the given list", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(RELEASES), { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    const seen: (HolyAgentState | null)[] = [];
    const url = holyagentReleasesUrl("https://daenerys-api.example.test");
    const a = createHolyAgentMenu((s) => seen.push(s), { desktop: false, url });
    const b = createHolyAgentMenu(() => {}, { desktop: false, url });
    await vi.waitFor(() => expect(seen.at(-1)?.state).toBe("download"));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(url, { credentials: "omit", headers: { Accept: "application/json" } });
    expect(seen.at(-1)).toMatchObject({ version: "0.1.864", href: RELEASE.dmgUrl, statusText: "" });
    a.dispose();
    b.dispose();
  });

  test("inside the shell: the version of the shell decides, the install goes through the bridge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(RELEASES), { status: 200 })),
    );
    const invoke = vi.fn(async (cmd: string) => {
      if (cmd === "desktop_get_app_version") return "0.1.858";
      if (cmd === "desktop_install_update") return { started: true };
      return null;
    });
    (window as TauriWindow).__TAURI__ = { core: { invoke } };
    let state: HolyAgentState | null = null;
    const menu = createHolyAgentMenu((s) => (state = s));
    await vi.waitFor(() => expect(state?.state).toBe("update"));
    expect(state).toMatchObject({ version: "0.1.864", installedVersion: "0.1.858" });
    await menu.install();
    expect(invoke).toHaveBeenCalledWith("desktop_install_update", { url: RELEASE.zipUrl, version: "0.1.864" });
    menu.dispose();
  });
});
