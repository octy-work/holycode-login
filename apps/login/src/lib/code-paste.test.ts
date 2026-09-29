import { describe, expect, test } from "vitest";
import { extractCode, normalizeCode } from "./code-paste";

describe("extractCode", () => {
  test("bare code, any case", () => {
    expect(extractCode("FQ6US6", 6, "text")).toBe("FQ6US6");
    expect(extractCode("fq6us6", 6, "text")).toBe("FQ6US6");
  });

  test("spaces, dashes and line breaks around or inside", () => {
    expect(extractCode("  FQ6 US6\n", 6, "text")).toBe("FQ6US6");
    expect(extractCode("123-456", 6, "numeric")).toBe("123456");
  });

  test("a sentence copied from the e-mail", () => {
    expect(extractCode("Please use the button below to verify your email. (Code FQ6US6) If you", 6, "text")).toBe("FQ6US6");
    expect(extractCode("Код подтверждения: FQ6US6", 6, "text")).toBe("FQ6US6");
  });

  test("prefers the token that looks like a code over a six-letter word", () => {
    expect(extractCode("Verify FQ6US6", 6, "text")).toBe("FQ6US6");
  });

  test("numeric codes of other lengths", () => {
    expect(extractCode("Your OTP is 12345678.", 8, "numeric")).toBe("12345678");
    expect(extractCode("1234567", 8, "numeric")).toBeUndefined();
  });

  test("nothing code-like", () => {
    expect(extractCode("hello", 6, "text")).toBeUndefined();
    expect(extractCode("", 6, "numeric")).toBeUndefined();
  });
});

describe("normalizeCode", () => {
  test("upper-cases text codes only", () => {
    expect(normalizeCode("fq6us6", "text")).toBe("FQ6US6");
    expect(normalizeCode("123", "numeric")).toBe("123");
  });
});
