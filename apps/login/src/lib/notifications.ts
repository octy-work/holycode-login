/**
 * Колокольчик HolyCode — один во всех сервисах, общий список из Daenerys
 * (решение владельца 19.11.2026; эталон — switcher/notificationsFeed.js в
 * монорепо holycode). Опрос GET /api/notifications/summary — один на страницу,
 * сколько бы колокольчиков ни подписалось:
 *   • раз в NOTIFICATIONS_POLL_MS (60 с) и только при видимой вкладке;
 *   • при возврате во вкладку — сразу, но не чаще NOTIFICATIONS_MIN_GAP_MS (30 с);
 *   • в полёте не больше одного запроса;
 *   • ошибка не стирает последнее удачное — колокольчик показывает его.
 * Daenerys перегружен: чаще не опрашивать.
 *
 * Адрес — daenerys-api.<домен платформы>/api/notifications/summary (daenerysApiUrl,
 * как у остальных вызовов профиля) с cookie `.holycode.org` (`credentials: "include"`).
 */

import { buildServiceHref, ServiceEntry } from "./services";

export const NOTIFICATIONS_PATH = "/api/notifications/summary";
export const NOTIFICATIONS_POLL_MS = 60 * 1000;
export const NOTIFICATIONS_MIN_GAP_MS = 30 * 1000;
export const NOTIFICATION_SEVERITIES = ["bad", "warn", "info", "muted"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export type NotificationItem = {
  key: string;
  count: number;
  title_ru: string;
  title_en: string;
  service: string;
  section: string;
  href: string;
  severity: NotificationSeverity;
};

export type NotificationsSummary = { items: NotificationItem[]; total: number; generatedAt: string };
export type NotificationsState = { summary: NotificationsSummary; error: string; loaded: boolean; updatedAt: number };

export const EMPTY_SUMMARY: NotificationsSummary = Object.freeze({
  items: [],
  total: 0,
  generatedAt: "",
}) as NotificationsSummary;
export const IDLE_STATE: NotificationsState = Object.freeze({
  summary: EMPTY_SUMMARY,
  error: "",
  loaded: false,
  updatedAt: 0,
}) as NotificationsState;

function cleanText(value: unknown, max = 160): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/** Один пункт ответа или null: без ключа или с нулём — не пункт. */
export function normalizeNotificationItem(raw: unknown): NotificationItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const key = cleanText(item.key, 64);
  const count = Math.max(0, Math.floor(Number(item.count) || 0));
  if (!key || !count) return null;
  const severity = (NOTIFICATION_SEVERITIES as readonly unknown[]).includes(item.severity)
    ? (item.severity as NotificationSeverity)
    : "warn";
  const href = /^https?:\/\//i.test(String(item.href ?? "")) ? String(item.href) : "";
  return {
    key,
    count,
    title_ru: cleanText(item.title_ru) || cleanText(item.title) || key,
    title_en: cleanText(item.title_en) || cleanText(item.title) || key,
    service: cleanText(item.service, 32),
    section: cleanText(item.section, 64),
    href,
    severity,
  };
}

/** Ответ ручки → { items, total, generatedAt }. total — из ответа, без него — сумма пунктов кроме muted. */
export function normalizeSummary(data: unknown): NotificationsSummary {
  if (!data || typeof data !== "object") return EMPTY_SUMMARY;
  const payload = data as Record<string, unknown>;
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map(normalizeNotificationItem)
    .filter((item): item is NotificationItem => item !== null);
  const counted = items.filter((item) => item.severity !== "muted").reduce((sum, item) => sum + item.count, 0);
  const rawTotal = payload.total;
  const total =
    rawTotal !== null && rawTotal !== undefined && rawTotal !== "" && Number.isFinite(Number(rawTotal))
      ? Math.max(0, Math.floor(Number(rawTotal)))
      : counted;
  return { items, total, generatedAt: cleanText(payload.generated_at, 40) };
}

/** Подпись пункта на языке страницы. */
export function notificationTitle(item: NotificationItem | null | undefined, lang = "en"): string {
  if (!item) return "";
  return lang === "ru" ? item.title_ru || item.title_en || item.key : item.title_en || item.title_ru || item.key;
}

/** Число на бейдже: 0 — бейджа нет, больше 99 — «99+». */
export function badgeText(total: number): string {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (!n) return "";
  return n > 99 ? "99+" : String(n);
}

/**
 * Адрес раздела чужого сервиса: href пункта или адрес сервиса из справочника +
 * `?section=`; дальше — `org` и `return_to`, как у ссылок плиток (buildServiceHref).
 */
