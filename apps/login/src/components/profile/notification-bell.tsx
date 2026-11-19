"use client";

import { daenerysApiUrl } from "@/lib/daenerys";
import {
  badgeText,
  IDLE_STATE,
  notificationHref,
  NotificationItem,
  NOTIFICATIONS_PATH,
  NotificationsFeed,
  notificationsFeed,
  NotificationsState,
  notificationTitle,
} from "@/lib/notifications";
import { ServiceEntry, ServiceOrg } from "@/lib/services";
import { openServiceInDesktop } from "@/lib/topbar";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { defaultReturnTo, orgIdOf, serviceName, SwitcherIcon, useSwitcherDismiss } from "./service-switcher";

/**
 * Колокольчик HolyCode в общей полосе (решение владельца 19.11.2026) — один
 * компонент, слева от аватара и на телефоне тоже. Сводка — GET
 * daenerys-api.<домен>/api/notifications/summary с cookie, опрос — общий на
 * страницу (lib/notifications.ts). Выпадашка вниз к правому краю; пункт ведёт в
 * чужой сервис (href пункта или адрес сервиса + `?section=`, с `org` и
 * `return_to`, как плитки) — в десктопе HolyAgent через openServiceInDesktop.
 * Без сессии Daenerys (`enabled: false`) и при 401 — колокольчик без числа.
 */

/** Общая сводка как состояние React. enabled: false — без опроса. */
export function useNotifications(
  endpoint: string,
  enabled = true,
  feed: NotificationsFeed = notificationsFeed,
): NotificationsState {
  const [state, setState] = useState<NotificationsState>(() => (enabled ? feed.snapshot() : IDLE_STATE));
  useEffect(() => {
    if (!enabled) {
      setState(IDLE_STATE);
      return undefined;
    }
    feed.configure({ endpoint });
    setState(feed.snapshot());
    return feed.subscribe(setState);
  }, [enabled, endpoint, feed]);
  return enabled ? state : IDLE_STATE;
}

const SEVERITY_TEXT: Record<NotificationItem["severity"], string> = {
  bad: "text-hc-err",
  warn: "text-hc-warn",
  info: "text-[#2563eb] dark:text-[#60a5fa]",
  muted: "text-hc-muted",
};

export function NotificationBell({
  daenerysUrl,
  enabled = true,
  services,
  org,
  current = "profile",
  getReturnTo = defaultReturnTo,
  feed = notificationsFeed,
  defaultOpen = false,
  className,
}: {
  daenerysUrl: string;
  enabled?: boolean;
  services: ServiceEntry[];
  org: ServiceOrg | null;
  current?: string;
  getReturnTo?: () => string;
  feed?: NotificationsFeed;
  defaultOpen?: boolean;
  className?: string;
}) {
  const t = useTranslations("profile.topbar.bell");
  const ts = useTranslations("profile.switcher");
  const locale = useLocale();
  const state = useNotifications(`${daenerysApiUrl(daenerysUrl)}${NOTIFICATIONS_PATH}`, enabled, feed);
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useSwitcherDismiss(open, rootRef, close, triggerRef);

  const { items, total } = state.summary;
  const badge = badgeText(total);
  const label = total ? t("title", { n: total }) : t("label");
  const nameOf = (key: string) => {
    const entry = services.find((service) => service.key === key);
    return entry ? serviceName(entry, ts) : key;
  };
  const returnTo = open ? String(getReturnTo?.() ?? "") : "";
  const orgId = orgIdOf(org);

  return (
    <div ref={rootRef} className={clsx("relative shrink-0", className)} data-testid="notification-bell">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        className={clsx(
          "text-hc-text-2 hover:bg-hc-card-2 hover:text-hc-text relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-full transition-colors",
          "focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none",
          open && "bg-hc-card-2 text-hc-text",
        )}
        data-testid="notification-bell-button"
      >
        <SwitcherIcon name="bell" size={18} />
        {badge ? (
          <span
            className="bg-hc-err border-hc-card absolute -top-0.5 -right-1 box-content min-w-[16px] rounded-full border-2 px-1 text-center text-[10px] leading-[16px] font-semibold text-white tabular-nums"
            data-testid="notification-bell-badge"
          >
            {badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("label")}
          className={clsx(
            "border-hc-border bg-hc-card text-hc-text shadow-hc-card z-50 overflow-y-auto overscroll-contain rounded-[14px] border p-1.5 text-left",
            // Телефон: на всю ширину под полосой; шире — вниз к правому краю колокольчика.
            "fixed inset-x-3 top-[calc(56px+env(safe-area-inset-top))] max-h-[calc(100dvh-96px)]",
            "md:absolute md:inset-x-auto md:top-[calc(100%+8px)] md:right-0 md:max-h-[420px] md:w-[300px]",
          )}
          data-testid="notification-bell-pop"
        >
          <div className="text-hc-muted px-2.5 pt-1.5 pb-2 text-[12px] font-semibold">{t("label")}</div>
          {items.length ? (
            <div className="flex flex-col gap-0.5">
              {items.map((item) => {
                const href = notificationHref(item, { services, org: orgId, returnTo });
                const other = item.service && item.service !== current;
                const body = (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] leading-[1.35]">{notificationTitle(item, locale)}</span>
                      <span className="text-hc-muted text-[11.5px] leading-[1.35]">
                        <span className={SEVERITY_TEXT[item.severity]} data-testid="notification-bell-state">
                          {t(`severity.${item.severity}`)}
                        </span>
                        {other ? ` · ${nameOf(item.service)}` : null}
                      </span>
                    </span>
                    <span
                      className={clsx(
                        "shrink-0 text-[13px] tabular-nums",
                        item.severity === "muted" ? "text-hc-muted font-medium" : "font-semibold",
                      )}
                    >
                      {item.count}
                    </span>
                  </>
                );
                const classes =
                  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-inherit no-underline transition-colors";
                if (!href) {
                  return (
                    <div key={item.key} role="menuitem" aria-disabled="true" className={clsx(classes, "opacity-70")}>
                      {body}
                    </div>
                  );
                }
                return (
                  <a
                    key={item.key}
                    role="menuitem"
                    href={href}
                    className={clsx(classes, "hover:bg-hc-card-2 focus-visible:bg-hc-card-2 focus-visible:outline-none")}
                    onClick={(event) => {
                      setOpen(false);
                      openServiceInDesktop({ key: item.service, name: nameOf(item.service) }, href, event);
                    }}
                    data-testid={`notification-bell-item-${item.key}`}
                  >
                    {body}
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="text-hc-muted px-2.5 pt-3.5 pb-4 text-center text-[13px]" data-testid="notification-bell-empty">
              {t("empty")}
            </div>
          )}
          {state.error && state.loaded ? (
            <div
              className="border-hc-border-subtle text-hc-muted mt-1 border-t px-2.5 pt-2 pb-1 text-[11.5px]"
              data-testid="notification-bell-stale"
            >
              {t("stale")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
