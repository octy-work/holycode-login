"use client";

import { Translated } from "@/components/translated";
import { PROFILE_SECTIONS, profilePath, ProfileSection } from "@/lib/profile";
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { SECTION_ICONS } from "./section-icons";

/** Where the collapsed state lives: per browser, like `holybuild-nav-collapsed` in HolyBuild. */
export const PROFILE_NAV_COLLAPSED_KEY = "holycode-profile-nav-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(PROFILE_NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The collapsed state of the profile's sidebar. The server renders it expanded
 * (it cannot see localStorage); the browser applies the saved choice right after
 * mount, before the width transition is switched on, so there is no slide.
 */
export function useProfileNavCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PROFILE_NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // private mode: the choice lives until the page is left
      }
      return next;
    });
  }, []);

  return { collapsed, ready, toggle };
}

/**
 * The profile's sidebar (owner's decision of 02.10.2026): at the left edge, the
 * whole height under the 52 px top bar, as in HolyAgent and Daenerys — not a card
 * next to the content. 240 px, or 64 px of icons when collapsed ("‹‹" at the
 * bottom, the choice in localStorage as in HolyBuild). The active item is the
 * common one of every HolyCode service — a filled frame, no side stripe
 * (`.hc-sidenav-item` in globals.scss). Phones (< 768 px) have no sidebar: the
 * bottom bar (`mobile-nav.tsx`) takes its place.
 */
export function ProfileSidebar({
  section,
  prefix,
  counters,
  collapsed,
  animate,
  onToggle,
}: {
  section: ProfileSection;
  prefix: string;
  counters: Partial<Record<ProfileSection, number>>;
  collapsed: boolean;
  animate: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("profile");
  const toggleLabel = t(collapsed ? "nav.expand" : "nav.collapse");

  return (
    <aside
      className={clsx(
        "hc-sidenav hidden h-full shrink-0 flex-col gap-3 pt-3 pb-3 md:flex",
        collapsed ? "w-16 px-2" : "w-60 px-3",
        animate && "transition-[width,padding] duration-200 ease-out motion-reduce:transition-none",
      )}
      data-testid="profile-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="HolyCode ID" data-testid="profile-nav">
        {!collapsed && (
          <div className="text-hc-muted px-2 pt-1 pb-2 text-[11px] font-bold tracking-[0.16em] uppercase">
            <Translated i18nKey="title" namespace="profile" />
          </div>
        )}
        {PROFILE_SECTIONS.map((s) => {
          const Icon = SECTION_ICONS[s];
          const active = s === section;
          const count = counters[s];
          return (
            <a
              key={s}
              href={profilePath(prefix, s)}
              aria-current={active ? "page" : undefined}
              title={collapsed ? (count ? `${t(`nav.${s}`)} (${count})` : t(`nav.${s}`)) : undefined}
              data-testid={`profile-nav-${s}`}
              className={clsx("hc-sidenav-item", collapsed && "justify-center !px-0")}
            >
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <Icon className="h-[18px] w-[18px]" />
                {collapsed && count ? (
                  <span aria-hidden="true" className="bg-hc-warn absolute -top-1 -right-1.5 h-2 w-2 rounded-full" />
                ) : null}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    <Translated i18nKey={`nav.${s}`} namespace="profile" />
                  </span>
                  {count ? (
                    <span className="border-hc-warn/35 text-hc-warn rounded-full border px-1.5 text-[10.5px] leading-4">
                      {count}
                    </span>
                  ) : null}
                </>
              )}
            </a>
          );
        })}
      </nav>

      <div className={clsx("flex", collapsed ? "justify-center" : "justify-end")}>
        <button
          type="button"
          onClick={onToggle}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          data-testid="profile-sidebar-toggle"
          className="hc-sidenav-toggle"
        >
          {collapsed ? <ChevronDoubleRightIcon className="h-4 w-4" /> : <ChevronDoubleLeftIcon className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