export function notificationHref(
  item: Pick<NotificationItem, "href" | "service" | "section"> | null | undefined,
  { services = [], org = "", returnTo = "" }: { services?: ServiceEntry[]; org?: string; returnTo?: string } = {},
): string {
  if (!item) return "";
  let base = String(item.href || "");
  if (!base) {
    const service = (Array.isArray(services) ? services : []).find((entry) => entry?.key === item.service);
    if (!service?.url) return "";
    try {
      const url = new URL(service.url);
      if (item.section) url.searchParams.set("section", item.section);
      base = url.toString();
    } catch {
      return "";
    }
  }
  return buildServiceHref(base, { org, returnTo });
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type DocLike = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

export type NotificationsFeed = {
  configure(options: { endpoint?: string; fetcher?: FetchLike | null }): void;
  snapshot(): NotificationsState;
  subscribe(listener: (state: NotificationsState) => void): () => void;
  refresh(options?: { force?: boolean }): Promise<NotificationsState>;
  reset(): void;
  listenerCount(): number;
};

/** Опрос сводки. Фабрика — для тестов (свои часы, таймеры, document, fetch); страница — общий экземпляр ниже. */
export function createNotificationsFeed({
  clock = () => Date.now(),
  setTimer = (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown,
  clearTimer = (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
  doc = (typeof document !== "undefined" ? document : null) as DocLike | null,
  pollMs = NOTIFICATIONS_POLL_MS,
  minGapMs = NOTIFICATIONS_MIN_GAP_MS,
}: {
  clock?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  doc?: DocLike | null;
  pollMs?: number;
  minGapMs?: number;
} = {}): NotificationsFeed {
  let endpoint = "";
  let fetcher: FetchLike | null = null;
  let state: NotificationsState = IDLE_STATE;
  let lastAttemptAt = 0;
  let inFlight: Promise<NotificationsState> | null = null;
  let timer: unknown = null;
  let visibilityHooked = false;
  const listeners = new Set<(state: NotificationsState) => void>();

  const visible = () => !doc || doc.visibilityState !== "hidden";

  function emit() {
    for (const listener of Array.from(listeners)) {
      try {
        listener(state);
      } catch {
        // слушатель упал — остальным не мешает
      }
    }
  }

  async function request(): Promise<NotificationsSummary> {
    const doFetch = fetcher ?? (typeof fetch === "function" ? fetch : null);
    if (!doFetch || !endpoint) throw new Error("no_fetch");
    const response = await doFetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return normalizeSummary(await response.json());
  }

  // Запрос сейчас (если не идёт уже). force — мимо паузы minGapMs.
  function refresh({ force = false }: { force?: boolean } = {}): Promise<NotificationsState> {
    if (inFlight) return inFlight;
    const now = clock();
    if (!force && lastAttemptAt && now - lastAttemptAt < minGapMs) return Promise.resolve(state);
    lastAttemptAt = now;
    inFlight = request()
      .then(
        (summary) => {
          state = { summary, error: "", loaded: true, updatedAt: clock() };
        },
        (error: unknown) => {
          // Последнее удачное остаётся — меняется только ошибка.
          state = { ...state, error: String((error as Error)?.message || error || "error") };
        },
      )
      .then(() => {
        inFlight = null;
        emit();
        return state;
      });
    return inFlight;
  }

  function stopTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule() {
    stopTimer();
    if (!listeners.size) return;
    timer = setTimer(() => {
      timer = null;
      if (visible()) void refresh({ force: true }).then(schedule);
      else schedule();
    }, pollMs);
  }

  function onVisibility() {
    if (!listeners.size || !visible()) return;
    void refresh().then(schedule);
  }

  function hookVisibility() {
    if (visibilityHooked || !doc) return;
    visibilityHooked = true;
    doc.addEventListener("visibilitychange", onVisibility);
  }

  function unhookVisibility() {
    if (!visibilityHooked || !doc) return;
    visibilityHooked = false;
    doc.removeEventListener("visibilitychange", onVisibility);
  }

  return {
    configure(options) {
      if (options.endpoint !== undefined) endpoint = String(options.endpoint || "");
      if (options.fetcher !== undefined) fetcher = options.fetcher;
    },
    snapshot: () => state,
    // Первый подписчик запускает опрос, последний отписавшийся — останавливает.
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        hookVisibility();
        if (visible()) void refresh().then(schedule);
        else schedule();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopTimer();
          unhookVisibility();
        }
      };
    },
    refresh,
    reset() {
      stopTimer();
      unhookVisibility();
      listeners.clear();
      endpoint = "";
      fetcher = null;
      state = IDLE_STATE;
      lastAttemptAt = 0;
      inFlight = null;
    },
    listenerCount: () => listeners.size,
  };
}

/** Общий экземпляр страницы: один опрос на вкладку. */
export const notificationsFeed: NotificationsFeed = createNotificationsFeed();
