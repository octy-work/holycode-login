import { describe, expect, test } from "vitest";
import { describeDevice, dots, isJustNow } from "./format";

describe("profile formatting", () => {
  test('describes a device from what is known, never as "unknown"', () => {
    expect(describeDevice({ browser: "Safari 17", os: "macOS", kind: "desktop" })).toBe("macOS · Safari 17");
    expect(describeDevice({ browser: "Safari", os: "", kind: "phone" })).toBe("phone · Safari");
    expect(describeDevice({ browser: "", os: "", kind: "unknown" })).toBe("");
    expect(describeDevice({ browser: "curl", os: "", kind: "unknown" })).toBe("curl");
    expect(describeDevice(null)).toBe("");
  });

  test('joins the non-empty parts and knows what "just now" is', () => {
    expect(dots("a", "", undefined, "b", false, "c")).toBe("a · b · c");
    const now = Date.parse("2026-09-27T20:00:00Z");
    expect(isJustNow("2026-09-27T19:59:00Z", now)).toBe(true);
    expect(isJustNow("2026-09-27T19:50:00Z", now)).toBe(false);
    expect(isJustNow(undefined, now)).toBe(false);
  });
});
