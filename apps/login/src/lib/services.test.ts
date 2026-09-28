import { describe, expect, test } from "vitest";
import {
  buildServiceHref,
  canOpenAdmin,
  DEFAULT_SERVICES,
  fallbackServices,
  normalizeService,
  normalizeServices,
  parseServicesEnv,
} from "./services";

const PROFILE = "https://id.holycode.org/me/security";

describe("buildServiceHref(): the link into a service with the organization and the way back", () => {
  test("adds org and return_to to the service's address", () => {
    const href = buildServiceHref("https://build.holycode.org/", { org: "acct-event74", returnTo: PROFILE });
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://build.holycode.org/");
    expect(url.searchParams.get("org")).toBe("acct-event74");
    expect(url.searchParams.get("return_to")).toBe(PROFILE);
  });

  test("keeps the address's own parameters and overwrites its own", () => {
    const href = buildServiceHref("https://chat.holycode.org/chat?tab=general&org=old", {
      org: "acct-new",
      returnTo: PROFILE,
    });
    const url = new URL(href);
    expect(url.searchParams.get("tab")).toBe("general");
    expect(url.searchParams.get("org")).toBe("acct-new");
    expect(url.searchParams.getAll("org")).toHaveLength(1);
  });

  test("without an organization and a way back — the address as it is", () => {
    expect(buildServiceHref("https://mail.holycode.org/")).toBe("https://mail.holycode.org/");
    expect(buildServiceHref("https://mail.holycode.org/", { org: "  ", returnTo: "" })).toBe("https://mail.holycode.org/");
  });

  test("a bad address — an empty string (the tile does not become a link)", () => {
    expect(buildServiceHref("", { org: "acct-x" })).toBe("");
    expect(buildServiceHref("not a url", { org: "acct-x" })).toBe("");
    expect(buildServiceHref("javascript:alert(1)", { org: "acct-x" })).toBe("");
    expect(buildServiceHref(undefined)).toBe("");
  });
});

