import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  badgeText,
  createNotificationsFeed,
  normalizeSummary,
  notificationHref,
  NOTIFICATIONS_MIN_GAP_MS,
  NOTIFICATIONS_POLL_MS,
  notificationTitle,
} from "./notifications";

const SERVICES = [
  { key: "build", name: "HolyBuild", url: "https://build.holycode.org/", icon: "build", kind: "app" },
  { key: "panel", name: "Daenerys", url: "https://daenerys.holycode.org/", icon: "panel", kind: "app" },
];

describe("нормализация сводки колокольчика", () => {
  test("пункты без ключа или с нулём отбрасываются, незнакомая важность — warn, чужой href — пусто", () => {
    const summary = normalizeSummary({
      items: [
        {
          key: "builds_failed",
          count: 3,
          title_ru: "Упали сборки",
          title_en: "Failed builds",
          service: "panel",
          section: "builds",
          severity: "bad",
        },
        { key: "approvals", count: "2", title: "Approvals", severity: "loud", href: "javascript:alert(1)" },
        { key: "", count: 5 },
        { key: "zero", count: 0 },
        { key: "cancelled", count: 7, severity: "muted", href: "https://daenerys.holycode.org/x" },
      ],
      generated_at: "2026-11-19T10:00:00Z",
    });
    expect(summary.items.map((i) => i.key)).toEqual(["builds_failed", "approvals", "cancelled"]);
    expect(summary.items[1]).toMatchObject({
      severity: "warn",
      title_ru: "Approvals",
      title_en: "Approvals",
      href: "",
      count: 2,
    });
    expect(summary.items[2].href).toBe("https://daenerys.holycode.org/x");
    // total без поля — сумма кроме muted
    expect(summary.total).toBe(5);
    expect(summary.generatedAt).toBe("2026-11-19T10:00:00Z");
  });

  test("total из ответа побеждает; мусор — пустая сводка", () => {
    expect(normalizeSummary({ items: [], total: 12 }).total).toBe(12);
    expect(normalizeSummary(null)).toEqual({ items: [], total: 0, generatedAt: "" });
    expect(normalizeSummary({ items: "x", total: null }).total).toBe(0);
  });

  test("подпись на языке страницы, бейдж 99+", () => {
    const [item] = normalizeSummary({ items: [{ key: "k", count: 1, title_ru: "Ждут", title_en: "Waiting" }] }).items;
    expect(notificationTitle(item, "ru")).toBe("Ждут");
    expect(notificationTitle(item, "en")).toBe("Waiting");
    expect(badgeText(0)).toBe("");
    expect(badgeText(7)).toBe("7");
    expect(badgeText(150)).toBe("99+");
  });

  test("ссылка пункта: адрес сервиса + section, org и return_to; свой href пункта — с теми же параметрами", () => {
    const opts = { services: SERVICES, org: "acct-1", returnTo: "https://id.holycode.org/me" };
    const href = new URL(notificationHref({ service: "panel", section: "builds", href: "" }, opts));
    expect(href.origin).toBe("https://daenerys.holycode.org");
    expect(href.searchParams.get("section")).toBe("builds");
    expect(href.searchParams.get("org")).toBe("acct-1");
    expect(href.searchParams.get("return_to")).toBe("https://id.holycode.org/me");
    const own = new URL(notificationHref({ service: "x", section: "", href: "https://build.holycode.org/tasks" }, opts));
    expect(own.pathname).toBe("/tasks");
    expect(own.searchParams.get("org")).toBe("acct-1");
    expect(notificationHref({ service: "unknown", section: "a", href: "" }, opts)).toBe("");
  });
});

describe("расписание опроса сводки", () => {
  let visibility: "visible" | "hidden";
  let handlers: Array<() => void>;
  const doc = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (_: string, fn: () => void) => handlers.push(fn),
    removeEventListener: (_: string, fn: () => void) => {
      handlers = handlers.filter((h) => h !== fn);
    },
  } as unknown as Document;
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T10:00:00Z"));
    visibility = "visible";
    handlers = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (fetcher: (url: string, init?: RequestInit) => Promise<Response>) => {
    const feed = createNotificationsFeed({ doc });
    feed.configure({ endpoint: "https://daenerys-api.holycode.org/api/notifications/summary", fetcher });
    return feed;
  };

  test("первый подписчик — запрос сразу с cookie, дальше раз в 60 с; второй подписчик запроса не добавляет", async () => {
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      return ok({ items: [{ key: "a", count: 1 }] });
    });
    const feed = make(fetcher);
    const seen: number[] = [];
    feed.subscribe((s) => seen.push(s.summary.total));
    feed.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS - 1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([1, 1]);
  });

  test("скрытая вкладка не опрашивает; возврат — сразу, но не чаще 30 с", async () => {
    const fetcher = vi.fn(() => ok({ items: [], total: 0 }));
    const feed = make(fetcher);
    feed.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS * 3);
    expect(fetcher).toHaveBeenCalledTimes(1);
    visibility = "visible";
    handlers.forEach((fn) => fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    // ещё раз сразу — пауза 30 с не пройдена
    visibility = "hidden";
    visibility = "visible";
    handlers.forEach((fn) => fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_MIN_GAP_MS);
    handlers.forEach((fn) => fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  test("в полёте один запрос; ошибка не стирает последнее удачное; отписка останавливает опрос", async () => {
    let fail = false;
    let release: (() => void) | null = null;
    const fetcher = vi.fn(() => {
      if (fail) return Promise.resolve(new Response("{}", { status: 503 }));
      return new Promise<Response>((resolve) => {
        release = () => resolve(new Response(JSON.stringify({ items: [{ key: "a", count: 4 }] }), { status: 200 }));
      });
    });
    const feed = make(fetcher);
    const off = feed.subscribe(() => {});
    void feed.refresh({ force: true });
    void feed.refresh({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.snapshot()).toMatchObject({ loaded: true, error: "" });
    fail = true;
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(feed.snapshot().summary.total).toBe(4);
    expect(feed.snapshot().error).toBe("http_503");
    off();
    expect(handlers).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS * 2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
