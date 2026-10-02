/**
 * "Download HolyAgent" / "HolyAgent X.Y.Z is available" in the profile's avatar
 * menu and the HolyAgent cloud button in the top bar (owner's decision of
 * 02.10.2026, option A — one top bar in every HolyCode service).
 *
 * A 1:1 port of apps/holychat-web/src/switcher/holyagentRelease.js of the
 * holycode repository (the same functions, names and numbers), in TypeScript.
 * Data and actions only, no markup: the public release list of Daenerys, the
 * comparison with the desktop shell's version, the install through the Tauri
 * bridge. Rendering — `account-menu.tsx` (the menu row) and `top-bar.tsx`
 * (the cloud).
 *
 * What is shown where:
 *   • in a browser the person's version is unknown — only "Download HolyAgent
 *     X.Y.Z for macOS" (the DMG of the latest release), no dot on the avatar;
 *   • inside the desktop shell (the HolyAgent window opens id.holycode.org with
 *     the Tauri bridge — capabilities desktop-main-remote-bridge allow
 *     *.holycode.org) — "HolyAgent X.Y.Z is available" when the release is newer
 *     than the shell, a dot on the avatar and the cloud in the bar; up to date —
 *     nothing.
 * The install takes the same path as the cloud of holyagent-web (App.js,
 * handleUpdateInstall): desktop_install_update with the .app.zip, then
 * desktop_get_update_status until success/failed.
 *
 * One difference from the chat: the list is read from the profile's own
 * Daenerys API origin (daenerys-api.<domain>, `NEXT_PUBLIC_DAENERYS_API_URL`),
 * not from daenerys.<domain> — the profile's CSP `connect-src` already allows
 * that origin, and it answers the same `/api/releases/public` with CORS for
 * id.holycode.org. The request goes without cookies either way.
 */

import { daenerysApiUrl } from "./daenerys";

export const HOLYAGENT_APP_ID = "com.holyagent.desktop";
export const HOLYAGENT_RELEASES_PATH = `/api/releases/public?app_id=${HOLYAGENT_APP_ID}&latest_only=1`;
/** Polling: every 30 minutes and on coming back to the tab (not more often than every 5 minutes). */
export const RELEASE_REFRESH_MS = 30 * 60 * 1000;
export const RELEASE_VISIBLE_MIN_MS = 5 * 60 * 1000;
const CACHE_KEY = "hc_holyagent_release";

/** The public release list of the given Daenerys API (empty → the production one). */
export function holyagentReleasesUrl(daenerysUrl?: string | null): string {
  return `${daenerysApiUrl(daenerysUrl)}${HOLYAGENT_RELEASES_PATH}`;
}

export type HolyAgentRelease = {
  version: string;
  dmgUrl: string;
  zipUrl: string;
  notes: string;
  pubDate: string;
};

export type HolyAgentMenuStateName = "download" | "update" | "installing";

export type HolyAgentMenuState = {
  state: HolyAgentMenuStateName;
  version: string;
  href: string;
  installedVersion: string;
};

/** What the menu and the cloud receive: the menu state plus the installer's last line. */
export type HolyAgentState = HolyAgentMenuState & { statusText: string };

