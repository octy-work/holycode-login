import { describe, expect, test } from "vitest";
import { normalizeUserCode } from "./device-code";

describe("normalizeUserCode", () => {
  test("typed any way → XXXX-XXXX", () => {
    expect(normalizeUserCode("kvqw-rwbv")).toBe("KVQW-RWBV");
    expect(normalizeUserCode(" KVQWRWBV ")).toBe("KVQW-RWBV");
    expect(normalizeUserCode("KVQW RWBV")).toBe("KVQW-RWBV");
  });
});
