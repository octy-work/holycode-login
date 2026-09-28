import { describe, expect, test } from "vitest";
import { brandTotpUri, totpIssuerFromEnv } from "./totp-issuer";

const SECRET = "JBSWY3DPEHPK3PXP";

describe("brandTotpUri", () => {
  test("replaces the ZITADEL issuer in the label and the issuer parameter", () => {
    const uri = `otpauth://totp/ZITADEL:alice@example.com?algorithm=SHA1&digits=6&issuer=ZITADEL&period=30&secret=${SECRET}`;

    expect(brandTotpUri(uri, "HolyCode")).toBe(
      `otpauth://totp/HolyCode:alice@example.com?algorithm=SHA1&digits=6&issuer=HolyCode&period=30&secret=${SECRET}`,
    );
  });

  test("replaces a domain issuer (SystemDefaults issuer = requested domain)", () => {
    const uri = `otpauth://totp/id.holycode.org:bob?algorithm=SHA1&digits=6&issuer=id.holycode.org&period=30&secret=${SECRET}`;

    expect(brandTotpUri(uri, "HolyCode")).toBe(
      `otpauth://totp/HolyCode:bob?algorithm=SHA1&digits=6&issuer=HolyCode&period=30&secret=${SECRET}`,
    );
  });

  test("a label without a colon is the account; the issuer parameter is added when missing", () => {
    const uri = `otpauth://totp/alice@example.com?secret=${SECRET}`;

    expect(brandTotpUri(uri, "HolyCode")).toBe(`otpauth://totp/HolyCode:alice@example.com?secret=${SECRET}&issuer=HolyCode`);
  });

  test("keeps every other parameter verbatim, in order", () => {
    const uri = `otpauth://totp/ZITADEL%3Aalice?secret=${SECRET}&issuer=ZITADEL&algorithm=SHA256&digits=8&period=60&image=https%3A%2F%2Fx.test%2Fa.png`;
    const branded = brandTotpUri(uri, "HolyCode");

    expect(branded).toBe(
      `otpauth://totp/HolyCode:alice?secret=${SECRET}&issuer=HolyCode&algorithm=SHA256&digits=8&period=60&image=https%3A%2F%2Fx.test%2Fa.png`,
    );
    const parsed = new URL(branded);
    expect(parsed.searchParams.get("secret")).toBe(SECRET);
    expect(parsed.searchParams.get("algorithm")).toBe("SHA256");
    expect(parsed.searchParams.get("digits")).toBe("8");
    expect(parsed.searchParams.get("period")).toBe("60");
    expect(parsed.searchParams.getAll("issuer")).toEqual(["HolyCode"]);
  });

  test("encodes spaces and special characters in the account and the brand", () => {
    const uri = `otpauth://totp/ZITADEL:J%C3%BCrgen%20M%C3%BCller%2Btag@example.com?secret=${SECRET}&issuer=ZITADEL`;
    const branded = brandTotpUri(uri, "Holy Code");

    expect(branded).toBe(
      `otpauth://totp/Holy%20Code:J%C3%BCrgen%20M%C3%BCller%2Btag@example.com?secret=${SECRET}&issuer=Holy%20Code`,
    );
    const parsed = new URL(branded);
    expect(decodeURIComponent(parsed.pathname.slice(1))).toBe("Holy Code:Jürgen Müller+tag@example.com");
    expect(parsed.searchParams.get("issuer")).toBe("Holy Code");
  });

  test("only the first colon splits issuer and account; a space after it is dropped", () => {
    const uri = `otpauth://totp/ZITADEL:%20user:with:colons?secret=${SECRET}&issuer=ZITADEL`;

    expect(brandTotpUri(uri, "HolyCode")).toBe(
      `otpauth://totp/HolyCode:user%3Awith%3Acolons?secret=${SECRET}&issuer=HolyCode`,
    );
  });

  test("passes through anything that is not an otpauth URI", () => {
    for (const input of [
      "",
      "https://id.holycode.org/otpauth://totp/x",
      "otpauth-migration://offline?data=abc",
      "not a uri",
    ]) {
      expect(brandTotpUri(input, "HolyCode")).toBe(input);
    }
  });

  test("passes through with an empty brand or a malformed label", () => {
    const uri = `otpauth://totp/ZITADEL:alice?secret=${SECRET}&issuer=ZITADEL`;
    expect(brandTotpUri(uri, "")).toBe(uri);
    expect(brandTotpUri(uri, "   ")).toBe(uri);

    const malformed = `otpauth://totp/ZITADEL:%E0%A4%A?secret=${SECRET}&issuer=ZITADEL`;
    expect(brandTotpUri(malformed, "HolyCode")).toBe(malformed);
  });
});

describe("totpIssuerFromEnv", () => {
  test("HC_TOTP_ISSUER wins", () => {
    expect(totpIssuerFromEnv({ HC_TOTP_ISSUER: " Octy ", NEXT_PUBLIC_BRAND_WORDMARK: "Holy|Code" })).toBe("Octy");
  });

  test("falls back to the word-mark without the gradient separator", () => {
    expect(totpIssuerFromEnv({ NEXT_PUBLIC_BRAND_WORDMARK: "Holy|Code" })).toBe("HolyCode");
    expect(totpIssuerFromEnv({ HC_TOTP_ISSUER: "", NEXT_PUBLIC_BRAND_WORDMARK: "Acme" })).toBe("Acme");
  });

  test("defaults to HolyCode", () => {
    expect(totpIssuerFromEnv({})).toBe("HolyCode");
  });

  test("an explicitly empty word-mark (other tenant) keeps ZITADEL's issuer", () => {
    expect(totpIssuerFromEnv({ NEXT_PUBLIC_BRAND_WORDMARK: "" })).toBe("");
  });
});
