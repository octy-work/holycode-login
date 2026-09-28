"use client";

import { Avatar } from "@/components/avatar";
import { MOBILE_MORE_SECTIONS, MOBILE_NAV_SECTIONS, profilePath, ProfileSection } from "@/lib/profile";
import { buildServiceHref, ServiceEntry, ServiceOrg } from "@/lib/services";
import { ArrowsRightLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { MouseEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { SECTION_ICONS } from "./section-icons";
import {
  defaultReturnTo,
  GridIcon,
  listOf,
  orgIdOf,
  orgNameOf,
  serviceHint,
  serviceName,
  ServiceTile,
} from "./service-switcher";
import { useKeyboardOpen } from "./use-keyboard-open";

/**
 * The phone's bottom bar of the profile (< 768 px) and its services sheet —
 * one bar in every HolyCode service (owner's decisions of 28.09.2026), the
 * same markup as the chat's `switcher/` on the fork's `hc-*` tokens:
 *
 *  - 56 px + the safe area, five places: Home · Data · Security · Teams and
 *    "Services" (the nine-dot grid, like the button next to the logo on wide
 *    screens) on the right;
 *  - it hides only while the on-screen keyboard is open, never on scroll;
 *  - "Services" opens a sheet from the bottom: the tiles of the directory (the
 *    profile says "you are here", `status.text` under the others), "Admin" for
 *    owners and admins, "More in Profile" (Settings — theme, language), the
 *    account and the organization; "Switch user" last;
 *  - the sheet closes on a swipe down, a tap outside, Esc and "back" (it stands
 *    on its own history entry; leaving through a link replaces that entry, so
 *    "back" from the next page lands on the profile, not on the sheet).
 *
 * Section links are plain anchors with the short public path, like the sidebar.
 */

/** Marks the history entry of the open sheet. */
export const SHEET_HISTORY_KEY = "hcServicesSheet";
/**
 * The swipe (the same numbers as the chat's switcher/mobile-nav.js): the sheet
 * follows the finger after SWIPE_START_SLOP px and closes when pulled down
 * SWIPE_CLOSE_PX, or flicked (from SWIPE_FLICK_PX at SWIPE_CLOSE_SPEED px/ms).
 */
export const SWIPE_CLOSE_PX = 72;
const SWIPE_CLOSE_SPEED = 0.45;
const SWIPE_FLICK_PX = 24;
const SWIPE_START_SLOP = 6;

export type Navigate = (href: string, how: "replace" | "assign") => void;

const browserNavigate: Navigate = (href, how) => {
  if (how === "replace") window.location.replace(href);
  else window.location.assign(href);
};

function sheetEntryOnTop(): boolean {
  try {
    const state = window.history.state as Record<string, unknown> | null;
    return !!state && state[SHEET_HISTORY_KEY] === true;
  } catch {
    return false;
  }
}

/** A plain left click that the browser would follow in this tab. */
function plainClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented &&
    !event.currentTarget.getAttribute("target")
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type MobileNavProps = {
  section: ProfileSection;
  /** `/me` or `<basePath>/me` — where the section links point. */
  prefix: string;
  basePath: string;
  counters: Partial<Record<ProfileSection, number>>;
  services: ServiceEntry[];
  org: ServiceOrg | null;
  /** The key of the service we are in: its tile says "you are here". */
  current?: string;
  adminUrl?: string;
  canOpenAdmin?: boolean;
  user: { fullName: string; loginName: string; email: string; avatarUrl: string };
  /** Where a service should bring the person back to; read when the sheet opens. */
  getReturnTo?: () => string;
  /** How a link in the sheet is followed (tests pass a spy). */
  navigate?: Navigate;
};

export function MobileNav({
  section,
  prefix,
  basePath,
  counters,
  services,
  org,
  current = "profile",
  adminUrl = "",
  canOpenAdmin = false,
  user,
  getReturnTo = defaultReturnTo,
  navigate = browserNavigate,
}: MobileNavProps) {
  const t = useTranslations("profile");
  const ts = useTranslations("profile.switcher");
  const keyboardOpen = useKeyboardOpen();
  const [open, setOpen] = useState(false);
  /** We pushed the sheet's history entry and it has not been popped yet. */
  const pushedRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  const titleId = useId();

  const openSheet = () => {
    setOpen(true);
    try {
      window.history.pushState({ [SHEET_HISTORY_KEY]: true }, "");
      pushedRef.current = true;
    } catch {
      pushedRef.current = false;
    }
  };

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (pushedRef.current) {
      pushedRef.current = false;
      if (sheetEntryOnTop()) window.history.back();
    }
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  /** A link in the sheet: in this tab it takes the sheet's history entry over. */
  const follow = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const href = event.currentTarget.getAttribute("href");
      if (!href || !plainClick(event)) return;
      event.preventDefault();
      const replace = pushedRef.current && sheetEntryOnTop();
      pushedRef.current = false;
      setOpen(false);
      navigate(href, replace ? "replace" : "assign");
    },
    [navigate],
  );

  // Esc closes; Tab stays inside the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        close();
        return;
      }
      const sheet = sheetRef.current;
      if (event.key !== "Tab" || !sheet) return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!sheet.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === sheet)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, close]);

  // "Back" (the button, the edge swipe) pops the sheet's entry: close without leaving.
  useEffect(() => {
    if (!open) return undefined;
    const onPopState = () => {
      if (sheetEntryOnTop()) return;
      pushedRef.current = false;
      setOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);

  // Back from another service restores this page from the bfcache as it was left: closed.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      pushedRef.current = false;
      setOpen(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // The page under the sheet does not scroll.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open]);

  // Slide in from the bottom, then take the focus (the dialog's title is read out).
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!open || !sheet) return;
    sheet.style.transition = "none";
    sheet.style.transform = "translateY(100%)";
    void sheet.offsetHeight;
    sheet.style.transition = "";
    sheet.style.transform = "";
    sheet.focus({ preventScroll: true });
  }, [open]);

  // Swipe down closes: from the handle, or anywhere while the sheet is scrolled to the top.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!open || !sheet) return undefined;
    let startY = 0;
    let startAt = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;
    const settle = () => {
      sheet.style.transition = "";
      sheet.style.transform = "";
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const target = event.target;
      const fromHandle = !!handleRef.current && target instanceof Node && handleRef.current.contains(target);
      tracking = fromHandle || sheet.scrollTop <= 0;
      dragging = false;
      startY = event.touches[0].clientY;
      startAt = Date.now();
      dy = 0;
    };
    const onMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      dy = event.touches[0].clientY - startY;
      if (!dragging) {
        if (dy < -SWIPE_START_SLOP) {
          tracking = false; // scrolling the sheet's content up
          return;
        }
        if (dy <= SWIPE_START_SLOP) return;
        dragging = true;
      }
      if (event.cancelable) event.preventDefault();
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${Math.max(0, Math.round(dy))}px)`;
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const elapsed = Date.now() - startAt;
      const flick = elapsed > 0 && dy >= SWIPE_FLICK_PX && dy / elapsed >= SWIPE_CLOSE_SPEED;
      if (dy >= SWIPE_CLOSE_PX || flick) {
        close(false);
      } else {
        settle();
      }
    };
    const onCancel = () => {
      tracking = false;
      dragging = false;
      settle();
    };
    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onCancel);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onCancel);
    };
  }, [open, close]);

  const moreActive = (MOBILE_MORE_SECTIONS as readonly ProfileSection[]).includes(section);
  const orgId = orgIdOf(org);
  const orgName = orgNameOf(org);
  const list = listOf(services);
  const returnTo = open ? String(getReturnTo?.() ?? "") : "";
  const adminHref = open && canOpenAdmin && adminUrl ? buildServiceHref(adminUrl, { org: orgId, returnTo }) : "";
  const admin: ServiceEntry = { key: "admin", name: t("mobileNav.admin"), url: adminHref, icon: "admin", kind: "admin" };

  return (
    <>
      <nav
        className={clsx(
          "border-hc-border bg-hc-card/95 fixed inset-x-0 bottom-0 z-30 h-[calc(56px+env(safe-area-inset-bottom))] border-t pr-[max(4px,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(4px,env(safe-area-inset-left))] shadow-[0_-10px_30px_rgba(3,3,12,0.25)] backdrop-blur md:hidden",
          keyboardOpen && "hidden",
        )}
        aria-label={t("mobileNav.label")}
        data-testid="mobile-nav"
        data-keyboard={keyboardOpen ? "open" : undefined}
      >
        <ul className="grid h-full grid-cols-5">
          {MOBILE_NAV_SECTIONS.map((item) => {
            const Icon = SECTION_ICONS[item];
            const active = item === section;
            const count = counters[item] ?? 0;
            return (
              <li key={item} className="min-w-0">
                <a
                  href={profilePath(prefix, item)}
                  aria-current={active ? "page" : undefined}
                  className={tabClasses(active)}
                  data-testid={`mobile-nav-${item}`}
                >
                  <span className={pillClasses(active)}>
                    <Icon className="h-[22px] w-[22px]" />
                    {count > 0 ? (
                      <span
                        className="bg-hc-warn absolute -top-1 left-[calc(50%+5px)] h-[17px] min-w-[17px] rounded-full px-1 text-center text-[10px] leading-[17px] font-bold text-white shadow-[0_0_0_2px_var(--hc-card)]"
                        aria-hidden="true"
                        data-testid={`mobile-nav-badge-${item}`}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </span>
                  <span className="block max-w-full truncate">{t(`nav.short.${item}`)}</span>
                </a>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              ref={triggerRef}
              type="button"
              className={clsx(tabClasses(open || moreActive), "w-full")}
              onClick={() => (open ? close() : openSheet())}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? sheetId : undefined}
              data-testid="mobile-nav-services"
              data-more-active={moreActive || undefined}
            >
              <span className={pillClasses(open)}>
                <GridIcon size={22} />
                {moreActive ? (
                  // a section from "More" is open: a dot on "Services"
                  <span
                    className="bg-hc-p500 absolute top-px right-[9px] h-[7px] w-[7px] rounded-full shadow-[0_0_0_2px_var(--hc-card)]"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span className="block max-w-full truncate">{t("mobileNav.services")}</span>
            </button>
          </li>
        </ul>
      </nav>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-[rgba(5,5,15,0.58)] md:hidden"
            onClick={() => close()}
            aria-hidden="true"
            data-testid="services-sheet-backdrop"
          />
          <div
            ref={sheetRef}
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="border-hc-border bg-hc-card text-hc-text fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-40px-env(safe-area-inset-top))] overflow-y-auto overscroll-contain rounded-t-[20px] border border-b-0 pt-1.5 pr-[max(14px,env(safe-area-inset-right))] pb-[calc(16px+env(safe-area-inset-bottom))] pl-[max(14px,env(safe-area-inset-left))] text-[13px] leading-[1.35] shadow-[0_-18px_50px_rgba(0,0,0,0.5)] transition-transform duration-200 ease-out focus:outline-none motion-reduce:transition-none md:hidden"
            data-testid="services-sheet"
          >
            <button
              ref={handleRef}
              type="button"
              className="mb-0.5 flex h-[22px] w-full cursor-grab touch-none items-center justify-center focus-visible:outline-none"
              onClick={() => close()}
              aria-label={t("mobileNav.close")}
              data-testid="services-sheet-handle"
            >
              <span className="bg-hc-input-border h-[5px] w-10 rounded-full" aria-hidden="true" />
            </button>

            <h2 id={titleId} className={clsx(headingClasses, "mt-0.5")}>
              {orgName ? `${ts("title")} · ${orgName}` : ts("title")}
            </h2>
            <div className="grid grid-cols-3 gap-2" data-testid="services-sheet-tiles">
              {list.map((service) => {
                const isCurrent = service.key === current;
                const href = isCurrent ? "" : buildServiceHref(service.url, { org: orgId, returnTo });
                return (
                  <ServiceTile
                    key={service.key}
                    service={service}
                    current={isCurrent}
                    href={href}
                    name={serviceName(service, ts)}
                    hint={serviceHint(service, ts, isCurrent)}
                    variant="sheet"
                    onSelect={isCurrent ? () => close() : follow}
                    testId={`sheet-tile-${service.key}`}
                  />
                );
              })}
              {adminHref ? (
                <ServiceTile
                  service={admin}
                  href={adminHref}
                  name={t("mobileNav.admin")}
                  hint={ts("orgAdminHint")}
                  variant="sheet"
                  onSelect={follow}
                  testId="sheet-tile-admin"
                />
              ) : null}
            </div>

            <h3 className={clsx(headingClasses, "mt-3")}>{t("mobileNav.more")}</h3>
            <div className="grid grid-cols-3 gap-1.5" data-testid="services-sheet-more">
              {MOBILE_MORE_SECTIONS.map((item) => {
                const Icon = SECTION_ICONS[item];
                const active = item === section;
                return (
                  <a
                    key={item}
                    href={profilePath(prefix, item)}
                    aria-current={active ? "page" : undefined}
                    onClick={follow}
                    className={clsx(
                      "bg-hc-card-2 focus-visible:ring-hc-ring text-hc-text flex min-h-[66px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[12px] border px-[5px] pt-[9px] pb-2 text-center text-[11.5px] leading-[1.2] transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      active ? "border-hc-p500 bg-hc-soft font-semibold" : "hover:bg-hc-soft border-transparent",
                    )}
                    data-testid={`sheet-more-${item}`}
                  >
                    <span className="text-hc-link flex h-6 w-6 items-center justify-center">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="line-clamp-2 max-w-full [overflow-wrap:anywhere]">{t(`nav.${item}`)}</span>
                  </a>
                );
              })}
            </div>

            <div
              role="group"
              aria-label={t("mobileNav.account")}
              className="border-hc-border bg-hc-card-2 mt-3.5 grid gap-3 rounded-[16px] border p-3"
              data-testid="services-sheet-account"
            >
              <a
                href={profilePath(prefix, "data")}
                onClick={follow}
                className="focus-visible:ring-hc-ring flex min-w-0 items-center gap-2.5 rounded-[10px] focus-visible:ring-2 focus-visible:outline-none"
                data-testid="sheet-account-data"
              >
                <Avatar name={user.fullName} loginName={user.loginName} imageUrl={user.avatarUrl || undefined} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-bold">{user.fullName}</span>
                  <span className="text-hc-muted truncate text-[12px]">{user.email || user.loginName}</span>
                </span>
              </a>
              {orgName ? (
                <a
                  href={profilePath(prefix, "orgs")}
                  onClick={follow}
                  className="focus-visible:ring-hc-ring flex min-w-0 items-center gap-2.5 rounded-[8px] focus-visible:ring-2 focus-visible:outline-none"
                  data-testid="sheet-account-org"
                >
                  <span className="text-hc-muted shrink-0 text-[12px] font-semibold">{t("mobileNav.org")}</span>
                  <span className="ml-auto min-w-0 truncate text-[13px] font-semibold">{orgName}</span>
                  <ChevronRightIcon className="text-hc-muted h-4 w-4 shrink-0" aria-hidden="true" />
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <a
                  href={`${basePath.replace(/\/+$/, "")}/accounts`}
                  onClick={follow}
                  className="border-hc-border text-hc-text hover:bg-hc-soft focus-visible:ring-hc-ring inline-flex min-h-10 min-w-0 flex-auto items-center justify-center gap-[7px] rounded-[11px] border px-3 text-[13px] font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none"
                  data-testid="sheet-switch-user"
                >
                  <ArrowsRightLeftIcon className="text-hc-link h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t("mobileNav.switchUser")}</span>
                </a>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

const headingClasses = "text-hc-muted mx-0.5 mb-2 truncate text-[11px] font-bold tracking-[0.08em] uppercase";

/** A place in the bar: icon in a pill over the label; the current one is highlighted. */
function tabClasses(active: boolean): string {
  return clsx(
    "group flex h-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-[12px] px-px pt-[5px] pb-1 text-center text-[10.5px] leading-[1.15] tracking-[-0.005em] transition-colors focus-visible:outline-none",
    active ? "text-hc-text font-semibold" : "text-hc-muted font-medium",
  );
}

function pillClasses(active: boolean): string {
  return clsx(
    "group-focus-visible:ring-hc-ring relative flex h-7 w-12 items-center justify-center rounded-[14px] transition-colors group-focus-visible:ring-2",
    active && "bg-hc-p500/20 text-hc-link",
  );
}