/** "0.1.862" > "0.1.858". Non-numeric tails (-beta) are dropped: agent releases are three numbers. */
export function compareVersions(a: unknown, b: unknown): number {
  const parts = (value: unknown) =>
    String(value || "")
      .trim()
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

type RawRelease = {
  version?: unknown;
  target?: unknown;
  arch?: unknown;
  artifact_kind?: unknown;
  url?: unknown;
  notes?: unknown;
  pub_date?: unknown;
};

/**
 * The `/api/releases/public` answer → { version, dmgUrl, zipUrl, notes, pubDate } or null.
 * macOS only: the DMG to download from a browser, the .app.zip to install from the shell
 * (its installer only understands .app.zip).
 */
export function pickHolyAgentRelease(payload: unknown): HolyAgentRelease | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { releases?: unknown; latest_version?: unknown };
  const releases = (Array.isArray(data.releases) ? data.releases : []) as RawRelease[];
  const version = String(data.latest_version || releases[0]?.version || "").trim();
  if (!version) return null;
  const same = releases.filter(
    (item) => item && String(item.version || "").trim() === version && String(item.target || "darwin") === "darwin",
  );
  const byKind = (kind: string) => {
    const list = same.filter((item) => String(item.artifact_kind || "") === kind && String(item.url || "").trim());
    return list.find((item) => item.arch === "aarch64") || list[0] || null;
  };
  const dmg = byKind("dmg");
  const zip = byKind("app_zip");
  const any = dmg || zip;
  if (!any) return null;
  return {
    version,
    dmgUrl: String(dmg?.url || "").trim(),
    zipUrl: String(zip?.url || "").trim(),
    notes: String(any.notes || "").trim(),
    pubDate: String(any.pub_date || "").trim(),
  };
}

/**
 * What the menu shows: null — nothing; otherwise
 * { state: 'download' | 'update' | 'installing', version, href, installedVersion }.
 *   desktop — opened inside the HolyAgent shell; installedVersion — its version
 *   ('' — an old shell did not say, then as in a browser: download).
 */
export function holyagentMenuState({
  release = null,
  desktop = false,
  installedVersion = "",
  installing = false,
}: {
  release?: HolyAgentRelease | null;
  desktop?: boolean;
  installedVersion?: string;
  installing?: boolean;
} = {}): HolyAgentMenuState | null {
  if (!release || !release.version) return null;
  if (desktop && installedVersion) {
    if (compareVersions(release.version, installedVersion) <= 0) return null;
    if (!release.zipUrl && !release.dmgUrl) return null;
    return { state: installing ? "installing" : "update", version: release.version, href: "", installedVersion };
  }
  const href = release.dmgUrl || release.zipUrl;
  if (!href) return null;
  return { state: "download", version: release.version, href, installedVersion: "" };
}

// ---------------------------------------------------------------------------
// The shell's bridge
// ---------------------------------------------------------------------------

export type DesktopInvoke = (cmd: string, payload?: Record<string, unknown>) => Promise<unknown>;

type TauriWindow = Window & {
  __HOLYAGENT_DESKTOP__?: { invoke?: DesktopInvoke };
  __TAURI__?: { core?: { invoke?: DesktopInvoke } };
  __TAURI_INTERNALS__?: { invoke?: DesktopInvoke };
};

function scope(): TauriWindow | null {
  return typeof window !== "undefined" ? (window as TauriWindow) : null;
}

export function desktopBridge(): DesktopInvoke | null {
  const w = scope();
  if (!w) return null;
  if (w.__HOLYAGENT_DESKTOP__?.invoke) return (cmd, payload) => w.__HOLYAGENT_DESKTOP__!.invoke!(cmd, payload);
  if (w.__TAURI__?.core?.invoke) return (cmd, payload) => w.__TAURI__!.core!.invoke!(cmd, payload);
  if (w.__TAURI_INTERNALS__?.invoke) return (cmd, payload) => w.__TAURI_INTERNALS__!.invoke!(cmd, payload);
  return null;
}

export function isDesktopShell(): boolean {
  return Boolean(desktopBridge());
}

let installedVersionPromise: Promise<string> | null = null;
export function desktopAppVersion(): Promise<string> {
  const invoke = desktopBridge();
  if (!invoke) return Promise.resolve("");
  if (!installedVersionPromise) {
    installedVersionPromise = Promise.resolve()
      .then(() => invoke("desktop_get_app_version"))
      .then((value) => String(value || "").trim())
      .catch(() => "");
  }
  return installedVersionPromise;
}

export type InstallResult = { ok: true; version: string } | { ok: false; reason: string; text: string };

type UpdateStarted = { started?: boolean; log_path?: string; target_app_path?: string };
type UpdateStatus = { last_line?: string; failed?: boolean; success?: boolean; installed_version?: string };

