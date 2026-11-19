import { createNotificationsFeed } from "@/lib/notifications";
import { localizedServiceName } from "@/lib/services";
import { backName } from "@/lib/topbar";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ContourSwitch } from "./contour-switch";
import { NotificationBell } from "./notification-bell";
import { serviceName } from "./service-switcher";

// Английская страница: словарь как locales/en.json.
const EN: Record<string, string> = {
  "profile.switcher.name.profile": "Profile",
  "profile.switcher.name.mail": "Mail",
  "profile.switcher.name.panel": "Daenerys",
  "profile.topbar.contour.label": "Contour filter",
  "profile.topbar.contour.all": "All",
  "profile.topbar.contour.ru": "Russia",
  "profile.topbar.contour.us": "USA",
  "profile.topbar.contour.short.all": "All",
  "profile.topbar.contour.short.ru": "RU",
  "profile.topbar.contour.short.us": "US",
  "profile.topbar.contour.disabled": "This service does not split data by contour",
  "profile.topbar.bell.label": "Notifications",
  "profile.topbar.bell.title": "Notifications: {n}",
  "profile.topbar.bell.empty": "All clear",
  "profile.topbar.bell.stale": "Daenerys is unreachable: showing the last known state",
  "profile.topbar.bell.severity.bad": "urgent",
  "profile.topbar.bell.severity.warn": "waiting",
};

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) =>
    (EN[`${ns}.${key}`] ?? key).replace("{n}", String(values?.n ?? "")),
  useLocale: () => "en",
}));

const SERVICES = [
  { key: "panel", name: "Daenerys", url: "https://daenerys.holycode.org/", icon: "panel", kind: "app" },
  { key: "profile", name: "Профиль", url: "https://id.holycode.org/me", icon: "profile", kind: "profile" },
  { key: "mail", name: "Почта", url: "https://mail.holycode.org/", icon: "mail", kind: "mail" },
];
const ORG = { account_id: "acct-1", name: "Event74", role: "owner" };

afterEach(() => cleanup());

describe("подписи плиток на языке профиля", () => {
  const t = ((key: string) => EN[`profile.switcher.${key}`] ?? key) as never;

  test("«Профиль», «Почта» от справочника — в EN «Profile», «Mail»; своё имя white-label — как есть", () => {
    expect(serviceName(SERVICES[1], t)).toBe("Profile");
    expect(serviceName(SERVICES[2], t)).toBe("Mail");
    expect(serviceName({ key: "mail", name: "Octy Почта" }, t)).toBe("Octy Почта");
    expect(serviceName({ key: "profile", name: "" }, t)).toBe("Profile");
    expect(serviceName({ key: "vibedo", name: "Vibedo" }, t)).toBe("Vibedo");
    expect(localizedServiceName("Profile", "profile", "Профиль")).toBe("Профиль");
  });

  test("«← Назад в …» — тоже на языке страницы", () => {
    const back = { href: "https://mail.holycode.org/", host: "mail.holycode.org", key: "mail", name: "Почта" };
    expect(backName(back, (key) => EN[`profile.switcher.name.${key}`] ?? "")).toBe("Mail");
    expect(backName({ ...back, key: "", name: "" })).toBe("mail.holycode.org");
  });
});

describe("переключатель контура в полосе профиля", () => {
  test("неактивен: текущий выбор виден, кнопки disabled, подсказка про контуры; короткие подписи для телефона", () => {
    const { getByTestId } = render(<ContourSwitch value="us" disabled />);
    const nav = getByTestId("contour-switch");
    expect(nav.getAttribute("title")).toBe("This service does not split data by contour");
    expect(nav.getAttribute("aria-disabled")).toBe("true");
    for (const key of ["all", "ru", "us"]) {
      const button = getByTestId(`contour-switch-${key}`) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-pressed")).toBe(key === "us" ? "true" : "false");
    }
    expect(getByTestId("contour-switch-ru").textContent).toBe("RussiaRU");
  });
});

describe("колокольчик в полосе профиля", () => {
  const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  test("бейдж 99+, статус цветным словом, пункт ведёт в чужой сервис с section, org и return_to", async () => {
    const feed = createNotificationsFeed({ doc: null });
    const fetcher = vi.fn(() =>
      response({
        total: 120,
        items: [
          { key: "builds", count: 3, title_en: "Failed builds", service: "panel", section: "builds", severity: "bad" },
        ],
      }),
    );
    feed.configure({ fetcher });
    const view = render(
      <NotificationBell
        daenerysUrl=""
        services={SERVICES}
        org={ORG}
        feed={feed}
        defaultOpen
        getReturnTo={() => "https://id.holycode.org/me"}
      />,
    );
    await act(async () => {
      await feed.refresh({ force: true });
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://daenerys-api.holycode.org/api/notifications/summary",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(view.getByTestId("notification-bell-badge").textContent).toBe("99+");
    const item = view.getByTestId("notification-bell-item-builds") as HTMLAnchorElement;
    const href = new URL(item.href);
    expect(href.host).toBe("daenerys.holycode.org");
    expect(href.searchParams.get("section")).toBe("builds");
    expect(href.searchParams.get("org")).toBe("acct-1");
    expect(href.searchParams.get("return_to")).toBe("https://id.holycode.org/me");
    expect(view.getByTestId("notification-bell-state").textContent).toBe("urgent");
    expect(view.getByTestId("notification-bell-state").className).toContain("text-hc-err");
    expect(item.textContent).toContain("Daenerys");
    feed.reset();
  });

  test("пусто — «All clear»; ошибка после удачного — последнее известное и пометка", async () => {
    const feed = createNotificationsFeed({ doc: null });
    let status = 200;
    feed.configure({ fetcher: () => response({ items: [] }, status) });
    const view = render(<NotificationBell daenerysUrl="" services={SERVICES} org={null} feed={feed} defaultOpen />);
    await act(async () => {
      await feed.refresh({ force: true });
    });
    expect(view.getByTestId("notification-bell-empty").textContent).toBe("All clear");
    expect(view.queryByTestId("notification-bell-badge")).toBeNull();
    status = 502;
    await act(async () => {
      await feed.refresh({ force: true });
    });
    expect(view.getByTestId("notification-bell-stale").textContent).toContain("Daenerys is unreachable");
    feed.reset();
  });

  test("без сессии Daenerys — без опроса и без числа", () => {
    const feed = createNotificationsFeed({ doc: null });
    const fetcher = vi.fn(() => response({ total: 5, items: [] }));
    feed.configure({ fetcher });
    const view = render(<NotificationBell daenerysUrl="" enabled={false} services={SERVICES} org={null} feed={feed} />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(view.queryByTestId("notification-bell-badge")).toBeNull();
    expect(view.getByTestId("notification-bell-button").getAttribute("aria-label")).toBe("Notifications");
  });
});
