import { describe, expect, test } from "vitest";
import {
  idpIdOfMethod,
  isLastLoginMethod,
  LastLogin,
  nextLastLogin,
  parseLastLogin,
  resolveRememberedView,
  sameLoginName,
  serializeLastLogin,
} from "./last-login";

const apple = { id: "392465682232508420" };
const github = { id: "392465683138478084" };

describe("last-login cookie value", () => {
  test("round-trips through serialize/parse", () => {
    const value: LastLogin = {
      loginName: "event74@ya.ru",
      displayName: "Event 74",
      method: "idp:392465682232508420",
      others: ["password"],
    };
    expect(parseLastLogin(serializeLastLogin(value))).toEqual(value);
  });

  test("rejects garbage, wrong versions, unknown methods and oversized names", () => {
    expect(parseLastLogin(undefined)).toBeNull();
    expect(parseLastLogin("")).toBeNull();
    expect(parseLastLogin("not json")).toBeNull();
    expect(parseLastLogin(JSON.stringify({ v: 2, l: "a@b.c", m: "password" }))).toBeNull();
    expect(parseLastLogin(JSON.stringify({ v: 1, l: "a@b.c", m: "sms" }))).toBeNull();
    expect(parseLastLogin(JSON.stringify({ v: 1, l: "a@b.c", m: "idp:<script>" }))).toBeNull();
    expect(parseLastLogin(JSON.stringify({ v: 1, l: "", m: "password" }))).toBeNull();
    expect(parseLastLogin(JSON.stringify({ v: 1, l: "x".repeat(400), m: "password" }))).toBeNull();
  });

  test("drops invalid or duplicate entries from the history", () => {
    const parsed = parseLastLogin(
      JSON.stringify({ v: 1, l: "a@b.c", m: "password", o: ["password", "idp:1", "bogus", "idp:1", "passkey", "idp:2"] }),
    );
    expect(parsed?.others).toEqual(["idp:1", "passkey", "idp:2"]);
  });

  test("method helpers", () => {
    expect(isLastLoginMethod("password")).toBe(true);
    expect(isLastLoginMethod("passkey")).toBe(true);
    expect(isLastLoginMethod("idp:123")).toBe(true);
    expect(isLastLoginMethod("idp:")).toBe(false);
    expect(isLastLoginMethod(42)).toBe(false);
    expect(idpIdOfMethod("idp:123")).toBe("123");
    expect(idpIdOfMethod("password")).toBeUndefined();
    expect(sameLoginName(" Event74@YA.ru ", "event74@ya.ru")).toBe(true);
    expect(sameLoginName("a@b.c", undefined)).toBe(false);
  });
});

describe("nextLastLogin", () => {
  test("the same account keeps its earlier ways, newest first", () => {
    const previous: LastLogin = { loginName: "event74@ya.ru", method: "idp:1", others: ["passkey"] };
    expect(nextLastLogin(previous, { loginName: "EVENT74@ya.ru", method: "password" })).toEqual({
      loginName: "EVENT74@ya.ru",
      method: "password",
      others: ["idp:1", "passkey"],
    });
  });

  test("signing in the same way again does not duplicate it", () => {
    const previous: LastLogin = { loginName: "a@b.c", method: "password", others: ["idp:1"] };
    expect(nextLastLogin(previous, { loginName: "a@b.c", method: "password" }).others).toEqual(["idp:1"]);
  });

  test("another account starts from scratch", () => {
    const previous: LastLogin = { loginName: "a@b.c", method: "idp:1", others: ["password"] };
    expect(nextLastLogin(previous, { loginName: "x@y.z", displayName: "  X  ", method: "passkey" })).toEqual({
      loginName: "x@y.z",
      displayName: "X",
      method: "passkey",
      others: [],
    });
  });
});

describe("resolveRememberedView", () => {
  const all = { allowLocalAuthentication: true, passkeysAllowed: true, identityProviders: [apple, github] };

  test("no cookie — the regular form", () => {
    expect(resolveRememberedView(null, all)).toBeNull();
  });

  test("password last: password first, remembered provider as a secondary button", () => {
    const view = resolveRememberedView({ loginName: "a@b.c", method: "password", others: [`idp:${apple.id}`] }, all);
    expect(view).toEqual({
      loginName: "a@b.c",
      primary: { kind: "password" },
      rememberedIdpIds: [apple.id],
      passkeyRemembered: false,
    });
  });

  test("provider last: its button leads", () => {
    const view = resolveRememberedView({ loginName: "a@b.c", method: `idp:${apple.id}`, others: ["passkey"] }, all);
    expect(view?.primary).toEqual({ kind: "idp", idpId: apple.id });
    expect(view?.rememberedIdpIds).toEqual([]);
    expect(view?.passkeyRemembered).toBe(true);
  });

  test("passkey last: the passkey button leads", () => {
    const view = resolveRememberedView({ loginName: "a@b.c", method: "passkey", others: [] }, all);
    expect(view?.primary).toEqual({ kind: "passkey" });
    expect(view?.passkeyRemembered).toBe(false);
  });

  test("a provider that is no longer active falls back to the next remembered way, then to the password", () => {
    const gone = { ...all, identityProviders: [github] };
    expect(
      resolveRememberedView({ loginName: "a@b.c", method: `idp:${apple.id}`, others: [`idp:${github.id}`] }, gone)?.primary,
    ).toEqual({ kind: "idp", idpId: github.id });
    expect(resolveRememberedView({ loginName: "a@b.c", method: `idp:${apple.id}`, others: [] }, gone)?.primary).toEqual({
      kind: "password",
    });
  });

  test("passkeys switched off: the password leads", () => {
    const view = resolveRememberedView(
      { loginName: "a@b.c", method: "passkey", others: [] },
      { ...all, passkeysAllowed: false },
    );
    expect(view?.primary).toEqual({ kind: "password" });
  });

  test("no local sign-in and no usable provider — the regular form", () => {
    expect(
      resolveRememberedView(
        { loginName: "a@b.c", method: "password", others: [] },
        { allowLocalAuthentication: false, passkeysAllowed: true, identityProviders: [apple] },
      ),
    ).toBeNull();
  });
});
