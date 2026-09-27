import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { describe, expect, test } from "vitest";
import {
  canRemoveSignInMethod,
  fullName,
  isPlausibleEmail,
  isProfileReturnTarget,
  normalizeLanguageTag,
  parseProfileSection,
  parseThemePreference,
  profilePath,
  profilePrefixFromPathname,
  publicHandle,
  recommendationsBySection,
  resolveProfilePrefix,
  salutation,
  securityRecommendations,
  summarizeAuthMethods,
  validateNameForm,
} from "./profile";

const headersWith = (entries: Record<string, string>) => ({ get: (name: string) => entries[name.toLowerCase()] ?? null });

describe("profile sections and addresses", () => {
  test("parses /me and /me/<section>; anything else is unknown", () => {
    expect(parseProfileSection(undefined)).toBe("home");
    expect(parseProfileSection([])).toBe("home");
    expect(parseProfileSection(["data"])).toBe("data");
    expect(parseProfileSection(["security"])).toBe("security");
    expect(parseProfileSection(["orgs"])).toBe("orgs");
    expect(parseProfileSection(["settings"])).toBe("settings");
    expect(parseProfileSection(["home"])).toBeNull();
    expect(parseProfileSection(["billing"])).toBeNull();
    expect(parseProfileSection(["data", "more"])).toBeNull();
  });

  test("builds short links without a trailing slash", () => {
    expect(profilePath("/me", "home")).toBe("/me");
    expect(profilePath("/me", "security")).toBe("/me/security");
    expect(profilePath("/ui/v2/login/me", "home")).toBe("/ui/v2/login/me");
    expect(profilePath("/ui/v2/login/me/", "orgs")).toBe("/ui/v2/login/me/orgs");
  });

  test("behind the traefik rewrite the prefix is the public /me, elsewhere the basePath", () => {
    expect(resolveProfilePrefix(headersWith({ "x-replaced-path": "/me/security" }), "/ui/v2/login")).toBe("/me");
    expect(resolveProfilePrefix(headersWith({ "x-replaced-path": "/me" }), "/ui/v2/login")).toBe("/me");
    expect(resolveProfilePrefix(headersWith({ "x-replaced-path": "/media/x" }), "/ui/v2/login")).toBe("/ui/v2/login/me");
    expect(resolveProfilePrefix(headersWith({}), "/ui/v2/login")).toBe("/ui/v2/login/me");
    expect(resolveProfilePrefix(headersWith({}), "")).toBe("/me");
  });

  test("the browser decides the same from its address bar", () => {
    expect(profilePrefixFromPathname("/me/data", "/ui/v2/login")).toBe("/me");
    expect(profilePrefixFromPathname("/ui/v2/login/me/data", "/ui/v2/login")).toBe("/ui/v2/login/me");
    expect(profilePrefixFromPathname("/member", "/ui/v2/login")).toBe("/ui/v2/login/me");
  });

  test("a return target may only be the profile itself", () => {
    expect(isProfileReturnTarget("/me")).toBe(true);
    expect(isProfileReturnTarget("/me/security")).toBe(true);
    expect(isProfileReturnTarget("https://id.holycode.org/me", "id.holycode.org")).toBe(true);
    expect(isProfileReturnTarget("https://id.holycode.org/me/data", "id.holycode.org")).toBe(true);
    expect(isProfileReturnTarget("http://localhost:3011/me", "localhost:3011")).toBe(true);

    expect(isProfileReturnTarget("https://evil.example/me", "id.holycode.org")).toBe(false);
    expect(isProfileReturnTarget("https://id.holycode.org/loginname", "id.holycode.org")).toBe(false);
    expect(isProfileReturnTarget("https://id.holycode.org/me?x=1", "id.holycode.org")).toBe(false);
    expect(isProfileReturnTarget("//evil.example/me")).toBe(false);
    expect(isProfileReturnTarget("/me/../loginname")).toBe(false);
    expect(isProfileReturnTarget("/me/billing")).toBe(false);
    expect(isProfileReturnTarget("javascript:alert(1)")).toBe(false);
    expect(isProfileReturnTarget("")).toBe(false);
    expect(isProfileReturnTarget(undefined)).toBe(false);
  });
});

