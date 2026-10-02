import { describe, expect, test } from "vitest";
import {
  CONSENT_VERSION,
  functionalCookiesAllowed,
  hasConsents,
  localPartProblem,
  parseCookieConsent,
  parseSignupState,
  serializeSignupState,
  suggestLocalParts,
  transliterate,
} from "./signup";

describe("signup state cookie", () => {
  test("round-trips who, consents, request and the reservation", () => {
    const state = {
      who: "team" as const,
      terms: CONSENT_VERSION,
      pd: CONSENT_VERSION,
      requestId: "oidc_1",
      organization: "392454771388186628",
      reservation: { id: "res_abc", address: "rodion@holycode.org", aliases: ["rodion@sozv.one"] },
    };
    expect(parseSignupState(serializeSignupState(state))).toEqual(state);
  });

  test("drops anything malformed instead of trusting it", () => {
    expect(parseSignupState("nope")).toBeNull();
    expect(parseSignupState(JSON.stringify({ v: 2, w: "personal" }))).toBeNull();
    expect(parseSignupState(JSON.stringify({ v: 1, w: "admin" }))).toBeNull();
    const odd = parseSignupState(
      JSON.stringify({ v: 1, w: "personal", t: "yesterday", m: { i: "r1", a: "Not An Address" }, r: "<script>" }),
    );
    expect(odd).toEqual({ who: "personal" });
  });

  test("consents count only for the current version", () => {
    expect(hasConsents({ who: "personal", terms: CONSENT_VERSION, pd: CONSENT_VERSION })).toBe(true);
    expect(hasConsents({ who: "personal", terms: CONSENT_VERSION })).toBe(false);
    expect(hasConsents({ who: "personal", terms: "2020-01-01", pd: "2020-01-01" })).toBe(false);
    expect(hasConsents(null)).toBe(false);
  });
});

describe("cookie consent", () => {
  test("only 'necessary' switches the functional cookies off", () => {
    expect(parseCookieConsent("all")).toBe("all");
    expect(parseCookieConsent("necessary")).toBe("necessary");
    expect(parseCookieConsent("everything")).toBeNull();
    expect(functionalCookiesAllowed("necessary")).toBe(false);
    expect(functionalCookiesAllowed("all")).toBe(true);
    expect(functionalCookiesAllowed(null)).toBe(true);
  });
});

describe("mailbox names", () => {
  test("the same rules as Daenerys", () => {
    expect(localPartProblem("rodion.otletov")).toBeNull();
    expect(localPartProblem("r-o_d1")).toBeNull();
    expect(localPartProblem("abc")).toBe("short");
    expect(localPartProblem("")).toBe("short");
    expect(localPartProblem("a b")).toBe("invalid");
    expect(localPartProblem(".rodion")).toBe("invalid");
    expect(localPartProblem("rodion.")).toBe("invalid");
    expect(localPartProblem("rod..ion")).toBe("invalid");
    expect(localPartProblem("Родион")).toBe("invalid");
    expect(localPartProblem("x".repeat(65))).toBe("invalid");
  });

  test("suggestions from the name, transliterated", () => {
    expect(transliterate("Щука Ёж")).toBe("shchuka ezh");
    expect(suggestLocalParts("Родион", "Отлетов")).toEqual(["rodion.otletov", "rodion", "r.otletov", "otletov.rodion"]);
    expect(suggestLocalParts("Ann", "")).toEqual([]);
  });
});