/**
 * The install from the shell. onStatus(text) — the installer's line to show.
 * Result: { ok: true, version } | { ok: false, reason, text }. An old shell without the
 * command, or any failure — the link opens in the browser (as the cloud does).
 */
export async function installHolyAgentUpdate(
  release: HolyAgentRelease | null | undefined,
  {
    onStatus = () => {},
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    attempts = 180,
  }: { onStatus?: (text: string) => void; sleep?: (ms: number) => Promise<void>; attempts?: number } = {},
): Promise<InstallResult> {
  const invoke = desktopBridge();
  const url = release?.zipUrl || "";
  const fallback = release?.dmgUrl || release?.zipUrl || "";
  const openExternally = async () => {
    if (!fallback) return false;
    try {
      if (invoke) {
        await invoke("desktop_open_external_url", { url: fallback });
        return true;
      }
    } catch {
      // below — a plain link
    }
    const w = scope();
    if (!w) return false;
    w.open(fallback, "_blank", "noopener");
    return true;
  };
  if (!invoke || !url || !release) {
    await openExternally();
    return { ok: false, reason: "no_bridge", text: "" };
  }
  try {
    const started = (await invoke("desktop_install_update", { url, version: release.version || null })) as
      UpdateStarted | null | undefined;
    if (!started || typeof started !== "object" || !started.started) {
      await openExternally();
      return { ok: false, reason: "not_started", text: "" };
    }
    const logPath = String(started.log_path || "").trim();
    const targetAppPath = String(started.target_app_path || "").trim();
    if (!logPath) return { ok: true, version: release.version };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await sleep(1500);
      let status: UpdateStatus | null | undefined;
      try {
        status = (await invoke("desktop_get_update_status", {
          logPath,
          targetAppPath: targetAppPath || null,
          expectedVersion: release.version || null,
        })) as UpdateStatus | null | undefined;
      } catch {
        // A shell without status polling: the installer is running and relaunches by itself.
        return { ok: true, version: release.version };
      }
      const text = String(status?.last_line || "").trim();
      if (text) onStatus(text);
      if (status?.failed) return { ok: false, reason: "failed", text };
      if (status?.success) return { ok: true, version: String(status.installed_version || release.version) };
    }
    return { ok: false, reason: "timeout", text: "" };
  } catch (error) {
    await openExternally();
    return { ok: false, reason: "error", text: String((error as Error)?.message || error || "") };
  }
}

// ---------------------------------------------------------------------------
// One poll per page
// ---------------------------------------------------------------------------
//
// One request per page, however many menus there are. watchHolyAgentRelease(cb) gives
// the last known state at once (from memory or localStorage), then the fresh one;
// it returns the unsubscribe function.

type ReleaseListener = (release: HolyAgentRelease | null) => void;

const listeners = new Set<ReleaseListener>();
let current: HolyAgentRelease | null = null;
let lastFetch = 0;
let timer: number | null = null;
let inflight: Promise<HolyAgentRelease | null> | null = null;
let releasesUrl = holyagentReleasesUrl();

function readCache(): HolyAgentRelease | null {
  try {
    const raw = scope()?.localStorage?.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as HolyAgentRelease) : null;
    return parsed && parsed.version ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(release: HolyAgentRelease) {
  try {
    scope()?.localStorage?.setItem(CACHE_KEY, JSON.stringify(release));
  } catch {
    // private mode — no cache
  }
}

export async function fetchHolyAgentRelease({
  fetchImpl = typeof fetch === "function" ? fetch : null,
  url = releasesUrl,
}: { fetchImpl?: typeof fetch | null; url?: string } = {}): Promise<HolyAgentRelease | null> {
  if (!fetchImpl) return null;
  // No cookies: the answer is public; credentials would only get in the way of CORS.
  const response = await fetchImpl(url, { credentials: "omit", headers: { Accept: "application/json" } });
  if (!response || !response.ok) return null;
  return pickHolyAgentRelease(await response.json());
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener(current);
    } catch {
      // someone else's listener does not break the others
    }
  });
}

