import { describe, expect, test } from "vitest";
import { normalizeContour, parseContourPreference, PROFILE_CONTOUR_MODE, resolveContour } from "./contour";
import { normalizePalette, PALETTE_IDS, paletteCss, parsePalettePreference, resolvePalette } from "./palette";

describe("контур из профиля ID и cookie hc_contour", () => {
  test("метаданные (байты) побеждают cookie; без них — cookie; иначе all", () => {
    const bytes = new TextEncoder().encode(" US ");
    expect(parseContourPreference(bytes)).toBe("us");
    expect(resolveContour(parseContourPreference(bytes), "ru")).toBe("us");
    expect(resolveContour(null, "ru")).toBe("ru");
    expect(resolveContour(parseContourPreference("eu"), "bad")).toBe("all");
    expect(normalizeContour(undefined)).toBeNull();
  });

  test("в профиле переключатель показан неактивным (флаг одной строкой)", () => {
    expect(PROFILE_CONTOUR_MODE).toBe("disabled");
  });
});

describe("палитра из профиля ID и cookie hc_palette", () => {
  test("ключи — как PALETTE_IDS эталона", () => {
    expect(PALETTE_IDS).toEqual([
      "classic",
      "midnight",
      "twitter",
      "claude",
      "neo-brutalism",
      "business",
      "neutral",
      "octy",
      "blackcoach",
    ]);
  });

  test("метаданные побеждают cookie; незнакомый ключ профиля — cookie; ничего — classic", () => {
    expect(resolvePalette(parsePalettePreference(new TextEncoder().encode("midnight")), "claude")).toBe("midnight");
    expect(resolvePalette(parsePalettePreference("rainbow"), "claude")).toBe("claude");
    expect(resolvePalette(null, undefined)).toBe("classic");
    expect(normalizePalette("Octy")).toBe("octy");
  });

  test("classic не меняет токены; палитра переопределяет акцент обеих тем", () => {
    expect(paletteCss("classic")).toBe("");
    expect(paletteCss("nope")).toBe("");
    const css = paletteCss("twitter");
    expect(css).toMatch(/^html:not\(\.dark\)\{.*\}html\.dark\{.*\}$/);
    expect(css).toContain("--hc-p600:#1d9bf0;");
    expect(css).toContain("--hc-on-accent:#ffffff;");
    expect(css).toMatch(/--hc-p400:oklch\([\d.]+ [\d.]+ 245\);/);
    expect(css).toMatch(/--hc-soft:oklch\(0\.62 0\.15 245 \/ 0\.08\);/);
    // «Полночь» — градиент кнопки
    expect(paletteCss("midnight")).toContain("--hc-btn-from:#a9de5c;");
    // «Нейтральная» в светлой теме: бледная кнопка меняется местами с текстом
    expect(paletteCss("neutral")).toMatch(/^html:not\(\.dark\)\{--hc-p600:#18181b;/);
  });
});