describe("sign-in methods and recommendations", () => {
  const T = AuthenticationMethodType;

  test("summarises the method types", () => {
    const s = summarizeAuthMethods([T.PASSWORD, T.IDP, T.TOTP]);
    expect(s).toMatchObject({
      password: true,
      idp: true,
      totp: true,
      passkey: false,
      secondFactor: true,
      passwordless: true,
      primaryCount: 2,
    });
    expect(summarizeAuthMethods(undefined).primaryCount).toBe(0);
    expect(summarizeAuthMethods([T.PASSKEY]).passwordless).toBe(true);
    expect(summarizeAuthMethods([T.OTP_EMAIL]).secondFactor).toBe(true);
  });

  test("password only: add a passkey and a second factor; unverified e-mail is a third", () => {
    expect(
      securityRecommendations({
        methods: summarizeAuthMethods([T.PASSWORD]),
        emailVerified: false,
        passkeysAllowed: true,
        secondFactorsOffered: true,
      }),
    ).toEqual(["passkey", "secondFactor", "verifyEmail"]);
  });

  test("a passkey is a second factor in itself", () => {
    expect(
      securityRecommendations({
        methods: summarizeAuthMethods([T.PASSWORD, T.PASSKEY]),
        emailVerified: true,
        passkeysAllowed: true,
        secondFactorsOffered: true,
      }),
    ).toEqual([]);
  });

  test("no advice for what the instance does not offer", () => {
    expect(
      securityRecommendations({
        methods: summarizeAuthMethods([T.PASSWORD]),
        emailVerified: true,
        passkeysAllowed: false,
        secondFactorsOffered: false,
      }),
    ).toEqual([]);
    expect(
      securityRecommendations({
        methods: summarizeAuthMethods([T.PASSWORD, T.TOTP]),
        emailVerified: true,
        passkeysAllowed: true,
        secondFactorsOffered: true,
      }),
    ).toEqual(["passkey"]);
  });

  test("counts recommendations per section for the nav badges", () => {
    expect(recommendationsBySection(["passkey", "secondFactor", "verifyEmail"])).toEqual({ security: 2, data: 1 });
    expect(recommendationsBySection([])).toEqual({});
  });

  test("never removes the last way in", () => {
    const idpOnly = summarizeAuthMethods([T.IDP]);
    expect(canRemoveSignInMethod(idpOnly, "idp", { passkeys: 0, idps: 1 })).toBe(false);
    expect(canRemoveSignInMethod(idpOnly, "idp", { passkeys: 0, idps: 2 })).toBe(true);
    expect(canRemoveSignInMethod(summarizeAuthMethods([T.PASSWORD, T.IDP]), "idp", { passkeys: 0, idps: 1 })).toBe(true);
    const passkeyOnly = summarizeAuthMethods([T.PASSKEY]);
    expect(canRemoveSignInMethod(passkeyOnly, "passkey", { passkeys: 1, idps: 0 })).toBe(false);
    expect(canRemoveSignInMethod(passkeyOnly, "passkey", { passkeys: 2, idps: 0 })).toBe(true);
    expect(canRemoveSignInMethod(summarizeAuthMethods([T.PASSKEY, T.IDP]), "passkey", { passkeys: 1, idps: 1 })).toBe(true);
  });
});

describe("theme preference in the ID metadata", () => {
  test("accepts light/dark/system as text or bytes, refuses the rest", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference(" Light ")).toBe("light");
    expect(parseThemePreference(new TextEncoder().encode("system"))).toBe("system");
    expect(parseThemePreference("blue")).toBeNull();
    expect(parseThemePreference("")).toBeNull();
    expect(parseThemePreference(undefined)).toBeNull();
    expect(parseThemePreference(null)).toBeNull();
  });
});

describe("names", () => {
  test("public handle from a username or an e-mail-shaped username", () => {
    expect(publicHandle("event74")).toBe("@event74");
    expect(publicHandle("event74@ya.ru")).toBe("@event74");
    expect(publicHandle("  ")).toBe("");
    expect(publicHandle(undefined)).toBe("");
  });

  test("full name, salutation and their fallbacks", () => {
    expect(fullName({ givenName: "Родион", familyName: "Отлетов" }, "event74@ya.ru")).toBe("Родион Отлетов");
    expect(fullName({ givenName: "", familyName: "", displayName: "Event 74" }, "event74@ya.ru")).toBe("Event 74");
    expect(fullName(undefined, "event74@ya.ru")).toBe("event74@ya.ru");
    expect(salutation({ givenName: "Родион", familyName: "Отлетов", displayName: "Родион" })).toBe("Родион");
    expect(salutation({ givenName: "Родион", familyName: "Отлетов", displayName: "Родион Отлетов" })).toBe("Родион");
    expect(salutation({ givenName: "", familyName: "", displayName: "" })).toBe("");
  });

  test("the name form needs both names and trims everything", () => {
    expect(validateNameForm({ givenName: "  Родион ", familyName: "Отлетов", displayName: "" })).toEqual({
      ok: true,
      givenName: "Родион",
      familyName: "Отлетов",
      displayName: "Родион Отлетов",
    });
    expect(validateNameForm({ givenName: "", familyName: "Отлетов", displayName: "" })).toEqual({
      ok: false,
      field: "givenName",
    });
    expect(validateNameForm({ givenName: "Р", familyName: " ", displayName: "" })).toEqual({
      ok: false,
      field: "familyName",
    });
    expect(validateNameForm({ givenName: "Р", familyName: "О", displayName: "x".repeat(201) })).toEqual({
      ok: false,
      field: "displayName",
    });
  });

  test("e-mail plausibility", () => {
    expect(isPlausibleEmail("event74@ya.ru")).toBe(true);
    expect(isPlausibleEmail("nope")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
    expect(isPlausibleEmail("a b@c.d")).toBe(false);
  });
});

describe("language kept in the ID", () => {
  test('an unset language comes back as empty, not as "root"', () => {
    expect(normalizeLanguageTag("ru")).toBe("ru");
    expect(normalizeLanguageTag("en-US")).toBe("en-US");
    expect(normalizeLanguageTag(" de ")).toBe("de");
    expect(normalizeLanguageTag("root")).toBe("");
    expect(normalizeLanguageTag("und")).toBe("");
    expect(normalizeLanguageTag("")).toBe("");
    expect(normalizeLanguageTag(undefined)).toBe("");
    expect(normalizeLanguageTag("not a tag!")).toBe("");
  });
});
