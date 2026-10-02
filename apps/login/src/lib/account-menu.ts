/**
 * The avatar menu of the profile — the same rows in the same order as the user
 * card of every HolyCode service (apps/holychat-web/src/switcher/account.js of
 * the holycode repository: owner's decisions of 28.09.2026 and 02.10.2026):
 *
 *   head (name, @login · e-mail) → HolyAgent update (inside the desktop shell,
 *   right under the head — it must be noticed) → profile, sign-in & security
 *   ("no 2FA" pill), access keys → language → all settings → "Download
 *   HolyAgent" (a browser) → debug snapshot (02.10.2026, lib/debug-snapshot.js)
 *   → switch user → sign out.
 *
 * Inside the profile the first rows are its own sections (/me, /me/security,
 * /me/keys); theme and colours are not rows here — the theme of the ID is saved
 * in Settings, and that row leads there. Data only; the rendering is
 * `components/profile/account-menu.tsx`, the texts `profile.account.*`.
 */

import { HolyAgentMenuStateName } from "./holyagent-release";
import { AuthMethodsSummary } from "./profile";

export const HOLYAGENT_STATES: readonly HolyAgentMenuStateName[] = Object.freeze(["download", "update", "installing"]);

export type HolyAgentEntryInput = {
  state: string;
  version: string;
  href?: string;
  installedVersion?: string;
  statusText?: string;
} | null;

/** A text key of `profile.account` with the values to fill in. */
export type TextRef = { key: string; values?: Record<string, string> };

export type HolyAgentEntry = {
  kind: "holyagent";
  id: "holyagent";
  icon: "download";
  state: HolyAgentMenuStateName;
  version: string;
  label: TextRef;
  /** The second line: a text key, or the installer's own line (`raw`). */
  sub: TextRef | { raw: string } | null;
  href?: string;
};

/**
 * The HolyAgent row by the state of holyagentMenuState: "Download HolyAgent" (href — the
 * DMG), "HolyAgent X.Y.Z is available" (a click installs), "Installing HolyAgent X.Y.Z…".
 */
export function holyagentEntry(holyagent: HolyAgentEntryInput): HolyAgentEntry | null {
  if (!holyagent || typeof holyagent !== "object") return null;
  const state = holyagent.state as HolyAgentMenuStateName;
  if (!HOLYAGENT_STATES.includes(state)) return null;
  const version = String(holyagent.version || "").trim();
  if (!version) return null;
  const values = { version, installed: String(holyagent.installedVersion || "").trim() || "?" };
  const href = state === "download" ? String(holyagent.href || "").trim() : "";
  if (state === "download" && !href) return null;
  const label: TextRef =
    state === "download"
      ? { key: "holyagent.download" }
      : { key: state === "installing" ? "holyagent.installing" : "holyagent.update", values };
  let sub: HolyAgentEntry["sub"];
  if (state === "download") sub = { key: "holyagent.downloadSub", values };
  else if (state === "installing") {
    const raw = String(holyagent.statusText || "").trim();
    sub = raw ? { raw } : null;
  } else sub = { key: "holyagent.updateSub", values };
  return { kind: "holyagent", id: "holyagent", icon: "download", state, version, label, sub, ...(href ? { href } : {}) };
}

export type SecurityAttention = "" | "no_2fa" | "no_passkey";

/** The pill on "Sign-in & security": no second factor, or no passkey (Touch ID) — like securityAttentionFrom. */
export function securityAttentionOf(methods: AuthMethodsSummary | null | undefined): SecurityAttention {
  if (!methods) return "";
  if (!methods.secondFactor) return "no_2fa";
  if (!methods.passkey) return "no_passkey";
  return "";
}

/**
 * The dot on the avatar — the worst of the states: 'warn' (yellow) — a security pill, or an
 * update of HolyAgent inside the shell; '' — all fine, no dot.
 */
export function accountAttentionTone({
  securityAttention = "",
  holyagent = null,
}: { securityAttention?: string; holyagent?: { state?: string } | null } = {}): "" | "warn" {
  if (holyagent && typeof holyagent === "object" && (holyagent.state === "update" || holyagent.state === "installing")) {
    return "warn";
  }
  return securityAttention ? "warn" : "";
}

export type AccountItemId = "profile" | "security" | "keys" | "settings" | "debugSnapshot" | "switchUser" | "signOut";

export type AccountEntry =
  | { kind: "hr"; id: string }
  | { kind: "item"; id: AccountItemId; icon: string; href: string; attention?: SecurityAttention; danger?: boolean }
  | { kind: "language"; id: "language"; icon: "language" }
  | HolyAgentEntry;

/** The menu's rows in order, without empty separators (in a row, first or last). */
export function profileAccountEntries({
  links,
  securityAttention = "",
  languages = 0,
  holyagent = null,
  debugSnapshot = false,
}: {
  links: { profile: string; security: string; keys: string; settings: string; switchUser: string; signOut: string };
  securityAttention?: SecurityAttention;
  /** How many interface languages there are: the language row only when there is a choice. */
  languages?: number;
  holyagent?: HolyAgentEntryInput;
  /** The "Debug snapshot" row (owner's decision of 02.10.2026: in the profile menu of every service). */
  debugSnapshot?: boolean;
}): AccountEntry[] {
  const entries: AccountEntry[] = [];
  const agentRow = holyagentEntry(holyagent);
  if (agentRow && agentRow.state !== "download") entries.push(agentRow, { kind: "hr", id: "hr-holyagent" });
  entries.push({ kind: "item", id: "profile", icon: "user", href: links.profile });
  entries.push({
    kind: "item",
    id: "security",
    icon: "security",
    href: links.security,
    attention: securityAttention || "",
  });
  entries.push({ kind: "item", id: "keys", icon: "keys", href: links.keys });
  if (languages > 1) entries.push({ kind: "language", id: "language", icon: "language" });
  entries.push({ kind: "item", id: "settings", icon: "settings", href: links.settings });
  if (agentRow && agentRow.state === "download") entries.push({ kind: "hr", id: "hr-download" }, agentRow);
  if (debugSnapshot) entries.push({ kind: "hr", id: "hr-debug" }, { kind: "item", id: "debugSnapshot", icon: "camera", href: "" });
  entries.push({ kind: "hr", id: "hr-account" });
  entries.push({ kind: "item", id: "switchUser", icon: "switch-user", href: links.switchUser });
  entries.push({ kind: "hr", id: "hr-session" });
  entries.push({ kind: "item", id: "signOut", icon: "sign-out", href: links.signOut, danger: true });
  return entries.filter((entry, index, list) => {
    if (entry.kind !== "hr") return true;
    const prev = list[index - 1];
    const next = list.slice(index + 1).find((item) => item.kind !== "hr");
    return Boolean(prev) && prev.kind !== "hr" && Boolean(next);
  });
}