describe("the directory: Daenerys' answer and the fallback list", () => {
  test("normalises the answer: key, address, status.text, organization", () => {
    const { services, org } = normalizeServices({
      services: [
        { key: "CHAT", name: "HolyCode", url: "https://chat.holycode.org/", icon: "chat", kind: "app" },
        { key: "build", name: "HolyBuild", url: "https://build.holycode.org/", status: { text: "3 сборки идут" } },
        { key: "build", name: "Дубль", url: "https://other.example/" },
        { key: "panel", name: "Панель", url: "ftp://daenerys.holycode.org/" },
        { key: "mail", url: "" },
        { key: "bad key!", url: "https://x.example/" },
        null,
        "строка",
      ],
      org: { account_id: "acct-event74", name: "Event74", role: "OWNER" },
    });
    expect(services.map((service) => service.key)).toEqual(["chat", "build"]);
    expect(services[0].name).toBe("HolyCode");
    expect(services[1].status?.text).toBe("3 сборки идут");
    expect(services[0].status).toBeUndefined();
    expect(org).toEqual({ account_id: "acct-event74", name: "Event74", role: "owner" });
  });

  test("an empty or foreign answer — an empty list without an organization", () => {
    expect(normalizeServices(null)).toEqual({ services: [], org: null });
    expect(normalizeServices({ services: "нет" })).toEqual({ services: [], org: null });
    expect(normalizeServices({ org: { name: "без id" } })).toEqual({ services: [], org: null });
    expect(normalizeService({ key: "chat" })).toBeNull();
  });

  test("the panel is listed only when the server hands it out (owners and admins) — the fallback never has it", () => {
    const owner = normalizeServices({
      services: [
        { key: "chat", name: "HolyCode", url: "https://chat.holycode.org/" },
        { key: "panel", name: "Панель", url: "https://daenerys.holycode.org/" },
      ],
      org: { account_id: "acct-1", name: "Event74", role: "owner" },
    });
    expect(owner.services.map((s) => s.key)).toContain("panel");
    const member = normalizeServices({
      services: [{ key: "chat", name: "HolyCode", url: "https://chat.holycode.org/" }],
      org: { account_id: "acct-1", name: "Event74", role: "member" },
    });
    expect(member.services.map((s) => s.key)).not.toContain("panel");
    expect(DEFAULT_SERVICES.some((service) => service.key === "panel")).toBe(false);
    expect(fallbackServices("").some((service) => service.key === "panel")).toBe(false);
  });

  test("the fallback list — production addresses without the panel and without mail", () => {
    // Mail is the Stalwart admin console with its own accounts (owner, 28.09.2026):
    // only the server hands it out, and only to admins — never the fallback.
    const services = fallbackServices("");
    expect(services.map((service) => service.key)).toEqual(["chat", "build", "agent", "profile"]);
    expect(services.find((service) => service.key === "chat")?.url).toBe("https://chat.holycode.org/");
    expect(services.find((service) => service.key === "profile")?.url).toBe("https://id.holycode.org/me");
    expect(services.some((service) => service.key === "mail")).toBe(false);
    expect(services).not.toBe(DEFAULT_SERVICES);
    expect(fallbackServices(undefined).map((s) => s.key)).toEqual(["chat", "build", "agent", "profile"]);
  });

  test("HC_PROFILE_SERVICES as JSON: an array or { services }, rubbish — production addresses", () => {
    const list = JSON.stringify([{ key: "chat", name: "Чат стенда", url: "https://chat-dev.holycode.org/" }]);
    expect(parseServicesEnv(list)?.map((service) => service.url)).toEqual(["https://chat-dev.holycode.org/"]);
    expect(parseServicesEnv(JSON.stringify({ services: JSON.parse(list) }))?.[0].name).toBe("Чат стенда");
    expect(parseServicesEnv("{")).toBeNull();
    expect(parseServicesEnv("[]")).toBeNull();
    expect(parseServicesEnv("")).toBeNull();
    expect(fallbackServices("{not json")).toHaveLength(DEFAULT_SERVICES.length);
  });

  test("HC_PROFILE_SERVICES in the short form: key|Name|url, and the older Name|url with the key from the host", () => {
    const explicit = parseServicesEnv(
      "chat|Чат|https://chat-dev.holycode.org/,build|Сборки|https://build-dev.holycode.org/|build|app",
    );
    expect(explicit?.map((s) => [s.key, s.name, s.url])).toEqual([
      ["chat", "Чат", "https://chat-dev.holycode.org/"],
      ["build", "Сборки", "https://build-dev.holycode.org/"],
    ]);
    // The value the profile shipped with before the switcher (THEME_HOLYCODE.md).
    const legacy = parseServicesEnv(
      "HolyChat|https://chat.holycode.org,Build|https://build.holycode.org,Agent|https://agent.holycode.org",
    );
    expect(legacy?.map((s) => s.key)).toEqual(["chat", "build", "agent"]);
    expect(legacy?.[0].name).toBe("HolyChat");
    expect(legacy?.[0].kind).toBe("app");
    const byName = parseServicesEnv("HolyBuild|https://example.test/,Profile|https://id.holycode.org/me");
    expect(byName?.map((s) => [s.key, s.kind])).toEqual([
      ["build", "app"],
      ["profile", "profile"],
    ]);
    expect(parseServicesEnv("garbage,also|garbage")).toBeNull();
  });
});

describe("canOpenAdmin(): the organization admin is for owners and admins", () => {
  test("by role, case-insensitively; nothing for members, viewers and unknown", () => {
    expect(canOpenAdmin("owner")).toBe(true);
    expect(canOpenAdmin("Admin")).toBe(true);
    expect(canOpenAdmin("member")).toBe(false);
    expect(canOpenAdmin("viewer")).toBe(false);
    expect(canOpenAdmin("")).toBe(false);
    expect(canOpenAdmin(undefined)).toBe(false);
    expect(canOpenAdmin(null)).toBe(false);
  });
});
