import { describe, expect, test } from "vitest";
import { accountAttentionTone, holyagentEntry, profileAccountEntries, securityAttentionOf } from "./account-menu";
import { summarizeAuthMethods } from "./profile";

const LINKS = {
  profile: "/me",
  security: "/me/security",
  keys: "/me/keys",
  settings: "/me/settings",
  switchUser: "/ui/v2/login/accounts",
  signOut: "/ui/v2/login/logout",
};

const ids = (entries: ReturnType<typeof profileAccountEntries>) => entries.map((e) => e.id);

describe("profileAccountEntries — the order of every HolyCode service", () => {
  test("a browser: the profile's sections, language, settings, then Download HolyAgent, switch user, sign out", () => {
    const entries = profileAccountEntries({
      links: LINKS,
      languages: 2,
      holyagent: { state: "download", version: "0.1.864", href: "https://d.test/a.dmg" },
    });
    expect(ids(entries)).toEqual([
      "profile",
      "security",
      "keys",
      "language",
      "settings",
      "hr-download",
      "holyagent",
      "hr-account",
      "switchUser",
      "hr-session",
      "signOut",
    ]);
  });

  test("inside the shell an update comes first, right under the head", () => {
    const entries = profileAccountEntries({
      links: LINKS,
      holyagent: { state: "update", version: "0.1.864", installedVersion: "0.1.858" },
    });
    expect(ids(entries).slice(0, 3)).toEqual(["holyagent", "hr-holyagent", "profile"]);
    expect(ids(entries)).not.toContain("language");
  });

  test("no release known: no HolyAgent row and no empty separators", () => {
    const entries = profileAccountEntries({ links: LINKS });
    expect(ids(entries)).toEqual([
      "profile",
      "security",
      "keys",
      "settings",
      "hr-account",
      "switchUser",
      "hr-session",
      "signOut",
    ]);
  });
});

describe("holyagentEntry", () => {
  test("download: label and the version line, the DMG as the link", () => {
    expect(holyagentEntry({ state: "download", version: "0.1.864", href: "https://d.test/a.dmg" })).toEqual({
      kind: "holyagent",
      id: "holyagent",
      icon: "download",
      state: "download",
      version: "0.1.864",
      label: { key: "holyagent.download" },
      sub: { key: "holyagent.downloadSub", values: { version: "0.1.864", installed: "?" } },
      href: "https://d.test/a.dmg",
    });
  });

  test("update and installing: no link; installing shows the installer's own line", () => {
    const update = holyagentEntry({ state: "update", version: "0.1.864", installedVersion: "0.1.858" })!;
    expect(update.href).toBeUndefined();
    expect(update.label).toEqual({ key: "holyagent.update", values: { version: "0.1.864", installed: "0.1.858" } });
    const installing = holyagentEntry({ state: "installing", version: "0.1.864", statusText: "unpacking" })!;
    expect(installing.sub).toEqual({ raw: "unpacking" });
  });

  test("rubbish → null", () => {
    expect(holyagentEntry(null)).toBeNull();
    expect(holyagentEntry({ state: "download", version: "0.1.864", href: "" })).toBeNull();
    expect(holyagentEntry({ state: "other", version: "1" })).toBeNull();
  });
});

describe("the dot on the avatar and the security pill", () => {
  test("no second factor → no_2fa; no passkey → no_passkey", () => {
    expect(securityAttentionOf(summarizeAuthMethods([1] as never))).toBe("no_2fa");
    expect(securityAttentionOf(summarizeAuthMethods([1, 4] as never))).toBe("no_passkey");
    expect(securityAttentionOf(null)).toBe("");
  });

  test("an update of HolyAgent or a security pill → yellow dot; download alone → none", () => {
    expect(accountAttentionTone({ holyagent: { state: "update" } })).toBe("warn");
    expect(accountAttentionTone({ holyagent: { state: "download" } })).toBe("");
    expect(accountAttentionTone({ securityAttention: "no_2fa" })).toBe("warn");
  });
});