export function refreshHolyAgentRelease({ force = false }: { force?: boolean } = {}): Promise<HolyAgentRelease | null> {
  const now = Date.now();
  if (inflight) return inflight;
  if (!force && now - lastFetch < RELEASE_VISIBLE_MIN_MS) return Promise.resolve(current);
  lastFetch = now;
  inflight = fetchHolyAgentRelease()
    .then((release) => {
      if (
        release &&
        (!current ||
          release.version !== current.version ||
          release.dmgUrl !== current.dmgUrl ||
          release.zipUrl !== current.zipUrl)
      ) {
        current = release;
        writeCache(release);
        emit();
      }
      return current;
    })
    .catch(() => current)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function onVisible() {
  if (scope()?.document?.visibilityState === "visible") refreshHolyAgentRelease();
}

/** `url` — the release list to poll (the profile passes its Daenerys API); the first watcher's wins. */
export function watchHolyAgentRelease(listener: ReleaseListener, { url }: { url?: string } = {}): () => void {
  const w = scope();
  if (url && !listeners.size) releasesUrl = url;
  if (!current) current = readCache();
  listeners.add(listener);
  if (current) listener(current);
  if (listeners.size === 1 && w) {
    refreshHolyAgentRelease({ force: true });
    timer = w.setInterval(() => refreshHolyAgentRelease({ force: true }), RELEASE_REFRESH_MS);
    w.document?.addEventListener?.("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && w) {
      if (timer) w.clearInterval(timer);
      timer = null;
      w.document?.removeEventListener?.("visibilitychange", onVisible);
    }
  };
}

// The install — one per page: the cloud in the bar and the menu row show the same thing.
const install = { installing: false, statusText: "" };
const installListeners = new Set<() => void>();

function emitInstall() {
  installListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // someone else's listener does not break the others
    }
  });
}

export async function startHolyAgentInstall(release: HolyAgentRelease | null = current): Promise<InstallResult | null> {
  if (install.installing || !release) return null;
  install.installing = true;
  install.statusText = "";
  emitInstall();
  const result = await installHolyAgentUpdate(release, {
    onStatus: (text) => {
      install.statusText = text;
      emitInstall();
    },
  });
  install.installing = false;
  install.statusText = result.ok ? "" : result.text;
  emitInstall();
  return result;
}

export type HolyAgentMenuController = {
  install: () => Promise<InstallResult | null>;
  dispose: () => void;
};

/**
 * Everything together for the avatar menu and the cloud: the release + the shell's version +
 * the install. onChange(state | null) — the state of holyagentMenuState plus statusText (the
 * installer's line). Renderers: create in an effect, call install() on a click on a row
 * without href, dispose() on unmount.
 */
export function createHolyAgentMenu(
  onChange: (state: HolyAgentState | null) => void,
  { desktop = isDesktopShell(), url }: { desktop?: boolean; url?: string } = {},
): HolyAgentMenuController {
  let release: HolyAgentRelease | null = null;
  let installed = "";
  let disposed = false;
  const push = () => {
    if (disposed) return;
    const state = holyagentMenuState({ release, desktop, installedVersion: installed, installing: install.installing });
    onChange(state ? { ...state, statusText: install.statusText } : null);
  };
  installListeners.add(push);
  const unwatch = watchHolyAgentRelease(
    (next) => {
      release = next;
      push();
    },
    { url },
  );
  if (desktop) {
    desktopAppVersion().then((value) => {
      installed = value;
      push();
    });
  }
  return {
    install: () => startHolyAgentInstall(release),
    dispose() {
      disposed = true;
      installListeners.delete(push);
      unwatch();
    },
  };
}

/** For tests: reset the module's state. */
export function resetHolyAgentReleaseWatch() {
  listeners.clear();
  current = null;
  lastFetch = 0;
  inflight = null;
  installedVersionPromise = null;
  install.installing = false;
  install.statusText = "";
  installListeners.clear();
  if (timer && scope()) scope()!.clearInterval(timer);
  timer = null;
  releasesUrl = holyagentReleasesUrl();
}
