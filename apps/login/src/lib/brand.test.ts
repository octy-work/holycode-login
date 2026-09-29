import { describe, expect, test } from "vitest";
import { accentTokens, brandWordmarkFromEnv, hexToRgb, isTenantBrand, luminance, tenantAccentCss } from "./brand";

describe("brandWordmarkFromEnv", () => {
  test("runtime HC_BRAND_WORDMARK wins, even when empty (tenant mode)", () => {
    expect(brandWordmarkFromEnv({ HC_BRAND_WORDMARK: "", NEXT_PUBLIC_BRAND_WORDMARK: "Holy|Code" })).toBe("");
    expect(brandWordmarkFromEnv({ HC_BRAND_WORDMARK: " Octy ", NEXT_PUBLIC_BRAND_WORDMARK: "Holy|Code" })).toBe("Octy");
  });
  test("falls back to the build-time value, then to HolyCode", () => {
    expect(brandWordmarkFromEnv({ NEXT_PUBLIC_BRAND_WORDMARK: "" })).toBe("");
    expect(brandWordmarkFromEnv({})).toBe("Holy|Code");
  });
  test("only an empty word-mark is tenant mode", () => {
    expect(isTenantBrand("")).toBe(true);
    expect(isTenantBrand("Holy|Code")).toBe(false);
    expect(isTenantBrand(undefined)).toBe(false);
  });
});

describe("tenant accent", () => {
  test("hex parsing", () => {
    expect(hexToRgb("#DAFC04")).toEqual([218, 252, 4]);
    expect(hexToRgb("fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("lime")).toBeNull();
    expect(hexToRgb(undefined)).toBeNull();
  });
  test("a light accent (Octy lime) gets dark text on buttons and a darker link on white", () => {
    const lime = hexToRgb("#DAFC04")!;
    expect(luminance(lime)).toBeGreaterThan(0.45);
    const light = accentTokens(lime, false);
    expect(light["--hc-on-accent"]).toBe("#0b0b12");
    expect(light["--hc-p600"]).toBe("#dafc04");
    expect(luminance(hexToRgb(light["--hc-link"])!)).toBeLessThan(0.4);
    expect(accentTokens(lime, true)["--hc-link"]).toBe("#dafc04");
  });
  test("a dark accent keeps white button text and a lighter link on the dark card", () => {
    const navy = hexToRgb("#1e3a8a")!;
    expect(accentTokens(navy, false)["--hc-on-accent"]).toBe("#ffffff");
    expect(luminance(hexToRgb(accentTokens(navy, true)["--hc-link"])!)).toBeGreaterThan(luminance(navy));
  });
  test("CSS for both themes; one colour serves both; no colour — nothing", () => {
    const css = tenantAccentCss("#DAFC04", "");
    expect(css).toContain("html:not(.dark){--hc-p600:#dafc04;");
    expect(css).toContain("html.dark{--hc-p600:#dafc04;");
    expect(tenantAccentCss("", "not-a-colour")).toBe("");
  });
});
