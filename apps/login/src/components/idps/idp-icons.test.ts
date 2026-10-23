import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";
import { describe, expect, test } from "vitest";
import { detectIdpBrand } from "./idp-icons";

describe("detectIdpBrand", () => {
  test("built-in providers by type", () => {
    expect(detectIdpBrand(IdentityProviderType.GITHUB)).toBe("github");
    expect(detectIdpBrand(IdentityProviderType.APPLE, "whatever")).toBe("apple");
  });

  test("generic providers by name: HolyCode gets its emblem, not the initial", () => {
    expect(detectIdpBrand(IdentityProviderType.OIDC, "HolyCode")).toBe("holycode");
    expect(detectIdpBrand(IdentityProviderType.OIDC, "Holy Code ID")).toBe("holycode");
    expect(detectIdpBrand(IdentityProviderType.OIDC, "Войти через ХолиКод")).toBe("holycode");
    expect(detectIdpBrand(IdentityProviderType.OIDC, "Yandex ID")).toBe("yandex");
    expect(detectIdpBrand(IdentityProviderType.OIDC, "Corporate SSO")).toBe("generic");
    expect(detectIdpBrand(IdentityProviderType.OIDC)).toBe("generic");
  });
});
