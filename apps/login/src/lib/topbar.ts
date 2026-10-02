/**
 * The common HolyCode top bar (owner's decision of 02.10.2026, option A): the
 * same bar in every service — on the left the services grid, the service's mark
 * and name, "← Back to …"; in the middle the service's own (empty in the
 * profile); on the right the HolyAgent cloud (only when an update is out inside
 * the desktop shell) and the avatar. Logic without markup, the same as
 * apps/holychat-web/src/switcher/shell.js of the holycode repository; the
 * rendering — `components/profile/top-bar.tsx` on the fork's `hc-*` tokens.
 */

import { desktopBridge, DesktopInvoke } from "./holyagent-release";
import { BackTarget, readReturnTo, RETURN_TO_PARAM } from "./services";

/** 52 px on wide screens (`.hcs-bar` of the chat); on phones 48 px + the top safe area. */
export const TOP_BAR_HEIGHT = 52;
export const TOP_BAR_HEIGHT_PHONE = 48;

/** Where the profile keeps `return_to` for the tab: section links are full page loads. */
export const RETURN_TO_STORAGE_KEY = "hc_profile_return_to";

type ClickLike = {
  defaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?: () => void;
};

function plainClick(event: ClickLike | null | undefined): boolean {
  if (!event) return true;
  if (event.defaultPrevented) return false;
  if (event.button != null && event.button !== 0) return false;
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

/**
 * Inside the HolyAgent shell (there is the Tauri bridge) a tile of the grid and "Back to …"
 * do not take the current window away: desktop_open_service opens the service in a tab of
 * the HolyAgent window, a second click switches to it. A shell without the command — the
 * system browser (desktop_open_external_url). In a browser nothing changes: a plain link.
 * Returns true when the click was taken over.
 */
export function openServiceInDesktop(
  service: { key?: string; name?: string } | null | undefined,
  href: string,
  event: ClickLike | null = null,
  { invoke = desktopBridge() }: { invoke?: DesktopInvoke | null } = {},
): boolean {
  if (!invoke || !href || !plainClick(event)) return false;
  event?.preventDefault?.();
  const key = String(service?.key || "").trim() || "service";
  const title = String(service?.name || "").trim() || "HolyCode";
  Promise.resolve()
    .then(() => invoke("desktop_open_service", { key, url: href, title }))
    .catch(() => invoke("desktop_open_external_url", { url: href }))
    .catch(() => {
      try {
        window.location.assign(href);
      } catch {
        // nowhere to go
      }
    });
  return true;
}

/**
 * The profile's `return_to` for the tab: taken from the address (and removed from it, so
 * links into other services do not nest the previous `return_to` again), kept in
 * sessionStorage for the next section — those are full page loads. Nothing in the address —
 * the kept value.
 */
export function rememberReturnTo(): string {
  if (typeof window === "undefined") return "";
  const fresh = readReturnTo(window.location.href);
  if (fresh) {
    try {
      window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, fresh);
    } catch {
      // private mode — the link lives until the next page
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(RETURN_TO_PARAM);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // the parameter stays in the address, nothing breaks
    }
    return fresh;
  }
  try {
    return window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** "Back to HolyCode": the name from the directory, else by the service key, else the host. */
export function backName(back: BackTarget | null, nameByKey: (key: string) => string = () => ""): string {
  if (!back) return "";
  return String(back.name || "").trim() || (back.key ? nameByKey(back.key) : "") || back.host;
}
